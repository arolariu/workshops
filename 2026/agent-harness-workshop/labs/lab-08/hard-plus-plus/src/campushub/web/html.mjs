// Safe HTML building: html`…` escapes every value it is given, unless the value is already safe HTML.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** A string that is already HTML, so html`…` puts it in as it is. */
export class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Text made safe to put between tags or inside a quoted attribute. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Marks trusted markup (never user input) as safe. */
export const raw = (markup) => new SafeHtml(String(markup));

const render = (v) => {
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(v);
};

/** Tagged template: html`<p>${name}</p>` escapes `name`; lists are joined; null, undefined and false vanish. */
export function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));
}
