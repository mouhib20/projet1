import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CaisseService, Acteur } from '../caisse/caisse.service';
import { MagasinsService } from '../magasins/magasins.service';
import { Departement, DEPARTEMENTS } from '../permissions/permission.entity';

export type StatutAbonnement = 'trial' | 'active' | 'grace' | 'suspended';

@Injectable()
export class AbonnementsService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
        private readonly magasinsService: MagasinsService,
    ) { }

    // ── Access check ────────────────────────────────────────────

    private async superAdminRequis(authorization?: string): Promise<Acteur> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
        return acteur;
    }

    private async enregistrerHistorique(idMagasin: number | null, type: string, idUtilisateur: number | null, ancienneValeur: unknown, nouvelleValeur: unknown, raison?: string | null): Promise<void> {
        const serialiser = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v));
        await this.dataSource.query(
            `INSERT INTO abonnement_historique (id_magasin, type, id_utilisateur, ancienne_valeur, nouvelle_valeur, raison) VALUES ($1, $2, $3, $4, $5, $6)`,
            [idMagasin, type, idUtilisateur, serialiser(ancienneValeur), serialiser(nouvelleValeur), raison ?? null],
        );
    }

    // ── Global pricing settings ─────────────────────────────────

    async obtenirParametres(authorization?: string): Promise<any> {
        await this.superAdminRequis(authorization);
        const [param] = await this.dataSource.query(`SELECT * FROM parametre_abonnement WHERE id = 1`);
        const sections = await this.dataSource.query(`SELECT departement, prix_annuel FROM parametre_prix_section ORDER BY departement`);
        return { ...param, sections };
    }

    async modifierParametres(dto: { prix_base_annuel?: number; duree_essai_jours?: number; duree_grace_jours?: number }, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        const [avant] = await this.dataSource.query(`SELECT * FROM parametre_abonnement WHERE id = 1`);
        await this.dataSource.query(
            `UPDATE parametre_abonnement SET
                prix_base_annuel = COALESCE($1, prix_base_annuel),
                duree_essai_jours = COALESCE($2, duree_essai_jours),
                duree_grace_jours = COALESCE($3, duree_grace_jours),
                date_maj = now()
             WHERE id = 1`,
            [dto.prix_base_annuel ?? null, dto.duree_essai_jours ?? null, dto.duree_grace_jours ?? null],
        );
        // Deliberately not tied to any store - a price/duration change applies only at the NEXT
        // renewal of each store, never to a subscription already in progress (spec requirement).
        await this.enregistrerHistorique(null, 'parametres', acteur.id, avant, dto);
    }

    async modifierPrixSection(departement: Departement, prixAnnuel: number | null, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        if (!DEPARTEMENTS.includes(departement)) throw new BadRequestException(`Département inconnu : ${departement}`);
        const [avant] = await this.dataSource.query(`SELECT prix_annuel FROM parametre_prix_section WHERE departement = $1`, [departement]);
        await this.dataSource.query(
            `INSERT INTO parametre_prix_section (departement, prix_annuel) VALUES ($1, $2)
             ON CONFLICT (departement) DO UPDATE SET prix_annuel = $2, date_maj = now()`,
            [departement, prixAnnuel],
        );
        await this.enregistrerHistorique(null, 'prix_section', acteur.id, { departement, prix_annuel: avant?.prix_annuel ?? null }, { departement, prix_annuel: prixAnnuel });
    }

    // ── Per-store price, read-only ──────────────────────────────

    /** Base price + every currently-enabled priced department, minus the store's discount (if
     *  any) - "a department with no price row is bundled in the base" and "no magasin_module row
     *  means enabled" both match the existing estActif()/magasins.service.ts defaults exactly. */
    async calculerPrixAnnuel(idMagasin: number): Promise<number> {
        const [{ prix_base_annuel: prixBase }] = await this.dataSource.query(`SELECT prix_base_annuel FROM parametre_abonnement WHERE id = 1`);
        const [{ total_sections: totalSections }] = await this.dataSource.query(
            `SELECT COALESCE(SUM(CASE WHEN COALESCE(mm.actif, true) THEN pps.prix_annuel ELSE 0 END), 0)::numeric AS total_sections
               FROM parametre_prix_section pps
               LEFT JOIN magasin_module mm ON mm.departement = pps.departement AND mm.id_magasin = $1
              WHERE pps.prix_annuel IS NOT NULL`,
            [idMagasin],
        );
        const [abonnement] = await this.dataSource.query(`SELECT reduction_montant, reduction_pourcentage FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        const sousTotal = Number(prixBase) + Number(totalSections);
        let reduction = 0;
        if (abonnement?.reduction_pourcentage != null) reduction = sousTotal * (Number(abonnement.reduction_pourcentage) / 100);
        else if (abonnement?.reduction_montant != null) reduction = Number(abonnement.reduction_montant);
        return Math.max(0, Math.round((sousTotal - reduction) * 100) / 100);
    }

    // ── Super Admin's subscriptions screen ──────────────────────

    async listerAbonnements(authorization?: string): Promise<any[]> {
        await this.superAdminRequis(authorization);
        const lignes = await this.dataSource.query(
            `SELECT m.id_magasin, m.nom, m.wilaya, m.actif AS magasin_actif,
                    a.statut, a.date_fin_essai, a.date_fin_abonnement, a.reduction_montant, a.reduction_pourcentage,
                    (SELECT MAX(date_paiement) FROM abonnement_paiement WHERE id_magasin = m.id_magasin) AS derniere_date_paiement
               FROM magasin m
               LEFT JOIN abonnement a ON a.id_magasin = m.id_magasin
              ORDER BY m.nom`,
        );
        for (const l of lignes) {
            l.prix_annuel = await this.calculerPrixAnnuel(l.id_magasin);
            const dateReference = l.date_fin_abonnement ?? l.date_fin_essai;
            l.jours_restants = dateReference ? Math.ceil((new Date(dateReference).getTime() - Date.now()) / 86_400_000) : null;
        }
        return lignes;
    }

    async resumeFinancier(authorization?: string): Promise<any> {
        await this.superAdminRequis(authorization);
        const [{ nb_actifs }] = await this.dataSource.query(`SELECT COUNT(*)::int AS nb_actifs FROM abonnement WHERE statut IN ('trial', 'active', 'grace')`);
        const [{ revenus_mois: revenusMois }] = await this.dataSource.query(`SELECT COALESCE(SUM(montant), 0)::numeric AS revenus_mois FROM abonnement_paiement WHERE date_paiement >= date_trunc('month', CURRENT_DATE)`);
        const [{ revenus_annee: revenusAnnee }] = await this.dataSource.query(`SELECT COALESCE(SUM(montant), 0)::numeric AS revenus_annee FROM abonnement_paiement WHERE date_paiement >= date_trunc('year', CURRENT_DATE)`);
        const renouvellements = await this.dataSource.query(
            `SELECT id_magasin FROM abonnement WHERE COALESCE(date_fin_abonnement, date_fin_essai) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
        );
        let revenusAttendus = 0;
        for (const r of renouvellements) revenusAttendus += await this.calculerPrixAnnuel(r.id_magasin);
        return { nb_actifs, revenus_mois: revenusMois, revenus_annee: revenusAnnee, revenus_attendus_30j: Math.round(revenusAttendus * 100) / 100, nb_renouvellements_30j: renouvellements.length };
    }

    async obtenirAbonnement(idMagasin: number, authorization?: string): Promise<any> {
        await this.superAdminRequis(authorization);
        const [abonnement] = await this.dataSource.query(`SELECT * FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!abonnement) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        const paiements = await this.dataSource.query(`SELECT * FROM abonnement_paiement WHERE id_magasin = $1 ORDER BY date_paiement DESC`, [idMagasin]);
        const historique = await this.dataSource.query(`SELECT * FROM abonnement_historique WHERE id_magasin = $1 ORDER BY date_creation DESC`, [idMagasin]);
        const modules = await this.dataSource.query(
            `SELECT pps.departement, pps.prix_annuel, COALESCE(mm.actif, true) AS actif
               FROM parametre_prix_section pps
               LEFT JOIN magasin_module mm ON mm.departement = pps.departement AND mm.id_magasin = $1
              ORDER BY pps.departement`,
            [idMagasin],
        );
        return { ...abonnement, prix_annuel: await this.calculerPrixAnnuel(idMagasin), modules, paiements, historique };
    }

    // ── Payment (Phase 1: manual only - electronic payment TODO, see spec) ──

    /** Records a manual payment, extends the subscription by exactly one year from whichever is
     *  later (today, or the current anchor date - so paying early never shortens what's already
     *  owed), activates it, and sets which departments are actually paid for this year. TODO
     *  (Phase 2+): an electronic payment gateway would call this same method after confirming
     *  funds, instead of a super_admin typing it in by hand - the method signature here is already
     *  payment-method-agnostic (methode is free text) specifically so that integration doesn't
     *  need to change this logic, only add a new caller. */
    async enregistrerPaiement(
        idMagasin: number,
        dto: { montant: number; methode: string; reference?: string; date_paiement: string; note?: string; sections: Departement[] },
        authorization?: string,
    ): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        const [avant] = await this.dataSource.query(`SELECT statut, date_fin_abonnement, date_fin_essai FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!avant) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        if (!(dto.montant > 0)) throw new BadRequestException('Le montant doit être positif.');

        const ancreActuelle = avant.date_fin_abonnement ?? avant.date_fin_essai;
        const base = new Date(ancreActuelle) > new Date() ? new Date(ancreActuelle) : new Date();
        const nouvelleDate = new Date(base);
        nouvelleDate.setDate(nouvelleDate.getDate() + 365);
        const nouvelleDateStr = nouvelleDate.toISOString().slice(0, 10);

        await this.dataSource.transaction(async (m) => {
            await m.query(
                `INSERT INTO abonnement_paiement (id_magasin, montant, methode, reference, date_paiement, note, cree_par) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [idMagasin, dto.montant, dto.methode, dto.reference || null, dto.date_paiement, dto.note || null, acteur.id],
            );
            await m.query(`UPDATE abonnement SET statut = 'active', date_fin_abonnement = $2, date_maj = now() WHERE id_magasin = $1`, [idMagasin, nouvelleDateStr]);
        });

        const matrice: Partial<Record<Departement, boolean>> = {};
        for (const dep of DEPARTEMENTS) matrice[dep] = dto.sections.includes(dep);
        await this.magasinsService.setModules(idMagasin, matrice, authorization);

        await this.enregistrerHistorique(
            idMagasin, 'paiement', acteur.id,
            { statut: avant.statut, date_fin_abonnement: ancreActuelle },
            { statut: 'active', date_fin_abonnement: nouvelleDateStr, montant: dto.montant, sections: dto.sections },
            dto.note,
        );
    }

    // ── Manual overrides ─────────────────────────────────────────

    async prolongerEssai(idMagasin: number, jours: number, raison: string, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        if (!(jours > 0)) throw new BadRequestException('Le nombre de jours doit être positif.');
        const [avant] = await this.dataSource.query(`SELECT statut, date_fin_essai FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!avant) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        const base = new Date(avant.date_fin_essai) > new Date() ? new Date(avant.date_fin_essai) : new Date();
        base.setDate(base.getDate() + jours);
        const nouvelleDate = base.toISOString().slice(0, 10);
        await this.dataSource.query(`UPDATE abonnement SET statut = 'trial', date_fin_essai = $2, date_maj = now() WHERE id_magasin = $1`, [idMagasin, nouvelleDate]);
        await this.enregistrerHistorique(idMagasin, 'prolongation_essai', acteur.id, { date_fin_essai: avant.date_fin_essai }, { date_fin_essai: nouvelleDate }, raison);
    }

    async prolongerAbonnement(idMagasin: number, jours: number, raison: string, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        if (!(jours > 0)) throw new BadRequestException('Le nombre de jours doit être positif.');
        const [avant] = await this.dataSource.query(`SELECT statut, date_fin_abonnement, date_fin_essai FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!avant) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        const ancreActuelle = avant.date_fin_abonnement ?? avant.date_fin_essai;
        const base = new Date(ancreActuelle) > new Date() ? new Date(ancreActuelle) : new Date();
        base.setDate(base.getDate() + jours);
        const nouvelleDate = base.toISOString().slice(0, 10);
        await this.dataSource.query(`UPDATE abonnement SET statut = 'active', date_fin_abonnement = $2, date_maj = now() WHERE id_magasin = $1`, [idMagasin, nouvelleDate]);
        await this.enregistrerHistorique(idMagasin, 'prolongation_abonnement', acteur.id, { statut: avant.statut, date_fin_abonnement: ancreActuelle }, { statut: 'active', date_fin_abonnement: nouvelleDate }, raison);
    }

    async suspendre(idMagasin: number, raison: string, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        const [avant] = await this.dataSource.query(`SELECT statut FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!avant) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        await this.dataSource.query(`UPDATE abonnement SET statut = 'suspended', date_maj = now() WHERE id_magasin = $1`, [idMagasin]);
        await this.enregistrerHistorique(idMagasin, 'suspension_manuelle', acteur.id, avant.statut, 'suspended', raison);
    }

    /** Reactivating also grants one grace period's worth of runway from today - without that, the
     *  very next nightly check would see the same overdue anchor date and immediately flip it back
     *  to grace/suspended, undoing the reactivation within a day. Use prolongerAbonnement()
     *  afterwards for a longer runway if the store actually paid. */
    async reactiver(idMagasin: number, raison: string, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        const [avant] = await this.dataSource.query(`SELECT statut, date_fin_abonnement, date_fin_essai FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!avant) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        const [{ duree_grace_jours: dureeGrace }] = await this.dataSource.query(`SELECT duree_grace_jours FROM parametre_abonnement WHERE id = 1`);
        const nouvelleDate = new Date();
        nouvelleDate.setDate(nouvelleDate.getDate() + Number(dureeGrace));
        const nouvelleDateStr = nouvelleDate.toISOString().slice(0, 10);
        await this.dataSource.query(`UPDATE abonnement SET statut = 'active', date_fin_abonnement = $2, date_maj = now() WHERE id_magasin = $1`, [idMagasin, nouvelleDateStr]);
        await this.enregistrerHistorique(idMagasin, 'reactivation_manuelle', acteur.id, { statut: avant.statut, date_fin_abonnement: avant.date_fin_abonnement ?? avant.date_fin_essai }, { statut: 'active', date_fin_abonnement: nouvelleDateStr }, raison);
    }

    async changerReduction(idMagasin: number, dto: { montant?: number | null; pourcentage?: number | null; raison: string }, authorization?: string): Promise<void> {
        const acteur = await this.superAdminRequis(authorization);
        const [avant] = await this.dataSource.query(`SELECT reduction_montant, reduction_pourcentage, reduction_raison FROM abonnement WHERE id_magasin = $1`, [idMagasin]);
        if (!avant) throw new NotFoundException(`Aucun abonnement pour le magasin #${idMagasin}`);
        await this.dataSource.query(
            `UPDATE abonnement SET reduction_montant = $2, reduction_pourcentage = $3, reduction_raison = $4, date_maj = now() WHERE id_magasin = $1`,
            [idMagasin, dto.montant ?? null, dto.pourcentage ?? null, dto.raison || null],
        );
        await this.enregistrerHistorique(idMagasin, 'reduction', acteur.id, avant, { montant: dto.montant ?? null, pourcentage: dto.pourcentage ?? null }, dto.raison);
    }

    // ── Nightly transition job ───────────────────────────────────

    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async recalculNocturne(): Promise<void> {
        const [{ duree_grace_jours: dureeGrace }] = await this.dataSource.query(`SELECT duree_grace_jours FROM parametre_abonnement WHERE id = 1`);

        const versGrace = await this.dataSource.query(
            `SELECT id_magasin, statut FROM abonnement WHERE statut IN ('trial', 'active') AND COALESCE(date_fin_abonnement, date_fin_essai) < CURRENT_DATE`,
        );
        for (const row of versGrace) {
            await this.dataSource.query(`UPDATE abonnement SET statut = 'grace', date_maj = now() WHERE id_magasin = $1`, [row.id_magasin]);
            await this.enregistrerHistorique(row.id_magasin, 'transition_auto', null, row.statut, 'grace', 'Fin de période payée/essai sans renouvellement');
        }

        const versSuspendu = await this.dataSource.query(
            `SELECT id_magasin FROM abonnement WHERE statut = 'grace' AND COALESCE(date_fin_abonnement, date_fin_essai) + ($1 || ' days')::interval < CURRENT_DATE`,
            [dureeGrace],
        );
        for (const row of versSuspendu) {
            await this.dataSource.query(`UPDATE abonnement SET statut = 'suspended', date_maj = now() WHERE id_magasin = $1`, [row.id_magasin]);
            await this.enregistrerHistorique(row.id_magasin, 'transition_auto', null, 'grace', 'suspended', 'Fin de la période de grâce');
        }
    }
}
