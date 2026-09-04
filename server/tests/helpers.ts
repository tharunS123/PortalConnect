import { afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { closeDb, createInMemoryDb, setDb, type Db } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { hashPassword } from '../src/lib/password.js';
import { createUser } from '../src/modules/users/users.repository.js';

export const ADMIN = { username: 'admin', password: 'ChangeMe123!' };

export interface TestContext {
  app: Express;
  db: Db;
}

/**
 * Each test gets a brand new in-memory database, so tests cannot leak state
 * into one another and can run in any order.
 */
export function useTestApp(): TestContext {
  const context = {} as TestContext;

  beforeEach(async () => {
    const db = createInMemoryDb();
    setDb(db);
    runMigrations(db);
    await seed(db);

    context.db = db;
    context.app = createApp();
  });

  afterEach(() => {
    closeDb();
  });

  return context;
}

export interface Session {
  accessToken: string;
  refreshCookie: string;
  userId: string;
}

/** Log in and return both the bearer token and the refresh cookie. */
export async function login(app: Express, username: string, password: string): Promise<Session> {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const refreshCookie = (cookies ?? []).find((cookie) => cookie.startsWith('pc_refresh='));

  if (!refreshCookie) throw new Error('Login did not set a refresh cookie');

  return {
    accessToken: response.body.accessToken as string,
    refreshCookie: refreshCookie.split(';')[0] ?? '',
    userId: response.body.user.id as string,
  };
}

export function loginAsAdmin(app: Express): Promise<Session> {
  return login(app, ADMIN.username, ADMIN.password);
}

/** Create an active user with a known password, bypassing the register flow. */
export async function createActiveUser(options: {
  username: string;
  role: string;
  password?: string;
}): Promise<{ id: string; username: string; password: string }> {
  const password = options.password ?? 'Str0ng!Passw0rd!';

  const user = createUser({
    username: options.username,
    name: options.username,
    email: `${options.username}@example.test`,
    passwordHash: await hashPassword(password),
    gender: 'undisclosed',
    role: options.role,
    isActive: true,
  });

  return { id: user.id, username: user.username, password };
}
