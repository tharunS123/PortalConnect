import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { AuthStore } from '@core/services/auth.store';
import { UserService } from '@core/services/user.service';
import { NotificationService } from '@core/services/notification.service';
import { apiErrorMessage } from '@core/services/api-error';
import type { Gender } from '@core/models';

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  protected readonly user = this.auth.user;
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly genders: { value: Gender; label: string }[] = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
    { value: 'undisclosed', label: 'Prefer not to say' },
  ];

  protected readonly profileForm = this.formBuilder.nonNullable.group({
    name: [this.user()?.name ?? '', [Validators.required]],
    email: [this.user()?.email ?? '', [Validators.required, Validators.email]],
    gender: this.formBuilder.nonNullable.control<Gender>(this.user()?.gender ?? 'undisclosed'),
  });

  protected readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(12)]],
  });

  protected saveProfile(): void {
    if (this.profileForm.invalid || this.savingProfile()) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);

    this.users.updateProfile(this.profileForm.getRawValue()).subscribe({
      next: () => {
        // Re-read from the API so the shell header reflects the new name.
        this.auth.reload().subscribe();
        this.savingProfile.set(false);
        this.notifications.success('Profile updated.');
      },
      error: (error: unknown) => {
        this.savingProfile.set(false);
        this.notifications.error(apiErrorMessage(error, 'Could not update your profile.'));
      },
    });
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.savingPassword.set(true);
    this.passwordError.set(null);

    this.auth.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.savingPassword.set(false);
        // The API revokes every session on a password change, so sign in again.
        this.notifications.success('Password changed. Please sign in again.');
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => {
        this.savingPassword.set(false);
        this.passwordError.set(apiErrorMessage(error, 'Could not change your password.'));
      },
    });
  }
}
