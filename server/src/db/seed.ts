import crypto from 'node:crypto';
import type { Db } from './client.js';
import { getDb } from './client.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from '../lib/password.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Reference data carried over from the original `db.json`, normalised into the
 * relational schema. Seeding is idempotent so it is safe to re-run on deploy.
 */
const ROLES = [
  { code: 'admin', name: 'Administrator', description: 'Full access to every module', isSystem: 1 },
  { code: 'manager', name: 'Manager', description: 'Manages customers and reporting', isSystem: 0 },
  { code: 'tech', name: 'Technician', description: 'Read-only operational access', isSystem: 0 },
  { code: 'user', name: 'User', description: 'Standard portal user', isSystem: 0 },
] as const;

const MENUS = [
  { code: 'dashboard', name: 'Dashboard', icon: 'dashboard', sortOrder: 10 },
  { code: 'users', name: 'Users', icon: 'group', sortOrder: 20 },
  { code: 'customers', name: 'Customers', icon: 'contacts', sortOrder: 30 },
] as const;

interface Permission {
  role: string;
  menu: string;
  view: number;
  create: number;
  edit: number;
  remove: number;
}

const PERMISSIONS: Permission[] = [
  { role: 'admin', menu: 'dashboard', view: 1, create: 0, edit: 0, remove: 0 },
  { role: 'admin', menu: 'users', view: 1, create: 1, edit: 1, remove: 1 },
  { role: 'admin', menu: 'customers', view: 1, create: 1, edit: 1, remove: 1 },

  { role: 'manager', menu: 'dashboard', view: 1, create: 0, edit: 0, remove: 0 },
  { role: 'manager', menu: 'customers', view: 1, create: 1, edit: 1, remove: 1 },

  { role: 'tech', menu: 'dashboard', view: 1, create: 0, edit: 0, remove: 0 },
  { role: 'tech', menu: 'customers', view: 1, create: 0, edit: 0, remove: 0 },

  { role: 'user', menu: 'dashboard', view: 1, create: 0, edit: 0, remove: 0 },
  { role: 'user', menu: 'customers', view: 1, create: 1, edit: 1, remove: 0 },
];

const DEMO_CUSTOMERS = [
  {
    name: 'Sanjay Traders',
    email: 'accounts@sanjaytraders.example',
    phone: '+91 44 2345 6789',
    creditLimit: 500,
    status: 'active',
  },
  {
    name: 'Meridian Logistics',
    email: 'ap@meridian.example',
    phone: '+1 415 555 0142',
    creditLimit: 25000,
    status: 'active',
  },
  {
    name: 'Northwind Supplies',
    email: 'billing@northwind.example',
    phone: '+44 20 7946 0958',
    creditLimit: 12000,
    status: 'prospect',
  },
  {
    name: 'Cobalt Manufacturing',
    email: 'finance@cobalt.example',
    phone: '+61 2 8123 4567',
    creditLimit: 0,
    status: 'inactive',
  },
];

export async function seed(db: Db = getDb()): Promise<void> {
  runMigrations(db);

  const insertRole = db.prepare(`
    INSERT INTO roles (code, name, description, is_system) VALUES (@code, @name, @description, @isSystem)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description
  `);
  const insertMenu = db.prepare(`
    INSERT INTO menus (code, name, icon, sort_order) VALUES (@code, @name, @icon, @sortOrder)
    ON CONFLICT(code) DO UPDATE SET name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order
  `);
  const insertPermission = db.prepare(`
    INSERT INTO role_permissions (role_code, menu_code, can_view, can_create, can_edit, can_delete)
    VALUES (@role, @menu, @view, @create, @edit, @remove)
    ON CONFLICT(role_code, menu_code) DO UPDATE SET
      can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete
  `);

  db.transaction(() => {
    for (const role of ROLES) insertRole.run(role);
    for (const menu of MENUS) insertMenu.run(menu);
    for (const permission of PERMISSIONS) insertPermission.run(permission);
  })();

  // The admin account is created once. We never overwrite an existing password,
  // so re-seeding a live environment cannot reset a rotated credential.
  const adminExists = db
    .prepare('SELECT 1 AS present FROM users WHERE lower(username) = lower(?)')
    .get(env.SEED_ADMIN_USERNAME);

  if (!adminExists) {
    const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
    db.prepare(
      `
      INSERT INTO users (id, username, name, email, password_hash, gender, role_code, is_active)
      VALUES (@id, @username, @name, @email, @passwordHash, @gender, @roleCode, 1)
    `,
    ).run({
      id: crypto.randomUUID(),
      username: env.SEED_ADMIN_USERNAME,
      name: 'Portal Administrator',
      email: env.SEED_ADMIN_EMAIL,
      passwordHash,
      gender: 'undisclosed',
      roleCode: 'admin',
    });
  }

  const customerCount = db
    .prepare<[], { count: number }>('SELECT count(*) AS count FROM customers')
    .get();

  if (!customerCount || customerCount.count === 0) {
    const insertCustomer = db.prepare(`
      INSERT INTO customers (id, name, email, phone, credit_limit, status)
      VALUES (@id, @name, @email, @phone, @creditLimit, @status)
    `);
    db.transaction(() => {
      for (const customer of DEMO_CUSTOMERS) {
        insertCustomer.run({ id: crypto.randomUUID(), ...customer });
      }
    })();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  logger.info(
    { adminUsername: env.SEED_ADMIN_USERNAME },
    'Seed complete. Change the seeded admin password before exposing this deployment.',
  );
}
