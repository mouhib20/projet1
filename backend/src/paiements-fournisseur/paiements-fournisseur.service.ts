import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CaisseService } from '../caisse/caisse.service';

/**
 * Payments made to suppliers. The amount owed to a supplier is fournisseur.solde (it grows with
 * purchase invoices); each payment lowers it. Raw SQL keeps the Fournisseurs module untouched.
 */
@Injectable()
export class PaiementsFournisseurService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
    ) { }

    /** Every supplier with what is still owed to them and what was paid so far. */
    dus(): Promise<any[]> {
        return this.dataSource.query(
            `SELECT f.id_fournisseur, f.nom, f.prenom, f.entreprise, f.type_articles, f.solde,
                    COALESCE((SELECT SUM(p.montant) FROM paiement_fournisseur p WHERE p.id_fournisseur = f.id_fournisseur), 0) AS total_paye
             FROM fournisseur f
             ORDER BY f.solde DESC, f.id_fournisseur`,
        );
    }

    historique(): Promise<any[]> {
        return this.dataSource.query(
            `SELECT p.id, p.id_fournisseur, p.montant, p.date::text AS date, p.note, p.paye_caisse, p.par_nom, p.cree_le,
                    f.nom, f.prenom, f.entreprise, f.type_articles
             FROM paiement_fournisseur p
             JOIN fournisseur f ON f.id_fournisseur = p.id_fournisseur
             ORDER BY p.id DESC
             LIMIT 200`,
        );
    }

    private nomFournisseur(f: any): string {
        return f.entreprise || `${f.nom} ${f.prenom || ''}`.trim();
    }

    async payer(
        data: { id_fournisseur: number; montant: number; date?: string; note?: string; paye_caisse?: boolean },
        authorization?: string,
    ) {
        const montant = Number(data.montant);
        if (!data.id_fournisseur) throw new BadRequestException('Choisissez le fournisseur.');
        if (!isFinite(montant) || montant <= 0) throw new BadRequestException('Le montant doit être supérieur à 0.');
        if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new BadRequestException('Date invalide (AAAA-MM-JJ).');
        const acteur = await this.caisseService.acteurOuSysteme(authorization);
        const payeCaisse = data.paye_caisse === true;
        const note = (data.note || '').trim().slice(0, 255) || null;

        const result = await this.dataSource.transaction(async (m) => {
            // Lock the supplier row so two payments cannot both pass the "amount owed" check
            const [f] = await m.query(
                `SELECT id_fournisseur, nom, prenom, entreprise, solde FROM fournisseur WHERE id_fournisseur = $1 FOR UPDATE`,
                [data.id_fournisseur],
            );
            if (!f) throw new NotFoundException(`Fournisseur #${data.id_fournisseur} introuvable`);
            const du = Number(f.solde) || 0;
            if (montant > du + 0.0005) {
                throw new BadRequestException(`Le montant (${montant}) dépasse ce qui est dû à ${this.nomFournisseur(f)} (${du}).`);
            }
            const rows = await m.query(
                `INSERT INTO paiement_fournisseur (id_fournisseur, montant, date, note, paye_caisse, par_nom)
                 VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6) RETURNING id, montant, date::text AS date, note, paye_caisse`,
                [f.id_fournisseur, montant, data.date || null, note, payeCaisse, acteur.nom],
            );
            await m.query(`UPDATE fournisseur SET solde = solde - $1 WHERE id_fournisseur = $2`, [montant, f.id_fournisseur]);
            return { paiement: rows[0], fournisseur: this.nomFournisseur(f), reste_du: Math.round((du - montant) * 1000) / 1000 };
        });

        if (payeCaisse) {
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'sortie',
                source: 'paiement_fournisseur',
                montant,
                motif: `Paiement fournisseur : ${result.fournisseur}`,
                reference: 'paiement-fournisseur:' + result.paiement.id,
            });
        }
        return result;
    }

    /** Cancels a payment entered by mistake: the amount is owed again, and cash goes back to the caisse. */
    async annuler(id: number, authorization?: string): Promise<void> {
        const acteur = await this.caisseService.acteurOuSysteme(authorization);
        const p = await this.dataSource.transaction(async (m) => {
            const [row] = await m.query(
                `SELECT p.id, p.id_fournisseur, p.montant, p.paye_caisse, f.nom, f.prenom, f.entreprise
                 FROM paiement_fournisseur p JOIN fournisseur f ON f.id_fournisseur = p.id_fournisseur WHERE p.id = $1 FOR UPDATE OF p`,
                [id],
            );
            if (!row) throw new NotFoundException(`Paiement #${id} introuvable`);
            await m.query(`DELETE FROM paiement_fournisseur WHERE id = $1`, [id]);
            await m.query(`UPDATE fournisseur SET solde = solde + $1 WHERE id_fournisseur = $2`, [row.montant, row.id_fournisseur]);
            return row;
        });
        if (p.paye_caisse) {
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'entree',
                source: 'paiement_fournisseur',
                montant: Number(p.montant),
                motif: `Paiement fournisseur annulé : ${this.nomFournisseur(p)}`,
                reference: 'paiement-fournisseur:' + id,
            });
        }
    }
}
