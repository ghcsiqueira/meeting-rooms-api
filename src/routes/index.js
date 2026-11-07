import { Router } from 'express';
import { authenticate, requireAdmin } from '../auth.js';
import * as employees from '../services/employeeService.js';
import * as rooms from '../services/roomService.js';
import * as bookings from '../services/bookingService.js';

export function buildRoutes({ db, config, now }) {
  const r = Router();
  const auth = authenticate(db, config);

  r.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // ---- Autenticação (único endpoint público) ----
  r.post('/auth/login', (req, res) => res.json(employees.login(db, config, req.body ?? {})));

  // ---- Funcionários (admin) ----
  r.post('/employees', auth, requireAdmin, (req, res) =>
    res.status(201).json(employees.createEmployee(db, now, req.body ?? {}))
  );
  r.get('/employees', auth, requireAdmin, (_req, res) => res.json(employees.listEmployees(db)));
  r.get('/me', auth, (req, res) => res.json(req.user));

  // ---- Salas ----
  r.get('/rooms', auth, (_req, res) => res.json(rooms.listRooms(db, now)));
  r.post('/rooms', auth, requireAdmin, (req, res) =>
    res.status(201).json(rooms.createRoom(db, now, req.body ?? {}))
  );

  // ---- Reuniões ----
  r.get('/bookings', auth, (req, res) => res.json(bookings.listBookings(db, req.query)));
  r.post('/bookings', auth, (req, res) =>
    res.status(201).json(bookings.createBooking(db, now, req.user, req.body ?? {}))
  );
  r.get('/bookings/:id', auth, (req, res) => res.json(bookings.getBooking(db, Number(req.params.id))));
  r.patch('/bookings/:id/extend', auth, (req, res) =>
    res.json(bookings.extendBooking(db, now, req.user, req.params.id, req.body ?? {}))
  );
  r.delete('/bookings/:id', auth, (req, res) => {
    bookings.cancelBooking(db, req.user, req.params.id);
    res.status(204).end();
  });

  return r;
}
