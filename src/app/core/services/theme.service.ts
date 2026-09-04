import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'portalconnect.theme';

/**
 * Applies the colour scheme to the document root. The choice is a per-browser
 * convenience, so `localStorage` is the right home for it — losing it costs
 * the user nothing.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');

  readonly mode = signal<ThemeMode>(this.readStoredMode());
  readonly systemPrefersDark = signal(this.media?.matches ?? false);

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));

    effect(() => {
      const mode = this.mode();
      const dark = mode === 'dark' || (mode === 'system' && this.systemPrefersDark());

      this.document.documentElement.classList.toggle('dark-theme', dark);
      this.document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Private browsing or blocked storage — the theme still applies for this session.
      }
    });
  }

  toggle(): void {
    this.mode.update((current) => (this.isDark(current) ? 'light' : 'dark'));
  }

  isDark(mode: ThemeMode = this.mode()): boolean {
    return mode === 'dark' || (mode === 'system' && this.systemPrefersDark());
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      // Ignore and fall through to the default.
    }
    return 'system';
  }
}
