'use client';

// Mini-carte servie à l'APK (F4) : la tablette ouvre `/session#…&suite=/mini-carte?marche=…&lat=…&lng=…&precision=…`
// dans une WebView, l'agent ajuste l'épingle, la page renvoie la position et la conduite la plus proche par
// postMessage. Page hors de la mise en page de l'application (aucun menu). Contrat : docs/lots/chantier-v2-mini-carte.md.
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { lireMessageGps, lireParametresMiniCarte, texte, type MessageMiniCarte } from '@/lib/reseau/mini-carte';
import { useSession } from '@/lib/session';
import type { PositionGps, ResultatMiniCarte } from '../(app)/carte/MiniCarte';

const MiniCarte = dynamic(() => import('../(app)/carte/MiniCarte').then((m) => m.MiniCarte), { ssr: false });

type FenetreApk = Window & {
  ReactNativeWebView?: { postMessage: (m: string) => void };
  miniCarte?: { gps: (latitude: number, longitude: number, precision?: number | null) => void };
};

/** Vers l'APK (WebView React Native) ; dans un cadre ou une fenêtre ouverte par le panneau : vers la page parente. */
function envoyer(message: MessageMiniCarte) {
  const w = window as FenetreApk;
  const json = JSON.stringify(message);
  if (w.ReactNativeWebView) w.ReactNativeWebView.postMessage(json);
  else if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
  else if (window.opener) (window.opener as Window).postMessage(message, window.location.origin);
  window.dispatchEvent(new CustomEvent('mini-carte', { detail: message }));
}

export default function PageMiniCarte() {
  return (
    <Suspense fallback={null}>
      <Contenu />
    </Suspense>
  );
}

function Contenu() {
  const { session, marche, chargement } = useSession();
  const parametres = useSearchParams();
  const p = useMemo(() => lireParametresMiniCarte(new URLSearchParams(parametres?.toString() ?? '')), [parametres]);
  const marcheId = p.marcheId ?? marche?.id ?? null;
  const probleme = chargement ? null : !session ? 'session_absente' : !marcheId ? 'marche_absent' : null;
  useEffect(() => {
    if (probleme) envoyer({ type: 'mini-carte:erreur', version: 1, message: probleme });
  }, [probleme]);
  const [gps, setGps] = useState<PositionGps | null>(
    p.latitude != null && p.longitude != null ? { latitude: p.latitude, longitude: p.longitude, precision: p.precision } : null,
  );
  const dernier = useRef<ResultatMiniCarte | null>(null);
  const [pretAValider, setPretAValider] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  // Positions GPS envoyées par l'APK : postMessage (Android : événement sur document) ou window.miniCarte.gps(…).
  useEffect(() => {
    const recevoir = (e: Event) => {
      const g = lireMessageGps((e as MessageEvent).data);
      if (g) setGps(g);
    };
    window.addEventListener('message', recevoir);
    document.addEventListener('message', recevoir);
    (window as FenetreApk).miniCarte = { gps: (latitude, longitude, precision = null) => setGps({ latitude, longitude, precision }) };
    envoyer({ type: 'mini-carte:prete', version: 1 });
    return () => {
      window.removeEventListener('message', recevoir);
      document.removeEventListener('message', recevoir);
      delete (window as FenetreApk).miniCarte;
    };
  }, []);

  const surChangement = useCallback((r: ResultatMiniCarte) => {
    dernier.current = r;
    setPretAValider(true);
    setEnvoye(false);
    envoyer({ type: 'mini-carte:position', version: 1, ...r });
  }, []);

  const valider = () => {
    if (!dernier.current) return;
    envoyer({ type: 'mini-carte:valider', version: 1, ...dernier.current });
    setEnvoye(true);
  };

  if (chargement) return <p className="p-4 text-muted-foreground text-sm">Ouverture…</p>;
  if (probleme === 'session_absente') return <p className="p-4 text-sm">Session absente : ouvrez la mini-carte depuis l&apos;application de la tablette.</p>;
  if (!marcheId) return <p className="p-4 text-sm">Marché non précisé.</p>;

  return (
    <main className="fixed inset-0 flex flex-col bg-background" dir={p.langue === 'ar' ? 'rtl' : 'ltr'}>
      <MiniCarte marcheId={marcheId} gps={gps} langue={p.langue} satelliteInitial={p.satellite} surChangement={surChangement}
        className="relative min-h-0 flex-1 overflow-hidden bg-muted" />
      <div className="flex shrink-0 gap-2 border-t p-2">
        <Button variant="outline" size="lg" className="h-12 flex-1 text-base" onClick={() => envoyer({ type: 'mini-carte:annuler', version: 1 })}>
          {texte('annuler', p.langue)}
        </Button>
        <Button size="lg" className="h-12 flex-[2] text-base" disabled={!pretAValider} onClick={valider}>
          {envoye ? '✓ ' : ''}{texte('valider', p.langue)}
        </Button>
      </div>
    </main>
  );
}
