import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, html, raw } from './html.mjs';
import { formatDay, formatRange, formatTime } from './format.mjs';

test('escapeHtml escapes the five characters that matter', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(42), '42');
});

test('html`` escapes values, keeps safe HTML and joins lists', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<p>${name}</p>`), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(String(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(String(html`<p>${raw('<b>ok</b>')}${null}${undefined}${false}${0}</p>`), '<p><b>ok</b>0</p>');
});

test('times are shown in UTC, whatever the machine', () => {
  assert.equal(formatDay('2026-11-03T09:00:00Z'), 'Tue 3 Nov');
  assert.equal(formatTime('2026-11-03T09:05:00Z'), '09:05');
  assert.equal(formatDay('2026-11-03T23:45:00Z'), 'Tue 3 Nov');
  assert.equal(formatRange('2026-11-03T09:00:00Z', '2026-11-03T11:00:00Z'), 'Tue 3 Nov, 09:00–11:00');
});
