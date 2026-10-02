import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import * as AdmZip from 'adm-zip';
import { CompatImportService } from './compat-import.service';
import { Utilisateur } from '../users/user.entity';
import { CaisseService } from '../caisse/caisse.service';
import { CompatibilityService } from '../compatibility/compatibility.service';

function buildZip(files: { path: string; content: string | Buffer }[]): AdmZip {
    const zip = new (AdmZip as any)();
    for (const f of files) {
        zip.addFile(f.path, Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8'));
    }
    return zip;
}

describe('CompatImportService', () => {
    let service: CompatImportService;
    let dataSource: { query: jest.Mock; transaction: jest.Mock };
    let caisseService: { acteurRequis: jest.Mock };
    let compatibilityService: {
        creerMarqueInterne: jest.Mock;
        creerModeleInterne: jest.Mock;
        creerTypePieceInterne: jest.Mock;
        creerGroupeInterne: jest.Mock;
    };
    let usersRepo: any;

    beforeEach(async () => {
        dataSource = { query: jest.fn().mockResolvedValue([]), transaction: jest.fn() };
        caisseService = { acteurRequis: jest.fn() };
        compatibilityService = {
            creerMarqueInterne: jest.fn().mockResolvedValue({ id: 1 }),
            creerModeleInterne: jest.fn().mockResolvedValue({ id: 10 }),
            creerTypePieceInterne: jest.fn().mockResolvedValue({ id: 20 }),
            creerGroupeInterne: jest.fn().mockResolvedValue({ id: 30 }),
        };
        usersRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((v) => v), update: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CompatImportService,
                { provide: getRepositoryToken(Utilisateur), useValue: usersRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: CaisseService, useValue: caisseService },
                { provide: CompatibilityService, useValue: compatibilityService },
            ],
        }).compile();

        service = module.get<CompatImportService>(CompatImportService);
    });

    describe('importEmployeeRequis — compatibility_employee or compat_editor, NOT super_admin or any store role', () => {
        it.each(['super_admin', 'admin', 'vendeur'])('rejects role "%s" with a 403', async (role) => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role });
            await expect(service.previsualiserMarquesModeles('/tmp/x.zip', 'x.zip', 'Bearer x')).rejects.toThrow(ForbiddenException);
        });

        it.each(['compatibility_employee', 'compat_editor'])('allows role "%s"', async (role) => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'Employe', role });
            const zip = buildZip([{ path: 'all_models.csv', content: 'marque,modele\n' }]);
            // writeFile-free path: previsualiserMarquesModeles takes a filePath, so we feed AdmZip a
            // real temp buffer written to disk.
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tmp = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random()}.zip`);
            fs.writeFileSync(tmp, zip.toBuffer());
            try {
                await expect(service.previsualiserMarquesModeles(tmp, 'x.zip', 'Bearer x')).resolves.toBeDefined();
            } finally {
                fs.unlinkSync(tmp);
            }
        });
    });

    describe('employee account management — super_admin only (mirrors creerEditeur/listerEditeurs)', () => {
        it('rejects a compatibility_employee account creating another one', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'X', role: 'compatibility_employee' });
            await expect(service.creerEmploye({ nom: 'A', username: 'a', password: '123456' }, 'Bearer x')).rejects.toThrow(ForbiddenException);
        });

        it('super_admin can create one', async () => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'SA', role: 'super_admin' });
            usersRepo.findOne.mockResolvedValue(null);
            usersRepo.save.mockResolvedValue({ id: 5, nom: 'A', username: 'a', password: 'hash', role: 'compatibility_employee', actif: true, id_magasin: null });
            const res = await service.creerEmploye({ nom: 'A', username: 'a', password: '123456' }, 'Bearer x');
            expect(res).toEqual(expect.objectContaining({ id: 5, role: 'compatibility_employee' }));
            expect((res as any).password).toBeUndefined();
        });
    });

    function tmpZipFile(zip: AdmZip): string {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const file = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random()}.zip`);
        fs.writeFileSync(file, zip.toBuffer());
        return file;
    }

    /** confirm() resolves importId against the service's own fixed temp dir (uploads/compat-import-
     *  tmp) and validates it as a uuid - unlike preview(), which just takes any file path, so these
     *  tests write there directly with a conforming name instead of using tmpZipFile(). */
    function writeToImportTmpDir(zip: AdmZip, ext: '.zip' | '.json'): string {
        const fs = require('fs');
        const { randomUUID } = require('crypto');
        const path = require('path');
        const tmpDir = path.join(process.cwd(), 'uploads', 'compat-import-tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        const importId = `${randomUUID()}${ext}`;
        fs.writeFileSync(path.join(tmpDir, importId), zip.toBuffer());
        return importId;
    }

    describe('previsualiserMarquesModeles() — per-brand-folder ZIP structure', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'Employe', role: 'compatibility_employee' });
        });

        it('reports a brand-new model as "new" when neither the brand nor the model exist yet', async () => {
            dataSource.query.mockResolvedValue([]); // brand lookup -> not found (and anything else)
            const zip = buildZip([
                { path: 'SAMSUNG/models.csv', content: 'modele,rmz\nGalaxy A12,SM-A125F\n' },
            ]);
            const file = tmpZipFile(zip);
            try {
                const preview = await service.previsualiserMarquesModeles(file, 'export.zip', 'Bearer x');
                expect(preview.marques).toEqual([{ marque: 'SAMSUNG', nouveaux: 1, existants: 0, sansImage: 1, erreurs: 0 }]);
                expect(preview.modeles[0]).toEqual(expect.objectContaining({ marque: 'SAMSUNG', modele: 'Galaxy A12', statut: 'new', aUneImage: false }));
            } finally { require('fs').unlinkSync(file); }
        });

        it('reports an existing model as "existing"', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM brand')) return Promise.resolve([{ id: 7 }]);
                if (sql.includes('FROM device_model')) return Promise.resolve([{ id: 99, image: null }]);
                return Promise.resolve([]);
            });
            const zip = buildZip([{ path: 'SAMSUNG/models.csv', content: 'modele\nGalaxy A12\n' }]);
            const file = tmpZipFile(zip);
            try {
                const preview = await service.previsualiserMarquesModeles(file, 'export.zip', 'Bearer x');
                expect(preview.marques[0]).toEqual(expect.objectContaining({ nouveaux: 0, existants: 1 }));
            } finally { require('fs').unlinkSync(file); }
        });

        it('a global all_models.csv is read as one file covering every brand via its own marque column', async () => {
            dataSource.query.mockResolvedValue([]);
            const zip = buildZip([{ path: 'all_models.csv', content: 'marque,modele\nSAMSUNG,Galaxy A12\nOPPO,A5\n' }]);
            const file = tmpZipFile(zip);
            try {
                const preview = await service.previsualiserMarquesModeles(file, 'export.zip', 'Bearer x');
                expect(preview.marques.map(m => m.marque).sort()).toEqual(['OPPO', 'SAMSUNG']);
            } finally { require('fs').unlinkSync(file); }
        });

        it('finds each brand by its own models.csv location, not by assuming it is the first path segment (real exports wrap every brand in one extra top-level folder)', async () => {
            dataSource.query.mockResolvedValue([]);
            const zip = buildZip([
                { path: 'export/SAMSUNG/models.csv', content: 'الماركة,الموديل,الرمز,اسم ملف الصورة\nSAMSUNG,Galaxy A12,SM-A125F,a12.png\n' },
                { path: 'export/SAMSUNG/a12.png', content: Buffer.from([0xff, 0xd8, 0xff]) },
                { path: 'export/OPPO/models.csv', content: 'الماركة,الموديل,الرمز,اسم ملف الصورة\nOPPO,A5,CPH1920,\n' },
            ]);
            const file = tmpZipFile(zip);
            try {
                const preview = await service.previsualiserMarquesModeles(file, 'export.zip', 'Bearer x');
                expect(preview.marques.map(m => m.marque).sort()).toEqual(['OPPO', 'SAMSUNG']);
                expect(preview.erreursFichier).toEqual([]);
                const samsungModel = preview.modeles.find(m => m.marque === 'SAMSUNG');
                expect(samsungModel).toEqual(expect.objectContaining({ modele: 'Galaxy A12', code: 'SM-A125F', aUneImage: true }));
            } finally { require('fs').unlinkSync(file); }
        });

        it('matches the real extractor app\'s Arabic column headers, including "الرمز" for the code', async () => {
            dataSource.query.mockResolvedValue([]);
            const zip = buildZip([{
                path: 'SAMSUNG/models.csv',
                content: '﻿الماركة,الموديل,الرمز,النص الأصلي,اسم ملف الصورة\nSAMSUNG,Galaxy A02S,SM-A025F/DS,Galaxy  A02S (SM-A025F/DS ),Galaxy  A02S (SM-A025F-DS ).png\n',
            }]);
            const file = tmpZipFile(zip);
            try {
                const preview = await service.previsualiserMarquesModeles(file, 'export.zip', 'Bearer x');
                expect(preview.erreursFichier).toEqual([]);
                expect(preview.modeles[0]).toEqual(expect.objectContaining({ marque: 'SAMSUNG', modele: 'Galaxy A02S', code: 'SM-A025F/DS' }));
            } finally { require('fs').unlinkSync(file); }
        });
    });

    describe('confirmerMarquesModeles() — image-overwrite rule and idempotency', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'Employe', role: 'compatibility_employee' });
            dataSource.transaction.mockImplementation(async (cb: any) => cb({ query: dataSource.query }));
        });

        it('never passes `image` to creerModeleInterne when the existing model already has one', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM brand')) return Promise.resolve([{ id: 7 }]);
                if (sql.includes('FROM device_model')) return Promise.resolve([{ id: 99, image: '/uploads/compat-models/already.webp' }]);
                return Promise.resolve([]);
            });
            compatibilityService.creerMarqueInterne.mockResolvedValue({ id: 7 });
            const zip = buildZip([
                { path: 'SAMSUNG/models.csv', content: 'modele,image\nGalaxy A12,a12.png\n' },
                { path: 'SAMSUNG/a12.png', content: Buffer.from([0xff, 0xd8, 0xff]) }, // not a real image, but creerModeleInterne is mocked so sharp is never reached for the MODEL photo in this existing-model branch
            ]);
            const importId = writeToImportTmpDir(zip, '.zip');
            const tmpDir = require('path').join(process.cwd(), 'uploads', 'compat-import-tmp');
            try {
                try {
                    await service.confirmerMarquesModeles(importId, undefined, 'export.zip', 'Bearer x');
                } catch {
                    // the fake PNG bytes would fail sharp() IF enregistrerImage were reached - catching
                    // here only matters if the no-overwrite rule failed and tried to resize it anyway.
                }
                const call = compatibilityService.creerModeleInterne.mock.calls[0][0];
                expect(call.image).toBeUndefined();
            } finally {
                require('fs').rmSync(require('path').join(tmpDir, importId), { force: true });
            }
        });

        it('actually resizes and saves a real image via sharp for a brand-new model (regression: a broken sharp import silently failed every call before, caught only by checking the real output)', async () => {
            dataSource.query.mockResolvedValue([]); // brand and model both "not found" - a fresh model
            compatibilityService.creerMarqueInterne.mockResolvedValue({ id: 7 });
            compatibilityService.creerModeleInterne.mockResolvedValue({ id: 50 });
            const sharp = require('sharp');
            const realPng = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
            const zip = buildZip([
                { path: 'SAMSUNG/models.csv', content: 'modele,image\nGalaxy A12,a12.png\n' },
                { path: 'SAMSUNG/a12.png', content: realPng },
            ]);
            const importId = writeToImportTmpDir(zip, '.zip');
            const fs = require('fs');
            const path = require('path');
            const tmpImportDir = path.join(process.cwd(), 'uploads', 'compat-import-tmp');
            const modelsDir = path.join(process.cwd(), 'uploads', 'compat-models');
            let savedImageUrl: string | undefined;
            try {
                await service.confirmerMarquesModeles(importId, undefined, 'export.zip', 'Bearer x');
                const call = compatibilityService.creerModeleInterne.mock.calls[0][0];
                savedImageUrl = call.image;
                expect(savedImageUrl).toMatch(/^\/uploads\/compat-models\/.+\.webp$/);
                const savedPath = path.join(modelsDir, path.basename(savedImageUrl!));
                expect(fs.existsSync(savedPath)).toBe(true);
                const savedBuf = fs.readFileSync(savedPath);
                expect(savedBuf.length).toBeGreaterThan(0);
                const meta = await sharp(savedBuf).metadata();
                expect(meta.format).toBe('webp');
                expect(meta.width).toBeLessThanOrEqual(400);
            } finally {
                fs.rmSync(path.join(tmpImportDir, importId), { force: true });
                if (savedImageUrl) fs.rmSync(path.join(modelsDir, path.basename(savedImageUrl)), { force: true });
            }
        });

        it('regression: a row that fails partway through a brand must not leave earlier rows in that SAME brand counted as added (they were rolled back with it)', async () => {
            dataSource.query.mockResolvedValue([]); // brand/model always "not found" - every row looks new
            compatibilityService.creerMarqueInterne.mockResolvedValue({ id: 7 });
            // First row's creerModeleInterne call succeeds, second throws - simulating the second
            // row's image step (or any other failure) aborting the whole per-brand transaction.
            compatibilityService.creerModeleInterne
                .mockResolvedValueOnce({ id: 50 })
                .mockRejectedValueOnce(new Error('simulated failure on the second row'));
            const zip = buildZip([{ path: 'SAMSUNG/models.csv', content: 'modele\nModel One\nModel Two\n' }]);
            const importId = writeToImportTmpDir(zip, '.zip');
            const tmpDir = require('path').join(process.cwd(), 'uploads', 'compat-import-tmp');
            try {
                const result = await service.confirmerMarquesModeles(importId, undefined, 'export.zip', 'Bearer x');
                // Model One succeeded before Model Two's failure aborted the transaction - but since
                // the WHOLE brand transaction rolls back, Model One's insert never actually committed
                // either, so the reported count must be 0 added, not 1.
                expect(result.ajoutes).toBe(0);
                expect(result.erreurs).toEqual([{ marque: 'SAMSUNG', message: 'simulated failure on the second row' }]);
            } finally {
                require('fs').rmSync(require('path').join(tmpDir, importId), { force: true });
            }
        });

        it('excluding a brand skips it entirely and counts every one of its rows as ignored', async () => {
            dataSource.query.mockResolvedValue([]);
            const zip = buildZip([{ path: 'SAMSUNG/models.csv', content: 'modele\nA\nB\n' }]);
            const importId = writeToImportTmpDir(zip, '.zip');
            const fs = require('fs');
            const path = require('path');
            const tmpDir = path.join(process.cwd(), 'uploads', 'compat-import-tmp');
            try {
                const result = await service.confirmerMarquesModeles(importId, { marquesExclues: ['samsung'] }, 'export.zip', 'Bearer x');
                expect(result.ignores).toBe(2);
                expect(result.ajoutes).toBe(0);
                expect(compatibilityService.creerMarqueInterne).not.toHaveBeenCalled();
            } finally {
                fs.rmSync(path.join(tmpDir, importId), { force: true });
            }
        });
    });

    describe('compatibilities import — part-type mapping, model resolution, merge rule', () => {
        beforeEach(() => {
            caisseService.acteurRequis.mockResolvedValue({ id: 1, nom: 'Employe', role: 'compatibility_employee' });
        });

        function tmpJsonFile(data: unknown): string {
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const file = path.join(os.tmpdir(), `compat-${Date.now()}-${Math.random()}.json`);
            fs.writeFileSync(file, JSON.stringify(data));
            return file;
        }

        it('an unknown partType is silently excluded from the preview', async () => {
            const file = tmpJsonFile([{ partType: 'camera', models: [{ brand: 'X', name: 'Y' }] }]);
            try {
                const preview = await service.previsualiserCompatibilites(file, 'c.json', 'Bearer x');
                expect(preview.groupes).toHaveLength(0);
            } finally { require('fs').unlinkSync(file); }
        });

        it('a model that cannot be resolved is reported as not-found, not auto-created', async () => {
            dataSource.query.mockResolvedValue([]); // brand never found
            const file = tmpJsonFile([{ partType: 'display', models: [{ brand: 'UNKNOWN', name: 'Z' }] }]);
            try {
                const preview = await service.previsualiserCompatibilites(file, 'c.json', 'Bearer x');
                expect(preview.groupes[0].modeles[0].trouve).toBe(false);
                expect(preview.types[0].modelesIntrouvables).toBe(1);
            } finally { require('fs').unlinkSync(file); }
        });

        it('badge "توافق مؤكد" on every model proposes "confirmed", anything else proposes "needs_test"', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM brand')) return Promise.resolve([{ id: 1 }]);
                if (sql.includes('FROM device_model')) return Promise.resolve([{ id: 1, image: null }]);
                return Promise.resolve([]); // no overlapping group
            });
            const confirmedFile = tmpJsonFile([{ partType: 'battery', models: [{ brand: 'A', name: 'B', badge: 'توافق مؤكد' }] }]);
            const needsTestFile = tmpJsonFile([{ partType: 'battery', models: [{ brand: 'A', name: 'B', badge: 'autre chose' }] }]);
            try {
                const p1 = await service.previsualiserCompatibilites(confirmedFile, 'c.json', 'Bearer x');
                expect(p1.groupes[0].statutPropose).toBe('confirmed');
                const p2 = await service.previsualiserCompatibilites(needsTestFile, 'c.json', 'Bearer x');
                expect(p2.groupes[0].statutPropose).toBe('needs_test');
            } finally {
                require('fs').unlinkSync(confirmedFile);
                require('fs').unlinkSync(needsTestFile);
            }
        });

        it('confirm: an overlapping group the user did NOT confirm merging into still gets its own new group (creerGroupeInterne), never auto-merged', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM brand')) return Promise.resolve([{ id: 1 }]);
                if (sql.includes('FROM device_model')) return Promise.resolve([{ id: 42, image: null }]);
                if (sql.includes('FROM compat_group')) return Promise.resolve([{ id: 5, modeles: ['A B'] }]); // overlap found
                return Promise.resolve([]);
            });
            const fs = require('fs');
            const { randomUUID } = require('crypto');
            const path = require('path');
            const tmpDir = path.join(process.cwd(), 'uploads', 'compat-import-tmp');
            fs.mkdirSync(tmpDir, { recursive: true });
            const importId = `${randomUUID()}.json`;
            fs.writeFileSync(path.join(tmpDir, importId), JSON.stringify([{ partType: 'battery', models: [{ brand: 'A', name: 'B' }] }]));
            try {
                const result = await service.confirmerCompatibilites(importId, { fusionsConfirmees: [] }, undefined, 'c.json', 'Bearer x');
                expect(compatibilityService.creerGroupeInterne).toHaveBeenCalled();
                expect(result.crees).toBe(1);
                expect(result.fusionnes).toBe(0);
            } finally {
                fs.rmSync(path.join(tmpDir, importId), { force: true });
            }
        });

        it('confirm: a merge the user DID confirm adds to the existing group instead, and never downgrades an already-confirmed group', async () => {
            dataSource.query.mockImplementation((sql: string) => {
                if (sql.includes('FROM brand')) return Promise.resolve([{ id: 1 }]);
                if (sql.includes('FROM device_model')) return Promise.resolve([{ id: 42, image: null }]);
                if (sql.includes('SELECT cg.id')) return Promise.resolve([{ id: 5, modeles: ['A B'] }]); // overlap found
                return Promise.resolve([]);
            });
            dataSource.transaction.mockImplementation(async (cb: any) => cb({ query: dataSource.query }));
            const fs = require('fs');
            const { randomUUID } = require('crypto');
            const path = require('path');
            const tmpDir = path.join(process.cwd(), 'uploads', 'compat-import-tmp');
            fs.mkdirSync(tmpDir, { recursive: true });
            const importId = `${randomUUID()}.json`;
            // badge is NOT the confirmed phrase - this import proposes needs_test, but the existing
            // group it's merging into may already be 'confirmed', which the UPDATE's CASE must preserve.
            fs.writeFileSync(path.join(tmpDir, importId), JSON.stringify([{ partType: 'battery', models: [{ brand: 'A', name: 'B', badge: 'x' }] }]));
            try {
                const result = await service.confirmerCompatibilites(importId, { fusionsConfirmees: ['battery#0'] }, undefined, 'c.json', 'Bearer x');
                expect(result.fusionnes).toBe(1);
                expect(compatibilityService.creerGroupeInterne).not.toHaveBeenCalled();
                const updateCall = dataSource.query.mock.calls.find((c: any[]) => c[0].includes('UPDATE compat_group'));
                expect(updateCall[0]).toMatch(/CASE WHEN statut = 'confirmed' OR \$2 = 'confirmed' THEN 'confirmed' ELSE 'needs_test' END/);
                expect(updateCall[1]).toEqual([5, 'needs_test']);
            } finally {
                fs.rmSync(path.join(tmpDir, importId), { force: true });
            }
        });
    });

    describe('nettoyerFichiersTempAbandonnes() — sweeps stale temp uploads an abandoned preview leaves behind', () => {
        const fs = require('fs');
        const path = require('path');
        const tmpDir = path.join(process.cwd(), 'uploads', 'compat-import-tmp');

        beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }));

        it('deletes a file older than 24h, keeps a fresh one', async () => {
            const oldFile = path.join(tmpDir, 'old-test-cleanup.zip');
            const freshFile = path.join(tmpDir, 'fresh-test-cleanup.zip');
            fs.writeFileSync(oldFile, 'x');
            fs.writeFileSync(freshFile, 'x');
            const oldTime = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
            fs.utimesSync(oldFile, oldTime, oldTime);

            try {
                await service.nettoyerFichiersTempAbandonnes();
                expect(fs.existsSync(oldFile)).toBe(false);
                expect(fs.existsSync(freshFile)).toBe(true);
            } finally {
                fs.rmSync(oldFile, { force: true });
                fs.rmSync(freshFile, { force: true });
            }
        });

        it('does nothing if the temp folder does not exist yet (fresh boot)', async () => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            await expect(service.nettoyerFichiersTempAbandonnes()).resolves.toBeUndefined();
        });
    });
});
