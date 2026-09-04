import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createActiveUser, login, loginAsAdmin, useTestApp } from './helpers.js';

const ctx = useTestApp();

describe('user administration authorisation', () => {
  it('lets an admin list users without exposing password hashes', async () => {
    const session = await loginAsAdmin(ctx.app);

    const response = await request(ctx.app)
      .get('/api/users')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toContain('password');
  });

  it('refuses a non-admin, even though the old UI merely hid the menu', async () => {
    const user = await createActiveUser({ username: 'plainuser', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    const response = await request(ctx.app)
      .get('/api/users')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a non-admin trying to edit another account directly', async () => {
    const attacker = await createActiveUser({ username: 'attacker', role: 'user' });
    const victim = await createActiveUser({ username: 'victim', role: 'user' });
    const session = await login(ctx.app, attacker.username, attacker.password);

    await request(ctx.app)
      .patch(`/api/users/${victim.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ role: 'admin' })
      .expect(403);
  });

  it('stops a user promoting themselves through the profile endpoint', async () => {
    const user = await createActiveUser({ username: 'climber', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    // `role` and `isActive` are not in the profile schema and get stripped.
    await request(ctx.app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'Climber', role: 'admin', isActive: true })
      .expect(200);

    const row = ctx.db.prepare('SELECT role_code FROM users WHERE id = ?').get(user.id) as {
      role_code: string;
    };

    expect(row.role_code).toBe('user');
  });

  it('revokes sessions immediately when an admin deactivates an account', async () => {
    const admin = await loginAsAdmin(ctx.app);
    const user = await createActiveUser({ username: 'soon2go', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    await request(ctx.app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(ctx.app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);
  });

  it('refuses to demote the last remaining administrator', async () => {
    const admin = await loginAsAdmin(ctx.app);

    const response = await request(ctx.app)
      .patch(`/api/users/${admin.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'user' })
      .expect(400);

    expect(response.body.error.message).toContain('administrator');
  });

  it('rejects an unknown role code', async () => {
    const admin = await loginAsAdmin(ctx.app);
    const user = await createActiveUser({ username: 'roletest', role: 'user' });

    await request(ctx.app)
      .patch(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: 'superuser' })
      .expect(400);
  });

  it('refuses self-deletion', async () => {
    const admin = await loginAsAdmin(ctx.app);

    await request(ctx.app)
      .delete(`/api/users/${admin.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(400);
  });
});

describe('customer permission matrix', () => {
  const CUSTOMER = { name: 'Acme Corp', creditLimit: 1000, status: 'active' };

  it('lets a role with create permission add a customer', async () => {
    const admin = await loginAsAdmin(ctx.app);

    const response = await request(ctx.app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send(CUSTOMER)
      .expect(201);

    expect(response.body.name).toBe(CUSTOMER.name);
  });

  it('enforces delete permission server-side, not just in the UI', async () => {
    // The `user` role may create and edit customers but never delete them.
    const user = await createActiveUser({ username: 'salesrep', role: 'user' });
    const session = await login(ctx.app, user.username, user.password);

    const created = await request(ctx.app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(CUSTOMER)
      .expect(201);

    await request(ctx.app)
      .patch(`/api/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ creditLimit: 2000 })
      .expect(200);

    const response = await request(ctx.app)
      .delete(`/api/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);

    expect(response.body.error.message).toContain('delete');
  });

  it('gives a read-only role view access but blocks writes', async () => {
    const tech = await createActiveUser({ username: 'technician', role: 'tech' });
    const session = await login(ctx.app, tech.username, tech.password);

    await request(ctx.app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    await request(ctx.app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send(CUSTOMER)
      .expect(403);
  });

  it('validates the payload and rejects a negative credit limit', async () => {
    const admin = await loginAsAdmin(ctx.app);

    const response = await request(ctx.app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Bad Corp', creditLimit: -5 })
      .expect(422);

    expect(response.body.error.details).toContainEqual(
      expect.objectContaining({ field: 'creditLimit' }),
    );
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const admin = await loginAsAdmin(ctx.app);

    await request(ctx.app)
      .get('/api/customers/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });

  it('requires authentication for every customer route', async () => {
    await request(ctx.app).get('/api/customers').expect(401);
    await request(ctx.app).post('/api/customers').send(CUSTOMER).expect(401);
  });
});

describe('infrastructure', () => {
  it('reports health without authentication', async () => {
    const response = await request(ctx.app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns a structured 404 for an unknown API route', async () => {
    const response = await request(ctx.app).get('/api/does-not-exist').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('does not advertise the server technology', async () => {
    const response = await request(ctx.app).get('/api/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
