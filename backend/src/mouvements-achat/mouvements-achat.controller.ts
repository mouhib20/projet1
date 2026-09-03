import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { MouvementsAchatService } from './mouvements-achat.service';
import { MouvementAchat } from './mouvement-achat.entity';

@Controller('mouvements-achat')
export class MouvementsAchatController {
    constructor(private readonly mouvementsService: MouvementsAchatService) { }

    @Get()
    findAll(): Promise<MouvementAchat[]> {
        return this.mouvementsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number): Promise<MouvementAchat> {
        return this.mouvementsService.findOne(id);
    }

    @Post()
    create(@Body() body: Partial<MouvementAchat>): Promise<MouvementAchat> {
        return this.mouvementsService.create(body);
    }

    @Put(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<MouvementAchat>,
    ): Promise<MouvementAchat> {
        return this.mouvementsService.update(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.mouvementsService.remove(id);
    }
}
