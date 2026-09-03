const mysql = require('mysql2');
const con = mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'gsmpro' });
const q = `ALTER TABLE article 
ADD COLUMN prix_vente DECIMAL(10,2) DEFAULT 0 NULL, 
ADD COLUMN barcode VARCHAR(100) NULL, 
ADD COLUMN marque VARCHAR(150) NULL, 
ADD COLUMN modele VARCHAR(150) NULL, 
ADD COLUMN type VARCHAR(20) DEFAULT 'part' NULL, 
ADD COLUMN sous_categorie VARCHAR(100) NULL, 
ADD COLUMN quantite INT DEFAULT 0, 
ADD COLUMN qte_min INT DEFAULT 3 NULL, 
ADD COLUMN description TEXT NULL`;

con.query(q, (err, res) => {
    if (err) console.error(err);
    else console.log('success');
    process.exit();
});
