import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

/**
 * Secret used to sign login tokens.
 *  - Production: it MUST come from the JWT_SECRET environment variable (the server refuses to start otherwise).
 *  - Development: a random key is generated once and kept in the git-ignored file .jwt-secret,
 *    so no secret ever lives in the source code.
 */
function secret(): string {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET est obligatoire en production.');
    }
    const fichier = join(process.cwd(), '.jwt-secret');
    try {
        if (existsSync(fichier)) {
            const s = readFileSync(fichier, 'utf8').trim();
            if (s.length >= 32) return s;
        }
    } catch {
        // unreadable: a new key is generated below
    }
    const s = randomBytes(48).toString('hex');
    try {
        writeFileSync(fichier, s, { mode: 0o600 });
    } catch {
        // read-only disk: the key then only lives until the next restart
    }
    return s;
}

export const JWT_SECRET = secret();
