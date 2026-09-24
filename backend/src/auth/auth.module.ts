import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AntiDoubleSoumissionInterceptor } from './anti-double-soumission.interceptor';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JWT_SECRET } from './jwt.constants';

@Module({
    imports: [
        UsersModule,
        JwtModule.register({
            secret: JWT_SECRET,
            signOptions: { expiresIn: '8h' },
        }),
    ],
    providers: [
        AuthService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_INTERCEPTOR, useClass: AntiDoubleSoumissionInterceptor },
    ],
    controllers: [AuthController],
})
export class AuthModule { }
