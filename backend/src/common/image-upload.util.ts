import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';

/** Multer options for a single-image upload into ./uploads/<subfolder> - same jpg/png/webp/gif
 *  check and 5MB limit already used by ArticlesController/MagasinsController's own uploads. */
export function imageUploadOptions(subfolder: string) {
    return {
        storage: diskStorage({
            destination: `./uploads/${subfolder}`,
            filename: (_req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
                const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
                cb(null, `${unique}${extname(file.originalname)}`);
            },
        }),
        fileFilter: (_req: any, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
            if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
                cb(new BadRequestException('Seules les images (jpg, png, webp, gif) sont autorisées.'), false);
                return;
            }
            cb(null, true);
        },
        limits: { fileSize: 5 * 1024 * 1024 },
    };
}
