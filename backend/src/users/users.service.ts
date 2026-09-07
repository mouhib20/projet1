import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Utilisateur } from './user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(Utilisateur)
        private usersRepository: Repository<Utilisateur>,
    ) { }

    async findByUsername(username: string): Promise<Utilisateur | null> {
        return this.usersRepository.findOne({ where: { username } });
    }
}
