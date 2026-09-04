import {
  type ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthStore } from './core/services/auth.store';
import { ThemeService } from './core/services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),

    // `withFetch` is required for the refresh cookie to ride along on
    // `withCredentials` requests under the modern HTTP backend.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),

    provideAnimationsAsync(),

    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },

    // Instantiate the theme service before first paint so the app never flashes
    // the wrong colour scheme.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),

    // Replay the httpOnly refresh cookie so a reload does not sign the user out.
    // Routing waits for this, which is what lets `authGuard` be synchronous.
    provideAppInitializer(() => firstValueFrom(inject(AuthStore).restoreSession())),
  ],
};
