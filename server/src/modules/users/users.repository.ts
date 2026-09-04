import crypto from 'node:crypto';
import { getDb } from '../../db/client.js';

/** A user as exposed by the API. Note there is no password field, by design. */
export interface PublicUser {
  id: string;
  username: string;
  name: string;
  email: string;
  gender: string | null;
  role: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Internal shape — only the auth service should ever see the hash. */
export interface UserWithSecret extends PublicUser {
  passwordHash: string;
}

interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string;
  password_hash: string;
  gender: string | null;
  role_code: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `
  id, username, name, email, password_hash, gender, role_code,
  is_active, last_login_at, created_at, updated_at
`;

function toUserWithSecret(row: UserRow): UserWithSecret {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    gender: row.gender,
    role: row.role_code,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Strip the hash before anything leaves the server. */
export function toPublicUser(user: UserWithSecret): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export function findUserById(id: string): UserWithSecret | null {
  const row = getDb()
    .prepare<[string], UserRow>(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`)
    .get(id);
  return row ? toUserWithSecret(row) : null;
}

export function findUserByUsername(username: string): UserWithSecret | null {
  const row = getDb()
    .prepare<[string], UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE lower(username) = lower(?)`,
    )
    .get(username);
  return row ? toUserWithSecret(row) : null;
}

export function findUserByEmail(email: string): UserWithSecret | null {
  const row = getDb()
    .prepare<[string], UserRow>(`SELECT ${SELECT_COLUMNS} FROM users WHERE lower(email) = lower(?)`)
    .get(email);
  return row ? toUserWithSecret(row) : null;
}

export interface ListUsersOptions {
  search?: string;
  role?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
  sortBy: 'name' | 'username' | 'email' | 'createdAt';
  sortDir: 'asc' | 'desc';
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS: Record<ListUsersOptions['sortBy'], string> = {
  name: 'name',
  username: 'username',
  email: 'email',
  createdAt: 'created_at',
};

export function listUsers(options: ListUsersOptions): Paginated<PublicUser> {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};

  if (options.search) {
    filters.push('(name LIKE @search OR username LIKE @search OR email LIKE @search)');
    params['search'] = `%${options.search}%`;
  }
  if (options.role) {
    filters.push('role_code = @role');
    params['role'] = options.role;
  }
  if (options.isActive !== undefined) {
    filters.push('is_active = @isActive');
    params['isActive'] = options.isActive ? 1 : 0;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  // Mapped through SORT_COLUMNS rather than interpolated from user input.
  const orderBy = `${SORT_COLUMNS[options.sortBy]} ${options.sortDir === 'desc' ? 'DESC' : 'ASC'}`;

  const db = getDb();

  const total =
    db
      .prepare<Record<string, unknown>, { count: number }>(
        `SELECT count(*) AS count FROM users ${where}`,
      )
      .get(params)?.count ?? 0;

  const rows = db
    .prepare<Record<string, unknown>, UserRow>(
      `SELECT ${SELECT_COLUMNS} FROM users ${where}
       ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`,
    )
    .all({
      ...params,
      limit: options.pageSize,
      offset: (options.page - 1) * options.pageSize,
    });

  return {
    items: rows.map((row) => toPublicUser(toUserWithSecret(row))),
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export interface CreateUserInput {
  username: string;
  name: string;
  email: string;
  passwordHash: string;
  gender: string | null;
  role: string | null;
  isActive: boolean;
}

export function createUser(input: CreateUserInput): PublicUser {
  const id = crypto.randomUUID();

  getDb()
    .prepare(
      `INSERT INTO users (id, username, name, email, password_hash, gender, role_code, is_active)
       VALUES (@id, @username, @name, @email, @passwordHash, @gender, @role, @isActive)`,
    )
    .run({ ...input, id, isActive: input.isActive ? 1 : 0 });

  const created = findUserById(id);
  if (!created) throw new Error('User disappeared immediately after insert');
  return toPublicUser(created);
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  gender?: string | null;
  role?: string | null;
  isActive?: boolean;
  passwordHash?: string;
}

export function updateUser(id: string, input: UpdateUserInput): PublicUser | null {
  const assignments: string[] = [];
  const params: Record<string, unknown> = { id };

  const column: Record<keyof UpdateUserInput, string> = {
    name: 'name',
    email: 'email',
    gender: 'gender',
    role: 'role_code',
    isActive: 'is_active',
    passwordHash: 'password_hash',
  };

  for (const [key, value] of Object.entries(input) as [keyof UpdateUserInput, unknown][]) {
    if (value === undefined) continue;
    assignments.push(`${column[key]} = @${key}`);
    params[key] = key === 'isActive' ? (value ? 1 : 0) : value;
  }

  if (assignments.length > 0) {
    assignments.push(`updated_at = datetime('now')`);
    getDb()
      .prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = @id`)
      .run(params);
  }

  const updated = findUserById(id);
  return updated ? toPublicUser(updated) : null;
}

export function recordLogin(id: string): void {
  getDb().prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(id);
}

export function deleteUser(id: string): boolean {
  return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

export function countAdmins(): number {
  return (
    getDb()
      .prepare<[], { count: number }>(
        `SELECT count(*) AS count FROM users WHERE role_code = 'admin' AND is_active = 1`,
      )
      .get()?.count ?? 0
  );
}
