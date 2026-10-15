// Essai sans pile de « Mes chiffres » et « À faire » (src/tableau-donnees.ts) : filtres par rôle, pastille, durées,
// linéaire, pourcentage ; copie gardée par compte et par marché, affichée sans réseau ; délai dépassé ; erreur.
// Depuis mobile/ : node --import ./essais/substituts.mjs essais/tableau.test.mjs
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './mocks/supabase-simule.js';
import {
  chargerActions, chargerChiffres, cleActions, duree, familleDe, filtresDe, longueur, pourcentage, resumeActions,
} from '../src/tableau-donnees.ts';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };

// Fonctions de la base simulées : réponse, erreur, ou jamais de réponse.
const reponses = {};
supabase.rpc = (fonction, args) => {
  const p = reponses[fonction](args);
  return { abortSignal: () => p };
};
const action = (type, numero, urgent = false) => ({
  type, fuite_id: `f${numero}`, numero_affiche: String(numero), adresse: null, secteur: null, latitude: null, longitude: null,
  urgent, depuis: null, motif: null, emplacement: null,
});

console.log('1. Filtres et pastille');
const liste = [action('redetection', 5, true), action('photo', 8), action('corriger_reparation', 2, true), action('finir_reparation', 6),
  action('reparation', 3, true), action('refection', 9)];
verifier(familleDe('corriger_detection') === 'corriger' && familleDe('finir_reparation') === 'reparation' && familleDe('photo') === 'photo',
  'familles : corrections regroupées, « finir » avec les réparations');
let f = filtresDe(liste, { detection: true, reparation: false, refection: false });
verifier(f.map((x) => `${x.cle}:${x.nb}`).join() === 'toutes:6,corriger:1,redetection:1,photo:1', 'Détection : ses filtres seulement', f);
f = filtresDe(liste, { detection: false, reparation: true, refection: true });
verifier(f.map((x) => `${x.cle}:${x.nb}`).join() === 'toutes:6,corriger:1,reparation:2,refection:1', 'Réparation et Réfection', f);
verifier(JSON.stringify(resumeActions(liste)) === '{"total":6,"urgentes":3}', 'pastille : 6 actions, 3 urgentes');
verifier(JSON.stringify(resumeActions([])) === '{"total":0,"urgentes":0}', 'rien à faire');

console.log('2. Durées, linéaire, pourcentage');
const t0 = Date.parse('2026-10-15T12:00:00Z');
const il = (min) => new Date(t0 - min * 60000).toISOString();
verifier(JSON.stringify(duree(il(30), t0)) === '{"n":30,"unite":"min"}', '30 min');
verifier(JSON.stringify(duree(il(5 * 60 + 10), t0)) === '{"n":5,"unite":"h"}', '5 h');
verifier(JSON.stringify(duree(il(47 * 60), t0)) === '{"n":47,"unite":"h"}', '47 h (encore en heures)');
verifier(JSON.stringify(duree(il(49 * 60), t0)) === '{"n":2,"unite":"j"}', '49 h : 2 j');
verifier(duree(null, t0) === null && JSON.stringify(duree(il(-5), t0)) === '{"n":0,"unite":"min"}', 'sans date ; horloge en avance : 0 min');
verifier(longueur(0) === '0 m' && longueur(850.4) === '850 m' && longueur(12400) === '12,4 km' && longueur(1000) === '1,0 km', 'mètres puis kilomètres');
verifier(pourcentage(6, 7) === 86 && pourcentage(0, 0) === null && pourcentage(4, 4) === 100, 'pourcentage arrondi, rien sans dénominateur');

console.log('3. Copie de la tablette et serveur');
reponses.mes_actions = async ({ p_marche }) => ({ data: p_marche === 'M1' ? liste : [], error: null });
let vu = [];
let repondu = await chargerActions('agentA', 'M1', { copie: true, aRenouveler: false, delaiMs: 1000, afficher: (a) => vu.push(a) });
verifier(repondu && vu.length === 1 && vu[0].liste.length === 6, 'aucune copie : réponse du serveur seule', vu);
verifier(JSON.parse(await AsyncStorage.getItem(cleActions('agentA', 'M1'))).liste.length === 6, 'réponse gardée sur la tablette');

vu = [];
repondu = await chargerActions('agentA', 'M1', { copie: true, aRenouveler: true, delaiMs: 1000, afficher: (a) => vu.push(a) });
verifier(!repondu && vu.length === 1 && vu[0].liste.length === 6, 'jeton à renouveler : copie affichée, aucune requête');

vu = [];
repondu = await chargerActions('agentB', 'M1', { copie: true, aRenouveler: true, delaiMs: 1000, afficher: (a) => vu.push(a) });
verifier(!repondu && vu.length === 0, 'autre compte sur la même tablette : rien de l\'agent précédent');

reponses.mes_actions = () => new Promise(() => {});
vu = [];
const debut = Date.now();
repondu = await chargerActions('agentA', 'M2', { copie: true, aRenouveler: false, delaiMs: 50, afficher: (a) => vu.push(a) });
verifier(!repondu && vu.length === 0 && Date.now() - debut < 1000, 'serveur muet : abandon au délai, rien affiché');

reponses.mes_actions = async () => ({ data: null, error: { message: 'refus' } });
vu = [];
repondu = await chargerActions('agentA', 'M1', { copie: false, aRenouveler: false, delaiMs: 1000, afficher: (a) => vu.push(a) });
verifier(!repondu && vu.length === 0, 'erreur du serveur : hors ligne, copie gardée');
verifier(JSON.parse(await AsyncStorage.getItem(cleActions('agentA', 'M1'))).liste.length === 6, 'copie intacte après une erreur');

const chiffres = { maj: '2026-10-15T12:00:00Z', roles: { detection: true, reparation: false, refection: false } };
reponses.mes_chiffres = async () => ({ data: chiffres, error: null });
vu = [];
repondu = await chargerChiffres('agentA', 'M1', { copie: true, aRenouveler: false, delaiMs: 1000, afficher: (c) => vu.push(c) });
verifier(repondu && vu.length === 1 && vu[0].roles.detection, 'chiffres du serveur');
reponses.mes_chiffres = async () => ({ data: null, error: null });
vu = [];
repondu = await chargerChiffres('agentA', 'M3', { copie: false, aRenouveler: false, delaiMs: 1000, afficher: (c) => vu.push(c) });
verifier(repondu && vu.length === 1 && vu[0] === null, 'marché hors de portée : null');

console.log(`\n${ok} réussis, ${ko} en échec`);
process.exit(ko ? 1 : 0);
