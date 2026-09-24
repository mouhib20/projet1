import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, Headers } from '@nestjs/common';
import { PaiementsFournisseurService } from './paiements-fournisseur.service';

@Controller('paiements-fournisseur')
export class PaiementsFournisseurController {
    constructor(private readonly service: PaiementsFournisseurService) { }

    @Get('dus')
    dus() {
        return this.service.dus();
    }

    @Get()
    historique() {
        return this.service.historique();
    }

    @Post()
    payer(
        @Body() body: { id_fournisseur: number; montant: number; date?: string; note?: string; paye_caisse?: boolean },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.payer(body, auth);
    }

    @Delete(':id')
    annuler(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.annuler(id, auth);
    }
}
