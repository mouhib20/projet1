import { CompteurFenetre } from './tentatives-connexion';

describe('CompteurFenetre', () => {
    it('is not blocked before reaching the limit', () => {
        const c = new CompteurFenetre(3, 1000);
        c.enregistrerEchec('a');
        c.enregistrerEchec('a');
        expect(c.bloque('a')).toBe(false);
    });

    it('blocks once the limit is reached within the window', () => {
        const c = new CompteurFenetre(3, 1000);
        c.enregistrerEchec('a');
        c.enregistrerEchec('a');
        c.enregistrerEchec('a');
        expect(c.bloque('a')).toBe(true);
    });

    it('keeps keys independent from one another', () => {
        const c = new CompteurFenetre(1, 1000);
        c.enregistrerEchec('a');
        expect(c.bloque('a')).toBe(true);
        expect(c.bloque('b')).toBe(false);
    });

    it('resets a key on success', () => {
        const c = new CompteurFenetre(1, 1000);
        c.enregistrerEchec('a');
        expect(c.bloque('a')).toBe(true);
        c.reinitialiser('a');
        expect(c.bloque('a')).toBe(false);
    });

    it('expires the window after fenetreMs has passed', () => {
        const c = new CompteurFenetre(1, 10);
        c.enregistrerEchec('a');
        expect(c.bloque('a')).toBe(true);
        return new Promise((resolve) => {
            setTimeout(() => {
                expect(c.bloque('a')).toBe(false);
                resolve(undefined);
            }, 20);
        });
    });
});
