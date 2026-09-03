const mysql = require('mysql2/promise');

async function createDatabase() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
        });
        await connection.query('CREATE DATABASE IF NOT EXISTS `db_gsmpro` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
        console.log('Database db_gsmpro created successfully.');
        await connection.end();
    } catch (error) {
        console.error('Error creating database:', error);
    }
}

createDatabase();
