import { z } from 'zod';

/**
 * Password policy, expressed as separate checks so the client can show exactly
 * which requirement failed instead of one opaque regex error.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, dot, underscore, hyphen');

export const genderSchema = z.enum(['male', 'female', 'other', 'undisclosed']);

export const registerSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email address').max(254).toLowerCase(),
  password: passwordSchema,
  gender: genderSchema.default('undisclosed'),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(32),
  password: z.string().min(1, 'Password is required').max(128),
});

/** Fields an administrator may change on someone else's account. */
export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().max(254).toLowerCase().optional(),
    gender: genderSchema.optional(),
    role: z.string().trim().min(1).max(32).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

/** Fields a user may change on their own account — deliberately not role/isActive. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().max(254).toLowerCase().optional(),
    gender: genderSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.string().trim().max(32).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['name', 'username', 'email', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({ id: z.uuid('Invalid identifier') });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
