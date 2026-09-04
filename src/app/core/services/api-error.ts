import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody, ApiFieldError } from '../models';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  );
}

/** The API's stable error code, when the response carried one. */
export function apiErrorCode(error: unknown): string | null {
  if (error instanceof HttpErrorResponse && isApiErrorBody(error.error)) {
    return error.error.error.code;
  }
  return null;
}

/** A message safe to show a user, whatever actually went wrong. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
    if (isApiErrorBody(error.error)) {
      const { message, details } = error.error.error;
      const fields = fieldErrors(details);
      // Field-level detail is far more actionable than "validation failed".
      return fields.length > 0 ? fields.map((item) => item.message).join(' ') : message;
    }
  }
  return fallback;
}

export function fieldErrors(details: unknown): ApiFieldError[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (item): item is ApiFieldError =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ApiFieldError).field === 'string' &&
      typeof (item as ApiFieldError).message === 'string',
  );
}
