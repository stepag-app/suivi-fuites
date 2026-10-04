-- =============================================================================
-- Étape C : exports.
--  * Modèles d'export enregistrés par marché (jeu de données, colonnes,
--    regroupement, filtres, format, orientation) ; trois modèles par défaut.
--  * Vue v_fuites_export : la liste des fuites enrichie de la dernière
--    réparation, de la dernière réfection, des pièces posées et des quantités,
--    pour exporter le maximum d'informations et filtrer ensuite dans Excel.
-- Les fichiers (Excel, PDF, Word, CSV) sont fabriqués dans le navigateur.
-- =============================================================================

create table public.modeles_export (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  nom text not null check (btrim(nom) <> ''),
  jeu text not null check (jeu in ('fuites', 'quantites', 'pieces', 'attachement', 'evenements')),
  colonnes text[] not null default '{}',
  regroupement text not null default 'aucun'
    check (regroupement in ('aucun', 'zone', 'secteur', 'equipe', 'article', 'jour', 'categorie', 'piece')),
  filtres jsonb not null default '{}'::jsonb check (jsonb_typeof(filtres) = 'object'),
  format text not null default 'xlsx' check (format in ('xlsx', 'pdf', 'docx', 'csv')),
  orientation text not null default 'paysage' check (orientation in ('portrait', 'paysage')),
  ordre integer not null default 0,
  actif boolean not null default true,
  saisi_par uuid default auth.uid() references public.profils (id),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, nom)
);
alter table public.modeles_export enable row level security;

create trigger maj_modifie_le before update on public.modeles_export
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.modeles_export
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.modeles_export
  for each row execute function private.journaliser();

create policy modeles_export_lecture on public.modeles_export for select to authenticated
  using (marche_id = any ((select private.marches_autorises('exports', 'lire'))::uuid[]));
create policy modeles_export_creation on public.modeles_export for insert to authenticated
  with check (marche_id = any ((select private.marches_autorises('exports', 'creer'))::uuid[]));
create policy modeles_export_modification on public.modeles_export for update to authenticated
  using (marche_id = any ((select private.marches_autorises('exports', 'creer'))::uuid[]))
  with check (marche_id = any ((select private.marches_autorises('exports', 'creer'))::uuid[]));
grant select, insert, update on public.modeles_export to authenticated;

-- -----------------------------------------------------------------------------
-- Valeurs par défaut d'un marché : catégories d'événements, règles
-- d'attachement et modèles d'export.
-- -----------------------------------------------------------------------------
create or replace function private.initialiser_parametres_marche(p_marche uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.parametres_attachement (marche_id) values (p_marche)
  on conflict (marche_id) do nothing;
  insert into public.categories_evenement (marche_id, code, libelle, ordre)
  select p_marche, v.code, v.libelle, v.ordre
    from (values
      ('sortie_audit',       'Sortie audit',                       1),
      ('sortie_reception',   'Sortie réception',                   2),
      ('sortie_laboratoire', 'Sortie laboratoire / prélèvement',   3),
      ('reunion_chantier',   'Réunion de chantier',                4),
      ('autre',              'Autre',                              9)
    ) v (code, libelle, ordre)
  on conflict (marche_id, code) do nothing;
  insert into public.modeles_export (marche_id, nom, jeu, colonnes, regroupement, filtres, format, orientation, ordre, saisi_par)
  select p_marche, v.nom, v.jeu, v.colonnes, v.regroupement, v.filtres::jsonb, v.format, v.orientation, v.ordre, null
    from public.marches m,
         (values
           ('État journalier', 'fuites',
            array['numero', 'reference_srm', 'adresse', 'zone', 'secteur', 'ouvrage', 'visibilite', 'date_detection', 'detectee_par', 'statut'],
            'secteur', '{"periode": "jour"}', 'pdf', 'paysage', 1),
           ('Pièces posées par secteur', 'pieces',
            array['secteur', 'designation', 'unite', 'quantite'],
            'secteur', '{"periode": "mois", "synthese": true}', 'xlsx', 'portrait', 2),
           ('Attachement du mois', 'attachement',
            array['fuite_numero', 'reference_srm', 'secteur', 'reparee_le', 'fouille_longueur_m', 'fouille_largeur_m',
                  'fouille_profondeur_m', 'refectionnee_le', 'prix_numero', 'quantite', 'unite'],
            'article', '{}', 'pdf', 'portrait', 3)
         ) v (nom, jeu, colonnes, regroupement, filtres, format, orientation, ordre)
   where m.id = p_marche
  on conflict (marche_id, nom) do nothing;
$$;

do $$
begin
  perform private.initialiser_parametres_marche(m.id) from public.marches m;
end
$$;

-- Le marché qui suit un client nommé reçoit « État journalier <sigle> ».
update public.modeles_export e
   set nom = 'État journalier ' || m.client_sigle
  from public.marches m
 where m.id = e.marche_id and e.nom = 'État journalier' and nullif(btrim(m.client_sigle), '') is not null;

-- -----------------------------------------------------------------------------
-- Fuites enrichies pour les exports
-- -----------------------------------------------------------------------------
create view public.v_fuites_export with (security_invoker = true) as
select
  v.*,
  r.realisee_le as reparation_le,
  r.resultat as resultat_reparation,
  r.ouvrage as ouvrage_constate,
  r.materiau,
  r.diametre_mm,
  r.fouille_longueur_m,
  r.fouille_largeur_m,
  r.fouille_profondeur_m,
  r.volume_m3,
  r.longueur_pe_m,
  r.tuyau_repare,
  r.robinet_pec_change,
  r.collier_pec_change,
  r.bouche_a_cle_mise_a_niveau,
  r.representant_srm as representant_client,
  er.libelle as equipe_reparation,
  pc.nom_complet as chef_reparation,
  nr.libelle_fr as revetement,
  nr.libelle_ar as revetement_ar,
  rf.realisee_le as refection_le,
  rf.resultat as resultat_refection,
  nf.libelle_fr as nature_refection,
  nf.libelle_ar as nature_refection_ar,
  rf.surface_m2 as surface_refection_m2,
  pp.pieces as pieces_posees,
  q.quantites
from public.v_fuites v
left join lateral (
  select rp.*
    from public.reparations rp
   where rp.fuite_id = v.id and rp.supprime_le is null
   order by rp.realisee_le desc
   limit 1
) r on true
left join public.equipes er on er.id = r.equipe_id
left join public.profils pc on pc.id = r.auteur_terrain_id
left join public.natures_refection nr on nr.id = r.nature_revetement_id
left join lateral (
  select x.*
    from public.refections x
   where x.fuite_id = v.id and x.supprime_le is null
   order by x.realisee_le desc
   limit 1
) rf on true
left join public.natures_refection nf on nf.id = rf.nature_id
left join lateral (
  select string_agg(coalesce(cp.designation, p.designation_libre) || ' × ' || trim_scale(p.quantite), ' ; '
                    order by coalesce(cp.designation, p.designation_libre)) as pieces
    from public.reparation_pieces p
    join public.reparations rr on rr.id = p.reparation_id and rr.supprime_le is null
    left join public.catalogue_pieces cp on cp.id = p.piece_id
   where rr.fuite_id = v.id and p.supprime_le is null
) pp on true
left join lateral (
  select string_agg(format('P%s : %s %s', s.numero, trim_scale(s.total), s.unite), ' ; ' order by s.ordre, s.numero) as quantites
    from (
      select px.numero, px.ordre, px.unite, sum(l.quantite) as total
        from public.lignes_quantites l
        join public.prix px on px.id = l.prix_id
       where l.fuite_id = v.id and l.supprime_le is null
       group by px.numero, px.ordre, px.unite
    ) s
) q on true;

grant select on public.v_fuites_export to authenticated;
