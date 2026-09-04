import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { UnauthorizedError } from '../../lib/errors.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  type ChangePasswordInput,
} from '../users/users.schemas.js';
import * as authService from './auth.service.js';
import { REFRESH_COOKIE, refreshCookieOptions } from './auth.service.js';
import type { AuthSession, SessionContext } from './auth.service.js';
import type { LoginInput, RegisterInput } from '../users/users.schemas.js';
import type { Request, Response } from 'express';

/**
 * Credential endpoints are the prime target for brute force and enumeration,
 * so they get a much tighter budget than the rest of the API.
 */
const credentialLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    },
  },
});

function sessionContext(req: Request): SessionContext {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

/** `validate()` has already replaced `req.body` with the parsed, typed value. */
function body<T>(req: Request): T {
  return req.body as T;
}

function refreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' && token ? token : undefined;
}

/**
 * The refresh token goes out only as an httpOnly cookie. Keeping it out of the
 * JSON body means page JavaScript — and therefore any XSS payload — cannot read it.
 */
function sendSession(res: Response, session: AuthSession): void {
  const { refreshToken, ...body } = session;
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
  res.json(body);
}

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  credentialLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.register(body<RegisterInput>(req), sessionContext(req));
    res.status(201).json({
      user,
      message: 'Registration received. An administrator must activate your account.',
    });
  }),
);

authRouter.post(
  '/login',
  credentialLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    sendSession(res, await authService.login(body<LoginInput>(req), sessionContext(req)));
  }),
);

authRouter.post('/refresh', (req, res) => {
  const token = refreshCookie(req);

  if (!token) {
    throw new UnauthorizedError('No session cookie present', 'REFRESH_MISSING');
  }

  sendSession(res, authService.refresh(token, sessionContext(req)));
});

authRouter.post('/logout', (req, res) => {
  authService.logout(refreshCookie(req));
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.status(204).send();
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json(authService.currentSession(req.user!.id));
});

authRouter.post(
  '/change-password',
  authenticate,
  credentialLimiter,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = body<ChangePasswordInput>(req);
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    res.status(204).send();
  }),
);

authRouter.post('/logout-all', authenticate, (req, res) => {
  const revoked = authService.logoutEverywhere(req.user!.id);
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.json({ revokedSessions: revoked });
});
