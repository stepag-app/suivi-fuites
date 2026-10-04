'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OUVRAGES, STATUTS, dateHeure, libellesMarche, messageErreur, telechargerCsv } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
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
    const [f, s] = await Promise.all([
      sb.from('v_fuites').select('*').eq('marche_id', marcheId).order('numero', { ascending: false }).limit(2000),
      sb.from('secteurs').select('id, zone_id, code, libelle').eq('marche_id', marcheId).order('libelle'),
    ]);
    if (f.error) setErreur(messageErreur(f.error));
    setFuites((f.data as VFuite[] | null) ?? []);
    setSecteurs((s.data as Secteur[] | null) ?? []);
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtrees = useMemo(() => {
    const t = texte.trim().toLowerCase();
    const chiffres = t.replace(/\D/g, '');
    return fuites.filter(
      (f) =>
        (!statut || f.statut === statut) &&
        (!secteur || f.secteur_id === secteur) &&
        (!alertesSeules || ALERTES.some((a) => f[a.cle] === true)) &&
        (!t ||
          String(f.numero) === t ||
          (f.reference_srm ?? '').toLowerCase().includes(t) ||
          (chiffres.length >= 3 && (f.reference_srm ?? '').replace(/\D/g, '').includes(chiffres)) ||
          (f.adresse ?? '').toLowerCase().includes(t)),
    );
  }, [fuites, statut, secteur, texte, alertesSeules]);

  const compteurs = useMemo(() => {
    const c: Record<string, number> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites]);

  function exporter() {
    telechargerCsv(`fuites-${marche?.code ?? ''}-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['N°', libelles.reference, 'Statut', 'Zone', 'Secteur', 'Adresse', 'Ouvrage', 'Date détection', 'Détectée par', 'Latitude', 'Longitude', 'Photos', 'Motif sans réparation'],
      ...filtrees.map((f) => [
        f.numero, f.reference_srm, STATUTS[f.statut].libelle, f.zone, f.secteur, f.adresse,
        f.ouvrage ? OUVRAGES[f.ouvrage] : '', dateHeure(f.date_detection), f.detectee_par,
        f.latitude, f.longitude, f.nb_photos, f.motif_sans_reparation,
      ]),
    ]);
  }

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
        {peut('exports', 'lire') && <button onClick={exporter}>Exporter (Excel)</button>}
      </div>

      {erreur && <p className="erreur">{erreur}</p>}
      {chargement && <p className="discret">Chargement…</p>}
      {!chargement && filtrees.length === 0 && <p className="carte">Aucune fuite à afficher.</p>}

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
