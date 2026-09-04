import type { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';
import { apiErrorMessage } from '../services/api-error';

/**
 * Surfaces failures the user cannot otherwise see. 401 and 422 are handled
 * closer to where they happen — the auth interceptor retries the first, and
 * forms render the second inline — so re-announcing them here would be noise.
 */
const SILENT_STATUSES = new Set([401, 422]);

export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const notifications = inject(NotificationService);

  return next(request).pipe(
    catchError((error: unknown) => {
      const response = error as HttpErrorResponse;

      if (!SILENT_STATUSES.has(response.status)) {
        notifications.error(apiErrorMessage(error));
      }

      return throwError(() => error);
    }),
  );
};
