-- =============================================================================
-- Chantier v2, S2 / fichier 1 : référentiels et règles de la saisie terrain.
-- Contrat pour la vague 2 : docs/lots/chantier-v2-base-s2.md.
--
--  X4  libelles_listes : libellés FR / AR de toutes les listes de saisie qui sont des
--      domaines ou des énumérations (ouvrages, matériaux, emplacements, résultats…),
--      commune à tous les marchés ; natures et motifs gardent leurs colonnes FR / AR.
--  F5  natures de dégradation : Carrelage, Carreaux de ciment (REVSOL), Faïence, Pavé
--      ciment (prix 4, trottoir) dans les marchés SRM et DEMO.
--  P2  diametres_materiau : diamètres proposés par matériau, réglables par marché ;
--      liste standard posée à la création de chaque marché, complétée automatiquement
--      par les diamètres des tronçons importés (source « reseau »).
--  P7  representants_srm : représentants du maître d'ouvrage par marché (un nom) ;
--      « Abdelkhalek » inscrit d'office (SRM, DEMO) ; reparations.representant_srm_id.
--  F1  marches.champs_obligatoires_fuite : champs exigés à la création d'une fuite
--      (SRM, DEMO : tournée, secteur, ouvrage, visibilité, nature de dégradation) ;
--      les fuites existantes restent valides ; un champ exigé et rempli ne se vide plus.
--  F2  fuites.nature_degradation_id (même liste que le revêtement à refaire).
--  F4  fuites.diametre_mm, fuites.materiau, fuites.troncon_id (tronçon le plus proche
--      retenu) : suggérés par suggestions_localisation (fichier 2), jamais imposés.
--  copier_marche : copie aussi ces réglages (private.copier_parametres_terrain).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Libellés des listes de saisie (X4)
-- -----------------------------------------------------------------------------
create table public.libelles_listes (
  id uuid not null default gen_random_uuid() unique,  -- clé du journal
  liste text not null check (liste in (
    'ouvrage', 'materiau', 'emplacement', 'visibilite', 'origine', 'statut_fuite',
    'resultat_reparation', 'resultat_refection', 'travaux_reparation', 'type_photo',
    'methode_balayage', 'type_equipe'
  )),
  code text not null,
  libelle_fr text not null check (btrim(libelle_fr) <> ''),
  libelle_ar text not null check (btrim(libelle_ar) <> ''),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  primary key (liste, code)
);
alter table public.libelles_listes enable row level security;

comment on table public.libelles_listes is
  'Libellés FR / AR des listes de saisie à valeurs fixes (domaines et énumérations), communs à tous les marchés ; arabe à relire par Issam.';

insert into public.libelles_listes (liste, code, libelle_fr, libelle_ar, ordre) values
  ('ouvrage', 'branchement',            'Branchement',            'ربط',                 1),
  ('ouvrage', 'conduite',               'Conduite',               'قناة',                2),
  ('ouvrage', 'piece_speciale',         'Pièce spéciale',         'قطعة خاصة',           3),
  ('ouvrage', 'bouche_incendie',        'Bouche d''incendie',     'فوهة إطفاء الحريق',   4),
  ('ouvrage', 'vanne',                  'Vanne',                  'صمام',                5),
  ('ouvrage', 'compteur',               'Compteur',               'عداد',                6),
  ('ouvrage', 'branchement_clandestin', 'Branchement clandestin', 'ربط غير قانوني',      7),
  ('ouvrage', 'autre',                  'Autre',                  'أخرى',                8),
  ('materiau', 'polyethylene',    'Polyéthylène (PE)',   'بولي إيثيلين (PE)',     1),
  ('materiau', 'pvc',             'PVC',                 'بي في سي (PVC)',         2),
  ('materiau', 'amiante_ciment',  'Amiante-ciment (AC)', 'أسمنت أميانتي',          3),
  ('materiau', 'fonte_ductile',   'Fonte ductile',       'حديد زهر مرن',           4),
  ('materiau', 'fonte_grise',     'Fonte grise',         'حديد زهر رمادي',         5),
  ('materiau', 'acier_galvanise', 'Acier galvanisé',     'فولاذ مجلفن',            6),
  ('materiau', 'ppr',             'PPR',                 'بولي بروبيلين (PPR)',    7),
  ('materiau', 'autre',           'Autre',               'أخرى',                   8),
  ('emplacement', 'trottoir',        'Trottoir',        'رصيف',        1),
  ('emplacement', 'chaussee',        'Chaussée',        'طريق معبّد',  2),
  ('emplacement', 'terrain_naturel', 'Terrain naturel', 'أرض طبيعية',  3),
  ('emplacement', 'autre',           'Autre',           'أخرى',        4),
  ('visibilite', 'visible',   'Visible',   'ظاهرة',      1),
  ('visibilite', 'invisible', 'Invisible', 'غير ظاهرة',  2),
  ('origine', 'stepag', 'Détection de l''entreprise', 'كشف المقاولة',          1),
  ('origine', 'srm',    'Signalée par le client',     'مُبلَّغ عنها من الزبون', 2),
  ('statut_fuite', 'detectee',        'Détectée, non réparée',      'تم الكشف، لم يتم الإصلاح',          1),
  ('statut_fuite', 'en_reparation',   'Réparation en cours',        'الإصلاح جارٍ',                      2),
  ('statut_fuite', 'reparee',         'Réparée, réfection à faire', 'تم الإصلاح، إعادة الرصف متبقية',    3),
  ('statut_fuite', 'achevee',         'Achevée',                    'مكتمل',                             4),
  ('statut_fuite', 'sans_reparation', 'Sans réparation',            'بدون إصلاح',                        5),
  ('resultat_reparation', 'reparee',     'Réparée',                  'تم الإصلاح',            1),
  ('resultat_reparation', 'en_cours',    'En cours / reste à finir', 'جارٍ / لم يكتمل بعد',   2),
  ('resultat_reparation', 'non_reparee', 'Non réparée',              'لم يتم الإصلاح',        3),
  ('resultat_refection', 'faite',     'Faite',     'مُنجَزة',      1),
  ('resultat_refection', 'non_faite', 'Non faite', 'غير مُنجَزة',  2),
  ('travaux_reparation', 'tuyau_repare',               'Tuyau / conduite réparé(e)',   'أنبوب / قناة مُصلَحة',          1),
  ('travaux_reparation', 'robinet_pec_change',         'Robinet PEC changé',           'محبس التفريع مُستبدَل',         2),
  ('travaux_reparation', 'collier_pec_change',         'Collier PEC changé',           'طوق التفريع مُستبدَل',          3),
  ('travaux_reparation', 'bouche_a_cle_mise_a_niveau', 'Bouche à clé mise à niveau',   'غطاء المحبس مُسوّى مع السطح',  4),
  ('travaux_reparation', 'element_remplace',           'Élément de conduite remplacé', 'عنصر من القناة مُستبدَل',      5),
  ('type_photo', 'detection', 'Détection',        'الكشف',          1),
  ('type_photo', 'avant',     'Avant réparation', 'قبل الإصلاح',    2),
  ('type_photo', 'pendant',   'Pendant',          'أثناء',          3),
  ('type_photo', 'apres',     'Après réparation', 'بعد الإصلاح',    4),
  ('type_photo', 'refection', 'Réfection',        'إعادة الرصف',    5),
  ('type_photo', 'autre',     'Autre',            'أخرى',           6),
  ('methode_balayage', 'ecoute',          'Écoute',          'التنصّت',                1),
  ('methode_balayage', 'correlation',     'Corrélation',     'قياس الترابط',           2),
  ('methode_balayage', 'prelocalisation', 'Prélocalisation', 'التحديد المسبق للموقع',  3),
  ('methode_balayage', 'enregistreurs',   'Enregistreurs',   'أجهزة التسجيل',          4),
  ('type_equipe', 'detection',  'Détection',  'الكشف',    1),
  ('type_equipe', 'reparation', 'Réparation', 'الإصلاح',  2),
  ('type_equipe', 'mixte',      'Mixte',      'مختلط',    3);

create trigger maj_modifie_le before update on public.libelles_listes
  for each row execute function private.maj_modifie_le();
create trigger journaliser after insert or update or delete on public.libelles_listes
  for each row execute function private.journaliser();

-- Lecture par tout compte connecté ; écriture par l'administrateur (listes communes).
create policy libelles_listes_lecture on public.libelles_listes for select to authenticated
  using (true);
create policy libelles_listes_creation on public.libelles_listes for insert to authenticated
  with check ((select private.est_admin()));
create policy libelles_listes_modification on public.libelles_listes for update to authenticated
  using ((select private.est_admin())) with check ((select private.est_admin()));
grant select, insert, update on public.libelles_listes to authenticated;
grant all on public.libelles_listes to service_role;

-- -----------------------------------------------------------------------------
-- 2. Natures de dégradation (F5) : marchés SRM et DEMO
-- -----------------------------------------------------------------------------
update public.natures_refection n
   set libelle_fr = 'Carreaux de ciment (REVSOL)', libelle_ar = 'بلاط إسمنتي (ريفسول)'
  from public.marches m
 where m.id = n.marche_id and m.code in ('SRM-4500004453', 'DEMO') and n.code = 'carreaux_ciment';

insert into public.natures_refection (marche_id, code, libelle_fr, libelle_ar, symbole, emplacement, prix_id,
                                      necessite_refection, ordre)
select m.id, v.code, v.libelle_fr, v.libelle_ar, v.symbole, 'trottoir', p.id, true, v.ordre
  from public.marches m
  join (values
         ('carrelage',   'Carrelage',   'بلاط',                 'CR', 5),
         ('faience',     'Faïence',     'زليج',                 'F',  6),
         ('pave_ciment', 'Pavé ciment', 'حجر الرصف الإسمنتي',  'PV', 7)
       ) v (code, libelle_fr, libelle_ar, symbole, ordre) on true
  left join public.prix p on p.marche_id = m.id and p.numero = '4'
 where m.code in ('SRM-4500004453', 'DEMO')
on conflict (marche_id, code) do nothing;

update public.natures_refection n
   set ordre = v.ordre
  from public.marches m,
       (values ('enrobe_a_chaud', 8), ('enrobe_resine_a_froid', 9), ('terrain_naturel', 10), ('autre', 11))
         v (code, ordre)
 where m.id = n.marche_id and m.code in ('SRM-4500004453', 'DEMO') and n.code = v.code;

-- -----------------------------------------------------------------------------
-- 3. Diamètres par matériau (P2)
-- -----------------------------------------------------------------------------
create table public.diametres_materiau (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  materiau public.code_materiau not null,
  diametre_mm integer not null check (diametre_mm > 0 and diametre_mm <= 3000),
  source text not null default 'manuel' check (source in ('standard', 'reseau', 'manuel')),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, materiau, diametre_mm),
  unique (id, marche_id)
);
alter table public.diametres_materiau enable row level security;

comment on table public.diametres_materiau is
  'Diamètres proposés par matériau (mm : DE pour le PE et le PPR, DN sinon), par marché ; standard, tirés du réseau ou ajoutés ; désactivés, jamais supprimés.';

-- Liste standard (réponse d'Issam Q9) ; la fonte vaut pour la fonte ductile et la fonte grise.
create function private.poser_diametres_standard(p_marche uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.diametres_materiau (marche_id, materiau, diametre_mm, source)
  select p_marche, v.materiau, d, 'standard'
    from (values
      ('polyethylene',    array[20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160, 200]),
      ('pvc',             array[63, 75, 90, 110, 125, 160, 200, 250, 315]),
      ('amiante_ciment',  array[60, 80, 100, 125, 150, 200, 250, 300, 350, 400]),
      ('fonte_ductile',   array[60, 80, 100, 125, 150, 200, 250, 300, 400, 500, 600]),
      ('fonte_grise',     array[60, 80, 100, 125, 150, 200, 250, 300, 400, 500, 600]),
      ('acier_galvanise', array[15, 20, 26, 33, 40, 50]),
      ('ppr',             array[20, 25, 32, 40, 50, 63])
    ) v (materiau, diametres)
   cross join unnest(v.diametres) d
  on conflict (marche_id, materiau, diametre_mm) do nothing
$$;

-- Matériau du dessin (texte libre du plan : PEHD, PVC, AC, FONTE…) → code de matériau.
create function private.materiau_reseau(p_texte text)
returns public.code_materiau
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null or t = '' then null
    when t in ('PE', 'PEHD', 'PEBD', 'PEMD', 'POLYETHYLENE', 'PE100', 'PE80') then 'polyethylene'
    when t in ('PVC', 'PVCU', 'PVC-U') then 'pvc'
    when t in ('AC', 'AMIANTE', 'AMIANTE CIMENT', 'AMIANTE-CIMENT', 'FIBROCIMENT', 'FC') then 'amiante_ciment'
    when t in ('FONTE', 'FD', 'FONTE DUCTILE', 'FTE') then 'fonte_ductile'
    when t in ('FG', 'FONTE GRISE') then 'fonte_grise'
    when t in ('ACIER', 'AG', 'ACIER GALVANISE', 'GALVA', 'GALVANISE') then 'acier_galvanise'
    when t in ('PPR', 'PP-R') then 'ppr'
  end::public.code_materiau
  from (select upper(btrim(translate(p_texte, 'éèêÉÈÊ', 'eeeEEE'))) as t) x
$$;

-- Diamètres des tronçons actifs absents de la liste (source « reseau ») ; renvoie le nombre ajouté.
create function private.completer_diametres_reseau(p_marche uuid, p_troncons uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _n integer;
begin
  insert into public.diametres_materiau (marche_id, materiau, diametre_mm, source)
  select distinct t.marche_id, private.materiau_reseau(t.materiau), t.diametre_mm, 'reseau'
    from public.troncons t
   where t.marche_id = p_marche and t.actif and t.diametre_mm between 1 and 3000
     and private.materiau_reseau(t.materiau) is not null
     and (p_troncons is null or t.id = any (p_troncons))
  on conflict (marche_id, materiau, diametre_mm) do nothing;
  get diagnostics _n = row_count;
  return _n;
end
$$;

create function private.apres_troncons_diametres()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _marche uuid;
begin
  for _marche in select distinct n.marche_id from nouveaux n loop
    perform private.completer_diametres_reseau(_marche,
      (select array_agg(n.id) from nouveaux n where n.marche_id = _marche and n.diametre_mm is not null));
  end loop;
  return null;
end
$$;

create trigger apres_troncons_diametres_insertion after insert on public.troncons
  referencing new table as nouveaux
  for each statement execute function private.apres_troncons_diametres();
create trigger apres_troncons_diametres_modification after update on public.troncons
  referencing new table as nouveaux
  for each statement execute function private.apres_troncons_diametres();

do $$
declare
  _t text;
begin
  foreach _t in array array['diametres_materiau'] loop
    execute format('create trigger maj_modifie_le before update on public.%I
                    for each row execute function private.maj_modifie_le()', _t);
    execute format('create trigger figer_marche before update on public.%I
                    for each row execute function private.figer_marche()', _t);
    execute format('create trigger journaliser after insert or update or delete on public.%I
                    for each row execute function private.journaliser()', _t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 4. Représentants du maître d'ouvrage (P7)
-- -----------------------------------------------------------------------------
create table public.representants_srm (
  id uuid primary key default gen_random_uuid(),
  marche_id uuid not null references public.marches (id),
  nom text not null check (btrim(nom) <> ''),
  ordre integer not null default 0,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  unique (marche_id, nom),
  unique (id, marche_id)
);
alter table public.representants_srm enable row level security;

comment on table public.representants_srm is
  'Représentants du maître d''ouvrage présents aux réparations, par marché (liste réglable, un seul champ nom) ; désactivés, jamais supprimés.';

create trigger maj_modifie_le before update on public.representants_srm
  for each row execute function private.maj_modifie_le();
create trigger figer_marche before update on public.representants_srm
  for each row execute function private.figer_marche();
create trigger journaliser after insert or update or delete on public.representants_srm
  for each row execute function private.journaliser();

insert into public.representants_srm (marche_id, nom, ordre)
select m.id, 'Abdelkhalek', 1 from public.marches m where m.code in ('SRM-4500004453', 'DEMO')
on conflict (marche_id, nom) do nothing;

alter table public.reparations
  add column representant_srm_id uuid,
  add constraint reparations_representant_srm_fkey foreign key (representant_srm_id, marche_id)
    references public.representants_srm (id, marche_id);
create index reparations_representant_idx on public.reparations (representant_srm_id) where representant_srm_id is not null;

comment on column public.reparations.representant_srm_id is
  'Représentant du maître d''ouvrage choisi dans la liste du marché (facultatif) ; son nom est recopié dans representant_srm.';

-- Le nom choisi est recopié dans le champ texte (exports et rapports existants).
create function private.completer_representant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.representant_srm_id is not null
     and (tg_op = 'INSERT' or new.representant_srm_id is distinct from old.representant_srm_id) then
    select r.nom into new.representant_srm from public.representants_srm r where r.id = new.representant_srm_id;
  end if;
  return new;
end
$$;
create trigger d_completer_representant before insert or update on public.reparations
  for each row execute function private.completer_representant();

-- -----------------------------------------------------------------------------
-- 5. Nouveaux champs de la fuite (F2, F4) et champs obligatoires (F1)
-- -----------------------------------------------------------------------------
alter table public.fuites
  add column nature_degradation_id uuid,
  add column diametre_mm integer check (diametre_mm > 0),
  add column materiau public.code_materiau,
  add column troncon_id uuid,
  add constraint fuites_nature_degradation_fkey foreign key (nature_degradation_id, marche_id)
    references public.natures_refection (id, marche_id),
  add constraint fuites_troncon_fkey foreign key (troncon_id, marche_id)
    references public.troncons (id, marche_id);
create index fuites_troncon_idx on public.fuites (troncon_id) where troncon_id is not null;

comment on column public.fuites.nature_degradation_id is
  'Nature du revêtement dégradé à l''endroit de la fuite (liste des natures de réfection du marché).';
comment on column public.fuites.diametre_mm is 'Diamètre de la conduite (mm), suggéré par le tronçon le plus proche.';
comment on column public.fuites.materiau is 'Matériau de la conduite, suggéré par le tronçon le plus proche.';
comment on column public.fuites.troncon_id is 'Tronçon du réseau retenu à la détection (le plus proche suggéré).';

alter table public.marches
  add column champs_obligatoires_fuite text[] not null default '{}'
    check (champs_obligatoires_fuite <@ array['reference_srm', 'secteur_id', 'ouvrage', 'visibilite',
                                              'nature_degradation_id', 'adresse', 'diametre_mm', 'materiau']);

comment on column public.marches.champs_obligatoires_fuite is
  'Champs exigés à la création d''une fuite (contrôlés en base) ; les fuites antérieures restent valides.';

update public.marches
   set champs_obligatoires_fuite = array['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id']
 where code in ('SRM-4500004453', 'DEMO');

create function private.libelle_champ_fuite(p_champ text, p_libelle_reference text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_champ
    when 'reference_srm' then lower(coalesce(nullif(btrim(p_libelle_reference), ''), 'référence'))
    when 'secteur_id' then 'secteur'
    when 'ouvrage' then 'ouvrage'
    when 'visibilite' then 'visibilité'
    when 'nature_degradation_id' then 'nature de dégradation'
    when 'adresse' then 'adresse'
    when 'diametre_mm' then 'diamètre'
    when 'materiau' then 'matériau'
    else p_champ
  end
$$;

-- Création par un utilisateur : champs exigés par le marché. Modification : un champ
-- exigé déjà rempli ne se vide pas (les fuites antérieures, incomplètes, restent modifiables).
create function private.controler_champs_fuite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _m public.marches;
  _champ text;
  _manque text[] := '{}';
  _nouveau jsonb;
  _ancien jsonb;
begin
  if private.appel_systeme() then
    return new;
  end if;
  select * into _m from public.marches where id = new.marche_id;
  -- Marché invisible pour l'appelant : la règle RLS refusera l'écriture.
  if coalesce(cardinality(_m.champs_obligatoires_fuite), 0) = 0 then
    return new;
  end if;
  _nouveau := to_jsonb(new);
  _ancien := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  foreach _champ in array _m.champs_obligatoires_fuite loop
    if nullif(btrim(_nouveau ->> _champ), '') is null
       and (tg_op = 'INSERT' or nullif(btrim(_ancien ->> _champ), '') is not null) then
      _manque := _manque || private.libelle_champ_fuite(_champ, _m.libelle_reference);
    end if;
  end loop;
  if cardinality(_manque) > 0 then
    raise exception 'Champs obligatoires manquants : %', array_to_string(_manque, ', ')
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger d_controler_champs before insert or update on public.fuites
  for each row execute function private.controler_champs_fuite();

-- -----------------------------------------------------------------------------
-- 6. Valeurs de chaque marché : nouveau marché (diamètres standard), marchés existants,
--    copie d'un marché
-- -----------------------------------------------------------------------------
create function private.initialiser_referentiels_terrain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.poser_diametres_standard(new.id);
  return null;
end
$$;
create trigger initialiser_referentiels_terrain after insert on public.marches
  for each row execute function private.initialiser_referentiels_terrain();

select private.poser_diametres_standard(m.id) from public.marches m;
select private.completer_diametres_reseau(m.id) from public.marches m;

-- Réglages de la saisie terrain copiés d'un marché à l'autre (appelée par copier_parametres_marche).
create function private.copier_parametres_terrain(p_source uuid, p_cible uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marches d
     set champs_obligatoires_fuite = s.champs_obligatoires_fuite
    from public.marches s
   where s.id = p_source and d.id = p_cible;

  insert into public.diametres_materiau (marche_id, materiau, diametre_mm, source, actif)
  select p_cible, x.materiau, x.diametre_mm, x.source, x.actif
    from public.diametres_materiau x where x.marche_id = p_source
  on conflict (marche_id, materiau, diametre_mm) do update
    set source = excluded.source, actif = excluded.actif;

  insert into public.representants_srm (id, marche_id, nom, ordre, actif)
  select md5(p_cible || ':' || r.id)::uuid, p_cible, r.nom, r.ordre, r.actif
    from public.representants_srm r where r.marche_id = p_source
  on conflict (marche_id, nom) do nothing;
end
$$;

-- Corps de 20261006140000 (lot T) + appel de private.copier_parametres_terrain à la fin.
create or replace function private.copier_parametres_marche(p_source uuid, p_cible uuid)
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

  -- Suggestions d'article (famille ou produit Dolibarr → article du bordereau copié)
  insert into public.suggestions_articles (id, marche_id, prix_id, famille, produit_id)
  select md5(p_cible || ':' || s.id)::uuid, p_cible, md5(p_cible || ':' || s.prix_id)::uuid, s.famille, s.produit_id
    from public.suggestions_articles s where s.marche_id = p_source;

  -- Chantier v2 (S2) : saisie terrain et attachement par anticipation
  perform private.copier_parametres_terrain(p_source, p_cible);
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Règles RLS et privilèges
-- -----------------------------------------------------------------------------
do $$
declare
  _t text;
begin
  foreach _t in array array['diametres_materiau', 'representants_srm'] loop
    execute format($f$
      create policy %1$s_lecture on public.%1$I for select to authenticated
        using (marche_id = any ((select private.mes_marches())::uuid[]));
      create policy %1$s_creation on public.%1$I for insert to authenticated
        with check (marche_id = any ((select private.marches_autorises('parametres', 'creer'))::uuid[]));
      create policy %1$s_modification on public.%1$I for update to authenticated
        using (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]))
        with check (marche_id = any ((select private.marches_autorises('parametres', 'modifier'))::uuid[]));
      grant select, insert, update on public.%1$I to authenticated;
      grant all on public.%1$I to service_role;
    $f$, _t);
  end loop;
end
$$;

revoke execute on function
  private.poser_diametres_standard(uuid),
  private.materiau_reseau(text),
  private.completer_diametres_reseau(uuid, uuid[]),
  private.apres_troncons_diametres(),
  private.completer_representant(),
  private.libelle_champ_fuite(text, text),
  private.controler_champs_fuite(),
  private.initialiser_referentiels_terrain(),
  private.copier_parametres_terrain(uuid, uuid),
  private.copier_parametres_marche(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.materiau_reseau(text), private.libelle_champ_fuite(text, text)
  to authenticated, service_role;
