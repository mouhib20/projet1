/**
 * After the production build, writes dist/frontend/browser/config.json so the site knows where the
 * API is, without hardcoding it in the code.
 *
 *   API_URL     address of the API, e.g. https://gsmpro-api.onrender.com/api   (required to be non-local)
 *   FILES_URL   address of the uploaded images (defaults to API_URL without its /api suffix)
 */
const fs = require('fs');
const path = require('path');

const apiUrl = (process.env.API_URL || '').trim().replace(/\/+$/, '');
const filesUrl = (process.env.FILES_URL || apiUrl.replace(/\/api$/, '')).trim().replace(/\/+$/, '');

const dossier = path.join(__dirname, '..', 'dist', 'frontend', 'browser');
if (!fs.existsSync(dossier)) {
  console.error('Dossier de build introuvable :', dossier);
  process.exit(1);
}
fs.writeFileSync(path.join(dossier, 'config.json'), JSON.stringify({ apiUrl, filesUrl }, null, 2) + '\n');
console.log(apiUrl ? `config.json écrit : API = ${apiUrl}` : "config.json laissé vide : le site utilisera '/api' sur sa propre adresse.");
