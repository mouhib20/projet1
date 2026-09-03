import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './article.entity';

@Injectable()
export class ArticlesService {
    constructor(
        @InjectRepository(Article)
        private readonly repo: Repository<Article>,
    ) { }

    findAll(): Promise<Article[]> {
        return this.repo.find({ order: { id_article: 'DESC' } });
    }

    async findOne(id: number): Promise<Article> {
        const article = await this.repo.findOneBy({ id_article: id });
        if (!article) throw new NotFoundException(`Article #${id} introuvable`);
        return article;
    }

    create(dto: Partial<Article>): Promise<Article> {
        const article = this.repo.create(dto);
        return this.repo.save(article);
    }

    async update(id: number, dto: Partial<Article>): Promise<Article> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
