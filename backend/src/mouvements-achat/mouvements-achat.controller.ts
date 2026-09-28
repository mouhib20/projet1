import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { MouvementsAchatService } from './mouvements-achat.service';
import { MouvementAchat } from './mouvement-achat.entity';
import { RequirePermission } from '../permissions/require-permission.decorator';

@Controller('mouvements-achat')
export class MouvementsAchatController {
    constructor(private readonly mouvementsService: MouvementsAchatService) { }

    @Get()
    @RequirePermission('fournisseurs', 'voir')
    findAll(): Promise<MouvementAchat[]> {
        return this.mouvementsService.findAll();
    }

    @Get(':id')
    @RequirePermission('fournisseurs', 'voir')
    findOne(@Param('id', ParseIntPipe) id: number): Promise<MouvementAchat> {
        return this.mouvementsService.findOne(id);
    }

    @Post()
    @RequirePermission('fournisseurs', 'ajouter')
    create(@Body() body: Partial<MouvementAchat>): Promise<MouvementAchat> {
        return this.mouvementsService.create(body);
    }

    @Put(':id')
    @RequirePermission('fournisseurs', 'modifier')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<MouvementAchat>,
    ): Promise<MouvementAchat> {
        return this.mouvementsService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @RequirePermission('fournisseurs', 'supprimer')
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.mouvementsService.remove(id);
    }
}
