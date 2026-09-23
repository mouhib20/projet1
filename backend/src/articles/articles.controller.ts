import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus,
    UseInterceptors, UploadedFile, BadRequestException
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ArticlesService } from './articles.service';
import { Article } from './article.entity';

@Controller('articles')
export class ArticlesController {
    constructor(private readonly articlesService: ArticlesService) { }

    @Post('upload-image')
    @UseInterceptors(FileInterceptor('image', {
        storage: diskStorage({
            destination: './uploads/articles',
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
    uploadImage(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Aucun fichier reçu.');
        return { url: `/uploads/articles/${file.filename}` };
    }

    @Get()
    findAll(): Promise<Article[]> {
        return this.articlesService.findAll();
    }

    @Get('retours-fournisseur')
    findRetoursFournisseur() {
        return this.articlesService.findRetoursFournisseur();
    }

    @Get('sav')
    findSav() {
        return this.articlesService.findSav();
    }

    @Post('sav')
    creerSav(@Body() body: { id_article: number; id_client?: number; qte?: number; probleme: string; degre_dommage?: string }) {
        return this.articlesService.creerSav(body);
    }

    @Post('sav/:id/remplacer')
    remplacerSav(
        @Param('id', ParseIntPipe) id: number,
        @Body('id_article_remplacement') idArticleRemplacement: number,
    ) {
        return this.articlesService.remplacerSav(id, idArticleRemplacement);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number): Promise<Article> {
        return this.articlesService.findOne(id);
    }

    @Post()
    create(@Body() body: Partial<Article>): Promise<Article> {
        return this.articlesService.create(body);
    }

    @Put(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: Partial<Article>,
    ): Promise<Article> {
        return this.articlesService.update(id, body);
    }

    @Post(':id/fournisseur')
    linkFournisseur(
        @Param('id', ParseIntPipe) id: number,
        @Body('fournisseurId') fournisseurId: number,
    ): Promise<void> {
        return this.articlesService.linkFournisseur(id, fournisseurId);
    }

    @Post(':id/retour-fournisseur')
    renvoyerAuFournisseur(
        @Param('id', ParseIntPipe) id: number,
        @Body() body: { probleme: string; qte?: number },
    ) {
        return this.articlesService.renvoyerAuFournisseur(id, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.articlesService.remove(id);
    }
}
