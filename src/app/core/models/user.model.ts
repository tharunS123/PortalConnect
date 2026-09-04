export type Gender = 'male' | 'female' | 'other' | 'undisclosed';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  gender: Gender | null;
  role: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface RegisterRequest {
  username: string;
  name: string;
  email: string;
  password: string;
  gender: Gender;
}

export interface AdminUpdateUserRequest {
  name?: string;
  email?: string;
  gender?: Gender;
  role?: string | null;
  isActive?: boolean;
}

export interface UpdateProfileRequest {
  name?: string;
  email?: string;
  gender?: Gender;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ListUsersQuery {
  search?: string;
  role?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'username' | 'email' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}
