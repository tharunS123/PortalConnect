import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { debounceTime, type Observable } from 'rxjs';
import { AuthStore } from '@core/services/auth.store';
import { CustomerService } from '@core/services/customer.service';
import { NotificationService } from '@core/services/notification.service';
import { apiErrorMessage } from '@core/services/api-error';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog.component';
import type { ConfirmDialogData } from '@shared/components/confirm-dialog.component';
import { StatusChipComponent } from '@shared/components/status-chip.component';
import type { Customer, CustomerStatus, ListCustomersQuery, Paginated } from '@core/models';
import { CustomerEditDialogComponent } from './customer-edit-dialog.component';
import type { CustomerEditDialogData } from './customer-edit-dialog.component';

const EMPTY_PAGE: Paginated<Customer> = { items: [], total: 0, page: 1, pageSize: 10 };

@Component({
  selector: 'app-customers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    StatusChipComponent,
  ],
  templateUrl: './customers.component.html',
  styleUrl: '../users/users.component.scss',
})
export class CustomersComponent {
  private readonly customers = inject(CustomerService);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(NotificationService);

  // These only decide what to render. The API enforces the same rules again.
  protected readonly canCreate = computed(() => this.auth.can('customers', 'canCreate'));
  protected readonly canEdit = computed(() => this.auth.can('customers', 'canEdit'));
  protected readonly canDelete = computed(() => this.auth.can('customers', 'canDelete'));

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly search = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300)), {
    initialValue: '',
  });

  protected readonly statusFilter = signal<CustomerStatus | ''>('');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);
  protected readonly sort = signal<Sort>({ active: 'name', direction: 'asc' });

  protected readonly statuses: { value: CustomerStatus; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'inactive', label: 'Inactive' },
  ];

  protected readonly displayedColumns = computed(() =>
    this.canEdit() || this.canDelete()
      ? ['name', 'contact', 'creditLimit', 'status', 'actions']
      : ['name', 'contact', 'creditLimit', 'status'],
  );

  private readonly query = computed<ListCustomersQuery>(() => ({
    search: this.search() || undefined,
    status: this.statusFilter() || undefined,
    page: this.pageIndex() + 1,
    pageSize: this.pageSize(),
    sortBy: (this.sort().active as ListCustomersQuery['sortBy']) ?? 'name',
    sortDir: this.sort().direction === 'desc' ? 'desc' : 'asc',
  }));

  protected readonly page = rxResource<Paginated<Customer>, ListCustomersQuery>({
    params: () => this.query(),
    stream: ({ params }) => this.customers.list(params),
    defaultValue: EMPTY_PAGE,
  });

  protected readonly rows = computed(() => this.page.value().items);
  protected readonly total = computed(() => this.page.value().total);
  protected readonly loading = computed(() => this.page.isLoading());
  protected readonly loadError = computed(() =>
    this.page.error() ? apiErrorMessage(this.page.error()) : null,
  );

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  protected onSort(event: Sort): void {
    this.sort.set(event);
    this.pageIndex.set(0);
  }

  protected onFilterChange(): void {
    this.pageIndex.set(0);
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.statusFilter.set('');
    this.pageIndex.set(0);
  }

  protected create(): void {
    this.openEditor({});
  }

  protected edit(customer: Customer): void {
    this.openEditor({ customer });
  }

  protected remove(customer: Customer): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: `Delete ${customer.name}?`,
          message: 'This permanently removes the customer record and cannot be undone.',
          confirmLabel: 'Delete',
          destructive: true,
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.customers.remove(customer.id).subscribe({
          next: () => {
            this.notifications.success(`${customer.name} deleted.`);
            this.page.reload();
          },
          error: (error: unknown) => this.notifications.error(apiErrorMessage(error)),
        });
      });
  }

  private openEditor(data: CustomerEditDialogData): void {
    const closed: Observable<Customer | undefined> = this.dialog
      .open<CustomerEditDialogComponent, CustomerEditDialogData, Customer | undefined>(
        CustomerEditDialogComponent,
        { data, autoFocus: 'first-tabbable' },
      )
      .afterClosed();

    closed.subscribe((saved) => {
      if (saved) this.page.reload();
    });
  }
}
