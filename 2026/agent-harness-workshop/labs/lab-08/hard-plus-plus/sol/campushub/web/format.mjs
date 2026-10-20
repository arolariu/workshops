// Dates and times as people on campus read them. Everything is UTC and spelled out by hand (no Intl), so a page
// looks the same on every server, whatever its time zone or ICU data.
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');

/** 'Tue 3 Nov' */
export function formatDay(iso) {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** '09:00' */
export function formatTime(iso) {
  const d = new Date(iso);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/** 'Tue 3 Nov, 09:00–11:00' (bookings never cross midnight) */
export function formatRange(start, end) {
  return `${formatDay(start)}, ${formatTime(start)}–${formatTime(end)}`;
}
