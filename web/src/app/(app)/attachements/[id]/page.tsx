'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  NATURES_LIGNE, quantite, titreLot, type LigneLot, type Lot, type Recap, type ReglesAttachement,
} from '@/lib/attachements';
import { dateSeule, messageErreur, telechargerCsv } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { AAttacher } from './AAttacher';
import { FormAnticipation, FormForcage, FormLigneLibre, type ArticleChoix } from './FormsLignes';

interface Os { id: string; numero: string; date_os: string; nature: string }
interface Zone { id: string; libelle: string }

export default function DetailLot() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { marche, profil, peut } = useSession();
  const [lot, setLot] = useState<Lot | null>(null);
  const [lignes, setLignes] = useState<LigneLot[]>([]);
  const [recap, setRecap] = useState<Recap[]>([]);
  const [regles, setRegles] = useState<ReglesAttachement | null>(null);
  const [os, setOs] = useState<Os[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [articles, setArticles] = useState<ArticleChoix[]>([]);
  const [prixRefection, setPrixRefection] = useState<Set<string>>(new Set());
  const [dernierNumero, setDernierNumero] = useState<number | null>(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [formulaire, setFormulaire] = useState<'' | 'libre' | 'forcage'>('');
  const [anticipation, setAnticipation] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [l, li, rc, rg, o, z, p, n, dn] = await Promise.all([
      sb.from('attachements').select('*').eq('id', id).maybeSingle(),
      sb.from('v_attachement_lignes').select('*').eq('attachement_id', id).order('fuite_numero', { nullsFirst: false }).order('prix_ordre'),
      sb.from('v_attachement_recap').select('*').eq('attachement_id', id).order('prix_ordre').order('prix_numero'),
      sb.from('parametres_attachement').select('*').eq('marche_id', marcheId).maybeSingle(),
      sb.from('ordres_service').select('id, numero, date_os, nature').eq('marche_id', marcheId).order('date_os'),
      sb.from('zones').select('id, libelle').eq('marche_id', marcheId).order('numero'),
      sb.from('prix').select('id, numero, designation, unite, famille, actif').eq('marche_id', marcheId).order('hors_bordereau').order('ordre'),
      sb.from('natures_refection').select('prix_id').eq('marche_id', marcheId).not('prix_id', 'is', null),
      sb.from('attachements').select('numero').eq('marche_id', marcheId).eq('statut', 'arrete').is('supprime_le', null)
        .order('numero', { ascending: false }).limit(1),
    ]);
    const premiere = l.error || li.error || rc.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setLot((l.data as Lot | null) ?? null);
    setLignes((li.data as LigneLot[] | null) ?? []);
    setRecap((rc.data as Recap[] | null) ?? []);
    setRegles((rg.data as ReglesAttachement | null) ?? null);
    setOs((o.data as Os[] | null) ?? []);
    setZones((z.data as Zone[] | null) ?? []);
    const prix = (p.data as ArticleChoix[] | null) ?? [];
    setArticles(prix);
    const lies = new Set(((n.data as { prix_id: string }[] | null) ?? []).map((x) => x.prix_id));
    setPrixRefection(new Set(prix.filter((x) => x.famille === 'refection' || lies.has(x.id)).map((x) => x.id)));
    setDernierNumero(((dn.data as { numero: number }[] | null) ?? [])[0]?.numero ?? null);
  }, [id, marcheId]);

  useEffect(() => {
    charger();
  }, [charger, version]);

  const rafraichir = () => setVersion((v) => v + 1);
  const dec = regles?.decimales;

  // Lignes regroupées par fuite (les lignes libres à part)
  const groupes = useMemo(() => {
    const m = new Map<string, LigneLot[]>();
    lignes.forEach((l) => {
      const cle = l.fuite_id ?? `libre-${l.id}`;
      m.set(cle, [...(m.get(cle) ?? []), l]);
    });
    return [...m.values()];
  }, [lignes]);

  if (!lot) return <p className="carte">{erreur || 'Chargement…'} <Link href="/attachements">Retour aux attachements</Link></p>;

  const brouillon = lot.statut === 'brouillon';
  const modifiable = brouillon && peut('attachements', 'modifier');
  const estAdmin = !!profil?.est_admin;
  const recapUtile = recap.filter((r) => r.quantite_cumulee !== 0 || !r.hors_bordereau);
  const fuitesDuLot = new Set(lignes.filter((l) => l.fuite_id).map((l) => l.fuite_id));
  const negatives = lignes.filter((l) => l.quantite < 0).length;

  async function executer(action: () => PromiseLike<{ error: unknown }>, succes?: string): Promise<boolean> {
    setErreur('');
    setInfo('');
    setOccupe(true);
    try {
      const { error } = await action();
      if (error) throw error;
      if (succes) setInfo(succes);
      rafraichir();
      return true;
    } catch (e) {
      setErreur(messageErreur(e));
      return false;
    } finally {
      setOccupe(false);
    }
  }

  async function arreter() {
    const zeros = lignes.filter((l) => l.nature === 'solde' && l.quantite === 0).length;
    const texte = [
      `Arrêter définitivement ce lot (${lignes.length - zeros} ligne${lignes.length - zeros > 1 ? 's' : ''}) ?`,
      'Les quantités seront figées et ne pourront plus être attachées une seconde fois.',
      regles?.verrouiller_a_l_arret ? 'Les fuites du lot seront verrouillées.' : '',
      zeros ? `${zeros} ligne(s) à zéro seront retirées.` : '',
      negatives ? `Attention : ${negatives} régularisation(s) négative(s).` : '',
    ].filter(Boolean).join('\n');
    if (!window.confirm(texte)) return;
    await executer(() => getSupabase().rpc('arreter_attachement', { p_attachement: lot!.id, p_date_arret: lot!.date_arret }), 'Lot arrêté.');
  }

  async function rouvrir() {
    const motif = window.prompt('Motif de la réouverture (obligatoire, gardé dans le journal) :');
    if (!motif?.trim()) return;
    await executer(() => getSupabase().rpc('rouvrir_attachement', { p_attachement: lot!.id, p_motif: motif.trim() }), 'Lot rouvert.');
  }

  async function supprimerBrouillon() {
    if (!window.confirm('Supprimer ce brouillon ? Les travaux sélectionnés redeviennent disponibles.')) return;
    if (await executer(() => getSupabase().from('attachements').update({ supprime_le: new Date().toISOString() }).eq('id', lot!.id))) {
      router.push('/attachements');
    }
  }

  const retirer = (ids: string[]) => executer(() => getSupabase().from('attachement_lignes').delete().in('id', ids));

  function exporterCsv() {
    const titre = titreLot(regles?.titre, lot!);
    telechargerCsv(`attachement-${lot!.numero ?? 'brouillon'}-${marche?.code ?? ''}.csv`, [
      [titre],
      [],
      ['N° prix', 'Désignation', 'Unité', 'Quantité du marché', 'Antérieur', 'Ce lot', 'Cumul', '% du marché'],
      ...recapUtile.map((r) => [
        r.prix_numero, r.prix_designation, r.unite, r.quantite_marche, r.quantite_anterieure, r.quantite_lot, r.quantite_cumulee, r.pourcentage_marche,
      ]),
      [],
      ['N° fuite', 'Référence', 'Secteur', 'Réparée le', 'Réfection le', 'L', 'l', 'P', 'N° prix', 'Unité', 'Quantité', 'Nature', 'Désignation / motif'],
      ...lignes.map((l) => [
        l.fuite_numero, l.reference_srm, l.secteur, dateSeule(l.reparee_le), dateSeule(l.refectionnee_le),
        l.fouille_longueur_m, l.fouille_largeur_m, l.fouille_profondeur_m, l.prix_numero, l.unite, l.quantite,
        l.regularisation ? `Régularisation du lot ${l.lot_precedent}` : NATURES_LIGNE[l.nature], l.designation ?? l.motif,
      ]),
    ]);
  }

  return (
    <>
      <p><Link href="/attachements">← Attachements</Link></p>
      <section className="carte">
        <div className="fuite-tete">
          <h1>{titreLot(regles?.titre, lot)}</h1>
          <span className={`badge ${brouillon ? 'st-detectee' : 'st-achevee'}`}>
            {brouillon ? (lot.numero != null ? 'Rouvert (brouillon)' : 'Brouillon : projet non définitif') : 'Arrêté'}
          </span>
        </div>
        {lot.motif_reouverture && <p className="discret">Rouvert le {dateSeule(lot.rouvert_le)} : {lot.motif_reouverture}</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        {info && <p className="info">{info}</p>}
        <div className="actions">
          {peut('exports', 'lire') && <button onClick={exporterCsv}>Exporter (Excel){brouillon ? ' : projet' : ''}</button>}
          {brouillon && peut('attachements', 'valider') && (
            <button className="primaire" disabled={occupe || lignes.length === 0} onClick={arreter}>Arrêter le lot (définitif)</button>
          )}
          {brouillon && lot.numero == null && peut('attachements', 'supprimer') && (
            <button className="danger" disabled={occupe} onClick={supprimerBrouillon}>Supprimer le brouillon</button>
          )}
          {!brouillon && estAdmin && lot.numero === dernierNumero && (
            <button className="danger" disabled={occupe} onClick={rouvrir}>Rouvrir (administrateur)</button>
          )}
        </div>
      </section>

      {brouillon ? (
        <EnTeteBrouillon lot={lot} os={os} zones={zones} modifiable={modifiable} regles={regles} enregistrer={(v) => executer(() => getSupabase().from('attachements').update(v).eq('id', lot.id), 'En-tête enregistré.')} />
      ) : (
        <SuiviLot lot={lot} os={os} zones={zones} modifiable={peut('attachements', 'modifier')} enregistrer={(v) => executer(() => getSupabase().from('attachements').update(v).eq('id', lot.id), 'Suivi enregistré.')} />
      )}

      <section className="carte">
        <h2>Récapitulatif par article</h2>
        <div className="defilement">
          <table>
            <thead>
              <tr>
                <th>N°</th><th>Désignation</th><th>Unité</th><th>Qté marché</th><th>Antérieur</th><th>Ce lot</th><th>Cumul</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {recapUtile.map((r) => (
                <tr key={r.prix_id} className={r.quantite_lot !== 0 ? 'ligne-active' : 'discret'}>
                  <td>{r.prix_numero}</td>
                  <td><span className="designation">{r.prix_designation}</span></td>
                  <td>{r.unite}</td>
                  <td>{quantite(r.quantite_marche, r.unite, dec)}</td>
                  <td>{quantite(r.quantite_anterieure, r.unite, dec)}</td>
                  <td><strong>{quantite(r.quantite_lot, r.unite, dec)}</strong></td>
                  <td>{quantite(r.quantite_cumulee, r.unite, dec)}</td>
                  <td className={r.pourcentage_marche != null && r.pourcentage_marche > 100 ? 'erreur' : ''}>
                    {r.pourcentage_marche != null ? `${r.pourcentage_marche.toLocaleString('fr-FR')} %` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="carte">
        <div className="barre">
          <h2>Travaux du lot <span className="discret">({fuitesDuLot.size} fuite{fuitesDuLot.size > 1 ? 's' : ''}, {lignes.length} ligne{lignes.length > 1 ? 's' : ''})</span></h2>
          {modifiable && (
            <span className="actions">
              <button onClick={() => setFormulaire(formulaire === 'libre' ? '' : 'libre')}>+ Ligne libre</button>
              {estAdmin && <button onClick={() => setFormulaire(formulaire === 'forcage' ? '' : 'forcage')}>+ Refacturation forcée</button>}
            </span>
          )}
        </div>
        {formulaire === 'libre' && (
          <FormLigneLibre articles={articles} marcheId={marcheId!} lotId={lot.id} annuler={() => setFormulaire('')}
            fini={() => { setFormulaire(''); rafraichir(); }} onErreur={setErreur} />
        )}
        {formulaire === 'forcage' && (
          <FormForcage articles={articles} marcheId={marcheId!} lotId={lot.id} annuler={() => setFormulaire('')}
            fini={() => { setFormulaire(''); rafraichir(); }} onErreur={setErreur} />
        )}
        {negatives > 0 && <p className="carte attention">{negatives} régularisation(s) négative(s) : quantité attachée en trop dans un lot précédent, déduite ici.</p>}
        {lignes.length === 0 && <p className="discret">Aucun travail dans ce lot. {modifiable ? 'Cochez des travaux ci-dessous.' : ''}</p>}
        {groupes.map((g) => {
          const t = g[0];
          const refectionAttendue = modifiable && regles?.refection_anticipee && t.fuite_id && !t.refectionnee_le
            && !g.some((l) => l.nature === 'anticipation');
          return (
            <div key={t.fuite_id ?? t.id} className="bloc">
              <div className="ligne-param">
                <span>
                  {t.fuite_id ? (
                    <>
                      <strong>Fuite N° {t.fuite_numero}</strong>
                      {t.reference_srm ? ` · ${t.reference_srm}` : ''}{t.secteur ? ` · ${t.secteur}` : ''}
                      <br />
                      <span className="discret">
                        Réparée le {dateSeule(t.reparee_le)}
                        {t.fouille_longueur_m != null ? ` · fouille ${t.fouille_longueur_m} × ${t.fouille_largeur_m} × ${t.fouille_profondeur_m} m` : ''}
                        {' · '}{t.refectionnee_le ? `réfection le ${dateSeule(t.refectionnee_le)}` : 'réfection non faite'}
                      </span>
                    </>
                  ) : (
                    <strong>{NATURES_LIGNE[t.nature]} · {t.designation}</strong>
                  )}
                </span>
                {modifiable && (
                  <span className="actions">
                    {refectionAttendue && <button onClick={() => setAnticipation(anticipation === t.fuite_id ? null : t.fuite_id)}>Réfection anticipée</button>}
                    <button onClick={() => retirer(g.map((l) => l.id))}>Retirer</button>
                  </span>
                )}
              </div>
              {anticipation === t.fuite_id && t.fuite_id && (
                <FormAnticipation
                  articles={articles.filter((a) => prixRefection.has(a.id))}
                  prixPropose={t.prix_refection_prevu}
                  quantiteProposee={t.fouille_longueur_m != null && t.fouille_largeur_m != null ? Math.round(t.fouille_longueur_m * t.fouille_largeur_m * 1000) / 1000 : null}
                  marcheId={marcheId!} lotId={lot.id} fuiteId={t.fuite_id}
                  annuler={() => setAnticipation(null)} fini={() => { setAnticipation(null); rafraichir(); }} onErreur={setErreur}
                />
              )}
              <table>
                <tbody>
                  {g.map((l) => (
                    <tr key={l.id}>
                      <td>Prix {l.prix_numero}</td>
                      <td>
                        <strong>{quantite(l.quantite, l.unite, dec)}</strong> {l.unite}
                        {brouillon && l.nature === 'solde' ? <span className="discret"> (en direct)</span> : null}
                      </td>
                      <td>
                        {l.regularisation && <span className={`etiquette ${l.quantite < 0 ? 'etiquette-alerte' : ''}`}>Régularisation du lot {l.lot_precedent}</span>}
                        {l.nature !== 'solde' && l.fuite_id && <span className="etiquette">{NATURES_LIGNE[l.nature]}</span>}
                        {l.motif && <span className="discret"> {l.motif}</span>}
                      </td>
                      {modifiable && g.length > 1 && (
                        <td><button onClick={() => retirer([l.id])} aria-label={`Retirer le prix ${l.prix_numero}`}>×</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {modifiable && regles && (
        <AAttacher marcheId={marcheId!} lotId={lot.id} regles={regles} zones={zones} version={version} ajoute={rafraichir} onErreur={setErreur} />
      )}
    </>
  );
}

function EnTeteBrouillon({
  lot, os, zones, modifiable, regles, enregistrer,
}: {
  lot: Lot; os: Os[]; zones: Zone[]; modifiable: boolean; regles: ReglesAttachement | null;
  enregistrer: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [intitule, setIntitule] = useState(lot.intitule ?? '');
  const [dateArret, setDateArret] = useState(lot.date_arret ?? '');
  const [debut, setDebut] = useState(lot.periode_debut ?? '');
  const [fin, setFin] = useState(lot.periode_fin ?? '');
  const [zoneId, setZoneId] = useState(lot.zone_id ?? '');
  const [lieu, setLieu] = useState(lot.lieu_travaux ?? '');
  const [osId, setOsId] = useState(lot.os_id ?? '');
  const [observation, setObservation] = useState(lot.observation ?? '');
  const obligatoire = (m: string) => (regles?.mentions_obligatoires.includes(m) ? ' *' : '');

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    enregistrer({
      intitule: intitule.trim() || null, date_arret: dateArret || null, periode_debut: debut || null, periode_fin: fin || null,
      zone_id: zoneId || null, lieu_travaux: lieu.trim() || null, os_id: osId || null, observation: observation.trim() || null,
    });
  };

  return (
    <form className="carte" onSubmit={soumettre}>
      <h2>En-tête et mentions</h2>
      <div className="deux">
        <label>Intitulé<input value={intitule} disabled={!modifiable} onChange={(e) => setIntitule(e.target.value)} /></label>
        <label>Travaux exécutés au *<input type="date" value={dateArret} disabled={!modifiable} onChange={(e) => setDateArret(e.target.value)} /></label>
        <label>Période du (facultatif)<input type="date" value={debut} disabled={!modifiable} onChange={(e) => setDebut(e.target.value)} /></label>
        <label>au<input type="date" value={fin} disabled={!modifiable} onChange={(e) => setFin(e.target.value)} /></label>
        <label>
          Ordre de service{obligatoire('ordre_service')}
          <select value={osId} disabled={!modifiable} onChange={(e) => setOsId(e.target.value)}>
            <option value="">—</option>
            {os.map((o) => <option key={o.id} value={o.id}>OS n° {o.numero} du {dateSeule(o.date_os)}</option>)}
          </select>
        </label>
        <label>
          Zone{obligatoire('zone')}
          <select value={zoneId} disabled={!modifiable} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">Toutes zones</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.libelle}</option>)}
          </select>
        </label>
        <label className="pleine-largeur">
          Lieu exact des travaux (début et fin){obligatoire('lieu_travaux')}
          <textarea rows={2} value={lieu} disabled={!modifiable} onChange={(e) => setLieu(e.target.value)} placeholder="Ex. secteurs Andalous et Qods Bas, de la rue X à la rue Y" />
        </label>
        <label className="pleine-largeur">
          Observation{obligatoire('observation')}
          <textarea rows={2} value={observation} disabled={!modifiable} onChange={(e) => setObservation(e.target.value)} />
        </label>
      </div>
      {modifiable && <div className="actions"><button className="primaire">Enregistrer l&apos;en-tête</button></div>}
    </form>
  );
}

function SuiviLot({
  lot, os, zones, modifiable, enregistrer,
}: {
  lot: Lot; os: Os[]; zones: Zone[]; modifiable: boolean; enregistrer: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [accepteLe, setAccepteLe] = useState(lot.accepte_le ?? '');
  const [acceptePar, setAcceptePar] = useState(lot.accepte_par ?? '');
  const [facture, setFacture] = useState(lot.reference_facture ?? '');
  const [factureLe, setFactureLe] = useState(lot.facture_le ?? '');
  const [observation, setObservation] = useState(lot.observation ?? '');
  const o = os.find((x) => x.id === lot.os_id);
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    enregistrer({
      accepte_le: accepteLe || null, accepte_par: acceptePar.trim() || null,
      reference_facture: facture.trim() || null, facture_le: factureLe || null, observation: observation.trim() || null,
    });
  };
  return (
    <form className="carte" onSubmit={soumettre}>
      <h2>En-tête (figé) et suivi</h2>
      <dl className="infos">
        <dt>Travaux exécutés au</dt><dd>{dateSeule(lot.date_arret)}</dd>
        <dt>Ordre de service</dt><dd>{o ? `OS n° ${o.numero} du ${dateSeule(o.date_os)}` : '—'}</dd>
        <dt>Zone</dt><dd>{zones.find((z) => z.id === lot.zone_id)?.libelle ?? 'Toutes zones'}</dd>
        <dt>Lieu des travaux</dt><dd>{lot.lieu_travaux ?? '—'}</dd>
        <dt>Arrêté le</dt><dd>{dateSeule(lot.arrete_le)}</dd>
      </dl>
      <p className="discret">Suivi seulement : l&apos;appli ne calcule ni facture ni décompte.</p>
      <div className="deux">
        <label>Accepté par le maître d&apos;ouvrage le<input type="date" value={accepteLe} disabled={!modifiable} onChange={(e) => setAccepteLe(e.target.value)} /></label>
        <label>Accepté par<input value={acceptePar} disabled={!modifiable} onChange={(e) => setAcceptePar(e.target.value)} /></label>
        <label>Référence de la facture ou du décompte<input value={facture} disabled={!modifiable} onChange={(e) => setFacture(e.target.value)} /></label>
        <label>Facturé le<input type="date" value={factureLe} disabled={!modifiable} onChange={(e) => setFactureLe(e.target.value)} /></label>
        <label className="pleine-largeur">Observation<textarea rows={2} value={observation} disabled={!modifiable} onChange={(e) => setObservation(e.target.value)} /></label>
      </div>
      {modifiable && <div className="actions"><button className="primaire">Enregistrer le suivi</button></div>}
    </form>
  );
}
