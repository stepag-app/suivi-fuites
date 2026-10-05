'use client';

// Travaux hors bordereau à faire valoir (lot R) : excédents de polyéthylène au-delà de 2 m,
// réparations sur un matériau ou un diamètre sans article, pièces non couvertes. Liste de suivi :
// rien n'est attaché ni facturé automatiquement.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { dateSeule, messageErreur, nombre } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import {
  COLONNES_EXPORT_HB, COLONNES_HORS_BORDEREAU, NATURES_HORS_BORDEREAU, filtrerHorsBordereau, groupeExportHb,
  libellePeriodeHb, lignesExportHorsBordereau, totauxHorsBordereau, trierHorsBordereau,
  type FiltresHorsBordereau, type TravailHorsBordereau,
} from '../controles';
import styles from '../controles.module.css';

type Format = 'xlsx' | 'pdf' | 'docx' | 'csv';
const FORMATS: Record<Format, string> = { xlsx: 'Excel (.xlsx)', pdf: 'PDF', docx: 'Word (.docx)', csv: 'CSV' };

export default function HorsBordereau() {
  const { marche, peut } = useSession();
  const marcheId = marche?.id;
  const [lignes, setLignes] = useState<TravailHorsBordereau[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [filtres, setFiltres] = useState<FiltresHorsBordereau>({});
  const [format, setFormat] = useState<Format>('xlsx');
  const [orientation, setOrientation] = useState<'portrait' | 'paysage'>('paysage');
  const [exportEnCours, setExportEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!marcheId) return;
    setChargement(true);
    try {
      setLignes(await lireTout<TravailHorsBordereau>((de, a) => getSupabase().from('v_hors_bordereau').select(COLONNES_HORS_BORDEREAU)
        .eq('marche_id', marcheId).order('fuite_numero').order('nature').order('reparation_id').order('piece_ligne_id').range(de, a)));
      setErreur('');
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const secteurs = useMemo(
    () => [...new Map(lignes.filter((l) => l.secteur_id).map((l) => [l.secteur_id as string, l.secteur ?? '—'])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr')),
    [lignes],
  );
  const affichees = useMemo(() => trierHorsBordereau(filtrerHorsBordereau(lignes, filtres)), [lignes, filtres]);
  const totaux = totauxHorsBordereau(affichees);
  const maj = (cle: keyof FiltresHorsBordereau, valeur: string) => setFiltres((f) => ({ ...f, [cle]: valeur || undefined }));

  // Même moteur que le panneau « Exporter » : en-tête du marché (logos compris), une section par nature.
  async function exporterListe() {
    if (!marcheId || !affichees.length) return;
    setExportEnCours(true);
    setErreur('');
    try {
      const sb = getSupabase();
      const [m, o] = await Promise.all([
        sb.from('marches').select('*').eq('id', marcheId).maybeSingle(),
        sb.from('ordres_service').select('id, numero, date_os').eq('marche_id', marcheId).order('date_os'),
      ]);
      if (m.error) throw m.error;
      const fiche = (m.data as Record<string, unknown> | null) ?? {};
      const os = (o.data as { id: string; numero: string; date_os: string }[] | null) ?? [];
      const [{ construireEntete }, { construireSection }, { exporter }, { chargerLogosEntete }] = await Promise.all([
        import('@/lib/export/jeux'), import('@/lib/export/modele'), import('@/lib/export/generer'), import('@/lib/logos'),
      ]);
      const ctx = {
        marche: fiche, os, osCommencement: os.find((x) => x.id === fiche.os_commencement_id) ?? null,
        regles: null, peutMontants: false, logos: await chargerLogosEntete(fiche),
      };
      const secteur = secteurs.find(([id]) => id === filtres.secteur)?.[1];
      const lignesExport = lignesExportHorsBordereau(affichees);
      await exporter({
        nomFichier: `hors-bordereau-${String(fiche.code ?? 'marche')}`,
        entete: construireEntete(ctx, 'Travaux hors bordereau à faire valoir', [
          libellePeriodeHb(filtres),
          secteur ? `Secteur : ${secteur}` : '',
          filtres.nature ? NATURES_HORS_BORDEREAU[filtres.nature as keyof typeof NATURES_HORS_BORDEREAU] ?? '' : '',
          `${lignesExport.length} ligne${lignesExport.length > 1 ? 's' : ''} : liste de suivi, rien n'est attaché ni facturé automatiquement`,
        ].filter(Boolean)),
        sections: [construireSection(lignesExport, COLONNES_EXPORT_HB, { groupe: groupeExportHb })],
        orientation,
        genereLe: new Date(),
      }, format);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setExportEnCours(false);
    }
  }

  if (!peut('attachements', 'lire')) return <p className="carte">Votre compte n&apos;a pas accès aux attachements.</p>;

  return (
    <>
      <p><Link href="/attachements">← Attachements</Link></p>
      <div className="barre">
        <h1>Travaux hors bordereau à faire valoir</h1>
      </div>
      <p className="discret">
        Travaux réellement exécutés que le bordereau ne paie pas : polyéthylène au-delà des 2 m couverts par l&apos;article de
        réparation, réparations sur un matériau ou un diamètre sans article (DN &gt; 315, fonte, acier…), pièces non couvertes.
        Liste de suivi à présenter au maître d&apos;ouvrage : rien n&apos;est attaché ni facturé automatiquement.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}

      <section className="carte">
        <div className="filtres">
          <label>Réparées du<input type="date" value={filtres.du ?? ''} onChange={(e) => maj('du', e.target.value)} /></label>
          <label>au<input type="date" value={filtres.au ?? ''} onChange={(e) => maj('au', e.target.value)} /></label>
          <label>
            Secteur
            <select value={filtres.secteur ?? ''} onChange={(e) => maj('secteur', e.target.value)}>
              <option value="">Tous</option>
              {secteurs.map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
            </select>
          </label>
          <label>
            Nature
            <select value={filtres.nature ?? ''} onChange={(e) => maj('nature', e.target.value)}>
              <option value="">Toutes</option>
              {Object.entries(NATURES_HORS_BORDEREAU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        {peut('exports', 'lire') && (
          <div className="actions">
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label="Format">
              {(Object.keys(FORMATS) as Format[]).map((f) => <option key={f} value={f}>{FORMATS[f]}</option>)}
            </select>
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as 'portrait' | 'paysage')} aria-label="Orientation">
              <option value="paysage">Paysage</option>
              <option value="portrait">Portrait</option>
            </select>
            <button className="primaire" disabled={exportEnCours || affichees.length === 0} onClick={exporterListe}>
              {exportEnCours ? 'Export…' : `Exporter (${affichees.length})`}
            </button>
          </div>
        )}
      </section>

      {totaux.length > 0 && (
        <ul className={styles.totaux}>
          {totaux.map((t) => (
            <li key={`${t.nature}|${t.unite}`}>
              <span className="discret">{t.libelle}</span>
              <strong>{nombre(t.quantite, 3)} {t.unite}</strong>
              <span className="discret">{t.fuites} fuite{t.fuites > 1 ? 's' : ''}</span>
            </li>
          ))}
        </ul>
      )}

      <section className="carte carte-tableau">
        {chargement && <p className="discret">Chargement…</p>}
        {!chargement && affichees.length === 0 && <p className="discret">Aucun travail hors bordereau avec ces filtres.</p>}
        {affichees.length > 0 && (
          <div className="defilement">
            <table className="liste-compacte">
              <thead>
                <tr>
                  <th>Fuite</th><th>Référence</th><th>Secteur</th><th>Réparée le</th><th>Nature</th><th>Désignation</th>
                  <th>Quantité</th><th>Pièce</th>
                </tr>
              </thead>
              <tbody>
                {affichees.map((l, i) => (
                  <tr key={`${l.nature}-${l.reparation_id}-${l.piece_ligne_id ?? ''}`} className={i % 2 === 1 ? 'zebre' : ''}>
                    <td className="nowrap">
                      <Link href={`/fuites/${l.fuite_id}`} target="_blank" rel="noopener" className="lien-fuite" title="Ouvrir la fiche dans un nouvel onglet">
                        N° {l.fuite_numero} ↗
                      </Link>
                    </td>
                    <td className="nowrap">{l.reference_srm ?? '—'}</td>
                    <td>{l.secteur ?? '—'}</td>
                    <td className="nowrap">{dateSeule(l.realisee_le)}</td>
                    <td>{NATURES_HORS_BORDEREAU[l.nature] ?? l.libelle}</td>
                    <td>{l.designation}</td>
                    <td className="nowrap">{nombre(l.quantite, 3)} {l.unite}</td>
                    <td className="nowrap">
                      {l.ajoutee_bureau == null ? '' : l.ajoutee_bureau
                        ? <span className={styles.bureau}>ajoutée au bureau</span>
                        : <span className={styles.terrain}>déclarée sur le terrain</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
