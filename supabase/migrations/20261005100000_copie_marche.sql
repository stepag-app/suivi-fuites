-- =============================================================================
-- Lot C : création d'un marché par copie des paramètres d'un marché existant.
--
-- public.copier_marche(source, code, numéro, intitulé, client, ville) :
-- réservée à l'administrateur. Crée le marché, puis copie de la source :
--   * la fiche (maître d'ouvrage, titulaire, taux, délais d'alerte, durée,
--     libellés et contrôles du client, devise), sans les dates, l'OS de
--     commencement, le montant ni l'observation, propres à chaque marché ;
--   * les règles d'attachement, les catégories d'événements, les modèles
--     d'export ;
--   * les zones et secteurs (statut de balayage remis « à balayer »), les
--     équipes, le bordereau (articles et règles de proposition, version 1
--     créée par déclencheur, sans avenant), les natures de réfection et leur
--     article, les motifs, le catalogue des pièces et son article suggéré.
-- Jamais les fuites, interventions, quantités, photos, lots d'attachement,
-- ordres de service, avenants, arrêts, phases, ouvriers ni événements.
--
-- La fonction s'exécute avec les droits de son propriétaire : les écritures
-- sont des appels système pour les déclencheurs de garde, et le journal
-- (déclencheur journaliser) garde l'auteur (auth.uid()) de chaque ligne créée.
-- Identifiants des copies : md5(nouveau marché || ':' || identifiant source),
-- pour garder les liens (secteur → zone, nature → article, pièce → article).
--
-- Aucune autre écriture ne manquait : zones, secteurs, natures, catalogue et
-- prix s'écrivent déjà avec le droit « parametres » (créer / modifier), les
-- règles de proposition d'un article (famille, matériaux, diamètres) se
-- modifient directement (proteger_prix ne garde que désignation, unité,
-- quantité et prix unitaire), la création et l'activation d'un marché sont
-- réservées à l'administrateur (RLS marches_creation, proteger_marche).
-- =============================================================================

create function private.copier_parametres_marche(p_source uuid, p_cible uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fiche : tout ce qui décrit le client, le titulaire et les règles du marché
  update public.marches d
     set duree_mois = s.duree_mois, duree_jours = s.duree_jours,
         taux_majoration = s.taux_majoration, taux_tva = s.taux_tva,
         taux_retenue_garantie = s.taux_retenue_garantie, plafond_retenue_garantie = s.plafond_retenue_garantie,
         rayon_redetection_m = s.rayon_redetection_m, delai_alerte_reparation_h = s.delai_alerte_reparation_h,
         delai_prealerte_refection_chaussee_j = s.delai_prealerte_refection_chaussee_j,
         delai_refection_chaussee_j = s.delai_refection_chaussee_j,
         delai_alerte_refection_trottoir_j = s.delai_alerte_refection_trottoir_j,
         une_unite_par_prix_et_fuite = s.une_unite_par_prix_et_fuite,
         client_sigle = s.client_sigle, client_nom_ar = s.client_nom_ar, client_direction = s.client_direction,
         client_service = s.client_service, client_adresse = s.client_adresse, client_ice = s.client_ice,
         client_telephone = s.client_telephone, client_email = s.client_email,
         client_representant = s.client_representant,
         titulaire_nom = s.titulaire_nom, titulaire_nom_ar = s.titulaire_nom_ar,
         titulaire_forme_juridique = s.titulaire_forme_juridique, titulaire_capital = s.titulaire_capital,
         titulaire_adresse = s.titulaire_adresse, titulaire_ice = s.titulaire_ice, titulaire_if = s.titulaire_if,
         titulaire_rc = s.titulaire_rc, titulaire_patente = s.titulaire_patente, titulaire_cnss = s.titulaire_cnss,
         titulaire_telephone = s.titulaire_telephone, titulaire_email = s.titulaire_email,
         titulaire_representant = s.titulaire_representant,
         titulaire_qualite_representant = s.titulaire_qualite_representant,
         devise = s.devise, libelle_reference = s.libelle_reference, masque_reference = s.masque_reference,
         jalons_client = s.jalons_client
    from public.marches s
   where s.id = p_source and d.id = p_cible;

  update public.parametres_attachement d
     set periodicite = s.periodicite, titre = s.titre, regroupement = s.regroupement,
         fuites_admissibles = s.fuites_admissibles, refection_anticipee = s.refection_anticipee,
         verrouiller_a_l_arret = s.verrouiller_a_l_arret, afficher_prix = s.afficher_prix,
         mentions_obligatoires = s.mentions_obligatoires, visas = s.visas, decimales = s.decimales,
         texte_pied = s.texte_pied
    from public.parametres_attachement s
   where s.marche_id = p_source and d.marche_id = p_cible;

  insert into public.categories_evenement (marche_id, code, libelle, libelle_ar, ordre, actif)
  select p_cible, c.code, c.libelle, c.libelle_ar, c.ordre, c.actif
    from public.categories_evenement c where c.marche_id = p_source
  on conflict (marche_id, code) do update
    set libelle = excluded.libelle, libelle_ar = excluded.libelle_ar,
        ordre = excluded.ordre, actif = excluded.actif;

  -- Modèles par défaut renommés comme ceux de la source (« État journalier SRM »)
  update public.modeles_export e
     set nom = 'État journalier ' || m.client_sigle
    from public.marches m
   where m.id = e.marche_id and e.marche_id = p_cible and e.nom = 'État journalier'
     and nullif(btrim(m.client_sigle), '') is not null
     and exists (select 1 from public.modeles_export s
                  where s.marche_id = p_source and s.nom = 'État journalier ' || m.client_sigle);

  insert into public.modeles_export (marche_id, nom, jeu, colonnes, regroupement, filtres, format, orientation, ordre, actif, saisi_par)
  select p_cible, e.nom, e.jeu, e.colonnes, e.regroupement, e.filtres, e.format, e.orientation, e.ordre, e.actif, null
    from public.modeles_export e where e.marche_id = p_source
  on conflict (marche_id, nom) do update
    set jeu = excluded.jeu, colonnes = excluded.colonnes, regroupement = excluded.regroupement,
        filtres = excluded.filtres, format = excluded.format, orientation = excluded.orientation,
        ordre = excluded.ordre, actif = excluded.actif;

  -- Référentiels
  insert into public.zones (id, marche_id, numero, code, libelle, lineaire_m, q_exige_m3h, geom, actif)
  select md5(p_cible || ':' || z.id)::uuid, p_cible, z.numero, z.code, z.libelle, z.lineaire_m, z.q_exige_m3h,
         z.geom, z.actif
    from public.zones z where z.marche_id = p_source;

  insert into public.secteurs (id, marche_id, zone_id, code, libelle, lineaire_m, geom, ordre, actif)
  select md5(p_cible || ':' || s.id)::uuid, p_cible, md5(p_cible || ':' || s.zone_id)::uuid, s.code, s.libelle,
         s.lineaire_m, s.geom, s.ordre, s.actif
    from public.secteurs s where s.marche_id = p_source;

  insert into public.equipes (id, marche_id, type, numero, libelle, actif)
  select md5(p_cible || ':' || e.id)::uuid, p_cible, e.type, e.numero, e.libelle, e.actif
    from public.equipes e where e.marche_id = p_source;

  insert into public.prix (id, marche_id, numero, ordre, designation, unite, quantite_marche, pu_ht,
                           famille, materiaux, diametre_min_mm, diametre_max_mm, hors_bordereau, actif)
  select md5(p_cible || ':' || p.id)::uuid, p_cible, p.numero, p.ordre, p.designation, p.unite, p.quantite_marche,
         p.pu_ht, p.famille, p.materiaux, p.diametre_min_mm, p.diametre_max_mm, p.hors_bordereau, p.actif
    from public.prix p where p.marche_id = p_source
   order by p.hors_bordereau, p.ordre, p.numero;

  insert into public.natures_refection (id, marche_id, code, libelle_fr, libelle_ar, symbole, emplacement,
                                        prix_id, necessite_refection, ordre, actif)
  select md5(p_cible || ':' || n.id)::uuid, p_cible, n.code, n.libelle_fr, n.libelle_ar, n.symbole, n.emplacement,
         case when n.prix_id is not null then md5(p_cible || ':' || n.prix_id)::uuid end,
         n.necessite_refection, n.ordre, n.actif
    from public.natures_refection n where n.marche_id = p_source;

  insert into public.motifs (id, marche_id, categorie, code, libelle_fr, libelle_ar, terrassement_paye, ordre, actif)
  select md5(p_cible || ':' || m.id)::uuid, p_cible, m.categorie, m.code, m.libelle_fr, m.libelle_ar,
         m.terrassement_paye, m.ordre, m.actif
    from public.motifs m where m.marche_id = p_source;

  insert into public.catalogue_pieces (id, marche_id, designation, famille, unite, prix_suggere_id, numero_source, actif)
  select md5(p_cible || ':' || c.id)::uuid, p_cible, c.designation, c.famille, c.unite,
         case when c.prix_suggere_id is not null then md5(p_cible || ':' || c.prix_suggere_id)::uuid end,
         c.numero_source, c.actif
    from public.catalogue_pieces c where c.marche_id = p_source;
end
$$;

create function public.copier_marche(
  p_source uuid,
  p_code text,
  p_numero text,
  p_intitule text,
  p_client text default null,
  p_ville text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _source public.marches;
  _cible uuid := gen_random_uuid();
begin
  if not private.est_admin() then
    raise exception 'La création d''un marché est réservée à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;
  select * into _source from public.marches where id = p_source;
  if _source.id is null then
    raise exception 'Marché source introuvable' using errcode = 'no_data_found';
  end if;
  if nullif(btrim(p_code), '') is null or nullif(btrim(p_numero), '') is null
     or nullif(btrim(p_intitule), '') is null then
    raise exception 'Code, numéro et intitulé du nouveau marché sont obligatoires'
      using errcode = 'check_violation';
  end if;

  insert into public.marches (id, code, numero, intitule, client, ville)
  values (_cible, btrim(p_code), btrim(p_numero), btrim(p_intitule),
          coalesce(nullif(btrim(p_client), ''), _source.client),
          coalesce(nullif(btrim(p_ville), ''), _source.ville));

  perform private.copier_parametres_marche(p_source, _cible);
  return _cible;
end
$$;

comment on function public.copier_marche(uuid, text, text, text, text, text) is
  'Administrateur : crée un marché en copiant les paramètres d''un marché existant (jamais les fuites ni les lots).';

revoke execute on function private.copier_parametres_marche(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.copier_marche(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.copier_marche(uuid, text, text, text, text, text) to authenticated;
