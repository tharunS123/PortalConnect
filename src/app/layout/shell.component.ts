import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';
import { AuthStore } from '@core/services/auth.store';
import { ThemeService } from '@core/services/theme.service';
import { NotificationService } from '@core/services/notification.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** When set, the item only renders if the user can view this menu. */
  menu?: string;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly breakpoints = inject(BreakpointObserver);

  protected readonly theme = inject(ThemeService);

  protected readonly user = this.auth.user;
  protected readonly initials = this.auth.initials;

  /** Below the medium breakpoint the drawer overlays instead of docking. */
  protected readonly isHandset = toSignal(
    this.breakpoints.observe([Breakpoints.XSmall, Breakpoints.Small]).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly drawerOpen = signal(true);

  constructor() {
    // Docked open on wide screens, hidden on phones where it would cover the
    // page. Re-runs whenever the breakpoint changes, including on rotation.
    effect(() => {
      this.drawerOpen.set(!this.isHandset());
    });
  }

  protected readonly navItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [{ label: 'Dashboard', icon: 'dashboard', route: '/dashboard' }];

    if (this.auth.can('users')) {
      items.push({ label: 'Users', icon: 'group', route: '/users', menu: 'users' });
    }
    if (this.auth.can('customers')) {
      items.push({ label: 'Customers', icon: 'contacts', route: '/customers', menu: 'customers' });
    }

    return items;
  });

  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'No role';
  });

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  /** On a phone the drawer covers the content, so close it after navigating. */
  protected onNavigate(): void {
    if (this.isHandset()) this.drawerOpen.set(false);
  }

  protected logout(): void {
    this.auth.logout().subscribe(() => {
      this.notifications.info('You have been signed out.');
      void this.router.navigate(['/login']);
    });
  }
}
