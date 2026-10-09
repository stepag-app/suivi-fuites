'use client';

// Briques des formulaires de saisie de la fiche (réparation, réfection, correction de la détection) :
// étapes numérotées (ordre P1), choix en boutons, nombres, avertissements, capsules de pièces (P3),
// récapitulatif avant confirmation (P4).
import { Minus, Plus, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nombre } from '@/lib/format';
import {
  capsulesProposees, changerQuantite, chercherArticles, type Article, type Avertissement, type LignePiece,
} from '@/lib/saisie/regles';
import { cn } from '@/lib/utils';

export function Etape({ n, titre, aide, children, className }: { n: number; titre: string; aide?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('grid gap-3 border-b py-4 last:border-b-0 sm:grid-cols-[13rem_minmax(0,1fr)]', className)}>
      <div className="flex gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-medium text-primary text-xs tabular-nums">{n}</span>
        <div className="flex flex-col gap-0.5">
          <h4 className="font-medium text-sm leading-6">{titre}</h4>
          {aide && <p className="text-muted-foreground text-xs">{aide}</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

/** Choix unique en boutons (gros, lisibles sur la tablette) ; un second clic sur le choix l'efface si `effacable`. */
export function Choix<T extends string>({
  valeur, options, onChange, effacable, libelle, taille = 'default',
}: {
  valeur: T | '';
  options: [T, string][];
  onChange: (v: T | '') => void;
  effacable?: boolean;
  libelle: string;
  taille?: 'default' | 'sm';
}) {
  return (
    <div role="radiogroup" aria-label={libelle} className="flex flex-wrap gap-2">
      {options.map(([k, t]) => {
        const actif = valeur === k;
        return (
          <Button key={k} type="button" role="radio" aria-checked={actif} size={taille} variant={actif ? 'default' : 'outline'}
            onClick={() => onChange(actif && effacable ? '' : k)}>
            {t}
          </Button>
        );
      })}
    </div>
  );
}

/** Case à cocher en bouton (travaux réalisés). */
export function Bascule({ actif, onChange, children }: { actif: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Button type="button" role="checkbox" aria-checked={actif} variant={actif ? 'default' : 'outline'} onClick={() => onChange(!actif)} className="justify-start">
      <span className={cn('grid size-4 place-items-center rounded-sm border text-[0.65rem]', actif ? 'border-primary-foreground' : 'border-muted-foreground/50')}>{actif ? '✓' : ''}</span>
      {children}
    </Button>
  );
}

export function ChampMetres({ id, libelle, valeur, onChange, unite = 'm', invalide }: {
  id: string; libelle: string; valeur: string; onChange: (v: string) => void; unite?: string; invalide?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground text-xs">{libelle}</span>
      <span className="flex items-center gap-1.5">
        <Input id={id} value={valeur} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="w-24 text-right tabular-nums" aria-invalid={invalide || undefined} />
        <span className="text-muted-foreground">{unite}</span>
      </span>
    </label>
  );
}

export function Avertissements({ liste, titre = 'À vérifier' }: { liste: Avertissement[]; titre?: string }) {
  if (!liste.length) return null;
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50" role="status">
      <TriangleAlert />
      <AlertTitle>{titre}</AlertTitle>
      <AlertDescription className="text-amber-900/90 dark:text-amber-50/90">
        <ul className="list-disc pl-4">{liste.map((a, i) => <li key={i}>{a.message}</li>)}</ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Pièces posées (P3) : capsules des articles proposés selon le matériau et le diamètre (et les plus posés du
 * marché), un toucher ajoute, « − / + » règle la quantité ; recherche pour les autres articles.
 */
export function Capsules({
  articles, usages, materiau, diametre, lignes, onChange,
}: {
  articles: Article[];
  usages: Map<number, number>;
  materiau: string;
  diametre: number | null;
  lignes: LignePiece[];
  onChange: (l: LignePiece[]) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const proposes = useMemo(() => capsulesProposees(articles, { materiau, diametre }, usages), [articles, materiau, diametre, usages]);
  const trouves = useMemo(() => chercherArticles(articles, recherche), [articles, recherche]);
  // Capsules : proposés, puis ceux déjà choisis hors propositions (pour garder leur compteur sous les yeux)
  const visibles = [...proposes, ...lignes.filter((l) => !proposes.some((p) => p.id === l.produit_id))
    .map((l) => ({ id: l.produit_id, designation: l.designation, unite: l.unite }))];
  const quantite = (id: number) => lignes.find((l) => l.produit_id === id)?.quantite ?? 0;
  const changer = (a: Article, delta: number) => onChange(changerQuantite(lignes, a, delta));

  return (
    <div className="flex flex-col gap-3">
      {visibles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibles.map((a) => <Capsule key={a.id} article={a} quantite={quantite(a.id)} changer={changer} />)}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Aucun article proposé pour ce matériau et ce diamètre : cherchez-le ci-dessous.</p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un autre article (ex. manchon 63)" className="pl-8" aria-label="Rechercher un article" />
      </div>
      {recherche.trim() && (
        trouves.length === 0 ? <p className="text-muted-foreground text-sm">Aucun article : notez-le en observation, le bureau l&apos;ajoutera après sa création dans Dolibarr.</p> : (
          <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border">
            {trouves.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 border-b px-3 py-1.5 last:border-b-0">
                <span className="text-sm">{a.designation}</span>
                {quantite(a.id) > 0
                  ? <Compteur article={a} quantite={quantite(a.id)} changer={changer} />
                  : <Button type="button" size="xs" variant="outline" onClick={() => changer(a, 1)}><Plus data-icon="inline-start" />Ajouter</Button>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function Capsule({ article, quantite, changer }: { article: Article; quantite: number; changer: (a: Article, d: number) => void }) {
  if (!quantite) {
    return (
      <button type="button" onClick={() => changer(article, 1)}
        className="rounded-full border bg-background px-3 py-1.5 text-left text-sm hover:bg-muted">
        {article.designation}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full border border-primary bg-primary/10 py-0.5 pr-1 pl-3 text-sm">
      <span className="font-medium">{article.designation}</span>
      <Compteur article={article} quantite={quantite} changer={changer} />
    </span>
  );
}

function Compteur({ article, quantite, changer }: { article: Article; quantite: number; changer: (a: Article, d: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Une ${article.designation} de moins`} onClick={() => changer(article, -1)}><Minus /></Button>
      <span className="min-w-6 text-center font-medium tabular-nums">{nombre(quantite)}</span>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Une ${article.designation} de plus`} onClick={() => changer(article, 1)}><Plus /></Button>
      <span className="text-muted-foreground text-xs">{article.unite || 'u'}</span>
    </span>
  );
}

/** Récapitulatif avant confirmation (P4), « comme une borne de commande ». */
export function Recapitulatif({ titre, lignes, pieces, avertissements }: {
  titre: string;
  lignes: [string, ReactNode][];
  pieces?: LignePiece[];
  avertissements: Avertissement[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <h4 className="font-heading font-medium text-base">{titre}</h4>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
        {lignes.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {pieces && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-sm">Pièces posées</span>
          {pieces.length === 0 ? <span className="text-sm">Aucune</span> : (
            <ul className="flex flex-col divide-y rounded-lg border text-sm">
              {pieces.map((p) => (
                <li key={p.produit_id} className="flex justify-between gap-4 px-3 py-1.5">
                  <span>{p.designation}</span>
                  <span className="font-medium tabular-nums">{nombre(p.quantite)} {p.unite || 'u'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Avertissements liste={avertissements} titre="Avertissements (l'enregistrement reste possible)" />
    </div>
  );
}
