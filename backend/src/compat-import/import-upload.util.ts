import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';

/** Multer options for the bulk-import tabs' own temp uploads (a ZIP or a JSON file, kept on disk
 *  between the preview and confirm calls) - a sibling to image-upload.util.ts's imageUploadOptions,
 *  but for a different file shape and a different (temporary) destination folder. The random
 *  filename IS the importId confirm() is handed back - see compat-import.service.ts. */
export function importUploadOptions(allowedExtensions: string[], maxSizeBytes: number) {
    return {
        storage: diskStorage({
            destination: './uploads/compat-import-tmp',
            filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
                cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
            },
        }),
        fileFilter: (_req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
            const ext = extname(file.originalname).toLowerCase();
            if (!allowedExtensions.includes(ext)) {
                cb(new BadRequestException(`Extension de fichier non autorisée : ${ext || '(aucune)'}. Attendu : ${allowedExtensions.join(', ')}.`), false);
                return;
            }
            cb(null, true);
        },
        limits: { fileSize: maxSizeBytes },
    };
}

/** The only acceptable shape for an importId once it comes back from the client on confirm() -
 *  guards against path traversal (e.g. `../../etc/passwd`) since it's used directly to build a
 *  file path. Must match exactly what filename() above generates. */
export const IMPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(zip|json)$/i;
