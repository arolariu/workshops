import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listen } from './server.mjs';
import { createApp } from './handlers.mjs';
import { createStore } from './store.mjs';
import { seedData } from './seed.mjs';

const now = () => new Date('2026-11-02T08:00:00Z');

test('the server answers on 127.0.0.1 and stops cleanly', async () => {
  const app = createApp({ store: createStore({ ...seedData(), now }), apiKey: 'server-test-key', now, log: () => {} });
  const { url, close } = await listen({ app, port: 0, maxBody: 1024 });
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const health = await fetch(`${url}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const send = (body, key = 'server-test-key') => fetch(`${url}/api/bookings`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key }, body,
    });
    const booking = { roomId: 'LIB-310', title: 'Thesis check-in', bookedBy: 'mihai.radu@campus.example', start: '2026-11-03T10:00:00Z', end: '2026-11-03T10:30:00Z', attendees: 2 };
    assert.equal((await send(JSON.stringify(booking))).status, 201);
    const bad = await send('{"roomId": ');
    assert.deepEqual([bad.status, (await bad.json()).error], [400, 'invalid-json']);
    assert.equal((await send(JSON.stringify({ ...booking, title: 'x'.repeat(2000) }))).status, 413);

    const page = await fetch(`${url}/events`);
    assert.match(page.headers.get('content-type'), /^text\/html/);
  } finally {
    await close();
  }
});
