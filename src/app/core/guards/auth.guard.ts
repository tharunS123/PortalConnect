import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from '../services/auth.store';
import { NotificationService } from '../services/notification.service';
import type { PermissionAction } from '../models';

/** Require a signed-in user; otherwise send them to login with a return path. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keep signed-in users away from login/register. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};

/**
 * Gate a route on the same permission matrix the API enforces.
 *
 * This is a usability guard: it stops a user navigating to a page they would
 * only see errors on. The API re-checks every request regardless, so bypassing
 * this in the browser gains an attacker nothing.
 */
export function permissionGuard(menu: string, action: PermissionAction = 'canView'): CanActivateFn {
  return () => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    const notifications = inject(NotificationService);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    if (auth.can(menu, action)) {
      return true;
    }

    notifications.warning('You do not have access to that page.');
    return router.createUrlTree(['/dashboard']);
  };
}
