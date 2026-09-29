import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { PaiementsFournisseurService } from './paiements-fournisseur.service';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { ScopedByStore } from '../store-context/scoped-by-store.decorator';

@Controller('paiements-fournisseur')
export class PaiementsFournisseurController {
    constructor(private readonly service: PaiementsFournisseurService) { }

    @Get('dus')
    @RequirePermission('charges', 'voir')
    dus() {
        return this.service.dus();
    }

    @Get()
    @RequirePermission('charges', 'voir')
    historique() {
        return this.service.historique();
    }

    @Post()
    @RequirePermission('charges', 'ajouter')
    payer(
        @Body() body: { id_fournisseur: number; montant: number; date?: string; note?: string; paye_caisse?: boolean },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.payer(body, auth);
    }

    @Delete(':id')
    @RequirePermission('charges', 'supprimer')
    @ScopedByStore('paiement_fournisseur', 'id')
    annuler(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.annuler(id, auth);
    }
}
