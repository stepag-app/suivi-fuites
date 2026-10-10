'use client';

// Paramètres › Marché, suivi GPS (compromis présenté aux agents, 2026-10-10) : heures et jours de travail (heure d'Oujda),
// durée d'une pause et total par jour. Hors de ces heures et pendant une pause, la tablette n'enregistre aucune position
// (et la base ignore tout point reçu). Réglage par regler_suivi_gps : responsable du marché et administrateur seulement.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import { heureCourte, texteJours } from '@/lib/trace-gps';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface Reglages {
  suivi_gps_debut: string; suivi_gps_fin: string; suivi_gps_jours: number[]; suivi_gps_pause_min: number; suivi_gps_pause_jour_min: number;
}

export function ReglagesSuiviGps({ marcheId, modifiable }: { marcheId: string; modifiable: boolean }) {
  const [lu, setLu] = useState<Reglages | null>(null);
  const [absent, setAbsent] = useState(false);
  const [debut, setDebut] = useState('08:00');
  const [fin, setFin] = useState('18:00');
  const [jours, setJours] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [pause, setPause] = useState('60');
  const [total, setTotal] = useState('90');
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await getSupabase().from('marches')
      .select('suivi_gps_debut, suivi_gps_fin, suivi_gps_jours, suivi_gps_pause_min, suivi_gps_pause_jour_min').eq('id', marcheId).maybeSingle();
    // Base pas encore à jour : bloc masqué.
    if (error && ['42703', 'PGRST204'].includes(error.code ?? '')) return setAbsent(true);
    if (error) return setErreur(messageErreur(error));
    const r = data as Reglages | null;
    if (!r) return;
    setLu(r);
    setDebut(heureCourte(r.suivi_gps_debut));
    // Saisie : minuit en fin de journée s'écrit 00:00.
    setFin(heureCourte(r.suivi_gps_fin) === '24:00' ? '00:00' : heureCourte(r.suivi_gps_fin));
    setJours(r.suivi_gps_jours);
    setPause(String(r.suivi_gps_pause_min));
    setTotal(String(r.suivi_gps_pause_jour_min));
  }, [marcheId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (absent) return null;

  const basculer = (j: number, coche: boolean) => setJours((x) => (coche ? [...new Set([...x, j])] : x.filter((y) => y !== j)).sort((a, b) => a - b));

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setErreur('');
    setFait('');
    const finSaisie = fin === '00:00' ? '24:00' : fin;
    if (finSaisie <= debut) return setErreur('La fin des heures de travail doit suivre leur début.');
    if (!jours.length) return setErreur('Cochez au moins un jour de travail.');
    const p = Number(pause);
    const t = Number(total);
    if (!Number.isInteger(p) || p < 5 || p > 240) return setErreur('Durée d\'une pause : de 5 à 240 minutes.');
    if (!Number.isInteger(t) || t < 0 || t > 480) return setErreur('Pauses par jour : de 0 à 480 minutes.');
    setOccupe(true);
    const { error } = await getSupabase().rpc('regler_suivi_gps', {
      p_marche: marcheId, p_debut: debut, p_fin: finSaisie, p_jours: jours, p_pause_min: p, p_pause_jour_min: t,
    });
    setOccupe(false);
    if (error) return setErreur(error.code === '42501' ? 'Réservé au responsable du marché et à l\'administrateur.' : messageErreur(error));
    setFait('Enregistré : les tablettes appliquent ces réglages à leur prochain contact avec le serveur (10 min au plus).');
    await charger();
  }

  return (
    <section className="carte">
      <h2>Suivi GPS : heures de travail et pauses</h2>
      <p className="discret">
        Le tracé prouve à la SRM le linéaire réellement balayé et sert à la sécurité des agents ; seuls le responsable et
        l&apos;administrateur le voient. La tablette n&apos;enregistre aucune position en dehors des heures de travail (heure
        d&apos;Oujda) ni pendant une pause, et la base ignore tout point reçu hors de ces heures. La pause reprend seule au bout de
        sa durée, et aussitôt que l&apos;agent signale une fuite ou coche un tronçon ; le responsable en voit le début, la fin et la
        durée, jamais le lieu. Réglage réservé au responsable du marché et à l&apos;administrateur.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
      {fait && <p className="text-emerald-700 text-sm dark:text-emerald-300">{fait}</p>}
      {!lu ? (
        !erreur && <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>
      ) : (
        <form onSubmit={enregistrer} className="mt-3 flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Début
              <Input type="time" value={debut} onChange={(e) => setDebut(e.target.value)} disabled={!modifiable || occupe} required className="w-32" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Fin <span className="text-muted-foreground text-xs">(00:00 = minuit)</span>
              <Input type="time" value={fin} onChange={(e) => setFin(e.target.value)} disabled={!modifiable || occupe} required className="w-32" />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm">Jours de travail <span className="text-muted-foreground text-xs">({texteJours(jours) || 'aucun'})</span></legend>
            <div className="flex flex-wrap gap-3">
              {JOURS.map((nom, i) => (
                <label key={nom} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={jours.includes(i + 1)} disabled={!modifiable || occupe} onCheckedChange={(v) => basculer(i + 1, v === true)} />
                  {nom}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Pause : reprise automatique après (min)
              <Input type="number" inputMode="numeric" min={5} max={240} value={pause} onChange={(e) => setPause(e.target.value)} disabled={!modifiable || occupe} className="w-28" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Pauses par jour, au total (min)
              <Input type="number" inputMode="numeric" min={0} max={480} value={total} onChange={(e) => setTotal(e.target.value)} disabled={!modifiable || occupe} className="w-28" />
            </label>
          </div>
          {modifiable ? (
            <div><Button type="submit" size="sm" disabled={occupe}>{occupe && <Spinner />}Enregistrer</Button></div>
          ) : (
            <p className="text-muted-foreground text-sm">Lecture seule : réglage du responsable du marché ou de l&apos;administrateur.</p>
          )}
        </form>
      )}
    </section>
  );
}
