import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthStore } from './auth.store';
import type { AuthSessionResponse } from '../models';

const SESSION: AuthSessionResponse = {
  accessToken: 'token-abc',
  expiresIn: 604800,
  user: {
    id: 'u1',
    username: 'admin',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    gender: 'undisclosed',
    role: 'admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  permissions: [
    { menu: 'users', canView: true, canCreate: true, canEdit: true, canDelete: true },
    { menu: 'customers', canView: true, canCreate: true, canEdit: true, canDelete: false },
  ],
};

describe('AuthStore', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts in an unknown, unauthenticated state', () => {
    expect(store.status()).toBe('unknown');
    expect(store.isAuthenticated()).toBe(false);
    expect(store.token()).toBeNull();
  });

  it('holds the session in memory after a successful login', () => {
    store.login('admin', 'secret').subscribe();
    http.expectOne('/api/auth/login').flush(SESSION);

    expect(store.isAuthenticated()).toBe(true);
    expect(store.isAdmin()).toBe(true);
    expect(store.token()).toBe('token-abc');
    expect(store.displayName()).toBe('Ada Lovelace');
  });

  it('never writes the token to browser storage', () => {
    store.login('admin', 'secret').subscribe();
    http.expectOne('/api/auth/login').flush(SESSION);

    const stored = [...Object.values(localStorage), ...Object.values(sessionStorage)].join('|');

    expect(stored).not.toContain('token-abc');
  });

  it('derives initials from the display name', () => {
    store.login('admin', 'secret').subscribe();
    http.expectOne('/api/auth/login').flush(SESSION);

    expect(store.initials()).toBe('AL');
  });

  it('answers permission questions from the server-supplied matrix', () => {
    store.login('admin', 'secret').subscribe();
    http.expectOne('/api/auth/login').flush(SESSION);

    expect(store.can('users', 'canEdit')).toBe(true);
    expect(store.can('customers', 'canDelete')).toBe(false);
    // An unknown menu is denied rather than defaulting to allowed.
    expect(store.can('billing', 'canView')).toBe(false);
  });

  it('marks the user anonymous when the refresh cookie is not accepted', () => {
    let restored: boolean | undefined;
    store.restoreSession().subscribe((value) => (restored = value));

    http
      .expectOne('/api/auth/refresh')
      .flush(
        { error: { code: 'REFRESH_MISSING', message: 'no cookie' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(restored).toBe(false);
    expect(store.status()).toBe('anonymous');
  });

  it('clears every trace of the session on logout', () => {
    store.login('admin', 'secret').subscribe();
    http.expectOne('/api/auth/login').flush(SESSION);

    store.logout().subscribe();
    http.expectOne('/api/auth/logout').flush(null);

    expect(store.isAuthenticated()).toBe(false);
    expect(store.token()).toBeNull();
    expect(store.user()).toBeNull();
    expect(store.permissions()).toEqual([]);
  });
});
