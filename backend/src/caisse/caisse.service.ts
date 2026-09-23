import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CaisseCloture } from './caisse.entity';
import { Vente } from '../ventes/vente.entity';

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}

function yesterdayStr(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

@Injectable()
export class CaisseService {
    private readonly logger = new Logger(CaisseService.name);

    constructor(
        @InjectRepository(CaisseCloture)
        private readonly repo: Repository<CaisseCloture>,
        @InjectRepository(Vente)
        private readonly venteRepo: Repository<Vente>,
    ) { }

    // Runs every day at 00:00:00 and closes the day that just ended, if it
    // wasn't already closed manually. This is what makes closing "automatic".
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async autoCloseEndOfDay(): Promise<void> {
        const d = yesterdayStr();
        try {
            const alreadyClosed = await this.isDateClosed(d);
            if (alreadyClosed) return;
            await this.cloturer(d);
            this.logger.log(`Caisse du ${d} fermée automatiquement (fin de journée).`);
        } catch (err) {
            this.logger.error(`Échec de la fermeture automatique de la caisse du ${d}`, err as Error);
        }
    }

    findAll(): Promise<CaisseCloture[]> {
        return this.repo.find({ order: { date: 'DESC' } });
    }

    async isDateClosed(date: string): Promise<boolean> {
        const existing = await this.repo.findOne({ where: { date } });
        return !!existing;
    }

    async getTotalVentesForDate(date: string): Promise<number> {
        const result = await this.venteRepo
            .createQueryBuilder('v')
            .select('COALESCE(SUM(v.qte * v.prix), 0)', 'total')
            .where('v.date = :date', { date })
            .getRawOne();
        return Number(result?.total) || 0;
    }

    async getStatus(date?: string) {
        const d = date || todayStr();
        const cloture = await this.repo.findOne({ where: { date: d } });
        const totalVentesDuJour = await this.getTotalVentesForDate(d);
        return {
            date: d,
            isClosed: !!cloture,
            cloture: cloture || null,
            totalVentesDuJour,
        };
    }

    async cloturer(date?: string): Promise<CaisseCloture> {
        const d = date || todayStr();
        const existing = await this.repo.findOne({ where: { date: d } });
        if (existing) {
            throw new BadRequestException(`La caisse du ${d} est déjà fermée.`);
        }
        const total_ventes = await this.getTotalVentesForDate(d);
        const cloture = this.repo.create({ date: d, total_ventes });
        return this.repo.save(cloture);
    }

    async saisirComptage(id: number, montant_compte: number): Promise<CaisseCloture> {
        const cloture = await this.repo.findOne({ where: { id_cloture: id } });
        if (!cloture) throw new NotFoundException(`Clôture #${id} introuvable`);
        cloture.montant_compte = montant_compte;
        cloture.date_comptage = todayStr();
        return this.repo.save(cloture);
    }
}
