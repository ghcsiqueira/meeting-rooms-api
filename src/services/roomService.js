import { AppError } from '../errors.js';
import { requireString, requireInt, parseId } from '../validation.js';

/** Lista salas já indicando se estão em uso agora e qual a próxima reunião. */
export function listRooms(db, now) {
  const t = now();
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY name').all();
  const current = db.prepare(
    `SELECT b.*, e.name AS employee_name FROM bookings b JOIN employees e ON e.id = b.employee_id
     WHERE b.room_id = ? AND b.start_ms <= ? AND b.end_ms > ? LIMIT 1`
  );
  const next = db.prepare(
    `SELECT b.*, e.name AS employee_name FROM bookings b JOIN employees e ON e.id = b.employee_id
     WHERE b.room_id = ? AND b.start_ms > ? ORDER BY b.start_ms LIMIT 1`
  );
  const brief = (b) =>
    b
      ? {
          id: b.id,
          title: b.title,
          employeeName: b.employee_name,
          start: new Date(b.start_ms).toISOString(),
          end: new Date(b.end_ms).toISOString(),
        }
      : null;
  return rooms.map((r) => {
    const c = current.get(r.id, t, t);
    return {
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      inUse: Boolean(c),
      currentBooking: brief(c),
      nextBooking: brief(next.get(r.id, t)),
    };
  });
}

export function createRoom(db, now, input) {
  const name = requireString(input.name, 'name', { max: 100 });
  const capacity = requireInt(input.capacity, 'capacity');
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO rooms (name, capacity, created_at) VALUES (?,?,?)')
      .run(name, capacity, now());
    return { id: Number(lastInsertRowid), name, capacity };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      throw new AppError(409, 'ROOM_ALREADY_EXISTS', 'Já existe uma sala com esse nome');
    }
    throw e;
  }
}
