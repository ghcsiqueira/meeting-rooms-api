import jwt from 'jsonwebtoken';
import { AppError } from './errors.js';

/** Exige "Authorization: Bearer <token>" de um funcionário cadastrado. */
export function authenticate(db, config) {
  return (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Token ausente. Envie "Authorization: Bearer <token>"');
    }
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Token inválido ou expirado');
    }
    // Revalida no banco: um funcionário removido perde o acesso imediatamente.
    const emp = db.prepare('SELECT id, name, email, role FROM employees WHERE id = ?').get(Number(payload.sub));
    if (!emp) throw new AppError(401, 'INVALID_TOKEN', 'Funcionário não encontrado');
    req.user = emp;
    next();
  };
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Apenas administradores podem executar esta ação');
  }
  next();
}
