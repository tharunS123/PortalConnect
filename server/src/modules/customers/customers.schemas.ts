import { z } from 'zod';

export const customerStatusSchema = z.enum(['active', 'inactive', 'prospect']);

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  email: z.email('Enter a valid email address').max(254).toLowerCase().nullish(),
  phone: z.string().trim().max(40).nullish(),
  creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative').max(1_000_000_000),
  status: customerStatusSchema.default('active'),
  notes: z.string().trim().max(2000).nullish(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: customerStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['name', 'creditLimit', 'status', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export const customerIdParamSchema = z.object({ id: z.uuid('Invalid identifier') });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
