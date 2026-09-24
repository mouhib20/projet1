/**
 * Creates (or updates) the login accounts on the target database.
 *
 *   SEED_ADMIN_PASSWORD   required, at least 10 characters: password of the "admin" account
 *   SEED_USERS            optional JSON list of extra accounts, e.g.
 *                         [{"username":"vendeur1","nom":"Ahmed","password":"…","role":"vendeur"}]
 *                         roles: admin | vendeur | vendeuse | visiteur
 *   DB_SCHEMA             optional, to seed a schema other than "public"
 *
 * Usage:  npm run db:seed
 * No password is stored in the code: they only come from the environment.
 */
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const ROLES = ['admin', 'vendeur', 'vendeuse', 'visiteur'];

async function main() {
  const adminPwd = process.env.SEED_ADMIN_PASSWORD || '';
  if (adminPwd.length < 10) {
    throw new Error('SEED_ADMIN_PASSWORD est obligatoire (10 caractères minimum).');
  }
  const users = [{ username: 'admin', nom: 'Administrateur', password: adminPwd, role: 'admin' }];
  if (process.env.SEED_USERS) {
    for (const u of JSON.parse(process.env.SEED_USERS)) {
      if (!u.username || !u.password || !ROLES.includes(u.role)) {
        throw new Error(`Compte invalide dans SEED_USERS: ${JSON.stringify({ ...u, password: '***' })}`);
      }
      if (String(u.password).length < 8) throw new Error(`Mot de passe trop court pour ${u.username} (8 caractères minimum).`);
      users.push({ username: u.username, nom: u.nom || u.username, password: String(u.password), role: u.role });
    }
  }

  const client = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'postgres',
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  if (process.env.DB_SCHEMA) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(process.env.DB_SCHEMA)) throw new Error('DB_SCHEMA invalide.');
    await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
  }

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await client.query(
      `INSERT INTO "utilisateurs" ("username", "nom", "password", "role") VALUES ($1, $2, $3, $4)
       ON CONFLICT ("username") DO UPDATE SET "password" = $3, "role" = $4, "nom" = $2`,
      [u.username, u.nom, hash, u.role],
    );
    console.log(`Compte prêt : ${u.username} (${u.role})`);
  }
  await client.end();
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
