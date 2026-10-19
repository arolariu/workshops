// 🗣️ The study board: what students post about each course, served by the university portal's board API.
// Every word of a post was typed by another student, and some of those students are not friendly.
//
// Two parts:
//   - boardTool: the MCP tool. This first version works, and it is unsafe in five ways: that's your job (TODO).
//   - portalBoardApi(): a stand-in for the portal's board API (https://portal.example.invalid/api/board). In real life
//     it runs on someone else's server. Treat it as a remote service: call it, don't change it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const boardTool = {
  name: 'get_board_posts',
  description: 'Recent posts from the study board of one course. Needs the board token: ask the student for it.',
  inputSchema: {
    type: 'object',
    properties: {
      course: { type: 'string', description: 'Course code, e.g. DB220' },
      token: { type: 'string', description: 'The board API token' },
    },
    required: ['course', 'token'],
  },
  annotations: { readOnlyHint: true },
  // TODO(M1): the model must never see the token. Remove the `token` input and read process.env.STUDYBUDDY_BOARD_TOKEN
  // here, on the server (not set → an isError result that names the variable). Add an optional `limit` input. Then
  // register boardTool in studybuddy-server.mjs (look for 👉), and hand the variable over in .mcp.json ("env").
  handler: async ({ course, token }) => {
    const res = await portalBoardApi({ path: `/board/${encodeURIComponent(course)}/posts`, headers: { authorization: `Bearer ${token}` } });
    // TODO(M5): never pass the API's error body on: it can contain what you sent it. Say what went wrong in your own words.
    if (res.status !== 200) throw new Error(`Board API error ${res.status}: ${JSON.stringify(res.body)}`);
    // TODO(M2): say where this comes from: return { source, trust: 'untrusted', notice, course, posts }.
    // TODO(M3): cap sizes: at most `limit` posts (newest first), title ≤ 100 and text ≤ 500 characters (with
    //           truncated: true), and the whole result ≤ 10,000 characters (omitted: how many posts didn't fit).
    // TODO(M4): strip what the eye can't see: ANSI escapes, control characters, zero-width, bidi and tag characters.
    // TODO(M5): return only id, author (the handle), postedAt, title, text and truncated; redact pasted secrets.
    return res.body.posts;
  },
};

// ---------- the portal's board API: a stand-in for a remote service (don't change it) ----------
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The portal keeps a hash of the one token it accepts, never the token itself.
const ACCEPTED_TOKEN_SHA256 = '9f43ea81b6573e187197d66d4b4152fc6bf834c6574570fa9670b789b10fe0e9';
const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

/**
 * GET /board/<course>/posts, with an Authorization header. Resolves to { status, body }, like fetch() and res.json():
 *   200 { course, posts: [{ id, course, postedAt, author: { handle, email, studentId }, title, body, votes,
 *         editToken, _moderation }] }   (in the order the portal stores them: not sorted)
 *   401 { error, detail }   no token, or a wrong one
 *   404 { error, detail }   no board for that course
 *   503 { error, detail }   the board's data is not available
 * The data comes from the file in STUDYBUDDY_BOARD_DATA (the checks use that), or mcp/board-data.json.
 */
export async function portalBoardApi({ path: route = '', headers = {} } = {}) {
  await new Promise((resolve) => setTimeout(resolve, 5)); // the network
  const token = String(headers.authorization ?? headers.Authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { status: 401, body: { error: 'missing_token', detail: 'Send Authorization: Bearer <token>.' } };
  if (sha256(token) !== ACCEPTED_TOKEN_SHA256) return { status: 401, body: { error: 'invalid_token', detail: `The token "${token}" is not valid for this board.` } };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(process.env.STUDYBUDDY_BOARD_DATA || path.join(HERE, 'board-data.json'), 'utf8'));
  } catch {
    return { status: 503, body: { error: 'unavailable', detail: 'The board is not available right now.' } };
  }
  const asked = /^\/board\/([^/]+)\/posts$/.exec(route)?.[1];
  const course = asked ? decodeURIComponent(asked).trim().toUpperCase() : '';
  if (!data.courses?.includes(course)) return { status: 404, body: { error: 'not_found', detail: `No board "${course}". Boards: ${(data.courses ?? []).join(', ')}.` } };
  return { status: 200, body: { course, posts: (data.posts ?? []).filter((p) => p.course === course) } };
}
