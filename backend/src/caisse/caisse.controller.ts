import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, Headers } from '@nestjs/common';
import { CaisseService } from './caisse.service';

@Controller('caisse')
export class CaisseController {
    constructor(private readonly service: CaisseService) { }

    @Get('status')
    async status(@Headers('authorization') auth?: string) {
        return this.service.getStatus(await this.service.acteurRequis(auth));
    }

    @Post('ouvrir')
    async ouvrir(@Headers('authorization') auth: string | undefined, @Body() body: { fond_compte: number }) {
        return this.service.ouvrir(await this.service.acteurRequis(auth), body?.fond_compte);
    }

    @Post('fermer')
    async fermer(
        @Headers('authorization') auth: string | undefined,
        @Body() body: { montant_compte: number; fond_laisse: number; note?: string },
    ) {
        return this.service.fermer(await this.service.acteurRequis(auth), body);
    }

    @Post('mouvements')
    async mouvement(
        @Headers('authorization') auth: string | undefined,
        @Body() body: { type: 'entree' | 'sortie'; montant: number; motif: string },
    ) {
        return this.service.mouvementManuel(await this.service.acteurRequis(auth), body);
    }

    @Get('historique')
    async historique(@Headers('authorization') auth?: string) {
        return this.service.historique(await this.service.acteurRequis(auth));
    }

    @Get('rapport')
    async rapport(
        @Headers('authorization') auth: string | undefined,
        @Query('date') date: string,
        @Query('tz') tz?: string,
    ) {
        return this.service.rapport(await this.service.acteurRequis(auth), date, tz);
    }

    @Get('sessions/:id')
    async session(@Headers('authorization') auth: string | undefined, @Param('id', ParseIntPipe) id: number) {
        return this.service.mouvementsDeSession(await this.service.acteurRequis(auth), id);
    }
}
