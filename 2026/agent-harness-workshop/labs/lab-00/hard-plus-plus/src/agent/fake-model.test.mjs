// The fake model and its scenarios are fixtures, so they have tests of their own: every scenario is valid, the model
// answers the same request the same way every time, and it finds its place from the history alone (spec §5.10).
// Run: node --test agent/fake-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fakeModel, loadScenario, validateScenario, callId } from './fake-model.mjs';

const dir = new URL('./scenarios/', import.meta.url);
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const scenario = (name) => loadScenario(new URL(`${name}.json`, dir));
const tools = (...names) => names.map((name) => ({ type: 'function', function: { name, description: name, parameters: { type: 'object' } } }));
const start = (s) => [{ role: 'system', content: 'You are a test.' }, { role: 'user', content: s.prompt }];

test('the six scenarios are there, and every one is valid', () => {
  for (const f of ['answer.json', 'budget.json', 'denied.json', 'loop.json', 'malformed.json', 'tool-call.json']) assert.ok(names.includes(f), `${f} is missing`);
  for (const f of names) {
    const s = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(validateScenario(s), [], f);
    assert.equal(`${s.name}.json`, f, `${f}: the name matches the file`);
  }
});

test('broken scenarios are caught', () => {
  const ok = { name: 'x', about: 'x', prompt: 'p', steps: [{ say: 'hi' }] };
  assert.deepEqual(validateScenario(ok), []);
  assert.ok(validateScenario({ ...ok, prompt: '' }).length);
  assert.ok(validateScenario({ ...ok, steps: [] }).length);
  assert.ok(validateScenario({ ...ok, steps: [{ say: 'done' }, { say: 'never' }] }).length, 'a step after a final answer');
  assert.ok(validateScenario({ ...ok, steps: [{ say: 'a', repeat: true }] }).length, 'repeat without calls');
  assert.ok(validateScenario({ ...ok, steps: [{ expect: { resultIncludes: 'x' }, say: 'a' }] }).length, 'expect on the first step');
  assert.ok(validateScenario({ ...ok, steps: [{ calls: [{ name: 'view', arguments: {} }] }, { say: 'a' }] }).length, 'arguments must be JSON text');
  assert.ok(validateScenario({ ...ok, run: { maxTurns: 0 } }).length);
});

test('the same request gets the same answer, every time', async () => {
  for (const f of names) {
    const s = scenario(f.replace('.json', ''));
    const request = { messages: start(s), tools: tools('view', 'glob', 'edit', 'bash') };
    const a = await fakeModel(s).complete(request);
    const b = await fakeModel(s).complete(structuredClone(request));
    assert.deepEqual(a, b, f);
    assert.ok(a.usage.inputTokens > 0 && a.usage.outputTokens > 0, `${f}: usage`);
  }
});

test('it is stateless: the history it is sent decides the step', async () => {
  const s = scenario('tool-call');
  const model = fakeModel(s);
  const first = await model.complete({ messages: start(s), tools: tools('view') });
  assert.deepEqual(first.message.tool_calls.map((c) => c.id), [callId(0, 0), callId(0, 1)]);
  const again = await model.complete({ messages: start(s), tools: tools('view') });
  assert.deepEqual(again, first, 'without the history it starts over');
  const results = first.message.tool_calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: s.files[JSON.parse(c.function.arguments).path] }));
  const second = await model.complete({ messages: [...start(s), first.message, ...results], tools: tools('view') });
  assert.equal(second.message.tool_calls.length, 0);
  assert.equal(second.message.content, s.steps[1].say);
  assert.ok(second.usage.inputTokens > first.usage.inputTokens, 'a longer history costs more input tokens');
});

test('it complains, instead of playing along, when the loop gets something wrong', async () => {
  const s = scenario('tool-call');
  const model = fakeModel(s);
  const first = await model.complete({ messages: start(s), tools: tools('view') });
  const noResults = await model.complete({ messages: [...start(s), first.message], tools: tools('view') });
  assert.match(noResults.message.content, /^\[fake model\] I never got the result of call_0_0, call_0_1/);
  const wrong = first.message.tool_calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: 'nothing here' }));
  const unexpected = await model.complete({ messages: [...start(s), first.message, ...wrong], tools: tools('view') });
  assert.match(unexpected.message.content, /^\[fake model\] I expected the result/);
  const noTools = await model.complete({ messages: start(s), tools: [] });
  assert.match(noTools.message.content, /^\[fake model\] I can't call view/);
  const noSystem = await model.complete({ messages: start(s).slice(1), tools: tools('view') });
  assert.match(noSystem.message.content, /^\[fake model\] the first message should be your system prompt/);
});

test('a repeating step repeats forever, with new call ids', async () => {
  const s = scenario('loop');
  const model = fakeModel(s);
  let messages = start(s);
  for (let k = 0; k < 5; k++) {
    const { message } = await model.complete({ messages, tools: tools('view') });
    assert.equal(message.tool_calls[0].id, callId(k, 0));
    messages = [...messages, message, { role: 'tool', tool_call_id: message.tool_calls[0].id, content: s.files['grades.js'] }];
  }
});
