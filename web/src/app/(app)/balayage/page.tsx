'use client';

// Journal des balayages (droit « balayage / lire ») : lignes de `v_balayage_journalier` par jour, équipe,
// agent, zone et secteur ; filtres période / équipe / secteur ; totaux ; export Excel ou CSV via lib/export ;
// rapport journalier de recherche de fuites (PDF avec extrait de plan, ou Excel) par jour ou par équipe.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { messageErreur, nombre } from '@/lib/format';
import { chargerEquipes, chargerJournal, estBaseSansReseau, messageReseau, type EquipeReseau } from '@/lib/reseau/donnees';
import { filtrerJournal, grouperParJour, periodeParDefaut, totauxJournal, type FiltresJournal } from '@/lib/reseau/journal';
import { formaterLineaire } from '@/lib/reseau/selection';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { LigneBalayageJournalier, Secteur } from '@/lib/types';
import type { ModeRapport } from './rapport';

const jourFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

export default function PageBalayage() {
  const { marche, peut } = useSession();
  const marcheId = marche?.id;
  const [filtres, setFiltres] = useState<FiltresJournal>(() => ({ ...periodeParDefaut(), equipe: '', secteur: '' }));
  const [lignes, setLignes] = useState<LigneBalayageJournalier[]>([]);
  const [equipes, setEquipes] = useState<EquipeReseau[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [baseAbsente, setBaseAbsente] = useState(false);
  const [exportEnCours, setExportEnCours] = useState('');
  const [modeRapport, setModeRapport] = useState<ModeRapport>('jour');
  const [avecPlan, setAvecPlan] = useState(true);
  const [rapportEnCours, setRapportEnCours] = useState('');
  const [infoRapport, setInfoRapport] = useState('');

  const derniereDemande = useState({ n: 0 })[0];
  const charger = useCallback(async () => {
    if (!marcheId) return;
    const demande = ++derniereDemande.n;
    setChargement(true);
    setErreur('');
    try {
      const sb = getSupabase();
      const [j, e, s] = await Promise.all([
        chargerJournal(marcheId, { du: filtres.du, au: filtres.au }),
        chargerEquipes(marcheId),
        sb.from('secteurs').select('id, zone_id, code, libelle').eq('marche_id', marcheId).eq('actif', true).order('ordre').order('code'),
      ]);
      if (demande !== derniereDemande.n) return;
      if (s.error) throw s.error;
      setLignes(j);
      setEquipes(e);
      setSecteurs((s.data as Secteur[] | null) ?? []);
      setBaseAbsente(false);
    } catch (e) {
      if (demande !== derniereDemande.n) return;
      if (estBaseSansReseau(e)) setBaseAbsente(true);
      else setErreur(messageReseau(e));
    }
    setChargement(false);
  }, [marcheId, filtres.du, filtres.au, derniereDemande]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Équipe et secteur filtrent localement (la période seule déclenche une relecture).
  const visibles = useMemo(() => filtrerJournal(lignes, filtres), [lignes, filtres]);
  const jours = useMemo(() => grouperParJour(visibles), [visibles]);
  const totaux = useMemo(() => totauxJournal(visibles), [visibles]);
  const maj = (partie: Partial<FiltresJournal>) => setFiltres((f) => ({ ...f, ...partie }));

  async function exporter(format: 'xlsx' | 'csv') {
    if (!marcheId || !visibles.length) return;
    setExportEnCours(format);
    setErreur('');
    try {
      const [{ exporter: lancer }, { construireSection }, { construireEntete }, { chargerContexteRapport }] = await Promise.all([
        import('@/lib/export/generer'), import('@/lib/export/modele'), import('@/lib/export/jeux'), import('@/lib/export/rapport-fuite'),
      ]);
      const ctx = await chargerContexteRapport(marcheId, false);
      const periode = filtres.du && filtres.au ? `du ${new Date(`${filtres.du}T12:00:00`).toLocaleDateString('fr-FR')} au ${new Date(`${filtres.au}T12:00:00`).toLocaleDateString('fr-FR')}` : 'toute la période';
      const infos = [
        `Balayages ${periode}`,
        filtres.equipe ? `Équipe : ${equipes.find((e) => e.id === filtres.equipe)?.libelle ?? ''}` : 'Toutes les équipes',
        filtres.secteur ? `Secteur : ${secteurs.find((s) => s.id === filtres.secteur)?.libelle ?? ''}` : 'Tous les secteurs',
      ];
      const section = construireSection(visibles as unknown as Record<string, unknown>[], [
        { cle: 'date_balayage', titre: 'Date', groupe: 'Journal', type: 'date', largeur: 12 },
        { cle: 'equipe', titre: 'Équipe', groupe: 'Journal', largeur: 16 },
        { cle: 'agent', titre: 'Agent', groupe: 'Journal', largeur: 20 },
        { cle: 'zone', titre: 'Zone', groupe: 'Journal', largeur: 14 },
        { cle: 'secteur', titre: 'Secteur', groupe: 'Journal', largeur: 18 },
        { cle: 'nb_troncons', titre: 'Tronçons', groupe: 'Journal', type: 'nombre', decimales: 0, total: true },
        { cle: 'lineaire_m', titre: 'Linéaire balayé (m)', groupe: 'Journal', type: 'nombre', decimales: 0, total: true },
        { cle: 'lineaire_repasse_m', titre: 'Repassé (m)', groupe: 'Journal', type: 'nombre', decimales: 0, total: true },
        { cle: 'nb_noeuds', titre: 'Nœuds', groupe: 'Journal', type: 'nombre', decimales: 0, total: true },
        { cle: 'nb_fuites', titre: 'Fuites détectées', groupe: 'Journal', type: 'nombre', decimales: 0, total: true },
      ], { groupe: (l) => new Date(`${String(l.date_balayage)}T12:00:00`).toLocaleDateString('fr-FR') });
      await lancer({
        nomFichier: `balayage-journalier-${String(ctx.marche.code ?? '')}`,
        entete: construireEntete(ctx, 'Journal des balayages', infos),
        sections: [section],
        orientation: 'paysage',
        genereLe: new Date(),
      }, format);
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setExportEnCours('');
  }

  // Rapport journalier de recherche de fuites (CPS art. II-21) : un fichier pour le jour, ou un par équipe.
  async function rapportJournalier(jour: string, format: 'pdf' | 'xlsx') {
    if (!marcheId) return;
    setRapportEnCours(`${jour}|${format}`);
    setErreur('');
    setInfoRapport('');
    try {
      const { telechargerRapportJournalier } = await import('./rapport');
      const r = await telechargerRapportJournalier(marcheId, jour, format, modeRapport, avecPlan);
      setInfoRapport(
        `${r.fichiers} rapport${r.fichiers > 1 ? 's' : ''} du ${jourFr(jour)} téléchargé${r.fichiers > 1 ? 's' : ''}.`
        + (r.nonAttribuees ? ` ${r.nonAttribuees} fuite${r.nonAttribuees > 1 ? 's' : ''} sans équipe identifiable (secteur balayé par plusieurs équipes) : renseigner l'équipe de détection sur la fiche ou utiliser le rapport du jour.` : ''),
      );
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setRapportEnCours('');
  }
  const peutRapport = peut('exports', 'lire');

  if (!peut('balayage', 'lire')) return <p className="carte">Votre compte ne voit pas le journal des balayages.</p>;

  return (
    <div className="ancien">
      <div className="barre">
        <h1>
          Journal des balayages{' '}
          <span className="sous-titre">{nombre(totaux.jours, 0)} jour{totaux.jours > 1 ? 's' : ''} · {formaterLineaire(totaux.lineaire_m)} balayés</span>
        </h1>
        <div className="actions en-tete">
          <button className="gros" onClick={charger} disabled={chargement}>Actualiser</button>
          {peut('exports', 'lire') && (
            <>
              <button className="gros" onClick={() => exporter('xlsx')} disabled={!!exportEnCours || !visibles.length}>
                {exportEnCours === 'xlsx' ? 'Export…' : 'Excel'}
              </button>
              <button className="gros" onClick={() => exporter('csv')} disabled={!!exportEnCours || !visibles.length}>
                {exportEnCours === 'csv' ? 'Export…' : 'CSV'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filtres">
        <label>
          Du
          <input type="date" value={filtres.du} max={filtres.au || undefined} onChange={(e) => maj({ du: e.target.value })} />
        </label>
        <label>
          au
          <input type="date" value={filtres.au} min={filtres.du || undefined} onChange={(e) => maj({ au: e.target.value })} />
        </label>
        <label>
          Équipe
          <select value={filtres.equipe} onChange={(e) => maj({ equipe: e.target.value })}>
            <option value="">Toutes les équipes</option>
            {equipes.filter((e) => e.type !== 'reparation' || e.id === filtres.equipe).map((e) => (
              <option key={e.id} value={e.id}>{e.libelle}{e.actif ? '' : ' (désactivée)'}</option>
            ))}
          </select>
        </label>
        <label>
          Secteur
          <select value={filtres.secteur} onChange={(e) => maj({ secteur: e.target.value })}>
            <option value="">Tous les secteurs</option>
            {secteurs.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.libelle}</option>)}
          </select>
        </label>
        {(filtres.equipe || filtres.secteur) && (
          <button onClick={() => maj({ equipe: '', secteur: '' })}>Effacer équipe et secteur</button>
        )}
      </div>

      {peutRapport && (
        <div className="filtres">
          <label>
            Rapport journalier
            <select value={modeRapport} onChange={(e) => setModeRapport(e.target.value as ModeRapport)}>
              <option value="jour">Un rapport par jour (toutes équipes)</option>
              <option value="equipe">Un rapport par équipe</option>
            </select>
          </label>
          <label className="ligne">
            <input type="checkbox" checked={avecPlan} onChange={(e) => setAvecPlan(e.target.checked)} />
            Extrait de plan A4 dans le PDF
          </label>
        </div>
      )}
      {infoRapport && <p className="carte succes">{infoRapport}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
      {baseAbsente && (
        <p className="carte attention">
          La base de données n&apos;a pas encore le plan du réseau ni les balayages (migration du lot S2 à déployer).
        </p>
      )}
      {chargement && <p className="discret">Chargement du journal…</p>}

      {!chargement && !baseAbsente && (
        <section className="carte">
          <div className="deux">
            <p className="discret">
              <strong>{nombre(totaux.nb_troncons, 0)}</strong> tronçon{totaux.nb_troncons > 1 ? 's' : ''} balayé{totaux.nb_troncons > 1 ? 's' : ''} en premier passage,{' '}
              <strong>{formaterLineaire(totaux.lineaire_m)}</strong>
              {totaux.lineaire_repasse_m > 0 ? ` (+ ${formaterLineaire(totaux.lineaire_repasse_m)} repassés)` : ''}.
            </p>
            <p className="discret">
              <strong>{nombre(totaux.nb_noeuds, 0)}</strong> nœud{totaux.nb_noeuds > 1 ? 's' : ''} (vannes, bouches…),{' '}
              <strong>{nombre(totaux.nb_fuites, 0)}</strong> fuite{totaux.nb_fuites > 1 ? 's' : ''} détectée{totaux.nb_fuites > 1 ? 's' : ''} dans les secteurs balayés.
            </p>
          </div>
          {jours.length === 0 && <p className="discret">Aucun balayage sur la période.</p>}
          {jours.length > 0 && (
            <div className="defilement">
              <table>
                <thead>
                  <tr>
                    <th>Jour</th><th>Équipe</th><th>Agent</th><th>Zone</th><th>Secteur</th>
                    <th className="num">Tronçons</th><th className="num">Linéaire</th><th className="num">Repassé</th>
                    <th className="num">Nœuds</th><th className="num">Fuites</th>
                    {peutRapport && <th>Rapport du jour</th>}
                  </tr>
                </thead>
                {jours.map((j) => (
                  <tbody key={j.jour}>
                    {j.lignes.map((l, i) => (
                      <tr key={`${j.jour}-${l.equipe_id ?? ''}-${l.agent_id ?? ''}-${l.secteur_id ?? ''}-${i}`}>
                        <td>{i === 0 ? jourFr(j.jour) : ''}</td>
                        <td>{l.equipe ?? '—'}</td>
                        <td>{l.agent ?? '—'}</td>
                        <td>{l.zone ?? '—'}</td>
                        <td>{l.secteur ?? 'Non zoné'}</td>
                        <td className="num">{nombre(l.nb_troncons, 0)}</td>
                        <td className="num">{formaterLineaire(l.lineaire_m)}</td>
                        <td className="num">{l.lineaire_repasse_m > 0 ? formaterLineaire(l.lineaire_repasse_m) : '—'}</td>
                        <td className="num">{nombre(l.nb_noeuds, 0)}</td>
                        <td className="num">{nombre(l.nb_fuites, 0)}</td>
                        {peutRapport && (
                          <td>
                            {i === 0 && (
                              <span className="actions">
                                <button onClick={() => rapportJournalier(j.jour, 'pdf')} disabled={!!rapportEnCours}>
                                  {rapportEnCours === `${j.jour}|pdf` ? 'PDF…' : 'PDF'}
                                </button>
                                <button onClick={() => rapportJournalier(j.jour, 'xlsx')} disabled={!!rapportEnCours}>
                                  {rapportEnCours === `${j.jour}|xlsx` ? 'Excel…' : 'Excel'}
                                </button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {j.lignes.length > 1 && (
                      <tr className="discret">
                        <td colSpan={5}>Total du jour</td>
                        <td className="num">{nombre(j.totaux.nb_troncons, 0)}</td>
                        <td className="num">{formaterLineaire(j.totaux.lineaire_m)}</td>
                        <td className="num">{j.totaux.lineaire_repasse_m > 0 ? formaterLineaire(j.totaux.lineaire_repasse_m) : '—'}</td>
                        <td className="num">{nombre(j.totaux.nb_noeuds, 0)}</td>
                        <td className="num">{nombre(j.totaux.nb_fuites, 0)}</td>
                        {peutRapport && <td />}
                      </tr>
                    )}
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total de la période ({nombre(totaux.jours, 0)} jour{totaux.jours > 1 ? 's' : ''})</td>
                    <td className="num">{nombre(totaux.nb_troncons, 0)}</td>
                    <td className="num">{formaterLineaire(totaux.lineaire_m)}</td>
                    <td className="num">{totaux.lineaire_repasse_m > 0 ? formaterLineaire(totaux.lineaire_repasse_m) : '—'}</td>
                    <td className="num">{nombre(totaux.nb_noeuds, 0)}</td>
                    <td className="num">{nombre(totaux.nb_fuites, 0)}</td>
                    {peutRapport && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
