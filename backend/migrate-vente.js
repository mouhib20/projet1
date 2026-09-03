const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'gsmpro'
    });

    console.log('Connected to gsmpro database.');

    // Ensure client table exists
    await connection.query(`
        CREATE TABLE IF NOT EXISTS client (
            id_client INT AUTO_INCREMENT PRIMARY KEY,
            nom VARCHAR(255) NOT NULL,
            telephone VARCHAR(50) NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ client table ready.');

    // Ensure vente table exists with qte column
    await connection.query(`
        CREATE TABLE IF NOT EXISTS vente (
            id_vente INT AUTO_INCREMENT PRIMARY KEY,
            designation VARCHAR(255) NULL,
            qte INT NOT NULL DEFAULT 1,
            prix DECIMAL(10,2) NOT NULL,
            date DATE NOT NULL,
            id_client INT NULL,
            id_article INT NULL,
            FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE RESTRICT,
            FOREIGN KEY (id_article) REFERENCES article(id_article) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ vente table ready.');

    // Add qte column if it doesn't exist (in case table already existed)
    try {
        await connection.query(`ALTER TABLE vente ADD COLUMN qte INT NOT NULL DEFAULT 1 AFTER designation;`);
        console.log('✅ Added qte column to vente table.');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('ℹ️  qte column already exists on vente table.');
        } else {
            console.error('⚠️  Error adding qte column:', e.message);
        }
    }

    // Ensure reparation table exists
    await connection.query(`
        CREATE TABLE IF NOT EXISTS reparation (
            id_reparation INT AUTO_INCREMENT PRIMARY KEY,
            description VARCHAR(255) NULL,
            prix DECIMAL(10,2) NULL,
            statut VARCHAR(50) NULL,
            date_reception DATE NULL,
            id_client INT NULL,
            FOREIGN KEY (id_client) REFERENCES client(id_client) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ reparation table ready.');

    await connection.end();
    console.log('\n🎉 Migration complete!');
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
