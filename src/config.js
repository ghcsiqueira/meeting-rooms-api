export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  if (isProd && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET é obrigatório quando NODE_ENV=production');
  }
  if (isProd && (env.ADMIN_PASSWORD ?? 'admin123') === 'admin123') {
    throw new Error('Defina ADMIN_PASSWORD (diferente do padrão) quando NODE_ENV=production');
  }
  return {
    port: Number(env.PORT ?? 3000),
    jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-change-me',
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '8h',
    companyEmailDomain: (env.COMPANY_EMAIL_DOMAIN ?? 'empresadorafa.com').toLowerCase(),
    dbPath: env.DB_PATH ?? './data/rooms.db',
    admin: {
      name: env.ADMIN_NAME ?? 'Administrador',
      email: (env.ADMIN_EMAIL ?? 'admin@empresa.com').toLowerCase(),
      password: env.ADMIN_PASSWORD ?? 'admin123',
    },
  };
}
