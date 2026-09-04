import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { getPermission } from '../modules/roles/roles.repository.js';
import type { PermissionAction } from '../types.js';

const ACTION_VERB: Record<PermissionAction, string> = {
  canView: 'view',
  canCreate: 'create',
  canEdit: 'edit',
  canDelete: 'delete',
};

/** Restrict a route to an explicit set of role codes. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError(`This action requires one of: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

/**
 * Restrict a route by the role/menu permission matrix.
 *
 * The original app read this matrix in the browser and used it only to decide
 * which buttons to render — the endpoints themselves were wide open. Enforcing
 * it here makes the UI's permission hints advisory rather than load-bearing.
 */
export function requirePermission(menu: string, action: PermissionAction) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const permission = getPermission(req.user.role, menu);

    if (!permission?.[action]) {
      next(new ForbiddenError(`You do not have permission to ${ACTION_VERB[action]} ${menu}`));
      return;
    }

    next();
  };
}
