import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async login(username: string, password: string) {
        const user = await this.usersService.findByUsername(username);
        if (!user) throw new UnauthorizedException('Utilisateur introuvable');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) throw new UnauthorizedException('Mot de passe incorrect');

        const payload = { sub: user.id, username: user.username, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
            role: user.role,
            username: user.username,
            nom: user.nom,
        };
    }
}
