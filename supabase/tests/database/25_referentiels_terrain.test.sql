-- =============================================================================
-- Chantier v2, S2 / fichier 1 : libellés arabes des listes (X4), natures F5,
-- diamètres par matériau (P2), représentants du maître d'ouvrage (P7), nouveaux champs
-- et champs obligatoires de la fuite (F1, F2, F4), copie d'un marché.
-- Tout est annulé à la fin.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

-- -----------------------------------------------------------------------------
-- Jeu d'essai : a = admin, b = détection A, d = responsable A, e = détection B
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'agent.b@test.local', '{"identifiant": "agent.b", "nom_complet": "Agent B"}');
update profils set est_admin = true where identifiant = 'issam';

insert into marches (id, code, numero, intitule, client, libelle_reference) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST-A', '1', 'Marché A', 'Client A', 'Tournée'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'TEST-B', '2', 'Marché B', 'Client B', 'Référence');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000001', 'responsable');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000e', 'bbbbbbbb-0000-0000-0000-000000000001', 'detection');

insert into zones (id, marche_id, numero, code, libelle) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Z1', 'Zone 1');
insert into secteurs (id, marche_id, zone_id, code, libelle) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'S1', 'Secteur 1');
insert into prix (id, marche_id, numero, ordre, designation, unite, pu_ht, famille) values
  ('aaaaaaaa-4444-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '4', 4, 'Réfection trottoir', 'm2', 100, 'refection');
insert into natures_refection (id, marche_id, code, libelle_fr, libelle_ar, emplacement, prix_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'beton', 'Béton', 'خرسانة', 'trottoir', 'aaaaaaaa-4444-0000-0000-000000000004');
insert into natures_refection (id, marche_id, code, libelle_fr, emplacement) values
  ('cccccccc-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'beton', 'Béton', 'trottoir');

-- -----------------------------------------------------------------------------
-- 1. X4 : libellés arabes des listes de saisie
-- -----------------------------------------------------------------------------
select is((select count(*)::int from libelles_listes where btrim(libelle_ar) = ''), 0,
  'listes : chaque libellé a son arabe');
select is((select array_agg(code order by code) from libelles_listes where liste = 'ouvrage'),
  array['autre', 'bouche_incendie', 'branchement', 'branchement_clandestin', 'compteur', 'conduite', 'piece_speciale', 'vanne'],
  'listes : tous les ouvrages du domaine code_ouvrage');
select is((select array_agg(code order by code) from libelles_listes where liste = 'materiau'),
  array['acier_galvanise', 'amiante_ciment', 'autre', 'fonte_ductile', 'fonte_grise', 'polyethylene', 'ppr', 'pvc'],
  'listes : tous les matériaux du domaine code_materiau');
select is((select count(*)::int from unnest(enum_range(null::emplacement_fouille)) e
            where e::text not in (select code from libelles_listes where liste = 'emplacement')), 0,
  'listes : tous les emplacements de l''énumération');
select is((select count(*)::int from (
            select 'resultat_reparation' l, e::text c from unnest(enum_range(null::resultat_reparation)) e
            union all select 'resultat_refection', e::text from unnest(enum_range(null::resultat_refection)) e
            union all select 'visibilite', e::text from unnest(enum_range(null::visibilite_fuite)) e
            union all select 'statut_fuite', e::text from unnest(enum_range(null::statut_fuite)) e
            union all select 'type_photo', e::text from unnest(enum_range(null::type_photo)) e
            union all select 'origine', e::text from unnest(enum_range(null::origine_fuite)) e
            union all select 'type_equipe', e::text from unnest(enum_range(null::type_equipe)) e) x
           where (x.l, x.c) not in (select liste, code from libelles_listes)), 0,
  'listes : résultats, visibilité, statuts, types de photo, origines, équipes complets');
select is((select count(*)::int from natures_refection n join marches m on m.id = n.marche_id
            where m.code in ('SRM-4500004453', 'DEMO') and nullif(btrim(n.libelle_ar), '') is null), 0,
  'natures SRM et DEMO : toutes avec l''arabe');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select is((select libelle_ar from libelles_listes where liste = 'visibilite' and code = 'invisible'), 'غير ظاهرة',
  'agent : lit les libellés arabes');
select throws_ok($$ insert into libelles_listes (liste, code, libelle_fr, libelle_ar) values ('ouvrage', 'x', 'X', 'س') $$,
  '42501', null, 'agent : ne modifie pas les listes communes');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ with u as (update libelles_listes set libelle_ar = 'x' where liste = 'ouvrage' and code = 'vanne' returning 1)
                     select count(*)::int from u $$, $$ values (0) $$, 'responsable : listes communes réservées à l''administrateur');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ update libelles_listes set libelle_ar = 'صمام التوقف' where liste = 'ouvrage' and code = 'vanne' $$,
  'administrateur : corrige un libellé arabe');
reset role;

-- -----------------------------------------------------------------------------
-- 2. F5 : natures SRM et DEMO
-- -----------------------------------------------------------------------------
select results_eq($$ select n.code, n.libelle_fr, n.libelle_ar, n.emplacement::text, p.numero
                       from natures_refection n join marches m on m.id = n.marche_id
                       join prix p on p.id = n.prix_id
                      where m.code = 'SRM-4500004453' and n.code in ('carreaux_ciment', 'carrelage', 'faience', 'pave_ciment')
                      order by n.ordre $$,
  $$ values ('carreaux_ciment'::text, 'Carreaux de ciment (REVSOL)'::text, 'بلاط إسمنتي (ريفسول)'::text, 'trottoir'::text, '4'::text),
            ('carrelage', 'Carrelage', 'بلاط', 'trottoir', '4'),
            ('faience', 'Faïence', 'زليج', 'trottoir', '4'),
            ('pave_ciment', 'Pavé ciment', 'حجر الرصف الإسمنتي', 'trottoir', '4') $$,
  'SRM : carreaux de ciment (REVSOL), carrelage, faïence, pavé ciment au prix 4 (trottoir)');
select is((select count(*)::int from natures_refection n join marches m on m.id = n.marche_id
            join prix p on p.id = n.prix_id and p.marche_id = m.id and p.numero = '4'
            where m.code = 'DEMO' and n.code in ('carreaux_ciment', 'carrelage', 'faience', 'pave_ciment')), 4,
  'DEMO : les mêmes quatre natures, prix 4 du marché DEMO');

-- -----------------------------------------------------------------------------
-- 3. P2 : diamètres par matériau
-- -----------------------------------------------------------------------------
select is((select array_agg(d.diametre_mm order by d.diametre_mm) from diametres_materiau d join marches m on m.id = d.marche_id
            where m.code = 'SRM-4500004453' and d.materiau = 'polyethylene'),
  array[20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160, 200], 'SRM : PE 20 à 200');
select is((select array_agg(d.diametre_mm order by d.diametre_mm) from diametres_materiau d
            where d.marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and d.materiau = 'pvc'),
  array[63, 75, 90, 110, 125, 160, 200, 250, 315], 'nouveau marché : PVC 63 à 315 posés d''office');
select results_eq($$ select materiau::text, min(diametre_mm), max(diametre_mm), count(*)::int from diametres_materiau
                      where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and source = 'standard'
                      group by materiau order by materiau::text $$,
  $$ values ('acier_galvanise'::text, 15, 50, 6), ('amiante_ciment', 60, 400, 10), ('fonte_ductile', 60, 600, 11),
            ('fonte_grise', 60, 600, 11), ('polyethylene', 20, 200, 12), ('ppr', 20, 63, 6), ('pvc', 63, 315, 9) $$,
  'liste standard : AC 60-400, fonte 60-600, acier galvanisé 15-50, PPR 20-63');

-- Tronçons importés : diamètres du réseau ajoutés (PVC 225, PEHD 53), matériau inconnu ignoré
insert into troncons (marche_id, reference, diametre_mm, materiau, geom) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'T1', 225, 'PVC',   st_geomfromtext('LINESTRING(10.0 10.0, 10.001 10.0)', 4326)),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'T2', 53,  'pehd ', st_geomfromtext('LINESTRING(10.0 10.001, 10.001 10.001)', 4326)),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'T3', 110, 'PVC',   st_geomfromtext('LINESTRING(10.0 10.002, 10.001 10.002)', 4326)),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'T4', 77,  'BETON', st_geomfromtext('LINESTRING(10.0 10.003, 10.001 10.003)', 4326));
select results_eq($$ select materiau::text, diametre_mm from diametres_materiau
                      where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and source = 'reseau' order by 1, 2 $$,
  $$ values ('polyethylene'::text, 53), ('pvc', 225) $$,
  'réseau : diamètres absents ajoutés (PVC 225, PE 53) ; PVC 110 déjà standard ; matériau inconnu ignoré');
update troncons set diametre_mm = 280 where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and reference = 'T3';
select ok(exists (select 1 from diametres_materiau where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'
                   and materiau = 'pvc' and diametre_mm = 280 and source = 'reseau'),
  'réseau : un diamètre corrigé sur un tronçon complète aussi la liste');
select is(private.materiau_reseau('Fonte'), 'fonte_ductile'::code_materiau, 'matériau du plan : FONTE → fonte ductile');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select lives_ok($$ insert into diametres_materiau (marche_id, materiau, diametre_mm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'polyethylene', 16) $$, 'responsable : ajoute un diamètre (PE 16)');
select lives_ok($$ update diametres_materiau set actif = false
                    where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001' and materiau = 'polyethylene' and diametre_mm = 53 $$,
  'responsable : désactive un diamètre');
select throws_ok($$ insert into diametres_materiau (marche_id, materiau, diametre_mm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'polyethylene', 16) $$, '23505', null, 'un diamètre par matériau et par marché');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select ok((select count(*) from diametres_materiau where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001') > 60,
  'agent : lit les diamètres de son marché');
select throws_ok($$ insert into diametres_materiau (marche_id, materiau, diametre_mm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'pvc', 999) $$, '42501', null, 'agent : ne règle pas les diamètres');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select is((select count(*)::int from diametres_materiau where marche_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'agent B : ne voit pas les diamètres du marché A');
reset role;

-- -----------------------------------------------------------------------------
-- 4. P7 : représentants du maître d'ouvrage
-- -----------------------------------------------------------------------------
select is((select array_agg(m.code order by m.code) from representants_srm r join marches m on m.id = r.marche_id
            where r.nom = 'Abdelkhalek'), array['DEMO', 'SRM-4500004453'], 'Abdelkhalek inscrit d''office (SRM, DEMO)');
insert into representants_srm (id, marche_id, nom) values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Abdelkhalek'),
  ('bbbbbbbb-8888-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Karim');
insert into fuites (id, marche_id) values ('aaaaaaaa-1111-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into reparations (id, marche_id, fuite_id, resultat, representant_srm_id) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009',
   'en_cours', 'aaaaaaaa-8888-0000-0000-000000000001');
select is((select representant_srm from reparations where id = 'aaaaaaaa-5555-0000-0000-000000000001'), 'Abdelkhalek',
  'réparation : le nom du représentant choisi est recopié');
select throws_ok($$ insert into reparations (marche_id, fuite_id, resultat, representant_srm_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009', 'en_cours', 'bbbbbbbb-8888-0000-0000-000000000001') $$,
  '23503', null, 'réparation : représentant d''un autre marché refusé');
select lives_ok($$ insert into reparations (marche_id, fuite_id, resultat) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000009', 'en_cours') $$,
  'réparation : représentant facultatif');

-- -----------------------------------------------------------------------------
-- 5. F1, F2, F4 : nouveaux champs et champs obligatoires
-- -----------------------------------------------------------------------------
select is((select champs_obligatoires_fuite from marches where code = 'SRM-4500004453'), '{}'::text[],
  'SRM : champs obligatoires suspendus jusqu''aux formulaires de la vague 2 (20261010200000)');
select is((select champs_obligatoires_fuite from marches where id = 'aaaaaaaa-0000-0000-0000-000000000001'), '{}'::text[],
  'nouveau marché sans copie : aucun champ obligatoire par défaut');

-- Fuite ancienne, incomplète, saisie avant la règle
insert into fuites (id, marche_id, auteur_terrain_id) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
update marches set champs_obligatoires_fuite = array['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id']
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into fuites (marche_id, reference_srm, adresse) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '  ', 'Rue X') $$,
  '23514', 'Champs obligatoires manquants : tournée, secteur, ouvrage, visibilité, nature de dégradation',
  'nouvelle fuite : les champs manquants sont nommés (référence vide = manquante)');
select throws_ok($$ insert into fuites (marche_id, reference_srm, secteur_id, ouvrage, visibilite) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '302-684-001', 'aaaaaaaa-3333-0000-0000-000000000001', 'branchement', 'visible') $$,
  '23514', 'Champs obligatoires manquants : nature de dégradation', 'nouvelle fuite : nature de dégradation obligatoire');
select lives_ok($$ insert into fuites (id, marche_id, reference_srm, secteur_id, ouvrage, visibilite, nature_degradation_id,
                                       diametre_mm, materiau, troncon_id) values
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '302-684-001',
   'aaaaaaaa-3333-0000-0000-000000000001', 'branchement', 'visible', 'cccccccc-0000-0000-0000-000000000001',
   225, 'pvc', (select id from troncons where reference = 'T1' and marche_id = 'aaaaaaaa-0000-0000-0000-000000000001')) $$,
  'nouvelle fuite complète, adresse facultative ; diamètre, matériau et tronçon enregistrés');
select throws_ok($$ insert into fuites (marche_id, reference_srm, secteur_id, ouvrage, visibilite, nature_degradation_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '1', 'aaaaaaaa-3333-0000-0000-000000000001', 'branchement', 'visible',
   'cccccccc-0000-0000-0000-00000000000b') $$,
  '23503', null, 'nature de dégradation d''un autre marché refusée');
select throws_ok($$ insert into fuites (marche_id, reference_srm, secteur_id, ouvrage, visibilite, nature_degradation_id, materiau) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '1', 'aaaaaaaa-3333-0000-0000-000000000001', 'branchement', 'visible',
   'cccccccc-0000-0000-0000-000000000001', 'cuivre') $$,
  '23514', null, 'matériau hors liste refusé');
select lives_ok($$ update fuites set adresse = 'Rue Y' where id = 'aaaaaaaa-1111-0000-0000-000000000001' $$,
  'fuite ancienne incomplète : reste modifiable');
select throws_ok($$ update fuites set visibilite = null where id = 'aaaaaaaa-1111-0000-0000-000000000002' $$,
  '23514', 'Champs obligatoires manquants : visibilité', 'un champ obligatoire rempli ne se vide pas');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000e", "role": "authenticated"}', true);
select throws_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'agent B : marché A refusé par la RLS (pas par les champs)');
reset role;
select lives_ok($$ insert into fuites (marche_id) values ('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'contexte serveur (import, données) : pas de contrôle des champs');

-- -----------------------------------------------------------------------------
-- 6. Copie d'un marché : champs obligatoires, diamètres, représentants, panier
-- -----------------------------------------------------------------------------
create temporary table t_ids (cle text primary key, id uuid);
grant select, insert on t_ids to authenticated;
update prix set anticipable = false
 where marche_id = (select id from marches where code = 'SRM-4500004453') and numero = '5';
update marches set champs_obligatoires_fuite = array['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id']
 where code = 'SRM-4500004453';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
insert into t_ids values ('copie', copier_marche((select id from marches where code = 'SRM-4500004453'), 'COPIE-S2', '9', 'Copie S2'));
reset role;
select is((select champs_obligatoires_fuite from marches where id = (select id from t_ids where cle = 'copie')),
  array['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id'], 'copie : champs obligatoires repris');
select is((select count(*)::int from representants_srm where marche_id = (select id from t_ids where cle = 'copie') and nom = 'Abdelkhalek'), 1,
  'copie : représentants repris');
select is((select count(*)::int from diametres_materiau where marche_id = (select id from t_ids where cle = 'copie')),
  (select count(*)::int from diametres_materiau d join marches m on m.id = d.marche_id where m.code = 'SRM-4500004453'),
  'copie : liste des diamètres reprise');
select results_eq($$ select numero, anticipable from prix where marche_id = (select id from t_ids where cle = 'copie')
                      and numero in ('3', '4', '5') order by numero $$,
  $$ values ('3'::text, false), ('4', true), ('5', false) $$, 'copie : panier d''anticipation repris tel quel');
select is((select count(*)::int from natures_refection where marche_id = (select id from t_ids where cle = 'copie')
            and code in ('carrelage', 'faience', 'pave_ciment')), 3, 'copie : nouvelles natures reprises');

select * from finish();
rollback;
