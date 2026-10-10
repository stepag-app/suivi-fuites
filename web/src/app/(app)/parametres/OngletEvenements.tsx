'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { dateSeule, messageErreur } from '@/lib/format';
import { JEU_EVENEMENTS } from '@/lib/export/jeux';
import { PanneauExport } from '@/lib/export/PanneauExport';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Secteur } from '@/lib/types';
import { jourMaroc } from '@/lib/heure-maroc';

interface Categorie { id: string; code: string; libelle: string; libelle_ar: string | null; ordre: number; actif: boolean }
interface Evenement {
  id: string; date_evenement: string; heure: string | null; categorie_id: string; titre: string;
  description: string | null; participants: string | null; lieu: string | null; secteur_id: string | null;
}
interface Piece { id: string; evenement_id: string; nom_fichier: string; chemin: string; type_mime: string | null; taille_octets: number | null }

const TAILLE_MAX = 10 * 1024 * 1024;
const TYPES_ACCEPTES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';
const aujourdHui = () => jourMaroc(new Date());

const codeDepuis = (texte: string) =>
  texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export function OngletEvenements({ marcheId }: { marcheId: string }) {
  const { peut } = useSession();
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [erreur, setErreur] = useState('');
  const [edition, setEdition] = useState<Evenement | 'nouveau' | null>(null);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [categorie, setCategorie] = useState('');
  const [texte, setTexte] = useState('');
  const [exportOuvert, setExportOuvert] = useState(false);

  const charger = useCallback(async () => {
    const sb = getSupabase();
    const [c, s, e, p] = await Promise.all([
      sb.from('categories_evenement').select('id, code, libelle, libelle_ar, ordre, actif').eq('marche_id', marcheId).order('ordre').order('libelle'),
      sb.from('secteurs').select('id, zone_id, code, libelle').eq('marche_id', marcheId).order('libelle'),
      sb.from('evenements').select('id, date_evenement, heure, categorie_id, titre, description, participants, lieu, secteur_id')
        .eq('marche_id', marcheId).is('supprime_le', null).order('date_evenement', { ascending: false }).order('heure', { ascending: false }),
      sb.from('evenement_pieces').select('id, evenement_id, nom_fichier, chemin, type_mime, taille_octets')
        .eq('marche_id', marcheId).is('supprime_le', null).order('cree_le'),
    ]);
    const premiere = c.error || e.error || p.error;
    setErreur(premiere ? messageErreur(premiere) : '');
    setCategories((c.data as Categorie[] | null) ?? []);
    setSecteurs((s.data as Secteur[] | null) ?? []);
    setEvenements((e.data as Evenement[] | null) ?? []);
    setPieces((p.data as Piece[] | null) ?? []);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const categorieDe = (id: string) => categories.find((c) => c.id === id);
  const secteurDe = (id: string | null) => secteurs.find((s) => s.id === id)?.libelle ?? '';

  const filtres = useMemo(() => {
    const t = texte.trim().toLowerCase();
    return evenements.filter(
      (e) =>
        (!du || e.date_evenement >= du) &&
        (!au || e.date_evenement <= au) &&
        (!categorie || e.categorie_id === categorie) &&
        (!t || [e.titre, e.description, e.participants, e.lieu].some((x) => (x ?? '').toLowerCase().includes(t))),
    );
  }, [evenements, du, au, categorie, texte]);

  async function enregistrer(valeurs: Record<string, unknown>, fichiers: File[], existant: Evenement | null): Promise<boolean> {
    setErreur('');
    const sb = getSupabase();
    const id = existant?.id ?? crypto.randomUUID();
    const { error } = existant
      ? await sb.from('evenements').update(valeurs).eq('id', id)
      : await sb.from('evenements').insert({ ...valeurs, id, marche_id: marcheId });
    if (error) {
      setErreur(messageErreur(error));
      return false;
    }
    for (const f of fichiers) {
      const pieceId = crypto.randomUUID();
      const extension = (f.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
      const chemin = `${marcheId}/${id}/${pieceId}.${extension}`;
      const envoi = await sb.storage.from('evenements').upload(chemin, f, { contentType: f.type || undefined });
      if (envoi.error) {
        setErreur(`Pièce « ${f.name} » non envoyée : ${messageErreur(envoi.error)}`);
        continue;
      }
      const ligne = await sb.from('evenement_pieces').insert({
        id: pieceId, marche_id: marcheId, evenement_id: id, nom_fichier: f.name, chemin,
        type_mime: f.type || null, taille_octets: f.size,
      });
      if (ligne.error) setErreur(`Pièce « ${f.name} » : ${messageErreur(ligne.error)}`);
    }
    await charger();
    return true;
  }

  async function supprimerEvenement(e: Evenement) {
    if (!window.confirm(`Supprimer l'événement « ${e.titre} » ? Il reste visible dans le journal des modifications.`)) return;
    const { error } = await getSupabase().from('evenements').update({ supprime_le: new Date().toISOString() }).eq('id', e.id);
    if (error) setErreur(messageErreur(error));
    await charger();
  }

  async function supprimerPiece(p: Piece) {
    if (!window.confirm(`Retirer la pièce jointe « ${p.nom_fichier} » ?`)) return;
    const sb = getSupabase();
    const { error } = await sb.from('evenement_pieces').update({ supprime_le: new Date().toISOString() }).eq('id', p.id);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    await sb.storage.from('evenements').remove([p.chemin]);
    await charger();
  }

  async function ouvrirPiece(p: Piece) {
    const { data, error } = await getSupabase().storage.from('evenements').createSignedUrl(p.chemin, 600);
    if (error || !data) {
      setErreur(messageErreur(error));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const peutCreer = peut('evenements', 'creer');
  const peutModifier = peut('evenements', 'modifier');
  const peutSupprimer = peut('evenements', 'supprimer');

  return (
    <>
      {erreur && <p className="erreur">{erreur}</p>}
      <section className="carte">
        <div className="barre">
          <h2>Journal des événements <span className="discret">({filtres.length}/{evenements.length})</span></h2>
          {peutCreer && edition !== 'nouveau' && <button className="primaire" onClick={() => setEdition('nouveau')}>+ Nouvel événement</button>}
        </div>
        {edition === 'nouveau' && (
          <FormEvenement
            categories={categories.filter((c) => c.actif)} secteurs={secteurs}
            onSubmit={async (v, f) => (await enregistrer(v, f, null)) && setEdition(null)}
            annuler={() => setEdition(null)}
          />
        )}
        <div className="filtres">
          <label>Du<input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></label>
          <label>Au<input type="date" value={au} onChange={(e) => setAu(e.target.value)} /></label>
          <label>
            Catégorie
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">Toutes</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select>
          </label>
          <label>Recherche<input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Titre, participants…" /></label>
          {peut('exports', 'lire') && <button type="button" onClick={() => setExportOuvert(true)}>Exporter</button>}
        </div>
        {filtres.length === 0 && <p className="discret">Aucun événement.</p>}
        {filtres.map((e) =>
          edition !== 'nouveau' && edition?.id === e.id ? (
            <FormEvenement
              key={e.id} initial={e} categories={categories.filter((c) => c.actif || c.id === e.categorie_id)} secteurs={secteurs}
              onSubmit={async (v, f) => (await enregistrer(v, f, e)) && setEdition(null)}
              annuler={() => setEdition(null)}
            />
          ) : (
            <article key={e.id} className="bloc">
              <div className="ligne-param">
                <span>
                  <strong>{dateSeule(e.date_evenement)}{e.heure ? ` à ${e.heure.slice(0, 5)}` : ''}</strong>
                  <span className="etiquette">{categorieDe(e.categorie_id)?.libelle ?? '—'}</span>
                  <br />
                  <strong>{e.titre}</strong>
                </span>
                <span className="actions">
                  {peutModifier && <button onClick={() => setEdition(e)}>Modifier</button>}
                  {peutSupprimer && <button className="danger" onClick={() => supprimerEvenement(e)}>Supprimer</button>}
                </span>
              </div>
              {e.description && <p className="texte-libre">{e.description}</p>}
              <p className="discret">
                {e.participants ? `Participants : ${e.participants}` : ''}
                {e.lieu ? `${e.participants ? ' · ' : ''}Lieu : ${e.lieu}` : ''}
                {e.secteur_id ? ` · Secteur : ${secteurDe(e.secteur_id)}` : ''}
              </p>
              {pieces.filter((p) => p.evenement_id === e.id).map((p) => (
                <div key={p.id} className="ligne-pieces">
                  <button type="button" onClick={() => ouvrirPiece(p)}>📎 {p.nom_fichier}</button>
                  {peutSupprimer && <button type="button" className="danger" onClick={() => supprimerPiece(p)}>Retirer</button>}
                </div>
              ))}
            </article>
          ),
        )}
      </section>

      <PanneauExport ouvert={exportOuvert} fermer={() => setExportOuvert(false)} jeux={[JEU_EVENEMENTS]} />

      {(peut('parametres', 'creer') || peut('parametres', 'modifier')) && (
        <Categories categories={categories} marcheId={marcheId} onChange={charger} onErreur={setErreur} />
      )}
    </>
  );
}

function FormEvenement({
  initial, categories, secteurs, onSubmit, annuler,
}: {
  initial?: Evenement; categories: Categorie[]; secteurs: Secteur[];
  onSubmit: (v: Record<string, unknown>, fichiers: File[]) => Promise<unknown>; annuler: () => void;
}) {
  const [date, setDate] = useState(initial?.date_evenement ?? aujourdHui());
  const [heure, setHeure] = useState(initial?.heure?.slice(0, 5) ?? '');
  const [categorieId, setCategorieId] = useState(initial?.categorie_id ?? categories[0]?.id ?? '');
  const [titre, setTitre] = useState(initial?.titre ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [participants, setParticipants] = useState(initial?.participants ?? '');
  const [lieu, setLieu] = useState(initial?.lieu ?? '');
  const [secteurId, setSecteurId] = useState(initial?.secteur_id ?? '');
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [occupe, setOccupe] = useState(false);
  const selecteur = useRef<HTMLInputElement>(null);

  function ajouterFichiers(liste: FileList | null) {
    const nouveaux = liste ? Array.from(liste) : [];
    if (nouveaux.length) setFichiers((f) => [...f, ...nouveaux]);
    if (selecteur.current) selecteur.current.value = '';
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setOccupe(true);
    await onSubmit({
      date_evenement: date, heure: heure || null, categorie_id: categorieId, titre: titre.trim(),
      description: description.trim() || null, participants: participants.trim() || null,
      lieu: lieu.trim() || null, secteur_id: secteurId || null,
    }, fichiers);
    setOccupe(false);
  }

  const tropLourd = fichiers.some((f) => f.size > TAILLE_MAX);
  return (
    <form onSubmit={envoyer} className="sous-formulaire">
      <div className="trois">
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>Heure (facultative)<input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} /></label>
        <label>
          Catégorie
          <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)} required>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
        </label>
      </div>
      <label>Titre<input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Prélèvement de carottes, rue X" /></label>
      <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label>Participants<textarea rows={2} value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Noms et organismes" /></label>
      <div className="deux">
        <label>Lieu<input value={lieu} onChange={(e) => setLieu(e.target.value)} /></label>
        <label>
          Secteur (facultatif)
          <select value={secteurId} onChange={(e) => setSecteurId(e.target.value)}>
            <option value="">—</option>
            {secteurs.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Pièces jointes (PDF, photo, Word, Excel ; 10 Mo maximum chacune)</legend>
        {fichiers.map((f, i) => (
          <div key={`${f.name}-${i}`} className="ligne-pieces">
            <span className={f.size > TAILLE_MAX ? 'erreur' : ''}>{f.name} ({Math.ceil(f.size / 1024)} Ko)</span>
            <button type="button" onClick={() => setFichiers(fichiers.filter((_, j) => j !== i))}>Retirer</button>
          </div>
        ))}
        <input ref={selecteur} type="file" multiple accept={TYPES_ACCEPTES} hidden onChange={(e) => ajouterFichiers(e.target.files)} />
        <button type="button" onClick={() => selecteur.current?.click()}>+ Joindre un fichier</button>
      </fieldset>
      <div className="actions">
        <button className="primaire" disabled={occupe || !titre.trim() || !categorieId || tropLourd}>{occupe ? 'Envoi…' : 'Enregistrer'}</button>
        <button type="button" onClick={annuler}>Annuler</button>
        {tropLourd && <span className="erreur">Un fichier dépasse 10 Mo.</span>}
      </div>
    </form>
  );
}

function Categories({
  categories, marcheId, onChange, onErreur,
}: {
  categories: Categorie[]; marcheId: string; onChange: () => void; onErreur: (m: string) => void;
}) {
  const { peut } = useSession();
  const [libelle, setLibelle] = useState('');
  const [libelleAr, setLibelleAr] = useState('');

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    const { error } = await getSupabase().from('categories_evenement').insert({
      marche_id: marcheId, code: codeDepuis(libelle), libelle: libelle.trim(), libelle_ar: libelleAr.trim() || null,
      ordre: 10 + categories.length,
    });
    if (error) {
      onErreur(error.code === '23505' ? 'Cette catégorie existe déjà.' : messageErreur(error));
      return;
    }
    setLibelle('');
    setLibelleAr('');
    onChange();
  }

  async function basculer(c: Categorie) {
    const { error } = await getSupabase().from('categories_evenement').update({ actif: !c.actif }).eq('id', c.id);
    if (error) onErreur(messageErreur(error));
    onChange();
  }

  return (
    <section className="carte">
      <h2>Catégories d&apos;événements</h2>
      {categories.map((c) => (
        <div key={c.id} className="bloc ligne-param">
          <span className={c.actif ? '' : 'discret'}>
            {c.libelle}
            {c.libelle_ar && <span dir="rtl" lang="ar"> · {c.libelle_ar}</span>}
            {c.actif ? '' : ' (désactivée)'}
          </span>
          {peut('parametres', 'modifier') && <button onClick={() => basculer(c)}>{c.actif ? 'Désactiver' : 'Réactiver'}</button>}
        </div>
      ))}
      {peut('parametres', 'creer') && (
        <form onSubmit={ajouter} className="sous-formulaire">
          <div className="deux">
            <label>Nouvelle catégorie<input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. Visite du maître d'ouvrage" /></label>
            <label>Libellé en arabe (facultatif)<input value={libelleAr} onChange={(e) => setLibelleAr(e.target.value)} dir="rtl" lang="ar" /></label>
          </div>
          <button className="primaire" disabled={!codeDepuis(libelle)}>Ajouter la catégorie</button>
        </form>
      )}
    </section>
  );
}
