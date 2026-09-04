import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptionsDelegate } from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { listMenus } from './modules/roles/roles.repository.js';

/**
 * Allow same-origin requests (the deployed app serves its own frontend) plus
 * any origin explicitly listed in CORS_ORIGINS, which is how `ng serve` on
 * :4200 talks to the API on :3000 during development.
 *
 * A disallowed origin is answered without CORS headers rather than by throwing:
 * the browser then blocks it, which is the correct outcome, and the server does
 * not log a 500 for what is really a client-side policy decision.
 */
const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin;
  const sameOrigin = origin === `${req.protocol}://${req.get('host') ?? ''}`;

  if (!origin || sameOrigin || env.corsOrigins.includes(origin)) {
    callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    });
    return;
  }

  callback(null, { origin: false });
};

export function createApp(): Express {
  const app = express();

  // Azure/App Service terminates TLS upstream, so trust exactly one proxy hop.
  // This makes `req.ip` the real client address for rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id = typeof existing === 'string' ? existing : crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Angular Material injects styles at runtime, and the app loads
          // Google Fonts; scripts stay locked to same-origin.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          // Would rewrite http://localhost to https:// when running a
          // production build locally; behind real TLS it is redundant anyway.
          upgradeInsecureRequests: env.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: env.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // CORS guards the API only. Static assets are same-origin by definition, and
  // running them through this check would reject browser module-script fetches,
  // which carry an `Origin` header even when the site is serving itself.
  app.use('/api', cors(corsDelegate));

  // A small body cap keeps trivially-large payloads from reaching the parser.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser());

  // Baseline limit for the whole API; /api/auth adds a much tighter one.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => env.isTest,
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get('/api/menus', (_req, res) => {
    res.json(listMenus());
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/customers', customersRouter);

  // 404 for unmatched API routes before the SPA fallback claims them.
  app.use('/api', notFoundHandler);

  mountStaticApp(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * In production the API also serves the compiled Angular bundle, so the whole
 * portal runs as a single deployable process.
 */
function mountStaticApp(app: Express): void {
  const indexHtml = path.join(env.staticDir, 'index.html');

  if (!fs.existsSync(indexHtml)) {
    if (env.isProduction) {
      logger.warn(
        { staticDir: env.staticDir },
        'No built frontend found — serving the API only. Run `npm run build` first.',
      );
    }
    return;
  }

  // Hashed assets are immutable; index.html must never be cached or clients
  // keep booting an old bundle that references deleted chunks.
  app.use(
    express.static(env.staticDir, {
      index: false,
      maxAge: '1y',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
