/**
 * Production configuration. The API serves the built frontend from the same
 * origin, so a relative base URL avoids any CORS or cookie-domain concerns.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  appName: 'PortalConnect',
} as const;

export type Environment = typeof environment;
