import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type {
  Customer,
  CustomerPayload,
  CustomerStats,
  ListCustomersQuery,
  Paginated,
} from '../models';
import { toParams } from './user.service';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/customers`;

  list(query: ListCustomersQuery = {}): Observable<Paginated<Customer>> {
    return this.http.get<Paginated<Customer>>(this.baseUrl, { params: toParams(query) });
  }

  stats(): Observable<CustomerStats> {
    return this.http.get<CustomerStats>(`${this.baseUrl}/stats`);
  }

  create(payload: CustomerPayload): Observable<Customer> {
    return this.http.post<Customer>(this.baseUrl, payload);
  }

  update(id: string, payload: Partial<CustomerPayload>): Observable<Customer> {
    return this.http.patch<Customer>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
