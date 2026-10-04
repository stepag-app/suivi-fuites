'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { STATUTS, dateHeure, libellesMarche, messageErreur } from '@/lib/format';
import { JEU_FUITES, JEU_PIECES, JEU_QUANTITES } from '@/lib/export/jeux';
import { PanneauExport } from '@/lib/export/PanneauExport';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { Secteur, StatutFuite, VFuite } from '@/lib/types';

type Libelles = ReturnType<typeof libellesMarche>;
const ALERTES: { cle: keyof VFuite; texte: (l: Libelles) => string }[] = [
  { cle: 'alerte_non_reparee', texte: (l) => `Non réparée > ${l.delaiReparationH} h` },
  { cle: 'alerte_communication_srm', texte: (l) => `Non communiquée ${l.sigle}` },
  { cle: 'refection_chaussee_hors_delai', texte: () => 'Réfection chaussée hors délai' },
  { cle: 'alerte_refection_chaussee', texte: () => 'Réfection chaussée à faire' },
  { cle: 'alerte_refection_trottoir', texte: () => 'Réfection trottoir à faire' },
];

export default function ListeFuites() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const [fuites, setFuites] = useState<VFuite[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [statut, setStatut] = useState<StatutFuite | ''>('');
  const [secteur, setSecteur] = useState('');
  const [texte, setTexte] = useState('');
  const [alertesSeules, setAlertesSeules] = useState(false);

  const marcheId = marche?.id;
  const charger = useCallback(async () => {
    if (!marcheId) return;
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
    if (f.error) setErreur(messageErreur(f.error));
    setFuites(f.data ?? []);
    setSecteurs((s.data as Secteur[] | null) ?? []);
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Filtres de la liste, réutilisés par le panneau d'export (« limiter à la liste affichée »).
  const correspond = useCallback(
    (f: Pick<VFuite, 'statut' | 'secteur_id' | 'numero' | 'reference_srm' | 'adresse'> & Partial<VFuite>) => {
      const t = texte.trim().toLowerCase();
      const chiffres = t.replace(/\D/g, '');
      return (!statut || f.statut === statut) &&
        (!secteur || f.secteur_id === secteur) &&
        (!alertesSeules || ALERTES.some((a) => f[a.cle] === true)) &&
        (!t ||
          String(f.numero) === t ||
          (f.reference_srm ?? '').toLowerCase().includes(t) ||
          (chiffres.length >= 3 && (f.reference_srm ?? '').replace(/\D/g, '').includes(chiffres)) ||
          (f.adresse ?? '').toLowerCase().includes(t));
    },
    [statut, secteur, texte, alertesSeules],
  );
  const filtrees = useMemo(() => fuites.filter(correspond), [fuites, correspond]);
  const [exportOuvert, setExportOuvert] = useState(false);
  const descriptionListe = [
    statut && STATUTS[statut].libelle,
    secteur && secteurs.find((s) => s.id === secteur)?.libelle,
    texte.trim() && `recherche « ${texte.trim()} »`,
    alertesSeules && 'alertes seulement',
  ].filter(Boolean).join(', ');

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites]);

  return (
    <>
      <div className="barre">
        <h1>Fuites <span className="discret">({filtrees.length}/{fuites.length})</span></h1>
        <Link href="/fuites/nouvelle" className="bouton gros primaire">+ Nouvelle fuite</Link>
      </div>

      <div className="pastilles">
        {(Object.keys(STATUTS) as StatutFuite[]).map((s) => (
          <button
            key={s}
            className={`pastille ${STATUTS[s].classe} ${statut === s ? 'choisie' : ''}`}
            onClick={() => setStatut(statut === s ? '' : s)}
          >
            {STATUTS[s].libelle} · {compteurs[s] ?? 0}
          </button>
        ))}
      </div>

      <div className="filtres">
        <input placeholder="N°, référence ou adresse" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)}>
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => (
            <option key={s.id} value={s.id}>{s.libelle}</option>
          ))}
        </select>
        <label className="ligne">
          <input type="checkbox" checked={alertesSeules} onChange={(e) => setAlertesSeules(e.target.checked)} />
          Alertes seulement
        </label>
        <button onClick={charger}>Actualiser</button>
        {peut('exports', 'lire') && <button onClick={() => setExportOuvert(true)}>Exporter</button>}
      </div>

      {erreur && <p className="erreur">{erreur}</p>}
      {chargement && <p className="discret">Chargement…</p>}
      {!chargement && filtrees.length === 0 && <p className="carte">Aucune fuite à afficher.</p>}

      <PanneauExport
        ouvert={exportOuvert}
        fermer={() => setExportOuvert(false)}
        jeux={[JEU_FUITES, ...(peut('quantites', 'lire') ? [JEU_QUANTITES] : []), JEU_PIECES]}
        filtreListe={(l) => correspond(l as unknown as VFuite)}
        descriptionListe={descriptionListe ? `Filtres de la liste : ${descriptionListe}` : undefined}
      />

      <ul className="liste">
        {filtrees.map((f) => (
          <li key={f.id}>
            <Link href={`/fuites/${f.id}`} className="carte fuite">
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
                {ALERTES.filter((a) => f[a.cle] === true).map((a) => (
                  <span key={a.cle} className="alerte">{a.texte(libelles)}</span>
                ))}
                {f.verrouillee_le && <span className="etiquette">Verrouillée</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
