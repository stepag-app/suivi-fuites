'use client';

// Paramètres › Tablettes (lot TP, administrateur) : tablettes des agents verrouillées par Suivi fuites.
//  * code temporaire de 8 chiffres (déverrouiller 15 min, 1 h ou 4 h, ou libérer définitivement), valable 24 h, une fois ;
//  * QR code de préparation d'une tablette neuve ou réinitialisée (six touchers sur le premier écran, puis lecture) ;
//  * journal (codes, déverrouillages, reverrouillages, mises à jour).
// Explication pour l'administrateur et son binôme : note Claude Docs « Briefing — Tablettes verrouillées Suivi fuites ».
import qrcode from 'qrcode-generator';
import { Copy, KeyRound, Printer, QrCode, ScrollText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dateHeure, messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import { ModeEmploiTablettes } from './ModeEmploiTablettes';

// Certificat de signature STEPAG (keystore gardé jusqu'à nouvel ordre) : SHA-256 en base64url, vérifié par Android avant
// de déclarer l'appli propriétaire. Pas un secret. À refaire si le keystore change (apksigner verify --print-certs).
const EMPREINTE_CERTIFICAT = 'lAk4rwIhT37RANsCm05FTaIHLjzDspDMqw2_RV4oeAo';
const COMPOSANT_ADMIN = 'ma.stepag.suivifuites/ma.stepag.tablette.RecepteurAdmin';

/** Contenu du QR code de préparation (Android Enterprise) ; l'APK vient de la fonction apk-enrolement. */
export function contenuQrPreparation(urlSupabase: string): string {
  return JSON.stringify({
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': COMPOSANT_ADMIN,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': `${urlSupabase.replace(/\/$/, '')}/functions/v1/apk-enrolement`,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': EMPREINTE_CERTIFICAT,
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
    'android.app.extra.PROVISIONING_USE_MOBILE_DATA': true,
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': { profil: 'agent' },
  });
}

const CHOIX = [
  { valeur: 'deverrouiller-15', libelle: 'Déverrouiller 15 minutes' },
  { valeur: 'deverrouiller-60', libelle: 'Déverrouiller 1 heure' },
  { valeur: 'deverrouiller-240', libelle: 'Déverrouiller 4 heures' },
  { valeur: 'liberer', libelle: 'Libérer la tablette (définitif)' },
] as const;
type Choix = (typeof CHOIX)[number]['valeur'];

const ACTIONS: Record<string, string> = {
  code_cree: 'Code créé',
  deverrouillage: 'Déverrouillée',
  liberation: 'Libérée',
  code_refuse: 'Code refusé',
  reverrouillage: 'Reverrouillée',
  mise_a_jour: 'Appli mise à jour',
  installation_echec: 'Mise à jour refusée',
  preparation: 'Préparée (QR code)',
  transfert: 'Propriété transférée',
  transfert_recu: 'Propriété reçue',
  wifi: 'Wi-Fi rejoint',
  fuseau: 'Fuseau corrigé (GMT)',
};

interface LigneJournal {
  id: number; appareil: string | null; modele: string | null; action: string; details: Record<string, unknown>;
  compte: string | null; survenu_le: string;
}
interface LigneCode {
  id: string; type: 'deverrouiller' | 'liberer'; minutes: number | null; motif: string | null; cree_par: string;
  cree_le: string; expire_le: string; utilise_le: string | null; utilise_appareil: string | null; utilise_modele: string | null;
}

const duree = (minutes: number | null | undefined) =>
  minutes == null ? '' : minutes < 60 ? `${minutes} min` : `${minutes / 60} h`;
const tablette = (appareil: string | null, modele: string | null) =>
  appareil ? `${modele ?? 'Tablette'} · ${appareil.slice(-6)}` : '—';

function detailJournal(l: LigneJournal): string {
  const d = l.details ?? {};
  const morceaux: string[] = [];
  if (l.action === 'code_cree') morceaux.push(d.type === 'liberer' ? 'libération' : `déverrouillage ${duree(d.minutes as number)}`);
  if (l.action === 'deverrouillage') morceaux.push(duree(d.minutes as number));
  if (typeof d.motif === 'string' && d.motif) morceaux.push(d.motif);
  if (l.action === 'reverrouillage') {
    morceaux.push(d.automatique ? 'à l’heure prévue' : 'par le bouton');
    const gardees = Array.isArray(d.gardees) ? (d.gardees as string[]) : [];
    if (gardees.length) morceaux.push(`applis gardées : ${gardees.join(', ')}`);
  }
  if (l.action === 'installation_echec' && typeof d.message === 'string') morceaux.push(d.message);
  if (l.action === 'wifi' && typeof d.ssid === 'string') morceaux.push(d.ssid);
  return morceaux.join(' · ');
}

export function OngletTablettes() {
  const [choix, setChoix] = useState<Choix>('deverrouiller-60');
  const [motif, setMotif] = useState('');
  const [code, setCode] = useState<{ code: string; libelle: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [journal, setJournal] = useState<LigneJournal[]>([]);
  const [codes, setCodes] = useState<LigneCode[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [j, c] = await Promise.all([
      sb.from('journal_tablettes').select('id, appareil, modele, action, details, compte, survenu_le')
        .order('survenu_le', { ascending: false }).limit(100),
      sb.from('codes_tablette').select('id, type, minutes, motif, cree_par, cree_le, expire_le, utilise_le, utilise_appareil, utilise_modele')
        .order('cree_le', { ascending: false }).limit(20),
    ]);
    if (j.error || c.error) {
      setErreur(messageErreur(j.error ?? c.error));
      return;
    }
    const lj = (j.data as LigneJournal[] | null) ?? [];
    const lc = (c.data as LigneCode[] | null) ?? [];
    setJournal(lj);
    setCodes(lc);
    const ids = [...new Set([...lj.map((l) => l.compte), ...lc.map((l) => l.cree_par)].filter((x): x is string => !!x))];
    if (ids.length) {
      const { data } = await sb.from('profils').select('id, nom_complet').in('id', ids);
      setNoms(Object.fromEntries(((data as { id: string; nom_complet: string }[] | null) ?? []).map((p) => [p.id, p.nom_complet])));
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);

  async function generer(e: FormEvent) {
    e.preventDefault();
    if (choix === 'liberer' && !window.confirm(
      'Un code « Libérer » rend la tablette définitivement libre (toutes les applis et tous les réglages). Pour la reverrouiller, il faudra la réinitialiser puis lire le QR code. Continuer ?',
    )) return;
    setOccupe(true);
    setErreur('');
    setCode(null);
    const [type, minutes] = choix === 'liberer' ? ['liberer', null] : ['deverrouiller', Number(choix.split('-')[1])];
    const { data, error } = await getSupabase().rpc('creer_code_tablette', { p_type: type, p_minutes: minutes, p_motif: motif.trim() || null });
    setOccupe(false);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    setCode({ code: String(data), libelle: CHOIX.find((c) => c.valeur === choix)?.libelle ?? '' });
    setMotif('');
    void charger();
  }

  // Android exige une adresse https complète (absente en mode démonstration : QR code non affiché).
  const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const qrPossible = /^https:\/\/[^/]+/.test(urlSupabase);
  const contenu = useMemo(() => contenuQrPreparation(urlSupabase), [urlSupabase]);
  const svgQr = useMemo(() => {
    const qr = qrcode(0, 'L');
    qr.addData(contenu);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  }, [contenu]);

  function imprimerQr() {
    const fenetre = window.open('', '_blank');
    if (!fenetre) return;
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QR code de préparation des tablettes</title>
<style>body{font-family:system-ui,sans-serif;margin:32px;color:#111}h1{font-size:22px}.qr{width:12cm;height:12cm;margin:16px 0}
ol{font-size:15px;line-height:1.6}p{font-size:13px;color:#555}</style></head><body>
<h1>Suivi fuites : préparer une tablette d'agent</h1>
<div class="qr">${svgQr}</div>
<ol>
<li>Tablette neuve ou réinitialisée, carte SIM insérée, allumée sur le premier écran (choix de la langue).</li>
<li>Toucher 6 fois le même endroit vide de l'écran : le lecteur de QR code s'ouvre.</li>
<li>Viser ce QR code. Android télécharge Suivi fuites et la déclare propriétaire de la tablette (environ 10 minutes).</li>
<li>Sur l'écran d'accueil : ouvrir Suivi fuites et connecter l'agent.</li>
<li>Panneau web › Paramètres › Tablettes : générer un code « Déverrouiller 1 heure », le taper dans Suivi fuites (bouton Tablette),
ajouter le compte Google des tablettes, installer WhatsApp depuis le Play Store, puis « Reverrouiller maintenant ».</li>
</ol>
<p>Ce QR code ne change pas d'une version à l'autre de l'appli. Il ne contient aucun mot de passe.</p>
</body></html>`);
    fenetre.document.close();
    fenetre.focus();
    fenetre.print();
  }

  const nom = (id: string | null) => (id ? noms[id] ?? '…' : '—');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">Déverrouiller une tablette, préparer la première, maintenance : tout est expliqué pas à pas.</p>
        <ModeEmploiTablettes />
      </div>
      {erreur && <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-normal"><KeyRound className="size-4" />Code de déverrouillage</CardTitle>
          <CardDescription>
            Code de 8 chiffres, valable 24 heures, une seule fois, sur n&apos;importe quelle tablette. Sur la tablette :
            Suivi fuites › bouton <strong>Tablette</strong> › taper le code. Elle se reverrouille seule à la fin de la durée.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={generer} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-sm">
              Type
              <NativeSelect value={choix} onChange={(e) => setChoix(e.target.value as Choix)} className="sm:w-64">
                {CHOIX.map((c) => <NativeSelectOption key={c.valeur} value={c.valeur}>{c.libelle}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Motif (facultatif)
              <Input value={motif} maxLength={200} onChange={(e) => setMotif(e.target.value)} placeholder="ex. installer une appli, régler le Wi-Fi" />
            </label>
            <Button type="submit" disabled={occupe}>Générer un code</Button>
          </form>
          {code && (
            <div className="flex flex-col items-start gap-2 rounded-lg border bg-muted/40 p-4">
              <p className="text-muted-foreground text-sm">{code.libelle} · à noter maintenant : il ne s&apos;affichera plus.</p>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-4xl tabular-nums tracking-[0.2em]">{code.code.slice(0, 4)} {code.code.slice(4)}</span>
                <Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(code.code)}>
                  <Copy data-icon="inline-start" />Copier
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-normal"><QrCode className="size-4" />QR code de préparation</CardTitle>
          <CardDescription>
            Pour une tablette neuve ou réinitialisée : six touchers sur le premier écran, puis lecture de ce QR code. Android
            télécharge Suivi fuites, la déclare propriétaire et pose le verrou. Le QR code ne change pas d&apos;une version à l&apos;autre.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 sm:flex-row">
          {!qrPossible ? <p className="text-muted-foreground text-sm">Adresse du serveur absente (mode démonstration) : QR code indisponible.</p> : <>
          {/* SVG produit par qrcode-generator à partir d'un texte fixe (aucune donnée saisie). */}
          <div className="size-56 shrink-0 rounded-lg border bg-white p-2" dangerouslySetInnerHTML={{ __html: svgQr }} />
          <div className="flex flex-col gap-2 text-sm">
            <Button variant="outline" onClick={imprimerQr}><Printer data-icon="inline-start" />Imprimer avec le mode d&apos;emploi</Button>
            <p className="text-muted-foreground">
              Après la préparation : un code « Déverrouiller 1 heure » pour ajouter le compte Google des tablettes et installer
              WhatsApp. Jamais le compte <code>stepag.app@gmail.com</code> sur une tablette.
            </p>
          </div>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-normal"><ScrollText className="size-4" />Codes récents</CardTitle>
          <CardDescription>Les 20 derniers codes ; le code lui-même n&apos;est pas gardé.</CardDescription>
        </CardHeader>
        <CardContent>
          {codes.length === 0 ? <p className="text-muted-foreground text-sm">Aucun code.</p> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Créé le</TableHead><TableHead>Par</TableHead><TableHead>Type</TableHead><TableHead>Motif</TableHead><TableHead>Utilisé</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{dateHeure(c.cree_le)}</TableCell>
                    <TableCell>{nom(c.cree_par)}</TableCell>
                    <TableCell>{c.type === 'liberer' ? 'Libérer' : `Déverrouiller ${duree(c.minutes)}`}</TableCell>
                    <TableCell className="max-w-64 truncate">{c.motif ?? ''}</TableCell>
                    <TableCell>
                      {c.utilise_le ? `${dateHeure(c.utilise_le)} · ${tablette(c.utilise_appareil, c.utilise_modele)}`
                        : new Date(c.expire_le) < new Date() ? 'expiré' : `valable jusqu'au ${dateHeure(c.expire_le)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-normal">Journal des tablettes</CardTitle>
          <CardDescription>Les 100 derniers événements ; heure de la tablette pour ceux notés hors ligne.</CardDescription>
        </CardHeader>
        <CardContent>
          {journal.length === 0 ? <p className="text-muted-foreground text-sm">Aucun événement.</p> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Quand</TableHead><TableHead>Tablette</TableHead><TableHead>Événement</TableHead><TableHead>Compte</TableHead><TableHead>Détail</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {journal.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{dateHeure(l.survenu_le)}</TableCell>
                    <TableCell>{tablette(l.appareil, l.modele)}</TableCell>
                    <TableCell>{ACTIONS[l.action] ?? l.action}</TableCell>
                    <TableCell>{nom(l.compte)}</TableCell>
                    <TableCell className="max-w-80 truncate">{detailJournal(l)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
