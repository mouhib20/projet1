/**
 * Writes db/schema.sql: the structure (no data) of the current database, ready to run on an empty
 * PostgreSQL / Supabase database. Run it again after any change to the tables:
 *   node db/export-schema.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Old tables that no part of the application uses any more
const IGNORER = new Set(['caisse_cloture']);

(async () => {
  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT,
    user: process.env.DB_USERNAME || process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  const tables = (await c.query(
    `SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`)).rows.filter((t) => !IGNORER.has(t.relname));

  const out = [];
  out.push('-- Structure de la base (sans données). Généré par db/export-schema.js — ne pas modifier à la main.');
  out.push('-- À exécuter une seule fois sur une base vide (Supabase : SQL Editor).\n');

  const sequences = new Map(); // sequence -> "table.column"
  const creates = [];
  const fks = [];

  for (const t of tables) {
    const cols = (await c.query(
      `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS def
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [t.oid])).rows;
    const lines = cols.map((col) => {
      let l = `  "${col.attname}" ${col.type}`;
      if (col.def) {
        l += ` DEFAULT ${col.def}`;
        const m = /nextval\('([^']+)'::regclass\)/.exec(col.def);
        if (m) sequences.set(m[1].replace(/^public\./, ''), `${t.relname}.${col.attname}`);
      }
      if (col.attnotnull) l += ' NOT NULL';
      return l;
    });
    const cons = (await c.query(
      `SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1 ORDER BY contype DESC, conname`, [t.oid])).rows;
    for (const k of cons) {
      if (k.contype === 'f') fks.push({ table: t.relname, name: k.conname, def: k.def });
      else lines.push(`  CONSTRAINT "${k.conname}" ${k.def}`);
    }
    creates.push(`CREATE TABLE IF NOT EXISTS "${t.relname}" (\n${lines.join(',\n')}\n);`);
  }

  for (const s of sequences.keys()) out.push(`CREATE SEQUENCE IF NOT EXISTS ${s};`);
  out.push('');
  out.push(...creates.map((s) => s + '\n'));
  for (const [seq, target] of sequences) {
    const [tbl, col] = target.split('.');
    out.push(`ALTER SEQUENCE ${seq} OWNED BY "${tbl}"."${col}";`);
  }
  out.push('');
  for (const f of fks) {
    out.push(`DO $$ BEGIN ALTER TABLE "${f.table}" ADD CONSTRAINT "${f.name}" ${f.def}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  }
  out.push('');

  const idx = (await c.query(
    `SELECT i.indexname, i.tablename, i.indexdef FROM pg_indexes i
     WHERE i.schemaname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_class ic ON ic.oid = k.conindid WHERE ic.relname = i.indexname)
     ORDER BY i.tablename, i.indexname`)).rows.filter((i) => !IGNORER.has(i.tablename));
  for (const i of idx) {
    out.push(i.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ').replace(/ ON public\./, ' ON ') + ';');
  }

  const file = path.join(__dirname, 'schema.sql');
  fs.writeFileSync(file, out.join('\n') + '\n');
  console.log(`schema.sql écrit: ${tables.length} tables, ${sequences.size} séquences, ${fks.length} clés étrangères, ${idx.length} index`);
  await c.end();
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
