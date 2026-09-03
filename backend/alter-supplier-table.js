const mysql = require('mysql2/promise');

async function alterTable() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'gsmpro'
        });
        console.log('Connected to MySQL database gsmpro...');

        // Add type_articles to fournisseur table if it doesn't exist
        const [rows] = await connection.query("SHOW COLUMNS FROM `fournisseur` LIKE 'type_articles'");
        if (rows.length === 0) {
            await connection.query("ALTER TABLE `fournisseur` ADD COLUMN `type_articles` VARCHAR(255) NULL;");
            console.log("Column 'type_articles' added to table 'fournisseur' successfully.");
        } else {
            console.log("Column 'type_articles' already exists in table 'fournisseur'.");
        }
        await connection.end();
    } catch (error) {
        console.error('Error altering table:', error);
    }
}

alterTable();
