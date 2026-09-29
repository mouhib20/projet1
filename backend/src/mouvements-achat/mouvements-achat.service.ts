import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MouvementAchat } from './mouvement-achat.entity';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class MouvementsAchatService {
    constructor(
        @InjectRepository(MouvementAchat)
        private readonly repo: Repository<MouvementAchat>,
        private readonly storeContext: StoreContextService,
    ) { }

    findAll(): Promise<MouvementAchat[]> {
        return this.repo.find({ where: { id_magasin: this.storeContext.requireMagasinId() }, relations: ['article', 'fournisseur', 'stock'] });
    }

    async findOne(id: number): Promise<MouvementAchat> {
        const mouvement = await this.repo.findOne({
            where: { id_mouvement: id, id_magasin: this.storeContext.requireMagasinId() },
            relations: ['article', 'fournisseur', 'stock']
        });
        if (!mouvement) throw new NotFoundException(`MouvementAchat #${id} not found`);
        return mouvement;
    }

    create(dto: Partial<MouvementAchat>): Promise<MouvementAchat> {
        const { id_magasin: _ignore, ...safeDto } = dto as any;
        const data: Partial<MouvementAchat> = { ...safeDto, id_magasin: this.storeContext.requireMagasinId() };
        const mouvement = this.repo.create(data);
        return this.repo.save(mouvement);
    }

    async update(id: number, dto: Partial<MouvementAchat>): Promise<MouvementAchat> {
        await this.findOne(id);
        const { id_magasin: _ignore, ...safeDto } = dto as any;
        await this.repo.update(id, safeDto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
