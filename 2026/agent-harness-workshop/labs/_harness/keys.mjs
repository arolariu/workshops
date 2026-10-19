// Every key the lab companion listens to, per screen and state: the one table the dispatcher (tui.mjs), the help
// screen and the readme follow. A test checks that no screen gives one key two meanings.
// Keys are a printed character (case-sensitive: 'H' is not 'h') or a readline key name ('return', 'escape', 'up', …).
// An upper-case letter with no meaning of its own works like its lower case (caps lock), unless the binding is `exact`.
// OTHER means "any other key". Typing (the search box, a checkpoint name) bypasses this table.
export const OTHER = '*other*';
const NAMED = new Set(['up', 'down', 'left', 'right', 'return', 'escape', 'backspace', 'tab', 'pageup', 'pagedown', 'home', 'end', 'space']);
const BACK = ['b', 'escape', 'left', 'backspace'];
const SCROLL = ['up', 'k', 'down', 'j', 'pageup', 'pagedown', 'space', 'home', 'end'];
const PAGE = ['pageup', 'pagedown', 'space'];
const PREV = ['up', 'k'];
const NEXT = ['down', 'j'];
const digits = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const b = (keys, id, does, opts = {}) => ({ keys: [].concat(keys), id, does, ...opts });

/** Keys every screen understands (except while typing). Ctrl+C cancels a run, or quits. */
export const GLOBAL = [
  b('q', 'quit', 'quit (not while something is running)'),
  b('?', 'help', 'every key, and the glossary'),
];

/** Keys kept free for features that are coming, so nothing else takes them. */
export const RESERVED = {
  exercise: [{ key: 'u', for: 'the harness X-ray: what your harness adds to every turn (Phase 3)' }],
  home: [{ key: 'u', for: 'the agent-loop replay (Phase 3)' }],
};

/** The "more" menu's items, in order (tui.mjs MENU must list exactly these keys). */
export const MENU_KEYS = ['w', 'g', 'i', 'v', 's', 'f', 'x', 'H', 'o', 'y', 'd', 'e'];

export const KEYMAP = {
  home: [
    b(PREV, 'prev', 'choose a lab'),
    b(NEXT, 'nextItem', 'choose a lab'),
    b(digits(0, 9), 'jump', 'jump to a lab by its number'),
    b(['return', 'right', 'l'], 'open', 'open the lab'),
    b('n', 'next', 'next up'),
    b('/', 'search', 'search every exercise (filter by level, status, time, path, bookmarks)'),
    b('p', 'path', 'choose a learning path'),
    b('d', 'doctor', 'setup doctor: what is installed, what is missing and how to fix it'),
    b('e', 'export', 'export a learning summary (Markdown or JSON, stays on this computer)'),
    b(PAGE, 'page', 'page up and down'),
  ],
  lab: [
    b(PREV, 'prev', 'choose a level'),
    b(NEXT, 'nextItem', 'choose a level'),
    b(digits(1, 9), 'tier', 'open a tier'),
    b(['return', 'right', 'l'], 'open', 'open the level'),
    b(['g', 'r'], 'guide', 'read the lab guide'),
    b('/', 'search', 'search every exercise'),
    b(BACK, 'back', 'back to the labs'),
    b(PAGE, 'page', 'page up and down'),
  ],
  browse: [
    b(PREV, 'prev', 'choose an exercise'),
    b(NEXT, 'nextItem', 'choose an exercise'),
    b('return', 'open', 'open it'),
    b('/', 'search', 'type a search'),
    b('v', 'level', 'filter by level'),
    b('f', 'status', 'filter by status'),
    b('m', 'time', 'filter by time'),
    b('p', 'path', 'choose a learning path'),
    b('*', 'bookmarked', 'only bookmarked exercises'),
    b('n', 'next', 'next on the path'),
    b(BACK, 'back', 'back'),
    b(PAGE, 'page', 'page up and down'),
  ],
  scroll: [b(SCROLL, 'scroll', 'scroll'), b([...BACK, 'return'], 'back', 'back')],
  doctor: [b(SCROLL, 'scroll', 'scroll'), b('r', 'again', 'check again'), b([...BACK, 'return'], 'back', 'back')],
  export: [b('m', 'markdown', 'save as Markdown'), b('j', 'json', 'save as JSON'), b([...BACK, 'return'], 'back', 'back')],
  exercise: [
    b(SCROLL, 'scroll', 'scroll'),
    b('t', 'checks', 'run the free checks; select one and press ⏎ for the requirement, the files and the full output'),
    b('c', 'copilot', "start Copilot in this level's folder; type /exit to come back (your checks run automatically)"),
    b('h', 'hint', 'reveal the next hint (for the milestone you are on)'),
    b('a', 'agent', '🤖 agent check: the real Copilot on a copy of your folder (uses AI credits; c cancels)'),
    b('i', 'bring', '🧳 bring your own harness forward from the earlier levels you passed (your files are backed up first)'),
    b('v', 'changes', '📝 view your changes since your latest commit, file by file'),
    b('m', 'more', 'more: watch, guide, compare, bring, your changes, bookmark, start over, history, doctor, export'),
    b('w', 'watch', 'watch: run the checks again every time you save a file'),
    b(['g', 'r'], 'guide', 'read the lab guide: concepts, under the hood, examples, links'),
    b('s', 'solution', 'compare your work with the reference solution'),
    b('x', 'recovery', 'start over: restore the starter, a checkpoint or a backup, or discard changes since your latest commit'),
    b('f', 'bookmark', 'bookmark this exercise'),
    b('H', 'history', 'agent run history'),
    b('o', 'open', 'open the folder'),
    b('y', 'copy', 'copy its cd command'),
    b('d', 'doctor', 'setup doctor'),
    b('e', 'export', 'export a learning summary'),
    b('n', 'next', "next up: on an easy level, the next lab's easy level; elsewhere your next unfinished level"),
    b(digits(1, 9), 'tier', 'switch tier'),
    b('/', 'search', 'search every exercise'),
    b(BACK, 'back', 'back to the lab'),
  ],
  menu: [
    b(PREV, 'prev', 'choose'),
    b(NEXT, 'nextItem', 'choose'),
    b('return', 'doIt', 'do it'),
    b(MENU_KEYS, 'item', 'the item with that key'),
    b(BACK, 'back', 'back'),
  ],
  checks: [
    b(PREV, 'prev', 'select a check'),
    b(NEXT, 'nextItem', 'select a check'),
    b(PAGE, 'page', 'page up and down'),
    b('return', 'details', 'details of the selected check'),
    b('t', 'again', 'run the checks again'),
    b('o', 'output', 'the full output'),
    b('w', 'watch', 'watch: run again on every save'),
    b('c', 'copilot', 'start Copilot here'),
    b('a', 'agent', 'agent check'),
    b('n', 'next', 'next up'),
    b('d', 'doctor', 'setup doctor'),
    b(BACK, 'back', 'back to the mission'),
  ],
  checksRunning: [b(['c', 'escape'], 'cancel', 'cancel the run')],
  checkDetail: [
    b(SCROLL, 'scroll', 'scroll'),
    b(['right', 'tab'], 'nextCheck', 'the next check'),
    b('left', 'prevCheck', 'the previous check'),
    b('h', 'hint', 'reveal the next hint'),
    b('o', 'output', 'the full output'),
    b('c', 'copilot', 'start Copilot here'),
    b('d', 'doctor', 'setup doctor'),
    b(['b', 'escape', 'backspace'], 'back', 'back to the results'),
  ],
  agent: [b(SCROLL, 'scroll', 'scroll'), b('a', 'again', 'run the agent check again'), b('H', 'history', 'agent run history'), b([...BACK, 'return'], 'back', 'back')],
  agentConfirm: [b('y', 'yes', 'run it (uses AI credits)'), b(['n', ...BACK], 'no', 'not now')],
  agentLoading: [b(['n', ...BACK], 'no', 'not now')],
  agentRunning: [b(['c', 'escape'], 'cancel', 'cancel the run')],
  history: [b(PREV, 'prev', 'choose a run'), b(NEXT, 'nextItem', 'choose a run'), b(PAGE, 'page', 'page up and down'), b('return', 'toggle', 'show or hide its details'), b(BACK, 'back', 'back')],
  confirmSolution: [b('y', 'show', 'show the comparison'), b('h', 'hint', 'a hint instead'), b(OTHER, 'back', 'back')],
  bring: [b(SCROLL, 'scroll', 'scroll'), b('y', 'yes', 'bring the files in', { exact: true }), b(['n', 'return', ...BACK], 'back', 'back')],
  solution: [
    b(['right', 'tab'], 'nextFile', 'the next file'),
    b('left', 'prevFile', 'the previous file'),
    b('r', 'toggle', 'the whole reference file, or the differences'),
    b(SCROLL, 'scroll', 'scroll'),
    b(['b', 'escape', 'backspace'], 'back', 'back'),
  ],
  changes: [
    b(['right', 'tab'], 'nextFile', 'the next file'),
    b('left', 'prevFile', 'the previous file'),
    b(SCROLL, 'scroll', 'scroll'),
    b(['b', 'escape', 'backspace', 'v'], 'back', 'back'),
  ],
  recovery: [
    b(PREV, 'prev', 'choose'),
    b(NEXT, 'nextItem', 'choose'),
    b(PAGE, 'page', 'page up and down'),
    b('return', 'restore', 'restore it (asks first)'),
    b('s', 'save', 'save a checkpoint'),
    b(BACK, 'back', 'back'),
  ],
  recoveryConfirm: [b('y', 'yes', 'yes, restore', { exact: true }), b(OTHER, 'keep', 'keep my work')],
  recoveryResult: [b([...BACK, 'return'], 'back', 'back')],
};

/** The binding a key press means on a screen (a key state), or null. */
export function binding(screen, name, str) {
  const list = KEYMAP[screen] ?? [];
  const exact = NAMED.has(name) ? name : typeof str === 'string' && str.length === 1 ? str : name;
  return list.find((x) => x.keys.includes(exact))
    ?? (exact !== name ? list.find((x) => !x.exact && x.keys.includes(name)) : null)
    ?? list.find((x) => x.keys.includes(OTHER))
    ?? null;
}

/** Keys with more than one meaning on a screen: [{ screen, key, ids }]. The global keys count on every screen. */
export function collisions() {
  const out = [];
  for (const [screen, list] of Object.entries(KEYMAP)) {
    const seen = new Map();
    const add = (key, id) => seen.set(key, [...(seen.get(key) ?? []), id]);
    for (const x of [...list, ...GLOBAL]) for (const k of x.keys) add(k, x.id);
    for (const r of RESERVED[screen] ?? []) add(r.key, 'reserved');
    for (const [key, ids] of seen) if (ids.length > 1) out.push({ screen, key, ids });
  }
  return out;
}

/** The keys of one binding ("guide" → ['g', 'r']). */
export const keysOf = (screen, id) => (KEYMAP[screen] ?? []).find((x) => x.id === id)?.keys ?? [];
