import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * A bcrypt hash of a throwaway value. Comparing against this when a username is
 * unknown keeps login timing roughly constant, so an attacker cannot enumerate
 * valid usernames by measuring how fast the endpoint rejects them.
 */
const DUMMY_HASH = bcrypt.hashSync('portalconnect-timing-equaliser', 10);

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/** Burn roughly the same time as a real comparison for a non-existent user. */
export async function burnPasswordComparison(plaintext: string): Promise<void> {
  await bcrypt.compare(plaintext, DUMMY_HASH);
}
