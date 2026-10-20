// The nightly digest: what happens in every room on one day, for Facilities (cleaning rounds, heating, porters).
// buildDigest() is pure, data in and digest out; renderDigest() turns a digest into the plain text that is mailed.
export const OPEN_HOURS = 15;   // 07:00-22:00 UTC

const HOUR = 60 * 60 * 1000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');
const time = (iso) => { const d = new Date(iso); return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; };
const dayOf = (iso) => new Date(iso).toISOString().slice(0, 10);
const hoursOf = (b) => (Date.parse(b.end) - Date.parse(b.start)) / HOUR;
const round1 = (n) => Math.round(n * 10) / 10;
const byStart = (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The digest for `date` (YYYY-MM-DD, UTC): confirmed bookings, room use, public events, cancellations, idle rooms. */
export function buildDigest({ rooms = [], bookings = [], events = [] }, { date }) {
  const onDay = bookings.filter((b) => dayOf(b.start) === date);
  const confirmed = onDay.filter((b) => b.status === 'confirmed').sort(byStart);
  const nameOf = (id) => rooms.find((r) => r.id === id)?.name ?? id;
  const busiest = [...new Set(confirmed.map((b) => b.roomId))].map((roomId) => {
    const mine = confirmed.filter((b) => b.roomId === roomId);
    const hours = round1(mine.reduce((sum, b) => sum + hoursOf(b), 0));
    return { roomId, name: nameOf(roomId), bookings: mine.length, hours, utilisation: Math.round((hours / OPEN_HOURS) * 100) };
  }).sort((a, b) => b.hours - a.hours || a.roomId.localeCompare(b.roomId));
  const dayEvents = events.flatMap((e) => {
    const b = confirmed.find((x) => x.id === e.bookingId);
    return b ? [{ id: e.id, title: e.title, roomId: b.roomId, start: b.start }] : [];
  }).sort(byStart);
  const cancellations = onDay.filter((b) => b.status === 'cancelled').map(({ id, roomId, title }) => ({ id, roomId, title }));
  return {
    date,
    totals: {
      bookings: confirmed.length,
      hours: round1(confirmed.reduce((sum, b) => sum + hoursOf(b), 0)),
      attendees: confirmed.reduce((sum, b) => sum + (b.attendees ?? 0), 0),
      cancelled: cancellations.length,
    },
    schedule: confirmed.map(({ id, roomId, title, start, end, attendees }) => ({ id, roomId, title, start, end, attendees })),
    busiest,
    idle: rooms.map((r) => r.id).filter((id) => !busiest.some((r) => r.roomId === id)).sort(),
    events: dayEvents,
    cancellations,
  };
}

/** The digest as plain text, one section per heading; empty sections are left out. */
export function renderDigest(digest) {
  const d = new Date(`${digest.date}T00:00:00Z`);
  const { bookings, hours, attendees, cancelled } = digest.totals;
  const lines = [
    `CampusHub nightly digest for ${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    `${plural(bookings, 'booking')}, ${hours} room-hours, ${plural(attendees, 'person', 'people')}, ${cancelled} cancelled`,
    '',
  ];
  const section = (title, rows) => { if (rows.length) lines.push(title, ...rows.map((r) => `  ${r}`), ''); };
  if (!bookings) lines.push('No bookings.', '');
  section('Schedule', digest.schedule.map((b) => `${time(b.start)}-${time(b.end)}  ${b.roomId.padEnd(9)}${b.title} (${b.attendees})`));
  section('Busiest rooms', digest.busiest.map((r) => `${r.roomId.padEnd(9)}${r.name.padEnd(28)}${r.hours} h ${String(r.utilisation).padStart(3)}%`));
  section('Public events', digest.events.map((e) => `${time(e.start)}  ${e.title} (${e.roomId})`));
  section('Cancelled', digest.cancellations.map((c) => `${c.id}  ${c.title} (${c.roomId})`));
  lines.push(`Idle rooms: ${digest.idle.length ? digest.idle.join(', ') : 'none'}`);
  return `${lines.join('\n')}\n`;
}
