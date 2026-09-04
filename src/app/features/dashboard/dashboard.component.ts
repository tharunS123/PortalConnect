import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { map, of } from 'rxjs';
import { AuthStore } from '@core/services/auth.store';
import { CustomerService } from '@core/services/customer.service';
import { UserService } from '@core/services/user.service';
import type { CustomerStats } from '@core/models';

interface StatTile {
  label: string;
  value: string;
  icon: string;
  hint: string;
}

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly auth = inject(AuthStore);
  private readonly customers = inject(CustomerService);
  private readonly users = inject(UserService);

  protected readonly user = this.auth.user;
  protected readonly canViewUsers = computed(() => this.auth.can('users'));
  protected readonly canViewCustomers = computed(() => this.auth.can('customers'));

  /** Each tile loads only if the caller may see it, so no request 403s. */
  protected readonly customerStats = rxResource<CustomerStats | null, boolean>({
    params: () => this.canViewCustomers(),
    stream: ({ params: allowed }) => (allowed ? this.customers.stats() : of(null)),
    defaultValue: null,
  });

  // `pageSize: 1` — we only want the `total`, not the rows.
  protected readonly userSummary = rxResource<number | null, boolean>({
    params: () => this.canViewUsers(),
    stream: ({ params: allowed }) =>
      allowed ? this.users.list({ pageSize: 1 }).pipe(map((page) => page.total)) : of(null),
    defaultValue: null,
  });

  protected readonly pendingUsers = rxResource<number | null, boolean>({
    params: () => this.canViewUsers(),
    stream: ({ params: allowed }) =>
      allowed
        ? this.users.list({ pageSize: 1, isActive: false }).pipe(map((page) => page.total))
        : of(null),
    defaultValue: null,
  });

  protected readonly loading = computed(
    () =>
      this.customerStats.isLoading() ||
      this.userSummary.isLoading() ||
      this.pendingUsers.isLoading(),
  );

  protected readonly tiles = computed<StatTile[]>(() => {
    const tiles: StatTile[] = [];
    const stats = this.customerStats.value();

    if (this.canViewUsers()) {
      tiles.push({
        label: 'Total users',
        value: format(this.userSummary.value()),
        icon: 'group',
        hint: 'Accounts in the portal',
      });
      tiles.push({
        label: 'Awaiting activation',
        value: format(this.pendingUsers.value()),
        icon: 'pending_actions',
        hint: 'Registrations needing review',
      });
    }

    if (this.canViewCustomers() && stats) {
      tiles.push({
        label: 'Customers',
        value: format(stats.total),
        icon: 'contacts',
        hint: `${stats.active} active · ${stats.prospect} prospect`,
      });
      tiles.push({
        label: 'Total credit limit',
        value: currency(stats.totalCreditLimit),
        icon: 'account_balance',
        hint: 'Across all customers',
      });
    }

    return tiles;
  });

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  protected reload(): void {
    this.customerStats.reload();
    this.userSummary.reload();
    this.pendingUsers.reload();
  }
}

function format(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

function currency(value: number): string {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
