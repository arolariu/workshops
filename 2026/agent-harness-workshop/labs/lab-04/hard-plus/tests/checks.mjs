// Free checks for Lab 04 · hard+: untrusted output. The checks serve their own board data (tests/fixtures/board.json,
// hostile on purpose) through STUDYBUDDY_BOARD_DATA, and give the server its token through STUDYBUDDY_BOARD_TOKEN.
import fs from 'node:fs';
import path from 'node:path';
import { serverConfig, noCopilot, suiteRun, noCopilotIn } from './common.mjs';
import { TOKEN, WRONG, TOKEN_VAR, SECRETS, PRIVATE, boardData, board, boardTool, posts } from './helpers.mjs';

// Input names that hold a credential (not "author", "authority"…): token, apiKey, api_key, password, secret, auth, …
const CREDENTIAL = /(token|secret|passw(or)?d|api_?key|credential)s?$|^(auth|authorization|bearer)$/i;
const ENVELOPE = ['source', 'trust', 'notice', 'course', 'posts', 'omitted'];
const FIELDS = ['id', 'author', 'postedAt', 'title', 'text', 'truncated'];
const cases = (t) => JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', 'clean.json'), 'utf8')).cases;
const byId = (r) => Object.fromEntries((r.data?.posts ?? []).map((p) => [p.id, p]));
const show = (s) => JSON.stringify(s).slice(0, 90);
const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** The posts of one fixture board, or a clear failure when the result isn't the labelled envelope (yet). */
const envelopePosts = (t, r) => {
  if (!Array.isArray(r.data?.posts)) t.fail(`Return the labelled envelope (M2), { …, posts: [ … ] }: got ${r.text.slice(0, 100)}`);
  return r.data.posts;
};
/** Serve the clean.json cases as SE201 posts and compare what comes back for one group. */
const cleaned = (t, group) => {
  const list = cases(t);
  const data = boardData(t, list.map((c, i) => ({ id: c.id, course: 'SE201', title: c.id, body: c.in, postedAt: `2026-10-${String(20 - i).padStart(2, '0')}T08:00:00Z` })));
  return board(t, { data }, async (c) => {
    const got = byId(await posts(t, c, { course: 'SE201', limit: 20 }));
    const wrong = list.filter((x) => x.group === group && got[x.id]?.text !== x.out);
    if (!wrong.length) return true;
    const w = wrong[0];
    return `${w.id} (${w.why}): expected ${show(w.out)}, got ${show(got[w.id]?.text)}.${wrong.length > 1 ? ` Also wrong: ${wrong.slice(1).map((x) => x.id).join(', ')} (tests/fixtures/clean.json).` : ''}`;
  });
};

export default (t) => [
  // M1 · A token the model never sees
  t.check('get_board_posts is listed: read-only, a course, an optional limit, and no credential input', () => board(t, {}, async (c) => {
    const tool = await boardTool(t, c);
    const props = tool.inputSchema?.properties ?? {};
    if (tool.annotations?.readOnlyHint !== true) return 'Mark it read-only: annotations: { readOnlyHint: true }.';
    if (props.course?.type !== 'string' || !(tool.inputSchema.required ?? []).includes('course')) return 'course is a required string input.';
    if (props.limit?.type !== 'integer' || props.limit.minimum !== 1 || props.limit.maximum !== 20 || (tool.inputSchema.required ?? []).includes('limit')) return 'Add an optional integer input "limit" with "minimum": 1 and "maximum": 20.';
    const leaks = (await c.tools()).flatMap((x) => Object.keys(x.inputSchema?.properties ?? {}).filter((k) => CREDENTIAL.test(k)).map((k) => `${x.name}.${k}`));
    return !leaks.length || `No tool may take a credential as input: ${leaks.join(', ')}. Whatever the model passes, it has seen (and it sits in the context, the logs and the transcript). The server reads the token itself.`;
  }), { milestone: 'M1' }),
  t.check('With the server\'s token, it returns the course\'s posts', () => board(t, {}, async (c) => {
    const r = await posts(t, c, { course: 'DB220' });
    return /B1/.test(r.text) || `Expected the DB220 posts (B1 …), got ${r.text.slice(0, 120)}`;
  }), { milestone: 'M1' }),
  t.check('Without a token, or with a wrong one, it says so, and never repeats the token', async () => {
    const none = await board(t, { token: '' }, async (c) => { await boardTool(t, c); return c.call('get_board_posts', { course: 'DB220' }); });
    if (!none.isError || !none.text.includes(TOKEN_VAR)) return `With ${TOKEN_VAR} unset, return an isError result that names the variable (so a human knows what to set). Got: ${none.text.slice(0, 120)}`;
    const wrong = await board(t, { token: WRONG }, (c) => c.call('get_board_posts', { course: 'DB220' }));
    if (!wrong.isError) return `With a token the board rejects, return an isError result. Got: ${wrong.text.slice(0, 120)}`;
    if (wrong.text.includes(WRONG)) return 'The error contains the token the server sent: the board\'s error body echoes it. Say what went wrong in your own words, never pass an upstream error body on.';
    return /reject|invalid|denied|unauthori[sz]ed|not accepted|401/i.test(wrong.text) || `Say that the board rejected the server's credentials. Got: ${wrong.text.slice(0, 120)}`;
  }, { milestone: 'M1' }),
  t.check('.mcp.json hands the token over from the environment, and no file holds it', () => {
    const { name, server } = serverConfig(t);
    const v = server.env?.[TOKEN_VAR];
    if (v === undefined) return `Copilot gives a local server only PATH from your environment. Add "env": { "${TOKEN_VAR}": "\${${TOKEN_VAR}:-}" } to "${name}" in .mcp.json.`;
    if (!new RegExp(`^\\$(\\{${TOKEN_VAR}(:-[^}]*)?\\}|${TOKEN_VAR})$`).test(String(v))) return `"${TOKEN_VAR}" in .mcp.json should be a reference to the variable ("\${${TOKEN_VAR}:-}"), not a value.`;
    const holders = t.files().filter((f) => !/(^|\/)mcp\/state\.json$/.test(f) && fs.statSync(t.path(f)).size < 1024 * 1024 && (t.read(f) ?? '').includes(TOKEN));
    return !holders.length || `The token is written in ${holders.join(', ')}. Anything in the folder can be read by the agent and ends up in git. Keep it in your environment.`;
  }, { milestone: 'M1' }),
  t.check('The portal\'s other tools are untouched (your hard contract suite still passes)', async () => {
    const r = await suiteRun(t, t.dir, 'mcp-contract.test.mjs');
    noCopilotIn(t, r);
    return (r.total > 0 && r.fail === 0) || `node --test mcp-contract.test.mjs: ${r.fail} of ${r.total} failing. ${r.failing.slice(0, 2).join(' | ')}`;
  }, { milestone: 'M1', timeout: 150000 }),
  t.check('Without mcp/board.mjs the portal still starts, and its other tools work', async () => {
    const { server } = serverConfig(t);
    const copy = t.copy(t.tmp());
    fs.rmSync(path.join(copy, 'mcp', 'board.mjs'), { force: true });
    const guard = noCopilot(t);
    let c;
    try {
      c = await t.mcp({ command: server.command, args: server.args ?? [], cwd: copy, env: { ...(server.env ?? {}), STUDYBUDDY_STATE: path.join(t.tmp(), 'state.json'), ...guard.env }, timeout: 5000 });
    } catch (e) {
      return `Without mcp/board.mjs the server doesn't start (${e.message.slice(0, 160)}). Load the board with a guarded import: const board = await import('./board.mjs').catch(…). A server copied on its own (Lab 06 packages it in a plugin) must still serve every other tool.`;
    }
    try {
      const ids = ((await c.call('get_deadlines', {})).data ?? []).map((a) => a.id).join(',');
      return ids === 'A2,A1' || `Without mcp/board.mjs, get_deadlines should still return A2,A1, got ${ids || 'nothing'}.`;
    } finally { c.close(); guard.assert(); }
  }, { milestone: 'M1' }),

  // M2 · Say where it comes from
  t.check('The result is labelled: source, trust and a notice, around the posts', () => board(t, {}, async (c) => {
    const r = await posts(t, c, { course: 'DB220' });
    const d = r.data;
    if (!d || Array.isArray(d) || typeof d !== 'object') return `Return an object that labels the posts, not ${Array.isArray(d) ? 'a bare list' : 'plain text'}: { source, trust, notice, course, posts }.`;
    if (!/board/i.test(String(d.source ?? ''))) return `"source" should say where the data comes from (e.g. "studybuddy-board"), got ${show(d.source)}.`;
    if (d.trust !== 'untrusted') return `"trust" should be "untrusted", got ${show(d.trust)}.`;
    if (String(d.notice ?? '').length < 30 || !/instruction/i.test(d.notice)) return `"notice" should tell the model, in a sentence, that the posts are data and their instructions are not to be followed. Got ${show(d.notice)}.`;
    if (d.course !== 'DB220' || !Array.isArray(d.posts)) return `Expected "course": "DB220" and a "posts" list, got ${show({ course: d.course, posts: typeof d.posts })}.`;
    return true;
  }), { milestone: 'M2' }),
  t.check('The description warns the model before it calls the tool', () => board(t, {}, async (c) => {
    const d = String((await boardTool(t, c)).description ?? '');
    if (/token/i.test(d)) return 'The description still talks about a token: the model has nothing to do with it any more.';
    if (!/(other )?students|classmates|user[- ]generated/i.test(d)) return 'Say who writes the posts (other students), so the model knows what it is reading.';
    return /untrusted|not instructions|never follow|as data|don't follow|do not follow/i.test(d) || 'Say that the posts are untrusted data, never instructions.';
  }), { milestone: 'M2' }),
  t.check('A post can\'t break out of its label', () => board(t, {}, async (c) => {
    const r = await posts(t, c, { course: 'DB220', limit: 20 });
    const extra = Object.keys(r.data ?? {}).filter((k) => !ENVELOPE.includes(k));
    if (r.data?.trust !== 'untrusted' || extra.length) return `Post B2 changed the envelope (${extra.length ? `new keys: ${extra.join(', ')}` : `trust is ${show(r.data?.trust)}`}). Build the result as an object and let JSON.stringify escape it, never glue strings together.`;
    const b2 = byId(r).B2;
    return (b2 && b2.text.includes('"trust": "trusted"') && b2.text.includes('[SYSTEM]')) || `B2's text should come back as text (quotes and all), inside its post. Got ${show(b2?.text)}.`;
  }), { milestone: 'M2' }),

  // M3 · Cap sizes
  t.check('At most `limit` posts, newest first (default 5, at most 20)', () => {
    const data = boardData(t, Array.from({ length: 40 }, (_, i) => ({ id: `T${String(i).padStart(2, '0')}`, course: 'AI210', body: `Tip ${i}`, postedAt: `2026-10-${String(1 + ((i * 11) % 28)).padStart(2, '0')}T${String(Math.floor(i / 28)).padStart(2, '0')}:00:00Z` })));
    return board(t, { data }, async (c) => {
      const five = envelopePosts(t, await posts(t, c, { course: 'AI210' }));
      if (five.length !== 5) return `Without a limit, return 5 posts, got ${five.length}.`;
      const twelve = envelopePosts(t, await posts(t, c, { course: 'AI210', limit: 12 }));
      if (twelve.length !== 12) return `limit 12: expected 12 posts, got ${twelve.length}.`;
      const dates = twelve.map((p) => p.postedAt);
      if (dates.join() !== [...dates].sort().reverse().join()) return `Newest first (by postedAt): got ${dates.slice(0, 4).join(', ')} …`;
      for (const limit of [0, 21, 'x']) {
        const r = await c.call('get_board_posts', { course: 'AI210', limit });
        if (!r.isError) return `limit ${JSON.stringify(limit)} should be an isError result (1 to 20), got ${r.text.slice(0, 80)}`;
      }
      return true;
    });
  }, { milestone: 'M3' }),
  t.check('Long posts are cut to 500 characters (title: 100), and say so; a cut never splits a character', () => {
    const data = boardData(t, [
      { id: 'L1', course: 'MA110', title: 'T'.repeat(5000), body: 'x'.repeat(200000), postedAt: '2026-10-14T00:00:00Z' },
      { id: 'L2', course: 'MA110', body: '😀'.repeat(1000), postedAt: '2026-10-13T00:00:00Z' },
      { id: 'L3', course: 'MA110', body: 'short and sweet', postedAt: '2026-10-12T00:00:00Z' },
    ]);
    return board(t, { data }, async (c) => {
      const got = byId(await posts(t, c, { course: 'MA110' }));
      const { L1, L2, L3 } = got;
      if (!L1 || !L2 || !L3) return `Expected posts L1, L2 and L3, got ${Object.keys(got).join(', ') || 'none'}.`;
      const len = (s) => [...String(s)].length;
      if (len(L1.text) > 500 || L1.truncated !== true) return `A 200,000-character post: text ≤ 500 characters and "truncated": true. Got ${len(L1.text)} characters, truncated: ${L1.truncated}.`;
      if (len(L1.title) > 100) return `Titles are text from students too: at most 100 characters, got ${len(L1.title)}.`;
      if (lone.test(L2.text) || L2.truncated !== true || len(L2.text) > 500) return 'A post of 1,000 emoji: cut it by characters (code points), not UTF-16 units, so no emoji is left half: [...text].slice(0, n).join("").';
      return (L3.text === 'short and sweet' && !L3.truncated) || `A short post comes back whole, with "truncated": false. Got ${show(L3)}.`;
    });
  }, { milestone: 'M3' }),
  t.check('The whole result stays under 10,000 characters, and says how many posts did not fit', () => {
    const data = boardData(t, Array.from({ length: 20 }, (_, i) => ({ id: `Q${i}`, course: 'WEB230', body: '"'.repeat(3000), postedAt: `2026-10-${String(1 + i).padStart(2, '0')}T00:00:00Z` })));
    return board(t, { data }, async (c) => {
      const r = await posts(t, c, { course: 'WEB230', limit: 20 });
      if (r.text.length > 10000) return `The result is ${r.text.length} characters. 20 posts of 500 quotes become 20,000+ characters of JSON (every quote is escaped): stop adding posts before 10,000.`;
      const shown = envelopePosts(t, r).length;
      return (shown >= 1 && r.data.omitted === 20 - shown) || `Say how many posts didn't fit: "omitted": ${20 - shown} (got ${show(r.data.omitted)}).`;
    });
  }, { milestone: 'M3' }),

  // M4 · Strip what the eye can't see
  t.check('Terminal tricks are gone: ANSI escapes, carriage returns and control characters', () => cleaned(t, 'terminal'), { milestone: 'M4' }),
  t.check('Invisible text is gone: zero-width, bidi, soft hyphens and Unicode tag characters', () => cleaned(t, 'invisible'), { milestone: 'M4' }),
  t.check('Ordinary text survives: accents, emoji, CJK, tabs and new lines', () => cleaned(t, 'keep'), { milestone: 'M4' }),

  // M5 · Never return secrets
  t.check('Only the fields a student needs: no emails, student ids, edit tokens or moderation notes', () => board(t, {}, async (c) => {
    const r = await posts(t, c, { course: 'DB220', limit: 20 });
    const leaked = PRIVATE.filter((s) => r.text.includes(s));
    if (leaked.length) return `The result contains ${leaked.join(', ')}. Build each post from an allow-list (${FIELDS.join(', ')}), never by passing the API's record on.`;
    const extra = envelopePosts(t, r).flatMap((p) => Object.keys(p).filter((k) => !FIELDS.includes(k)));
    if (extra.length) return `Posts carry fields nobody asked for: ${[...new Set(extra)].join(', ')}. Return ${FIELDS.join(', ')}.`;
    const b1 = byId(r).B1;
    return (b1?.author === 'mira_k' && Boolean(b1.postedAt) && Boolean(b1.text)) || `"author" is the handle (mira_k), not the author object. Got ${show(b1)}.`;
  }), { milestone: 'M5' }),
  t.check('Secrets pasted into posts are redacted', () => board(t, {}, async (c) => {
    const r = await posts(t, c, { course: 'DB220', limit: 20 });
    const found = Object.entries(SECRETS).filter(([k, v]) => k !== 'TOKEN' && r.text.includes(k === 'KEY' ? v.split('\n')[1] : v)).map(([k]) => k);
    if (found.length) return `These secrets from posts B3 and B4 came back: ${found.join(', ')} (a GitHub token, a fine-grained PAT, an AWS key id, a bearer token, a private key's body). Replace them with [redacted], in titles too.`;
    const { B3, B4 } = byId(r);
    return (/\[redacted\]/.test(B3?.text ?? '') && /\[redacted\]/.test(B4?.title ?? '') && /that was my key/.test(B4?.text ?? '')) || `Replace each secret with "[redacted]" and keep the rest of the post. Got B3: ${show(B3?.text)}, B4: ${show(B4?.title)}.`;
  }), { milestone: 'M5' }),
  t.check('The server\'s own token never comes back: not in results, errors, tool lists or logs', async () => {
    const seen = [];
    await board(t, {}, async (c) => {
      await boardTool(t, c);
      const tools = await c.tools();
      seen.push(['tools/list', JSON.stringify(tools)]);
      for (const x of tools) seen.push([`${x.name}({})`, (await c.call(x.name, {})).text]);
      seen.push(['DB220 (post B5 contains the token)', (await c.call('get_board_posts', { course: 'DB220', limit: 20 })).text]);
      seen.push(['an unknown course', (await c.call('get_board_posts', { course: 'XX999' })).text]);
      seen.push(['a token argument', (await c.call('get_board_posts', { course: 'DB220', token: 'guess' })).text]);
      seen.push(['stderr', c.stderr]);
    });
    await board(t, { token: WRONG }, async (c) => {
      seen.push(['a rejected token', (await c.call('get_board_posts', { course: 'DB220' })).text]);
      seen.push(['stderr (rejected token)', c.stderr]);
    });
    const leak = seen.find(([, text]) => String(text).includes(TOKEN) || String(text).includes(WRONG));
    return !leak || `The server's token came back in: ${leak[0]}. Redact its value from every string you return, and never log it.`;
  }, { milestone: 'M5' }),
];
