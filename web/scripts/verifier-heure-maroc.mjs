// Vérification de l'heure du Maroc du panneau (src/lib/heure-maroc.ts) : UTC+0 depuis le 2026-09-20 01:00 UTC,
// Africa/Casablanca avant, quelle que soit la base des fuseaux de Node ou du navigateur ; même bascule que la
// fonction private.heure_maroc de la base ; aucun autre fichier du panneau n'écrit le fuseau.
// Lancement, dans web/ : node scripts/verifier-heure-maroc.mjs   (Node 22.18 ou plus récent)
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASCULE_UTC0, dateHeureMaroc, dateMaroc, formatMaroc, fuseauMaroc, heureMurale, instantMaroc, jourMaroc,
} from '../src/lib/heure-maroc.ts';

let n = 0;
const ok = (nom, fn) => { fn(); n++; console.log(`ok ${n} - ${nom}`); };
const murale = (iso) => heureMurale(iso).toISOString().slice(0, 19);

ok('octobre 2026 : UTC+0, même si Node croit encore UTC+1', () => {
  assert.equal(murale('2026-10-14T23:30:00Z'), '2026-10-14T23:30:00');
  assert.equal(jourMaroc('2026-10-14T23:30:00Z'), '2026-10-14');
  assert.equal(fuseauMaroc(new Date('2026-10-14T12:00:00Z')), 'UTC');
});
ok('avant la bascule : UTC+1, et UTC+0 pendant le ramadan', () => {
  assert.equal(murale('2026-08-14T23:30:00Z'), '2026-08-15T00:30:00');
  assert.equal(jourMaroc('2026-08-14T23:30:00Z'), '2026-08-15');
  assert.equal(murale('2026-03-01T12:00:00Z'), '2026-03-01T12:00:00');
  assert.equal(fuseauMaroc('2026-08-14T12:00:00Z'), 'Africa/Casablanca');
});
ok('bascule du 2026-09-20 à 01:00 UTC', () => {
  assert.equal(BASCULE_UTC0, Date.parse('2026-09-20T01:00:00Z'));
  assert.equal(murale('2026-09-20T00:59:59Z'), '2026-09-20T01:59:59');
  assert.equal(murale('2026-09-20T01:00:00Z'), '2026-09-20T01:00:00');
  assert.equal(murale('2027-07-14T12:00:00Z'), '2027-07-14T12:00:00', 'pas d\'heure d\'été en 2027');
});
ok('inverse (heure du Maroc → instant)', () => {
  assert.equal(instantMaroc(Date.UTC(2026, 9, 15, 0, 30)).toISOString(), '2026-10-15T00:30:00.000Z');
  assert.equal(instantMaroc(Date.UTC(2026, 7, 15, 0, 30)).toISOString(), '2026-08-14T23:30:00.000Z');
  assert.equal(instantMaroc(Date.UTC(2026, 2, 1, 12, 0)).toISOString(), '2026-03-01T12:00:00.000Z');
  assert.equal(instantMaroc(Date.UTC(2026, 1, 15, 2, 30)).toISOString(), '2026-02-15T02:30:00.000Z', 'heure repliée : la seconde');
  assert.equal(instantMaroc(Date.UTC(2026, 8, 20, 1, 30)).toISOString(), '2026-09-20T01:30:00.000Z', 'bascule : la seconde');
  assert.equal(instantMaroc(Date.UTC(2026, 2, 22, 2, 30)).toISOString(), '2026-03-22T02:30:00.000Z', 'heure sautée : lue à UTC+0');
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 11, 31); t += 17 * 60_000) {
    // Heures affichées deux fois (début du ramadan, bascule) : l'inverse garde la seconde, comme PostgreSQL.
    const replie = (t >= Date.UTC(2026, 1, 15, 1) && t < Date.UTC(2026, 1, 15, 2)) || (t >= Date.UTC(2026, 8, 20, 0) && t < BASCULE_UTC0);
    if (!replie) assert.equal(instantMaroc(heureMurale(t)).getTime(), t, new Date(t).toISOString());
  }
});
ok('formats', () => {
  assert.equal(dateMaroc('2026-10-01T23:30:00Z'), '01/10/2026');
  assert.equal(dateHeureMaroc('2026-10-01T23:30:00Z'), '01/10/2026 23:30');
  assert.equal(dateHeureMaroc('2026-08-01T23:30:00Z'), '02/08/2026 00:30');
  assert.equal(formatMaroc('2026-10-14T08:05:00Z', 'fr-FR', { hour: '2-digit', minute: '2-digit' }), '08:05');
  assert.equal(formatMaroc('2026-10-31T23:30:00Z', 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), 'samedi 31 octobre');
});

const ICI = dirname(fileURLToPath(import.meta.url));
ok('même bascule que private.heure_maroc (dernière migration qui la définit)', () => {
  const dossier = join(ICI, '../../supabase/migrations');
  const sql = readdirSync(dossier).sort().map((f) => readFileSync(join(dossier, f), 'utf8'))
    .filter((t) => /create (or replace )?function private\.heure_maroc\(/.test(t)).at(-1);
  assert.ok(sql, 'migration de private.heure_maroc introuvable');
  const m = /p_instant >= timestamptz '(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\+00'/.exec(sql);
  assert.ok(m, 'bascule introuvable dans private.heure_maroc');
  assert.equal(Date.parse(`${m[1]}T${m[2]}Z`), BASCULE_UTC0);
});
ok('le fuseau n\'est écrit que dans src/lib/heure-maroc.ts', () => {
  const src = join(ICI, '../src');
  const fautifs = [];
  const parcourir = (d) => readdirSync(d).forEach((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (/\.tsx?$/.test(f) && readFileSync(p, 'utf8').includes('Africa/Casablanca')) fautifs.push(relative(src, p));
  });
  parcourir(src);
  assert.deepEqual(fautifs, ['lib/heure-maroc.ts']);
});

console.log(`\n${n} vérifications réussies`);
