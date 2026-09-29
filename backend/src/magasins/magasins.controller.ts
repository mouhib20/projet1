import { Controller, Get, Post, Put, Patch, Body, Param, ParseIntPipe, Headers, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MagasinsService, MagasinModulesMatrix } from './magasins.service';

@Controller('magasins')
export class MagasinsController {
    constructor(private readonly service: MagasinsService) { }

    @Get()
    findAll(@Headers('authorization') auth?: string) {
        return this.service.findAll(auth);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.findOne(id, auth);
    }

    @Post()
    create(@Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.create(body, auth);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Headers('authorization') auth?: string) {
        return this.service.update(id, body, auth);
    }

    @Patch(':id/statut')
    setStatut(@Param('id', ParseIntPipe) id: number, @Body() body: { actif: boolean }, @Headers('authorization') auth?: string) {
        return this.service.setStatut(id, !!body.actif, auth);
    }

    @Get(':id/modules')
    getModules(@Param('id', ParseIntPipe) id: number, @Headers('authorization') auth?: string) {
        return this.service.getModules(id, auth);
    }

    @Put(':id/modules')
    setModules(@Param('id', ParseIntPipe) id: number, @Body() body: MagasinModulesMatrix, @Headers('authorization') auth?: string) {
        return this.service.setModules(id, body, auth);
    }

    @Post(':id/logo')
    @UseInterceptors(FileInterceptor('logo', {
        storage: diskStorage({
            destination: './uploads/magasins',
            filename: (_req, file, cb) => {
                const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
                cb(null, `${unique}${extname(file.originalname)}`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
                cb(new BadRequestException('Seules les images (jpg, png, webp, gif) sont autorisées.'), false);
                return;
            }
            cb(null, true);
        },
        limits: { fileSize: 5 * 1024 * 1024 },
    }))
    async uploadLogo(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File, @Headers('authorization') auth?: string) {
        if (!file) throw new BadRequestException('Aucun fichier reçu.');
        return this.service.setLogo(id, `/uploads/magasins/${file.filename}`, auth);
    }
}
