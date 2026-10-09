'use client';

// Paramètres > Marché, réglages de la saisie terrain (chantier v2, contrat S2 § 2 et § 4) : champs obligatoires
// de la fuite (contrôlés en base, tablette comprise), diamètres proposés par matériau, représentants du maître
// d'ouvrage. On désactive, on ne supprime pas. Droits : « paramètres / créer » pour ajouter, « modifier » sinon.
import { Plus, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { MATERIAUX, libellesMarche, messageErreur } from '@/lib/format';
import { CHAMPS_F1, CHAMPS_FUITE, libelleChampFuite, minusculeInitiale, sigleDiametre, type ChampFuite } from '@/lib/saisie/regles';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';

interface Diametre { id: string; materiau: string; diametre_mm: number; source: 'standard' | 'reseau' | 'manuel'; actif: boolean }
interface Representant { id: string; nom: string; ordre: number; actif: boolean }

const SOURCES: Record<Diametre['source'], string> = { standard: 'liste standard', reseau: 'tiré du réseau', manuel: 'ajouté' };

export function ParametresSaisie({ marcheId, peutCreer, peutModifier }: { marcheId: string; peutCreer: boolean; peutModifier: boolean }) {
  const { marche } = useSession();
  const libelles = libellesMarche(marche);
  const [champs, setChamps] = useState<string[] | null>(null);
  const [diametres, setDiametres] = useState<Diametre[]>([]);
  const [representants, setRepresentants] = useState<Representant[]>([]);
  const [absent, setAbsent] = useState(false);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [m, d, r] = await Promise.all([
      sb.from('marches').select('champs_obligatoires_fuite').eq('id', marcheId).maybeSingle(),
      sb.from('diametres_materiau').select('id, materiau, diametre_mm, source, actif').eq('marche_id', marcheId).order('materiau').order('diametre_mm'),
      sb.from('representants_srm').select('id, nom, ordre, actif').eq('marche_id', marcheId).order('ordre').order('nom'),
    ]);
    const premiere = m.error || d.error || r.error;
    // Base pas encore à jour (contrats S2 absents) : bloc masqué
    setAbsent(!!premiere && ['42703', '42P01', 'PGRST205'].includes(premiere.code ?? ''));
    setErreur(premiere ? messageErreur(premiere) : '');
    setChamps(((m.data as { champs_obligatoires_fuite?: string[] } | null)?.champs_obligatoires_fuite) ?? []);
    setDiametres((d.data as Diametre[] | null) ?? []);
    setRepresentants((r.data as Representant[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ecrire(action: () => PromiseLike<{ error: { code?: string; message: string } | null }>, doublon: string): Promise<boolean> {
    setErreur('');
    setOccupe(true);
    const { error } = await action();
    setOccupe(false);
    if (error) {
      setErreur(error.code === '23505' ? doublon : messageErreur(error));
      return false;
    }
    await charger();
    return true;
  }

  if (absent) return null;

  const basculerChamp = (c: ChampFuite, coche: boolean) => {
    const liste = new Set(champs ?? []);
    if (coche) liste.add(c); else liste.delete(c);
    void ecrire(() => getSupabase().from('marches').update({ champs_obligatoires_fuite: CHAMPS_FUITE.filter((x) => liste.has(x)) }).eq('id', marcheId), '');
  };

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}

      <section className="carte">
        <h2>Champs obligatoires d&apos;une nouvelle fuite</h2>
        <p className="discret">
          Contrôlés par la base pour toute nouvelle fuite (panneau et tablette). Le formulaire du panneau exige toujours la
          {' '}{minusculeInitiale(libelles.reference)}, le secteur, l&apos;ouvrage, la visibilité et la nature de dégradation (F1) ; décocher un
          champ ici n&apos;assouplit que la base, par exemple pendant la mise à jour de la tablette.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CHAMPS_FUITE.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!champs?.includes(c)} disabled={!peutModifier || occupe || champs == null} onCheckedChange={(v) => basculerChamp(c, v === true)} />
              {libelleChampFuite(c, libelles.reference)}
              {CHAMPS_F1.includes(c) && <span className="text-muted-foreground text-xs">(exigé par le panneau)</span>}
            </label>
          ))}
        </div>
        {champs?.length === 0 && <p className="mt-2 text-amber-700 text-sm dark:text-amber-300">Aucun champ contrôlé par la base pour l&apos;instant.</p>}
      </section>

      <section className="carte">
        <h2>Diamètres proposés par matériau</h2>
        <p className="discret">
          Liste des réparations et des fuites selon le matériau choisi (mm : DE pour le PE et le PPR, DN sinon). Les diamètres
          du plan du réseau s&apos;ajoutent d&apos;eux-mêmes. Un diamètre retiré reste sur les saisies existantes.
        </p>
        <div className="mt-3 flex flex-col divide-y">
          {Object.entries(MATERIAUX).filter(([k]) => k !== 'autre').map(([k, libelle]) => (
            <LigneMateriau key={k} materiau={k} libelle={libelle} diametres={diametres.filter((d) => d.materiau === k)}
              peutCreer={peutCreer} peutModifier={peutModifier} occupe={occupe}
              ajouter={(mm) => ecrire(() => getSupabase().from('diametres_materiau').insert({ marche_id: marcheId, materiau: k, diametre_mm: mm, source: 'manuel' }), `Ø ${mm} existe déjà pour ce matériau (réactivez-le).`)}
              basculer={(d) => ecrire(() => getSupabase().from('diametres_materiau').update({ actif: !d.actif }).eq('id', d.id), '')} />
          ))}
        </div>
        <p className="discret mt-2">Matériau « Autre » : diamètre saisi librement.</p>
      </section>

      <section className="carte">
        <h2>Représentants du maître d&apos;ouvrage</h2>
        <p className="discret">Proposés à la saisie d&apos;une réparation (« Représentant {libelles.sigle} présent », facultatif).</p>
        <Representants liste={representants} peutCreer={peutCreer} peutModifier={peutModifier} occupe={occupe}
          ajouter={(nom) => ecrire(() => getSupabase().from('representants_srm').insert({
            marche_id: marcheId, nom, ordre: Math.max(0, ...representants.map((r) => r.ordre)) + 1,
          }), 'Ce nom est déjà dans la liste (réactivez-le).')}
          modifier={(r, valeurs) => ecrire(() => getSupabase().from('representants_srm').update(valeurs).eq('id', r.id), 'Ce nom est déjà dans la liste.')} />
      </section>
    </>
  );
}

function LigneMateriau({ materiau, libelle, diametres, peutCreer, peutModifier, occupe, ajouter, basculer }: {
  materiau: string; libelle: string; diametres: Diametre[]; peutCreer: boolean; peutModifier: boolean; occupe: boolean;
  ajouter: (mm: number) => Promise<boolean>; basculer: (d: Diametre) => void;
}) {
  const [nouveau, setNouveau] = useState('');
  const actifs = diametres.filter((d) => d.actif);
  const retires = diametres.filter((d) => !d.actif);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const mm = Number(nouveau.replace(',', '.'));
    if (!Number.isInteger(mm) || mm <= 0 || mm > 3000) return;
    if (await ajouter(mm)) setNouveau('');
  }

  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="text-sm">
        <span className="font-medium">{libelle}</span>
        <span className="block text-muted-foreground text-xs">{sigleDiametre(materiau)} · {actifs.length} diamètre{actifs.length > 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {actifs.map((d) => (
            <Badge key={d.id} variant="outline" className="gap-1 rounded-sm tabular-nums" title={SOURCES[d.source]}>
              {d.diametre_mm}
              {d.source === 'reseau' && <span className="text-sky-600 text-[0.65rem]">réseau</span>}
              {peutModifier && (
                <button type="button" data-slot="badge-action" aria-label={`Retirer ${d.diametre_mm}`} disabled={occupe} onClick={() => basculer(d)}
                  className="-mr-1 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3" /></button>
              )}
            </Badge>
          ))}
          {actifs.length === 0 && <span className="text-muted-foreground text-sm">Aucun : saisie libre.</span>}
        </div>
        {retires.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            Retirés :
            {retires.map((d) => (
              <Button key={d.id} type="button" size="xs" variant="ghost" disabled={!peutModifier || occupe} onClick={() => basculer(d)} title="Réactiver">
                <span className="line-through">{d.diametre_mm}</span>{peutModifier && <RotateCcw />}
              </Button>
            ))}
          </div>
        )}
        {peutCreer && (
          <form onSubmit={soumettre} className="flex items-center gap-2">
            <Input value={nouveau} onChange={(e) => setNouveau(e.target.value)} inputMode="numeric" placeholder="Ø mm" className="h-7 w-24" aria-label={`Nouveau diamètre ${libelle}`} />
            <Button type="submit" size="sm" variant="outline" disabled={occupe || !nouveau.trim()}><Plus data-icon="inline-start" />Ajouter</Button>
          </form>
        )}
      </div>
    </div>
  );
}

function Representants({ liste, peutCreer, peutModifier, occupe, ajouter, modifier }: {
  liste: Representant[]; peutCreer: boolean; peutModifier: boolean; occupe: boolean;
  ajouter: (nom: string) => Promise<boolean>; modifier: (r: Representant, valeurs: Partial<Representant>) => Promise<boolean>;
}) {
  const [nom, setNom] = useState('');
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (nom.trim() && await ajouter(nom.trim())) setNom('');
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {liste.length === 0 && <p className="text-muted-foreground text-sm">Aucun représentant.</p>}
      <ul className="flex flex-col divide-y rounded-lg border">
        {liste.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            {edition?.id === r.id ? (
              <form className="flex flex-1 items-center gap-2" onSubmit={async (e) => {
                e.preventDefault();
                if (edition.nom.trim() && await modifier(r, { nom: edition.nom.trim() })) setEdition(null);
              }}>
                <Input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} className="h-7" autoFocus aria-label="Nom" />
                <Button type="submit" size="sm" disabled={occupe}>Enregistrer</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEdition(null)}>Annuler</Button>
              </form>
            ) : (
              <>
                <span className={r.actif ? 'text-sm' : 'text-muted-foreground text-sm line-through'}>{r.nom}</span>
                {peutModifier && (
                  <span className="flex gap-1">
                    {r.actif && <Button type="button" size="xs" variant="ghost" onClick={() => setEdition({ id: r.id, nom: r.nom })}>Renommer</Button>}
                    <Button type="button" size="xs" variant="ghost" disabled={occupe} onClick={() => modifier(r, { actif: !r.actif })}>{r.actif ? 'Désactiver' : 'Réactiver'}</Button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {peutCreer && (
        <form onSubmit={soumettre} className="flex items-center gap-2">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom du représentant" className="h-8 max-w-72" aria-label="Nouveau représentant" />
          <Button type="submit" size="sm" variant="outline" disabled={occupe || !nom.trim()}>{occupe ? <Spinner /> : <Plus data-icon="inline-start" />}Ajouter</Button>
        </form>
      )}
    </div>
  );
}
