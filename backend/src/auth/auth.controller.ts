import { Controller, Post, Body, HttpCode, HttpException, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

const MAX_TENTATIVES = 10;
const FENETRE_MS = 15 * 60 * 1000;

@Controller('auth')
export class AuthController {
    // Failed logins per (IP, username): after 10 within 15 minutes the account is paused for the rest of the window
    private readonly echecs = new Map<string, { n: number; debut: number }>();

    constructor(private authService: AuthService) { }

    @Public()
    @Post('login')
    @HttpCode(200)
    async login(@Body() body: { username: string; password: string }, @Req() req: any) {
        const cle = `${req.ip}|${String(body?.username || '').toLowerCase()}`;
        const now = Date.now();
        const e = this.echecs.get(cle);
        if (e && now - e.debut > FENETRE_MS) this.echecs.delete(cle);
        const actuel = this.echecs.get(cle);
        if (actuel && actuel.n >= MAX_TENTATIVES) {
            throw new HttpException('Trop de tentatives. Réessayez dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
        }
        try {
            const res = await this.authService.login(body?.username, body?.password);
            this.echecs.delete(cle);
            return res;
        } catch (err) {
            if (err instanceof UnauthorizedException) {
                const cur = this.echecs.get(cle) ?? { n: 0, debut: now };
                cur.n += 1;
                this.echecs.set(cle, cur);
            }
            throw err;
        }
    }
}
