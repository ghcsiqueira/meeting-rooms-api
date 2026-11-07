import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError } from '../errors.js';
import { requireString } from '../validation.js';

const publicEmployee = (e) => ({ id: e.id, name: e.name, email: e.email, role: e.role });

export function login(db, config, input) {
  const email = requireString(input.email, 'email').toLowerCase();
  const password = requireString(input.password, 'password', { max: 200 });
  const emp = db.prepare('SELECT * FROM employees WHERE email = ?').get(email);
  if (!emp || !bcrypt.compareSync(password, emp.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos');
  }
  const token = jwt.sign({ sub: String(emp.id), role: emp.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  return { token, tokenType: 'Bearer', employee: publicEmployee(emp) };
}

export function createEmployee(db, now, input) {
  const name = requireString(input.name, 'name');
  const email = requireString(input.email, 'email').toLowerCase();
  const password = requireString(input.password, 'password', { min: 6, max: 200 });
  const role = input.role ?? 'employee';
  if (!['admin', 'employee'].includes(role)) {
    throw new AppError(400, 'VALIDATION_ERROR', '"role" deve ser "admin" ou "employee"');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', '"email" inválido');
  }
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO employees (name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)')
      .run(name, email, bcrypt.hashSync(password, 10), role, now());
    return { id: Number(lastInsertRowid), name, email, role };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      throw new AppError(409, 'EMPLOYEE_ALREADY_EXISTS', 'Já existe um funcionário com esse e-mail');
    }
    throw e;
  }
}

export const listEmployees = (db) =>
  db.prepare('SELECT id, name, email, role FROM employees ORDER BY name').all();
