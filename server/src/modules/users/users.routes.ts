import { Router, type Request } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { recordAudit } from '../auth/auth.repository.js';
import { logoutEverywhere } from '../auth/auth.service.js';
import { listRoles, roleExists } from '../roles/roles.repository.js';
import {
  adminUpdateUserSchema,
  idParamSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  type AdminUpdateUserInput,
  type ListUsersQuery,
  type UpdateProfileInput,
} from './users.schemas.js';
import {
  countAdmins,
  deleteUser,
  findUserByEmail,
  findUserById,
  listUsers,
  toPublicUser,
  updateUser,
} from './users.repository.js';

export const usersRouter: Router = Router();

/** `validate(idParamSchema, 'params')` has already proved this is a UUID string. */
function pathId(req: Request): string {
  return (req.params as { id: string }).id;
}

// Everything below requires a valid access token.
usersRouter.use(authenticate);

// ---------------------------------------------------------------------------
// Self-service — available to any authenticated user.
// ---------------------------------------------------------------------------

usersRouter.get('/me', (req, res) => {
  const user = findUserById(req.user!.id);
  if (!user) throw new NotFoundError('User');
  res.json(toPublicUser(user));
});

usersRouter.patch('/me', validate(updateProfileSchema), (req, res) => {
  const input = req.body as UpdateProfileInput;

  if (input.email) {
    const existing = findUserByEmail(input.email);
    if (existing && existing.id !== req.user!.id) {
      throw new ConflictError('An account with that email already exists');
    }
  }

  // `updateProfileSchema` has no `role` or `isActive`, and `validate` strips
  // unknown keys, so a user cannot escalate themselves through this endpoint.
  const updated = updateUser(req.user!.id, input);
  if (!updated) throw new NotFoundError('User');
  res.json(updated);
});

usersRouter.get('/roles', (_req, res) => {
  res.json(listRoles());
});

// ---------------------------------------------------------------------------
// Administration — gated on the `users` menu permission matrix.
// ---------------------------------------------------------------------------

usersRouter.get(
  '/',
  requirePermission('users', 'canView'),
  validate(listUsersQuerySchema, 'query'),
  (req, res) => {
    res.json(listUsers(req.query as unknown as ListUsersQuery));
  },
);

usersRouter.get(
  '/:id',
  requirePermission('users', 'canView'),
  validate(idParamSchema, 'params'),
  (req, res) => {
    const user = findUserById(pathId(req));
    if (!user) throw new NotFoundError('User');
    res.json(toPublicUser(user));
  },
);

usersRouter.patch(
  '/:id',
  requirePermission('users', 'canEdit'),
  validate(idParamSchema, 'params'),
  validate(adminUpdateUserSchema),
  (req, res) => {
    const target = findUserById(pathId(req));
    if (!target) throw new NotFoundError('User');

    const input = req.body as AdminUpdateUserInput;

    if (input.role && !roleExists(input.role)) {
      throw new BadRequestError(`Unknown role: ${input.role}`);
    }

    if (input.email) {
      const existing = findUserByEmail(input.email);
      if (existing && existing.id !== target.id) {
        throw new ConflictError('An account with that email already exists');
      }
    }

    // Guard against locking everyone out of administration.
    const losingAdmin =
      target.role === 'admin' &&
      ((input.role !== undefined && input.role !== 'admin') || input.isActive === false);

    if (losingAdmin && countAdmins() <= 1) {
      throw new BadRequestError('At least one active administrator must remain');
    }

    const updated = updateUser(target.id, input);
    if (!updated) throw new NotFoundError('User');

    // Demotion or deactivation must take effect now, not at token expiry.
    if (input.isActive === false || (input.role !== undefined && input.role !== target.role)) {
      logoutEverywhere(target.id);
    }

    recordAudit({
      actorId: req.user!.id,
      action: 'user.updated',
      entityType: 'user',
      entityId: target.id,
      metadata: input,
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  },
);

usersRouter.delete(
  '/:id',
  requirePermission('users', 'canDelete'),
  validate(idParamSchema, 'params'),
  (req, res) => {
    const target = findUserById(pathId(req));
    if (!target) throw new NotFoundError('User');

    if (target.id === req.user!.id) {
      throw new BadRequestError('You cannot delete your own account');
    }
    if (target.role === 'admin' && countAdmins() <= 1) {
      throw new BadRequestError('At least one active administrator must remain');
    }

    deleteUser(target.id);
    recordAudit({
      actorId: req.user!.id,
      action: 'user.deleted',
      entityType: 'user',
      entityId: target.id,
      ipAddress: req.ip ?? null,
    });

    res.status(204).send();
  },
);
