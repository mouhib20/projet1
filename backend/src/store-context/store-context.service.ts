import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

const CLE_MAGASIN = 'id_magasin';
const CLE_ROLE = 'role';

/**
 * The current request's store, read once by JwtAuthGuard (right after it verifies the token)
 * and made available anywhere via DI — so every store-scoped service asks this instead of
 * re-deriving id_magasin from the request/JWT independently.
 */
@Injectable()
export class StoreContextService {
    constructor(private readonly cls: ClsService) { }

    /** Called once per request, by JwtAuthGuard. */
    definir(id_magasin: number | null, role: string): void {
        this.cls.set(CLE_MAGASIN, id_magasin);
        this.cls.set(CLE_ROLE, role);
    }

    getMagasinId(): number | null {
        return this.cls.get(CLE_MAGASIN) ?? null;
    }

    isSuperAdmin(): boolean {
        return this.cls.get(CLE_ROLE) === 'super_admin';
    }

    /** For store-scoped services: the current store id, or throws (super_admin has none — those
     * services are never meant to be called from a super_admin request in the first place). */
    requireMagasinId(): number {
        const id = this.getMagasinId();
        if (id == null) throw new ForbiddenException('Aucun magasin associé à ce compte.');
        return id;
    }
}
