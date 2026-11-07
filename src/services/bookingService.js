import { AppError } from '../errors.js';
import { parseInstant, requireString, parseId } from '../validation.js';

const MINUTE = 60_000;

const toDto = (r) => ({
  id: r.id,
  roomId: r.room_id,
  roomName: r.room_name,
  employeeId: r.employee_id,
  employeeName: r.employee_name,
  title: r.title,
  start: new Date(r.start_ms).toISOString(),
  end: new Date(r.end_ms).toISOString(),
});

const SELECT = `
  SELECT b.*, r.name AS room_name, e.name AS employee_name
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  JOIN employees e ON e.id = b.employee_id`;

/**
 * Procura reunião da sala que se sobreponha ao intervalo [startMs, endMs).
 * Reuniões "encostadas" (uma termina exatamente quando a outra começa) NÃO conflitam.
 */
function findConflict(db, roomId, startMs, endMs, ignoreBookingId = null) {
  return db
    .prepare(
      `${SELECT}
       WHERE b.room_id = ? AND b.start_ms < ? AND b.end_ms > ? AND b.id != ?
       ORDER BY b.start_ms LIMIT 1`
    )
    .get(roomId, endMs, startMs, ignoreBookingId ?? -1);
}

function conflictError(c) {
  return new AppError(
    409,
    'BOOKING_CONFLICT',
    `Já existe uma reunião nesse horário nesta sala ("${c.title}", ${new Date(c.start_ms).toISOString()} → ${new Date(c.end_ms).toISOString()})`
  );
}

export function createBooking(db, now, user, input) {
  const roomId = parseId(input.roomId, 'roomId');
  const title = requireString(input.title, 'title');
  const startMs = parseInstant(input.start, 'start');
  const endMs = parseInstant(input.end, 'end');

  if (endMs <= startMs) throw new AppError(400, 'VALIDATION_ERROR', '"end" deve ser depois de "start"');

  // RN3: somente do dia/horário atual (minuto corrente) para frente.
  const nowMinute = Math.floor(now() / MINUTE) * MINUTE;
  if (startMs < nowMinute) {
    throw new AppError(422, 'PAST_DATE_NOT_ALLOWED', 'Não é permitido agendar para datas/horários passados');
  }

  if (!db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) {
    throw new AppError(404, 'ROOM_NOT_FOUND', 'Sala não encontrada');
  }

  // RN4: sem sobreposição. (RN1: nenhuma validação de duração máxima.)
  // node:sqlite é síncrono e o Node é single-thread: verificação + insert são atômicos.
  const conflict = findConflict(db, roomId, startMs, endMs);
  if (conflict) throw conflictError(conflict);

  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO bookings (room_id, employee_id, title, start_ms, end_ms, created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(roomId, user.id, title, startMs, endMs, now());
  return getBooking(db, Number(lastInsertRowid));
}

export function getBooking(db, id) {
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(id);
  if (!row) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Reunião não encontrada');
  return toDto(row);
}

export function listBookings(db, query = {}) {
  const where = [];
  const params = [];
  if (query.roomId !== undefined) {
    where.push('b.room_id = ?');
    params.push(parseId(query.roomId, 'roomId'));
  }
  if (query.employeeId !== undefined) {
    where.push('b.employee_id = ?');
    params.push(parseId(query.employeeId, 'employeeId'));
  }
  // from/to: retorna reuniões que se sobreponham à janela [from, to)
  if (query.from !== undefined) {
    where.push('b.end_ms > ?');
    params.push(parseInstant(query.from, 'from'));
  }
  if (query.to !== undefined) {
    where.push('b.start_ms < ?');
    params.push(parseInstant(query.to, 'to'));
  }
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.start_ms`;
  return db.prepare(sql).all(...params).map(toDto);
}

function assertCanManage(user, booking) {
  if (user.role !== 'admin' && booking.employee_id !== user.id) {
    throw new AppError(403, 'FORBIDDEN', 'Somente o organizador da reunião (ou um admin) pode alterá-la');
  }
}

/** RN2: estende o fim da reunião se não houver outra reunião no intervalo estendido. */
export function extendBooking(db, now, user, id, input) {
  const bookingId = parseId(id);
  const newEndMs = parseInstant(input.end, 'end');

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Reunião não encontrada');
  assertCanManage(user, booking);

  if (booking.end_ms <= now()) {
    throw new AppError(422, 'BOOKING_ALREADY_ENDED', 'Não é possível estender uma reunião que já terminou');
  }
  if (newEndMs <= booking.end_ms) {
    throw new AppError(400, 'VALIDATION_ERROR', 'O novo "end" deve ser posterior ao fim atual da reunião');
  }

  const conflict = findConflict(db, booking.room_id, booking.end_ms, newEndMs, booking.id);
  if (conflict) throw conflictError(conflict);

  db.prepare('UPDATE bookings SET end_ms = ? WHERE id = ?').run(newEndMs, bookingId);
  return getBooking(db, bookingId);
}

export function cancelBooking(db, user, id) {
  const bookingId = parseId(id);
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Reunião não encontrada');
  assertCanManage(user, booking);
  db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
}
