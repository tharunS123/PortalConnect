import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Thin wrapper over MatSnackBar so components never re-declare styling or
 * duration. Replaces the ngx-toastr dependency the project previously carried.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.show(message, 'notification--success', 4000);
  }

  error(message: string): void {
    // Errors linger: the user usually needs to read and act on them.
    this.show(message, 'notification--error', 8000);
  }

  warning(message: string): void {
    this.show(message, 'notification--warning', 6000);
  }

  info(message: string): void {
    this.show(message, 'notification--info', 4000);
  }

  private show(message: string, panelClass: string, duration: number): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      panelClass: [panelClass],
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }
}
