-- =============================================================================
-- Lot C : création d'un marché par copie (administrateur seul), paramètres
-- édités à l'écran (zones, secteurs, natures, articles suggérés pour les pièces, règles
-- de proposition des articles) par le responsable, refus pour les agents, isolation, journal.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(36);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'issam@test.local',   '{"identifiant": "issam", "nom_complet": "Issam"}'),
  ('00000000-0000-0000-0000-00000000000b', 'agent.a@test.local', '{"identifiant": "agent.a", "nom_complet": "Agent A"}'),
  ('00000000-0000-0000-0000-00000000000d', 'resp.a@test.local',  '{"identifiant": "resp.a", "nom_complet": "Responsable A"}');
update profils set est_admin = true where identifiant = 'issam';
select appliquer_modele_role('00000000-0000-0000-0000-00000000000b', (select id from marches where code = 'SRM-4500004453'), 'detection');
select appliquer_modele_role('00000000-0000-0000-0000-00000000000d', (select id from marches where code = 'SRM-4500004453'), 'responsable');

create temporary table t_ids (cle text primary key, id uuid);
grant select, insert on t_ids to authenticated;
insert into t_ids values ('srm', (select id from marches where code = 'SRM-4500004453'));

-- Articles Dolibarr (communs à tous les marchés) et deux règles de suggestion du marché SRM
insert into produits_dolibarr (dolibarr_id, ref, designation, unite, famille, utilisable) values
  (9601, 'ESS09601', 'COLLIER ESSAI 63 X 20', 'U', 'ESS', true),
  (9602, 'ESS09602', 'MANCHON ESSAI 25', 'U', 'ESS', true);
insert into suggestions_articles (marche_id, prix_id, produit_id, famille)
select (select id from t_ids where cle = 'srm'), p.id, x.produit, x.famille
  from prix p, (values (9601, null::text), (null::integer, 'ESS')) x (produit, famille)
 where p.marche_id = (select id from t_ids where cle = 'srm') and p.numero = '8';

-- -----------------------------------------------------------------------------
-- 1. Fonction réservée à l'administrateur
-- -----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.copier_marche(uuid, text, text, text, text, text)', 'execute'),
  'anon : aucun droit sur copier_marche');
select ok(not has_function_privilege('authenticated', 'private.copier_parametres_marche(uuid, uuid)', 'execute'),
  'authenticated : la logique de copie (schéma private) n''est pas appelable');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select throws_ok($$ select copier_marche((select id from t_ids where cle = 'srm'), 'PIRATE', '1', 'Marché pirate') $$,
  '42501', null, 'responsable : ne crée pas de marché par copie');
select throws_ok($$ insert into marches (code, numero, intitule, client) values ('PIRATE', '1', 'Marché pirate', 'X') $$,
  '42501', null, 'responsable : ne crée pas de marché vide');
select throws_ok($$ update marches set actif = false where id = (select id from t_ids where cle = 'srm') $$,
  '42501', null, 'responsable : n''active ni ne désactive un marché');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ select copier_marche((select id from t_ids where cle = 'srm'), 'PIRATE', '1', 'Marché pirate') $$,
  '42501', null, 'agent de détection : ne crée pas de marché');
reset role;

-- -----------------------------------------------------------------------------
-- 2. Copie par l'administrateur
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select lives_ok($$ insert into t_ids values ('copie',
  copier_marche((select id from t_ids where cle = 'srm'), ' NOUVEAU-2027 ', '4500009999', 'Détection et réparation de fuites 2027')) $$,
  'admin : marché créé par copie du marché SRM');
select throws_ok($$ select copier_marche((select id from t_ids where cle = 'srm'), 'NOUVEAU-2027', '1', 'Doublon') $$,
  '23505', null, 'admin : code de marché unique');
select throws_ok($$ select copier_marche((select id from t_ids where cle = 'srm'), '  ', '1', 'Sans code') $$,
  '23514', null, 'admin : code obligatoire');
select throws_ok($$ select copier_marche(gen_random_uuid(), 'X-1', '1', 'Source inconnue') $$,
  'P0002', null, 'admin : source introuvable');
select lives_ok($$ insert into marches (code, numero, intitule, client) values ('VIDE-1', '1', 'Marché vide', 'Client') $$,
  'admin : crée un marché vide');
select lives_ok($$ update marches set actif = false where code = 'DEMO' $$, 'admin : désactive le marché DEMO');
reset role;

select results_eq($$ select code, numero, client, ville, actif from marches where id = (select id from t_ids where cle = 'copie') $$,
  $$ select 'NOUVEAU-2027'::text, '4500009999'::text, client, ville, true from marches where code = 'SRM-4500004453' $$,
  'fiche : code nettoyé, client et ville repris de la source, actif');
select results_eq($$ select client_sigle, titulaire_nom, masque_reference, libelle_reference, jalons_client,
                            taux_majoration, delai_alerte_reparation_h, devise
                       from marches where id = (select id from t_ids where cle = 'copie') $$,
  $$ select client_sigle, titulaire_nom, masque_reference, libelle_reference, jalons_client,
            taux_majoration, delai_alerte_reparation_h, devise
       from marches where code = 'SRM-4500004453' $$,
  'fiche : maître d''ouvrage, titulaire, libellés, taux et alertes copiés');
select results_eq($$ select date_commencement, date_notification, os_commencement_id, montant_ttc
                       from marches where id = (select id from t_ids where cle = 'copie') $$,
  $$ values (null::date, null::date, null::uuid, null::numeric) $$,
  'fiche : dates, OS de commencement et montant non copiés');
select is((select actif from marches where code = 'DEMO'), false, 'marché DEMO désactivé');

select results_eq($$ select (select count(*)::int from zones z where z.marche_id = t.id),
                            (select count(*)::int from secteurs s where s.marche_id = t.id),
                            (select count(*)::int from equipes e where e.marche_id = t.id),
                            (select count(*)::int from natures_refection n where n.marche_id = t.id),
                            (select count(*)::int from motifs m where m.marche_id = t.id),
                            (select count(*)::int from suggestions_articles c where c.marche_id = t.id)
                       from t_ids t where t.cle = 'copie' $$,
  $$ select (select count(*)::int from zones z where z.marche_id = t.id),
            (select count(*)::int from secteurs s where s.marche_id = t.id),
            (select count(*)::int from equipes e where e.marche_id = t.id),
            (select count(*)::int from natures_refection n where n.marche_id = t.id),
            (select count(*)::int from motifs m where m.marche_id = t.id),
            (select count(*)::int from suggestions_articles c where c.marche_id = t.id)
       from t_ids t where t.cle = 'srm' $$,
  'référentiels copiés (zones, secteurs, équipes, natures, motifs, articles suggérés)');
select results_eq($$ select s.produit_id, s.famille, p.numero from suggestions_articles s join prix p on p.id = s.prix_id
                      where s.marche_id = (select id from t_ids where cle = 'copie') and p.marche_id = s.marche_id
                      order by s.produit_id nulls last $$,
  $$ values (9601, null::text, '8'::text), (null, 'ESS', '8') $$,
  'articles suggérés : règles copiées vers l''article du bordereau copié');
select set_eq($$ select numero, designation, unite, quantite_marche, pu_ht, famille::text, materiaux,
                        diametre_min_mm, diametre_max_mm, hors_bordereau
                   from prix where marche_id = (select id from t_ids where cle = 'copie') $$,
  $$ select numero, designation, unite, quantite_marche, pu_ht, famille::text, materiaux,
            diametre_min_mm, diametre_max_mm, hors_bordereau
       from prix where marche_id = (select id from t_ids where cle = 'srm') $$,
  'bordereau copié avec ses règles de proposition');
select is((select count(*)::int from prix_versions v join prix p on p.id = v.prix_id
            where p.marche_id = (select id from t_ids where cle = 'copie') and v.version = 1 and v.avenant_id is null),
  (select count(*)::int from prix where marche_id = (select id from t_ids where cle = 'copie')),
  'bordereau : version 1 de chaque article, sans avenant');
select is((select count(*)::int from natures_refection n join prix p on p.id = n.prix_id
            where n.marche_id = (select id from t_ids where cle = 'copie') and p.marche_id = n.marche_id),
  (select count(*)::int from natures_refection where marche_id = (select id from t_ids where cle = 'srm') and prix_id is not null),
  'natures : article lié dans le nouveau marché');
select is((select count(*)::int from secteurs s join zones z on z.id = s.zone_id
            where s.marche_id = (select id from t_ids where cle = 'copie') and z.marche_id = s.marche_id
              and s.statut_balayage = 'a_balayer'),
  (select count(*)::int from secteurs where marche_id = (select id from t_ids where cle = 'srm')),
  'secteurs : rattachés aux zones copiées, à balayer');
select set_eq($$ select nom from modeles_export where marche_id = (select id from t_ids where cle = 'copie') $$,
  $$ select nom from modeles_export where marche_id = (select id from t_ids where cle = 'srm') $$,
  'modèles d''export copiés (sans doublon des modèles par défaut)');
select results_eq($$ select periodicite, titre, mentions_obligatoires, visas from parametres_attachement
                      where marche_id = (select id from t_ids where cle = 'copie') $$,
  $$ select periodicite, titre, mentions_obligatoires, visas from parametres_attachement
      where marche_id = (select id from t_ids where cle = 'srm') $$,
  'règles d''attachement copiées');
select results_eq($$ select (select count(*)::int from fuites f where f.marche_id = t.id),
                            (select count(*)::int from attachements a where a.marche_id = t.id),
                            (select count(*)::int from ordres_service o where o.marche_id = t.id),
                            (select count(*)::int from ouvriers o where o.marche_id = t.id)
                       from t_ids t where t.cle = 'copie' $$,
  $$ values (0, 0, 0, 0) $$,
  'ni fuites, ni lots, ni ordres de service, ni ouvriers');
select ok((select count(*) from journal where marche_id = (select id from t_ids where cle = 'copie')
            and utilisateur_id = '00000000-0000-0000-0000-00000000000a' and table_nom = 'suggestions_articles') = 2,
  'journal : chaque règle copiée tracée au nom de l''administrateur');

-- -----------------------------------------------------------------------------
-- 3. Responsable : paramètres de son marché, rien du nouveau marché
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);
select results_eq($$ select (select count(*)::int from marches where id = (select id from t_ids where cle = 'copie')),
                            (select count(*)::int from zones where marche_id = (select id from t_ids where cle = 'copie')) $$,
  $$ values (0, 0) $$,
  'responsable SRM : ne voit pas le nouveau marché');
select lives_ok($$
  insert into zones (marche_id, numero, code, libelle, lineaire_m) values ((select id from t_ids where cle = 'srm'), 99, 'Z99', 'Zone essai', 1200);
  insert into secteurs (marche_id, zone_id, code, libelle, ordre, lineaire_m)
  select marche_id, id, 'Z99-S1', 'Secteur essai', 1, 400 from zones where code = 'Z99' and marche_id = (select id from t_ids where cle = 'srm');
  update secteurs set libelle = 'Secteur essai (renommé)', actif = false
   where code = 'Z99-S1' and marche_id = (select id from t_ids where cle = 'srm');
$$, 'responsable : crée une zone et un secteur, renomme et désactive le secteur');
select lives_ok($$
  update natures_refection set libelle_ar = 'تجربة', necessite_refection = false, ordre = 50
   where marche_id = (select id from t_ids where cle = 'srm') and code = (select min(code) from natures_refection
                       where marche_id = (select id from t_ids where cle = 'srm'));
  insert into suggestions_articles (marche_id, prix_id, produit_id)
  select marche_id, id, 9602 from prix where marche_id = (select id from t_ids where cle = 'srm') and numero = '8';
  update suggestions_articles set prix_id = (select id from prix where marche_id = (select id from t_ids where cle = 'srm') and numero = '9')
   where marche_id = (select id from t_ids where cle = 'srm') and produit_id = 9602;
$$, 'responsable : modifie une nature, ajoute et modifie une règle d''article suggéré');
select lives_ok($$ update prix set materiaux = array['polyethylene', 'ppr'], diametre_max_mm = 50
                    where marche_id = (select id from t_ids where cle = 'srm') and numero = '6' $$,
  'responsable : modifie les règles de proposition d''un article du bordereau');
select throws_ok($$ update prix set pu_ht = pu_ht + 1 where marche_id = (select id from t_ids where cle = 'srm') and numero = '6' $$,
  '42501', null, 'responsable : le prix unitaire passe toujours par une nouvelle version');
reset role;

select is((select count(*)::int from prix_versions v join prix p on p.id = v.prix_id
            where p.marche_id = (select id from t_ids where cle = 'srm') and p.numero = '6'), 1,
  'règles de proposition modifiées sans nouvelle version');
select ok(exists (select 1 from journal j join secteurs s on s.id::text = j.ligne_id
                   where s.code = 'Z99-S1' and j.operation = 'modification'
                     and j.utilisateur_id = '00000000-0000-0000-0000-00000000000d'
                     and j.changements ? 'actif'),
  'journal : désactivation du secteur tracée au nom du responsable');

-- -----------------------------------------------------------------------------
-- 4. Agent de détection : lecture seule des paramètres
-- -----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);
select throws_ok($$ insert into zones (marche_id, numero, code, libelle) values ((select id from t_ids where cle = 'srm'), 98, 'Z98', 'Pirate') $$,
  '42501', null, 'détection : ne crée pas de zone');
select lives_ok($$ update suggestions_articles set famille = 'PIR' where marche_id = (select id from t_ids where cle = 'srm') and famille = 'ESS' $$,
  'détection : modification des articles suggérés sans effet (aucune ligne en écriture)');
reset role;
select is((select count(*)::int from suggestions_articles where famille = 'PIR'), 0, 'détection : articles suggérés inchangés');

select * from finish();
rollback;
