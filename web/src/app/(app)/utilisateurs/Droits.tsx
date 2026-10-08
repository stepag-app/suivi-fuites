'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Action, TypeDonnee } from '@/lib/types';
import {
  CLES_SENSIBLES, GROUPES, LIGNES, ROLES, avecValeur, basculer, calculerChangements, changementsVerrous, cleVerrou,
  droitsDepuisLignes, droitsDuModele, estPersonnalise, libelleDroit, libelleVerrou, lignesAEnregistrer, objetAction,
  sansEcran, texteValeur, valeur, type DroitsUtilisateur, type LigneMatrice, type ModeleDroit, type Portee, type Role,
  type Valeur, type ValeursDroit,
} from './matrice';
import styles from './droits.module.css';

interface ProfilLigne { id: string; identifiant: string; nom_complet: string; est_admin: boolean; actif: boolean }
interface AffectationLigne { profil_id: string; roles: string[]; actif: boolean }
interface DroitLigne extends ValeursDroit { profil_id: string; type_donnee: TypeDonnee }
interface VerrouLigne { id: string; profil_id: string; objet: string; action: string }

const PORTEES: [Portee, string][] = [['non', 'Non'], ['siennes', 'Les siennes'], ['toutes', 'Toutes']];
const memesRoles = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
const classes = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/** Onglet Droits : matrice des utilisateurs du marché (en colonnes), puis l'administrateur et ses verrous dans un bloc à part. */
export function Droits({ marcheId, choisirMarche }: { marcheId: string; choisirMarche: (id: string) => void }) {
  const { profil, marches, recharger } = useSession();
  const moiId = profil?.id ?? '';
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [profils, setProfils] = useState<ProfilLigne[]>([]);
  const [affectations, setAffectations] = useState<AffectationLigne[]>([]);
  const [modeles, setModeles] = useState<ModeleDroit[]>([]);
  const [initial, setInitial] = useState<Record<string, DroitsUtilisateur>>({});
  const [courant, setCourant] = useState<Record<string, DroitsUtilisateur>>({});
  const [rolesAppliques, setRolesAppliques] = useState<Record<string, Role | null>>({});
  const [verrous, setVerrous] = useState<VerrouLigne[]>([]);
  const [mesVerrous, setMesVerrous] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [blocAdmin, setBlocAdmin] = useState(false);

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [p, a, d, m, v] = await Promise.all([
      sb.from('profils').select('id, identifiant, nom_complet, est_admin, actif').order('nom_complet'),
      sb.from('affectations').select('profil_id, roles, actif').eq('marche_id', marcheId),
      sb.from('droits').select('profil_id, type_donnee, lire, creer, modifier, supprimer, valider').eq('marche_id', marcheId),
      sb.from('modeles_droits').select('role, type_donnee, lire, creer, modifier, supprimer, valider'),
      sb.from('verrous_admin').select('id, profil_id, objet, action'),
    ]);
    const echec = p.error ?? a.error ?? d.error ?? m.error ?? v.error;
    if (echec) {
      setErreur(echec.code === '42P01' ? 'La base n\'a pas encore la migration des verrous (lot Q) : déployez-la.' : messageErreur(echec));
      setPret(false);
      return;
    }
    const lignes = (d.data ?? []) as DroitLigne[];
    const aff = (a.data ?? []) as AffectationLigne[];
    const parProfil = Object.fromEntries(aff.map((x) => [x.profil_id, droitsDepuisLignes(lignes.filter((l) => l.profil_id === x.profil_id))]));
    const vs = (v.data ?? []) as VerrouLigne[];
    setProfils((p.data ?? []) as ProfilLigne[]);
    setAffectations(aff);
    setModeles((m.data ?? []) as ModeleDroit[]);
    setInitial(parProfil);
    setCourant(parProfil);
    setRolesAppliques({});
    setVerrous(vs);
    setMesVerrous(vs.filter((x) => x.profil_id === moiId).map((x) => cleVerrou(x.objet, x.action)));
    setConfirmation(false);
    setPret(true);
  }, [marcheId, moiId]);

  useEffect(() => {
    setErreur('');
    setInfo('');
    charger();
  }, [charger]);

  // Matrice : les agents du marché ; bloc à part : vous, vos verrous, les autres administrateurs (tout, lecture seule).
  const { autresAdmins, agents, masques } = useMemo(() => {
    const affectes = new Set(affectations.filter((a) => a.actif).map((a) => a.profil_id));
    const actifs = profils.filter((p) => p.actif);
    return {
      autresAdmins: actifs.filter((p) => p.est_admin && p.id !== moiId),
      agents: actifs.filter((p) => !p.est_admin && affectes.has(p.id)),
      masques: profils.filter((p) => !p.est_admin && affectations.some((a) => a.profil_id === p.id) && (!p.actif || !affectes.has(p.id))).length,
    };
  }, [profils, affectations, moiId]);

  const rolesDe = useCallback((id: string) => affectations.find((a) => a.profil_id === id)?.roles ?? [], [affectations]);
  // Rôles affichés : ceux du modèle appliqué dans la matrice (non enregistré), sinon ceux de l'affectation.
  const rolesAffiches = (id: string): string[] => {
    const r = rolesAppliques[id];
    if (r === undefined) return rolesDe(id);
    return r ? [r] : [];
  };
  const changements = useMemo(() => calculerChangements(initial, courant), [initial, courant]);
  const rolesChanges = useMemo(
    () => Object.entries(rolesAppliques).filter(([id, r]) => !memesRoles(rolesDe(id), r ? [r] : [])),
    [rolesAppliques, rolesDe],
  );
  const verrousInitiaux = useMemo(
    () => verrous.filter((x) => x.profil_id === moiId).map((x) => cleVerrou(x.objet, x.action)),
    [verrous, moiId],
  );
  const { poser, retirer } = useMemo(() => changementsVerrous(verrousInitiaux, mesVerrous), [verrousInitiaux, mesVerrous]);
  const nbChangements = changements.length + rolesChanges.length + poser.length + retirer.length;

  // Changements non enregistrés : avertir avant de quitter la page.
  useEffect(() => {
    if (!nbChangements) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [nbChangements]);

  const nomDe = (id: string) => profils.find((p) => p.id === id)?.nom_complet ?? id.slice(0, 8);
  const resume = useMemo(() => {
    const parPersonne = new Map<string, string[]>();
    const ajouter = (id: string, texte: string) => parPersonne.set(id, [...(parPersonne.get(id) ?? []), texte]);
    for (const [id, r] of rolesChanges) ajouter(id, `Modèle appliqué, rôle affiché : ${r ? ROLES[r] : 'aucun'}`);
    const caches = new Map<string, number>();
    for (const c of changements) {
      if (sansEcran(c.type_donnee, c.colonne)) caches.set(c.profil_id, (caches.get(c.profil_id) ?? 0) + 1);
      else ajouter(c.profil_id, `${libelleDroit(c.type_donnee, c.colonne)} : ${texteValeur(c.avant)} → ${texteValeur(c.apres)}`);
    }
    for (const [id, nb] of caches) {
      ajouter(id, `et ${nb} case${nb > 1 ? 's' : ''} sans écran (balayage, mesures de débit… : sans effet aujourd'hui)`);
    }
    for (const cle of poser) ajouter(moiId, `Verrou posé : ${libelleVerrou(cle)}`);
    for (const cle of retirer) ajouter(moiId, `Verrou ouvert : ${libelleVerrou(cle)} (il reste ouvert jusqu'à ce que vous le refermiez)`);
    return [...parPersonne];
  }, [changements, rolesChanges, poser, retirer, moiId]);

  function changerCase(id: string, l: LigneMatrice, v: Valeur) {
    setCourant((c) => ({ ...c, [id]: avecValeur(c[id] ?? {}, l.objet as TypeDonnee, l.action as Action, v) }));
  }

  function appliquerModele(id: string, choix: string) {
    if (!choix) return;
    const role = choix === 'aucun' ? null : (choix as Role);
    setCourant((c) => ({ ...c, [id]: droitsDuModele(modeles, role) }));
    setRolesAppliques((r) => ({ ...r, [id]: role }));
  }

  function annuler() {
    setCourant(initial);
    setRolesAppliques({});
    setMesVerrous(verrousInitiaux);
    setConfirmation(false);
  }

  async function enregistrer() {
    setOccupe(true);
    setErreur('');
    setInfo('');
    const sb = getSupabase();
    const lignes = lignesAEnregistrer(initial, courant);
    const roles = rolesChanges.map(([profil_id, r]) => ({ profil_id, roles: r ? [r] : [] }));
    if (lignes.length || roles.length) {
      const { error } = await sb.rpc('enregistrer_droits', { p_marche: marcheId, p_droits: lignes, p_roles: roles });
      if (error) {
        setErreur(messageErreur(error));
        setConfirmation(false);
        setOccupe(false);
        return;
      }
    }
    let echec = '';
    if (poser.length) {
      const { error } = await sb.from('verrous_admin').insert(poser.map(objetAction));
      if (error) echec = messageErreur(error);
    }
    const aRetirer = verrous.filter((x) => x.profil_id === moiId && retirer.includes(cleVerrou(x.objet, x.action))).map((x) => x.id);
    if (!echec && aRetirer.length) {
      const { error } = await sb.from('verrous_admin').delete().in('id', aRetirer);
      if (error) echec = messageErreur(error);
    }
    const total = nbChangements;
    await charger();
    if (poser.length || retirer.length) recharger();
    if (echec) setErreur(`Droits enregistrés, mais verrous non enregistrés : ${echec}`);
    else setInfo(`${total} changement${total > 1 ? 's' : ''} enregistré${total > 1 ? 's' : ''}, inscrit${total > 1 ? 's' : ''} au journal.`);
    setOccupe(false);
  }

  function changerMarche(id: string) {
    if (nbChangements && !window.confirm('Des changements ne sont pas enregistrés. Les abandonner ?')) return;
    choisirMarche(id);
  }

  const lignesAgents = LIGNES.filter((l) => !l.adminSeul);
  const groupesAgents = GROUPES.filter((g) => lignesAgents.some((l) => l.groupe === g));
  const nbVerrous = mesVerrous.length;

  return (
    <section aria-labelledby="titre-droits">
      <h2 id="titre-droits" className={styles.titre}>Droits par utilisateur</h2>
      <p className="discret">
        Cochez ce que chaque utilisateur voit et fait dans le marché choisi ; la base applique ces droits, les écrans les suivent.
        Rien n&apos;est enregistré avant « Enregistrer » ; chaque changement est inscrit au journal.
        <br />
        L&apos;administrateur a tout, sauf ses <strong>verrous de sécurité</strong> : ils se règlent dans le bloc à part, sous la matrice.
      </p>

      <div className={styles.barre}>
        <label className={styles.choixMarche}>
          Marché
          <select value={marcheId} onChange={(e) => changerMarche(e.target.value)}>
            {marches.map((m) => (
              <option key={m.id} value={m.id}>{m.code} · {m.intitule.slice(0, 50)}{m.actif === false ? ' (désactivé)' : ''}</option>
            ))}
          </select>
        </label>
        <span className={styles.compteur} aria-live="polite">
          {nbChangements ? `${nbChangements} changement${nbChangements > 1 ? 's' : ''} non enregistré${nbChangements > 1 ? 's' : ''}` : 'Aucun changement'}
        </span>
        <span className="actions">
          <button onClick={annuler} disabled={!nbChangements || occupe}>Annuler les changements</button>
          <button className="primaire" onClick={() => setConfirmation(true)} disabled={!nbChangements || occupe}>Enregistrer…</button>
        </span>
      </div>

      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="info">{info}</p>}

      {confirmation && (
        <section className={classes('carte attention', styles.confirmation)} aria-labelledby="titre-confirmation">
          <h3 id="titre-confirmation">Confirmer les changements</h3>
          <div className={styles.resume}>
            {resume.map(([id, textes]) => (
              <div key={id}>
                <strong>{id === moiId ? 'Vous (verrous de sécurité, tous les marchés)' : nomDe(id)}</strong>
                <ul className={styles.listeChangements}>{textes.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="actions">
            {/* Focus sur la confirmation à l'ouverture (le panneau vient se placer sous les yeux) */}
            <button className="primaire" onClick={enregistrer} disabled={occupe} autoFocus>{occupe ? 'Enregistrement…' : 'Confirmer et enregistrer'}</button>
            <button onClick={() => setConfirmation(false)} disabled={occupe}>Revenir à la matrice</button>
          </div>
        </section>
      )}

      {!pret && !erreur && <p className="discret">Chargement…</p>}
      {pret && agents.length === 0 && (
        <p className="discret">Aucun utilisateur affecté à ce marché : affectez-en un dans l&apos;onglet Comptes (menu « Ajouter un rôle »).</p>
      )}
      {pret && masques > 0 && (
        <p className="discret">{masques} compte{masques > 1 ? 's' : ''} révoqué{masques > 1 ? 's' : ''} ou retiré{masques > 1 ? 's' : ''} de ce marché, non affiché{masques > 1 ? 's' : ''}.</p>
      )}

      {pret && agents.length > 0 && (
        <div className={styles.cadre}>
          <table className={styles.matrice}>
            <thead>
              <tr>
                <th scope="col" className={styles.coin}>Droit</th>
                {agents.map((p) => (
                  <TeteAgent key={p.id} agent={p} roles={rolesAffiches(p.id)}
                    personnalise={estPersonnalise(courant[p.id] ?? {}, rolesAffiches(p.id), modeles)}
                    appliquer={(choix) => appliquerModele(p.id, choix)} />
                ))}
              </tr>
            </thead>
            {groupesAgents.map((g) => (
              <tbody key={g}>
                <tr className={styles.groupe}>
                  <th scope="rowgroup" colSpan={1 + agents.length}><span>{g}</span></th>
                </tr>
                {lignesAgents.filter((l) => l.groupe === g).map((l) => (
                  <tr key={l.cle}>
                    <LibelleDroit ligne={l} />
                    {agents.map((p) => (
                      <CelluleAgent key={p.id} ligne={l} nom={p.nom_complet}
                        avant={valeur(initial[p.id] ?? {}, l.objet as TypeDonnee, l.action as Action)}
                        apres={valeur(courant[p.id] ?? {}, l.objet as TypeDonnee, l.action as Action)}
                        changer={(v) => changerCase(p.id, l, v)} />
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {pret && (
        <details className={styles.blocAdmin} open={blocAdmin} onToggle={(e) => setBlocAdmin(e.currentTarget.open)}>
          <summary>
            <span className={styles.titreBloc}>Administrateur et verrous de sécurité</span>
            <span className={styles.petit}>
              {nbVerrous ? `${nbVerrous} verrou${nbVerrous > 1 ? 's' : ''} posé${nbVerrous > 1 ? 's' : ''}` : 'aucun verrou posé'}
              {autresAdmins.length ? ` · ${autresAdmins.length} autre${autresAdmins.length > 1 ? 's' : ''} administrateur${autresAdmins.length > 1 ? 's' : ''}` : ''}
            </span>
          </summary>
          <p className="discret">
            Vos verrous valent pour tous les marchés : un droit verrouillé vous est refusé par la base, même à vous.
            Pour agir, ouvrez le verrou, agissez, puis refermez-le : il ne se referme pas tout seul.
          </p>
          <div className={styles.cadre}>
            <table className={styles.matrice}>
              <thead>
                <tr>
                  <th scope="col" className={styles.coin}>Droit</th>
                  <th scope="col" className={classes(styles.tete, styles.colonneAdmin)}>
                    <span className={styles.nom}>Vous</span>
                    <span className={styles.petit}>tout, sauf vos verrous</span>
                  </th>
                  <th scope="col" className={classes(styles.tete, styles.colonneVerrous)}>
                    <span className={styles.nom}>Vos verrous</span>
                    <span className={styles.petit}>tous les marchés</span>
                    <button type="button" className={styles.petitBouton}
                      onClick={() => setMesVerrous((v) => [...new Set([...v, ...CLES_SENSIBLES])])}>
                      Verrouiller les actions sensibles
                    </button>
                  </th>
                  {autresAdmins.map((a) => (
                    <th key={a.id} scope="col" className={classes(styles.tete, styles.colonneAdmin)}>
                      <span className={styles.nom}>{a.nom_complet}</span>
                      <span className={styles.petit}>tout, sauf ses verrous</span>
                    </th>
                  ))}
                </tr>
              </thead>
              {GROUPES.map((g) => (
                <tbody key={g}>
                  <tr className={styles.groupe}>
                    <th scope="rowgroup" colSpan={3 + autresAdmins.length}><span>{g}</span></th>
                  </tr>
                  {LIGNES.filter((l) => l.groupe === g).map((l) => (
                    <tr key={l.cle}>
                      <LibelleDroit ligne={l} />
                      <td className={styles.colonneAdmin}>
                        <CelluleAdmin ligne={l} verrouillee={mesVerrous.includes(l.cle)} />
                      </td>
                      <BoutonVerrou ligne={l} pose={mesVerrous.includes(l.cle)} initial={verrousInitiaux.includes(l.cle)}
                        basculer={() => setMesVerrous((v) => basculer(v, l.cle))} />
                      {autresAdmins.map((a) => (
                        <td key={a.id} className={styles.colonneAdmin}>
                          <CelluleAdmin ligne={l}
                            verrouillee={verrous.some((x) => x.profil_id === a.id && cleVerrou(x.objet, x.action) === l.cle)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function LibelleDroit({ ligne: l }: { ligne: LigneMatrice }) {
  return (
    <th scope="row" className={styles.libelle}>
      {l.libelle}
      {l.sensible && <span className={classes('etiquette', styles.sensible)}>sensible</span>}
      {l.aide && <span className={styles.aide}>{l.aide}</span>}
    </th>
  );
}

function TeteAgent({ agent, roles, personnalise, appliquer }: {
  agent: ProfilLigne; roles: readonly string[]; personnalise: boolean; appliquer: (choix: string) => void;
}) {
  return (
    <th scope="col" className={styles.tete}>
      <span className={styles.nom}>{agent.nom_complet}</span>
      <span className={styles.petit}>{agent.identifiant}</span>
      <span className={styles.petit}>{roles.map((r) => ROLES[r as Role] ?? r).join(', ') || 'aucun rôle'}</span>
      {personnalise && <span className={classes('etiquette', styles.personnalise)}>droits personnalisés</span>}
      <select value="" onChange={(e) => appliquer(e.target.value)} aria-label={`Appliquer un modèle à ${agent.nom_complet}`}>
        <option value="">Modèle…</option>
        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        <option value="aucun">Aucun droit</option>
      </select>
    </th>
  );
}

function BoutonVerrou({ ligne, pose, initial, basculer }: {
  ligne: LigneMatrice; pose: boolean; initial: boolean; basculer: () => void;
}) {
  return (
    <td className={classes(styles.colonneVerrous, pose !== initial && styles.modifiee)}>
      <button type="button" aria-pressed={pose} className={pose ? styles.verrouPose : styles.verrouOuvert}
        aria-label={`${pose ? 'Ouvrir' : 'Poser'} le verrou : ${ligne.libelle}`} onClick={basculer}>
        {pose ? 'Verrouillé' : 'Verrouiller'}
      </button>
    </td>
  );
}

function CelluleAdmin({ ligne, verrouillee }: { ligne: LigneMatrice; verrouillee: boolean }) {
  if (verrouillee) return <span className={styles.verrouille}>verrouillé</span>;
  if (ligne.portee) return <span className={styles.toutes}>Toutes</span>;
  return <input type="checkbox" checked disabled aria-label={`${ligne.libelle} : oui (administrateur)`} />;
}

function CelluleAgent({ ligne, nom, avant, apres, changer }: {
  ligne: LigneMatrice; nom: string; avant: Valeur | null; apres: Valeur | null; changer: (v: Valeur) => void;
}) {
  if (ligne.adminSeul || apres === null) {
    return <td><span className={styles.sansObjet} title="Réservé à l'administrateur">—</span></td>;
  }
  const modifiee = avant !== apres;
  const etiquette = `${ligne.libelle} — ${nom}`;
  return (
    <td className={classes(modifiee && styles.modifiee)} title={modifiee && avant !== null ? `Avant : ${texteValeur(avant)}` : undefined}>
      {ligne.portee ? (
        <select value={String(apres)} onChange={(e) => changer(e.target.value as Portee)} aria-label={etiquette}>
          {PORTEES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      ) : (
        <input type="checkbox" checked={apres === true} onChange={(e) => changer(e.target.checked)} aria-label={etiquette} />
      )}
    </td>
  );
}
