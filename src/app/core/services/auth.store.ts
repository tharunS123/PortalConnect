import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { type Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '@env/environment';
import type {
  AuthSessionResponse,
  ChangePasswordRequest,
  CurrentSessionResponse,
  Permission,
  PermissionAction,
  RegisterRequest,
  User,
} from '../models';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Holds the session for the whole app.
 *
 * The access token lives in a private signal — in memory only. It is
 * deliberately not written to `localStorage` or `sessionStorage`, so an XSS
 * payload cannot read a long-lived credential out of storage. Survival across
 * a page reload comes from the httpOnly refresh cookie instead, replayed by
 * `restoreSession()` during bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUser = signal<User | null>(null);
  private readonly currentPermissions = signal<readonly Permission[]>([]);
  private readonly authStatus = signal<AuthStatus>('unknown');

  readonly user = this.currentUser.asReadonly();
  readonly permissions = this.currentPermissions.asReadonly();
  readonly status = this.authStatus.asReadonly();

  readonly isAuthenticated = computed(() => this.authStatus() === 'authenticated');
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly displayName = computed(() => this.currentUser()?.name ?? '');

  readonly initials = computed(() => {
    const name = this.currentUser()?.name?.trim();
    if (!name) return '?';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

  /** The raw token, for the auth interceptor only. */
  token(): string | null {
    return this.accessToken();
  }

  /**
   * Whether the current role may perform `action` on `menu`.
   *
   * This mirrors the server's matrix so the UI can hide controls the user
   * cannot use. It is a convenience, not a control: every endpoint re-checks
   * the same permission before doing anything.
   */
  can(menu: string, action: PermissionAction = 'canView'): boolean {
    return this.currentPermissions().find((entry) => entry.menu === menu)?.[action] ?? false;
  }

  /** Replay the refresh cookie at startup to restore a session across reloads. */
  restoreSession(): Observable<boolean> {
    return this.http
      .post<AuthSessionResponse>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((session) => this.applySession(session)),
        map(() => true),
        catchError(() => {
          this.authStatus.set('anonymous');
          return of(false);
        }),
      );
  }

  login(username: string, password: string): Observable<AuthSessionResponse> {
    return this.http
      .post<AuthSessionResponse>(
        `${this.baseUrl}/login`,
        { username, password },
        { withCredentials: true },
      )
      .pipe(tap((session) => this.applySession(session)));
  }

  register(payload: RegisterRequest): Observable<{ user: User; message: string }> {
    return this.http.post<{ user: User; message: string }>(`${this.baseUrl}/register`, payload);
  }

  /** Exchange the refresh cookie for a new access token. Used by the interceptor. */
  refresh(): Observable<AuthSessionResponse> {
    return this.http
      .post<AuthSessionResponse>(`${this.baseUrl}/refresh`, {}, { withCredentials: true })
      .pipe(tap((session) => this.applySession(session)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => this.clear()),
      catchError(() => {
        // Even if the server call fails, drop local state — the user asked to leave.
        this.clear();
        return of(void 0);
      }),
    );
  }

  changePassword(payload: ChangePasswordRequest): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/change-password`, payload, { withCredentials: true })
      .pipe(tap(() => this.clear()));
  }

  /** Re-read the caller's profile and permissions from the API. */
  reload(): Observable<CurrentSessionResponse> {
    return this.http.get<CurrentSessionResponse>(`${this.baseUrl}/me`).pipe(
      tap((session) => {
        this.currentUser.set(session.user);
        this.currentPermissions.set(session.permissions);
      }),
    );
  }

  clear(): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.currentPermissions.set([]);
    this.authStatus.set('anonymous');
  }

  private applySession(session: AuthSessionResponse): void {
    this.accessToken.set(session.accessToken);
    this.currentUser.set(session.user);
    this.currentPermissions.set(session.permissions);
    this.authStatus.set('authenticated');
  }
}
