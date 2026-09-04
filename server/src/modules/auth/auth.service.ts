import { env } from '../../config/env.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../lib/errors.js';
import { burnPasswordComparison, hashPassword, verifyPassword } from '../../lib/password.js';
import { generateRefreshToken, refreshTokenTtlMs, signAccessToken } from '../../lib/tokens.js';
import {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByUsername,
  recordLogin,
  toPublicUser,
  updateUser,
  type PublicUser,
} from '../users/users.repository.js';
import { listPermissionsForRole, type Permission } from '../roles/roles.repository.js';
import {
  findRefreshToken,
  recordAudit,
  revokeAllUserTokens,
  revokeRefreshToken,
  storeRefreshToken,
} from './auth.repository.js';
import { logger } from '../../lib/logger.js';
import type { LoginInput, RegisterInput } from '../users/users.schemas.js';

export interface SessionContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export interface AuthSession {
  user: PublicUser;
  permissions: Permission[];
  accessToken: string;
  /** Returned so the caller can set the httpOnly cookie; never sent in a JSON body. */
  refreshToken: string;
  expiresIn: number;
}

/** The role assigned to self-registered accounts, pending admin approval. */
const DEFAULT_ROLE = 'user';

function buildSession(user: PublicUser, refreshToken: string): AuthSession {
  return {
    user,
    permissions: user.role ? listPermissionsForRole(user.role) : [],
    accessToken: signAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role ?? '',
    }),
    refreshToken,
    expiresIn: Math.floor(refreshTokenTtlMs / 1000),
  };
}

function issueRefreshToken(userId: string, context: SessionContext): string {
  const token = generateRefreshToken();
  storeRefreshToken({
    userId,
    token,
    expiresAt: new Date(Date.now() + refreshTokenTtlMs),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });
  return token;
}

export async function register(input: RegisterInput, context: SessionContext): Promise<PublicUser> {
  if (findUserByUsername(input.username)) {
    throw new ConflictError('That username is already taken');
  }
  if (findUserByEmail(input.email)) {
    throw new ConflictError('An account with that email already exists');
  }

  const user = createUser({
    username: input.username,
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    gender: input.gender,
    role: DEFAULT_ROLE,
    // New accounts start inactive; an administrator activates them. This is the
    // behaviour the original app intended but never enforced server-side.
    isActive: false,
  });

  recordAudit({
    actorId: null,
    action: 'user.registered',
    entityType: 'user',
    entityId: user.id,
    ipAddress: context.ipAddress ?? null,
  });

  return user;
}

export async function login(input: LoginInput, context: SessionContext): Promise<AuthSession> {
  const user = findUserByUsername(input.username);

  if (!user) {
    // Spend comparable time so response latency does not reveal that the
    // username is unknown, then fail with the same generic message.
    await burnPasswordComparison(input.password);
    throw new UnauthorizedError('Invalid username or password', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    recordAudit({
      actorId: user.id,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      ipAddress: context.ipAddress ?? null,
    });
    throw new UnauthorizedError('Invalid username or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ForbiddenError('Your account is awaiting activation by an administrator');
  }

  recordLogin(user.id);
  recordAudit({
    actorId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: context.ipAddress ?? null,
  });

  return buildSession(toPublicUser(user), issueRefreshToken(user.id, context));
}

/**
 * Rotating refresh: the presented token is revoked and a fresh one issued.
 * Presenting an already-revoked token means it leaked, so all of that user's
 * sessions are invalidated.
 */
export function refresh(token: string, context: SessionContext): AuthSession {
  const record = findRefreshToken(token);

  if (!record) {
    throw new UnauthorizedError('Session is no longer valid', 'REFRESH_INVALID');
  }

  if (record.revokedAt) {
    const revoked = revokeAllUserTokens(record.userId);
    logger.warn(
      { userId: record.userId, revokedSessions: revoked },
      'Reuse of a revoked refresh token detected — all sessions invalidated',
    );
    recordAudit({
      actorId: record.userId,
      action: 'auth.refresh_reuse_detected',
      entityType: 'user',
      entityId: record.userId,
      ipAddress: context.ipAddress ?? null,
    });
    throw new UnauthorizedError('Session is no longer valid', 'REFRESH_REUSED');
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new UnauthorizedError('Session has expired', 'REFRESH_EXPIRED');
  }

  const user = findUserById(record.userId);

  if (!user?.isActive) {
    revokeAllUserTokens(record.userId);
    throw new UnauthorizedError('Account is no longer active', 'ACCOUNT_INACTIVE');
  }

  const nextToken = generateRefreshToken();
  const nextId = storeRefreshToken({
    userId: user.id,
    token: nextToken,
    expiresAt: new Date(Date.now() + refreshTokenTtlMs),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });
  revokeRefreshToken(record.id, nextId);

  return buildSession(toPublicUser(user), nextToken);
}

export function logout(token: string | undefined): void {
  if (!token) return;
  const record = findRefreshToken(token);
  if (record && !record.revokedAt) {
    revokeRefreshToken(record.id);
    recordAudit({
      actorId: record.userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: record.userId,
    });
  }
}

export function logoutEverywhere(userId: string): number {
  return revokeAllUserTokens(userId);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = findUserById(userId);
  if (!user) throw new UnauthorizedError();

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  updateUser(userId, { passwordHash: await hashPassword(newPassword) });

  // A password change should end every other session.
  revokeAllUserTokens(userId);
  recordAudit({
    actorId: userId,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: userId,
  });
}

export function currentSession(userId: string): { user: PublicUser; permissions: Permission[] } {
  const user = findUserById(userId);
  if (!user) throw new UnauthorizedError();
  return {
    user: toPublicUser(user),
    permissions: user.role ? listPermissionsForRole(user.role) : [],
  };
}

/** Cookie options shared by every place that writes or clears the refresh cookie. */
export const REFRESH_COOKIE = 'pc_refresh';

export const refreshCookieOptions = {
  httpOnly: true,
  // `secure` breaks plain-HTTP local development, so it follows NODE_ENV.
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: refreshTokenTtlMs,
} as const;
