const mysql = require('mysql2');
const con = mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'gsmpro' });
const q = `ALTER TABLE fournisseur 
MODIFY COLUMN prenom VARCHAR(255) NULL,
ADD COLUMN entreprise VARCHAR(255) NULL, 
ADD COLUMN adresse VARCHAR(255) NULL, 
ADD COLUMN matricule_fiscal VARCHAR(100) NULL, 
ADD COLUMN rib VARCHAR(100) NULL, 
ADD COLUMN solde DECIMAL(10,2) DEFAULT 0 NULL`;

con.query(q, (err, res) => {
    if (err && !err.message.includes('Duplicate column')) console.error(err);
    else console.log('success');
    process.exit();
});
