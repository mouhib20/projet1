import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { initialiserBase } from './bootstrap-db';

async function bootstrap() {
    mkdirSync(join(process.cwd(), 'uploads', 'articles'), { recursive: true });

    // Empty database on first start: create the tables and the login accounts (AUTO_INIT_DB=true)
    await initialiserBase();

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

    // SERVE_FRONTEND=true: this server also serves the compiled Angular site (one address for everything)
    if (process.env.SERVE_FRONTEND === 'true') {
        const site = process.env.FRONTEND_DIR || join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser');
        if (existsSync(join(site, 'index.html'))) {
            app.useStaticAssets(site);
            // Any address that is not the API or an upload gives the site back (Angular handles the route)
            app.getHttpAdapter().getInstance().get(/^\/(?!api(\/|$)|uploads\/).*/, (_req: any, res: any) => {
                res.sendFile(join(site, 'index.html'));
            });
            console.log(`Site servi depuis ${site}`);
        } else {
            console.warn(`SERVE_FRONTEND=true mais le site est introuvable dans ${site}`);
        }
    }

    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on port ${port}`);
}
bootstrap();
