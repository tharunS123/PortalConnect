import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { AuthStore } from '@core/services/auth.store';
import { NotificationService } from '@core/services/notification.service';
import { apiErrorMessage } from '@core/services/api-error';
import type { Gender } from '@core/models';

/** Mirrors the server's password policy so the rules can be shown as you type. */
const PASSWORD_RULES = [
  { label: 'At least 12 characters', test: (value: string): boolean => value.length >= 12 },
  { label: 'A lowercase letter', test: (value: string): boolean => /[a-z]/.test(value) },
  { label: 'An uppercase letter', test: (value: string): boolean => /[A-Z]/.test(value) },
  { label: 'A digit', test: (value: string): boolean => /[0-9]/.test(value) },
  { label: 'A symbol', test: (value: string): boolean => /[^A-Za-z0-9]/.test(value) },
] as const;

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatProgressBarModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './auth.scss',
})
export class RegisterComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly genders: { value: Gender; label: string }[] = [
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
    { value: 'undisclosed', label: 'Prefer not to say' },
  ];

  protected readonly form = this.formBuilder.nonNullable.group({
    username: [
      '',
      [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9._-]+$/)],
    ],
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12)]],
    gender: this.formBuilder.nonNullable.control<Gender>('undisclosed'),
  });

  private readonly password = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  protected readonly passwordRules = computed(() =>
    PASSWORD_RULES.map((rule) => ({ label: rule.label, met: rule.test(this.password()) })),
  );

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.auth.register(this.form.getRawValue()).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.notifications.success(result.message);
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(error, 'Registration failed. Please try again.'));
      },
    });
  }
}
