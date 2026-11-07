import { AppError } from './errors.js';

const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Converte ISO-8601 COM fuso (ex.: 2026-11-10T14:00:00-03:00) para epoch ms. */
export function parseInstant(value, field) {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `"${field}" deve estar em ISO-8601 com fuso horário (ex.: 2026-11-10T14:00:00-03:00)`
    );
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new AppError(400, 'VALIDATION_ERROR', `"${field}" é uma data inválida`);
  return ms;
}

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `"${field}" é obrigatório (${min}-${max} caracteres)`);
  }
  return value.trim();
}

export function requireInt(value, field, { min = 1 } = {}) {
  if (!Number.isInteger(value) || value < min) {
    throw new AppError(400, 'VALIDATION_ERROR', `"${field}" deve ser um inteiro >= ${min}`);
  }
  return value;
}

export function parseId(value, field = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new AppError(400, 'VALIDATION_ERROR', `"${field}" inválido`);
  return n;
}
