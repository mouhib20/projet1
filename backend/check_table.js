const mysql = require('mysql2/promise');
const http = require('http');

async function main() {
    const c = await mysql.createConnection({
        host: 'localhost', user: 'root', password: '', database: 'gsmpro'
    });

    // Turn on MySQL query logging for next query (workaround: check general log)
    // Instead, let's check what the table looks like after enabling synchronize
    const [tables] = await c.query("SHOW CREATE TABLE fournisseur_articles");
    console.log('fournisseur_articles CREATE TABLE:', JSON.stringify(tables, null, 2));

    c.end();
}

main().catch(err => console.error('Table check error:', err.message));
