import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Charge } from './charge.entity';
import { CaisseService } from '../caisse/caisse.service';

@Injectable()
export class ChargesService {
    constructor(
        @InjectRepository(Charge)
        private readonly repo: Repository<Charge>,
        private readonly caisseService: CaisseService,
    ) { }

    findAll(): Promise<Charge[]> {
        return this.repo.find({ order: { date_charge: 'DESC', id_charge: 'DESC' } });
    }

    async findOne(id: number): Promise<Charge> {
        const charge = await this.repo.findOneBy({ id_charge: id });
        if (!charge) throw new NotFoundException(`Charge #${id} introuvable`);
        return charge;
    }

    /**
     * Amount taken out of the drawer by an expense. Only daily expenses come out of the caisse:
     * monthly ones (rent, salaries…) are never paid from the daily cash.
     */
    private montantCaisse(c: Pick<Charge, 'montant' | 'paye_caisse' | 'type_depense'>): number {
        return c.paye_caisse && c.type_depense === 'journaliere' ? Number(c.montant) || 0 : 0;
    }

    private verifierType(dto: Partial<Charge>): void {
        if (dto.type_depense !== undefined && dto.type_depense !== 'mensuelle' && dto.type_depense !== 'journaliere') {
            throw new BadRequestException("Le type de dépense doit être 'journaliere' ou 'mensuelle'.");
        }
    }

    async create(dto: Partial<Charge>, authorization?: string): Promise<Charge> {
        this.verifierType(dto);
        if ((dto.type_depense ?? 'mensuelle') === 'mensuelle') dto.paye_caisse = false;
        const charge = await this.repo.save(this.repo.create(dto));
        const montant = this.montantCaisse(charge);
        if (montant > 0) {
            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'sortie',
                source: 'charge',
                montant,
                motif: `Dépense : ${charge.description}`,
                reference: 'charge:' + charge.id_charge,
            });
        }
        return charge;
    }

    async update(id: number, dto: Partial<Charge>, authorization?: string): Promise<Charge> {
        this.verifierType(dto);
        const avant = await this.findOne(id);
        if ((dto.type_depense ?? avant.type_depense) === 'mensuelle') dto.paye_caisse = false;
        await this.repo.update(id, dto);
        const apres = await this.findOne(id);

        // Only the difference moves in the drawer: a raise is a new payment, a cut is money returned
        const delta = this.montantCaisse(apres) - this.montantCaisse(avant);
        if (delta !== 0) {
            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: delta > 0 ? 'sortie' : 'entree',
                source: 'charge',
                montant: Math.abs(delta),
                motif: `${delta > 0 ? 'Dépense' : 'Correction dépense'} : ${apres.description}`,
                reference: 'charge:' + id,
            });
        }
        return apres;
    }

    async remove(id: number, authorization?: string): Promise<void> {
        const charge = await this.findOne(id);
        await this.repo.delete(id);
        const montant = this.montantCaisse(charge);
        if (montant > 0) {
            const acteur = await this.caisseService.acteurOuSysteme(authorization);
            await this.caisseService.enregistrerAuto(acteur, {
                type: 'entree',
                source: 'charge',
                montant,
                motif: `Dépense annulée : ${charge.description}`,
                reference: 'charge:' + id,
            });
        }
    }
}
