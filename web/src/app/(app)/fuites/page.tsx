'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUTS, dateHeure, libellesMarche, messageErreur } from '@/lib/format';
import { JEU_FUITES, JEU_PIECES, JEU_QUANTITES } from '@/lib/export/jeux';
import { PanneauExport } from '@/lib/export/PanneauExport';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import { Indicateur } from '@/lib/ui/Indicateur';
import { delaiReparation, fuitesDuMois, nonReparees, refectionsAFaire } from '@/lib/ui/indicateurs';
import type { Secteur, StatutFuite, VFuite } from '@/lib/types';
import { correspondance, decrirePeriode, filtresActifs, type CleAlerte, type FuiteFiltrable } from './filtres';
import styles from './fuites.module.css';
import { useFiltresAdresse } from './useFiltresAdresse';

type Libelles = ReturnType<typeof libellesMarche>;
const ALERTES: { cle: CleAlerte; texte: (l: Libelles) => string }[] = [
  { cle: 'alerte_non_reparee', texte: (l) => `Non réparée > ${l.delaiReparationH} h` },
  { cle: 'alerte_communication_srm', texte: (l) => `Non communiquée ${l.sigle}` },
  { cle: 'refection_chaussee_hors_delai', texte: () => 'Réfection chaussée hors délai' },
  { cle: 'alerte_refection_chaussee', texte: () => 'Réfection chaussée à faire' },
  { cle: 'alerte_refection_trottoir', texte: () => 'Réfection trottoir à faire' },
];

// useSearchParams demande une frontière Suspense (page rendue côté navigateur).
export default function PageFuites() {
  return (
    <Suspense fallback={<p className="discret">Chargement…</p>}>
      <ListeFuites />
    </Suspense>
  );
}

function ListeFuites() {
  const { marche, peut } = useSession();
  const router = useRouter();
  const libelles = libellesMarche(marche);
  const [fuites, setFuites] = useState<VFuite[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  // Marché dont les secteurs ont été lus sans erreur : un secteur inconnu de l'adresse n'est retiré qu'alors.
  const [secteursDe, setSecteursDe] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  // Filtres : dans l'adresse (?statut=…&secteur=…&du=…&au=…&alertes=1&texte=…), voir filtres.ts.
  const { filtres, changer, effacer } = useFiltresAdresse();
  const { statut, secteur, texte, alertes: alertesSeules } = filtres;

  const marcheId = marche?.id;
  // Une réponse arrivée après un changement de marché (ou une actualisation plus récente) est ignorée.
  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId) return;
    const demande = ++derniereDemande.current;
    setChargement(true);
    setErreur('');
    const sb = getSupabase();
    // L'API renvoie au plus 1 000 lignes par requête : la liste est lue par pages.
    const [f, s] = await Promise.all([
      lireTout<VFuite>((de, a) => sb.from('v_fuites').select('*').eq('marche_id', marcheId)
        .order('numero', { ascending: false }).range(de, a), 1000, 10000)
        .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error })),
      sb.from('secteurs').select('id, zone_id, code, libelle').eq('marche_id', marcheId).order('libelle'),
    ]);
    if (demande !== derniereDemande.current) return;
    if (f.error) setErreur(messageErreur(f.error));
    setFuites(f.data ?? []);
    setSecteurs((s.data as Secteur[] | null) ?? []);
    setSecteursDe(s.error ? null : marcheId);
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Secteur de l'adresse inconnu dans ce marché (lien d'un autre marché, secteur effacé) : ignoré et retiré.
  useEffect(() => {
    if (secteursDe === marcheId && secteur && !secteurs.some((s) => s.id === secteur)) changer({ secteur: '' });
  }, [secteursDe, marcheId, secteur, secteurs, changer]);

  // Filtres de la liste, réutilisés par le panneau d'export (« limiter à la liste affichée »).
  const correspond = useMemo(() => correspondance(filtres), [filtres]);
  const filtrees = useMemo(() => fuites.filter(correspond), [fuites, correspond]);
  const [exportOuvert, setExportOuvert] = useState(false);
  const [rapports, setRapports] = useState<{ fait: number; total: number; etape: string; enCours: boolean } | null>(null);

  // Rapports PDF des fuites affichées (liste filtrée), une fuite par page, dans un seul fichier.
  async function rapportsPdf() {
    if (!marcheId || !filtrees.length) return;
    const n = filtrees.length;
    const photos = filtrees.reduce((s, f) => s + f.nb_photos, 0);
    if (!window.confirm(`Fabriquer un PDF avec les rapports de ${n} fuite${n > 1 ? 's' : ''} (${photos} photo${photos > 1 ? 's' : ''}) ?`
      + (n > 40 ? '\nCela peut prendre plusieurs minutes : filtrez la liste pour un fichier plus court.' : ''))) return;
    setErreur('');
    setRapports({ fait: 0, total: 1, etape: 'Chargement des données', enCours: true });
    try {
      const { telechargerRapports } = await import('@/lib/export/rapport-fuite');
      const r = await telechargerRapports(filtrees.map((f) => f.id), marcheId, peut('quantites', 'lire'),
        (fait, total, etape) => setRapports({ fait, total, etape, enCours: true }));
      setRapports({ fait: 1, total: 1, enCours: false,
        etape: `${r.fuites} rapport${r.fuites > 1 ? 's' : ''} téléchargé${r.fuites > 1 ? 's' : ''} (${(r.octets / 1048576).toFixed(1)} Mo, ${r.secondes.toFixed(0)} s)` });
    } catch (e) {
      setRapports(null);
      setErreur(messageErreur(e));
    }
  }
  const descriptionListe = [
    statut && STATUTS[statut].libelle,
    secteur && secteurs.find((s) => s.id === secteur)?.libelle,
    decrirePeriode(filtres),
    texte.trim() && `recherche « ${texte.trim()} »`,
    alertesSeules && 'alertes seulement',
  ].filter(Boolean).join(', ');

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites]);

  // Indicateurs (widgets) calculés sur toutes les fuites du marché, pas seulement la liste filtrée.
  const ind = useMemo(() => ({
    mois: fuitesDuMois(fuites),
    retard: nonReparees(fuites, libelles.delaiReparationH),
    delai: delaiReparation(fuites),
    refections: refectionsAFaire(fuites),
    horsDelai: fuites.some((f) => f.refection_chaussee_hors_delai),
  }), [fuites, libelles.delaiReparationH]);

  const alertesDe = (f: VFuite) => ALERTES.filter((a) => f[a.cle] === true);

  return (
    <>
      <div className="barre">
        <h1>Fuites <span className="sous-titre">{filtrees.length} affichée{filtrees.length > 1 ? 's' : ''} sur {fuites.length}</span></h1>
        <div className="actions en-tete">
          <button onClick={charger}>Actualiser</button>
          {peut('exports', 'lire') && <button onClick={() => setExportOuvert(true)}>Exporter</button>}
          {peut('exports', 'lire') && (
            <button disabled={!filtrees.length || !!rapports?.enCours} onClick={rapportsPdf}>
              Rapports PDF ({filtrees.length})
            </button>
          )}
          <Link href="/fuites/nouvelle" className="bouton primaire">+ Nouvelle fuite</Link>
        </div>
      </div>

      {fuites.length > 0 && (
        <div className="indicateurs">
          <Indicateur libelle={`Fuites détectées (${ind.mois.mois})`} valeur={ind.mois.valeur} commentaire={ind.mois.commentaire}
            serie={ind.mois.serie} titreCourbe="Fuites détectées par jour, 14 derniers jours" />
          <Indicateur libelle={`Non réparées > ${libelles.delaiReparationH} h`} valeur={ind.retard.valeur} commentaire={ind.retard.commentaire}
            serie={ind.retard.serie} ton="negatif" titreCourbe="Fuites en retard à chaque fin de journée, 14 derniers jours" />
          <Indicateur libelle="Délai moyen de réparation" valeur={ind.delai.valeur} unite=" h" commentaire={ind.delai.commentaire}
            serie={ind.delai.serie} titreCourbe="Délai moyen par semaine, 8 dernières semaines (heures)" />
          <Indicateur libelle="Réfections à faire" valeur={ind.refections.valeur} commentaire={ind.refections.commentaire}
            serie={ind.refections.serie} ton={ind.horsDelai ? 'negatif' : 'critique'}
            titreCourbe="Réfections en attente à chaque fin de journée, 14 derniers jours" />
        </div>
      )}

      <div className="pastilles" role="group" aria-label="Filtrer par statut">
        {(Object.keys(STATUTS) as StatutFuite[]).map((s) => (
          <button
            key={s}
            className={`pastille ${STATUTS[s].classe} ${statut === s ? 'choisie' : ''}`}
            aria-pressed={statut === s}
            onClick={() => changer({ statut: statut === s ? '' : s })}
          >
            {STATUTS[s].libelle} <b>{compteurs[s] ?? 0}</b>
          </button>
        ))}
        <button className={`pastille ${statut === '' ? 'choisie' : ''}`} aria-pressed={statut === ''} onClick={() => changer({ statut: '' })}>
          Toutes <b>{fuites.length}</b>
        </button>
      </div>

      {rapports && (
        <div className="carte progression-rapports" role="status">
          <div>{rapports.etape}</div>
          {rapports.enCours
            ? <progress max={rapports.total} value={rapports.fait} />
            : <button className="petit" onClick={() => setRapports(null)}>Fermer</button>}
        </div>
      )}

      {erreur && <p className="erreur">{erreur}</p>}

      <PanneauExport
        ouvert={exportOuvert}
        fermer={() => setExportOuvert(false)}
        jeux={[JEU_FUITES, ...(peut('quantites', 'lire') ? [JEU_QUANTITES] : []), JEU_PIECES]}
        filtreListe={(l) => correspond(l as unknown as FuiteFiltrable)}
        descriptionListe={descriptionListe ? `Filtres de la liste : ${descriptionListe}` : undefined}
      />

      <section className="carte tableau-liste">
        <div className="filtres barre-filtres">
          <input placeholder="Rechercher : N°, référence ou adresse" value={texte} onChange={(e) => changer({ texte: e.target.value }, true)} aria-label="Rechercher" />
          <select value={secteur} onChange={(e) => changer({ secteur: e.target.value })} aria-label="Secteur">
            <option value="">Tous les secteurs</option>
            {secteurs.map((s) => (
              <option key={s.id} value={s.id}>{s.libelle}</option>
            ))}
          </select>
          <span className={styles.periode} role="group" aria-label="Période de détection">
            <label className={styles.date}>
              Détectées du
              <input type="date" value={filtres.du} max={filtres.au || undefined} onChange={(e) => changer({ du: e.target.value }, true)} />
            </label>
            <label className={styles.date}>
              au
              <input type="date" value={filtres.au} min={filtres.du || undefined} onChange={(e) => changer({ au: e.target.value }, true)} />
            </label>
          </span>
          <label className="ligne">
            <input type="checkbox" checked={alertesSeules} onChange={(e) => changer({ alertes: e.target.checked })} />
            Alertes seulement
          </label>
          {filtresActifs(filtres) && <button type="button" onClick={effacer}>Effacer les filtres</button>}
        </div>

        {chargement && <p className="discret vide-liste">Chargement…</p>}
        {!chargement && filtrees.length === 0 && <p className="discret vide-liste">Aucune fuite à afficher.</p>}

        {/* Bureau : tableau ; tablette en portrait et téléphone : une carte par fuite */}
        {filtrees.length > 0 && (
          <div className="defilement vue-tableau">
            <table>
              <thead>
                <tr>
                  <th>N°</th><th>{libelles.reference}</th><th>Secteur</th><th>Adresse</th><th>Détectée le</th>
                  <th>Statut</th><th>Alertes</th><th className="num">Photos</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map((f) => (
                  <tr key={f.id} className="ligne-cliquable" onClick={() => router.push(`/fuites/${f.id}`)}>
                    <td><Link href={`/fuites/${f.id}`} className="lien-fuite" onClick={(e) => e.stopPropagation()}>{f.numero}</Link></td>
                    <td className="nowrap">{f.reference_srm ?? '—'}{f.origine === 'srm' && <span className="etiquette">{libelles.sigle}</span>}</td>
                    <td>{f.secteur ?? '—'}</td>
                    <td>{f.adresse ?? '—'}</td>
                    <td className="nowrap">{dateHeure(f.date_detection)}{f.detectee_par && <div className="discret">{f.detectee_par}</div>}</td>
                    <td><span className={`badge ${STATUTS[f.statut].classe}`}>{STATUTS[f.statut].libelle}</span></td>
                    <td>
                      <div className="alertes">
                        {alertesDe(f).map((a) => (
                          <span key={a.cle} className={`alerte ${String(a.cle).includes('refection') ? 'orange' : ''}`}>{a.texte(libelles)}</span>
                        ))}
                        {f.verrouillee_le && <span className="etiquette">Verrouillée</span>}
                        {!alertesDe(f).length && !f.verrouillee_le && <span className="discret">—</span>}
                      </div>
                    </td>
                    <td className="num">{f.nb_photos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ul className="liste vue-cartes">
          {filtrees.map((f) => (
            <li key={f.id}>
              <Link href={`/fuites/${f.id}`} className="fuite">
                <div className="fuite-tete">
                  <strong>N° {f.numero}</strong>
                  <span className={`badge ${STATUTS[f.statut].classe}`}>{STATUTS[f.statut].libelle}</span>
                </div>
                <div>
                  {f.reference_srm ? <>Réf. {f.reference_srm} · </> : null}
                  {f.secteur ?? 'Secteur non renseigné'}
                  {f.origine === 'srm' && <span className="etiquette">{libelles.sigle}</span>}
                </div>
                {f.adresse && <div className="discret">{f.adresse}</div>}
                <div className="discret">
                  {dateHeure(f.date_detection)} · {f.nb_photos} photo{f.nb_photos > 1 ? 's' : ''}
                  {f.detectee_par ? ` · ${f.detectee_par}` : ''}
                </div>
                <div className="alertes">
                  {alertesDe(f).map((a) => (
                    <span key={a.cle} className={`alerte ${String(a.cle).includes('refection') ? 'orange' : ''}`}>{a.texte(libelles)}</span>
                  ))}
                  {f.verrouillee_le && <span className="etiquette">Verrouillée</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
