'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

// Champ d'une fiche : le formulaire convertit la saisie (texte vide → null, nombre, case, date).
export interface Champ {
  cle: string;
  libelle: string;
  type?: 'texte' | 'nombre' | 'date' | 'case' | 'zone' | 'choix';
  options?: [string, string][];
  arabe?: boolean;
  aide?: string;
  obligatoire?: boolean;
}

type Valeurs = Record<string, unknown>;

const versSaisie = (champ: Champ, v: unknown): string | boolean => {
  if (champ.type === 'case') return v === true;
  return v == null ? '' : String(v);
};

const depuisSaisie = (champ: Champ, v: string | boolean): unknown => {
  if (champ.type === 'case') return v === true;
  const t = String(v).trim();
  if (t === '') return null;
  if (champ.type === 'nombre') return Number(t.replace(/\s/g, '').replace(',', '.'));
  return t;
};

export function FormulaireFiche({
  titre, champs, valeurs, modifiable, enregistrer, enfants,
}: {
  titre: string;
  champs: Champ[];
  valeurs: Valeurs | null;
  modifiable: boolean;
  enregistrer: (changements: Valeurs) => Promise<boolean>;
  enfants?: ReactNode;
}) {
  const [saisie, setSaisie] = useState<Record<string, string | boolean>>({});
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    const initiale: Record<string, string | boolean> = {};
    champs.forEach((c) => (initiale[c.cle] = versSaisie(c, valeurs?.[c.cle])));
    setSaisie(initiale);
    // Les champs sont des constantes ; seules les valeurs relues comptent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeurs]);

  const changements = (): Valeurs => {
    const c: Valeurs = {};
    champs.forEach((champ) => {
      const nouvelle = depuisSaisie(champ, saisie[champ.cle] ?? '');
      const ancienne = champ.type === 'case' ? valeurs?.[champ.cle] === true : valeurs?.[champ.cle] ?? null;
      if (String(nouvelle ?? '') !== String(ancienne ?? '')) c[champ.cle] = nouvelle;
    });
    return c;
  };

  const nombreInvalide = champs.some(
    (c) => c.type === 'nombre' && String(saisie[c.cle] ?? '').trim() !== ''
      && Number.isNaN(Number(String(saisie[c.cle]).replace(/\s/g, '').replace(',', '.'))),
  );
  const manquant = champs.some((c) => c.obligatoire && String(saisie[c.cle] ?? '').trim() === '');

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const c = changements();
    if (Object.keys(c).length === 0) {
      setMessage('Aucun changement.');
      return;
    }
    setOccupe(true);
    setMessage('');
    if (await enregistrer(c)) setMessage('Enregistré.');
    setOccupe(false);
  }

  return (
    <form className="carte" onSubmit={soumettre}>
      <h2>{titre}</h2>
      <div className="deux">
        {champs.map((c) => {
          const valeur = saisie[c.cle] ?? (c.type === 'case' ? false : '');
          const maj = (v: string | boolean) => {
            setMessage('');
            setSaisie((s) => ({ ...s, [c.cle]: v }));
          };
          if (c.type === 'case') {
            return (
              <label key={c.cle} className="ligne">
                <input type="checkbox" checked={valeur === true} disabled={!modifiable} onChange={(e) => maj(e.target.checked)} />
                {c.libelle}
              </label>
            );
          }
          return (
            <label key={c.cle} className={c.type === 'zone' ? 'pleine-largeur' : ''}>
              {c.libelle}{c.obligatoire ? ' *' : ''}
              {c.type === 'zone' ? (
                <textarea rows={3} value={String(valeur)} disabled={!modifiable} onChange={(e) => maj(e.target.value)}
                  dir={c.arabe ? 'rtl' : undefined} lang={c.arabe ? 'ar' : undefined} />
              ) : c.type === 'choix' ? (
                <select value={String(valeur)} disabled={!modifiable} onChange={(e) => maj(e.target.value)}>
                  <option value="">—</option>
                  {(c.options ?? []).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              ) : (
                <input
                  value={String(valeur)}
                  disabled={!modifiable}
                  onChange={(e) => maj(e.target.value)}
                  type={c.type === 'date' ? 'date' : 'text'}
                  inputMode={c.type === 'nombre' ? 'decimal' : undefined}
                  dir={c.arabe ? 'rtl' : undefined}
                  lang={c.arabe ? 'ar' : undefined}
                />
              )}
              {c.aide && <span className="discret aide">{c.aide}</span>}
            </label>
          );
        })}
      </div>
      {enfants}
      {modifiable && (
        <div className="actions">
          <button className="primaire" disabled={occupe || nombreInvalide || manquant}>Enregistrer</button>
          {nombreInvalide && <span className="erreur">Nombre invalide.</span>}
          {message && <span className="info">{message}</span>}
        </div>
      )}
    </form>
  );
}
