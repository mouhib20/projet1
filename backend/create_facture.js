const http = require('http');

const payload = JSON.stringify({
    reference: 'TEST-XYZ-' + Date.now(),
    date_facture: '2026-09-01',
    fournisseurId: 4,
    total_ht: 10,
    total_tva: 0,
    remise: 0,
    net_a_payer: 10,
    montant_paye: 10,
    reste_a_payer: 0,
    items: [
        {
            articleId: null,
            isNew: true,
            designation: 'Test Article ' + Date.now(),
            barcode: '',
            qte: 1,
            prix: 10,
            prix_vente: 15,
            marque: 'TestMarque',
            modele: 'TestModele',
            type: 'part',
            sous_categorie: 'test',
            tva_rate: 0
        }
    ]
});

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/factures-achat',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
};

const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('HTTP Status:', res.statusCode);
        try {
            const parsed = JSON.parse(data);
            console.log('Response:', JSON.stringify(parsed, null, 2));
        } catch (e) {
            console.log('Raw Response:', data);
        }
    });
});

req.on('error', console.error);
req.write(payload);
req.end();
