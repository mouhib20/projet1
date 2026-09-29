import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MagasinModule } from '../magasins/magasin-module.entity';
import { Departement } from '../permissions/permission.entity';

/**
 * Reads the per-store, per-department on/off switch Super Admin controls
 * (backend/src/magasins/magasins.service.ts's getModules/setModules write it).
 */
@Injectable()
export class MagasinModulesService {
    constructor(
        @InjectRepository(MagasinModule)
        private readonly repo: Repository<MagasinModule>,
    ) { }

    /**
     * Whether a department is enabled for a store. No row for that (store, department) pair
     * means it was never toggled — treated as enabled, the same default `magasins.service.ts`
     * uses (`?? true`), so a store never loses access to a department nobody has touched yet.
     */
    async estActif(id_magasin: number, departement: Departement): Promise<boolean> {
        const ligne = await this.repo.findOne({ where: { id_magasin, departement } });
        return ligne ? ligne.actif : true;
    }
}
