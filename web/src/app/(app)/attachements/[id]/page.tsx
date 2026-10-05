'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  NATURES_LIGNE, intituleMensuel, quantite, titreLot, type LigneLot, type Lot, type Recap, type ReglesAttachement,
} from '@/lib/attachements';
import { dateSeule, messageErreur } from '@/lib/format';
import { PanneauExport } from '@/lib/export/PanneauExport';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import { BadgeControles } from '../BadgeControles';
import { useControles } from '../useControles';
import { AAttacher, LienFuite } from './AAttacher';
import { CorrectionsFuite } from './CorrectionsFuite';
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
  const [correction, setCorrection] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [exportOuvert, setExportOuvert] = useState(false);
  // Valeurs de l'en-tête en cours de saisie (pas encore enregistrées) : le titre les suit en direct.
  const [apercu, setApercu] = useState<EnTete | null>(null);
  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const lignesLot = lireTout<LigneLot>((de, a) =>
      sb.from('v_attachement_lignes').select('*').eq('attachement_id', id)
        .order('fuite_numero', { nullsFirst: false }).order('prix_ordre').order('id').range(de, a))
      .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error }));
    const [l, li, rc, rg, o, z, p, n, dn] = await Promise.all([
      sb.from('attachements').select('*').eq('id', id).maybeSingle(),
      lignesLot,
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
  // Contrôles de cohérence (lot R), relus à chaque changement du lot
  const { parFuite: controles, erreur: erreurControles } = useControles(marcheId, version);

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
  const fuitesEnDefaut = [...fuitesDuLot].filter((f) => f && controles.has(f)).length;
  const peutCorriger = modifiable && (peut('quantites', 'modifier') || peut('quantites', 'creer') || peut('interventions', 'creer'));
  const unitesLot = new Set(lignes.filter((l) => l.fuite_id && (l.nature === 'solde' || l.nature === 'anticipation'))
    .map((l) => `${l.fuite_id}|${l.prix_id}`));
  const negatives = lignes.filter((l) => l.quantite < 0).length;
  const lotAffiche = {
    ...lot,
    ...(brouillon && apercu ? apercu : {}),
    numero_prevu: lot.numero == null ? (dernierNumero ?? 0) + 1 : null,
  };
  const enTeteModifie = brouillon && !!apercu
    && (Object.keys(apercu) as (keyof EnTete)[]).some((k) => (apercu[k] ?? null) !== (lot[k] ?? null));

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
    if (enTeteModifie) {
      setErreur('Enregistrez d\'abord l\'en-tête : le lot est arrêté avec les mentions enregistrées.');
      return;
    }
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

  return (
    <>
      <p><Link href="/attachements">← Attachements</Link></p>
      <section className="carte">
        <div className="fuite-tete">
          <h1>{titreLot(regles?.titre, lotAffiche)}</h1>
          <span className={`badge ${brouillon ? 'st-encours' : 'st-achevee'}`}>
            {brouillon ? (lot.numero != null ? 'Rouvert (brouillon)' : 'Brouillon : projet non définitif') : 'Arrêté'}
          </span>
        </div>
        {enTeteModifie && <p className="carte attention">En-tête modifié, pas encore enregistré : le titre montre la saisie en cours.</p>}
        {lot.motif_reouverture && <p className="discret">Rouvert le {dateSeule(lot.rouvert_le)} : {lot.motif_reouverture}</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        {info && <p className="info">{info}</p>}
        <div className="actions">
          {peut('exports', 'lire') && <button onClick={() => setExportOuvert(true)}>Exporter{brouillon ? ' (projet)' : ''}</button>}
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

      <PanneauExport
        ouvert={exportOuvert}
        fermer={() => setExportOuvert(false)}
        attachement={{ lot: lotAffiche, lignes, recap, zone: zones.find((z) => z.id === lotAffiche.zone_id)?.libelle ?? null }}
      />

      {brouillon ? (
        <EnTeteBrouillon key={lot.id} lot={lot} os={os} zones={zones} modifiable={modifiable} regles={regles} onApercu={setApercu} enregistrer={(v) => executer(() => getSupabase().from('attachements').update(v).eq('id', lot.id), 'En-tête enregistré.')} />
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
        {fuitesEnDefaut > 0 && (
          <p className="carte attention">
            {fuitesEnDefaut} fuite{fuitesEnDefaut > 1 ? 's' : ''} du lot avec des contrôles en défaut (colonne « Contrôles » : oublis
            probables, lignes incohérentes, travaux hors bordereau).{peutCorriger ? ' « Corriger » ouvre le détail et les corrections.' : ''}
          </p>
        )}
        {erreurControles && <p className="discret">{erreurControles}</p>}
        {lignes.length === 0 && <p className="discret">Aucun travail dans ce lot. {modifiable ? 'Cochez des travaux ci-dessous.' : ''}</p>}
        {lignes.length > 0 && (
          <>
            {brouillon && <p className="discret">Quantités « au solde » suivies en direct jusqu&apos;à l&apos;arrêt. N° de fuite : fiche complète (photos, réparations) dans un nouvel onglet.</p>}
            <div className="defilement">
              <table className="liste-compacte">
                <thead>
                  <tr>
                    <th>Fuite</th><th>Contrôles</th><th>Référence</th><th>Secteur</th><th>Réparée le</th><th>Fouille L × l × p (m)</th><th>Réfection</th>
                    <th>Lignes du lot</th>{modifiable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((g, i) => {
                    const t = g[0];
                    const refectionAttendue = modifiable && regles?.refection_anticipee && t.fuite_id && !t.refectionnee_le
                      && !g.some((l) => l.nature === 'anticipation');
                    const zebre = i % 2 === 1 ? 'zebre' : '';
                    return (
                      <Fragment key={t.fuite_id ?? t.id}>
                        <tr className={zebre}>
                          {t.fuite_id ? (
                            <>
                              <td className="nowrap"><LienFuite id={t.fuite_id} numero={t.fuite_numero} /></td>
                              <td><BadgeControles liste={controles.get(t.fuite_id)} /></td>
                              <td className="nowrap">{t.reference_srm ?? '—'}</td>
                              <td>{t.secteur ?? '—'}</td>
                              <td className="nowrap">{dateSeule(t.reparee_le)}</td>
                              <td className="nowrap">
                                {t.fouille_longueur_m != null
                                  ? [t.fouille_longueur_m, t.fouille_largeur_m, t.fouille_profondeur_m].map((x) => (x == null ? '?' : x.toLocaleString('fr-FR'))).join(' × ')
                                  : '—'}
                              </td>
                              <td className="nowrap">{t.refectionnee_le ? dateSeule(t.refectionnee_le) : <span className="discret">non faite</span>}</td>
                            </>
                          ) : (
                            <td colSpan={7}><strong>{NATURES_LIGNE[t.nature]}</strong> · {t.designation}</td>
                          )}
                          <td>
                            <div className="unites-ligne">
                              {g.map((l) => (
                                <span key={l.id} className="unite-ligne">
                                  P{l.prix_numero} <strong>{quantite(l.quantite, l.unite, dec)}</strong> {l.unite}
                                  {l.regularisation && (
                                    <span className={`etiquette ${l.quantite < 0 ? 'etiquette-alerte' : ''}`}>Régul. lot {l.lot_precedent}</span>
                                  )}
                                  {l.nature !== 'solde' && l.fuite_id && <span className="etiquette">{NATURES_LIGNE[l.nature]}</span>}
                                  {l.motif && <span className="discret" title={l.motif}>{l.motif.length > 40 ? `${l.motif.slice(0, 40)}…` : l.motif}</span>}
                                  {modifiable && g.length > 1 && (
                                    <button className="petit" onClick={() => retirer([l.id])} aria-label={`Retirer le prix ${l.prix_numero}`}>×</button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </td>
                          {modifiable && (
                            <td className="nowrap">
                              {refectionAttendue && (
                                <button className="petit" onClick={() => setAnticipation(anticipation === t.fuite_id ? null : t.fuite_id)}>Réfection anticipée</button>
                              )}
                              {peutCorriger && t.fuite_id && (
                                <button className="petit" onClick={() => setCorrection(correction === t.fuite_id ? null : t.fuite_id)}>
                                  {correction === t.fuite_id ? 'Fermer' : 'Corriger'}
                                </button>
                              )}
                              <button className="petit" onClick={() => retirer(g.map((l) => l.id))}>Retirer</button>
                            </td>
                          )}
                        </tr>
                        {correction === t.fuite_id && t.fuite_id && (
                          <tr className={zebre}>
                            <td colSpan={modifiable ? 9 : 8}>
                              <CorrectionsFuite
                                marcheId={marcheId!} fuiteId={t.fuite_id} fuiteNumero={t.fuite_numero}
                                controles={controles.get(t.fuite_id) ?? []} articles={articles}
                                lot={{ id: lot.id, unites: unitesLot }}
                                fermer={() => setCorrection(null)} corrige={rafraichir}
                              />
                            </td>
                          </tr>
                        )}
                        {anticipation === t.fuite_id && t.fuite_id && (
                          <tr className={zebre}>
                            <td colSpan={modifiable ? 9 : 8}>
                              <FormAnticipation
                                articles={articles.filter((a) => prixRefection.has(a.id))}
                                prixPropose={t.prix_refection_prevu}
                                quantiteProposee={t.fouille_longueur_m != null && t.fouille_largeur_m != null ? Math.round(t.fouille_longueur_m * t.fouille_largeur_m * 1000) / 1000 : null}
                                marcheId={marcheId!} lotId={lot.id} fuiteId={t.fuite_id}
                                annuler={() => setAnticipation(null)} fini={() => { setAnticipation(null); rafraichir(); }} onErreur={setErreur}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {modifiable && regles && (
        <AAttacher
          marcheId={marcheId!} lotId={lot.id} regles={regles} zones={zones} version={version} ajoute={rafraichir} onErreur={setErreur}
          controles={controles} bordereau={articles} peutCorriger={peutCorriger}
        />
      )}
    </>
  );
}

type EnTete = Pick<Lot, 'intitule' | 'date_arret' | 'periode_debut' | 'periode_fin' | 'zone_id' | 'lieu_travaux' | 'os_id' | 'observation'>;

function EnTeteBrouillon({
  lot, os, zones, modifiable, regles, onApercu, enregistrer,
}: {
  lot: Lot; os: Os[]; zones: Zone[]; modifiable: boolean; regles: ReglesAttachement | null;
  onApercu: (v: EnTete) => void;
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
  const valeurs: EnTete = {
    intitule: intitule.trim() || null, date_arret: dateArret || null, periode_debut: debut || null, periode_fin: fin || null,
    zone_id: zoneId || null, lieu_travaux: lieu.trim() || null, os_id: osId || null, observation: observation.trim() || null,
  };
  const cleValeurs = JSON.stringify(valeurs);
  useEffect(() => {
    onApercu(JSON.parse(cleValeurs) as EnTete);
  }, [cleValeurs, onApercu]);

  // L'intitulé proposé (« Attachement d'octobre 2026 ») suit le mois de la date, tant qu'il n'a pas été réécrit.
  const changerDate = (nouvelle: string) => {
    if (intitule.trim() === intituleMensuel(dateArret || undefined) && nouvelle) setIntitule(intituleMensuel(nouvelle));
    setDateArret(nouvelle);
  };

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    enregistrer(valeurs);
  };

  return (
    <form className="carte" onSubmit={soumettre}>
      <h2>En-tête et mentions</h2>
      <div className="deux">
        <label>Intitulé<input value={intitule} disabled={!modifiable} onChange={(e) => setIntitule(e.target.value)} /></label>
        <label>Travaux exécutés au *<input type="date" value={dateArret} disabled={!modifiable} onChange={(e) => changerDate(e.target.value)} /></label>
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
