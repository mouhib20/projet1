import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from './public.decorator';

/** Areas only an administrator may change (the UI already restricts these pages to admins). */
const ECRITURE_ADMIN = /^\/api\/(fournisseurs|factures-achat|mouvements-achat|stocks|clients\/fusionner-doublons)(\/|$|\?)/;

/**
 * Global guard: every route needs a valid login token unless marked @Public().
 * Visitors are read-only; writes to suppliers / purchase invoices / stock are admin-only.
 * (The caisse checks the token again itself to know who is acting.)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

        const req = context.switchToHttp().getRequest();
        if (req.method === 'OPTIONS') return true;

        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (!token) throw new UnauthorizedException('Connexion requise.');
        let payload: any;
        try {
            payload = this.jwt.verify(token);
        } catch {
            throw new UnauthorizedException('Session expirée, reconnectez-vous.');
        }
        req.user = payload;

        const lecture = req.method === 'GET' || req.method === 'HEAD';
        if (!lecture) {
            if (payload.role === 'visiteur') throw new ForbiddenException('Accès en lecture seule.');
            if (ECRITURE_ADMIN.test(req.originalUrl || req.url) && payload.role !== 'admin') {
                throw new ForbiddenException('Action réservée à un administrateur.');
            }
        }
        return true;
    }
}
