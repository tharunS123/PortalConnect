import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { UserService } from '@core/services/user.service';
import { NotificationService } from '@core/services/notification.service';
import { apiErrorMessage } from '@core/services/api-error';
import type { Role, User } from '@core/models';

export interface UserEditDialogData {
  user: User;
  roles: Role[];
}

@Component({
  selector: 'app-user-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  templateUrl: './user-edit-dialog.component.html',
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--pc-space-xs);
      min-width: min(420px, 80vw);
      padding-top: var(--pc-space-sm);
    }

    .toggle {
      margin: var(--pc-space-sm) 0;
    }

    .hint {
      margin: 0;
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class UserEditDialogComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly users = inject(UserService);
  private readonly notifications = inject(NotificationService);

  protected readonly dialogRef =
    inject<MatDialogRef<UserEditDialogComponent, User | undefined>>(MatDialogRef);
  protected readonly data = inject<UserEditDialogData>(MAT_DIALOG_DATA);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.data.user.name, [Validators.required]],
    email: [this.data.user.email, [Validators.required, Validators.email]],
    role: [this.data.user.role ?? ''],
    isActive: [this.data.user.isActive],
  });

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    const value = this.form.getRawValue();

    this.users
      .update(this.data.user.id, {
        name: value.name,
        email: value.email,
        role: value.role === '' ? null : value.role,
        isActive: value.isActive,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.notifications.success(`${updated.name} updated.`);
          this.dialogRef.close(updated);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          // Business rules such as "keep one admin" arrive as 400s — show them here.
          this.errorMessage.set(apiErrorMessage(error, 'Could not save the changes.'));
        },
      });
  }
}
