import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
    providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    controllers: [AuthController],
})
export class AuthModule { }
