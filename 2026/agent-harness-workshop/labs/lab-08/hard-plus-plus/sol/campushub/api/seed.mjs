// Demo data for the week of Monday 2 November 2026: what `npm start` serves and what the nightly digest reads in
// this copy of CampusHub. Production loads the same shapes from the campus database. All times are UTC.

const ROOMS = [
  { id: 'LIB-201', name: 'Library seminar room 2', building: 'Library', capacity: 24, features: ['projector', 'whiteboard'], stepFree: true },
  { id: 'LIB-310', name: 'Library quiet study pod', building: 'Library', capacity: 6, features: ['whiteboard'], stepFree: true },
  { id: 'ENG-101', name: 'Engineering lecture hall', building: 'Engineering', capacity: 120, features: ['projector', 'microphone', 'recording'], stepFree: true },
  { id: 'ENG-214', name: 'Robotics lab', building: 'Engineering', capacity: 18, features: ['projector', 'workbenches'], stepFree: false },
  { id: 'SU-G05', name: 'Student Union hall', building: 'Student Union', capacity: 200, features: ['microphone', 'stage'], stepFree: true },
  { id: 'SU-112', name: 'Student Union meeting room', building: 'Student Union', capacity: 12, features: ['screen'], stepFree: true },
];

const at = (day, time) => `2026-11-${day}T${time}:00.000Z`;
const BOOKINGS = [
  { id: 'bk-1001', roomId: 'LIB-201', title: 'Algorithms study group', bookedBy: 'ana.pop@campus.example', start: at('03', '09:00'), end: at('03', '11:00'), attendees: 8, status: 'confirmed', createdAt: '2026-10-26T12:04:00.000Z' },
  { id: 'bk-1002', roomId: 'ENG-101', title: 'Guest lecture: designing accessible campuses', bookedBy: 'events@campus.example', start: at('03', '14:00'), end: at('03', '16:00'), attendees: 110, status: 'confirmed', createdAt: '2026-10-12T08:30:00.000Z' },
  { id: 'bk-1003', roomId: 'SU-G05', title: 'Robotics Club demo night', bookedBy: 'robotics@campus.example', start: at('03', '17:00'), end: at('03', '20:00'), attendees: 150, status: 'confirmed', createdAt: '2026-10-20T16:45:00.000Z' },
  { id: 'bk-1004', roomId: 'LIB-310', title: 'Thesis check-in', bookedBy: 'mihai.radu@campus.example', start: at('03', '10:00'), end: at('03', '10:30'), attendees: 2, status: 'cancelled', createdAt: '2026-10-29T09:10:00.000Z', cancelledAt: '2026-11-01T18:20:00.000Z' },
  { id: 'bk-1005', roomId: 'ENG-214', title: 'Robotics lab induction', bookedBy: 'lab.staff@campus.example', start: at('04', '08:00'), end: at('04', '09:30'), attendees: 12, status: 'confirmed', createdAt: '2026-10-28T14:00:00.000Z' },
  { id: 'bk-1006', roomId: 'SU-112', title: 'Debate society committee', bookedBy: 'debate@campus.example', start: at('02', '18:00'), end: at('02', '19:00'), attendees: 7, status: 'confirmed', createdAt: '2026-10-30T11:25:00.000Z' },
];

const EVENTS = [
  { id: 'ev-201', bookingId: 'bk-1002', title: 'Guest lecture: designing accessible campuses', description: 'An architect walks through the new step-free routes between the Library and Engineering.', tags: ['talk', 'accessibility'] },
  { id: 'ev-202', bookingId: 'bk-1003', title: 'Robotics Club demo night', description: 'Line followers, a sumo ring and free pizza. Everyone is welcome.', tags: ['club', 'robotics'] },
];

/** Fresh copies of the demo data ({ rooms, bookings, events }), so a caller may change them freely. */
export function seedData() {
  return structuredClone({ rooms: ROOMS, bookings: BOOKINGS, events: EVENTS });
}
