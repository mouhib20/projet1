import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AntiDoubleSoumissionInterceptor } from './anti-double-soumission.interceptor';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { StoreContextModule } from '../store-context/store-context.module';
import { StoreOwnershipGuard } from '../store-context/store-ownership.guard';
import { JWT_SECRET } from './jwt.constants';

@Module({
    imports: [
        UsersModule,
        PermissionsModule,
        StoreContextModule,
        JwtModule.register({
            secret: JWT_SECRET,
            signOptions: { expiresIn: '8h' },
        }),
    ],
    providers: [
        AuthService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_GUARD, useClass: StoreOwnershipGuard },
        { provide: APP_INTERCEPTOR, useClass: AntiDoubleSoumissionInterceptor },
    ],
    controllers: [AuthController],
})
export class AuthModule { }
