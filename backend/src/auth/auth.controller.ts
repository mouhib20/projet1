import { Controller, Post, Body, HttpCode, HttpException, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CompteurFenetre } from './tentatives-connexion';

const FENETRE_MS = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
    // Three independent limits, so neither rotating IPs nor username-spraying from one IP
    // can bypass throttling:
    //  - parIpEtUsername: repeated guesses on one account from one IP (tight, the normal case)
    //  - parUsername: the same account attacked from many different IPs (distributed brute-force)
    //  - parIp: many different usernames tried from one IP (credential stuffing / enumeration)
    private readonly parIpEtUsername = new CompteurFenetre(10, FENETRE_MS);
    private readonly parUsername = new CompteurFenetre(20, FENETRE_MS);
    private readonly parIp = new CompteurFenetre(30, FENETRE_MS);

    constructor(private authService: AuthService) { }

    @Public()
    @Post('login')
    @HttpCode(200)
    async login(@Body() body: { username: string; password: string }, @Req() req: any) {
        const ip = req.ip;
        const username = String(body?.username || '').toLowerCase();
        const cleCombinee = `${ip}|${username}`;

        if (this.parIpEtUsername.bloque(cleCombinee) || this.parUsername.bloque(username) || this.parIp.bloque(ip)) {
            throw new HttpException('Trop de tentatives. Réessayez dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
        }

        try {
            const res = await this.authService.login(body?.username, body?.password);
            this.parIpEtUsername.reinitialiser(cleCombinee);
            return res;
        } catch (err) {
            if (err instanceof UnauthorizedException) {
                this.parIpEtUsername.enregistrerEchec(cleCombinee);
                this.parUsername.enregistrerEchec(username);
                this.parIp.enregistrerEchec(ip);
            }
            throw err;
        }
    }
}
