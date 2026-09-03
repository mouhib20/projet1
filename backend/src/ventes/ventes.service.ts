import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Vente } from './vente.entity';
import { Article } from '../articles/article.entity';

@Injectable()
export class VentesService {
    constructor(
        @InjectRepository(Vente)
        private readonly venteRepo: Repository<Vente>,
        private readonly dataSource: DataSource,
    ) { }

    findAll(): Promise<Vente[]> {
        return this.venteRepo.find({
            relations: ['client', 'article'],
            order: { id_vente: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Vente> {
        const vente = await this.venteRepo.findOne({
            where: { id_vente: id },
            relations: ['client', 'article'],
        });
        if (!vente) throw new NotFoundException(`Vente #${id} introuvable`);
        return vente;
    }

    async create(data: any): Promise<Vente> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Load the article and check stock
            const article = await queryRunner.manager.findOne(Article, {
                where: { id_article: data.articleId },
            });
            if (!article) throw new NotFoundException(`Article ${data.articleId} introuvable`);

            const qte = data.qte || 1;
            if (article.quantite < qte) {
                throw new BadRequestException(
                    `Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${qte}`
                );
            }

            // 2. Decrement stock
            article.quantite -= qte;
            await queryRunner.manager.save(article);

            // 3. Create the Vente record
            const vente = queryRunner.manager.create(Vente, {
                designation: data.designation || article.designation,
                qte: qte,
                prix: data.prix ?? article.prix_vente ?? 0,
                date: data.date || new Date().toISOString().split('T')[0],
                client: data.clientId ? { id_client: data.clientId } : null,
                article: { id_article: article.id_article },
            });

            const savedVente = await queryRunner.manager.save(vente);

            await queryRunner.commitTransaction();
            return this.findOne(savedVente.id_vente);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async remove(id: number): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const vente = await queryRunner.manager.findOne(Vente, {
                where: { id_vente: id },
                relations: ['article'],
            });
            if (!vente) throw new NotFoundException(`Vente #${id} introuvable`);

            // Restore stock
            if (vente.article) {
                const article = await queryRunner.manager.findOne(Article, {
                    where: { id_article: vente.article.id_article },
                });
                if (article) {
                    article.quantite += vente.qte || 1;
                    await queryRunner.manager.save(article);
                }
            }

            await queryRunner.manager.delete(Vente, id);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }
}
