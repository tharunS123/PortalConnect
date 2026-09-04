export type PermissionAction = 'canView' | 'canCreate' | 'canEdit' | 'canDelete';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware. */
      user?: AuthenticatedUser;
      /** Correlation id assigned by pino-http. */
      id: string;
    }
  }
}

export {};
