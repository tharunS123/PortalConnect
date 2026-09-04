import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root — two levels above `server/src/config` in source, `server/dist/config` when built. */
export const REPO_ROOT = path.resolve(here, '../../..');

loadDotenv({ path: path.join(REPO_ROOT, '.env'), quiet: true });

/**
 * A secret must be long enough that brute-forcing the HMAC key is impractical.
 * We only relax this outside production so `npm run dev` works with no setup.
 */
const secret = z.string().min(32, 'must be at least 32 characters');

const durationString = z
  .string()
  .regex(/^\d+(ms|s|m|h|d|w|y)$/, 'must be a duration such as "15m", "7d" or "900s"');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DATABASE_PATH: z.string().default('./server/data/portalconnect.db'),

    JWT_ACCESS_SECRET: secret.optional(),
    JWT_REFRESH_SECRET: secret.optional(),
    ACCESS_TOKEN_TTL: durationString.default('15m'),
    REFRESH_TOKEN_TTL: durationString.default('7d'),

    CORS_ORIGINS: z.string().default('http://localhost:4200'),

    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    STATIC_DIR: z.string().default('./dist/portal-connect/browser'),

    SEED_ADMIN_USERNAME: z.string().min(3).default('admin'),
    SEED_ADMIN_EMAIL: z.email().default('admin@portalconnect.local'),
    // Deliberately no default — an unset value makes the seed generate a
    // random password and print it once, rather than install a known one.
    // A blank entry in `.env` counts as unset, so `SEED_ADMIN_PASSWORD=` works.
    SEED_ADMIN_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(12).optional(),
    ),
  })
  .superRefine((value, ctx) => {
    // Development gets throwaway defaults; production must supply real secrets.
    if (value.NODE_ENV !== 'production') return;

    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when NODE_ENV=production`,
        });
      }
    }

    // `.env.example` ships placeholders that satisfy the length rule; refuse to
    // start production on one rather than run with a publicly known secret.
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const secretValue = value[key];
      if (secretValue && /change-?me|dev-only|example|placeholder/i.test(secretValue)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} still looks like a placeholder — generate a real secret`,
        });
      }
    }

    if (value.JWT_ACCESS_SECRET && value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Deliberately not using the logger: configuration is what the logger depends on.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;

const DEV_ACCESS_SECRET = 'portalconnect-development-access-secret-do-not-use-in-production';
const DEV_REFRESH_SECRET = 'portalconnect-development-refresh-secret-do-not-use-in-production';

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  jwtAccessSecret: raw.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
  jwtRefreshSecret: raw.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databasePath: path.isAbsolute(raw.DATABASE_PATH)
    ? raw.DATABASE_PATH
    : path.join(REPO_ROOT, raw.DATABASE_PATH),
  staticDir: path.isAbsolute(raw.STATIC_DIR)
    ? raw.STATIC_DIR
    : path.join(REPO_ROOT, raw.STATIC_DIR),
} as const;

export type Env = typeof env;
