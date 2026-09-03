import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from './stock.entity';

@Injectable()
export class StocksService {
    constructor(
        @InjectRepository(Stock)
        private readonly repo: Repository<Stock>,
    ) { }

    findAll(): Promise<Stock[]> {
        return this.repo.find({ relations: ['mouvement'] });
    }

    async findOne(id: number): Promise<Stock> {
        const stock = await this.repo.findOne({
            where: { id_stock: id },
            relations: ['mouvement']
        });
        if (!stock) throw new NotFoundException(`Stock #${id} not found`);
        return stock;
    }

    create(dto: Partial<Stock>): Promise<Stock> {
        const stock = this.repo.create(dto);
        return this.repo.save(stock);
    }

    async update(id: number, dto: Partial<Stock>): Promise<Stock> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
