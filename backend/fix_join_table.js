const mysql = require('mysql2/promise');

async function main() {
    const c = await mysql.createConnection({
        host: 'localhost', user: 'root', password: '', database: 'gsmpro'
    });

    // Drop partial table if it exists
    await c.query('DROP TABLE IF EXISTS fournisseur_articles');

    // Describe fournisseur to get exact PK column name
    const [fournisseurCols] = await c.query('DESCRIBE fournisseur');
    const [articleCols] = await c.query('DESCRIBE article');

    const fournisseurPK = fournisseurCols.find(c => c.Key === 'PRI').Field;
    const articlePK = articleCols.find(c => c.Key === 'PRI').Field;

    console.log('Fournisseur PK:', fournisseurPK, '  Article PK:', articlePK);

    // TypeORM @JoinTable() names the pivot columns as:
    // entityVariableName + PKColumnName (camelCase) -> e.g. fournisseurId_fournisseur → no, actually
    // it's: <relation variable name>_<pk column name> with underscores
    // Let's just check: it complains about id_fournisseur so column is fournisseurId_fournisseur? Let's just try all combos

    const colFournisseur = 'fournisseurId_fournisseur';
    const colArticle = 'articleId_article';

    await c.query(`
        CREATE TABLE fournisseur_articles (
            \`${colFournisseur}\` INT NOT NULL,
            \`${colArticle}\` INT NOT NULL,
            PRIMARY KEY (\`${colFournisseur}\`, \`${colArticle}\`),
            FOREIGN KEY (\`${colFournisseur}\`) REFERENCES fournisseur(${fournisseurPK}) ON DELETE CASCADE,
            FOREIGN KEY (\`${colArticle}\`) REFERENCES article(${articlePK}) ON DELETE CASCADE
        )
    `);
    console.log(`Created table with columns: ${colFournisseur}, ${colArticle}`);
    c.end();
}

main().catch(console.error);
