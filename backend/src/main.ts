import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { initialiserBase } from './bootstrap-db';

async function bootstrap() {
    mkdirSync(join(process.cwd(), 'uploads', 'articles'), { recursive: true });
    mkdirSync(join(process.cwd(), 'uploads', 'magasins'), { recursive: true });
    mkdirSync(join(process.cwd(), 'uploads', 'compat-models'), { recursive: true });
    mkdirSync(join(process.cwd(), 'uploads', 'wholesale'), { recursive: true });
    mkdirSync(join(process.cwd(), 'uploads', 'compat-import-tmp'), { recursive: true });

    // Empty database on first start: create the tables and the login accounts (AUTO_INIT_DB=true)
    await initialiserBase();

    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Behind a hosting proxy (Render, Railway…) the real client IP is in X-Forwarded-For
    app.set('trust proxy', 1);

    // Baseline security headers (clickjacking, MIME-sniffing, etc.). CSP and the cross-origin
    // resource/embedder policies are left off: the frontend is deployed on a separate origin
    // from the API and fetches uploaded article images from /uploads across that origin, so a
    // default-strict CSP or COEP/CORP would need per-app tuning to avoid breaking that — a
    // follow-up, not something to guess at here.
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    // CORS_ORIGIN: comma-separated list of allowed front-end addresses. Without it, any origin is
    // accepted in development, and none in production (front and API then share one address).
    const origines = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    app.enableCors({
        origin: origines.length > 0 ? origines : process.env.NODE_ENV === 'production' ? false : true,
        // Lets the frontend's offline-sync code read the negative-stock warning set on a replayed
        // checkout (see VentesController.checkout) - not exposed by default cross-origin.
        exposedHeaders: ['X-Vente-Avertissements'],
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
