export type CustomerStatus = 'active' | 'inactive' | 'prospect';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  creditLimit: number;
  status: CustomerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  creditLimit: number;
  status: CustomerStatus;
  notes?: string | null;
}

export interface CustomerStats {
  total: number;
  active: number;
  prospect: number;
  inactive: number;
  totalCreditLimit: number;
}

export interface ListCustomersQuery {
  search?: string;
  status?: CustomerStatus;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'creditLimit' | 'status' | 'createdAt';
  sortDir?: 'asc' | 'desc';
}
