import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from './product.entity';

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(ProductEntity)
        private readonly repo: Repository<ProductEntity>,
    ) { }

    findAll(): Promise<ProductEntity[]> {
        return this.repo.find({ order: { id: 'DESC' } });
    }

    async findOne(id: number): Promise<ProductEntity> {
        const product = await this.repo.findOneBy({ id });
        if (!product) throw new NotFoundException(`Product #${id} not found`);
        return product;
    }

    create(dto: Partial<ProductEntity>): Promise<ProductEntity> {
        const product = this.repo.create(dto);
        return this.repo.save(product);
    }

    async update(id: number, dto: Partial<ProductEntity>): Promise<ProductEntity> {
        await this.findOne(id); // throws 404 if missing
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
