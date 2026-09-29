import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';
import { MagasinModulesService } from '../magasin-modules/magasin-modules.service';
import { DEPARTEMENTS } from '../permissions/permission.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private permissionsService: PermissionsService,
        private magasinModulesService: MagasinModulesService,
        private dataSource: DataSource,
    ) { }

    async login(username: string, password: string) {
        if (!username || !password) throw new BadRequestException("Nom d'utilisateur et mot de passe requis");
        const user = await this.usersService.findByUsername(username);
        if (!user) throw new UnauthorizedException('Utilisateur introuvable');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) throw new UnauthorizedException('Mot de passe incorrect');
        if (!user.actif) throw new ForbiddenException('Compte suspendu.');

        if (user.id_magasin != null) {
            const [magasin] = await this.dataSource.query(`SELECT actif FROM magasin WHERE id_magasin = $1`, [user.id_magasin]);
            if (!magasin || !magasin.actif) throw new ForbiddenException('Ce magasin est suspendu.');
        }

        const payload = { sub: user.id, username: user.username, role: user.role, id_magasin: user.id_magasin };

        // Which departments are enabled for this account's store (Super Admin's switch); all true
        // for super_admin, who has no store of its own and isn't subject to any store's switches.
        const modules: Record<string, boolean> = {};
        for (const dep of DEPARTEMENTS) {
            modules[dep] = user.id_magasin == null ? true : await this.magasinModulesService.estActif(user.id_magasin, dep);
        }

        return {
            access_token: this.jwtService.sign(payload),
            role: user.role,
            username: user.username,
            nom: user.nom,
            id_magasin: user.id_magasin,
            permissions: await this.permissionsService.getMatrix(user.id),
            modules,
        };
    }
}
