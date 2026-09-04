import type {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  type Observable,
  catchError,
  filter,
  switchMap,
  take,
  throwError,
} from 'rxjs';
import { environment } from '@env/environment';
import { AuthStore } from '../services/auth.store';

/** Endpoints that must never carry a bearer token or trigger a refresh loop. */
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

/**
 * Shared across every request so that N concurrent 401s trigger exactly one
 * refresh call; the rest queue on its result. Without this, a dashboard that
 * fires several requests at once would burn several refresh tokens and trip
 * the server's reuse detection.
 */
let refreshInFlight = false;
const refreshedToken = new BehaviorSubject<string | null>(null);

function isPublic(url: string): boolean {
  return PUBLIC_PATHS.some((path) => url.includes(`${environment.apiUrl}${path}`));
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  // Only our own API gets the credential.
  if (!request.url.startsWith(environment.apiUrl) || isPublic(request.url)) {
    return next(request);
  }

  const token = auth.token();
  const authorised = token ? withToken(request, token) : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      const response = error as HttpErrorResponse;

      if (response.status !== 401) {
        return throwError(() => error);
      }

      return retryWithFreshToken(request, next, auth, router, error);
    }),
  );
};

function retryWithFreshToken(
  request: HttpRequest<unknown>,
  next: Parameters<HttpInterceptorFn>[1],
  auth: AuthStore,
  router: Router,
  originalError: unknown,
): Observable<HttpEvent<unknown>> {
  if (refreshInFlight) {
    // Wait for the in-flight refresh, then replay this request once.
    return refreshedToken.pipe(
      filter((value): value is string => value !== null),
      take(1),
      switchMap((token) => next(withToken(request, token))),
    );
  }

  refreshInFlight = true;
  refreshedToken.next(null);

  return auth.refresh().pipe(
    switchMap((session) => {
      refreshInFlight = false;
      refreshedToken.next(session.accessToken);
      return next(withToken(request, session.accessToken));
    }),
    catchError(() => {
      refreshInFlight = false;
      auth.clear();
      void router.navigate(['/login'], {
        queryParams: { returnUrl: router.url, reason: 'session-expired' },
      });
      return throwError(() => originalError);
    }),
  );
}
