import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import * as AdmZip from 'adm-zip';
import { parse as parseCsv } from 'csv-parse/sync';
import * as sharp from 'sharp';
// sharp's CJS export is the callable function itself (no `.default`) - `import sharp from 'sharp'`
// compiles to expect one and silently fails at runtime ("sharp_1.default is not a function"),
// while `import * as sharp` is typed as a non-callable namespace. This is the real, callable thing.
const creerImage = sharp as unknown as (input: Buffer) => sharp.Sharp;
import { promises as fs } from 'fs';
import { join } from 'path';
import { Utilisateur } from '../users/user.entity';
import { CaisseService, Acteur } from '../caisse/caisse.service';
import { CompatibilityService } from '../compatibility/compatibility.service';
import { IMPORT_ID_PATTERN } from './import-upload.util';

const TMP_DIR = join(process.cwd(), 'uploads', 'compat-import-tmp');
const MODELS_DIR = join(process.cwd(), 'uploads', 'compat-models');
const CONFIRMED_BADGE = 'توافق مؤكد';

/** The 5 part types this feature knows about, mapped from the extractor app's English keys to the
 *  exact nom_fr/en/ar the compat catalogue already uses (or will create on first import) - reused
 *  via CompatibilityService.creerTypePieceInterne()'s existing find-or-create dedup. */
const PART_TYPE_MAP: Record<string, { nom_fr: string; nom_en: string; nom_ar: string }> = {
    display: { nom_fr: 'Afficheur', nom_en: 'Afficheur', nom_ar: 'Afficheur' },
    battery: { nom_fr: 'Batterie', nom_en: 'Batterie', nom_ar: 'Batterie' },
    glass: { nom_fr: 'glass', nom_en: 'glass', nom_ar: 'GLASS' },
    vitre: { nom_fr: 'Vitre', nom_en: 'Vitre', nom_ar: 'Vitre' },
    coque: { nom_fr: 'Coque Téléphone', nom_en: 'Coque Téléphone', nom_ar: 'Coque Téléphone' },
};

/** Column-name matching is tolerant on purpose: the real export's exact headers weren't available
 *  to verify when this was written. Add more synonyms here once a real sample file is checked. */
const COLUMN_SYNONYMS: Record<string, string[]> = {
    marque: ['marque', 'brand', 'الماركة'],
    modele: ['موديل', 'model', 'modele', 'modelname', 'name', 'nom', 'الموديل'],
    code: ['رمز', 'الرمز', 'code', 'modelcode'],
    image: ['صورة', 'image', 'photo', 'imagefile', 'filename', 'file', 'اسمملفالصورة', 'اسمالصورة'],
};

function normaliserEntete(h: string): string {
    return h.toLowerCase().trim().replace(/[\s_\-]+/g, '');
}

function trouverColonne(headers: string[], champ: keyof typeof COLUMN_SYNONYMS): string | null {
    const normalisees = headers.map(h => ({ brute: h, norm: normaliserEntete(h) }));
    for (const syn of COLUMN_SYNONYMS[champ]) {
        const hit = normalisees.find(h => h.norm === normaliserEntete(syn));
        if (hit) return hit.brute;
    }
    return null;
}

function estBadgeConfirme(badge?: string | null): boolean {
    return (badge ?? '').trim() === CONFIRMED_BADGE;
}

interface ModeleLigne {
    marque: string;
    modele: string;
    code: string | null;
    imageNomFichier: string | null;
}

interface MarquePreviewRow {
    cleModele: string; // `${marque}::${code || modele}`, normalized - how the frontend references this row in selections
    marque: string;
    modele: string;
    code: string | null;
    statut: 'new' | 'existing' | 'error';
    aUneImage: boolean;
    thumbnail: string | null;
    erreur?: string;
}

interface MarqueSummary {
    marque: string;
    nouveaux: number;
    existants: number;
    sansImage: number;
    erreurs: number;
}

export interface BrandsModelsPreview {
    importId: string;
    marques: MarqueSummary[];
    modeles: MarquePreviewRow[];
    erreursFichier: string[];
}

export interface BrandsModelsSelections {
    marquesExclues?: string[];
    modelesExclus?: string[]; // cleModele values
}

export interface BrandsModelsResult {
    ajoutes: number;
    misAJour: number;
    ignores: number;
    erreurs: { marque: string; message: string }[];
}

interface CompatModeleRef {
    brand: string;
    name: string;
    code?: string | null;
    badge?: string | null;
}

interface CompatGroupeImport {
    partType: string;
    models: CompatModeleRef[];
}

interface CompatGroupPreviewRow {
    cleGroupe: string; // `${partTypeKey}#${index}` - stable across preview/confirm since parsing is deterministic
    partTypeKey: string;
    statutPropose: 'confirmed' | 'needs_test';
    modeles: { brand: string; nom: string; code: string | null; trouve: boolean }[];
    action: 'create' | 'merge' | 'none';
    fusionAvecGroupeId?: number;
    fusionAvecModeles?: string[];
}

interface CompatTypeSummary {
    partTypeKey: string;
    nouveaux: number;
    aFusionner: number;
    modelesIntrouvables: number;
}

export interface CompatibilitiesPreview {
    importId: string;
    types: CompatTypeSummary[];
    groupes: CompatGroupPreviewRow[];
}

export interface CompatibilitiesSelections {
    groupesExclus?: string[]; // cleGroupe values
    fusionsConfirmees?: string[]; // cleGroupe values whose proposed merge the user explicitly accepted
}

export interface CompatibilitiesResult {
    crees: number;
    fusionnes: number;
    ignores: number;
    modelesIntrouvables: number;
}

@Injectable()
export class CompatImportService {
    private readonly logger = new Logger(CompatImportService.name);

    constructor(
        @InjectRepository(Utilisateur)
        private readonly usersRepo: Repository<Utilisateur>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly compatibilityService: CompatibilityService,
    ) { }

    /** A preview the user never confirms (abandoned tab, browser closed, chose not to import)
     *  leaves its uploaded file behind forever otherwise - a real export can be in the hundreds of
     *  MB, so this isn't just tidiness. Sweeps anything older than 24h once a day. */
    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async nettoyerFichiersTempAbandonnes(): Promise<void> {
        const UN_JOUR_MS = 24 * 60 * 60 * 1000;
        let fichiers: string[];
        try {
            fichiers = await fs.readdir(TMP_DIR);
        } catch {
            return; // folder not created yet (fresh boot, nothing imported since) - nothing to do
        }
        const maintenant = Date.now();
        for (const fichier of fichiers) {
            const chemin = join(TMP_DIR, fichier);
            try {
                const stats = await fs.stat(chemin);
                if (maintenant - stats.mtimeMs > UN_JOUR_MS) {
                    await fs.unlink(chemin);
                    this.logger.log(`Fichier d'import abandonné supprimé : ${fichier}`);
                }
            } catch {
                // already gone, or a transient fs error - either way, nothing more to do for this one
            }
        }
    }

    // ── Access checks ────────────────────────────────────────────

    /** compatibility_employee or compat_editor - deliberately NOT editeurRequis()'s OR-super_admin
     *  pattern used everywhere else in the compat catalogue: super_admin and every store role stay
     *  blocked here, by explicit request. compat_editor was added after the fact (the compat
     *  catalogue's own manager asked to use this screen too, not just a dedicated import account). */
    private async importEmployeeRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'compatibility_employee' && acteur.role !== 'compat_editor') {
            throw new ForbiddenException('Action réservée au rôle employé d\'import ou éditeur de compatibilité.');
        }
        return acteur;
    }

    private async superAdminRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
        return acteur;
    }

    // ── compatibility_employee account management (super_admin only) ──

    async creerEmploye(dto: { nom: string; username: string; password: string }, authorization?: string): Promise<Omit<Utilisateur, 'password'>> {
        await this.superAdminRequis(authorization);
        const nom = String(dto.nom ?? '').trim();
        const username = String(dto.username ?? '').trim();
        const password = String(dto.password ?? '');
        if (!nom) throw new BadRequestException('Le nom est obligatoire.');
        if (!username) throw new BadRequestException("Le nom d'utilisateur est obligatoire.");
        if (password.length < 6) throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères.');

        const existant = await this.usersRepo.findOne({ where: { username } });
        if (existant) throw new BadRequestException(`Le nom d'utilisateur "${username}" est déjà utilisé.`);

        const employe = await this.usersRepo.save(this.usersRepo.create({
            nom, username, password: await bcrypt.hash(password, 10),
            role: 'compatibility_employee', actif: true, id_magasin: null,
        }));
        const { password: _pw, ...reste } = employe;
        return reste;
    }

    async listerEmployes(authorization?: string): Promise<Omit<Utilisateur, 'password'>[]> {
        await this.superAdminRequis(authorization);
        const employes = await this.usersRepo.find({ where: { role: 'compatibility_employee' }, order: { id: 'DESC' } });
        return employes.map(({ password, ...reste }) => reste);
    }

    async suspendreEmploye(id: number, actif: boolean, authorization?: string): Promise<void> {
        await this.superAdminRequis(authorization);
        const employe = await this.usersRepo.findOne({ where: { id, role: 'compatibility_employee' } });
        if (!employe) throw new NotFoundException(`Employé #${id} introuvable`);
        await this.usersRepo.update(id, { actif: !!actif });
    }

    // ── Shared lookups (read-only, no role check - internal helpers only) ──

    private async trouverMarqueId(nom: string): Promise<number | null> {
        if (!nom?.trim()) return null;
        const [row] = await this.dataSource.query(`SELECT id FROM brand WHERE LOWER(TRIM(nom)) = LOWER($1) LIMIT 1`, [nom.trim()]);
        return row?.id ?? null;
    }

    private async trouverModele(idBrand: number, nom: string, code: string | null): Promise<{ id: number; image: string | null } | null> {
        const codeNorm = code?.trim() || null;
        const [row] = await this.dataSource.query(
            `SELECT id, image FROM device_model
               WHERE id_brand = $1
                 AND ($3::text IS NOT NULL AND LOWER(TRIM(code)) = LOWER($3) OR LOWER(TRIM(nom)) = LOWER($2))
               LIMIT 1`,
            [idBrand, (nom ?? '').trim(), codeNorm],
        );
        return row ?? null;
    }

    private cleModele(marque: string, modele: string, code: string | null): string {
        return `${marque.trim().toLowerCase()}::${(code?.trim() || modele.trim()).toLowerCase()}`;
    }

    private async logImport(type: string, idUtilisateur: number | null, nomFichier: string, resultat: unknown): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO compat_import_log (type, id_utilisateur, nom_fichier, resultat) VALUES ($1, $2, $3, $4)`,
            [type, idUtilisateur, nomFichier, JSON.stringify(resultat)],
        );
    }

    private resolveTempFile(importId: string): string {
        if (!IMPORT_ID_PATTERN.test(importId)) throw new BadRequestException('Identifiant d\'import invalide.');
        return join(TMP_DIR, importId);
    }

    private async supprimerFichierTemp(importId: string): Promise<void> {
        await fs.unlink(this.resolveTempFile(importId)).catch(() => undefined);
    }

    // ── Tab 1: Brands & models (ZIP of CSV + images) ────────────

    /** Reads the uploaded ZIP into the (brand -> rows) shape shared by preview and confirm, so
     *  both run the exact same parsing deterministically - re-reading the same file always yields
     *  the same rows in the same order, which is what makes `cleModele` keys stable between the two
     *  calls and makes re-importing the same file a no-op. */
    private parserZipMarquesModeles(zip: AdmZip): { marque: string; lignes: ModeleLigne[]; logo: Buffer | null; erreurs: string[]; images: Map<string, AdmZip.IZipEntry> }[] {
        const entries = zip.getEntries().filter(e => !e.isDirectory);
        for (const e of entries) {
            if (e.entryName.includes('..') || e.entryName.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(e.entryName)) {
                throw new BadRequestException(`Chemin dangereux dans le ZIP : ${e.entryName}`);
            }
        }

        const rootCsv = entries.find(e => this.basename(e.entryName).toLowerCase() === 'all_models.csv');
        const resultats: { marque: string; lignes: ModeleLigne[]; logo: Buffer | null; erreurs: string[]; images: Map<string, AdmZip.IZipEntry> }[] = [];

        if (rootCsv) {
            const { lignes, erreurs } = this.lireCsvGlobal(rootCsv.getData());
            const parMarque = new Map<string, ModeleLigne[]>();
            for (const l of lignes) {
                const key = l.marque.trim();
                if (!parMarque.has(key)) parMarque.set(key, []);
                parMarque.get(key)!.push(l);
            }
            const images = new Map<string, AdmZip.IZipEntry>();
            for (const e of entries) {
                if (/\.(png|jpe?g|webp)$/i.test(e.entryName)) images.set(this.basename(e.entryName).toLowerCase(), e);
            }
            for (const [marque, lignesMarque] of parMarque) {
                resultats.push({ marque, lignes: lignesMarque, logo: null, erreurs, images });
            }
            return resultats;
        }

        // A brand folder is identified by WHERE its models.csv sits, not by assuming it's the first
        // path segment - the real export wraps every brand folder in one extra top-level directory
        // (e.g. "export/SAMSUNG/models.csv"), so "first segment = brand" would have lumped every
        // brand under a single fake "export" brand. Taking the csv's own parent folder name works
        // regardless of how deeply nested it is, including with no wrapper at all ("SAMSUNG/models.csv").
        const dossiers: { marque: string; folderPath: string; csv: AdmZip.IZipEntry; logo?: AdmZip.IZipEntry; images: Map<string, AdmZip.IZipEntry> }[] = [];
        for (const e of entries) {
            if (this.basename(e.entryName).toLowerCase() !== 'models.csv') continue;
            const folderPath = e.entryName.slice(0, e.entryName.length - 'models.csv'.length); // e.g. "export/SAMSUNG/"
            const sansSlashFinal = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
            dossiers.push({ marque: this.basename(sansSlashFinal), folderPath, csv: e, images: new Map() });
        }
        for (const e of entries) {
            const base = this.basename(e.entryName);
            if (base.toLowerCase() === 'models.csv') continue;
            // Must sit DIRECTLY inside that brand's folder (no further '/'), so an unrelated nested
            // structure elsewhere in the archive never gets attributed to the wrong brand.
            const dossier = dossiers.find(d => e.entryName.startsWith(d.folderPath) && !e.entryName.slice(d.folderPath.length).includes('/'));
            if (!dossier) continue;
            if (base.toLowerCase() === '_logo.png') dossier.logo = e;
            else if (/\.(png|jpe?g|webp)$/i.test(base)) dossier.images.set(base.toLowerCase(), e);
        }

        for (const d of dossiers) {
            const { lignes, erreurs } = this.lireCsvMarque(d.csv.getData(), d.marque);
            resultats.push({ marque: d.marque, lignes, logo: d.logo?.getData() ?? null, erreurs, images: d.images });
        }
        return resultats;
    }

    private basename(entryName: string): string {
        const slash = entryName.lastIndexOf('/');
        return slash === -1 ? entryName : entryName.substring(slash + 1);
    }

    private lireCsvGlobal(buf: Buffer): { lignes: ModeleLigne[]; erreurs: string[] } {
        return this.lireCsv(buf, null);
    }

    private lireCsvMarque(buf: Buffer, marqueDossier: string): { lignes: ModeleLigne[]; erreurs: string[] } {
        return this.lireCsv(buf, marqueDossier);
    }

    private lireCsv(buf: Buffer, marqueFixe: string | null): { lignes: ModeleLigne[]; erreurs: string[] } {
        const erreurs: string[] = [];
        let records: Record<string, string>[];
        try {
            records = parseCsv(buf, { columns: true, bom: true, skip_empty_lines: true, trim: true });
        } catch (e: any) {
            return { lignes: [], erreurs: [`CSV illisible : ${e.message}`] };
        }
        if (records.length === 0) return { lignes: [], erreurs: [] };
        const headers = Object.keys(records[0]);
        const colMarque = marqueFixe ? null : trouverColonne(headers, 'marque');
        const colModele = trouverColonne(headers, 'modele');
        const colCode = trouverColonne(headers, 'code');
        const colImage = trouverColonne(headers, 'image');
        if (!marqueFixe && !colMarque) { erreurs.push('Colonne "marque" introuvable dans le CSV global.'); return { lignes: [], erreurs }; }
        if (!colModele) { erreurs.push('Colonne "modèle" introuvable dans le CSV.'); return { lignes: [], erreurs }; }

        const lignes: ModeleLigne[] = [];
        records.forEach((r, i) => {
            const marque = marqueFixe ?? r[colMarque!];
            const modele = r[colModele];
            if (!marque?.trim() || !modele?.trim()) {
                erreurs.push(`Ligne ${i + 2} : marque ou modèle manquant.`);
                return;
            }
            lignes.push({
                marque: marque.trim(),
                modele: modele.trim(),
                code: colCode ? (r[colCode]?.trim() || null) : null,
                imageNomFichier: colImage ? (r[colImage]?.trim() || null) : null,
            });
        });
        return { lignes, erreurs };
    }

    async previsualiserMarquesModeles(filePath: string, importId: string, authorization?: string): Promise<BrandsModelsPreview> {
        await this.importEmployeeRequis(authorization);
        const zip = new (AdmZip as any)(filePath);
        const parMarque = this.parserZipMarquesModeles(zip);

        const marques: MarqueSummary[] = [];
        const modeles: MarquePreviewRow[] = [];
        const erreursFichier: string[] = [];

        for (const { marque, lignes, images, erreurs } of parMarque) {
            erreursFichier.push(...erreurs);
            const idBrand = await this.trouverMarqueId(marque);
            let nouveaux = 0, existants = 0, sansImage = 0, erreursMarque = 0;

            for (const ligne of lignes) {
                const imageEntry = ligne.imageNomFichier ? images.get(ligne.imageNomFichier.toLowerCase()) : undefined;
                const aUneImage = !!imageEntry;
                if (!aUneImage) sansImage++;

                const existant = idBrand ? await this.trouverModele(idBrand, ligne.modele, ligne.code) : null;
                const statut: MarquePreviewRow['statut'] = existant ? 'existing' : 'new';
                if (existant) existants++; else nouveaux++;

                let thumbnail: string | null = null;
                if (imageEntry) {
                    try {
                        const buf = await creerImage(imageEntry.getData()).resize({ width: 48 }).jpeg({ quality: 60 }).toBuffer();
                        thumbnail = `data:image/jpeg;base64,${buf.toString('base64')}`;
                    } catch { /* thumbnail is cosmetic only - a bad image file is still reported via aUneImage/erreurs at confirm time */ }
                }

                modeles.push({
                    cleModele: this.cleModele(marque, ligne.modele, ligne.code),
                    marque, modele: ligne.modele, code: ligne.code,
                    statut, aUneImage, thumbnail,
                });
            }
            marques.push({ marque, nouveaux, existants, sansImage, erreurs: erreursMarque });
        }

        return { importId, marques, modeles, erreursFichier };
    }

    async confirmerMarquesModeles(importId: string, selections: BrandsModelsSelections | undefined, nomFichierOriginal: string, authorization?: string): Promise<BrandsModelsResult> {
        const acteur = await this.importEmployeeRequis(authorization);
        const filePath = this.resolveTempFile(importId);
        const zip = new (AdmZip as any)(filePath);
        const parMarque = this.parserZipMarquesModeles(zip);

        const marquesExclues = new Set((selections?.marquesExclues ?? []).map(m => m.trim().toLowerCase()));
        const modelesExclus = new Set(selections?.modelesExclus ?? []);

        const resultat: BrandsModelsResult = { ajoutes: 0, misAJour: 0, ignores: 0, erreurs: [] };

        for (const { marque, lignes, logo, images } of parMarque) {
            if (marquesExclues.has(marque.trim().toLowerCase())) { resultat.ignores += lignes.length; continue; }

            // Brand creation + logo are their own short transaction, deliberately separate from the
            // models loop below - a brand like SAMSUNG can have 600+ models, each needing its own
            // image resize, stretching that one transaction to minutes. Keeping the quick brand/logo
            // step independent means it isn't exposed to whatever a many-minutes-long transaction
            // risks (a long-lived DB connection going stale, a pooler recycling it, etc.) - observed
            // in practice: logos consistently failed to persist only on the full real import (23
            // brands, ~10 total minutes) despite succeeding in every smaller/faster repro, including
            // SAMSUNG alone at full size (619 models, ~100s) - duration of the TOTAL request, not any
            // single transaction, correlated with the failures.
            let idBrand: number;
            try {
                idBrand = (await this.compatibilityService.creerMarqueInterne({ nom: marque })).id;
                if (logo) {
                    const [row] = await this.dataSource.query(`SELECT logo FROM brand WHERE id = $1`, [idBrand]);
                    if (!row?.logo) {
                        const url = await this.enregistrerImage(logo);
                        await this.dataSource.query(`UPDATE brand SET logo = $2 WHERE id = $1`, [idBrand, url]);
                    }
                }
            } catch (e: any) {
                resultat.erreurs.push({ marque, message: e.message || String(e) });
                continue;
            }

            // Counted locally and only merged into `resultat` once this brand's transaction actually
            // commits - a brand that throws partway through rolls back every INSERT it made, and
            // must report zero of them too, not whatever happened to run before the failure. Without
            // this, a row that failed (and was rolled back) could still be counted as "added".
            let brandAjoutes = 0, brandMisAJour = 0, brandIgnores = 0;
            try {
                await this.dataSource.transaction(async (manager) => {
                    for (const ligne of lignes) {
                        const cle = this.cleModele(marque, ligne.modele, ligne.code);
                        if (modelesExclus.has(cle)) { brandIgnores++; continue; }

                        const existant = await this.trouverModele(idBrand, ligne.modele, ligne.code);
                        let imageUrl: string | undefined;
                        const imageEntry = ligne.imageNomFichier ? images.get(ligne.imageNomFichier.toLowerCase()) : undefined;
                        // Import rule: a photo is attached only when the model doesn't already have
                        // one - never overwrites a photo the compat editor set manually. (Different
                        // from creerModeleInterne's own default, which DOES overwrite - that's the
                        // compat-editor's intentional "replace the photo" action elsewhere.)
                        if (imageEntry && !existant?.image) {
                            imageUrl = await this.enregistrerImage(imageEntry.getData());
                        }

                        await this.compatibilityService.creerModeleInterne({
                            id_brand: idBrand,
                            nom: ligne.modele,
                            code: ligne.code ?? undefined,
                            image: imageUrl,
                        }, manager);

                        if (existant) brandMisAJour++; else brandAjoutes++;
                    }
                });
                resultat.ajoutes += brandAjoutes;
                resultat.misAJour += brandMisAJour;
                resultat.ignores += brandIgnores;
            } catch (e: any) {
                resultat.erreurs.push({ marque, message: e.message || String(e) });
            }
        }

        await this.supprimerFichierTemp(importId);
        await this.logImport('brands_models', acteur.id, nomFichierOriginal, resultat);
        return resultat;
    }

    /** Resizes/compresses to webp (max width 400px) and saves into the same folder/naming scheme
     *  the rest of the compat catalogue's model photos already use. */
    private async enregistrerImage(buffer: Buffer): Promise<string> {
        const resized = await creerImage(buffer).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        await fs.writeFile(join(MODELS_DIR, filename), resized);
        return `/uploads/compat-models/${filename}`;
    }

    // ── Tab 2: Compatibilities (JSON, or a ZIP containing it) ───

    private async lireGroupesJson(filePath: string): Promise<CompatGroupeImport[]> {
        let raw: string;
        if (filePath.toLowerCase().endsWith('.zip')) {
            const zip = new (AdmZip as any)(filePath);
            const entries = zip.getEntries().filter((e: AdmZip.IZipEntry) => !e.isDirectory);
            for (const e of entries) {
                if (e.entryName.includes('..') || e.entryName.startsWith('/')) {
                    throw new BadRequestException(`Chemin dangereux dans le ZIP : ${e.entryName}`);
                }
            }
            const jsonEntry = entries.find((e: AdmZip.IZipEntry) => /compatibilities\.json$/i.test(e.entryName))
                ?? entries.find((e: AdmZip.IZipEntry) => /\.json$/i.test(e.entryName));
            if (!jsonEntry) throw new BadRequestException('Aucun fichier .json trouvé dans le ZIP.');
            raw = jsonEntry.getData().toString('utf8');
        } else {
            raw = await fs.readFile(filePath, 'utf8');
        }
        let data: unknown;
        try {
            data = JSON.parse(raw);
        } catch (e: any) {
            throw new BadRequestException(`JSON invalide : ${e.message}`);
        }
        return Array.isArray(data) ? (data as CompatGroupeImport[]) : [data as CompatGroupeImport];
    }

    /** Any OTHER group of the same part type that already contains at least one of these models -
     *  a read-only informational check (no role check, no side effect), parallel in spirit to
     *  CompatibilityService.verifierChevauchementGroupe() but usable here without that method's own
     *  editeurRequis gate. */
    private async trouverGroupeChevauchant(idPartType: number, idModeles: number[]): Promise<{ id: number; modeles: string[] } | null> {
        if (!idModeles.length) return null;
        const [row] = await this.dataSource.query(
            `SELECT cg.id,
                    COALESCE(array_agg(b.nom || ' ' || dm.nom ORDER BY dm.nom) FILTER (WHERE dm.id IS NOT NULL), '{}') AS modeles
               FROM compat_group cg
               JOIN compat_group_model cgm ON cgm.id_group = cg.id AND cgm.id_model = ANY($2::int[])
               LEFT JOIN compat_group_model all_cgm ON all_cgm.id_group = cg.id
               LEFT JOIN device_model dm ON dm.id = all_cgm.id_model
               LEFT JOIN brand b ON b.id = dm.id_brand
              WHERE cg.id_part_type = $1
              GROUP BY cg.id
              LIMIT 1`,
            [idPartType, idModeles],
        );
        return row ?? null;
    }

    private async resoudreGroupe(partTypeKey: string, g: CompatGroupeImport, index: number): Promise<CompatGroupPreviewRow> {
        const resolved: { brand: string; nom: string; code: string | null; trouve: boolean; idModel: number | null }[] = [];
        for (const m of g.models ?? []) {
            const idBrand = await this.trouverMarqueId(m.brand);
            const modele = idBrand ? await this.trouverModele(idBrand, m.name, m.code ?? null) : null;
            resolved.push({ brand: m.brand, nom: m.name, code: m.code ?? null, trouve: !!modele, idModel: modele?.id ?? null });
        }
        const trouves = resolved.filter(r => r.idModel != null);
        const confirmes = (g.models ?? []).filter(m => estBadgeConfirme(m.badge)).length;
        const statutPropose: 'confirmed' | 'needs_test' = confirmes === (g.models ?? []).length && confirmes > 0 ? 'confirmed' : 'needs_test';

        let action: CompatGroupPreviewRow['action'] = 'none';
        let fusionAvecGroupeId: number | undefined;
        let fusionAvecModeles: string[] | undefined;
        if (trouves.length > 0) {
            const idPartType = await this.trouverTypePieceId(partTypeKey);
            const chevauchant = idPartType ? await this.trouverGroupeChevauchant(idPartType, trouves.map(t => t.idModel!)) : null;
            if (chevauchant) {
                action = 'merge';
                fusionAvecGroupeId = chevauchant.id;
                fusionAvecModeles = chevauchant.modeles;
            } else {
                action = 'create';
            }
        }

        return {
            cleGroupe: `${partTypeKey}#${index}`,
            partTypeKey,
            statutPropose,
            modeles: resolved.map(({ brand, nom, code, trouve }) => ({ brand, nom, code, trouve })),
            action,
            fusionAvecGroupeId,
            fusionAvecModeles,
        };
    }

    private async trouverTypePieceId(partTypeKey: string): Promise<number | null> {
        const def = PART_TYPE_MAP[partTypeKey];
        if (!def) return null;
        const [row] = await this.dataSource.query(
            `SELECT id FROM part_type WHERE LOWER(TRIM(nom_fr))=LOWER($1) OR LOWER(TRIM(nom_en))=LOWER($2) OR LOWER(TRIM(nom_ar))=LOWER($3) LIMIT 1`,
            [def.nom_fr, def.nom_en, def.nom_ar],
        );
        return row?.id ?? null;
    }

    private normaliserPartType(raw: string): string {
        return (raw ?? '').trim().toLowerCase();
    }

    async previsualiserCompatibilites(filePath: string, importId: string, authorization?: string): Promise<CompatibilitiesPreview> {
        await this.importEmployeeRequis(authorization);
        const groupesImport = await this.lireGroupesJson(filePath);

        const groupes: CompatGroupPreviewRow[] = [];
        const parType = new Map<string, CompatTypeSummary>();

        for (let i = 0; i < groupesImport.length; i++) {
            const g = groupesImport[i];
            const partTypeKey = this.normaliserPartType(g.partType);
            if (!PART_TYPE_MAP[partTypeKey]) continue; // unknown type - silently excluded from preview, nothing to select
            const row = await this.resoudreGroupe(partTypeKey, g, i);
            groupes.push(row);

            if (!parType.has(partTypeKey)) parType.set(partTypeKey, { partTypeKey, nouveaux: 0, aFusionner: 0, modelesIntrouvables: 0 });
            const s = parType.get(partTypeKey)!;
            if (row.action === 'create') s.nouveaux++;
            if (row.action === 'merge') s.aFusionner++;
            s.modelesIntrouvables += row.modeles.filter(m => !m.trouve).length;
        }

        return { importId, types: [...parType.values()], groupes };
    }

    async confirmerCompatibilites(importId: string, selections: CompatibilitiesSelections | undefined, partTypesChoisis: string[] | undefined, nomFichierOriginal: string, authorization?: string): Promise<CompatibilitiesResult> {
        const acteur = await this.importEmployeeRequis(authorization);
        const filePath = this.resolveTempFile(importId);
        const groupesImport = await this.lireGroupesJson(filePath);

        const exclus = new Set(selections?.groupesExclus ?? []);
        const fusionsConfirmees = new Set(selections?.fusionsConfirmees ?? []);
        const typesChoisis = partTypesChoisis?.length ? new Set(partTypesChoisis.map(t => t.trim().toLowerCase())) : null;

        const resultat: CompatibilitiesResult = { crees: 0, fusionnes: 0, ignores: 0, modelesIntrouvables: 0 };

        for (let i = 0; i < groupesImport.length; i++) {
            const g = groupesImport[i];
            const partTypeKey = this.normaliserPartType(g.partType);
            if (!PART_TYPE_MAP[partTypeKey]) continue;
            if (typesChoisis && !typesChoisis.has(partTypeKey)) continue;

            const cleGroupe = `${partTypeKey}#${i}`;
            if (exclus.has(cleGroupe)) { resultat.ignores++; continue; }

            const { id: idPartType } = await this.compatibilityService.creerTypePieceInterne(PART_TYPE_MAP[partTypeKey]);

            const resolved: { idModel: number }[] = [];
            for (const m of g.models ?? []) {
                const idBrand = await this.trouverMarqueId(m.brand);
                const modele = idBrand ? await this.trouverModele(idBrand, m.name, m.code ?? null) : null;
                if (!modele) { resultat.modelesIntrouvables++; continue; }
                resolved.push({ idModel: modele.id });
            }
            if (resolved.length === 0) { resultat.ignores++; continue; }

            const confirmes = (g.models ?? []).filter(m => estBadgeConfirme(m.badge)).length;
            const statut: 'confirmed' | 'needs_test' = confirmes === (g.models ?? []).length ? 'confirmed' : 'needs_test';

            const idModeles = resolved.map(r => r.idModel);
            const chevauchant = await this.trouverGroupeChevauchant(idPartType, idModeles);

            if (chevauchant && fusionsConfirmees.has(cleGroupe)) {
                // Merge into the existing group: add any missing members, and never downgrade an
                // already-confirmed group's status just because this import's badge wasn't
                // "توافق مؤكد" - manually-entered confirmations must survive a re-import untouched.
                await this.dataSource.transaction(async (manager) => {
                    for (const idModel of idModeles) {
                        await manager.query(`INSERT INTO compat_group_model (id_group, id_model) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [chevauchant.id, idModel]);
                    }
                    await manager.query(
                        `UPDATE compat_group SET statut = CASE WHEN statut = 'confirmed' OR $2 = 'confirmed' THEN 'confirmed' ELSE 'needs_test' END WHERE id = $1`,
                        [chevauchant.id, statut],
                    );
                });
                resultat.fusionnes++;
                continue;
            }

            // No overlap, or an overlap the user didn't confirm merging into: create (or reuse, if
            // it's an exact-duplicate of an existing group - creerGroupeInterne's own dedup) a
            // separate group, same as the compat-editor's own manual "new group" action.
            await this.compatibilityService.creerGroupeInterne(
                { id_part_type: idPartType, id_base_model: idModeles[0], modeleIds: idModeles.slice(1), statut },
                acteur.id,
            );
            resultat.crees++;
        }

        await this.supprimerFichierTemp(importId);
        await this.logImport('compatibilities', acteur.id, nomFichierOriginal, resultat);
        return resultat;
    }
}
