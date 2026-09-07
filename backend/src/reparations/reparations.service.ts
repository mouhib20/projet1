import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Reparation } from './reparation.entity';
import { ReparationItem } from './reparation-item.entity';
import { CreateReparationDto } from './dtos/create-reparation.dto';
import { Client } from '../clients/client.entity';
import { Article } from '../articles/article.entity';

@Injectable()
export class ReparationsService {
    constructor(
        @InjectRepository(Reparation)
        private readonly reparationRepo: Repository<Reparation>,
        private readonly dataSource: DataSource,
    ) { }

    findAll(): Promise<Reparation[]> {
        return this.reparationRepo.find({
            relations: ['client', 'items', 'items.article'],
            order: { date_reception: 'DESC', id_reparation: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Reparation> {
        const reparation = await this.reparationRepo.findOne({
            where: { id_reparation: id },
            relations: ['client', 'items', 'items.article'],
        });
        if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);
        return reparation;
    }

    async create(data: CreateReparationDto): Promise<Reparation> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const client = await queryRunner.manager.findOne(Client, {
                where: { id_client: data.id_client }
            });
            if (!client) throw new NotFoundException(`Client #${data.id_client} introuvable`);

            let prixTotalItems = 0;
            const repItems: ReparationItem[] = [];

            if (data.items && data.items.length > 0) {
                for (const itemDto of data.items) {
                    const article = await queryRunner.manager.findOne(Article, {
                        where: { id_article: itemDto.id_article }
                    });
                    if (!article) throw new NotFoundException(`Article #${itemDto.id_article} introuvable`);

                    if (article.quantite < itemDto.qte) {
                        throw new BadRequestException(`Stock insuffisant pour "${article.designation}". Disponible: ${article.quantite}, demandé: ${itemDto.qte}`);
                    }

                    // Decrement stock
                    article.quantite -= itemDto.qte;
                    await queryRunner.manager.save(article);

                    const prixUnitaire = itemDto.prix ?? article.prix_vente ?? 0;
                    prixTotalItems += prixUnitaire * itemDto.qte;

                    const repItem = queryRunner.manager.create(ReparationItem, {
                        article: { id_article: article.id_article },
                        qte: itemDto.qte,
                        prix: prixUnitaire
                    });
                    repItems.push(repItem);
                }
            }

            const coutMainOeuvre = data.cout_main_oeuvre ?? 0;
            const prixFinalResultat = data.prix ?? (prixTotalItems + coutMainOeuvre);

            const reparation = queryRunner.manager.create(Reparation, {
                client: { id_client: data.id_client },
                appareil: data.appareil,
                description: data.description,
                cout_main_oeuvre: coutMainOeuvre,
                prix: prixFinalResultat,
                statut: data.statut ?? 'En attente',
                date_reception: data.date_reception ?? new Date(),
                items: repItems
            });

            const savedReparation = await queryRunner.manager.save(reparation);

            /* Note: items are saved in cascade since cascade is set on the relation */

            await queryRunner.commitTransaction();
            return this.findOne(savedReparation.id_reparation);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async updateStatus(id: number, statut: string): Promise<Reparation> {
        const rep = await this.findOne(id);
        rep.statut = statut;
        await this.reparationRepo.save(rep);
        return rep;
    }

    async remove(id: number): Promise<void> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const reparation = await queryRunner.manager.findOne(Reparation, {
                where: { id_reparation: id },
                relations: ['items', 'items.article'],
            });
            if (!reparation) throw new NotFoundException(`Reparation #${id} introuvable`);

            // Restore stock
            if (reparation.items && reparation.items.length > 0) {
                for (const item of reparation.items) {
                    if (item.article) {
                        const article = await queryRunner.manager.findOne(Article, {
                            where: { id_article: item.article.id_article }
                        });
                        if (article) {
                            article.quantite += item.qte;
                            await queryRunner.manager.save(article);
                        }
                    }
                }
            }

            await queryRunner.manager.delete(Reparation, id);
            await queryRunner.commitTransaction();
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }
}
