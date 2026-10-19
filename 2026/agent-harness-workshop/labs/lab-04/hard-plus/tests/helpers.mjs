// Shared helpers for the Lab 04 hard+ checks: the board's token, fixture data, and a server session.
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './common.mjs';

/** The demo token the (pretend) portal accepts: the server gets it from its environment, like in real life. */
export const TOKEN = 'sb_demo_7f3a9c51e2d84b06';
/** A token the portal rejects (its error body echoes it back: never pass that on). */
export const WRONG = `sb_live_${'0badc0de'.repeat(2)}`;
export const TOKEN_VAR = 'STUDYBUDDY_BOARD_TOKEN';

// Secrets are built at check time, so this repository never holds a real-looking one.
export const SECRETS = {
  GHP: `ghp_${'A1b2C3d4'.repeat(4)}E5f6`,
  PAT: `github_pat_${'11ABCDEFG0'.repeat(3)}_xyz${'Q'.repeat(20)}`,
  AKIA: `AKIA${'QWERTYUIOPASDFGH'}`,
  BEARER: `eyJhbGciOiJIUzI1NiJ9.${'c2VjcmV0'.repeat(3)}.${'x9Y8z7'.repeat(3)}`,
  KEY: `${['-----BEGIN', 'OPENSSH PRIVATE KEY-----'].join(' ')}\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ\n${['-----END', 'OPENSSH PRIVATE KEY-----'].join(' ')}`,
  TOKEN,
};
/** The private values in tests/fixtures/board.json that must never come back. */
export const PRIVATE = ['mira.k@students.example.invalid', 'S-20417', 'et_b1_5f0c2a', 'reviewer-ionescu', 'editToken', '_moderation', 'studentId'];

// Placeholders sit inside JSON strings, so each value goes in JSON-escaped.
const fill = (json) => json.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in SECRETS ? JSON.stringify(SECRETS[k]).slice(1, -1) : m));

/**
 * Write board data for the API to a temp file and return its path: the fixture's posts (placeholders filled in), plus
 * `extra` posts (partial posts get an author and a date).
 */
export function boardData(t, extra = []) {
  const base = JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', 'board.json'), 'utf8'));
  const posts = JSON.parse(fill(JSON.stringify(base.posts)));
  for (const [i, p] of extra.entries()) {
    posts.push({ author: { handle: `student_${i}`, email: `s${i}@students.example.invalid`, studentId: `S-3${String(i).padStart(4, '0')}` }, title: `Post ${p.id}`, votes: 0, editToken: `et_x_${i}`, postedAt: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}Z`, ...p });
  }
  const file = path.join(t.tmp(), 'board.json');
  fs.writeFileSync(file, JSON.stringify({ courses: base.courses, posts }));
  return file;
}

/** Start the portal with this board token and data (and a throwaway state file), run fn(client), always stop it. */
export async function board(t, { token = TOKEN, data = boardData(t) } = {}, fn) {
  const c = await connect(t, { [TOKEN_VAR]: token, STUDYBUDDY_BOARD_DATA: data, STUDYBUDDY_STATE: path.join(t.tmp(), 'state.json') });
  try { return await fn(c); } finally { c.close(); }
}

/** The board tool from tools/list, or a failure that says how to add it. */
export async function boardTool(t, c) {
  const tool = (await c.tools()).find((x) => x.name === 'get_board_posts');
  if (!tool) t.fail('tools/list does not show get_board_posts yet: register boardTool from mcp/board.mjs in studybuddy-server.mjs (TODO(M1)).');
  return tool;
}

/** Call get_board_posts and return the parsed result, or fail with what came back. */
export async function posts(t, c, args) {
  await boardTool(t, c);
  const r = await c.call('get_board_posts', args);
  if (r.isError) t.fail(`get_board_posts(${JSON.stringify(args)}) failed: ${r.text.slice(0, 200)}`);
  return r;
}
