import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="not-found">
      <mat-icon class="not-found__icon" fontSet="material-icons-outlined">explore_off</mat-icon>
      <h1>Page not found</h1>
      <p>The page you were looking for does not exist or has moved.</p>
      <a mat-flat-button routerLink="/dashboard">Back to dashboard</a>
    </div>
  `,
  styles: `
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--pc-space-sm);
      min-height: 100vh;
      padding: var(--pc-space-lg);
      text-align: center;
      background: var(--mat-sys-surface-container-lowest);
      color: var(--mat-sys-on-surface);
    }

    .not-found__icon {
      width: 64px;
      height: 64px;
      font-size: 64px;
      color: var(--mat-sys-on-surface-variant);
    }

    h1 {
      margin: 0;
      font-weight: 400;
    }

    p {
      margin: 0 0 var(--pc-space-md);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class NotFoundComponent {}
