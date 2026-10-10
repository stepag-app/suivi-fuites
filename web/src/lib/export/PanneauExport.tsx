'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LigneLot, Lot, Recap, ReglesAttachement } from '@/lib/attachements';
import { messageErreur } from '@/lib/format';
import { chargerLogosEntete } from '@/lib/logos';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { FORMATS, exporter, type FormatExport } from './generer';
import {
  PERIODES, REGROUPEMENTS, colonnesAttachement, documentAttachement, documentJeu,
  type Contexte, type Filtres, type Jeu, type JeuId, type Periode,
} from './jeux';
import { chargerMatricules } from './matricules';
import { construireSection, parcourir, texteCellule, type Colonne, type Ligne } from './modele';
import { estModeleRubriques } from './rubriques';

interface Modele {
  id: string; nom: string; jeu: JeuId; colonnes: string[]; regroupement: string;
  filtres: Partial<Filtres>; format: FormatExport; orientation: 'portrait' | 'paysage';
}
interface Choix { id: string; libelle: string }

// Chefs d'équipe du marché (l'équipe, c'est le compte du chef d'équipe : S12) : comptes actifs au rôle chef_reparation.
async function chargerChefs(marcheId: string): Promise<Choix[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from('affectations').select('profil_id, roles').eq('marche_id', marcheId).eq('actif', true);
  if (error) return [];
  const ids = ((data as { profil_id: string; roles: string[] | null }[] | null) ?? [])
    .filter((a) => a.roles?.includes('chef_reparation')).map((a) => a.profil_id);
  if (!ids.length) return [];
  const p = await sb.from('profils').select('id, nom_complet').in('id', ids).eq('actif', true);
  return ((p.data as { id: string; nom_complet: string }[] | null) ?? [])
    .map((x) => ({ id: x.id, libelle: x.nom_complet }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

const APERCU = 5;

export function PanneauExport({
  ouvert, fermer, jeux = [], filtreListe, descriptionListe, attachement,
}: {
  ouvert: boolean;
  fermer: () => void;
  jeux?: Jeu[];
  filtreListe?: (l: Ligne) => boolean;
  descriptionListe?: string;
  attachement?: { lot: Lot; lignes: LigneLot[]; recap: Recap[]; zone?: string | null };
}) {
  const { marche, peut } = useSession();
  const marcheId = marche?.id;
  const [ctx, setCtx] = useState<Contexte | null>(null);
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [zones, setZones] = useState<Choix[]>([]);
  const [secteurs, setSecteurs] = useState<Choix[]>([]);
  const [chefs, setChefs] = useState<Choix[]>([]);
  const [jeuId, setJeuId] = useState<JeuId>(attachement ? 'attachement' : jeux[0]?.id ?? 'fuites');
  const [modeleId, setModeleId] = useState('');
  const [colonnes, setColonnes] = useState<Set<string>>(new Set());
  const [regroupement, setRegroupement] = useState('aucun');
  const [filtres, setFiltres] = useState<Filtres>({ periode: 'tout' });
  const [format, setFormat] = useState<FormatExport>('xlsx');
  const [orientation, setOrientation] = useState<'portrait' | 'paysage'>(attachement ? 'portrait' : 'paysage');
  const [limiterListe, setLimiterListe] = useState(true);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [occupe, setOccupe] = useState(false);
  const initialise = useRef(false);

  const jeu = jeux.find((j) => j.id === jeuId);
  const toutesColonnes: Colonne[] = useMemo(() => {
    if (!ctx) return [];
    if (jeuId === 'attachement') {
      const montants = !!ctx.regles?.afficher_prix && ctx.peutMontants;
      return colonnesAttachement(ctx).filter((c) => montants || !['pu_ht', 'montant'].includes(c.cle));
    }
    return jeu?.colonnes(ctx) ?? [];
  }, [ctx, jeu, jeuId]);
  const regroupements: [string, string][] = jeuId === 'attachement'
    ? [['article', 'Par article'], ['zone', 'Par zone'], ['secteur', 'Par secteur'], ['chef', "Par chef d'équipe"], ['aucun', 'Aucun']]
    : jeu?.regroupements ?? [['aucun', 'Aucun']];

  // Contexte du marché (fiche, OS, règles), modèles et listes de filtres : une fois par ouverture.
  const chargerContexte = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [m, o, r, mo, z, s, e] = await Promise.all([
      sb.from('marches').select('*').eq('id', marcheId).maybeSingle(),
      sb.from('ordres_service').select('id, numero, date_os').eq('marche_id', marcheId).order('date_os'),
      sb.from('parametres_attachement').select('*').eq('marche_id', marcheId).maybeSingle(),
      sb.from('modeles_export').select('id, nom, jeu, colonnes, regroupement, filtres, format, orientation')
        .eq('marche_id', marcheId).eq('actif', true).order('ordre').order('nom'),
      sb.from('zones').select('id, libelle').eq('marche_id', marcheId).order('numero'),
      sb.from('secteurs').select('id, libelle').eq('marche_id', marcheId).order('libelle'),
      chargerChefs(marcheId),
    ]);
    const premiere = m.error || o.error;
    if (premiere) setErreur(messageErreur(premiere));
    const fiche = (m.data as Record<string, unknown> | null) ?? {};
    const os = (o.data as { id: string; numero: string; date_os: string }[] | null) ?? [];
    setCtx({
      marche: fiche,
      os,
      osCommencement: os.find((x) => x.id === fiche.os_commencement_id) ?? null,
      regles: (r.data as ReglesAttachement | null) ?? null,
      peutMontants: peut('quantites', 'lire'),
      logos: await chargerLogosEntete(fiche),
    });
    setModeles(((mo.data as Modele[] | null) ?? []).filter((m) => !estModeleRubriques(m)));
    setZones((z.data as Choix[] | null) ?? []);
    setSecteurs((s.data as Choix[] | null) ?? []);
    setChefs(e);
  }, [marcheId, peut]);

  useEffect(() => {
    if (ouvert && !ctx) chargerContexte();
  }, [ouvert, ctx, chargerContexte]);

  const modelesDisponibles = modeles.filter((m) => m.jeu === jeuId || (!attachement && jeux.some((j) => j.id === m.jeu)));

  function appliquerModele(m: Modele) {
    setModeleId(m.id);
    setJeuId(m.jeu);
    setColonnes(new Set(m.colonnes));
    setRegroupement(m.regroupement);
    setFiltres({ periode: 'tout', ...m.filtres });
    setFormat(m.format);
    setOrientation(m.orientation);
    setInfo('');
  }

  // Valeurs initiales : premier modèle du jeu, sinon colonnes par défaut.
  useEffect(() => {
    if (!ctx || initialise.current) return;
    initialise.current = true;
    const m = modeles.find((x) => x.jeu === jeuId);
    if (m && !(filtreListe && jeuId === 'fuites')) {
      appliquerModele(m);
      return;
    }
    if (jeuId === 'attachement') {
      const r = ctx.regles?.regroupement ?? 'poste';
      setRegroupement(r === 'poste' ? 'article' : r);
      const defaut = modeles.find((x) => x.jeu === 'attachement');
      setColonnes(new Set(defaut?.colonnes ?? colonnesAttachement(ctx).map((c) => c.cle)));
      if (defaut) setFormat(defaut.format);
    } else if (jeu) {
      setColonnes(new Set(jeu.colonnesDefaut));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, modeles]);

  function changerJeu(id: JeuId) {
    setJeuId(id);
    setModeleId('');
    const j = jeux.find((x) => x.id === id);
    if (j) setColonnes(new Set(j.colonnesDefaut));
    setRegroupement('aucun');
    setFiltres((f) => ({ ...f, synthese: false }));
  }

  // Chargement des lignes (aperçu et export) quand le jeu ou les filtres changent.
  useEffect(() => {
    if (!ouvert || !marcheId || !jeu || jeuId === 'attachement') return;
    let annule = false;
    setLignes(null);
    const minuterie = setTimeout(async () => {
      try {
        const l = await jeu.charger(marcheId, filtres);
        if (!annule) setLignes(l);
      } catch (e) {
        if (!annule) {
          setErreur(messageErreur(e));
          setLignes([]);
        }
      }
    }, 250);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [ouvert, marcheId, jeu, jeuId, filtres]);

  const lignesRetenues = useMemo(() => {
    if (jeuId === 'attachement') return (attachement?.lignes ?? []) as unknown as Ligne[];
    if (!lignes) return null;
    return filtreListe && jeuId === 'fuites' && limiterListe ? lignes.filter(filtreListe) : lignes;
  }, [lignes, filtreListe, jeuId, limiterListe, attachement]);

  const groupes = useMemo(() => {
    const m = new Map<string, Colonne[]>();
    toutesColonnes.forEach((c) => m.set(c.groupe, [...(m.get(c.groupe) ?? []), c]));
    return [...m.entries()];
  }, [toutesColonnes]);

  const basculer = (cles: string[], coche: boolean) =>
    setColonnes((s) => {
      const n = new Set(s);
      cles.forEach((k) => (coche ? n.add(k) : n.delete(k)));
      return n;
    });

  const ordreColonnes = toutesColonnes.map((c) => c.cle).filter((k) => colonnes.has(k));

  const apercu = useMemo(() => {
    if (!lignesRetenues || !ctx) return null;
    const cols = toutesColonnes.filter((c) => colonnes.has(c.cle)).slice(0, 8);
    return construireSection(lignesRetenues.slice(0, APERCU), cols, { decimales: ctx.regles?.decimales, total: false });
  }, [lignesRetenues, ctx, toutesColonnes, colonnes]);

  async function telecharger() {
    if (!ctx || !lignesRetenues) return;
    setErreur('');
    setInfo('');
    setOccupe(true);
    try {
      // R4 : chef d'équipe désigné par son matricule dans l'attachement
      const matricules = jeuId === 'attachement' && attachement && marcheId ? await chargerMatricules(marcheId) : null;
      const d = jeuId === 'attachement' && attachement
        ? documentAttachement(attachement.lot, attachement.lignes.map((l) => ({
            ...l, chef_equipe: matricules && l.chef_equipe_id ? matricules.agent(l.chef_equipe_id, l.chef_equipe) : l.chef_equipe,
          })), attachement.recap, ctx, {
            colonnes: ordreColonnes, regroupement, orientation, zone: attachement.zone,
          })
        : documentJeu(jeu!, lignesRetenues, ctx, {
            colonnes: ordreColonnes, regroupement, filtres, orientation,
            infos: filtreListe && jeuId === 'fuites' && limiterListe && descriptionListe ? [descriptionListe] : [],
          });
      await exporter(d, format);
      setInfo('Fichier téléchargé.');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  const reglagesActuels = () => ({
    jeu: jeuId, colonnes: ordreColonnes, regroupement, format, orientation,
    filtres: { periode: filtres.periode, ...(filtres.periode === 'libre' ? { du: filtres.du, au: filtres.au } : {}), ...(filtres.synthese ? { synthese: true } : {}) },
  });

  async function enregistrerModele(remplacer: boolean) {
    if (!marcheId) return;
    const courant = modeles.find((m) => m.id === modeleId);
    const nom = remplacer && courant ? courant.nom : window.prompt('Nom du modèle (ex. « Réparations de la semaine ») :')?.trim();
    if (!nom) return;
    const sb = getSupabase();
    const { error } = remplacer && courant
      ? await sb.from('modeles_export').update(reglagesActuels()).eq('id', courant.id)
      : await sb.from('modeles_export').insert({ ...reglagesActuels(), marche_id: marcheId, nom, ordre: 50 + modeles.length });
    if (error) {
      setErreur(error.code === '23505' ? 'Un modèle porte déjà ce nom.' : messageErreur(error));
      return;
    }
    await chargerContexte();
    setInfo(remplacer ? 'Modèle mis à jour.' : `Modèle « ${nom} » enregistré.`);
  }

  async function retirerModele() {
    const courant = modeles.find((m) => m.id === modeleId);
    if (!courant || !window.confirm(`Retirer le modèle « ${courant.nom} » ?`)) return;
    const { error } = await getSupabase().from('modeles_export').update({ actif: false }).eq('id', courant.id);
    if (error) setErreur(messageErreur(error));
    setModeleId('');
    await chargerContexte();
  }

  if (!ouvert) return null;
  const choixFiltre = (liste: Choix[], valeur: string | undefined, cle: 'zone' | 'secteur' | 'chef', libelle: string, tous: string) => (
    <label>
      {libelle}
      <select value={valeur ?? ''} onChange={(e) => setFiltres({ ...filtres, [cle]: e.target.value || undefined })}>
        <option value="">{tous}</option>
        {liste.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}
      </select>
    </label>
  );

  return (
    <aside className="panneau-export ancien" role="dialog" aria-label="Exporter">
      <div className="barre">
        <h2>Exporter</h2>
        <button onClick={fermer} aria-label="Fermer le panneau d'export">Fermer</button>
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="info">{info}</p>}
      {!ctx && <p className="discret">Chargement…</p>}

      {ctx && (
        <>
          {modelesDisponibles.length > 0 && (
            <label>
              Modèle enregistré
              <select value={modeleId} onChange={(e) => {
                const m = modeles.find((x) => x.id === e.target.value);
                if (m) appliquerModele(m);
                else setModeleId('');
              }}>
                <option value="">— Réglages libres —</option>
                {modelesDisponibles.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </label>
          )}

          {!attachement && jeux.length > 1 && (
            <fieldset>
              <legend>Données</legend>
              <div className="choix-boutons">
                {jeux.map((j) => (
                  <button key={j.id} type="button" className={jeuId === j.id ? 'actif' : ''} onClick={() => changerJeu(j.id)}>{j.libelle}</button>
                ))}
              </div>
            </fieldset>
          )}

          {jeu && jeuId !== 'attachement' && (
            <fieldset>
              <legend>Filtres</legend>
              {filtreListe && jeuId === 'fuites' && (
                <label className="ligne">
                  <input type="checkbox" checked={limiterListe} onChange={(e) => setLimiterListe(e.target.checked)} />
                  Limiter à la liste affichée{descriptionListe ? ` (${descriptionListe.replace(/^Filtres de la liste : /, '')})` : ''}
                </label>
              )}
              {jeu.filtres.includes('periode') && (
                <label>
                  Période{jeu.libellePeriode ? ` (${jeu.libellePeriode})` : ''}
                  <select value={filtres.periode} onChange={(e) => setFiltres({ ...filtres, periode: e.target.value as Periode })}>
                    {Object.entries(PERIODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              )}
              {filtres.periode === 'libre' && (
                <div className="deux">
                  <label>Du<input type="date" value={filtres.du ?? ''} onChange={(e) => setFiltres({ ...filtres, du: e.target.value })} /></label>
                  <label>Au<input type="date" value={filtres.au ?? ''} onChange={(e) => setFiltres({ ...filtres, au: e.target.value })} /></label>
                </div>
              )}
              <div className="deux">
                {jeu.filtres.includes('zone') && choixFiltre(zones, filtres.zone, 'zone', 'Zone', 'Toutes')}
                {jeu.filtres.includes('secteur') && choixFiltre(secteurs, filtres.secteur, 'secteur', 'Secteur', 'Tous')}
                {jeu.filtres.includes('chef') && choixFiltre(chefs, filtres.chef, 'chef', "Chef d'équipe", 'Tous')}
              </div>
              {jeu.filtres.includes('synthese') && (
                <label className="ligne">
                  <input type="checkbox" checked={!!filtres.synthese} onChange={(e) => setFiltres({ ...filtres, synthese: e.target.checked })} />
                  Synthèse : une ligne par pièce (quantités additionnées)
                </label>
              )}
            </fieldset>
          )}

          <fieldset>
            <legend>Colonnes{jeuId === 'attachement' ? ' du détail' : ''}</legend>
            <div className="actions">
              <button type="button" onClick={() => setColonnes(new Set(toutesColonnes.map((c) => c.cle)))}>Tout</button>
              <button type="button" onClick={() => setColonnes(new Set())}>Rien</button>
              <span className="discret">{ordreColonnes.length} / {toutesColonnes.length}</span>
            </div>
            {jeuId === 'attachement' && <p className="discret">Le récapitulatif par article est toujours inclus ; décochez tout pour l&apos;imprimer seul.</p>}
            {groupes.map(([groupe, cols]) => {
              const tous = cols.every((c) => colonnes.has(c.cle));
              return (
                <div key={groupe} className="groupe-colonnes">
                  <label className="ligne titre-groupe">
                    <input type="checkbox" checked={tous} onChange={(e) => basculer(cols.map((c) => c.cle), e.target.checked)} />
                    {groupe}
                  </label>
                  <div className="cases">
                    {cols.map((c) => (
                      <label key={c.cle} className="ligne">
                        <input type="checkbox" checked={colonnes.has(c.cle)} onChange={(e) => basculer([c.cle], e.target.checked)} />
                        {c.titre}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </fieldset>

          <fieldset>
            <legend>Mise en forme</legend>
            <label>
              Regroupement
              <select value={regroupement} onChange={(e) => setRegroupement(e.target.value)}>
                {regroupements.map(([k, v]) => <option key={k} value={k}>{v ?? REGROUPEMENTS[k]}</option>)}
              </select>
            </label>
            <div className="choix-boutons" role="radiogroup" aria-label="Format">
              {(Object.keys(FORMATS) as FormatExport[]).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? 'actif' : ''} onClick={() => setFormat(f)}>
                  {FORMATS[f]}
                </button>
              ))}
            </div>
            {(format === 'pdf' || format === 'docx' || format === 'xlsx') && (
              <div className="choix-boutons" role="radiogroup" aria-label="Orientation">
                {(['portrait', 'paysage'] as const).map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={orientation === o} className={orientation === o ? 'actif' : ''} onClick={() => setOrientation(o)}>
                    {o === 'portrait' ? 'Portrait' : 'Paysage'}
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <section className="apercu-export">
            <h3>
              Aperçu{' '}
              <span className="discret">
                {lignesRetenues == null ? '(chargement…)' : `${lignesRetenues.length} ligne${lignesRetenues.length > 1 ? 's' : ''}${lignesRetenues.length > APERCU ? `, ${APERCU} premières` : ''}`}
              </span>
            </h3>
            {jeuId === 'attachement' && attachement?.lot.statut === 'brouillon' && (
              <p className="erreur">Brouillon : le fichier portera la mention « PROJET ».</p>
            )}
            {apercu && apercu.colonnes.length > 0 && (
              <div className="defilement">
                <table>
                  <thead><tr>{apercu.colonnes.map((c, i) => <th key={i}>{c.titre}</th>)}</tr></thead>
                  <tbody>
                    {[...parcourir(apercu)].map(({ ligne, indexDonnees }, j) => (
                      <tr key={j}>{apercu.colonnes.map((_, i) => <td key={i}>{texteCellule(apercu, ligne, i, indexDonnees)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <button className="primaire gros" disabled={occupe || !lignesRetenues || (jeuId !== 'attachement' && ordreColonnes.length === 0)} onClick={telecharger}>
            {occupe ? 'Préparation du fichier…' : `Télécharger (${FORMATS[format]})`}
          </button>

          {peut('exports', 'creer') && (
            <div className="actions">
              <button type="button" onClick={() => enregistrerModele(false)}>Enregistrer comme modèle</button>
              {modeleId && <button type="button" onClick={() => enregistrerModele(true)}>Mettre à jour le modèle</button>}
              {modeleId && <button type="button" className="danger" onClick={retirerModele}>Retirer le modèle</button>}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
