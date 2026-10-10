'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';

interface Regles {
  id: string;
  periodicite: string;
  titre: string;
  regroupement: string;
  fuites_admissibles: string;
  refection_anticipee: boolean;
  verrouiller_a_l_arret: boolean;
  afficher_prix: boolean;
  mentions_obligatoires: string[];
  visas: string[];
  decimales: Record<string, number>;
  texte_pied: string | null;
}

const PERIODICITES: Record<string, string> = {
  mensuelle: 'Mensuelle', quinzaine: 'Par quinzaine', trimestrielle: 'Trimestrielle', libre: 'Libre (à la demande)',
};
const REGROUPEMENTS: Record<string, string> = {
  poste: 'Par article du bordereau', zone: 'Par zone', secteur: 'Par secteur', chef: "Par chef d'équipe",
};
const ADMISSIBLES: Record<string, string> = {
  toutes: 'Toutes les fuites saisies (le responsable coche)',
  verrouillees: 'Fuites verrouillées (validées) seulement',
  achevees: 'Fuites achevées seulement',
};
const MENTIONS: Record<string, string> = {
  reference_marche: 'Référence du marché',
  ordre_service: 'Référence de l\'ordre de service',
  lieu_travaux: 'Lieu exact des travaux (début et fin)',
  zone: 'Zone',
  observation: 'Observation',
};
const UNITES = ['ml', 'm2', 'm3', 'u', 'forfait'];

export function OngletAttachement({ marcheId, modifiable }: { marcheId: string; modifiable: boolean }) {
  const [regles, setRegles] = useState<Regles | null>(null);
  const [saisie, setSaisie] = useState<Regles | null>(null);
  const [visas, setVisas] = useState('');
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    const { data, error } = await getSupabase().from('parametres_attachement').select('*').eq('marche_id', marcheId).maybeSingle();
    setErreur(error ? messageErreur(error) : '');
    const r = (data as Regles | null) ?? null;
    setRegles(r);
    setSaisie(r);
    setVisas((r?.visas ?? []).join('\n'));
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (!saisie || !regles) return erreur ? <p className="erreur">{erreur}</p> : <p className="discret">Chargement…</p>;

  const maj = (champ: Partial<Regles>) => {
    setMessage('');
    setSaisie({ ...saisie, ...champ });
  };

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!saisie) return;
    setErreur('');
    const { error } = await getSupabase().from('parametres_attachement').update({
      periodicite: saisie.periodicite,
      regroupement: saisie.regroupement,
      fuites_admissibles: saisie.fuites_admissibles,
      refection_anticipee: saisie.refection_anticipee,
      verrouiller_a_l_arret: saisie.verrouiller_a_l_arret,
      afficher_prix: saisie.afficher_prix,
      mentions_obligatoires: saisie.mentions_obligatoires,
      decimales: saisie.decimales,
      titre: saisie.titre.trim() || regles!.titre,
      texte_pied: saisie.texte_pied?.trim() || null,
      visas: visas.split('\n').map((v) => v.trim()).filter(Boolean),
    }).eq('id', saisie.id);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    await charger();
    setMessage('Enregistré.');
  }

  const decimalesValides = UNITES.every((u) => Number.isInteger(saisie.decimales[u] ?? 0) && (saisie.decimales[u] ?? 0) >= 0 && (saisie.decimales[u] ?? 0) <= 4);

  return (
    <form className="carte" onSubmit={soumettre}>
      <h2>Règles d&apos;attachement</h2>
      <p className="discret">
        Les attachements sont des lots de travaux choisis par le responsable (fuite × article du bordereau), d&apos;abord
        en brouillon, puis arrêtés et figés : une quantité attachée ne peut plus l&apos;être une seconde fois.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
      <div className="deux">
        <label>
          Périodicité habituelle
          <select value={saisie.periodicite} disabled={!modifiable} onChange={(e) => maj({ periodicite: e.target.value })}>
            {Object.entries(PERIODICITES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Regroupement du détail
          <select value={saisie.regroupement} disabled={!modifiable} onChange={(e) => maj({ regroupement: e.target.value })}>
            {Object.entries(REGROUPEMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="pleine-largeur">
          Titre de l&apos;attachement
          <input value={saisie.titre} disabled={!modifiable} onChange={(e) => maj({ titre: e.target.value })} />
          <span className="discret aide">{'{numero}'} : numéro du lot ; {'{date}'} : date « travaux exécutés au ».</span>
        </label>
        <label className="pleine-largeur">
          Fuites proposées dans « À attacher »
          <select value={saisie.fuites_admissibles} disabled={!modifiable} onChange={(e) => maj({ fuites_admissibles: e.target.value })}>
            {Object.entries(ADMISSIBLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="ligne">
        <input type="checkbox" checked={saisie.refection_anticipee} disabled={!modifiable} onChange={(e) => maj({ refection_anticipee: e.target.checked })} />
        Le maître d&apos;ouvrage accepte l&apos;attachement par anticipation (articles du panier, cochés « Anticipable » dans Bordereau)
      </label>
      <label className="ligne">
        <input type="checkbox" checked={saisie.verrouiller_a_l_arret} disabled={!modifiable} onChange={(e) => maj({ verrouiller_a_l_arret: e.target.checked })} />
        Verrouiller les fuites d&apos;un lot arrêté
      </label>
      <label className="ligne">
        <input type="checkbox" checked={saisie.afficher_prix} disabled={!modifiable} onChange={(e) => maj({ afficher_prix: e.target.checked })} />
        Afficher les prix unitaires et montants sur l&apos;attachement imprimé
      </label>

      <fieldset>
        <legend>Mentions obligatoires avant l&apos;arrêt d&apos;un lot</legend>
        {Object.entries(MENTIONS).map(([k, v]) => (
          <label key={k} className="ligne">
            <input
              type="checkbox"
              disabled={!modifiable}
              checked={saisie.mentions_obligatoires.includes(k)}
              onChange={(e) => maj({
                mentions_obligatoires: e.target.checked
                  ? [...saisie.mentions_obligatoires, k]
                  : saisie.mentions_obligatoires.filter((x) => x !== k),
              })}
            />
            {v}
          </label>
        ))}
      </fieldset>

      <label>
        Visas en pied d&apos;attachement (un par ligne)
        <textarea rows={3} value={visas} disabled={!modifiable} onChange={(e) => { setMessage(''); setVisas(e.target.value); }} />
      </label>

      <fieldset>
        <legend>Décimales des quantités par unité</legend>
        <div className="trois">
          {UNITES.map((u) => (
            <label key={u}>
              {u}
              <input
                inputMode="numeric"
                disabled={!modifiable}
                value={String(saisie.decimales[u] ?? '')}
                onChange={(e) => maj({ decimales: { ...saisie.decimales, [u]: Number(e.target.value) } })}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        Texte de pied (facultatif)
        <textarea rows={2} value={saisie.texte_pied ?? ''} disabled={!modifiable} onChange={(e) => maj({ texte_pied: e.target.value })} />
      </label>

      {modifiable && (
        <div className="actions">
          <button className="primaire" disabled={!decimalesValides}>Enregistrer</button>
          {!decimalesValides && <span className="erreur">Décimales : nombre entier de 0 à 4.</span>}
          {message && <span className="info">{message}</span>}
        </div>
      )}
    </form>
  );
}
