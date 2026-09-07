import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from './stock.entity';
import { Article } from '../articles/article.entity';

@Injectable()
export class StocksService {
    constructor(
        @InjectRepository(Stock)
        private readonly repo: Repository<Stock>,
        @InjectRepository(Article)
        private readonly articleRepo: Repository<Article>,
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

    /** Increase article stock quantity */
    async increaseStock(articleId: number, quantity: number): Promise<void> {
        const article = await this.articleRepo.findOne({ where: { id_article: articleId } });
        if (!article) throw new NotFoundException(`Article #${articleId} not found`);
        article.quantite += quantity;
        await this.articleRepo.save(article);
    }

    /** Decrease article stock quantity, ensuring sufficient stock */
    async decreaseStock(articleId: number, quantity: number): Promise<void> {
        const article = await this.articleRepo.findOne({ where: { id_article: articleId } });
        if (!article) throw new NotFoundException(`Article #${articleId} not found`);
        if (article.quantite < quantity) {
            throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${quantity}`);
        }
        article.quantite -= quantity;
        await this.articleRepo.save(article);
    }
}
