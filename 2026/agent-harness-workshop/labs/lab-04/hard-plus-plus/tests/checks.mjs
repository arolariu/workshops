// Free checks for Lab 04 · hard++: MCP from the protocol up. They talk raw JSON-RPC to mcp/library-server.mjs over
// stdio and HTTP (tests/helpers.mjs), the way any MCP client would, and stop every server they start.
import fs from 'node:fs';
import path from 'node:path';
import { SERVER, VERSIONS, TOKEN, withStdio, withHttp, httpWithoutToken, rpc } from './helpers.mjs';
import { suiteRun, noCopilotIn } from './common.mjs';
import { MUTANTS, mutant } from './mutants.mjs';

const PAGE_SIZE = 10;

const SUITE = 'mcp-conformance.test.mjs';
const TOOLS = ['search_courses', 'get_course', 'plan_study_weeks', 'find_courses'];
const show = (x) => JSON.stringify(x)?.slice(0, 160);
const library = (t) => JSON.parse(fs.readFileSync(t.path('mcp/library-data.json'), 'utf8')).courses;
const textOf = (m) => (m?.result?.content ?? []).map((c) => c.text ?? '').join('\n');
const dataOf = (m) => { try { return JSON.parse(textOf(m)); } catch { return null; } };
const errorCode = (m, code, what) => {
  if (!m) return `${what}: no answer within 3 s.`;
  if (m.error?.code !== code) return `${what}: expected a JSON-RPC error ${code}, got ${show(m.error ?? m.result)}.`;
  return null;
};
/** Walk resources/list with its cursors (at most 20 pages); returns { pages, uris } or a failure message. */
async function walk(c) {
  const pages = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const m = await c.request('resources/list', cursor === undefined ? {} : { cursor });
    if (!m?.result) return { problem: `resources/list${cursor === undefined ? '' : ` (page ${i + 1})`} failed: ${show(m?.error ?? 'no answer')}` };
    pages.push(m.result);
    cursor = m.result.nextCursor;
    if (cursor === undefined || cursor === null) break;
  }
  return { pages, uris: pages.flatMap((p) => (p.resources ?? []).map((r) => r.uri)) };
}

export default (t) => [
  // M1 · The handshake
  t.check('initialize: the version you asked for when it\'s supported, the server\'s own when it isn\'t', () => withStdio(t, async (c) => {
    const first = await c.init('2025-11-25');
    if (first.result?.protocolVersion !== '2025-11-25') return `initialize with 2025-11-25 (what Copilot asks for) should answer 2025-11-25, got ${show(first.result ?? first.error)}.`;
    for (const [asked, want] of [['2025-06-18', ['2025-06-18']], ['1999-01-01', VERSIONS]]) {
      const m = await c.request('initialize', { protocolVersion: asked, capabilities: {}, clientInfo: { name: 'check', version: '1' } });
      const got = m?.result?.protocolVersion;
      if (!want.includes(got)) return `initialize with ${asked} should answer ${asked === '1999-01-01' ? `a version the server supports (${VERSIONS.join(', ')}), not an echo` : asked}; got ${show(got ?? m?.error)}.`;
    }
    return true;
  }), { milestone: 'M1' }),
  t.check('initialize: capabilities for tools, resources and prompts, nothing it doesn\'t do, and who it is', () => withStdio(t, async (c) => {
    const r = (await c.init()).result ?? {};
    const caps = r.capabilities ?? {};
    const missing = ['tools', 'resources', 'prompts'].filter((k) => !caps[k]);
    if (missing.length) return `Declare what the server offers: capabilities.${missing.join(', capabilities.')} (an object, e.g. {}).`;
    const extra = ['logging', 'completions', 'tasks', 'sampling', 'elicitation', 'roots'].filter((k) => k in caps);
    if (extra.length) return `Only declare what you implement: remove ${extra.join(', ')}. A client will call what you declare.`;
    return Boolean(r.serverInfo?.name && r.serverInfo?.version) || `serverInfo needs a name and a version, got ${show(r.serverInfo)}.`;
  }), { milestone: 'M1' }),
  t.check('Before initialize only ping works, and notifications never get an answer', () => withStdio(t, async (c) => {
    const early = await c.request('tools/list', {});
    if (!early) return 'tools/list before initialize got no answer: answer with a JSON-RPC error that says to initialize first.';
    if (!early.error || !/initiali[sz]/i.test(early.error.message ?? '')) return `tools/list before initialize should be an error that says to initialize first, got ${show(early.result ?? early.error)}.`;
    const ping = await c.request('ping', {});
    if (!ping?.result || Object.keys(ping.result).length) return `ping answers {} at any time, got ${show(ping?.result ?? ping?.error ?? 'nothing')}.`;
    await c.init();
    const before = c.messages.length;
    c.notify('notifications/initialized');
    c.notify('notifications/something_else', { a: 1 });
    c.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 999, reason: 'nothing to cancel' } });
    const pong = await c.request('ping', {});
    const unexpected = c.messages.slice(before).filter((m) => m !== pong);
    return (pong && !unexpected.length) || `Notifications (no id) must never get a response. Got ${show(unexpected[0])}.`;
  }), { milestone: 'M1' }),
  t.check('JSON-RPC errors: -32700, -32600 and -32601, and stdout carries nothing but JSON-RPC', () => withStdio(t, async (c) => {
    await c.init();
    c.send('this is not json');
    const parse = await c.waitFor((m) => m.error?.code === -32700);
    if (!parse || parse.id !== null) return `A line that isn't JSON gets { id: null, error: { code: -32700 } }, got ${show(parse ?? 'nothing')}.`;
    const invalid = await (c.send({ jsonrpc: '1.0', id: 'v1', method: 'ping' }), c.waitFor((m) => m.id === 'v1' || (m.id === null && m.error?.code === -32600)));
    if (invalid?.error?.code !== -32600) return `A request without "jsonrpc": "2.0" gets -32600 (Invalid Request), with its id or with id: null, got ${show(invalid ?? 'nothing')}.`;
    const unknown = errorCode(await c.request('library/explode', {}), -32601, 'An unknown method');
    if (unknown) return unknown;
    const bad = c.lines.find((l) => { try { return JSON.parse(l).jsonrpc !== '2.0'; } catch { return true; } });
    return !bad || `Everything on stdout must be a JSON-RPC message (logs go to stderr). Found: ${bad.slice(0, 100)}`;
  }), { milestone: 'M1' }),

  // M2 · Tools, resources and prompts
  t.check('tools/list: the four tools, each with a description, an object schema and read-only annotations', () => withStdio(t, async (c) => {
    await c.init();
    const list = (await c.request('tools/list', {}))?.result?.tools;
    if (!Array.isArray(list)) return 'tools/list should answer { tools: [ … ] }.';
    const names = list.map((x) => x.name);
    const missing = TOOLS.filter((n) => !names.includes(n));
    if (missing.length) return `Missing tools: ${missing.join(', ')} (got ${names.join(', ') || 'none'}).`;
    const bad = list.filter((x) => !String(x.description ?? '').trim() || x.inputSchema?.type !== 'object' || x.annotations?.readOnlyHint !== true).map((x) => x.name);
    return !bad.length || `Each tool needs a description, inputSchema { type: "object", … } and annotations.readOnlyHint: true (they only read): ${bad.join(', ')}.`;
  }), { milestone: 'M2' }),
  t.check('tools/call: results, tool errors and protocol errors in the right places', () => withStdio(t, async (c) => {
    await c.init();
    const want = library(t).filter((x) => `${x.title} ${x.summary}`.toLowerCase().includes('database')).map((x) => x.code);
    const r = await c.request('tools/call', { name: 'search_courses', arguments: { query: 'database' } });
    const codes = (dataOf(r)?.courses ?? []).map((x) => x.code);
    if (r?.result?.isError || codes.join() !== want.join()) return `search_courses { query: "database" } should return { courses: [ … ] } with ${want.join(', ')} (title or summary, by code), got ${show(dataOf(r) ?? r?.error ?? textOf(r))}.`;
    const short = await c.request('tools/call', { name: 'search_courses', arguments: { query: 'x' } });
    if (!short?.result?.isError) return `A query shorter than 2 characters is an input problem: a result with isError: true, got ${show(short?.result ?? short?.error)}.`;
    const missing = await c.request('tools/call', { name: 'get_course', arguments: { code: 'ZZ999' } });
    if (!missing?.result?.isError) return `get_course for a course that doesn't exist is a tool error (isError: true), got ${show(missing?.result ?? missing?.error)}.`;
    return errorCode(await c.request('tools/call', { name: 'launch_rockets', arguments: {} }), -32602, 'An unknown tool') ?? true;
  }), { milestone: 'M2' }),
  t.check('resources: a template, a course to read, and -32002 for one that doesn\'t exist', () => withStdio(t, async (c) => {
    await c.init();
    const tpl = (await c.request('resources/templates/list', {}))?.result?.resourceTemplates ?? [];
    if (!tpl.some((x) => x.uriTemplate === 'library://courses/{code}')) return `resources/templates/list should offer { uriTemplate: "library://courses/{code}", … }, got ${show(tpl)}.`;
    const r = await c.request('resources/read', { uri: 'library://courses/DB220' });
    const item = r?.result?.contents?.[0];
    let course = null;
    try { course = JSON.parse(item?.text); } catch { /* below */ }
    if (item?.uri !== 'library://courses/DB220' || item?.mimeType !== 'application/json' || course?.code !== 'DB220') return `resources/read library://courses/DB220 → { contents: [{ uri, mimeType: "application/json", text: <the course as JSON> }] }, got ${show(r?.result ?? r?.error)}.`;
    return errorCode(await c.request('resources/read', { uri: 'library://courses/ZZ999' }), -32002, 'Reading a resource that does not exist (2025-11-25: -32002, Resource not found)') ?? true;
  }), { milestone: 'M2' }),
  t.check('prompts: study_plan with its arguments, and -32602 when one is wrong', () => withStdio(t, async (c) => {
    await c.init();
    const p = ((await c.request('prompts/list', {}))?.result?.prompts ?? []).find((x) => x.name === 'study_plan');
    if (!p || !p.arguments?.some((a) => a.name === 'course' && a.required === true)) return `prompts/list should offer study_plan with a required "course" argument, got ${show(p)}.`;
    const g = await c.request('prompts/get', { name: 'study_plan', arguments: { course: 'DB220', weeks: '4' } });
    const msg = g?.result?.messages?.[0];
    if (msg?.role !== 'user' || msg?.content?.type !== 'text') return `prompts/get study_plan { course: "DB220", weeks: "4" } → { messages: [{ role: "user", content: { type: "text", text } }] }, got ${show(g?.result ?? g?.error)}.`;
    const text = String(msg.content.text ?? '');
    // The course by its code or its title, either is fine; and the weeks the client asked for (arguments are strings).
    if (!/DB220|Databases/.test(text) || !/\b4\b/.test(text)) return `The prompt's text should name the course (DB220 or "Databases") and the 4 weeks asked for, got ${show(text)}.`;
    return errorCode(await c.request('prompts/get', { name: 'study_plan', arguments: {} }), -32602, 'A missing required argument')
      ?? errorCode(await c.request('prompts/get', { name: 'no_such_prompt', arguments: {} }), -32602, 'An unknown prompt')
      ?? true;
  }), { milestone: 'M2' }),

  // M3 · Pages
  t.check('resources/list comes in pages, and the cursors lead through every course exactly once', () => withStdio(t, async (c) => {
    await c.init();
    const total = library(t).length;
    const a = await walk(c);
    if (a.problem) return a.problem;
    const big = a.pages.find((p) => (p.resources ?? []).length > PAGE_SIZE);
    if (big || a.pages.length < Math.ceil(total / PAGE_SIZE)) return `${total} courses in ${a.pages.length} page(s)${big ? `, one with ${big.resources.length}` : ''}: serve at most ${PAGE_SIZE} per page, with a nextCursor until the last one.`;
    const unique = new Set(a.uris);
    if (a.uris.length !== total || unique.size !== total) return `Following nextCursor gave ${a.uris.length} resources (${unique.size} different); the library has ${total}, each exactly once.`;
    const b = await walk(c);
    return (b.uris?.join() === a.uris.join()) || 'A second walk gave a different list: cursors must be stable.';
  }), { milestone: 'M3' }),
  t.check('A cursor is opaque, and a bad one is an invalid-params error', () => withStdio(t, async (c) => {
    await c.init();
    const cursor = (await c.request('resources/list', {}))?.result?.nextCursor;
    if (typeof cursor !== 'string') return `The first page needs a nextCursor (a string), got ${show(cursor)}.`;
    if (/^\d+$/.test(cursor)) return `nextCursor "${cursor}" is a page number: make it opaque (encode it), so clients can't build or guess one.`;
    const flipped = cursor.slice(0, -1) + (cursor.at(-1) === 'A' ? 'B' : 'A');
    for (const bad of ['garbage', flipped, Buffer.from(JSON.stringify({ o: 9999 })).toString('base64url')]) {
      const problem = errorCode(await c.request('resources/list', { cursor: bad }), -32602, `resources/list with cursor "${bad.slice(0, 30)}"`);
      if (problem) return problem;
    }
    return true;
  }), { milestone: 'M3' }),

  // M4 · Cancel and time out
  t.check('A cancelled call gets no answer, and the server keeps serving', () => withStdio(t, async (c) => {
    await c.init();
    c.send(rpc('slow-1', 'tools/call', { name: 'plan_study_weeks', arguments: { course: 'DB220', weeks: 20 } }));
    await new Promise((r) => setTimeout(r, 200));
    c.notify('notifications/cancelled', { requestId: 'slow-1', reason: 'the user pressed Esc' });
    const answer = await c.waitFor((m) => m.id === 'slow-1', 2600);
    if (answer) return `plan_study_weeks was cancelled after 200 ms but answered anyway: ${show(answer.result ?? answer.error)}. Keep each running request's AbortController by id, abort it on notifications/cancelled, and send nothing.`;
    const ping = await c.request('ping', {}, { ms: 1000 });
    return Boolean(ping?.result) || 'After a cancellation the server must keep working: ping got no answer.';
  }, { env: { LIBRARY_STEP_MS: '100' } }), { milestone: 'M4', timeout: 20000 }),
  t.check('A call that runs past the deadline ends with a tool error', () => withStdio(t, async (c) => {
    await c.init();
    const started = Date.now();
    const r = await c.request('tools/call', { name: 'plan_study_weeks', arguments: { course: 'DB220', weeks: 30 } }, { ms: 2500 });
    const ms = Date.now() - started;
    if (!r) return 'With LIBRARY_TIMEOUT_MS=300, a 3-second plan should end after about 300 ms with an error result; nothing came back within 2.5 s.';
    if (!r.result?.isError || !/time|deadline/i.test(textOf(r))) return `Expected a result with isError: true that says it timed out, got ${show(r.result ?? r.error)}.`;
    return ms < 1500 || `The deadline is 300 ms, but the answer took ${ms} ms: stop the work when the deadline passes (an AbortSignal).`;
  }, { env: { LIBRARY_STEP_MS: '100', LIBRARY_TIMEOUT_MS: '300' } }), { milestone: 'M4', timeout: 20000 }),
  t.check('A slow call doesn\'t block other requests', () => withStdio(t, async (c) => {
    await c.init();
    c.send(rpc('slow-2', 'tools/call', { name: 'plan_study_weeks', arguments: { course: 'DB220', weeks: 10 } }));
    const started = Date.now();
    const ping = await c.request('ping', {}, { ms: 1500 });
    const ms = Date.now() - started;
    if (!ping || ms > 400) return `While plan_study_weeks runs (about 1 s), ping took ${ping ? `${ms} ms` : 'more than 1.5 s'}. Handle each message as it arrives; don't wait for the previous one to finish.`;
    const slow = await c.waitFor((m) => m.id === 'slow-2', 3000);
    return (slow?.result && !slow.result.isError && (dataOf(slow)?.weeks ?? []).length === 10) || `The slow call should still finish with 10 weeks, got ${show(slow?.result ?? slow?.error ?? 'nothing')}.`;
  }, { env: { LIBRARY_STEP_MS: '100' } }), { milestone: 'M4', timeout: 20000 }),

  // M5 · HTTP with a bearer token
  t.check('HTTP: it listens on 127.0.0.1 only, on any free port, and needs a token to start', async () => {
    const none = await httpWithoutToken(t);
    if (none.running) return 'Without LIBRARY_TOKEN, --http must refuse to start (exit 1, and say why on stderr): an HTTP server without a token is an open door.';
    if (none.code === 0 || !/LIBRARY_TOKEN/.test(none.stderr)) return `Without LIBRARY_TOKEN, exit with a non-zero code and name the variable on stderr. Got exit ${none.code}, stderr: ${none.stderr.trim().slice(0, 120)}`;
    return withHttp(t, async (h) => {
      const r = await h.get();
      return r.status === 405 || `GET ${h.url} (no SSE stream offered) should answer 405 Method Not Allowed, got ${r.status}.`;
    });
  }, { milestone: 'M5', timeout: 20000 }),
  t.check('HTTP: no token, a wrong token or a foreign Origin get no further', () => withHttp(t, async (h) => {
    const msg = rpc(1, 'ping');
    const none = await h.post(msg, { token: null });
    if (none.status !== 401 || !/bearer/i.test(none.headers.get('www-authenticate') ?? '')) return `No Authorization header: 401 with WWW-Authenticate: Bearer, got ${none.status} ${none.headers.get('www-authenticate') ?? ''}.`;
    const wrong = await h.post(msg, { token: `${TOKEN}x` });
    if (wrong.status !== 401) return `A wrong token: 401, got ${wrong.status}.`;
    if (wrong.text.includes(TOKEN)) return 'The 401 answer repeats the token: never echo a credential.';
    const evil = await h.post(msg, { headers: { origin: 'https://evil.example.invalid' } });
    if (evil.status !== 403) return `Origin: https://evil.example.invalid must get 403 (a web page in a browser could otherwise talk to your local server: DNS rebinding), got ${evil.status}.`;
    const local = await h.post(msg, { headers: { origin: 'http://localhost:3000' } });
    return local.status === 200 || `Origin: http://localhost:3000 (a local page) should be served, got ${local.status}.`;
  }), { milestone: 'M5', timeout: 20000 }),
  t.check('HTTP: the protocol works: JSON answers, 202 for notifications, the version header, bad paths and bad JSON', () => withHttp(t, async (h) => {
    const init = await h.post(rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'check', version: '1' } }));
    if (init.status !== 200 || init.json?.result?.protocolVersion !== '2025-11-25') return `POST initialize → 200 with the InitializeResult, got ${init.status} ${init.text.slice(0, 120)}.`;
    const note = await h.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { headers: { 'mcp-protocol-version': '2025-11-25' } });
    if (note.status !== 202 || note.text) return `A notification → 202 Accepted with no body, got ${note.status} ${note.text.slice(0, 60)}.`;
    const call = await h.post(rpc(2, 'tools/call', { name: 'get_course', arguments: { code: 'DB220' } }), { headers: { 'mcp-protocol-version': '2025-11-25' } });
    if (call.status !== 200 || !/DB220/.test(JSON.stringify(call.json?.result ?? ''))) return `tools/call over HTTP → 200 with the result, got ${call.status} ${call.text.slice(0, 120)}.`;
    const version = await h.post(rpc(3, 'ping'), { headers: { 'mcp-protocol-version': '1999-01-01' } });
    if (version.status !== 400) return `MCP-Protocol-Version: 1999-01-01 (unsupported) → 400, got ${version.status}.`;
    const lost = await h.raw('/not-mcp', { method: 'POST', body: JSON.stringify(rpc(4, 'ping')), headers: { 'content-type': 'application/json' } });
    if (lost.status !== 404) return `POST /not-mcp → 404 (the endpoint is /mcp), got ${lost.status}.`;
    const garbage = await h.post('{ not json');
    return (garbage.status === 400 && garbage.json?.error?.code === -32700) || `A body that isn't JSON → 400 with error -32700, got ${garbage.status} ${garbage.text.slice(0, 80)}.`;
  }), { milestone: 'M5', timeout: 20000 }),

  // M6 · A versioned schema and a conformance suite
  t.check('search_courses is schema version 2; find_courses is deprecated, still works, and says what to use', () => withStdio(t, async (c) => {
    await c.init();
    const list = (await c.request('tools/list', {}))?.result?.tools ?? [];
    const v2 = list.find((x) => x.name === 'search_courses');
    const v1 = list.find((x) => x.name === 'find_courses');
    if (v2?._meta?.['dev.studybuddy/schema-version'] !== 2) return `search_courses: _meta["dev.studybuddy/schema-version"] should be 2, got ${show(v2?._meta)}.`;
    const dep = v1?._meta?.['dev.studybuddy/deprecated'];
    if (!/^deprecated/i.test(v1?.description ?? '') || !/search_courses/.test(v1?.description ?? '')) return `find_courses: start its description with "Deprecated" and name its replacement (search_courses). Got ${show(v1?.description)}.`;
    if (dep?.replacedBy !== 'search_courses' || !/^\d{4}-\d{2}-\d{2}$/.test(dep?.removeAfter ?? '')) return `find_courses: _meta["dev.studybuddy/deprecated"] = { replacedBy: "search_courses", removeAfter: "YYYY-MM-DD" }, got ${show(dep)}.`;
    const old = await c.request('tools/call', { name: 'find_courses', arguments: { q: 'database' } });
    const now = await c.request('tools/call', { name: 'search_courses', arguments: { query: 'database' } });
    const codes = (m) => (dataOf(m)?.courses ?? []).map((x) => x.code).join();
    if (old?.result?.isError || codes(old) !== codes(now) || !codes(now)) return `find_courses { q } must keep working: the same courses as search_courses { query }. Got ${show(dataOf(old) ?? textOf(old))}.`;
    if (!/deprecated/i.test(textOf(old))) return 'Every find_courses result should say it is deprecated and what to use instead (the model reads results, not _meta).';
    const q = await c.request('tools/call', { name: 'search_courses', arguments: { q: 'database' } });
    return (q?.result?.isError && /query/.test(textOf(q))) || `search_courses (v2) doesn't take q: an isError result that points to "query", got ${show(q?.result ?? q?.error)}.`;
  }), { milestone: 'M6' }),
  t.check('Your conformance suite passes on your server, over stdio and HTTP', async () => {
    if (!t.exists(SUITE)) return `${SUITE} is missing.`;
    const r = await suiteRun(t, t.dir, SUITE);
    noCopilotIn(t, r);
    if (r.fail) return `node --test ${SUITE}: ${r.fail} of ${r.total} failing: ${r.failing.slice(0, 2).join(' | ')}`;
    if (r.pass < 12) return `node --test ${SUITE} has ${r.pass} passing test(s); write at least 12 (todos don't count).`;
    const both = ['stdio', 'http'].filter((x) => !r.passing.some((n) => n.toLowerCase().includes(x)));
    return !both.length || `Run your suite over both transports: no passing test name mentions ${both.join(' or ')}.`;
  }, { milestone: 'M6', timeout: 150000 }),
  t.check('Your suite passes on the reference server and catches all 6 broken ones', async () => {
    if (!t.exists(SUITE)) return `${SUITE} is missing.`;
    const reference = t.sol(SERVER);
    if (!reference) return 'The reference server is missing (labs/lab-04/hard-plus-plus/sol). Restore the workshop files.';
    const run = (source) => {
      const copy = t.copy(t.tmp());
      fs.writeFileSync(path.join(copy, SERVER), source);
      fs.copyFileSync(path.join(t.solDir, 'mcp', 'library-data.json'), path.join(copy, 'mcp', 'library-data.json'));
      return suiteRun(t, copy, SUITE);
    };
    // All seven at once (the reference, then the six broken servers); a run that hangs is stopped with its servers.
    const [control, ...broken] = await Promise.all([run(reference), ...MUTANTS.map((name) => run(mutant(name, reference)))]);
    noCopilotIn(t, control, ...broken);
    if (control.fail || !control.pass) return `On the reference server your suite has ${control.fail} failing test(s): ${control.failing.slice(0, 2).join(' | ')}. Test what the protocol (and todo.md) promises, not your own wording.`;
    const survived = MUTANTS.filter((name, i) => broken[i].fail === 0);
    return !survived.length || `Your suite passes on broken servers: ${survived.join(', ')}. Add a test for each (todo.md, M6 lists what each one breaks).`;
  }, { milestone: 'M6', timeout: 300000 }),
];
