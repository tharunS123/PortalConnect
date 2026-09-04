import type { User } from './user.model';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** One row of the role/menu permission matrix, as enforced by the API. */
export interface Permission {
  menu: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export type PermissionAction = 'canView' | 'canCreate' | 'canEdit' | 'canDelete';

export interface Menu {
  code: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

/** Body returned by `POST /api/auth/login` and `/refresh`. */
export interface AuthSessionResponse {
  user: User;
  permissions: Permission[];
  accessToken: string;
  expiresIn: number;
}

export interface CurrentSessionResponse {
  user: User;
  permissions: Permission[];
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Usually `ApiFieldError[]` for validation failures; shape varies by code. */
    details?: unknown;
    requestId?: string;
  };
}
