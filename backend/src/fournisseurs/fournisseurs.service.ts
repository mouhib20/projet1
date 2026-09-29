import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fournisseur } from './fournisseur.entity';
import { StoreContextService } from '../store-context/store-context.service';

@Injectable()
export class FournisseursService {
    constructor(
        @InjectRepository(Fournisseur)
        private readonly repo: Repository<Fournisseur>,
        private readonly storeContext: StoreContextService,
    ) { }

    findAll(): Promise<Fournisseur[]> {
        return this.repo.find({ where: { id_magasin: this.storeContext.requireMagasinId() } });
    }

    async findOne(id: number): Promise<Fournisseur> {
        const fournisseur = await this.repo.findOne({
            where: { id_fournisseur: id, id_magasin: this.storeContext.requireMagasinId() }
        });
        if (!fournisseur) throw new NotFoundException(`Fournisseur #${id} not found`);
        return fournisseur;
    }

    create(dto: Partial<Fournisseur>): Promise<Fournisseur> {
        const { id_magasin: _ignore, ...safeDto } = dto as any;
        const data: Partial<Fournisseur> = { ...safeDto, id_magasin: this.storeContext.requireMagasinId() };
        const fournisseur = this.repo.create(data);
        return this.repo.save(fournisseur);
    }

    async update(id: number, dto: Partial<Fournisseur>): Promise<Fournisseur> {
        let fournisseur = await this.findOne(id);
        const { id_magasin: _ignore, ...safeDto } = dto as any;

        fournisseur = this.repo.merge(fournisseur, safeDto);
        await this.repo.save(fournisseur);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
