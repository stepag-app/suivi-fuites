-- État du marché avant ou après un import (lecture seule). Variables psql : marche, comptes (liste séparée par des virgules).
\set ON_ERROR_STOP 1
begin read only;
\echo 'Marché :'
select code, actif from public.marches where code = :'marche';
\echo 'Fuites du marché (supprimées comprises) par origine de saisie :'
select f.source_saisie, count(*), min(f.numero), max(f.numero)
  from public.fuites f join public.marches m on m.id = f.marche_id
 where m.code = :'marche' group by 1 order by 1;
\echo 'Réparations, réfections, photos, balayages :'
select (select count(*) from public.reparations r join public.marches m on m.id = r.marche_id where m.code = :'marche') as reparations,
       (select count(*) from public.refections r join public.marches m on m.id = r.marche_id where m.code = :'marche') as refections,
       (select count(*) from public.photos p join public.marches m on m.id = p.marche_id where m.code = :'marche') as photos,
       (select count(*) from public.balayages b join public.marches m on m.id = b.marche_id where m.code = :'marche') as balayages;
\echo 'Compteur des fuites (dernier numéro attribué) :'
select c.valeur from private.compteurs c join public.marches m on m.id = c.marche_id where m.code = :'marche' and c.cle = 'fuite';
\echo 'Comptes :'
select p.identifiant, p.nom_complet, p.actif, private.est_affecte(p.id, m.id) as affecte_au_marche, a.roles
  from public.profils p
  cross join public.marches m
  left join public.affectations a on a.profil_id = p.id and a.marche_id = m.id
 where m.code = :'marche' and p.identifiant = any (string_to_array(:'comptes', ','));
rollback;
