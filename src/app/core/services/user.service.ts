import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '@env/environment';
import type {
  AdminUpdateUserRequest,
  ListUsersQuery,
  Paginated,
  Role,
  UpdateProfileRequest,
  User,
} from '../models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users`;

  list(query: ListUsersQuery = {}): Observable<Paginated<User>> {
    return this.http.get<Paginated<User>>(this.baseUrl, { params: toParams(query) });
  }

  getById(id: string): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/${id}`);
  }

  update(id: string, payload: AdminUpdateUserRequest): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  updateProfile(payload: UpdateProfileRequest): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/me`, payload);
  }

  roles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.baseUrl}/roles`);
  }
}

/** Drop undefined/empty values so the API receives only meaningful filters. */
export function toParams(query: object): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params = params.set(key, String(value));
  }

  return params;
}
