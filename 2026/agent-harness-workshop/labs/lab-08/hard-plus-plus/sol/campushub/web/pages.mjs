// Server-rendered pages: pure functions from the API's data to HTML strings. Every value goes through html`…`,
// which escapes by default, so a room name or an event title can never add markup to a page.
import { html, raw } from './html.mjs';
import { formatDay, formatRange, formatTime } from './format.mjs';

const STYLE = 'body{font:16px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:48rem;padding:0 1rem}'
  + 'table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.4rem;text-align:left}'
  + '.tag{background:#eef;border-radius:.3rem;margin-right:.3rem;padding:0 .4rem}.empty{color:#666}';
const byStart = (a, b) => Date.parse(a.start) - Date.parse(b.start);

/** A whole page around `body` (safe HTML). */
export function layout({ title, body }) {
  return String(html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · CampusHub</title>
<style>${raw(STYLE)}</style>
</head>
<body>
<nav><a href="/">Rooms</a> · <a href="/events">Events</a> · <a href="/board">Today</a></nav>
<main>
<h1>${title}</h1>
${body}
</main>
</body>
</html>
`);
}

/** Every room with its seats, features and access. `building` names the filter that was applied, if any. */
export function roomsPage(rooms, { building } = {}) {
  const rows = rooms.map((r) => html`<tr><td><a href="/rooms/${encodeURIComponent(r.id)}">${r.name}</a></td><td>${r.building}</td><td>${r.capacity}</td><td>${r.features.join(', ')}</td><td>${r.stepFree ? 'Step-free' : 'Stairs only'}</td></tr>`);
  const body = rooms.length
    ? html`<table><thead><tr><th>Room</th><th>Building</th><th>Seats</th><th>Features</th><th>Access</th></tr></thead><tbody>${rows}</tbody></table>`
    : html`<p class="empty">No rooms match.</p>`;
  return layout({ title: building ? `Rooms in ${building}` : 'Rooms', body });
}

/** One room and its confirmed bookings that haven't ended by `now`, grouped by day; `free` ({ date, slots }) adds its free time. */
export function roomPage(room, bookings, { now = new Date(), free } = {}) {
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && Date.parse(b.end) > now.getTime()).sort(byStart);
  const days = Map.groupBy(upcoming, (b) => formatDay(b.start));
  const schedule = upcoming.length
    ? [...days].map(([day, list]) => html`<h2>${day}</h2><ul>${list.map((b) => html`<li>${formatTime(b.start)}–${formatTime(b.end)} ${b.title} (${b.attendees} people)</li>`)}</ul>`)
    : html`<p class="empty">No upcoming bookings.</p>`;
  const slots = free?.slots.map((s) => `${formatTime(s.start)}–${formatTime(s.end)}`).join(', ');
  const freeTime = free ? html`<h2>Free on ${formatDay(`${free.date}T00:00:00Z`)}</h2>\n<p>${slots || 'Fully booked.'}</p>\n` : '';
  const access = room.stepFree ? 'step-free access' : 'stairs only';
  return layout({ title: room.name, body: html`<p>${room.building} · ${room.capacity} seats · ${access}</p>\n${freeTime}${schedule}` });
}

/** The porters' screen: per building, what is on now and what comes next today. */
export function boardPage(rooms, bookings, { now = new Date() } = {}) {
  const t = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const nameOf = new Map(rooms.map((r) => [r.id, r.name]));
  const live = bookings.filter((b) => b.status === 'confirmed' && b.start.startsWith(today) && Date.parse(b.end) > t).sort(byStart);
  const line = (label, b) => html`<p>${label}: ${formatTime(b.start)}–${formatTime(b.end)} ${b.title} (${nameOf.get(b.roomId) ?? b.roomId})</p>`;
  const sections = [...new Set(rooms.map((r) => r.building))].sort().map((building) => {
    const mine = live.filter((b) => rooms.some((r) => r.id === b.roomId && r.building === building));
    const onNow = mine.filter((b) => Date.parse(b.start) <= t);
    const next = mine.filter((b) => Date.parse(b.start) > t).slice(0, 3);
    return html`<h2>${building}</h2>
${onNow.length ? onNow.map((b) => line('Now', b)) : html`<p>Nothing on now.</p>`}
${next.length ? next.map((b) => line('Next', b)) : html`<p>Nothing else today.</p>`}
`;
  });
  return layout({ title: `Today, ${formatDay(now.toISOString())}`, body: html`${sections}` });
}

/** Public events that haven't ended by `now`, soonest first; a cancelled event stays listed, struck through. */
export function eventsPage(events, { now = new Date() } = {}) {
  const upcoming = events.filter((e) => Date.parse(e.end) > now.getTime()).sort(byStart);
  const items = upcoming.map((e) => {
    const title = e.status === 'cancelled' ? html`<s>${e.title}</s> <strong>Cancelled</strong>` : html`<strong>${e.title}</strong>`;
    const tags = e.tags.length ? html`<br>${e.tags.map((t) => html`<span class="tag">${t}</span>`)}` : '';
    return html`<li>${title}<br>${formatRange(e.start, e.end)} · ${e.roomName}<br>${e.description}${tags}</li>`;
  });
  const body = upcoming.length ? html`<ul class="events">${items}</ul>` : html`<p class="empty">No upcoming events.</p>`;
  return layout({ title: 'Events', body });
}

/** A page for a request that went wrong (404, 400). */
export function errorPage(status, message) {
  return layout({ title: status === 404 ? 'Not found' : 'Something is wrong', body: html`<p>${message}</p>\n<p><a href="/">Back to the rooms</a></p>` });
}
