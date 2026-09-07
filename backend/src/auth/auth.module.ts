import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [
        UsersModule,
        JwtModule.register({
            secret: 'gsmpro_jwt_secret_2024',
            signOptions: { expiresIn: '8h' },
        }),
    ],
    providers: [AuthService],
    controllers: [AuthController],
})
export class AuthModule { }
