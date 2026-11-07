import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { migrate } from './schema.js';

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/** Cria o admin inicial e salas de exemplo (apenas se o banco estiver vazio). */
export function seed(db, config) {
  const hasEmployees = db.prepare('SELECT COUNT(*) AS n FROM employees').get().n > 0;
  if (!hasEmployees) {
    db.prepare(
      'INSERT INTO employees (name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)'
    ).run(
      config.admin.name,
      config.admin.email,
      bcrypt.hashSync(config.admin.password, 10),
      'admin',
      Date.now()
    );
  }
  const hasRooms = db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n > 0;
  if (!hasRooms) {
    const ins = db.prepare('INSERT INTO rooms (name, capacity, created_at) VALUES (?,?,?)');
    ins.run('Sala 1', 6, Date.now());
    ins.run('Sala 2', 10, Date.now());
    ins.run('Sala 3', 4, Date.now());
  }
}
