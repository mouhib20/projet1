import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CaisseService } from './caisse.service';
import { CaisseController } from './caisse.controller';
import { JWT_SECRET } from '../auth/jwt.constants';

@Module({
    imports: [JwtModule.register({ secret: JWT_SECRET })],
    controllers: [CaisseController],
    providers: [CaisseService],
    exports: [CaisseService],
})
export class CaisseModule { }
