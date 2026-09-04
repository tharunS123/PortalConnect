import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ADMIN, createActiveUser, login, loginAsAdmin, useTestApp } from './helpers.js';

const ctx = useTestApp();

const VALID_REGISTRATION = {
  username: 'newcomer',
  name: 'New Comer',
  email: 'newcomer@example.test',
  password: 'Str0ng!Passw0rd!',
  gender: 'undisclosed',
};

describe('POST /api/auth/register', () => {
  it('creates an inactive account and never echoes the password', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/register')
      .send(VALID_REGISTRATION)
      .expect(201);

    expect(response.body.user.isActive).toBe(false);
    expect(response.body.user.role).toBe('user');
    expect(JSON.stringify(response.body)).not.toContain(VALID_REGISTRATION.password);
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('stores a bcrypt hash rather than the plaintext password', async () => {
    await request(ctx.app).post('/api/auth/register').send(VALID_REGISTRATION).expect(201);

    const row = ctx.db
      .prepare('SELECT password_hash FROM users WHERE username = ?')
      .get(VALID_REGISTRATION.username) as { password_hash: string };

    expect(row.password_hash).not.toBe(VALID_REGISTRATION.password);
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a weak password with a field-level message', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTRATION, password: 'short' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'password' }),
    );
  });

  it('rejects a duplicate username case-insensitively', async () => {
    await request(ctx.app).post('/api/auth/register').send(VALID_REGISTRATION).expect(201);

    const response = await request(ctx.app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTRATION, username: 'NEWCOMER', email: 'other@example.test' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('ignores client-supplied role and isActive fields', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTRATION, role: 'admin', isActive: true })
      .expect(201);

    expect(response.body.user.role).toBe('user');
    expect(response.body.user.isActive).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  it('returns an access token and an httpOnly refresh cookie', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: ADMIN.password })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.username).toBe(ADMIN.username);
    expect(response.body.permissions.length).toBeGreaterThan(0);

    // The refresh token must never appear in a body readable by page scripts.
    expect(response.body).not.toHaveProperty('refreshToken');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((cookie) => cookie.startsWith('pc_refresh='));
    expect(refresh).toBeDefined();
    expect(refresh).toContain('HttpOnly');
    expect(refresh).toContain('SameSite=Strict');
  });

  it('gives the same error for an unknown user and a wrong password', async () => {
    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'Str0ng!Passw0rd!' })
      .expect(401);

    const wrong = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: 'Wr0ng!Passw0rd!' })
      .expect(401);

    // `requestId` is deliberately unique per request, so compare the rest.
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.code).toBe(unknown.body.error.code);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('refuses to sign in an account awaiting activation', async () => {
    await request(ctx.app).post('/api/auth/register').send(VALID_REGISTRATION).expect(201);

    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: VALID_REGISTRATION.username, password: VALID_REGISTRATION.password })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const session = await loginAsAdmin(ctx.app);

    const response = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const rotated = cookies.find((cookie) => cookie.startsWith('pc_refresh='));

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(rotated).toBeDefined();
    expect(rotated?.split(';')[0]).not.toBe(session.refreshCookie);
  });

  it('detects reuse of a consumed token and kills every session', async () => {
    const session = await loginAsAdmin(ctx.app);

    // First use rotates the token.
    const rotated = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);

    const newCookie = (rotated.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('pc_refresh='))
      ?.split(';')[0];

    // Replaying the original token looks like theft.
    const replay = await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);

    expect(replay.body.error.code).toBe('REFRESH_REUSED');

    // The legitimate rotated token is invalidated too.
    await request(ctx.app).post('/api/auth/refresh').set('Cookie', newCookie!).expect(401);
  });

  it('rejects a request with no cookie', async () => {
    const response = await request(ctx.app).post('/api/auth/refresh').expect(401);
    expect(response.body.error.code).toBe('REFRESH_MISSING');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session so the cookie can no longer be refreshed', async () => {
    const session = await loginAsAdmin(ctx.app);

    await request(ctx.app)
      .post('/api/auth/logout')
      .set('Cookie', session.refreshCookie)
      .expect(204);

    await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the caller with their permission matrix', async () => {
    const session = await loginAsAdmin(ctx.app);

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body.user.username).toBe(ADMIN.username);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.permissions).toContainEqual(
      expect.objectContaining({ menu: 'users', canEdit: true }),
    );
  });

  it('rejects a missing, malformed or forged token', async () => {
    await request(ctx.app).get('/api/auth/me').expect(401);
    await request(ctx.app).get('/api/auth/me').set('Authorization', 'Bearer nope').expect(401);
    await request(ctx.app).get('/api/auth/me').set('Authorization', 'Basic abc').expect(401);
  });

  it('stops honouring tokens once the account is deactivated', async () => {
    const user = await createActiveUser({ username: 'tempstaff', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    ctx.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);

    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password and invalidates existing sessions', async () => {
    const user = await createActiveUser({ username: 'rotator', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    await request(ctx.app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: user.password, newPassword: 'An0ther!Passw0rd!' })
      .expect(204);

    await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);

    await login(ctx.app, user.username, 'An0ther!Passw0rd!');
  });

  it('refuses when the current password is wrong', async () => {
    const user = await createActiveUser({ username: 'rotator2', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    await request(ctx.app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: 'Not!TheP4ssword', newPassword: 'An0ther!Passw0rd!' })
      .expect(401);
  });
});
