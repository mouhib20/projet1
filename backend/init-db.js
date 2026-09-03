const mysql = require('mysql2/promise');

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
    });

    console.log('Connected to MySQL...');

    await connection.query('CREATE DATABASE IF NOT EXISTS `gsmpro` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    console.log('Database gsmpro ensured.');

    await connection.query('USE `gsmpro`;');

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`article\` (
              \`id_article\` int NOT NULL AUTO_INCREMENT,
              \`designation\` varchar(255) NOT NULL,
              \`prix_achat\` decimal(10,2) NOT NULL,
              PRIMARY KEY (\`id_article\`)
            ) ENGINE=InnoDB;
        `);

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`fournisseur\` (
              \`id_fournisseur\` int NOT NULL AUTO_INCREMENT,
              \`nom\` varchar(255) NOT NULL,
              \`prenom\` varchar(255) NOT NULL,
              \`tel\` varchar(50) DEFAULT NULL,
              PRIMARY KEY (\`id_fournisseur\`)
            ) ENGINE=InnoDB;
        `);

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`mouvement_achat\` (
              \`id_mouvement\` int NOT NULL AUTO_INCREMENT,
              \`qte\` int NOT NULL,
              \`prix\` decimal(10,2) NOT NULL,
              \`date_mouvement\` date NOT NULL,
              \`id_article\` int DEFAULT NULL,
              \`id_fournisseur\` int DEFAULT NULL,
              PRIMARY KEY (\`id_mouvement\`),
              KEY \`FK_article\` (\`id_article\`),
              KEY \`FK_fournisseur\` (\`id_fournisseur\`),
              CONSTRAINT \`FK_article\` FOREIGN KEY (\`id_article\`) REFERENCES \`article\` (\`id_article\`),
              CONSTRAINT \`FK_fournisseur\` FOREIGN KEY (\`id_fournisseur\`) REFERENCES \`fournisseur\` (\`id_fournisseur\`)
            ) ENGINE=InnoDB;
        `);

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`stock\` (
              \`id_stock\` int NOT NULL AUTO_INCREMENT,
              \`emplacement\` varchar(150) NOT NULL,
              \`qte_restante\` int NOT NULL DEFAULT '0',
              \`id_mouvement\` int DEFAULT NULL,
              PRIMARY KEY (\`id_stock\`),
              UNIQUE KEY \`REL_mouvement\` (\`id_mouvement\`),
              CONSTRAINT \`FK_stock_mouvement\` FOREIGN KEY (\`id_mouvement\`) REFERENCES \`mouvement_achat\` (\`id_mouvement\`) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        `);

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`client\` (
              \`id_client\` int NOT NULL AUTO_INCREMENT,
              \`nom\` varchar(255) NOT NULL,
              \`telephone\` varchar(50) DEFAULT NULL,
              PRIMARY KEY (\`id_client\`)
            ) ENGINE=InnoDB;
        `);

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`reparation\` (
              \`id_reparation\` int NOT NULL AUTO_INCREMENT,
              \`description\` varchar(255) DEFAULT NULL,
              \`prix\` decimal(10,2) DEFAULT NULL,
              \`statut\` varchar(50) DEFAULT NULL,
              \`date_reception\` date DEFAULT NULL,
              \`id_client\` int DEFAULT NULL,
              PRIMARY KEY (\`id_reparation\`),
              KEY \`FK_reparation_client\` (\`id_client\`),
              CONSTRAINT \`FK_reparation_client\` FOREIGN KEY (\`id_client\`) REFERENCES \`client\` (\`id_client\`)
            ) ENGINE=InnoDB;
        `);

    await connection.query(`
            CREATE TABLE IF NOT EXISTS \`vente\` (
              \`id_vente\` int NOT NULL AUTO_INCREMENT,
              \`designation\` varchar(255) DEFAULT NULL,
              \`prix\` decimal(10,2) NOT NULL,
              \`date\` date NOT NULL,
              \`id_article\` int DEFAULT NULL,
              \`id_stock\` int DEFAULT NULL,
              \`id_client\` int DEFAULT NULL,
              PRIMARY KEY (\`id_vente\`),
              KEY \`FK_vente_article\` (\`id_article\`),
              KEY \`FK_vente_stock\` (\`id_stock\`),
              KEY \`FK_vente_client\` (\`id_client\`),
              CONSTRAINT \`FK_vente_article\` FOREIGN KEY (\`id_article\`) REFERENCES \`article\` (\`id_article\`),
              CONSTRAINT \`FK_vente_stock\` FOREIGN KEY (\`id_stock\`) REFERENCES \`stock\` (\`id_stock\`),
              CONSTRAINT \`FK_vente_client\` FOREIGN KEY (\`id_client\`) REFERENCES \`client\` (\`id_client\`)
            ) ENGINE=InnoDB;
        `);

    console.log('All tables created successfully in gsmpro.');
    await connection.end();
  } catch (error) {
    console.error('Error creating database structure:', error);
  }
}

initDB();
