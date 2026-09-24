import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';

const ROLES = ['admin', 'vendeur', 'vendeuse', 'visiteur'];
const ATTENTE_MS = 3000;
const ESSAIS = 15;

function nouveauClient(): Client {
    const ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };
    if (process.env.DATABASE_URL) return new Client({ connectionString: process.env.DATABASE_URL, ssl });
    return new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE || 'postgres',
        ssl,
    });
}

/** A freshly created database may take a few seconds before it accepts connections. */
async function connecter(): Promise<Client> {
    let derniere: unknown;
    for (let i = 1; i <= ESSAIS; i++) {
        const client = nouveauClient();
        try {
            await client.connect();
            return client;
        } catch (err) {
            derniere = err;
            console.log(`[init-db] base pas encore prête (essai ${i}/${ESSAIS})…`);
            await new Promise((r) => setTimeout(r, ATTENTE_MS));
        }
    }
    throw derniere;
}

/**
 * First start on an empty database (AUTO_INIT_DB=true): creates the tables from db/schema.sql and
 * the login accounts from SEED_ADMIN_PASSWORD / SEED_USERS. It never touches a database that
 * already has its tables, and never overwrites the password of an existing account.
 */
export async function initialiserBase(): Promise<void> {
    if (process.env.AUTO_INIT_DB !== 'true') return;

    const client = await connecter();
    try {
        if (process.env.DB_SCHEMA) {
            if (!/^[a-z_][a-z0-9_]*$/i.test(process.env.DB_SCHEMA)) throw new Error('DB_SCHEMA invalide.');
            await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }

        const [{ existe }] = (await client.query(`SELECT to_regclass('utilisateurs') IS NOT NULL AS existe`)).rows;
        if (!existe) {
            const fichier = join(__dirname, '..', 'db', 'schema.sql');
            if (!existsSync(fichier)) throw new Error(`Script de base introuvable : ${fichier}`);
            await client.query(readFileSync(fichier, 'utf8'));
            console.log('[init-db] tables créées.');
        }

        const comptes: { username: string; nom: string; password: string; role: string }[] = [];
        const adminPwd = process.env.SEED_ADMIN_PASSWORD || '';
        if (adminPwd.length >= 10) comptes.push({ username: 'admin', nom: 'Administrateur', password: adminPwd, role: 'admin' });
        if (process.env.SEED_USERS) {
            for (const u of JSON.parse(process.env.SEED_USERS)) {
                if (u.username && u.password && String(u.password).length >= 8 && ROLES.includes(u.role)) {
                    comptes.push({ username: u.username, nom: u.nom || u.username, password: String(u.password), role: u.role });
                }
            }
        }
        for (const c of comptes) {
            const deja = await client.query(`SELECT 1 FROM "utilisateurs" WHERE "username" = $1`, [c.username]);
            if (deja.rowCount) continue;
            await client.query(
                `INSERT INTO "utilisateurs" ("username", "nom", "password", "role") VALUES ($1, $2, $3, $4)`,
                [c.username, c.nom, await bcrypt.hash(c.password, 10), c.role],
            );
            console.log(`[init-db] compte créé : ${c.username} (${c.role})`);
        }

        const [{ n }] = (await client.query(`SELECT COUNT(*)::int AS n FROM "utilisateurs" WHERE "role" = 'admin'`)).rows;
        if (n === 0) console.warn("[init-db] ATTENTION : aucun compte admin. Définissez SEED_ADMIN_PASSWORD (10 caractères minimum) et redémarrez.");
    } finally {
        await client.end();
    }
}
