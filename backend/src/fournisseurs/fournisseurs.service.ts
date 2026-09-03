import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fournisseur } from './fournisseur.entity';

@Injectable()
export class FournisseursService {
    constructor(
        @InjectRepository(Fournisseur)
        private readonly repo: Repository<Fournisseur>,
    ) { }

    findAll(): Promise<Fournisseur[]> {
        return this.repo.find();
    }

    async findOne(id: number): Promise<Fournisseur> {
        const fournisseur = await this.repo.findOne({
            where: { id_fournisseur: id }
        });
        if (!fournisseur) throw new NotFoundException(`Fournisseur #${id} not found`);
        return fournisseur;
    }

    create(dto: Partial<Fournisseur>): Promise<Fournisseur> {
        const fournisseur = this.repo.create(dto);
        return this.repo.save(fournisseur);
    }

    async update(id: number, dto: Partial<Fournisseur>): Promise<Fournisseur> {
        let fournisseur = await this.findOne(id);

        fournisseur = this.repo.merge(fournisseur, dto);
        await this.repo.save(fournisseur);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
