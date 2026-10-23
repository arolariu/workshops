import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creditSummary, meterLine } from '../credits.mjs';

const suite = (startedAt, cases) => ({
  startedAt,
  budget: { cases: cases.map((c) => ({ configuredCap: c.cap ?? null })) },
  cases: cases.map(({ cap: _cap, ...c }) => ({ startedAt, status: 'pass', exitCode: null, ...c })),
});
const NOW = new Date(2026, 10, 20, 12);
const at = (m, d) => new Date(2026, m, d, 10).toISOString();

test('counts the runs that started Copilot this month and adds up their verified caps', () => {
  const runs = [
    suite(at(10, 3), [{ launched: true, cap: 30 }, { launched: true, cap: 30 }, { cap: 30, status: 'blocked' }]),
    suite(at(10, 19), [{ launched: true, cap: null }]),
    suite(at(9, 30), [{ launched: true, cap: 30 }]),
    suite(at(10, 5), [{ exitCode: 0, cap: 30 }]),
    { runId: 'x', state: 'unreadable', cases: [], startedAt: null },
  ];
  assert.deepEqual(creditSummary(runs, { now: NOW }), { runs: 4, capped: 3, uncapped: 1, bound: 90 });
  assert.deepEqual(creditSummary([], { now: NOW }), { runs: 0, capped: 0, uncapped: 0, bound: 0 });
});

test('the meter never estimates: runs, an upper bound, and where the real number is', () => {
  assert.equal(meterLine({ runs: 6, capped: 6, uncapped: 0, bound: 180 }), '💳 6 agent-check runs this month · at most 180 credits · /usage has the real number');
  assert.equal(meterLine({ runs: 1, capped: 1, uncapped: 0, bound: 30 }), '💳 1 agent-check run this month · at most 30 credits · /usage has the real number');
  assert.equal(meterLine({ runs: 4, capped: 3, uncapped: 1, bound: 90 }), '💳 4 agent-check runs this month · at most 90 credits for 3 of them; 1 had no cap the app could verify · /usage has the real number');
  assert.equal(meterLine({ runs: 2, capped: 0, uncapped: 2, bound: 0 }), '💳 2 agent-check runs this month · no cap the app could verify · /usage has the real number');
  assert.equal(meterLine({ runs: 0, capped: 0, uncapped: 0, bound: 0 }), '💳 No agent-check runs this month · the free checks never spend credits');
});
