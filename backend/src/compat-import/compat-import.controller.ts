import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Headers, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'fs';
import { CompatImportService, BrandsModelsSelections, CompatibilitiesSelections } from './compat-import.service';
import { importUploadOptions } from './import-upload.util';

// Real-world exports from the extractor app run into the hundreds of MB (thousands of device
// photos) - the limit exists to reject garbage/attack uploads, not to constrain a legitimate export.
const ZIP_MAX_BYTES = 1024 * 1024 * 1024;
const COMPAT_FILE_MAX_BYTES = 50 * 1024 * 1024;

@Controller('compat-import')
export class CompatImportController {
    constructor(private readonly service: CompatImportService) { }

    // ── compatibility_employee account management: super_admin only ──

    @Post('employees')
    creerEmploye(@Body() body: { nom: string; username: string; password: string }, @Headers('authorization') auth?: string) {
        return this.service.creerEmploye(body, auth);
    }

    @Get('employees')
    listerEmployes(@Headers('authorization') auth?: string) {
        return this.service.listerEmployes(auth);
    }

    @Patch('employees/:id/statut')
    suspendreEmploye(
        @Param('id', ParseIntPipe) id: number,
        @Body('actif') actif: boolean,
        @Headers('authorization') auth?: string,
    ) {
        return this.service.suspendreEmploye(id, !!actif, auth);
    }

    // ── Tab 1: brands & models ──

    @Post('brands-models/preview')
    @UseInterceptors(FileInterceptor('file', importUploadOptions(['.zip'], ZIP_MAX_BYTES)))
    async previewBrandsModels(@UploadedFile() file: Express.Multer.File, @Headers('authorization') auth?: string) {
        if (!file) throw new BadRequestException('Aucun fichier reçu.');
        try {
            return await this.service.previsualiserMarquesModeles(file.path, file.filename, auth);
        } catch (e) {
            await fs.unlink(file.path).catch(() => undefined);
            throw e;
        }
    }

    @Post('brands-models/confirm')
    confirmBrandsModels(
        @Body() body: { importId: string; nomFichier: string; selections?: BrandsModelsSelections },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.confirmerMarquesModeles(body.importId, body.selections, body.nomFichier, auth);
    }

    // ── Tab 2: compatibilities ──

    @Post('compatibilities/preview')
    @UseInterceptors(FileInterceptor('file', importUploadOptions(['.json', '.zip'], COMPAT_FILE_MAX_BYTES)))
    async previewCompatibilities(@UploadedFile() file: Express.Multer.File, @Headers('authorization') auth?: string) {
        if (!file) throw new BadRequestException('Aucun fichier reçu.');
        try {
            return await this.service.previsualiserCompatibilites(file.path, file.filename, auth);
        } catch (e) {
            await fs.unlink(file.path).catch(() => undefined);
            throw e;
        }
    }

    @Post('compatibilities/confirm')
    confirmCompatibilities(
        @Body() body: { importId: string; nomFichier: string; partTypes?: string[]; selections?: CompatibilitiesSelections },
        @Headers('authorization') auth?: string,
    ) {
        return this.service.confirmerCompatibilites(body.importId, body.selections, body.partTypes, body.nomFichier, auth);
    }
}
