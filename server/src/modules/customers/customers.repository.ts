import crypto from 'node:crypto';
import { getDb } from '../../db/client.js';
import type { Paginated } from '../users/users.repository.js';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customers.schemas.js';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  creditLimit: number;
  status: 'active' | 'inactive' | 'prospect';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_limit: number;
  status: Customer['status'];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `
  id, name, email, phone, credit_limit, status, notes, created_at, updated_at
`;

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    creditLimit: row.credit_limit,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SORT_COLUMNS: Record<ListCustomersQuery['sortBy'], string> = {
  name: 'name',
  creditLimit: 'credit_limit',
  status: 'status',
  createdAt: 'created_at',
};

export function listCustomers(query: ListCustomersQuery): Paginated<Customer> {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.search) {
    filters.push('(name LIKE @search OR email LIKE @search OR phone LIKE @search)');
    params['search'] = `%${query.search}%`;
  }
  if (query.status) {
    filters.push('status = @status');
    params['status'] = query.status;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const orderBy = `${SORT_COLUMNS[query.sortBy]} ${query.sortDir === 'desc' ? 'DESC' : 'ASC'}`;

  const db = getDb();

  const total =
    db
      .prepare<Record<string, unknown>, { count: number }>(
        `SELECT count(*) AS count FROM customers ${where}`,
      )
      .get(params)?.count ?? 0;

  const rows = db
    .prepare<Record<string, unknown>, CustomerRow>(
      `SELECT ${SELECT_COLUMNS} FROM customers ${where}
       ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize });

  return { items: rows.map(toCustomer), total, page: query.page, pageSize: query.pageSize };
}

export function findCustomerById(id: string): Customer | null {
  const row = getDb()
    .prepare<[string], CustomerRow>(`SELECT ${SELECT_COLUMNS} FROM customers WHERE id = ?`)
    .get(id);
  return row ? toCustomer(row) : null;
}

export function createCustomer(input: CreateCustomerInput, createdBy: string): Customer {
  const id = crypto.randomUUID();

  getDb()
    .prepare(
      `INSERT INTO customers (id, name, email, phone, credit_limit, status, notes, created_by)
       VALUES (@id, @name, @email, @phone, @creditLimit, @status, @notes, @createdBy)`,
    )
    .run({
      id,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      creditLimit: input.creditLimit,
      status: input.status,
      notes: input.notes ?? null,
      createdBy,
    });

  const created = findCustomerById(id);
  if (!created) throw new Error('Customer disappeared immediately after insert');
  return created;
}

export function updateCustomer(id: string, input: UpdateCustomerInput): Customer | null {
  const column: Record<keyof UpdateCustomerInput, string> = {
    name: 'name',
    email: 'email',
    phone: 'phone',
    creditLimit: 'credit_limit',
    status: 'status',
    notes: 'notes',
  };

  const assignments: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(input) as [keyof UpdateCustomerInput, unknown][]) {
    if (value === undefined) continue;
    assignments.push(`${column[key]} = @${key}`);
    params[key] = value;
  }

  if (assignments.length > 0) {
    assignments.push(`updated_at = datetime('now')`);
    getDb()
      .prepare(`UPDATE customers SET ${assignments.join(', ')} WHERE id = @id`)
      .run(params);
  }

  return findCustomerById(id);
}

export function deleteCustomer(id: string): boolean {
  return getDb().prepare('DELETE FROM customers WHERE id = ?').run(id).changes > 0;
}

export interface CustomerStats {
  total: number;
  active: number;
  prospect: number;
  inactive: number;
  totalCreditLimit: number;
}

export function customerStats(): CustomerStats {
  const row = getDb()
    .prepare<[], CustomerStats>(
      `SELECT
         count(*)                                              AS total,
         sum(CASE WHEN status = 'active'   THEN 1 ELSE 0 END)  AS active,
         sum(CASE WHEN status = 'prospect' THEN 1 ELSE 0 END)  AS prospect,
         sum(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END)  AS inactive,
         coalesce(sum(credit_limit), 0)                        AS totalCreditLimit
       FROM customers`,
    )
    .get();

  return {
    total: row?.total ?? 0,
    active: row?.active ?? 0,
    prospect: row?.prospect ?? 0,
    inactive: row?.inactive ?? 0,
    totalCreditLimit: row?.totalCreditLimit ?? 0,
  };
}
