// The CampusHub app: JSON under /api, server-rendered pages everywhere else. createApp() turns a request into a
// response without touching a socket, so the tests call it directly; server.mjs puts it on the network.
import crypto from 'node:crypto';
import { ApiError } from './errors.mjs';
import { parseQuery } from './validate.mjs';
import { boardPage, errorPage, eventsPage, roomPage, roomsPage } from '../web/pages.mjs';

const ROOM_QUERY = { building: 'text', minCapacity: 'count', feature: 'text' };
const BOOKING_QUERY = { roomId: 'text', date: 'date', status: ['confirmed', 'cancelled'] };
const EVENT_QUERY = { from: 'instant', to: 'instant' };

const json = (status, body) => ({ status, type: 'json', body });
const page = (status, body) => ({ status, type: 'html', body });
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

/**
 * `apiKey` guards every write (header `x-api-key`); without one the app is read-only. `log` gets one line per
 * request: method, path and status. Never the query, the headers or the body, so the key can't end up in a log.
 */
export function createApp({ store, apiKey = '', now = () => new Date(), log = () => {} }) {
  const query = (params, spec) => {
    const { value, errors } = parseQuery(params, spec);
    if (errors.length) throw new ApiError(400, 'invalid', 'Some query parameters are not valid.', errors);
    return value;
  };
  const authorise = (headers) => {
    if (!apiKey) throw new ApiError(503, 'writes-disabled', 'This server has no API key, so it is read-only.');
    const given = headers['x-api-key'];
    if (!given || !crypto.timingSafeEqual(digest(given), digest(apiKey))) throw new ApiError(401, 'unauthorized', 'Send a valid x-api-key header.');
  };
  const found = (thing, what) => {
    if (!thing) throw new ApiError(404, 'not-found', `There is no ${what}.`);
    return thing;
  };
  const day = (q) => {
    const { date } = query(q, { date: 'date' });
    if (!date) throw new ApiError(400, 'invalid', 'Give a day, e.g. ?date=2026-11-03.', [{ field: 'date', message: 'A date is required.' }]);
    return date;
  };
  const today = () => now().toISOString().slice(0, 10);

  const routes = [
    ['GET', /^\/api\/health$/, () => json(200, { ok: true })],
    ['GET', /^\/api\/rooms$/, ({ q }) => json(200, { rooms: store.listRooms(query(q, ROOM_QUERY)) })],
    ['GET', /^\/api\/rooms\/([^/]+)$/, ({ id }) => json(200, { room: found(store.getRoom(id), `room ${id}`) })],
    ['GET', /^\/api\/rooms\/([^/]+)\/availability$/, ({ id, q }) => json(200, store.availability(id, day(q)))],
    ['GET', /^\/api\/bookings$/, ({ q }) => json(200, { bookings: store.listBookings(query(q, BOOKING_QUERY)) })],
    ['POST', /^\/api\/bookings$/, ({ req }) => (authorise(req.headers), json(201, { booking: store.createBooking(req.body) }))],
    ['POST', /^\/api\/bookings\/([^/]+)\/cancel$/, ({ id, req }) => (authorise(req.headers), json(200, { booking: store.cancelBooking(id) }))],
    ['GET', /^\/api\/events$/, ({ q }) => json(200, { events: store.listEvents(query(q, EVENT_QUERY)) })],
    ['POST', /^\/api\/events$/, ({ req }) => (authorise(req.headers), json(201, { event: store.createEvent(req.body) }))],
    ['GET', /^\/$/, ({ q }) => {
      const filter = query(q, ROOM_QUERY);
      return page(200, roomsPage(store.listRooms(filter), filter));
    }],
    ['GET', /^\/rooms\/([^/]+)$/, ({ id }) => {
      const room = found(store.getRoom(id), `room ${id}`);
      const bookings = store.listBookings({ roomId: id, status: 'confirmed' });
      return page(200, roomPage(room, bookings, { now: now(), free: store.availability(id, today()) }));
    }],
    ['GET', /^\/events$/, () => page(200, eventsPage(store.listEvents(), { now: now() }))],
    ['GET', /^\/board$/, () => page(200, boardPage(store.listRooms(), store.listBookings({ date: today(), status: 'confirmed' }), { now: now() }))],
  ];

  async function handle(req) {
    const { pathname, searchParams } = new URL(req.url, 'http://campushub.invalid');
    const api = /^\/api(\/|$)/.test(pathname);
    let res;
    try {
      const matches = routes.filter(([, re]) => re.test(pathname));
      const route = matches.find(([method]) => method === req.method);
      if (!route) {
        throw matches.length
          ? new ApiError(405, 'method-not-allowed', `${pathname} does not take ${req.method}.`)
          : new ApiError(404, 'not-found', `Nothing lives at ${pathname}.`);
      }
      const [, re, run] = route;
      const id = re.exec(pathname)[1];
      res = await run({ id: id === undefined ? undefined : decodeURIComponent(id), q: searchParams, req: { ...req, headers: req.headers ?? {} } });
    } catch (e) {
      const known = e instanceof ApiError ? e : e instanceof URIError ? new ApiError(400, 'invalid', 'The path is not valid.') : null;
      if (!known) {
        log(`${req.method} ${pathname} failed: ${e.name}`);
        res = api ? json(500, { error: 'internal', message: 'Something went wrong.' }) : page(500, errorPage(500, 'Something went wrong.'));
      } else {
        res = api ? json(known.status, { error: known.code, message: known.message, details: known.details }) : page(known.status, errorPage(known.status, known.message));
      }
    }
    log(`${req.method} ${pathname} → ${res.status}`);
    return res;
  }

  return { handle };
}
