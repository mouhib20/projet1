import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Utilisateur } from '../users/user.entity';
import { CaisseService, Acteur } from '../caisse/caisse.service';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class CompatibilityService {
    constructor(
        @InjectRepository(Utilisateur)
        private readonly usersRepo: Repository<Utilisateur>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly storeContext: StoreContextService,
    ) { }

    // ── Access checks ────────────────────────────────────────────

    private async superAdminRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
        return acteur;
    }

    /** Writing/editing the shared catalogue: compat_editor accounts, or super_admin. */
    private async editeurRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'compat_editor' && acteur.role !== 'super_admin') {
            throw new ForbiddenException("Action réservée aux éditeurs de compatibilité.");
        }
        return acteur;
    }

    /** Exposes the editor-role check for the controller's upload-image route. */
    async verifierEditeur(authorization?: string): Promise<void> {
        await this.editeurRequis(authorization);
    }

    // ── Search (shared, read-only for every store) ─────────────────

    /**
     * Search device models by name/commercial name/code/brand. Deliberately NOT scoped by
     * id_magasin - the catalogue itself (brand/device_model/compat_group) is shared by design.
     */
    async rechercheModeles(q: string): Promise<any[]> {
        const terme = String(q ?? '').trim();
        if (terme.length < 2) return [];
        const like = `%${terme}%`;
        const rows = await this.dataSource.query(
            `SELECT dm.id AS id_model, dm.nom AS modele, dm.nom_commercial, dm.code,
                    b.id AS id_brand, b.nom AS marque,
                    cg.id AS id_group, pt.id AS id_part_type, pt.nom_fr, pt.nom_en, pt.nom_ar
               FROM device_model dm
               JOIN brand b ON b.id = dm.id_brand
               LEFT JOIN compat_group_model cgm ON cgm.id_model = dm.id
               LEFT JOIN compat_group cg ON cg.id = cgm.id_group
               LEFT JOIN part_type pt ON pt.id = cg.id_part_type
              WHERE dm.nom ILIKE $1 OR dm.code ILIKE $1 OR dm.nom_commercial ILIKE $1 OR b.nom ILIKE $1
              ORDER BY b.nom, dm.nom
              LIMIT 200`,
            [like],
        );

        const parModele = new Map<number, any>();
        for (const r of rows) {
            if (!parModele.has(r.id_model)) {
                parModele.set(r.id_model, {
                    id_model: r.id_model, modele: r.modele, nom_commercial: r.nom_commercial,
                    code: r.code, id_brand: r.id_brand, marque: r.marque, groupes: [],
                });
            }
            if (r.id_group) {
                parModele.get(r.id_model).groupes.push({
                    id_group: r.id_group, id_part_type: r.id_part_type,
                    nom_fr: r.nom_fr, nom_en: r.nom_en, nom_ar: r.nom_ar,
                });
            }
        }
        return [...parModele.values()].slice(0, 20);
    }

    /**
     * Parts (compat groups) for a device model, with THIS store's own stock/price if it has
     * stocked one - never another store's. The store filter sits inside the LEFT JOIN's ON
     * clause (not a WHERE), so a group the caller's store never stocked still appears, just
     * without article fields.
     */
    async piecesPourModele(idModele: number): Promise<any[]> {
        const id_magasin = this.storeContext.requireMagasinId();
        return this.dataSource.query(
            `SELECT cg.id AS id_group, pt.id AS id_part_type, pt.nom_fr, pt.nom_en, pt.nom_ar,
                    cg.note, cg.image,
                    a.id_article, a.designation, a.quantite, a.prix_vente
               FROM compat_group_model cgm
               JOIN compat_group cg ON cg.id = cgm.id_group
               JOIN part_type pt ON pt.id = cg.id_part_type
               LEFT JOIN article a ON a.compat_group_id = cg.id AND a.id_magasin = $2
              WHERE cgm.id_model = $1`,
            [idModele, id_magasin],
        );
    }

    // ── Reference data for the search page's type→brand→model pickers (same access as search
    // itself - no editeurRequis, just @RequirePermission at the controller) ──

    async listerTypesPiecesRecherche(): Promise<any[]> {
        return this.dataSource.query(`SELECT id, nom_fr, nom_en, nom_ar, categorie FROM part_type ORDER BY nom_fr`);
    }

    async listerMarquesRecherche(): Promise<any[]> {
        return this.dataSource.query(`SELECT id, nom, logo FROM brand ORDER BY nom`);
    }

    async listerModelesParMarqueRecherche(idBrand: number): Promise<any[]> {
        return this.dataSource.query(
            `SELECT dm.id, dm.nom, dm.nom_commercial, dm.code, dm.image, dm.id_brand, b.nom AS marque
               FROM device_model dm JOIN brand b ON b.id = dm.id_brand
              WHERE dm.id_brand = $1 ORDER BY dm.nom`,
            [idBrand],
        );
    }

    /** Every device model that shares the same compat_group (part) as the one just matched -
     *  the "confirmed compatible devices" list shown once a type+brand+model search resolves. */
    async modelesPourGroupe(idGroup: number): Promise<any[]> {
        return this.dataSource.query(
            `SELECT dm.id, dm.nom, dm.nom_commercial, dm.code, dm.image, dm.id_brand, b.nom AS marque
               FROM compat_group_model cgm
               JOIN device_model dm ON dm.id = cgm.id_model
               JOIN brand b ON b.id = dm.id_brand
              WHERE cgm.id_group = $1
              ORDER BY b.nom, dm.nom`,
            [idGroup],
        );
    }

    /** The existing compat_group (if any) for a given model+part-type combo - used by the Stock
     *  form to link a new article to an already-registered part instead of duplicating it. */
    async resolveGroupeRecherche(idModel: number, idPartType: number): Promise<{ id_group: number } | null> {
        const rows = await this.dataSource.query(
            `SELECT cg.id FROM compat_group cg
               JOIN compat_group_model cgm ON cgm.id_group = cg.id
              WHERE cgm.id_model = $1 AND cg.id_part_type = $2
              LIMIT 1`,
            [idModel, idPartType],
        );
        return rows[0] ? { id_group: rows[0].id } : null;
    }

    /** Best-effort text match of the Stock form's free-text type/marque/modele against the
     *  compat catalogue (brand/device_model are ID-referenced there, not text) - lets an article
     *  auto-link to its compat group without the user re-picking brand/model by hand. Exact,
     *  case-insensitive, trimmed matches only (plus a whitespace-insensitive fallback for the
     *  model name, e.g. 'spark6' vs 'spark 6') - never a fuzzy/partial match, to avoid linking
     *  the wrong device. `raison` says exactly which step failed, so the Stock form can tell the
     *  user why instead of a generic "no match". */
    async autoResolveGroupeRecherche(termesType: string[], marque: string, modele: string): Promise<{ id_group: number; id_part_type: number } | { raison: 'type' | 'marque' | 'modele' | 'groupe' }> {
        const termes = [...new Set(termesType.map(t => t.trim().toLowerCase()).filter(Boolean))];
        const marqueNorm = marque.trim().toLowerCase();
        const modeleNorm = modele.trim().toLowerCase();
        const modeleCompact = modeleNorm.replace(/\s+/g, '');
        if (!termes.length) return { raison: 'type' };
        if (!marqueNorm) return { raison: 'marque' };
        if (!modeleNorm) return { raison: 'modele' };

        const typeRows = await this.dataSource.query(
            `SELECT id FROM part_type
               WHERE LOWER(TRIM(nom_fr)) = ANY($1) OR LOWER(TRIM(nom_en)) = ANY($1) OR LOWER(TRIM(nom_ar)) = ANY($1)
               LIMIT 1`,
            [termes],
        );
        if (!typeRows[0]) return { raison: 'type' };
        const idPartType = typeRows[0].id;

        const brandRows = await this.dataSource.query(
            `SELECT id FROM brand WHERE LOWER(TRIM(nom)) = $1 LIMIT 1`,
            [marqueNorm],
        );
        if (!brandRows[0]) return { raison: 'marque' };
        const idBrand = brandRows[0].id;

        const modelRows = await this.dataSource.query(
            `SELECT id FROM device_model
               WHERE id_brand = $1
                 AND (LOWER(TRIM(nom)) = $2 OR LOWER(TRIM(nom_commercial)) = $2 OR LOWER(TRIM(code)) = $2
                      OR REPLACE(LOWER(nom), ' ', '') = $3)
               LIMIT 1`,
            [idBrand, modeleNorm, modeleCompact],
        );
        if (!modelRows[0]) return { raison: 'modele' };
        const idModel = modelRows[0].id;

        const groupe = await this.resolveGroupeRecherche(idModel, idPartType);
        return groupe ? { id_group: groupe.id_group, id_part_type: idPartType } : { raison: 'groupe' };
    }

    /** A group's part-type name, for displaying "already linked to <type>" on an existing article. */
    async groupeInfoRecherche(idGroup: number): Promise<{ id_part_type: number; nom_fr: string; nom_en: string; nom_ar: string } | null> {
        const rows = await this.dataSource.query(
            `SELECT pt.id AS id_part_type, pt.nom_fr, pt.nom_en, pt.nom_ar
               FROM compat_group cg JOIN part_type pt ON pt.id = cg.id_part_type
              WHERE cg.id = $1`,
            [idGroup],
        );
        return rows[0] ?? null;
    }

    // ── Reference data (brands, models, part types): editor-only, for building groups ──

    async listerMarques(authorization?: string): Promise<any[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(`SELECT id, nom, logo FROM brand ORDER BY nom`);
    }

    /** Case-insensitive, trimmed dedup ("Samsung" / "samsung " / "SAMSUNG" must resolve to the
     *  same row) - returns the existing brand instead of creating a near-duplicate. */
    async creerMarque(dto: { nom: string; logo?: string }, authorization?: string): Promise<{ id: number }> {
        await this.editeurRequis(authorization);
        const nom = String(dto.nom ?? '').trim();
        if (!nom) throw new BadRequestException('Le nom de la marque est obligatoire.');
        const existant = await this.dataSource.query(
            `SELECT id FROM brand WHERE LOWER(TRIM(nom)) = LOWER($1) LIMIT 1`,
            [nom],
        );
        if (existant[0]) return { id: existant[0].id };
        const rows = await this.dataSource.query(
            `INSERT INTO brand (nom, logo) VALUES ($1, $2) RETURNING id`,
            [nom, dto.logo || null],
        );
        return { id: rows[0].id };
    }

    async listerModeles(authorization?: string): Promise<any[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(
            `SELECT dm.id, dm.nom, dm.nom_commercial, dm.code, b.id AS id_brand, b.nom AS marque
               FROM device_model dm JOIN brand b ON b.id = dm.id_brand
              ORDER BY b.nom, dm.nom`,
        );
    }

    /** Case-insensitive, trimmed dedup scoped to the brand (the same model name can legitimately
     *  exist under two different brands) - returns the existing model instead of creating a
     *  near-duplicate. Image, if given, still overwrites the existing row's (COALESCE keeps it
     *  when not given), so re-"creating" a known model to attach a photo still works. */
    async creerModele(dto: { id_brand: number; nom: string; nom_commercial?: string; code?: string; image?: string }, authorization?: string): Promise<{ id: number }> {
        await this.editeurRequis(authorization);
        const nom = String(dto.nom ?? '').trim();
        if (!dto.id_brand) throw new BadRequestException('La marque est obligatoire.');
        if (!nom) throw new BadRequestException('Le nom du modèle est obligatoire.');
        const existant = await this.dataSource.query(
            `SELECT id FROM device_model WHERE id_brand = $1 AND LOWER(TRIM(nom)) = LOWER($2) LIMIT 1`,
            [dto.id_brand, nom],
        );
        if (existant[0]) {
            if (dto.image) {
                await this.dataSource.query(`UPDATE device_model SET image = $2 WHERE id = $1`, [existant[0].id, dto.image]);
            }
            return { id: existant[0].id };
        }
        const rows = await this.dataSource.query(
            `INSERT INTO device_model (id_brand, nom, nom_commercial, code, image) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [dto.id_brand, nom, dto.nom_commercial?.trim() || null, dto.code?.trim() || null, dto.image || null],
        );
        return { id: rows[0].id };
    }

    /** Only image is editable today - models otherwise have no edit path once created. */
    async modifierModele(id: number, dto: { image?: string }, authorization?: string): Promise<void> {
        await this.editeurRequis(authorization);
        await this.dataSource.query(
            `UPDATE device_model SET image = COALESCE($2, image) WHERE id = $1`,
            [id, dto.image ?? null],
        );
    }

    async listerTypesPieces(authorization?: string): Promise<any[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(`SELECT id, nom_fr, nom_en, nom_ar, categorie FROM part_type ORDER BY nom_fr`);
    }

    async creerTypePiece(dto: { nom_fr: string; nom_en: string; nom_ar: string; categorie?: 'part' | 'accessory' }, authorization?: string): Promise<{ id: number }> {
        await this.editeurRequis(authorization);
        const nomFr = String(dto.nom_fr ?? '').trim();
        const nomEn = String(dto.nom_en ?? '').trim();
        const nomAr = String(dto.nom_ar ?? '').trim();
        if (!nomFr || !nomEn || !nomAr) throw new BadRequestException('Le nom du type de pièce est obligatoire dans les trois langues.');
        const rows = await this.dataSource.query(
            `INSERT INTO part_type (nom_fr, nom_en, nom_ar, categorie) VALUES ($1, $2, $3, $4) RETURNING id`,
            [nomFr, nomEn, nomAr, dto.categorie === 'accessory' ? 'accessory' : 'part'],
        );
        return { id: rows[0].id };
    }

    // ── Groups (write: compat_editor/super_admin; delete: super_admin only) ────

    /** Warns (never blocks) when a model being added to a group - as base or as compatible -
     *  already sits in a DIFFERENT group of the same part type. That's how a device ends up
     *  split across two "glass" groups with different stock status: nothing stopped an editor
     *  from creating a second group instead of adding to the existing one. excludeGroupId is the
     *  group currently being edited, so editing a group never warns about itself. */
    async verifierChevauchementGroupe(idModel: number, idPartType: number, excludeGroupId: number | undefined, authorization?: string): Promise<{ id_group: number; modeles: string[] }[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(
            `SELECT cg.id AS id_group,
                    COALESCE(array_agg(b.nom || ' ' || dm.nom ORDER BY dm.nom) FILTER (WHERE dm.id IS NOT NULL), '{}') AS modeles
               FROM compat_group cg
               JOIN compat_group_model mine ON mine.id_group = cg.id AND mine.id_model = $1
               LEFT JOIN compat_group_model cgm ON cgm.id_group = cg.id
               LEFT JOIN device_model dm ON dm.id = cgm.id_model
               LEFT JOIN brand b ON b.id = dm.id_brand
              WHERE cg.id_part_type = $2 AND ($3::int IS NULL OR cg.id != $3)
              GROUP BY cg.id`,
            [idModel, idPartType, excludeGroupId ?? null],
        );
    }

    /** All groups, for the editor's management table. */
    async listerGroupes(authorization?: string): Promise<any[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(
            `SELECT cg.id, cg.note, cg.image, cg.date_creation, cg.id_base_model,
                    base.nom AS base_nom, baseBrand.nom AS base_marque,
                    pt.id AS id_part_type, pt.nom_fr, pt.nom_en, pt.nom_ar,
                    COALESCE(array_agg(dm.nom ORDER BY dm.nom) FILTER (WHERE dm.nom IS NOT NULL), '{}') AS modeles
               FROM compat_group cg
               JOIN part_type pt ON pt.id = cg.id_part_type
               LEFT JOIN device_model base ON base.id = cg.id_base_model
               LEFT JOIN brand baseBrand ON baseBrand.id = base.id_brand
               LEFT JOIN compat_group_model cgm ON cgm.id_group = cg.id
               LEFT JOIN device_model dm ON dm.id = cgm.id_model
              GROUP BY cg.id, pt.id, base.nom, baseBrand.nom
              ORDER BY cg.date_creation DESC`,
        );
    }

    /** One group with its linked model ids, for the edit form. */
    async obtenirGroupe(id: number, authorization?: string): Promise<any> {
        await this.editeurRequis(authorization);
        const [groupe] = await this.dataSource.query(
            `SELECT cg.id, cg.note, cg.image, cg.id_part_type, cg.id_base_model FROM compat_group cg WHERE cg.id = $1`,
            [id],
        );
        if (!groupe) throw new NotFoundException(`Groupe de compatibilité #${id} introuvable`);
        const modeles = await this.dataSource.query(
            `SELECT id_model FROM compat_group_model WHERE id_group = $1`,
            [id],
        );
        return { ...groupe, modeleIds: modeles.map((m: any) => m.id_model) };
    }



    /** modeleIds is the "also fits" list - the base model is always added to compat_group_model
     *  too (so every existing read - search, stock status, the customer-facing device grid - keeps
     *  working unchanged off group membership alone), but it never needs to be in modeleIds itself. */
    async creerGroupe(
        dto: { id_part_type: number; id_base_model: number; modeleIds: number[]; note?: string; image?: string },
        authorization?: string,
    ): Promise<{ id: number }> {
        const acteur = await this.editeurRequis(authorization);
        if (!dto.id_part_type) throw new BadRequestException('Le type de pièce est obligatoire.');
        if (!dto.id_base_model) throw new BadRequestException("Le téléphone original de la pièce est obligatoire.");
        const modeles = [...new Set([dto.id_base_model, ...(dto.modeleIds || [])])];
        return this.dataSource.transaction(async (m) => {
            const [row] = await m.query(
                `INSERT INTO compat_group (id_part_type, id_base_model, note, image, cree_par) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [dto.id_part_type, dto.id_base_model, dto.note?.trim() || null, dto.image || null, acteur.id],
            );
            for (const idModel of modeles) {
                await m.query(
                    `INSERT INTO compat_group_model (id_group, id_model) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [row.id, idModel],
                );
            }
            return { id: row.id };
        });
    }

    async modifierGroupe(
        id: number,
        dto: { id_part_type?: number; id_base_model?: number; modeleIds?: number[]; note?: string; image?: string },
        authorization?: string,
    ): Promise<void> {
        await this.editeurRequis(authorization);
        const [existant] = await this.dataSource.query(`SELECT id, id_base_model FROM compat_group WHERE id = $1`, [id]);
        if (!existant) throw new NotFoundException(`Groupe de compatibilité #${id} introuvable`);

        await this.dataSource.transaction(async (m) => {
            if (dto.id_part_type !== undefined || dto.id_base_model !== undefined || dto.note !== undefined || dto.image !== undefined) {
                await m.query(
                    `UPDATE compat_group SET
                        id_part_type = COALESCE($2, id_part_type),
                        id_base_model = COALESCE($3, id_base_model),
                        note = COALESCE($4, note),
                        image = COALESCE($5, image)
                     WHERE id = $1`,
                    [id, dto.id_part_type ?? null, dto.id_base_model ?? null, dto.note?.trim() ?? null, dto.image ?? null],
                );
            }
            if (dto.modeleIds) {
                const idBase = dto.id_base_model ?? existant.id_base_model;
                const modeles = [...new Set([idBase, ...dto.modeleIds].filter((v): v is number => v != null))];
                await m.query(`DELETE FROM compat_group_model WHERE id_group = $1`, [id]);
                for (const idModel of modeles) {
                    await m.query(
                        `INSERT INTO compat_group_model (id_group, id_model) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [id, idModel],
                    );
                }
            }
        });
    }

    async supprimerGroupe(id: number, authorization?: string): Promise<void> {
        await this.superAdminRequis(authorization);
        const res = await this.dataSource.query(`DELETE FROM compat_group WHERE id = $1`, [id]);
        const affected = Array.isArray(res) ? res[1] : 0;
        if (!affected) throw new NotFoundException(`Groupe de compatibilité #${id} introuvable`);
    }

    // ── Suggestions ──────────────────────────────────────────────

    async creerSuggestion(
        dto: { id_model?: number; texte_libre?: string; id_part_type?: number },
        authorization?: string,
    ): Promise<{ id: number }> {
        const id_magasin = this.storeContext.requireMagasinId();
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (!dto.id_model && !String(dto.texte_libre ?? '').trim()) {
            throw new BadRequestException('Précisez le modèle ou décrivez votre suggestion.');
        }
        const rows = await this.dataSource.query(
            `INSERT INTO compat_suggestion (id_magasin, id_model, texte_libre, id_part_type, cree_par)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [id_magasin, dto.id_model ?? null, dto.texte_libre?.trim() || null, dto.id_part_type ?? null, acteur.id],
        );
        return { id: rows[0].id };
    }

    async listerSuggestions(authorization?: string): Promise<any[]> {
        await this.editeurRequis(authorization);
        return this.dataSource.query(
            `SELECT s.id, s.id_magasin, mag.nom AS magasin_nom, s.id_model, dm.nom AS modele_nom,
                    s.texte_libre, s.id_part_type, pt.nom_fr AS part_type_nom, s.statut,
                    s.cree_par, u.nom AS cree_par_nom, s.date_creation
               FROM compat_suggestion s
               LEFT JOIN magasin mag ON mag.id_magasin = s.id_magasin
               LEFT JOIN device_model dm ON dm.id = s.id_model
               LEFT JOIN part_type pt ON pt.id = s.id_part_type
               LEFT JOIN utilisateurs u ON u.id = s.cree_par
              ORDER BY s.date_creation DESC`,
        );
    }

    async traiterSuggestion(id: number, statut: 'acceptee' | 'refusee', authorization?: string): Promise<void> {
        await this.editeurRequis(authorization);
        if (statut !== 'acceptee' && statut !== 'refusee') throw new BadRequestException('Statut invalide.');
        const res = await this.dataSource.query(`UPDATE compat_suggestion SET statut = $2 WHERE id = $1`, [id, statut]);
        const affected = Array.isArray(res) ? res[1] : 0;
        if (!affected) throw new NotFoundException(`Suggestion #${id} introuvable`);
    }

    // ── Compat-editor accounts (super_admin only) ────────────────

    async creerEditeur(dto: { nom: string; username: string; password: string }, authorization?: string): Promise<Omit<Utilisateur, 'password'>> {
        await this.superAdminRequis(authorization);
        const nom = String(dto.nom ?? '').trim();
        const username = String(dto.username ?? '').trim();
        const password = String(dto.password ?? '');
        if (!nom) throw new BadRequestException('Le nom est obligatoire.');
        if (!username) throw new BadRequestException("Le nom d'utilisateur est obligatoire.");
        if (password.length < 6) throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères.');

        const existant = await this.usersRepo.findOne({ where: { username } });
        if (existant) throw new BadRequestException(`Le nom d'utilisateur "${username}" est déjà utilisé.`);

        const editeur = await this.usersRepo.save(this.usersRepo.create({
            nom, username, password: await bcrypt.hash(password, 10),
            role: 'compat_editor', actif: true, id_magasin: null,
        }));
        const { password: _pw, ...reste } = editeur;
        return reste;
    }

    async listerEditeurs(authorization?: string): Promise<Omit<Utilisateur, 'password'>[]> {
        await this.superAdminRequis(authorization);
        const editeurs = await this.usersRepo.find({ where: { role: 'compat_editor' }, order: { id: 'DESC' } });
        return editeurs.map(({ password, ...reste }) => reste);
    }

    async suspendreEditeur(id: number, actif: boolean, authorization?: string): Promise<void> {
        await this.superAdminRequis(authorization);
        const editeur = await this.usersRepo.findOne({ where: { id, role: 'compat_editor' } });
        if (!editeur) throw new NotFoundException(`Éditeur #${id} introuvable`);
        await this.usersRepo.update(id, { actif: !!actif });
    }
}
