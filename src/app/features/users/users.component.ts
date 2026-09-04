import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime, type Observable } from 'rxjs';
import { AuthStore } from '@core/services/auth.store';
import { UserService } from '@core/services/user.service';
import { NotificationService } from '@core/services/notification.service';
import { apiErrorMessage } from '@core/services/api-error';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog.component';
import type { ConfirmDialogData } from '@shared/components/confirm-dialog.component';
import { StatusChipComponent } from '@shared/components/status-chip.component';
import type { ListUsersQuery, Paginated, Role, User } from '@core/models';
import { UserEditDialogComponent } from './user-edit-dialog.component';
import type { UserEditDialogData } from './user-edit-dialog.component';

const EMPTY_PAGE: Paginated<User> = { items: [], total: 0, page: 1, pageSize: 10 };

@Component({
  selector: 'app-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
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
    MatTooltipModule,
    MatProgressBarModule,
    StatusChipComponent,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent {
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(NotificationService);

  protected readonly canEdit = computed(() => this.auth.can('users', 'canEdit'));
  protected readonly canDelete = computed(() => this.auth.can('users', 'canDelete'));
  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? '');

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  // Debounced so typing does not fire a request per keystroke.
  private readonly search = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300)), {
    initialValue: '',
  });

  protected readonly roleFilter = signal<string>('');
  protected readonly statusFilter = signal<'' | 'true' | 'false'>('');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);
  protected readonly sort = signal<Sort>({ active: 'createdAt', direction: 'desc' });

  protected readonly displayedColumns = computed(() =>
    this.canEdit() || this.canDelete()
      ? ['name', 'username', 'email', 'role', 'status', 'lastLogin', 'actions']
      : ['name', 'username', 'email', 'role', 'status', 'lastLogin'],
  );

  private readonly query = computed<ListUsersQuery>(() => ({
    search: this.search() || undefined,
    role: this.roleFilter() || undefined,
    isActive: this.statusFilter() === '' ? undefined : this.statusFilter() === 'true',
    page: this.pageIndex() + 1,
    pageSize: this.pageSize(),
    sortBy: (this.sort().active as ListUsersQuery['sortBy']) ?? 'createdAt',
    sortDir: this.sort().direction === 'asc' ? 'asc' : 'desc',
  }));

  // Paging, sorting and filtering all happen server-side, so the browser never
  // downloads the whole user table just to show ten rows.
  protected readonly page = rxResource<Paginated<User>, ListUsersQuery>({
    params: () => this.query(),
    stream: ({ params }) => this.users.list(params),
    defaultValue: EMPTY_PAGE,
  });

  protected readonly roles = rxResource<Role[], true>({
    params: () => true,
    stream: () => this.users.roles(),
    defaultValue: [],
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
    this.roleFilter.set('');
    this.statusFilter.set('');
    this.pageIndex.set(0);
  }

  protected roleLabel(code: string | null): string {
    if (!code) return 'Unassigned';
    return this.roles.value().find((role) => role.code === code)?.name ?? code;
  }

  protected edit(user: User): void {
    this.dialog
      .open<UserEditDialogComponent, UserEditDialogData, User | undefined>(
        UserEditDialogComponent,
        { data: { user, roles: this.roles.value() }, autoFocus: 'first-tabbable' },
      )
      .afterClosed()
      .subscribe((updated) => {
        if (updated) this.page.reload();
      });
  }

  protected toggleActive(user: User): void {
    const activating = !user.isActive;

    this.confirm({
      title: activating ? `Activate ${user.username}?` : `Deactivate ${user.username}?`,
      message: activating
        ? 'They will be able to sign in immediately.'
        : 'They will be signed out of every device and blocked from signing in.',
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      destructive: !activating,
    }).subscribe((confirmed) => {
      if (!confirmed) return;

      this.users.update(user.id, { isActive: activating }).subscribe({
        next: () => {
          this.notifications.success(
            `${user.username} ${activating ? 'activated' : 'deactivated'}.`,
          );
          this.page.reload();
        },
        error: (error: unknown) => this.notifications.error(apiErrorMessage(error)),
      });
    });
  }

  protected remove(user: User): void {
    this.confirm({
      title: `Delete ${user.username}?`,
      message: 'This permanently removes the account and cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((confirmed) => {
      if (!confirmed) return;

      this.users.remove(user.id).subscribe({
        next: () => {
          this.notifications.success(`${user.username} deleted.`);
          this.page.reload();
        },
        error: (error: unknown) => this.notifications.error(apiErrorMessage(error)),
      });
    });
  }

  private confirm(data: ConfirmDialogData): Observable<boolean | undefined> {
    return this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, { data })
      .afterClosed();
  }
}
