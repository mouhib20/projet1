import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Magasin } from './magasin.entity';
import { MagasinModule as MagasinModuleEntity } from './magasin-module.entity';
import { Utilisateur } from '../users/user.entity';
import { CaisseService } from '../caisse/caisse.service';
import { Departement, DEPARTEMENTS } from '../permissions/permission.entity';

export type MagasinModulesMatrix = Partial<Record<Departement, boolean>>;

@Injectable()
export class MagasinsService {
    constructor(
        @InjectRepository(Magasin)
        private readonly repo: Repository<Magasin>,
        @InjectRepository(MagasinModuleEntity)
        private readonly moduleRepo: Repository<MagasinModuleEntity>,
        @InjectRepository(Utilisateur)
        private readonly usersRepo: Repository<Utilisateur>,
        private readonly dataSource: DataSource,
        private readonly caisseService: CaisseService,
    ) { }

    /** Only Super Admin manages stores; throws otherwise. */
    private async superAdminRequis(authorization?: string): Promise<void> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'super_admin') throw new ForbiddenException('Action réservée à un super administrateur.');
    }

    async findAll(authorization?: string): Promise<Magasin[]> {
        await this.superAdminRequis(authorization);
        return this.repo.find({ order: { id_magasin: 'DESC' } });
    }

    async findOne(id: number, authorization?: string): Promise<Magasin> {
        await this.superAdminRequis(authorization);
        const magasin = await this.repo.findOne({ where: { id_magasin: id } });
        if (!magasin) throw new NotFoundException(`Magasin #${id} introuvable`);
        return magasin;
    }

    /** Creates a store and its owner account together, in one transaction. */
    async create(dto: {
        nom?: string; adresse?: string; telephone?: string;
        ownerNom?: string; ownerTelephone?: string; ownerUsername?: string; ownerPassword?: string;
    }, authorization?: string): Promise<Magasin> {
        await this.superAdminRequis(authorization);

        const nom = String(dto.nom ?? '').trim();
        const ownerNom = String(dto.ownerNom ?? '').trim();
        const ownerUsername = String(dto.ownerUsername ?? '').trim();
        const ownerPassword = String(dto.ownerPassword ?? '');
        if (!nom) throw new BadRequestException('Le nom du magasin est obligatoire.');
        if (!ownerNom) throw new BadRequestException('Le nom du propriétaire est obligatoire.');
        if (!ownerUsername) throw new BadRequestException("Le nom d'utilisateur du propriétaire est obligatoire.");
        if (ownerPassword.length < 6) throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères.');

        const existant = await this.usersRepo.findOne({ where: { username: ownerUsername } });
        if (existant) throw new BadRequestException(`Le nom d'utilisateur "${ownerUsername}" est déjà utilisé.`);

        return this.dataSource.transaction(async (m) => {
            const magasin = await m.save(m.create(Magasin, {
                nom,
                adresse: dto.adresse?.trim() || null,
                telephone: dto.telephone?.trim() || null,
            }));
            await m.save(m.create(Utilisateur, {
                nom: ownerNom,
                telephone: dto.ownerTelephone?.trim() || null,
                username: ownerUsername,
                password: await bcrypt.hash(ownerPassword, 10),
                role: 'admin',
                actif: true,
                id_magasin: magasin.id_magasin,
            }));
            for (const dep of DEPARTEMENTS) {
                await m.save(m.create(MagasinModuleEntity, { id_magasin: magasin.id_magasin, departement: dep, actif: true }));
            }
            return magasin;
        });
    }

    async update(id: number, dto: { nom?: string; adresse?: string; telephone?: string }, authorization?: string): Promise<Magasin> {
        await this.findOne(id, authorization);
        if (dto.nom !== undefined && !String(dto.nom).trim()) throw new BadRequestException('Le nom du magasin est obligatoire.');
        await this.repo.update(id, {
            ...(dto.nom !== undefined ? { nom: dto.nom.trim() } : {}),
            ...(dto.adresse !== undefined ? { adresse: dto.adresse.trim() || null } : {}),
            ...(dto.telephone !== undefined ? { telephone: dto.telephone.trim() || null } : {}),
        });
        return this.findOne(id, authorization);
    }

    async setStatut(id: number, actif: boolean, authorization?: string): Promise<Magasin> {
        await this.findOne(id, authorization);
        await this.repo.update(id, { actif: !!actif });
        return this.findOne(id, authorization);
    }

    async setLogo(id: number, url: string, authorization?: string): Promise<Magasin> {
        await this.findOne(id, authorization);
        await this.repo.update(id, { logo: url });
        return this.findOne(id, authorization);
    }

    async getModules(id: number, authorization?: string): Promise<MagasinModulesMatrix> {
        await this.findOne(id, authorization);
        const lignes = await this.moduleRepo.find({ where: { id_magasin: id } });
        const matrix = {} as MagasinModulesMatrix;
        for (const dep of DEPARTEMENTS) matrix[dep] = lignes.find((l) => l.departement === dep)?.actif ?? true;
        return matrix;
    }

    async setModules(id: number, matrix: MagasinModulesMatrix, authorization?: string): Promise<MagasinModulesMatrix> {
        await this.findOne(id, authorization);
        for (const dep of DEPARTEMENTS) {
            if (!(dep in matrix)) continue;
            const existante = await this.moduleRepo.findOne({ where: { id_magasin: id, departement: dep } });
            const actif = !!matrix[dep];
            if (existante) await this.moduleRepo.update(existante.id, { actif });
            else await this.moduleRepo.save(this.moduleRepo.create({ id_magasin: id, departement: dep, actif }));
        }
        return this.getModules(id, authorization);
    }
}
