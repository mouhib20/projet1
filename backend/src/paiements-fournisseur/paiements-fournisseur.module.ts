import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { PaiementsFournisseurService } from './paiements-fournisseur.service';
import { PaiementsFournisseurController } from './paiements-fournisseur.controller';

@Module({
    imports: [CaisseModule],
    controllers: [PaiementsFournisseurController],
    providers: [PaiementsFournisseurService],
})
export class PaiementsFournisseurModule { }
