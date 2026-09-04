import crypto from 'node:crypto';
import { getDb } from '../../db/client.js';
import { hashRefreshToken } from '../../lib/tokens.js';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
  replacedBy: string | null;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
}

function toRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBy: row.replaced_by,
  };
}

export interface StoreTokenInput {
  userId: string;
  token: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export function storeRefreshToken(input: StoreTokenInput): string {
  const id = crypto.randomUUID();

  getDb()
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES (@id, @userId, @tokenHash, @expiresAt, @userAgent, @ipAddress)`,
    )
    .run({
      id,
      userId: input.userId,
      tokenHash: hashRefreshToken(input.token),
      expiresAt: input.expiresAt.toISOString(),
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    });

  return id;
}

export function findRefreshToken(token: string): RefreshTokenRecord | null {
  const row = getDb()
    .prepare<[string], RefreshTokenRow>(
      `SELECT id, user_id, expires_at, revoked_at, replaced_by
         FROM refresh_tokens WHERE token_hash = ?`,
    )
    .get(hashRefreshToken(token));

  return row ? toRecord(row) : null;
}

export function revokeRefreshToken(id: string, replacedBy?: string): void {
  getDb()
    .prepare(
      `UPDATE refresh_tokens SET revoked_at = datetime('now'), replaced_by = @replacedBy
        WHERE id = @id AND revoked_at IS NULL`,
    )
    .run({ id, replacedBy: replacedBy ?? null });
}

/**
 * Used when a consumed refresh token is presented again — the likeliest cause
 * is a stolen cookie, so every session for that user is torn down.
 */
export function revokeAllUserTokens(userId: string): number {
  return getDb()
    .prepare(
      `UPDATE refresh_tokens SET revoked_at = datetime('now')
        WHERE user_id = ? AND revoked_at IS NULL`,
    )
    .run(userId).changes;
}

export function deleteExpiredTokens(): number {
  return getDb().prepare(`DELETE FROM refresh_tokens WHERE expires_at < datetime('now')`).run()
    .changes;
}

export function recordAudit(entry: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, metadata, ip_address)
       VALUES (@actorId, @action, @entityType, @entityId, @metadata, @ipAddress)`,
    )
    .run({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata === undefined ? null : JSON.stringify(entry.metadata),
      ipAddress: entry.ipAddress ?? null,
    });
}
