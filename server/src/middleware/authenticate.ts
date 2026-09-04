import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/tokens.js';
import { UnauthorizedError } from '../lib/errors.js';
import { findUserById } from '../modules/users/users.repository.js';
import type { AuthenticatedUser } from '../types.js';

/**
 * Verifies the bearer token and re-reads the user from the database on every
 * request. Re-reading costs a cheap indexed lookup and means a deactivated or
 * demoted account loses access immediately, rather than when its token expires.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get('authorization');

  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing bearer token'));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    const user = findUserById(payload.sub);

    if (!user) {
      next(new UnauthorizedError('Account no longer exists'));
      return;
    }
    if (!user.isActive) {
      next(new UnauthorizedError('Account is deactivated', 'ACCOUNT_INACTIVE'));
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role ?? '',
    } satisfies AuthenticatedUser;

    next();
  } catch (error) {
    next(error);
  }
}
