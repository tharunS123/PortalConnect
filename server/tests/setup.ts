import crypto from 'node:crypto';

// The env module reads these at import time, so they must be set first.
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
// Keep bcrypt cheap so the suite stays fast; production uses 12.
process.env['BCRYPT_ROUNDS'] = '4';

/**
 * Compose a password that satisfies the server's policy without writing a
 * credential-shaped literal into the repository. Hardcoded fake passwords trip
 * secret scanners on every pull request that touches these files, and teaching
 * reviewers to dismiss those alerts is worse than this small indirection.
 */
export function makeTestPassword(label = 'fixture'): string {
  return `Aa1!${label}-${crypto.randomBytes(9).toString('base64url')}`;
}

// The seeded administrator's password is generated per run and read back from
// the environment by the test helpers, so it exists nowhere in source.
process.env['SEED_ADMIN_PASSWORD'] = makeTestPassword('seed');
