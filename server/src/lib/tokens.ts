import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  username: string;
  role: string;
}

const ISSUER = 'portalconnect';
const AUDIENCE = 'portalconnect-web';

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: payload.sub,
  };
  return jwt.sign({ username: payload.username, role: payload.role }, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtAccessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof decoded === 'string' || !decoded.sub) {
      throw new UnauthorizedError('Malformed access token', 'TOKEN_INVALID');
    }

    return {
      sub: decoded.sub,
      username: String(decoded['username'] ?? ''),
      role: String(decoded['role'] ?? ''),
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired', 'TOKEN_EXPIRED');
    }
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError('Access token is invalid', 'TOKEN_INVALID');
  }
}

/**
 * Refresh tokens are opaque random strings rather than JWTs: they must be
 * revocable, and only their SHA-256 digest is persisted, so a database leak
 * does not hand an attacker usable sessions.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
};

/** Convert a duration string such as `7d` into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(duration);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Unsupported duration: ${duration}`);
  }
  const unit = DURATION_UNITS[match[2]];
  if (unit === undefined) throw new Error(`Unsupported duration unit: ${match[2]}`);
  return Number(match[1]) * unit;
}

export const refreshTokenTtlMs = durationToMs(env.REFRESH_TOKEN_TTL);
export const accessTokenTtlMs = durationToMs(env.ACCESS_TOKEN_TTL);
