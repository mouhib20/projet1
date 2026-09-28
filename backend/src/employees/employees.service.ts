import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Utilisateur } from '../users/user.entity';
import { CaisseService } from '../caisse/caisse.service';
import { PermissionsService, PermissionMatrix, PermissionEntry } from '../permissions/permissions.service';
import { Departement } from '../permissions/permission.entity';

@Injectable()
export class EmployeesService {
    constructor(
        @InjectRepository(Utilisateur)
        private readonly repo: Repository<Utilisateur>,
        private readonly caisseService: CaisseService,
        private readonly permissionsService: PermissionsService,
    ) { }

    /** Only the shop's owner (admin) may manage employees; throws otherwise. */
    private async proprietaireRequis(authorization?: string): Promise<{ id: number; nom: string; role: string }> {
        const acteur = await this.caisseService.acteurRequis(authorization);
        if (acteur.role !== 'admin') throw new ForbiddenException('Action réservée à un administrateur.');
        return acteur as { id: number; nom: string; role: string };
    }

    /** The employee, provided it belongs to this owner; never leaks another owner's staff. */
    private async employeDe(id: number, ownerId: number): Promise<Utilisateur> {
        const employe = await this.repo.findOne({ where: { id } });
        if (!employe || employe.id_proprietaire !== ownerId) throw new NotFoundException(`Employé #${id} introuvable`);
        return employe;
    }

    async findAll(authorization?: string): Promise<Omit<Utilisateur, 'password'>[]> {
        const owner = await this.proprietaireRequis(authorization);
        const employes = await this.repo.find({ where: { id_proprietaire: owner.id }, order: { id: 'DESC' } });
        return employes.map(({ password, ...reste }) => reste);
    }

    async create(dto: { nom?: string; telephone?: string; username?: string; password?: string; role?: string }, authorization?: string): Promise<Omit<Utilisateur, 'password'>> {
        const owner = await this.proprietaireRequis(authorization);

        const nom = String(dto.nom ?? '').trim();
        const username = String(dto.username ?? '').trim();
        const password = String(dto.password ?? '');
        if (!nom) throw new BadRequestException("Le nom de l'employé est obligatoire.");
        if (!username) throw new BadRequestException("Le nom d'utilisateur est obligatoire.");
        if (password.length < 6) throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères.');

        const existant = await this.repo.findOne({ where: { username } });
        if (existant) throw new BadRequestException(`Le nom d'utilisateur "${username}" est déjà utilisé.`);

        const employe = await this.repo.save(this.repo.create({
            nom,
            telephone: dto.telephone?.trim() || null,
            username,
            password: await bcrypt.hash(password, 10),
            role: (dto.role as any) || 'vendeur',
            actif: true,
            id_proprietaire: owner.id,
        }));
        const { password: _pw, ...reste } = employe;
        return reste;
    }

    async update(id: number, dto: { nom?: string; telephone?: string; role?: string; password?: string }, authorization?: string): Promise<Omit<Utilisateur, 'password'>> {
        const owner = await this.proprietaireRequis(authorization);
        await this.employeDe(id, owner.id);
        if (dto.nom !== undefined && !String(dto.nom).trim()) throw new BadRequestException("Le nom de l'employé est obligatoire.");
        if (dto.password !== undefined && dto.password.length > 0 && dto.password.length < 6) {
            throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères.');
        }

        await this.repo.update(id, {
            ...(dto.nom !== undefined ? { nom: dto.nom.trim() } : {}),
            ...(dto.telephone !== undefined ? { telephone: dto.telephone.trim() || null } : {}),
            ...(dto.role !== undefined ? { role: dto.role as any } : {}),
            ...(dto.password ? { password: await bcrypt.hash(dto.password, 10) } : {}),
        });
        const { password, ...reste } = await this.employeDe(id, owner.id);
        return reste;
    }

    async setStatut(id: number, actif: boolean, authorization?: string): Promise<Omit<Utilisateur, 'password'>> {
        const owner = await this.proprietaireRequis(authorization);
        await this.employeDe(id, owner.id);
        await this.repo.update(id, { actif: !!actif });
        const { password, ...reste } = await this.employeDe(id, owner.id);
        return reste;
    }

    async getPermissions(id: number, authorization?: string): Promise<PermissionMatrix> {
        const owner = await this.proprietaireRequis(authorization);
        await this.employeDe(id, owner.id);
        return this.permissionsService.getMatrix(id);
    }

    async setPermissions(id: number, matrix: Partial<Record<Departement, Partial<PermissionEntry>>>, authorization?: string): Promise<PermissionMatrix> {
        const owner = await this.proprietaireRequis(authorization);
        await this.employeDe(id, owner.id);
        return this.permissionsService.setMatrix(id, matrix);
    }
}
