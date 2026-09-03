import {
    Controller, Get, Post, Put, Delete,
    Param, Body, ParseIntPipe, HttpCode, HttpStatus
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { Article } from './article.entity';

@Controller('articles')
export class ArticlesController {
    constructor(private readonly articlesService: ArticlesService) { }

    @Get()
    findAll(): Promise<Article[]> {
        return this.articlesService.findAll();
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

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.articlesService.remove(id);
    }
}
