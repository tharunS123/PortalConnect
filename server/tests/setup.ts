// The env module reads these at import time, so they must be set first.
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
// Keep bcrypt cheap so the suite stays fast; production uses 12.
process.env['BCRYPT_ROUNDS'] = '4';
