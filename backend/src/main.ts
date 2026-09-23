import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';

async function bootstrap() {
    mkdirSync(join(process.cwd(), 'uploads', 'articles'), { recursive: true });

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.enableCors(); // Enable CORS for Angular frontend
    app.setGlobalPrefix('api');  // All routes become /api/...
    app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
    await app.listen(process.env.PORT ?? 3000);
    console.log(`Application is running on: http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
