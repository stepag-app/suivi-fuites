'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { messageErreur, nombre } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';

interface Zone {
  id: string; numero: number; code: string; libelle: string; lineaire_m: number | null;
  q_exige_m3h: number | null; actif: boolean;
}
interface Secteur {
  id: string; zone_id: string; code: string; libelle: string; lineaire_m: number | null;
  ordre: number; actif: boolean;
}

const enNombre = (t: string) => (t.trim() === '' ? null : Number(t.replace(/\s/g, '').replace(',', '.')));
const nombreValide = (t: string) => t.trim() === '' || (!Number.isNaN(enNombre(t)) && (enNombre(t) ?? 0) >= 0);
const entierValide = (t: string) => /^\d+$/.test(t.trim());

// Zones et secteurs du marché. Pas de dessin : les géométries viendront avec le plan du réseau.
export function OngletSecteurs({ marcheId, peutCreer, peutModifier }: { marcheId: string; peutCreer: boolean; peutModifier: boolean }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [erreur, setErreur] = useState('');
  const [inactifs, setInactifs] = useState(false);
  const [edition, setEdition] = useState<string>(''); // 'zone:<id>', 'secteur:<id>', 'zone:', 'secteur:<zone_id>:'

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [z, s] = await Promise.all([
      sb.from('zones').select('id, numero, code, libelle, lineaire_m, q_exige_m3h, actif').eq('marche_id', marcheId).order('numero'),
      sb.from('secteurs').select('id, zone_id, code, libelle, lineaire_m, ordre, actif').eq('marche_id', marcheId).order('ordre').order('code'),
    ]);
    const premiere = z.error || s.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setZones((z.data as Zone[] | null) ?? []);
    setSecteurs((s.data as Secteur[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ecrire(table: 'zones' | 'secteurs', id: string | null, valeurs: Record<string, unknown>): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const { error } = id
      ? await sb.from(table).update(valeurs).eq('id', id)
      : await sb.from(table).insert({ ...valeurs, marche_id: marcheId });
    if (error) {
      setErreur(error.code === '23505' ? 'Ce code (ou ce numéro de zone) existe déjà dans le marché.' : messageErreur(error));
      return false;
    }
    setEdition('');
    await charger();
    return true;
  }

  const visibles = (actif: boolean) => inactifs || actif;
  const lineaireSecteurs = (zoneId: string) =>
    secteurs.filter((s) => s.zone_id === zoneId && s.actif).reduce((t, s) => t + (s.lineaire_m ?? 0), 0);

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <div className="barre">
          <h2>Zones et secteurs</h2>
          <label className="ligne"><input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />Afficher les désactivés</label>
        </div>
        <p className="discret">
          Un secteur appartient à une zone. On désactive, on ne supprime pas : un élément désactivé n&apos;est plus proposé
          sur le terrain mais reste sur les fuites déjà saisies. Le dessin des zones viendra avec le plan du réseau.
        </p>
        {zones.length === 0 && <p className="discret">Aucune zone.</p>}
        {zones.filter((z) => visibles(z.actif)).map((z) => (
          <div key={z.id} className="bloc">
            {edition === `zone:${z.id}` ? (
              <FormZone initial={z} onSubmit={(v) => ecrire('zones', z.id, v)} annuler={() => setEdition('')} />
            ) : (
              <div className="ligne-param">
                <span className={z.actif ? '' : 'discret'}>
                  <strong>Zone {z.numero} · {z.code}</strong> · {z.libelle}
                  {z.lineaire_m != null ? ` · ${nombre(z.lineaire_m, 0)} ml` : ''}
                  {z.q_exige_m3h != null ? ` · Q exigé ${nombre(z.q_exige_m3h, 2)} m3/h` : ''}
                  {z.actif ? '' : ' (désactivée)'}
                  <br />
                  <span className="discret">
                    {secteurs.filter((s) => s.zone_id === z.id && s.actif).length} secteur(s) actif(s)
                    {lineaireSecteurs(z.id) > 0 ? `, ${nombre(lineaireSecteurs(z.id), 0)} ml` : ''}
                  </span>
                </span>
                {peutModifier && (
                  <span className="actions">
                    <button onClick={() => setEdition(`zone:${z.id}`)}>Modifier</button>
                    <button onClick={() => ecrire('zones', z.id, { actif: !z.actif })}>{z.actif ? 'Désactiver' : 'Réactiver'}</button>
                  </span>
                )}
              </div>
            )}
            <div className="secteurs-zone">
              {secteurs.filter((s) => s.zone_id === z.id && visibles(s.actif)).map((s) =>
                edition === `secteur:${s.id}` ? (
                  <FormSecteur key={s.id} zones={zones} initial={s} onSubmit={(v) => ecrire('secteurs', s.id, v)} annuler={() => setEdition('')} />
                ) : (
                  <div key={s.id} className="ligne-param ligne-secteur">
                    <span className={s.actif ? '' : 'discret'}>
                      <strong>{s.code}</strong> · {s.libelle}
                      {s.lineaire_m != null ? ` · ${nombre(s.lineaire_m, 0)} ml` : ''}
                      <span className="discret"> · ordre {s.ordre}</span>
                      {s.actif ? '' : ' (désactivé)'}
                    </span>
                    {peutModifier && (
                      <span className="actions">
                        <button className="petit" onClick={() => setEdition(`secteur:${s.id}`)}>Modifier</button>
                        <button className="petit" onClick={() => ecrire('secteurs', s.id, { actif: !s.actif })}>
                          {s.actif ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </span>
                    )}
                  </div>
                ),
              )}
              {peutCreer && z.actif &&
                (edition === `secteur:${z.id}:` ? (
                  <FormSecteur
                    zones={zones}
                    zoneId={z.id}
                    ordreSuivant={Math.max(0, ...secteurs.filter((s) => s.zone_id === z.id).map((s) => s.ordre)) + 1}
                    onSubmit={(v) => ecrire('secteurs', null, v)}
                    annuler={() => setEdition('')}
                  />
                ) : (
                  <button className="petit" onClick={() => setEdition(`secteur:${z.id}:`)}>+ Secteur dans la zone {z.code}</button>
                ))}
            </div>
          </div>
        ))}
        {peutCreer &&
          (edition === 'zone:' ? (
            <FormZone
              numeroSuivant={Math.max(0, ...zones.map((z) => z.numero)) + 1}
              onSubmit={(v) => ecrire('zones', null, v)}
              annuler={() => setEdition('')}
            />
          ) : (
            <button onClick={() => setEdition('zone:')}>+ Ajouter une zone</button>
          ))}
      </section>
    </>
  );
}

function FormZone({
  initial, numeroSuivant, onSubmit, annuler,
}: {
  initial?: Zone; numeroSuivant?: number; onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [numero, setNumero] = useState(String(initial?.numero ?? numeroSuivant ?? 1));
  const [code, setCode] = useState(initial?.code ?? '');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [lineaire, setLineaire] = useState(initial?.lineaire_m != null ? String(initial.lineaire_m) : '');
  const [debit, setDebit] = useState(initial?.q_exige_m3h != null ? String(initial.q_exige_m3h) : '');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      numero: Number(numero), code: code.trim(), libelle: libelle.trim(),
      lineaire_m: enNombre(lineaire), q_exige_m3h: enNombre(debit),
    });
  };
  const valide = entierValide(numero) && code.trim() && libelle.trim() && nombreValide(lineaire) && nombreValide(debit);
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="trois">
        <label>Numéro<input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" required /></label>
        <label>Code<input value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        <label>Libellé<input value={libelle} onChange={(e) => setLibelle(e.target.value)} required /></label>
      </div>
      <div className="deux">
        <label>Linéaire (ml)<input value={lineaire} onChange={(e) => setLineaire(e.target.value)} inputMode="decimal" /></label>
        <label>Débit nocturne exigé (m3/h)<input value={debit} onChange={(e) => setDebit(e.target.value)} inputMode="decimal" /></label>
      </div>
      <div className="actions">
        <button className="primaire" disabled={!valide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}

function FormSecteur({
  zones, initial, zoneId, ordreSuivant, onSubmit, annuler,
}: {
  zones: Zone[]; initial?: Secteur; zoneId?: string; ordreSuivant?: number;
  onSubmit: (v: Record<string, unknown>) => void; annuler: () => void;
}) {
  const [zone, setZone] = useState(initial?.zone_id ?? zoneId ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [libelle, setLibelle] = useState(initial?.libelle ?? '');
  const [ordre, setOrdre] = useState(String(initial?.ordre ?? ordreSuivant ?? 1));
  const [lineaire, setLineaire] = useState(initial?.lineaire_m != null ? String(initial.lineaire_m) : '');
  const envoyer = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ zone_id: zone, code: code.trim(), libelle: libelle.trim(), ordre: Number(ordre), lineaire_m: enNombre(lineaire) });
  };
  const valide = zone && code.trim() && libelle.trim() && entierValide(ordre) && nombreValide(lineaire);
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="trois">
        {/* Convention : secteurs en capitales, code court. */}
        <label>Code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="QODS-H" required /></label>
        <label>Libellé<input value={libelle} onChange={(e) => setLibelle(e.target.value.toLocaleUpperCase('fr'))} placeholder="QODS HAUT" required /></label>
        <label>
          Zone
          <select value={zone} onChange={(e) => setZone(e.target.value)} required>
            {zones.filter((z) => z.actif || z.id === zone).map((z) => <option key={z.id} value={z.id}>{z.code} · {z.libelle}</option>)}
          </select>
        </label>
      </div>
      <div className="deux">
        <label>Linéaire (ml)<input value={lineaire} onChange={(e) => setLineaire(e.target.value)} inputMode="decimal" /></label>
        <label>Ordre d&apos;affichage<input value={ordre} onChange={(e) => setOrdre(e.target.value)} inputMode="numeric" /></label>
      </div>
      <div className="actions">
        <button className="primaire" disabled={!valide}>Enregistrer</button>
        <button type="button" onClick={annuler}>Annuler</button>
      </div>
    </form>
  );
}
