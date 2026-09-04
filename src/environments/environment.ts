/** Development configuration. `ng serve` proxies `/api` to the local API (see proxy.conf.json). */
export const environment = {
  production: false,
  apiUrl: '/api',
  appName: 'PortalConnect',
} as const;

export type Environment = typeof environment;
