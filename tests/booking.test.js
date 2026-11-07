// Testa as regras de negócio (RN1–RN4) direto na camada de serviço.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../src/schema.js';
import {
  createBooking, extendBooking, cancelBooking, listBookings,
} from '../src/services/bookingService.js';
import { createRoom, listRooms } from '../src/services/roomService.js';

const NOW = Date.parse('2026-11-10T12:00:30-03:00'); // 12:00:30 (30s já passados do minuto)
const now = () => NOW;
const alice = { id: 1, role: 'employee' };
const bob = { id: 2, role: 'employee' };
const admin = { id: 3, role: 'admin' };
let db;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  for (const [i, n] of [[1, 'alice'], [2, 'bob'], [3, 'adm']].entries()) {
    db.prepare("INSERT INTO employees (name,email,password_hash,role,created_at) VALUES (?,?,?,?,0)")
      .run(n[1], `${n[1]}@x.com`, 'x', n[1] === 'adm' ? 'admin' : 'employee');
  }
  createRoom(db, now, { name: 'Sala 1', capacity: 6 });
});

const book = (user, start, end, roomId = 1) =>
  createBooking(db, now, user, { roomId, title: 'Reunião', start, end });

test('agenda reunião válida', () => {
  const b = book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  assert.equal(b.start, '2026-11-10T17:00:00.000Z');
  assert.equal(b.employeeName, 'alice');
});

test('RN1: não há limite máximo de duração (reunião de 30 dias)', () => {
  assert.doesNotThrow(() => book(alice, '2026-11-11T08:00:00-03:00', '2026-12-11T08:00:00-03:00'));
});

test('RN3: rejeita data passada (422)', () => {
  assert.throws(() => book(alice, '2026-11-10T11:00:00-03:00', '2026-11-10T11:30:00-03:00'),
    (e) => e.status === 422 && e.code === 'PAST_DATE_NOT_ALLOWED');
  assert.throws(() => book(alice, '2026-11-09T14:00:00-03:00', '2026-11-09T15:00:00-03:00'),
    (e) => e.status === 422);
});

test('RN3: aceita começar no minuto atual', () => {
  assert.doesNotThrow(() => book(alice, '2026-11-10T12:00:00-03:00', '2026-11-10T13:00:00-03:00'));
});

test('RN4: rejeita sobreposição (409) em todos os cenários', () => {
  book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  const cases = [
    ['14:00', '15:00'], // idêntico
    ['13:30', '14:30'], // invade o início
    ['14:30', '15:30'], // invade o fim
    ['14:15', '14:45'], // dentro
    ['13:00', '16:00'], // envolve
  ];
  for (const [s, e] of cases) {
    assert.throws(() => book(bob, `2026-11-10T${s}:00-03:00`, `2026-11-10T${e}:00-03:00`),
      (err) => err.status === 409 && err.code === 'BOOKING_CONFLICT', `${s}-${e}`);
  }
});

test('RN4: reuniões encostadas e salas diferentes são permitidas', () => {
  createRoom(db, now, { name: 'Sala 2', capacity: 4 });
  book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  assert.doesNotThrow(() => book(bob, '2026-11-10T15:00:00-03:00', '2026-11-10T16:00:00-03:00'));
  assert.doesNotThrow(() => book(bob, '2026-11-10T13:00:00-03:00', '2026-11-10T14:00:00-03:00'));
  assert.doesNotThrow(() => book(bob, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00', 2));
});

test('valida entrada: sem fuso, end <= start, sala inexistente', () => {
  assert.throws(() => book(alice, '2026-11-10T14:00:00', '2026-11-10T15:00:00'), (e) => e.status === 400);
  assert.throws(() => book(alice, '2026-11-10T15:00:00-03:00', '2026-11-10T14:00:00-03:00'), (e) => e.status === 400);
  assert.throws(() => book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00', 99), (e) => e.status === 404);
});

test('RN2: estende quando não há conflito', () => {
  const b = book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  const ext = extendBooking(db, now, alice, b.id, { end: '2026-11-10T16:00:00-03:00' });
  assert.equal(ext.end, '2026-11-10T19:00:00.000Z');
});

test('RN2: não estende se houver reunião no intervalo (409), mas estende até encostar', () => {
  const b = book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  book(bob, '2026-11-10T15:30:00-03:00', '2026-11-10T16:30:00-03:00');
  assert.throws(() => extendBooking(db, now, alice, b.id, { end: '2026-11-10T16:00:00-03:00' }),
    (e) => e.status === 409);
  assert.doesNotThrow(() => extendBooking(db, now, alice, b.id, { end: '2026-11-10T15:30:00-03:00' }));
});

test('RN2: novo fim deve ser posterior; não estende reunião encerrada', () => {
  const b = book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  assert.throws(() => extendBooking(db, now, alice, b.id, { end: '2026-11-10T14:30:00-03:00' }),
    (e) => e.status === 400);
  const later = () => Date.parse('2026-11-10T16:00:00-03:00');
  assert.throws(() => extendBooking(db, later, alice, b.id, { end: '2026-11-10T17:00:00-03:00' }),
    (e) => e.status === 422 && e.code === 'BOOKING_ALREADY_ENDED');
});

test('permissões: só organizador ou admin altera/cancela', () => {
  const b = book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  assert.throws(() => cancelBooking(db, bob, b.id), (e) => e.status === 403);
  assert.throws(() => extendBooking(db, now, bob, b.id, { end: '2026-11-10T16:00:00-03:00' }), (e) => e.status === 403);
  assert.doesNotThrow(() => extendBooking(db, now, admin, b.id, { end: '2026-11-10T16:00:00-03:00' }));
  cancelBooking(db, alice, b.id);
  assert.throws(() => cancelBooking(db, alice, b.id), (e) => e.status === 404);
});

test('cancelar libera o horário', () => {
  const b = book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  cancelBooking(db, alice, b.id);
  assert.doesNotThrow(() => book(bob, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00'));
});

test('listagem de salas indica "em uso agora" e próxima reunião', () => {
  book(alice, '2026-11-10T12:00:00-03:00', '2026-11-10T13:00:00-03:00');
  book(bob, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  const [room] = listRooms(db, now);
  assert.equal(room.inUse, true);
  assert.equal(room.currentBooking.employeeName, 'alice');
  assert.equal(room.nextBooking.employeeName, 'bob');
});

test('listagem filtra por janela de tempo', () => {
  book(alice, '2026-11-10T14:00:00-03:00', '2026-11-10T15:00:00-03:00');
  book(alice, '2026-11-12T14:00:00-03:00', '2026-11-12T15:00:00-03:00');
  const r = listBookings(db, { from: '2026-11-12T00:00:00-03:00', to: '2026-11-13T00:00:00-03:00' });
  assert.equal(r.length, 1);
});
