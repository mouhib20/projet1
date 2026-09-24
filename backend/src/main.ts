import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
    mkdirSync(join(process.cwd(), 'uploads', 'articles'), { recursive: true });

    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Behind a hosting proxy (Render, Railway…) the real client IP is in X-Forwarded-For
    app.set('trust proxy', 1);

    // CORS_ORIGIN: comma-separated list of allowed front-end addresses. Without it, any origin is
    // accepted in development, and none in production (front and API then share one address).
    const origines = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    app.enableCors({
        origin: origines.length > 0 ? origines : process.env.NODE_ENV === 'production' ? false : true,
    });

    app.setGlobalPrefix('api');  // All routes become /api/...
    app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on port ${port}`);
}
bootstrap();
