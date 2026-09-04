import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CustomerService } from '@core/services/customer.service';
import { NotificationService } from '@core/services/notification.service';
import { apiErrorMessage } from '@core/services/api-error';
import type { Customer, CustomerStatus } from '@core/models';

export interface CustomerEditDialogData {
  /** Absent when creating a new customer. */
  customer?: Customer;
}

@Component({
  selector: 'app-customer-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  templateUrl: './customer-edit-dialog.component.html',
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--pc-space-xs);
      min-width: min(460px, 80vw);
      padding-top: var(--pc-space-sm);
    }

    .row {
      display: flex;
      gap: var(--pc-space-md);
    }

    .row > * {
      flex: 1;
    }

    .error {
      margin: 0 0 var(--pc-space-sm);
      color: var(--mat-sys-error);
      font-size: 0.8rem;
    }

    @media (max-width: 560px) {
      .row {
        flex-direction: column;
        gap: var(--pc-space-xs);
      }
    }
  `,
})
export class CustomerEditDialogComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly customers = inject(CustomerService);
  private readonly notifications = inject(NotificationService);

  protected readonly dialogRef =
    inject<MatDialogRef<CustomerEditDialogComponent, Customer | undefined>>(MatDialogRef);
  protected readonly data = inject<CustomerEditDialogData>(MAT_DIALOG_DATA);

  protected readonly isEdit = Boolean(this.data.customer);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly statuses: { value: CustomerStatus; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'inactive', label: 'Inactive' },
  ];

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.customer?.name ?? '', [Validators.required]],
    email: [this.data.customer?.email ?? '', [Validators.email]],
    phone: [this.data.customer?.phone ?? ''],
    creditLimit: [this.data.customer?.creditLimit ?? 0, [Validators.required, Validators.min(0)]],
    status: this.formBuilder.nonNullable.control<CustomerStatus>(
      this.data.customer?.status ?? 'active',
    ),
    notes: [this.data.customer?.notes ?? ''],
  });

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const value = this.form.getRawValue();
    const payload = {
      name: value.name,
      // Blank optional fields are stored as null rather than empty strings.
      email: value.email || null,
      phone: value.phone || null,
      creditLimit: Number(value.creditLimit),
      status: value.status,
      notes: value.notes || null,
    };

    const request = this.data.customer
      ? this.customers.update(this.data.customer.id, payload)
      : this.customers.create(payload);

    request.subscribe({
      next: (customer) => {
        this.saving.set(false);
        this.notifications.success(`${customer.name} ${this.isEdit ? 'updated' : 'created'}.`);
        this.dialogRef.close(customer);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(apiErrorMessage(error, 'Could not save the customer.'));
      },
    });
  }
}
