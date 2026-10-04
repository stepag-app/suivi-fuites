'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { duMois, finDuMois, titreLot, type Lot, type ReglesAttachement } from '@/lib/attachements';
import { dateSeule, messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';

export default function Attachements() {
  const { marche, peut } = useSession();
  const router = useRouter();
  const [lots, setLots] = useState<Lot[]>([]);
  const [regles, setRegles] = useState<ReglesAttachement | null>(null);
  const [aAttacher, setAAttacher] = useState<{ unites: number; fuites: number } | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId) return;
    const sb = getSupabase();
    const [l, r, u] = await Promise.all([
      sb.from('attachements').select('*').eq('marche_id', marcheId).is('supprime_le', null)
        .order('numero', { ascending: false, nullsFirst: true }).order('cree_le', { ascending: false }),
      sb.from('parametres_attachement').select('*').eq('marche_id', marcheId).maybeSingle(),
      lireTout<{ fuite_id: string }>((de, a) => sb.from('v_a_attacher').select('fuite_id, prix_id')
        .eq('marche_id', marcheId).neq('reste', 0).order('fuite_id').order('prix_id').range(de, a))
        .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error })),
    ]);
    const premiere = l.error || r.error || u.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setLots((l.data as Lot[] | null) ?? []);
    setRegles((r.data as ReglesAttachement | null) ?? null);
    const unites = (u.data as { fuite_id: string }[] | null) ?? [];
    setAAttacher({ unites: unites.length, fuites: new Set(unites.map((x) => x.fuite_id)).size });
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function nouveauLot() {
    if (!marcheId) return;
    const id = crypto.randomUUID();
    const mensuel = !regles || regles.periodicite === 'mensuelle';
    const { error } = await getSupabase().from('attachements').insert({
      id, marche_id: marcheId,
      intitule: mensuel ? `Attachement ${duMois()}` : 'Nouvel attachement',
      date_arret: mensuel ? finDuMois() : null,
    });
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    router.push(`/attachements/${id}`);
  }

  if (!peut('attachements', 'lire')) return <p className="carte">Votre compte n&apos;a pas accès aux attachements.</p>;

  return (
    <>
      <div className="barre">
        <h1>Attachements</h1>
        {peut('attachements', 'creer') && <button className="primaire gros" onClick={nouveauLot}>+ Nouveau lot</button>}
      </div>
      <p className="discret">
        Un lot regroupe des travaux choisis (fuite × article du bordereau). En brouillon, il suit les quantités en direct ;
        une fois arrêté, ses quantités sont figées et ne peuvent plus être attachées une seconde fois.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
      {aAttacher && (
        <p className="carte attention">
          Reste à attacher : <strong>{aAttacher.unites}</strong> unité{aAttacher.unites > 1 ? 's' : ''} de travaux sur{' '}
          <strong>{aAttacher.fuites}</strong> fuite{aAttacher.fuites > 1 ? 's' : ''} (régularisations comprises).
        </p>
      )}
      {chargement && <p className="discret">Chargement…</p>}
      {!chargement && lots.length === 0 && <p className="carte">Aucun lot pour l&apos;instant.</p>}
      <ul className="liste">
        {lots.map((l) => (
          <li key={l.id}>
            <Link href={`/attachements/${l.id}`} className="carte fuite">
              <div className="fuite-tete">
                <strong>{l.numero != null ? `N° ${String(l.numero).padStart(2, '0')}` : 'Brouillon'} · {l.intitule ?? 'Sans titre'}</strong>
                <span className={`badge ${l.statut === 'arrete' ? 'st-achevee' : 'st-detectee'}`}>
                  {l.statut === 'arrete' ? 'Arrêté' : l.numero != null ? 'Rouvert' : 'Brouillon'}
                </span>
              </div>
              <div className="discret">{titreLot(regles?.titre, l)}</div>
              <div className="discret">
                {l.arrete_le ? `Arrêté le ${dateSeule(l.arrete_le)}` : `Créé le ${dateSeule(l.cree_le)}`}
                {l.accepte_le ? ` · accepté le ${dateSeule(l.accepte_le)}` : ''}
                {l.reference_facture ? ` · facture ${l.reference_facture}` : ''}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
