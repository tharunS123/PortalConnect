import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { apiErrorCode, apiErrorMessage, fieldErrors } from './api-error';

function apiError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('apiErrorMessage', () => {
  it('prefers field-level detail over the generic message', () => {
    const error = apiError(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The submitted data is invalid',
        details: [{ field: 'password', message: 'Password must contain a digit' }],
      },
    });

    expect(apiErrorMessage(error)).toBe('Password must contain a digit');
  });

  it('joins multiple field errors', () => {
    const error = apiError(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'invalid',
        details: [
          { field: 'email', message: 'Enter a valid email address.' },
          { field: 'name', message: 'Name is required.' },
        ],
      },
    });

    expect(apiErrorMessage(error)).toBe('Enter a valid email address. Name is required.');
  });

  it('falls back to the API message when there is no field detail', () => {
    const error = apiError(409, {
      error: { code: 'CONFLICT', message: 'That username is already taken' },
    });

    expect(apiErrorMessage(error)).toBe('That username is already taken');
  });

  it('explains a network failure rather than showing status 0', () => {
    expect(apiErrorMessage(apiError(0, null))).toContain('Cannot reach the server');
  });

  it('uses the supplied fallback for an unrecognised shape', () => {
    expect(apiErrorMessage(apiError(500, '<html>oops</html>'), 'Try again')).toBe('Try again');
  });
});

describe('apiErrorCode', () => {
  it('extracts the stable machine-readable code', () => {
    const error = apiError(401, {
      error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' },
    });

    expect(apiErrorCode(error)).toBe('TOKEN_EXPIRED');
  });

  it('returns null when there is no API error body', () => {
    expect(apiErrorCode(new Error('boom'))).toBeNull();
  });
});

describe('fieldErrors', () => {
  it('ignores malformed entries', () => {
    expect(fieldErrors([{ field: 'a', message: 'b' }, 'nope', { field: 1 }])).toEqual([
      { field: 'a', message: 'b' },
    ]);
  });

  it('returns an empty array for non-array details', () => {
    expect(fieldErrors(undefined)).toEqual([]);
  });
});
