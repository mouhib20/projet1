const mysql = require('mysql2/promise');

async function check() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'gsmpro'
        });
        console.log('Successfully connected to MySQL database: gsmpro');

        // Show tables
        const [tables] = await connection.query('SHOW TABLES;');
        console.log('Tables:', tables);

        // Show columns of fournisseur
        const [fournisseurCols] = await connection.query('DESCRIBE fournisseur;');
        console.log('fournisseur Columns:', fournisseurCols);

        const fs = require('fs');
        const output = { tables, fournisseurCols };
        // Show columns of fournisseur_articles if it exists
        try {
            const [relationCols] = await connection.query('DESCRIBE fournisseur_articles;');
            output.relationCols = relationCols;
        } catch (e) {
            output.relationColsError = e.message;
        }

        // Try querying all suppliers
        const [fournisseurs] = await connection.query('SELECT * FROM fournisseur;');
        output.fournisseurs = fournisseurs;

        fs.writeFileSync('check-db-output.json', JSON.stringify(output, null, 2));
        console.log('Done.');
        await connection.end();
    } catch (error) {
        console.error('Error during database check:', error);
    }
}

check();
