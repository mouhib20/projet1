import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Charge } from './charge.entity';

@Injectable()
export class ChargesService {
    constructor(
        @InjectRepository(Charge)
        private readonly repo: Repository<Charge>,
    ) { }

    findAll(): Promise<Charge[]> {
        return this.repo.find({ order: { date_charge: 'DESC', id_charge: 'DESC' } });
    }

    async findOne(id: number): Promise<Charge> {
        const charge = await this.repo.findOneBy({ id_charge: id });
        if (!charge) throw new NotFoundException(`Charge #${id} introuvable`);
        return charge;
    }

    create(dto: Partial<Charge>): Promise<Charge> {
        const charge = this.repo.create(dto);
        return this.repo.save(charge);
    }

    async update(id: number, dto: Partial<Charge>): Promise<Charge> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
