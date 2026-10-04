'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Marche, Profil } from '@/lib/types';

interface Affectation {
  id: string;
  profil_id: string;
  marche_id: string;
  roles: string[];
  actif: boolean;
}

const ROLES: Record<string, string> = {
  detection: 'Détection',
  chef_reparation: 'Chef d\'équipe réparation',
  responsable: 'Responsable (bureau)',
};

export default function Utilisateurs() {
  const { profil, marches, marche } = useSession();
  const [profils, setProfils] = useState<Profil[]>([]);
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [p, a] = await Promise.all([
      sb.from('profils').select('id, identifiant, nom_complet, telephone, langue, est_admin, actif').order('nom_complet'),
      sb.from('affectations').select('id, profil_id, marche_id, roles, actif'),
    ]);
    if (p.error) setErreur(messageErreur(p.error));
    setProfils((p.data as Profil[] | null) ?? []);
    setAffectations((a.data as Affectation[] | null) ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function appeler(corps: Record<string, unknown>): Promise<boolean> {
    setErreur('');
    setInfo('');
    const { data, error } = await getSupabase().functions.invoke('gerer-utilisateurs', { body: corps });
    if (error) {
      let message = messageErreur(error);
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        try {
          const detail = await contexte.json();
          if (detail?.erreur) message = detail.erreur;
        } catch {
          /* corps illisible : on garde le message générique */
        }
      }
      setErreur(message);
      return false;
    }
    if (data?.erreur) {
      setErreur(data.erreur);
      return false;
    }
    await charger();
    return true;
  }

  if (!profil?.est_admin) return <p className="carte">Réservé à l&apos;administrateur.</p>;

  const marcheDe = (id: string) => marches.find((m) => m.id === id)?.code ?? id.slice(0, 8);

  return (
    <>
      <div className="barre">
        <h1>Utilisateurs</h1>
        {!creation && <button className="gros primaire" onClick={() => setCreation(true)}>+ Nouvel agent</button>}
      </div>
      {erreur && <p className="erreur">{erreur}</p>}
      {info && <p className="info">{info}</p>}

      {creation && (
        <FormCreation
          marches={marches}
          marcheParDefaut={marche?.id ?? ''}
          onAnnuler={() => setCreation(false)}
          onCreer={async (corps) => {
            const ok = await appeler({ action: 'creer', ...corps });
            if (ok) {
              setInfo(`Compte « ${corps.identifiant} » créé. Communiquez l'identifiant et le mot de passe à l'agent.`);
              setCreation(false);
            }
          }}
        />
      )}

      <ul className="liste">
        {profils.map((p) => {
          const siennes = affectations.filter((a) => a.profil_id === p.id);
          return (
            <li key={p.id} className="carte">
              <div className="fuite-tete">
                <strong>{p.nom_complet}</strong>
                <span className={p.actif ? 'badge st-achevee' : 'badge st-sans'}>{p.actif ? 'Actif' : 'Révoqué'}</span>
              </div>
              <div className="discret">Identifiant : {p.identifiant}{p.est_admin ? ' · administrateur' : ''}</div>
              <ul className="simple">
                {siennes.map((a) => (
                  <li key={a.id}>
                    {marcheDe(a.marche_id)} : {a.roles.map((r) => ROLES[r] ?? r).join(', ') || 'aucun rôle'}
                    {!a.actif && ' (retiré)'}
                  </li>
                ))}
                {siennes.length === 0 && <li className="discret">Aucun marché affecté</li>}
              </ul>
              {p.id !== profil.id && (
                <div className="actions">
                  <button
                    onClick={async () => {
                      const mdp = window.prompt(`Nouveau mot de passe pour ${p.identifiant} (8 caractères minimum) :`);
                      if (!mdp) return;
                      if (await appeler({ action: 'mot_de_passe', profil_id: p.id, mot_de_passe: mdp })) setInfo('Mot de passe modifié.');
                    }}
                  >
                    Changer le mot de passe
                  </button>
                  <button
                    className={p.actif ? 'danger' : ''}
                    onClick={async () => {
                      if (p.actif && !window.confirm(`Révoquer l'accès de ${p.nom_complet} ?`)) return;
                      await appeler({ action: 'activer', profil_id: p.id, actif: !p.actif });
                    }}
                  >
                    {p.actif ? 'Révoquer l\'accès' : 'Réactiver'}
                  </button>
                  <AjoutAffectation marches={marches} onAjouter={(marche_id, role) => appeler({ action: 'affecter', profil_id: p.id, marche_id, role })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function AjoutAffectation({
  marches, onAjouter,
}: { marches: Marche[]; onAjouter: (marche_id: string, role: string) => Promise<boolean> }) {
  const [marcheId, setMarcheId] = useState(marches[0]?.id ?? '');
  const [role, setRole] = useState('detection');
  return (
    <span className="ligne">
      <select value={marcheId} onChange={(e) => setMarcheId(e.target.value)} aria-label="Marché">
        {marches.map((m) => (<option key={m.id} value={m.id}>{m.code}</option>))}
      </select>
      <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rôle">
        {Object.entries(ROLES).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
      </select>
      <button onClick={() => marcheId && onAjouter(marcheId, role)}>Ajouter ce rôle</button>
    </span>
  );
}

function FormCreation({
  marches, marcheParDefaut, onAnnuler, onCreer,
}: {
  marches: Marche[]; marcheParDefaut: string; onAnnuler: () => void;
  onCreer: (c: {
    identifiant: string; nom_complet: string; mot_de_passe: string; telephone: string;
    affectations: { marche_id: string; roles: string[] }[];
  }) => Promise<void>;
}) {
  const [identifiant, setIdentifiant] = useState('');
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [telephone, setTelephone] = useState('');
  const [marcheId, setMarcheId] = useState(marcheParDefaut);
  const [roles, setRoles] = useState<string[]>(['detection']);
  const [occupe, setOccupe] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setOccupe(true);
    await onCreer({
      identifiant: identifiant.trim().toLowerCase(), nom_complet: nom.trim(), mot_de_passe: motDePasse, telephone: telephone.trim(),
      affectations: marcheId && roles.length ? [{ marche_id: marcheId, roles }] : [],
    });
    setOccupe(false);
  }

  return (
    <form onSubmit={soumettre} className="carte formulaire">
      <h2>Nouvel agent</h2>
      <div className="deux">
        <label>
          Identifiant (lettres, chiffres, . _ -)
          <input value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} pattern="[a-zA-Z0-9._\-]{3,40}" autoCapitalize="none" required />
        </label>
        <label>
          Nom complet
          <input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
      </div>
      <div className="deux">
        <label>
          Mot de passe (8 caractères minimum)
          <input value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} minLength={8} required />
        </label>
        <label>
          Téléphone (facultatif)
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" />
        </label>
      </div>
      <label>
        Marché
        <select value={marcheId} onChange={(e) => setMarcheId(e.target.value)}>
          {marches.map((m) => (<option key={m.id} value={m.id}>{m.code} · {m.intitule.slice(0, 50)}</option>))}
        </select>
      </label>
      <fieldset>
        <legend>Rôles (cumulables)</legend>
        {Object.entries(ROLES).map(([k, v]) => (
          <label key={k} className="ligne">
            <input
              type="checkbox"
              checked={roles.includes(k)}
              onChange={(e) => setRoles(e.target.checked ? [...roles, k] : roles.filter((r) => r !== k))}
            />
            {v}
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button className="gros primaire" disabled={occupe}>{occupe ? 'Création…' : 'Créer le compte'}</button>
        <button type="button" onClick={onAnnuler}>Annuler</button>
      </div>
    </form>
  );
}
