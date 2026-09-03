const mysql = require('mysql2/promise');

async function main() {
    const c = await mysql.createConnection({
        host: 'localhost', user: 'root', password: '', database: 'gsmpro'
    });
    const [tables] = await c.query('SHOW TABLES');
    console.log('Tables:', tables.map(t => Object.values(t)[0]).join(', '));
    c.end();
}

main().catch(console.error);
