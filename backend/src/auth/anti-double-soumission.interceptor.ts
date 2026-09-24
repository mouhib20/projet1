import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, lastValueFrom, mergeMap, of, throwError } from 'rxjs';

type Resultat = { ok: true; valeur: any } | { ok: false; erreur: any };

/**
 * Safety net against double taps and network retries: an identical POST (same person, same address,
 * same content) that arrives while the first one is running, or within a few seconds after it
 * succeeded, is not run again — it gets the first one's answer. Tickets, sales, expenses, payments…
 * are therefore recorded once however many times the button is tapped.
 * Failed requests are forgotten at once, so a retry after an error still works.
 */
@Injectable()
export class AntiDoubleSoumissionInterceptor implements NestInterceptor {
    private static readonly MEMOIRE_MS = 5000;
    private readonly requetes = new Map<string, Promise<Resultat>>();

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        if (req.method !== 'POST') return next.handle();

        const url = String(req.originalUrl || req.url || '');
        const contenu = String(req.headers['content-type'] || '');
        // Logins have their own throttle; file uploads have no comparable body
        if (/^\/api\/auth\/login/.test(url) || contenu.includes('multipart/form-data')) return next.handle();

        const personne = req.user?.sub ?? req.headers.authorization ?? 'anonyme';
        const cle = `${personne}|${url}|${JSON.stringify(req.body ?? {})}`;

        let promesse = this.requetes.get(cle);
        if (!promesse) {
            const p: Promise<Resultat> = lastValueFrom(next.handle()).then(
                (valeur): Resultat => ({ ok: true, valeur }),
                (erreur): Resultat => ({ ok: false, erreur }),
            );
            this.requetes.set(cle, p);
            p.then((r) => setTimeout(() => this.requetes.delete(cle), r.ok ? AntiDoubleSoumissionInterceptor.MEMOIRE_MS : 0));
            promesse = p;
        }
        return from(promesse).pipe(
            mergeMap((r) => (r.ok === true ? of(r.valeur) : throwError(() => (r as { ok: false; erreur: any }).erreur))),
        );
    }
}
