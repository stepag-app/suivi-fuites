'use client';

// Rapprochement posé / transféré (lot P4, chantier v2 X3) : par article Dolibarr, ce qui est parti au chantier (bons de
// transfert vers l'entrepôt du marché, retours déduits, annulations neutralisées), ce qui a été posé (inventaire réel des
// réparations) et l'écart, sur la période choisie et en cumul ; seuil d'alerte réglable par marché ; import du CSV des
// mouvements (administrateur, en secours) ; synchronisation Dolibarr (X8 : lecture de l'API toutes les 15 minutes, bouton
// « Synchroniser maintenant ») ; export Excel. Responsable et administrateur (« quantités / lire »). Jamais de prix.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CarteIndicateur, GrilleIndicateurs } from '@/components/carte-indicateur';
import {
  chargerDernierImportMouvements, chargerEnvoisDolibarr, chargerRapprochement, chargerReglagesFournitures, enregistrerReglagesFournitures, messageDolibarr,
  type DernierImportMouvements, type ReglagesFournitures,
} from '@/lib/dolibarr/donnees';
import type { EnvoiDolibarr } from '@/lib/dolibarr/envoi-auto';
import {
  FILTRES_RAPPROCHEMENT_DEFAUT, colonnesExportRapprochement, famillesDe, filtrerRapprochement, totalRapprochement, trierRapprochement,
  type FiltresRapprochement, type LigneRapprochement,
} from '@/lib/dolibarr/rapprochement';
import { dateHeure } from '@/lib/format';
import { useSession } from '@/lib/session';
import { formaterQuantite, libelleFamille } from '@/lib/ui/fournitures';
import { debutDeMois, finDeMois, jourCasa, libellePeriode } from '../inventaire';
import styles from '../fournitures.module.css';
import { EnvoiAutomatique } from './EnvoiAutomatique';
import { ImportMouvements } from './ImportMouvements';

type ChoixPeriode = 'mois' | 'precedent' | 'debut' | 'libre';

function bornes(choix: ChoixPeriode, du: string, au: string, maintenant = new Date()): { du: string; au: string } {
  const auj = jourCasa(maintenant);
  if (choix === 'mois') return { du: debutDeMois(auj), au: auj };
  if (choix === 'precedent') {
    const fin = new Date(`${debutDeMois(auj)}T12:00:00Z`);
    fin.setUTCDate(0);
    const j = fin.toISOString().slice(0, 10);
    return { du: debutDeMois(j), au: finDeMois(j) };
  }
  if (choix === 'debut') return { du: '', au: auj };
  return { du, au };
}

const q = (n: number, unite: string) => (n === 0 ? '—' : formaterQuantite(n, unite));

export default function PageRapprochement() {
  const { marche, peut, profil } = useSession();
  const marcheId = marche?.id;
  const admin = !!profil?.est_admin;
  const lire = peut('quantites', 'lire');
  const [choix, setChoix] = useState<ChoixPeriode>('debut');
  const [libre, setLibre] = useState({ du: '', au: '' });
  const [filtres, setFiltres] = useState<FiltresRapprochement>(FILTRES_RAPPROCHEMENT_DEFAUT);
  const [lignes, setLignes] = useState<LigneRapprochement[]>([]);
  const [reglages, setReglages] = useState<ReglagesFournitures | null>(null);
  const [saisie, setSaisie] = useState({ seuil: '', entrepot: '' });
  const [dernierImport, setDernierImport] = useState<DernierImportMouvements | null>(null);
  const [envois, setEnvois] = useState<EnvoiDolibarr[] | null>([]);
  const [chargeLe, setChargeLe] = useState(() => new Date());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);

  const periode = useMemo(() => bornes(choix, libre.du, libre.au), [choix, libre.du, libre.au]);

  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId || !lire) return;
    const demande = ++derniereDemande.current;
    setChargement(true);
    setErreur('');
    try {
      const [l, r, d, e] = await Promise.all([
        chargerRapprochement(marcheId, periode.du, periode.au),
        chargerReglagesFournitures(marcheId),
        chargerDernierImportMouvements(),
        chargerEnvoisDolibarr(),
      ]);
      if (demande !== derniereDemande.current) return;
      setLignes(l);
      setEnvois(e);
      setChargeLe(new Date());
      setReglages(r);
      setSaisie({ seuil: String(r.seuil_ecart_fournitures_pct), entrepot: r.entrepot_dolibarr_id ? String(r.entrepot_dolibarr_id) : '' });
      setDernierImport(d);
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setLignes([]);
      setErreur(messageDolibarr(e));
    }
    setChargement(false);
  }, [marcheId, lire, periode.du, periode.au]);

  useEffect(() => {
    charger();
  }, [charger]);

  const visibles = useMemo(() => trierRapprochement(filtrerRapprochement(lignes, filtres)), [lignes, filtres]);
  const total = useMemo(() => totalRapprochement(visibles), [visibles]);
  const familles = useMemo(() => famillesDe(lignes), [lignes]);
  const titrePeriode = periode.du ? libellePeriode({ du: periode.du, au: periode.au }) : `depuis le début, jusqu'au ${periode.au.split('-').reverse().join('/')}`;

  async function enregistrerReglages() {
    if (!marcheId || !reglages) return;
    const seuil = Number(saisie.seuil.replace(',', '.'));
    const entrepot = saisie.entrepot.trim() ? Number(saisie.entrepot) : null;
    if (!Number.isFinite(seuil) || seuil < 0 || seuil > 999) return setErreur('Seuil : un pourcentage entre 0 et 999.');
    if (entrepot != null && (!Number.isInteger(entrepot) || entrepot <= 0)) return setErreur('Entrepôt : numéro (rowid) Dolibarr positif.');
    setOccupe(true);
    setErreur('');
    setInfo('');
    try {
      const maj: Partial<ReglagesFournitures> = { seuil_ecart_fournitures_pct: seuil };
      if (admin && entrepot !== reglages.entrepot_dolibarr_id) maj.entrepot_dolibarr_id = entrepot;
      await enregistrerReglagesFournitures(marcheId, maj);
      setInfo('Réglages enregistrés.');
      await charger();
    } catch (e) {
      setErreur(messageDolibarr(e));
    }
    setOccupe(false);
  }

  async function exporterExcel() {
    if (!marcheId || !visibles.length) return;
    setOccupe(true);
    setErreur('');
    try {
      const [{ exporter }, { construireSection }, { construireEntete }, { chargerContexteRapport }] = await Promise.all([
        import('@/lib/export/generer'), import('@/lib/export/modele'), import('@/lib/export/jeux'), import('@/lib/export/rapport-fuite'),
      ]);
      const ctx = await chargerContexteRapport(marcheId, false);
      await exporter({
        nomFichier: `rapprochement-dolibarr-${String(ctx.marche.code ?? '')}`,
        entete: construireEntete(ctx, 'Rapprochement des fournitures : posé / transféré (Dolibarr)', [
          `Période : ${titrePeriode} ; cumuls jusqu'à la fin de la période`,
          `Entrepôt Dolibarr ${reglages?.entrepot_dolibarr_id ?? '—'} ; seuil d'alerte ${reglages?.seuil_ecart_fournitures_pct ?? '—'} % du transféré cumulé`,
          'Écart = transféré − consommé − posé (reste théorique au chantier) ; quantités seulement, aucun prix',
        ]),
        sections: [construireSection(
          visibles.map((l) => ({ ...l, famille: libelleFamille(l.famille), au_dela_seuil: l.au_dela_seuil ? 'Oui' : '' })),
          colonnesExportRapprochement(total.aConsomme) as never,
          { total: false },
        )],
        orientation: 'paysage',
        genereLe: new Date(),
      }, 'xlsx');
    } catch (e) {
      setErreur(messageDolibarr(e));
    }
    setOccupe(false);
  }

  if (!lire) return <p className="carte">Votre compte n&apos;a pas accès au rapprochement Dolibarr (responsable ou administrateur).</p>;

  const peutSeuil = admin || peut('parametres', 'modifier');
  const maj = (p: Partial<FiltresRapprochement>) => setFiltres((f) => ({ ...f, ...p }));

  return (
    <div className="ancien">
      <p><Link href="/fournitures">← Fournitures posées</Link></p>
      <div className="barre">
        <h1>Rapprochement Dolibarr <span className="sous-titre">{marche?.code} · posé / transféré au chantier</span></h1>
        <div className="actions en-tete">
          <button onClick={charger} disabled={chargement}>Actualiser</button>
          {peut('exports', 'lire') && <button onClick={exporterExcel} disabled={occupe || !visibles.length}>Excel</button>}
        </div>
      </div>
      <p className={`discret ${styles.intro}`}>
        Dolibarr connaît ce qui part au chantier (bons de transfert vers l&apos;entrepôt du marché, retours au dépôt déduits,
        annulations neutralisées), pas ce qui est posé. Écart = transféré − consommé − posé : le reste théorique au chantier,
        à contrôler sur place ; négatif, une pièce posée sans transfert enregistré. Indicatif, jamais bloquant ; quantités
        seulement, aucun prix. Posé : inventaire réel des réparations (corrections du bureau comprises).
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="carte succes" role="status">{info}</p>}

      {reglages && (
        <section className="carte">
          <div className={styles.reglages}>
            <label>
              Entrepôt Dolibarr du chantier
              <input inputMode="numeric" value={saisie.entrepot} disabled={!admin || occupe} placeholder="aucun"
                onChange={(e) => setSaisie((s) => ({ ...s, entrepot: e.target.value.replace(/\D/g, '') }))} />
            </label>
            <label>
              Seuil d&apos;alerte (% du transféré cumulé)
              <input inputMode="decimal" value={saisie.seuil} disabled={!peutSeuil || occupe}
                onChange={(e) => setSaisie((s) => ({ ...s, seuil: e.target.value }))} />
            </label>
            {peutSeuil && <button onClick={enregistrerReglages} disabled={occupe}>Enregistrer</button>}
            <span className="discret">
              {reglages.entrepot_dolibarr_id == null
                ? 'Sans entrepôt, rien n\'est rapproché.'
                : dernierImport ? `Dernier import CSV le ${dateHeure(dernierImport.importe_le)}.` : 'Aucun import CSV.'}
              {!admin && ' L\'entrepôt est choisi par l\'administrateur.'}
            </span>
          </div>
        </section>
      )}

      {reglages?.entrepot_dolibarr_id != null && <EnvoiAutomatique envois={envois} maintenant={chargeLe} admin={admin} apresSynchro={charger} />}

      {admin && <ImportMouvements entrepotMarche={reglages?.entrepot_dolibarr_id ?? null} dernierImport={dernierImport} apresImport={charger} />}

      <section className={`carte ${styles.filtres}`} aria-label="Filtres">
        <div className={styles.saisies}>
          <label>
            Période
            <select value={choix} onChange={(e) => setChoix(e.target.value as ChoixPeriode)}>
              <option value="debut">Depuis le début</option>
              <option value="mois">Mois en cours</option>
              <option value="precedent">Mois précédent</option>
              <option value="libre">Dates libres</option>
            </select>
          </label>
          {choix === 'libre' && (
            <>
              <label>du<input type="date" value={libre.du} max={libre.au || undefined} onChange={(e) => setLibre((p) => ({ ...p, du: e.target.value }))} /></label>
              <label>au<input type="date" value={libre.au} min={libre.du || undefined} onChange={(e) => setLibre((p) => ({ ...p, au: e.target.value }))} /></label>
            </>
          )}
          <label>
            Famille
            <select value={filtres.famille} onChange={(e) => maj({ famille: e.target.value })}>
              <option value="">Toutes</option>
              {familles.map((f) => <option key={f} value={f}>{libelleFamille(f)} ({f})</option>)}
            </select>
          </label>
          <label>
            Article
            <input value={filtres.texte} placeholder="désignation" onChange={(e) => maj({ texte: e.target.value })} />
          </label>
          <label className="ligne">
            <input type="checkbox" checked={filtres.piecesSeulement} onChange={(e) => maj({ piecesSeulement: e.target.checked })} />
            Pièces seulement (sans carburant, outillage…)
          </label>
          <label className="ligne">
            <input type="checkbox" checked={filtres.alertesSeulement} onChange={(e) => maj({ alertesSeulement: e.target.checked })} />
            Au-delà du seuil seulement
          </label>
        </div>
      </section>

      <GrilleIndicateurs className="mb-4">
        <CarteIndicateur libelle="Articles" valeur={total.articles} commentaire={titrePeriode} />
        <CarteIndicateur libelle="Au-delà du seuil" valeur={total.alertes} ton={total.alertes ? 'negatif' : 'normal'}
          commentaire={`écart cumulé > ${reglages?.seuil_ecart_fournitures_pct ?? '—'} % du transféré`} />
        <CarteIndicateur libelle="Articles posés" valeur={total.posees} commentaire="sur la période" />
        <CarteIndicateur libelle="Posés sans transfert" valeur={total.sansTransfert} ton={total.sansTransfert ? 'critique' : 'normal'}
          commentaire="rien de transféré au cumul" />
      </GrilleIndicateurs>

      <section className="carte">
        {chargement && <p className="discret">Chargement…</p>}
        {!chargement && visibles.length === 0 && (
          <p className="discret">
            {reglages?.entrepot_dolibarr_id == null && lignes.length === 0
              ? 'Aucun entrepôt Dolibarr pour ce marché et aucune pièce posée.'
              : 'Aucun article avec ces filtres.'}
          </p>
        )}
        {visibles.length > 0 && (
          <div className={styles.defilement}>
            <table className={styles.croise}>
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="num">Transféré</th>
                  {total.aConsomme && <th className="num">Consommé</th>}
                  <th className="num">Posé</th>
                  <th className="num">Écart</th>
                  <th className={`num ${styles.total}`}>Transféré cumulé</th>
                  <th className="num">Posé cumulé</th>
                  <th className="num">Écart cumulé</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <tr key={l.produit_id} className={l.au_dela_seuil ? styles.alerte : ''}>
                    <td>
                      {l.designation}
                      <span className={styles.detail}>
                        {libelleFamille(l.famille)} · {l.unite}{l.dans_articles ? '' : ' · hors articles'}
                        {l.au_dela_seuil && <> · <span className={styles.badgeSeuil}>au-delà du seuil</span></>}
                      </span>
                    </td>
                    <td className="num">{q(l.transfere, l.unite)}</td>
                    {total.aConsomme && <td className="num">{q(l.consomme, l.unite)}</td>}
                    <td className="num" title={l.pieces ? `${l.pieces} ligne${l.pieces > 1 ? 's' : ''} de pièces` : undefined}>{q(l.pose, l.unite)}</td>
                    <td className={`num ${l.ecart < 0 ? styles.negatif : ''}`}>{q(l.ecart, l.unite)}</td>
                    <td className={`num ${styles.total}`}>{q(l.cumul_transfere, l.unite)}</td>
                    <td className="num">{q(l.cumul_pose, l.unite)}</td>
                    <td className={`num ${l.cumul_ecart < 0 ? styles.negatif : ''}`}>{q(l.cumul_ecart, l.unite)}</td>
                    <td className="num">{l.ecart_pct == null ? '—' : `${l.ecart_pct.toLocaleString('fr-FR')} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={`discret ${styles.note}`}>
          Cumuls depuis le premier mouvement ou la première pose, jusqu&apos;à la fin de la période. Un article est signalé quand
          l&apos;écart cumulé dépasse le seuil du marché (tout écart si rien n&apos;a été transféré). Unités de Dolibarr, sans conversion.
        </p>
      </section>
    </div>
  );
}
