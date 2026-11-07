// Testa o cadastro de usuário (RN1–RN3) direto na camada de serviço.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { migrate } from '../src/schema.js';
import { loadConfig } from '../src/config.js';
import { registerEmployee, login } from '../src/services/employeeService.js';

const config = loadConfig({});
const now = () => 1000;
let db;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
});

const register = (email, password = 'senha1234') => registerEmployee(db, config, now, { name: 'Maria Silva', email, password });

test('cadastra funcionário válido com perfil employee e senha criptografada', () => {
  const e = register('maria@empresadorafa.com');
  assert.equal(e.email, 'maria@empresadorafa.com');
  assert.equal(e.name, 'Maria Silva');
  assert.equal(e.role, 'employee');
  const row = db.prepare('SELECT password_hash FROM employees WHERE id = ?').get(e.id);
  assert.notEqual(row.password_hash, 'senha1234');
  assert.ok(bcrypt.compareSync('senha1234', row.password_hash));
});

test('usuário cadastrado consegue fazer login', () => {
  register('maria@empresadorafa.com');
  const r = login(db, config, { email: 'maria@empresadorafa.com', password: 'senha1234' });
  assert.ok(r.token);
});

test('RN1: rejeita e-mail fora do domínio da empresa (422)', () => {
  for (const email of ['joao@gmail.com', 'joao@empresadorafa.com.br', 'joao@sub.empresadorafa.com']) {
    assert.throws(() => register(email), (e) => e.status === 422 && e.code === 'INVALID_EMAIL_DOMAIN', email);
  }
});

test('RN1: domínio aceito sem diferenciar maiúsculas', () => {
  assert.doesNotThrow(() => register('Ana@EmpresaDoRafa.com'));
});

test('RN2: senha com menos de 8 caracteres é rejeitada (400)', () => {
  assert.throws(() => register('maria@empresadorafa.com', '1234567'),
    (e) => e.status === 400 && e.code === 'VALIDATION_ERROR');
});

test('RN2: senha com exatamente 8 caracteres é aceita', () => {
  assert.doesNotThrow(() => register('maria@empresadorafa.com', '12345678'));
});

test('RN3: e-mail duplicado é rejeitado (409), inclusive com outra caixa', () => {
  register('maria@empresadorafa.com');
  assert.throws(() => register('maria@empresadorafa.com'),
    (e) => e.status === 409 && e.code === 'EMPLOYEE_ALREADY_EXISTS');
  assert.throws(() => register('MARIA@empresadorafa.com'), (e) => e.status === 409);
});

test('nome é obrigatório (400)', () => {
  assert.throws(() => registerEmployee(db, config, now, { email: 'a@empresadorafa.com', password: 'senha1234' }),
    (e) => e.status === 400 && e.code === 'VALIDATION_ERROR');
});

test('e-mail e senha são obrigatórios e e-mail precisa ser válido', () => {
  assert.throws(() => registerEmployee(db, config, now, {}), (e) => e.status === 400);
  assert.throws(() => register('sem-arroba'), (e) => e.status === 400);
  assert.throws(() => register('joao@empresadorafa.com@x.com'), (e) => e.status === 400);
});
