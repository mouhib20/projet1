import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';

const ROLES = ['super_admin', 'compat_editor', 'wholesale_editor', 'admin', 'vendeur', 'vendeuse', 'visiteur'];
const DEPARTEMENTS = ['ventes', 'stock', 'reparation', 'fournisseurs', 'charges', 'clients', 'rapports', 'compatibilite', 'wholesale'];
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
    if (process.env.AUTO_INIT_DB !== 'true') {
        await migrer();
        return;
    }

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
    await migrer();
}

/**
 * Small additive changes applied to databases created before them (safe to run at every start:
 * each one only adds something that is missing, and never touches existing data).
 */
async function migrer(): Promise<void> {
    let client: Client | null = null;
    try {
        client = nouveauClient();
        await client.connect();
        if (process.env.DB_SCHEMA && /^[a-z_][a-z0-9_]*$/i.test(process.env.DB_SCHEMA)) {
            await client.query(`SET search_path TO ${process.env.DB_SCHEMA}`);
        }
        // Cost of a sale line that has no article (repairs): lets the profit of repairs be shown
        await client.query(`ALTER TABLE "vente" ADD COLUMN IF NOT EXISTS "cout" numeric(10,2)`);
        // Repair a deposit line belongs to: lets cancelling a ticket find and refund its deposit
        await client.query(`ALTER TABLE "vente" ADD COLUMN IF NOT EXISTS "id_reparation_origine" integer`);
        // Part of a sale line left unpaid (credit sale): lets the client's debt be traced back to what they took
        await client.query(`ALTER TABLE "vente" ADD COLUMN IF NOT EXISTS "credit" numeric(10,2)`);
        // Employees feature: phone number, active/suspended flag, and which admin owns this account
        await client.query(`ALTER TABLE "utilisateurs" ADD COLUMN IF NOT EXISTS "telephone" character varying`);
        await client.query(`ALTER TABLE "utilisateurs" ADD COLUMN IF NOT EXISTS "actif" boolean DEFAULT true NOT NULL`);
        await client.query(`ALTER TABLE "utilisateurs" ADD COLUMN IF NOT EXISTS "id_proprietaire" integer`);
        // Per-employee, per-department permission matrix (voir/ajouter/modifier/supprimer)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "permission" (
                "id" SERIAL PRIMARY KEY,
                "id_utilisateur" integer NOT NULL,
                "departement" character varying(20) NOT NULL,
                "peut_voir" boolean DEFAULT false NOT NULL,
                "peut_ajouter" boolean DEFAULT false NOT NULL,
                "peut_modifier" boolean DEFAULT false NOT NULL,
                "peut_supprimer" boolean DEFAULT false NOT NULL
            )
        `);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "permission_utilisateur_departement_idx" ON "permission" ("id_utilisateur", "departement")`);
        await client.query(`DO $$ BEGIN ALTER TABLE "permission" ADD CONSTRAINT "permission_id_utilisateur_fkey" FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

        // Multi-store feature: which store an account belongs to (NULL only for super_admin)
        await client.query(`ALTER TABLE "utilisateurs" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        // Stores, and which of the 7 departments are enabled per store (Super Admin's switch)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "magasin" (
                "id_magasin" SERIAL PRIMARY KEY,
                "nom" character varying NOT NULL,
                "adresse" character varying,
                "telephone" character varying,
                "logo" character varying,
                "actif" boolean DEFAULT true NOT NULL,
                "date_creation" timestamp DEFAULT now() NOT NULL
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "magasin_module" (
                "id" SERIAL PRIMARY KEY,
                "id_magasin" integer NOT NULL,
                "departement" character varying(20) NOT NULL,
                "actif" boolean DEFAULT true NOT NULL
            )
        `);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "magasin_module_magasin_departement_idx" ON "magasin_module" ("id_magasin", "departement")`);
        await client.query(`DO $$ BEGIN ALTER TABLE "magasin_module" ADD CONSTRAINT "magasin_module_id_magasin_fkey" FOREIGN KEY (id_magasin) REFERENCES magasin(id_magasin) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        // id_magasin on every store-scoped table
        await client.query(`ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "charge" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "client_depot" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "facture_achat" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "fournisseur" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "mouvement_achat" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "reparation" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "reparation_item" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "stock" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "vente" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        // These have no TypeORM entity (raw SQL only) but are just as store-scoped as the rest
        await client.query(`ALTER TABLE "caisse_mouvement" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "caisse_session" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        // Pre-dates multi-store: enforced "only one open session in the whole app" via a constant
        // expression index. Now that several stores each run their own drawer, it must be per store.
        await client.query(`DROP INDEX IF EXISTS "caisse_session_une_ouverte"`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "caisse_session_une_ouverte_par_magasin" ON "caisse_session" ("id_magasin") WHERE (("statut")::text = 'ouverte'::text)`);
        await client.query(`ALTER TABLE "client_solde_usage" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "paiement_fournisseur" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "retour_fournisseur" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);
        await client.query(`ALTER TABLE "sav_accessoire" ADD COLUMN IF NOT EXISTS "id_magasin" integer`);

        // One-time backfill: an install that predates this feature gets one default store, and
        // every existing row across every store-scoped table is attached to it.
        const { rows: [{ n: nMagasins }] } = await client.query(`SELECT COUNT(*)::int AS n FROM "magasin"`);
        const { rows: [{ n: nUtilisateurs }] } = await client.query(`SELECT COUNT(*)::int AS n FROM "utilisateurs"`);
        if (nMagasins === 0 && nUtilisateurs > 0) {
            const { rows: [{ id_magasin: idMagasinDefaut }] } = await client.query(
                `INSERT INTO "magasin" ("nom") VALUES ($1) RETURNING id_magasin`,
                ['Mon magasin'],
            );
            for (const dep of DEPARTEMENTS) {
                await client.query(`INSERT INTO "magasin_module" ("id_magasin", "departement") VALUES ($1, $2)`, [idMagasinDefaut, dep]);
            }
            await client.query(`UPDATE "utilisateurs" SET id_magasin = $1 WHERE id_magasin IS NULL AND role != 'super_admin'`, [idMagasinDefaut]);
            for (const table of ['article', 'charge', 'client', 'client_depot', 'facture_achat', 'fournisseur', 'mouvement_achat', 'reparation', 'reparation_item', 'stock', 'vente', 'caisse_mouvement', 'caisse_session', 'client_solde_usage', 'paiement_fournisseur', 'retour_fournisseur', 'sav_accessoire']) {
                await client.query(`UPDATE "${table}" SET id_magasin = $1 WHERE id_magasin IS NULL`, [idMagasinDefaut]);
            }
            console.log(`[migrations] migration multi-magasin : magasin par défaut créé (id ${idMagasinDefaut}), données existantes rattachées.`);
        } else if (nMagasins === 1) {
            // Supplementary, idempotent: tables discovered/added to the store-scoping list after the
            // migration above already ran once (still safe while there is only one store — no ambiguity
            // about which store an orphaned row belongs to).
            const { rows: [{ id_magasin: idUnique }] } = await client.query(`SELECT id_magasin FROM "magasin" LIMIT 1`);
            for (const table of ['caisse_mouvement', 'caisse_session', 'client_solde_usage', 'paiement_fournisseur', 'retour_fournisseur', 'sav_accessoire']) {
                await client.query(`UPDATE "${table}" SET id_magasin = $1 WHERE id_magasin IS NULL`, [idUnique]);
            }
        }

        // Compatibility catalogue: shared across every store by design (no id_magasin on its own
        // tables), except compat_suggestion (records which store suggested what) and article's
        // new optional link into it.
        await client.query(`
            CREATE TABLE IF NOT EXISTS "brand" (
                "id" SERIAL PRIMARY KEY,
                "nom" character varying(150) NOT NULL,
                "logo" character varying(255)
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "device_model" (
                "id" SERIAL PRIMARY KEY,
                "id_brand" integer NOT NULL,
                "nom" character varying(150) NOT NULL,
                "nom_commercial" character varying(150),
                "code" character varying(100)
            )
        `);
        await client.query(`DO $$ BEGIN ALTER TABLE "device_model" ADD CONSTRAINT "device_model_id_brand_fkey" FOREIGN KEY (id_brand) REFERENCES brand(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "device_model_brand_nom_idx" ON "device_model" ("id_brand", "nom")`);
        await client.query(`CREATE INDEX IF NOT EXISTS "device_model_nom_idx" ON "device_model" ("nom")`);
        await client.query(`CREATE INDEX IF NOT EXISTS "device_model_code_idx" ON "device_model" ("code")`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "part_type" (
                "id" SERIAL PRIMARY KEY,
                "nom_fr" character varying(100) NOT NULL,
                "nom_en" character varying(100) NOT NULL,
                "nom_ar" character varying(100) NOT NULL,
                "categorie" character varying(20) NOT NULL DEFAULT 'part'
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "compat_group" (
                "id" SERIAL PRIMARY KEY,
                "id_part_type" integer NOT NULL,
                "note" text,
                "image" character varying(255),
                "cree_par" integer,
                "date_creation" timestamp NOT NULL DEFAULT now()
            )
        `);
        await client.query(`DO $$ BEGIN ALTER TABLE "compat_group" ADD CONSTRAINT "compat_group_id_part_type_fkey" FOREIGN KEY (id_part_type) REFERENCES part_type(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "compat_group_model" (
                "id_group" integer NOT NULL,
                "id_model" integer NOT NULL,
                PRIMARY KEY ("id_group", "id_model")
            )
        `);
        await client.query(`DO $$ BEGIN ALTER TABLE "compat_group_model" ADD CONSTRAINT "compat_group_model_id_group_fkey" FOREIGN KEY (id_group) REFERENCES compat_group(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`DO $$ BEGIN ALTER TABLE "compat_group_model" ADD CONSTRAINT "compat_group_model_id_model_fkey" FOREIGN KEY (id_model) REFERENCES device_model(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "compat_suggestion" (
                "id" SERIAL PRIMARY KEY,
                "id_magasin" integer NOT NULL,
                "id_model" integer,
                "texte_libre" character varying(255),
                "id_part_type" integer,
                "statut" character varying(20) NOT NULL DEFAULT 'en_attente',
                "cree_par" integer,
                "date_creation" timestamp NOT NULL DEFAULT now()
            )
        `);
        await client.query(`ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "compat_group_id" integer`);

        // Wholesale portal: run by an independent wholesale_editor account (no store of its
        // own, created directly by super_admin - same shape as compat_editor). Its products are
        // a fully standalone catalogue (wholesale_listing IS the product, not a price wrapper
        // around a store's article); orders/lines/events are store-scoped as before.
        await client.query(`
            CREATE TABLE IF NOT EXISTS "wholesale_listing" (
                "id" SERIAL PRIMARY KEY,
                "designation" character varying(255) NOT NULL DEFAULT '',
                "marque" character varying(255),
                "modele" character varying(255),
                "barcode" character varying(255),
                "image" character varying(500),
                "type" character varying(50),
                "sous_categorie" character varying(255),
                "quantite" integer NOT NULL DEFAULT 0,
                "prix_gros" numeric(10,2) NOT NULL,
                "qte_min" integer NOT NULL DEFAULT 1,
                "visible" boolean NOT NULL DEFAULT true
            )
        `);
        // Undo the earlier store-linked design (no real data depends on it yet - never released).
        await client.query(`DO $$ BEGIN ALTER TABLE "wholesale_listing" DROP CONSTRAINT "wholesale_listing_id_article_fkey"; EXCEPTION WHEN undefined_object THEN NULL; END $$;`);
        await client.query(`DROP INDEX IF EXISTS "wholesale_listing_article_idx"`);
        await client.query(`ALTER TABLE "wholesale_listing" DROP COLUMN IF EXISTS "id_article"`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "designation" character varying(255) NOT NULL DEFAULT ''`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "marque" character varying(255)`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "modele" character varying(255)`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "barcode" character varying(255)`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "image" character varying(500)`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "type" character varying(50)`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "sous_categorie" character varying(255)`);
        await client.query(`ALTER TABLE "wholesale_listing" ADD COLUMN IF NOT EXISTS "quantite" integer NOT NULL DEFAULT 0`);
        await client.query(`ALTER TABLE "magasin" DROP COLUMN IF EXISTS "est_grossiste"`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "wholesale_order" (
                "id" SERIAL PRIMARY KEY,
                "id_magasin_demandeur" integer NOT NULL,
                "statut" character varying(30) NOT NULL DEFAULT 'en_attente',
                "total" numeric(10,2) NOT NULL DEFAULT 0,
                "note" text,
                "methode_reception" character varying(255),
                "cree_par" integer,
                "date_creation" timestamp NOT NULL DEFAULT now(),
                "date_confirmation" timestamp,
                "date_envoi" timestamp,
                "date_reception" timestamp
            )
        `);
        await client.query(`DO $$ BEGIN ALTER TABLE "wholesale_order" ADD CONSTRAINT "wholesale_order_id_magasin_demandeur_fkey" FOREIGN KEY (id_magasin_demandeur) REFERENCES magasin(id_magasin); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "wholesale_order_line" (
                "id" SERIAL PRIMARY KEY,
                "id_order" integer NOT NULL,
                "id_listing" integer NOT NULL,
                "qte_demandee" integer NOT NULL,
                "qte_confirmee" integer,
                "prix_unitaire" numeric(10,2) NOT NULL
            )
        `);
        await client.query(`DO $$ BEGIN ALTER TABLE "wholesale_order_line" ADD CONSTRAINT "wholesale_order_line_id_order_fkey" FOREIGN KEY (id_order) REFERENCES wholesale_order(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`DO $$ BEGIN ALTER TABLE "wholesale_order_line" ADD CONSTRAINT "wholesale_order_line_id_listing_fkey" FOREIGN KEY (id_listing) REFERENCES wholesale_listing(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await client.query(`
            CREATE TABLE IF NOT EXISTS "wholesale_order_event" (
                "id" SERIAL PRIMARY KEY,
                "id_order" integer NOT NULL,
                "par" integer,
                "statut_avant" character varying(30),
                "statut_apres" character varying(30) NOT NULL,
                "date_creation" timestamp NOT NULL DEFAULT now()
            )
        `);
        await client.query(`DO $$ BEGIN ALTER TABLE "wholesale_order_event" ADD CONSTRAINT "wholesale_order_event_id_order_fkey" FOREIGN KEY (id_order) REFERENCES wholesale_order(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);

        // Seed a super_admin account if requested and none exists yet (idempotent, every boot)
        const superAdminPwd = process.env.SEED_SUPER_ADMIN_PASSWORD || '';
        if (superAdminPwd.length >= 10) {
            const { rows: [{ n: nSuperAdmins }] } = await client.query(`SELECT COUNT(*)::int AS n FROM "utilisateurs" WHERE role = 'super_admin'`);
            if (nSuperAdmins === 0) {
                await client.query(
                    `INSERT INTO "utilisateurs" ("username", "nom", "password", "role") VALUES ($1, $2, $3, 'super_admin') ON CONFLICT (username) DO NOTHING`,
                    ['super_admin', 'Super Admin', await bcrypt.hash(superAdminPwd, 10)],
                );
                console.log('[migrations] compte super_admin créé.');
            }
        }
    } catch (err) {
        console.warn('[migrations] non appliquées :', (err as Error).message);
    } finally {
        await client?.end().catch(() => undefined);
    }
}
