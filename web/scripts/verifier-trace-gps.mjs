// Vérification des calculs du suivi GPS du panneau (src/lib/trace-gps.ts) et de la concordance avec la migration.
// Lancement, dans web/ : node scripts/verifier-trace-gps.mjs   (Node 22.18 ou plus récent)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bornesPause, cadre, decalerJour, duree, heureCourte, jourDe, kilometres, resume, segmenter, couleurAgent, COULEURS_AGENTS, texteEtat,
  texteJours, textePause, totalPausesS,
} from '../src/lib/trace-gps.ts';

let n = 0;
const ok = (nom, fn) => { fn(); n++; console.log(`ok ${n} - ${nom}`); };

const T0 = 1_790_000_000;
const pts = [[-1.91, 34.68, T0], [-1.911, 34.681, T0 + 30], [-1.912, 34.682, T0 + 60], [-1.92, 34.69, T0 + 60 + 3600], [-1.921, 34.691, T0 + 60 + 3630]];

ok('segmenter coupe au-delà de 10 minutes sans point', () => {
  const s = segmenter(pts);
  assert.equal(s.length, 2);
  assert.deepEqual(s.map((x) => x.length), [3, 2]);
});
ok('segmenter : un seul segment sans trou, aucun segment sans point', () => {
  assert.equal(segmenter(pts.slice(0, 3)).length, 1);
  assert.deepEqual(segmenter([]), []);
});
ok('segmenter : écart exactement égal au seuil gardé dans le segment', () => {
  assert.equal(segmenter([[0, 0, T0], [0, 0, T0 + 600]]).length, 1);
  assert.equal(segmenter([[0, 0, T0], [0, 0, T0 + 601]]).length, 2);
});
ok('resume : temps suivi sans les trous, nombre de coupures', () => {
  const r = resume(pts);
  assert.equal(r.suiviS, 60 + 30);
  assert.equal(r.coupures, 1);
  assert.equal(r.debut, T0);
  assert.equal(r.fin, T0 + 3690);
});
ok('resume : tracé vide', () => assert.deepEqual(resume([]), { debut: null, fin: null, suiviS: 0, coupures: 0 }));
ok('kilometres et duree', () => {
  assert.equal(kilometres(850), '850 m');
  assert.match(kilometres(12345), /^12,3\skm$/);
  assert.equal(duree(45 * 60), '45 min');
  assert.equal(duree(3 * 3600 + 5 * 60), '3 h 05');
});
ok('jours : décalage sans fuseau, fin de mois et d\'année', () => {
  assert.equal(decalerJour('2026-10-31', 1), '2026-11-01');
  assert.equal(decalerJour('2026-01-01', -1), '2025-12-31');
  assert.equal(decalerJour('2026-03-01', -1), '2026-02-28');
});
ok('jourDe : jour d\'Oujda (22 h 30 UTC le 9 est déjà le 10 si UTC+1)', () => {
  assert.equal(jourDe(new Date('2026-10-09T12:00:00Z')), '2026-10-09');
  assert.equal(jourDe(new Date('2026-07-09T23:30:00Z')), '2026-07-10');
});
ok('cadre', () => {
  assert.deepEqual(cadre(pts), [-1.921, 34.68, -1.91, 34.691]);
  assert.equal(cadre([]), null);
});
ok('couleurs des agents : distinctes puis reprises en boucle', () => {
  assert.equal(new Set(COULEURS_AGENTS).size, COULEURS_AGENTS.length);
  assert.equal(couleurAgent(COULEURS_AGENTS.length), couleurAgent(0));
});

ok('resume : un trou couvert par une pause n\'est pas une coupure', () => {
  assert.equal(resume(pts, [[T0 + 120, T0 + 3600]]).coupures, 0);
  assert.equal(resume(pts, [[T0 + 4000, T0 + 4100]]).coupures, 1);
});
ok('pauses : bornes, texte, total (heure d\'Oujda)', () => {
  const debut = '2026-10-13T11:30:00Z';
  const finie = { profil_id: 'a', debut, fin_prevue: '2026-10-13T12:30:00Z', fin: '2026-10-13T11:55:00Z', motif_fin: 'fuite' };
  const enCours = { profil_id: 'a', debut, fin_prevue: '2026-10-13T12:30:00Z', fin: null, motif_fin: null };
  const t = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  assert.deepEqual(bornesPause(finie), [t(debut), t('2026-10-13T11:55:00Z')]);
  assert.deepEqual(bornesPause(enCours, t('2026-10-13T11:40:00Z')), [t(debut), t('2026-10-13T11:40:00Z')]);
  assert.deepEqual(bornesPause(enCours, t('2026-10-13T13:00:00Z')), [t(debut), t('2026-10-13T12:30:00Z')], 'au plus la fin prévue');
  assert.match(textePause(finie), /^\d\d:\d\d → \d\d:\d\d \(25 min\)$/);
  assert.match(textePause(enCours, t('2026-10-13T11:40:00Z')), /en cours \(jusqu'à \d\d:\d\d au plus\)$/);
  assert.equal(totalPausesS([finie, enCours], t('2026-10-13T11:40:00Z')), 25 * 60 + 10 * 60);
});
ok('état de la tablette en clair, alerte quand le suivi est coupé', () => {
  const e = { marche_id: 'm', profil_id: 'a', identifiant: 'a', nom_complet: 'A', dernier_signe: '', dernier_suivi: null, pause_debut: null, pause_fin_prevue: null, coupe_depuis: null };
  assert.deepEqual(texteEtat({ ...e, etat: 'actif' }), { texte: 'Suivi actif', alerte: false });
  assert.equal(texteEtat({ ...e, etat: 'hors_heures' }).alerte, false);
  assert.equal(texteEtat({ ...e, etat: 'autorisation' }).alerte, true);
  assert.match(texteEtat({ ...e, etat: 'actif', coupe_depuis: '2026-10-13T09:12:00Z' }).texte, /^Suivi coupé depuis \d\d:\d\d$/);
  assert.match(texteEtat({ ...e, etat: 'pause', pause_fin_prevue: '2026-10-13T12:30:00Z' }).texte, /^En pause jusqu'à/);
});
ok('jours de travail en clair, heures courtes', () => {
  assert.equal(texteJours([1, 2, 3, 4, 5, 6]), 'du lundi au samedi');
  assert.equal(texteJours([7, 1, 2, 3, 4, 5, 6]), 'tous les jours');
  assert.equal(texteJours([1, 3, 5]), 'lundi, mercredi, vendredi');
  assert.equal(heureCourte('08:00:00'), '08:00');
  assert.equal(heureCourte('24:00:00'), '24:00');
});

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');
const sql = readFileSync(join(MIGRATIONS, '20261011100000_suivi_gps.sql'), 'utf8');
ok('la migration expose les colonnes que lit le panneau (v_traces_gps) et la fonction trace_gps', () => {
  for (const col of ['identifiant', 'nom_complet', 'jour', 'debut', 'fin', 'nb_points', 'distance_m', 'marche_id', 'profil_id']) {
    assert.match(sql, new RegExp(`\\b${col}\\b`), col);
  }
  assert.match(sql, /function public\.trace_gps\(p_marche uuid, p_profil uuid, p_jour date\)/);
  assert.match(sql, /function public\.purger_traces_marche\(p_marche uuid\)/);
  assert.match(sql, /enable row level security/);
});
const compromis = readFileSync(join(MIGRATIONS, '20261014800000_suivi_gps_heures_pauses.sql'), 'utf8');
ok('la migration du compromis expose ce que lit le panneau (pauses, état, réglages)', () => {
  for (const col of ['suivi_gps_debut', 'suivi_gps_fin', 'suivi_gps_jours', 'suivi_gps_pause_min', 'suivi_gps_pause_jour_min',
    'fin_prevue', 'motif_fin', 'coupe_depuis', 'pause_fin_prevue', 'dernier_signe']) {
    assert.match(compromis, new RegExp(`\\b${col}\\b`), col);
  }
  assert.match(compromis, /create view public\.v_suivi_gps_etats/);
  assert.match(compromis, /function public\.regler_suivi_gps\(\s*p_marche uuid,\s*p_debut time,\s*p_fin time,\s*p_jours smallint\[\],\s*p_pause_min integer,\s*p_pause_jour_min integer/);
  assert.doesNotMatch(compromis.slice(compromis.indexOf('create table public.pauses_gps'), compromis.indexOf('create index pauses_gps')), /geometry|lon|lat/,
    'une pause ne garde aucune position');
});
console.log(`\n${n} vérifications réussies`);
