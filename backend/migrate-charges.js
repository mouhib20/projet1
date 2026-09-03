const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'gsmpro'
    });

    console.log('Connected to gsmpro database.');

    // Ensure charge table exists
    await connection.query(`
        CREATE TABLE IF NOT EXISTS charge (
            id_charge INT AUTO_INCREMENT PRIMARY KEY,
            description VARCHAR(255) NOT NULL,
            montant DECIMAL(10,2) NOT NULL,
            date_charge DATE NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ charge table ready.');

    await connection.end();
    console.log('\n🎉 Migration complete!');
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
