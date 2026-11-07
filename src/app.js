import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './swagger.js';
import { buildRoutes } from './routes/index.js';
import { AppError } from './errors.js';

export function createApp({ db, config, now = () => Date.now() }) {
  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => res.redirect('/docs'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'API de Salas de Reunião' }));
  app.get('/openapi.json', (_req, res) => res.json(openApiSpec));

  app.use(buildRoutes({ db, config, now }));

  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Rota não encontrada')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido no corpo da requisição' } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
  });

  return app;
}
