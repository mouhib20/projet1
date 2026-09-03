import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MouvementAchat } from './mouvement-achat.entity';

@Injectable()
export class MouvementsAchatService {
    constructor(
        @InjectRepository(MouvementAchat)
        private readonly repo: Repository<MouvementAchat>,
    ) { }

    findAll(): Promise<MouvementAchat[]> {
        return this.repo.find({ relations: ['article', 'fournisseur', 'stock'] });
    }

    async findOne(id: number): Promise<MouvementAchat> {
        const mouvement = await this.repo.findOne({
            where: { id_mouvement: id },
            relations: ['article', 'fournisseur', 'stock']
        });
        if (!mouvement) throw new NotFoundException(`MouvementAchat #${id} not found`);
        return mouvement;
    }

    create(dto: Partial<MouvementAchat>): Promise<MouvementAchat> {
        const mouvement = this.repo.create(dto);
        return this.repo.save(mouvement);
    }

    async update(id: number, dto: Partial<MouvementAchat>): Promise<MouvementAchat> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
