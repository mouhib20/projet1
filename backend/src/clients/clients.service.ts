import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './client.entity';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(Client)
        private readonly repo: Repository<Client>,
    ) { }

    findAll(): Promise<Client[]> {
        return this.repo.find({ order: { id_client: 'DESC' } });
    }

    async findOne(id: number): Promise<Client> {
        const client = await this.repo.findOne({
            where: { id_client: id },
            relations: ['ventes', 'reparations'],
        });
        if (!client) throw new NotFoundException(`Client #${id} introuvable`);
        return client;
    }

    create(dto: Partial<Client>): Promise<Client> {
        const client = this.repo.create(dto);
        return this.repo.save(client);
    }

    async update(id: number, dto: Partial<Client>): Promise<Client> {
        await this.findOne(id);
        await this.repo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.repo.delete(id);
    }
}
