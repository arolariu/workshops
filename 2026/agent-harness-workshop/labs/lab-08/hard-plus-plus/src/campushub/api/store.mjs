// The in-memory store behind the API: rooms, bookings, and the public events published for bookings.
// Production swaps it for the campus database; the API only uses the methods createStore() returns.
import { freeSlots } from './availability.mjs';
import { ApiError } from './errors.mjs';
import { validateBooking, validateEvent } from './validate.mjs';

/** Do two time ranges overlap? Ranges are half-open, so a booking may start when the one before it ends. */
export function overlaps(a, b) {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

const byId = (a, b) => a.id.localeCompare(b.id);
const byStart = (a, b) => Date.parse(a.start) - Date.parse(b.start) || byId(a, b);
const nextNumber = (items) => Math.max(0, ...items.map((x) => Number(String(x.id).split('-')[1]) || 0)) + 1;
const copy = (x) => (x ? structuredClone(x) : null);

/** A store over copies of the given data. `now` decides what is in the past (tests pass a fixed clock). */
export function createStore({ rooms = [], bookings = [], events = [], now = () => new Date() } = {}) {
  const state = structuredClone({ rooms, bookings, events });
  let bookingNo = nextNumber(state.bookings);
  let eventNo = nextNumber(state.events);
  const room = (id) => state.rooms.find((r) => r.id === id);
  const booking = (id) => state.bookings.find((b) => b.id === id);
  const invalid = (errors) => new ApiError(400, 'invalid', 'Some fields are not valid.', errors);
  const noBooking = (id) => new ApiError(404, 'booking-not-found', `There is no booking ${id}.`);

  // An event has no room or time of its own: it shows its booking's, and is cancelled when the booking is.
  const joinEvent = (e) => {
    const b = booking(e.bookingId);
    return { ...copy(e), roomId: b.roomId, roomName: room(b.roomId)?.name ?? b.roomId, start: b.start, end: b.end, status: b.status === 'cancelled' ? 'cancelled' : 'scheduled' };
  };

  return {
    listRooms({ building, minCapacity, feature } = {}) {
      return state.rooms
        .filter((r) => !building || r.building.toLowerCase() === building.toLowerCase())
        .filter((r) => minCapacity === undefined || r.capacity >= minCapacity)
        .filter((r) => !feature || r.features.includes(feature.toLowerCase()))
        .sort(byId).map(copy);
    },

    getRoom: (id) => copy(room(id)),

    listBookings({ roomId, date, status } = {}) {
      return state.bookings
        .filter((b) => (!roomId || b.roomId === roomId) && (!date || b.start.startsWith(date)) && (!status || b.status === status))
        .sort(byStart).map(copy);
    },

    getBooking: (id) => copy(booking(id)),

    /** The free ranges in one room on `date` (YYYY-MM-DD): { roomId, date, slots }. */
    availability(roomId, date) {
      if (!room(roomId)) throw new ApiError(404, 'room-not-found', `There is no room ${roomId}.`);
      return { roomId, date, slots: freeSlots(state.bookings.filter((b) => b.roomId === roomId), date) };
    },

    createBooking(input) {
      const { value, errors } = validateBooking(input);
      if (errors.length) throw invalid(errors);
      const r = room(value.roomId);
      if (!r) throw new ApiError(404, 'room-not-found', `There is no room ${value.roomId}.`);
      if (value.attendees > r.capacity) throw new ApiError(422, 'over-capacity', `${r.name} holds ${r.capacity} people, not ${value.attendees}.`);
      if (Date.parse(value.start) < now().getTime()) throw new ApiError(422, 'in-the-past', 'A booking cannot start in the past.');
      const clash = state.bookings.find((b) => b.roomId === r.id && b.status === 'confirmed' && overlaps(b, value));
      if (clash) {
        throw new ApiError(409, 'conflict', `${r.name} is already booked from ${clash.start} to ${clash.end}.`, { bookingId: clash.id, start: clash.start, end: clash.end });
      }
      const created = { id: `bk-${bookingNo++}`, ...value, status: 'confirmed', createdAt: now().toISOString() };
      state.bookings.push(created);
      return copy(created);
    },

    cancelBooking(id) {
      const b = booking(id);
      if (!b) throw noBooking(id);
      if (b.status === 'cancelled') throw new ApiError(409, 'already-cancelled', `Booking ${id} is already cancelled.`);
      if (Date.parse(b.start) <= now().getTime()) throw new ApiError(409, 'already-started', `Booking ${id} has already started.`);
      Object.assign(b, { status: 'cancelled', cancelledAt: now().toISOString() });
      return copy(b);
    },

    /** Events that haven't finished by `from` (default: now) and start before `to`, soonest first. */
    listEvents({ from = now().toISOString(), to } = {}) {
      return state.events.map(joinEvent)
        .filter((e) => Date.parse(e.end) > Date.parse(from) && (!to || Date.parse(e.start) < Date.parse(to)))
        .sort(byStart);
    },

    createEvent(input) {
      const { value, errors } = validateEvent(input);
      if (errors.length) throw invalid(errors);
      const b = booking(value.bookingId);
      if (!b) throw noBooking(value.bookingId);
      if (b.status === 'cancelled') throw new ApiError(409, 'booking-cancelled', `Booking ${b.id} is cancelled.`);
      if (state.events.some((e) => e.bookingId === b.id)) throw new ApiError(409, 'duplicate-event', `Booking ${b.id} already has an event.`);
      const created = { id: `ev-${eventNo++}`, ...value };
      state.events.push(created);
      return joinEvent(created);
    },
  };
}
