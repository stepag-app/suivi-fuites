-- Réconciliation des lots Q (verrous de l'administrateur) et P1 (nomenclature Dolibarr) :
-- les deux ont redéfini public.copier_marche. Cette version garde le contrôle du verrou
-- « Marchés : créer un marché par copie » (lot Q) et la reprise des liens Dolibarr du
-- catalogue (lot P1). create or replace : privilèges d'exécution inchangés.

create or replace function public.copier_marche(
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
  perform private.controler_verrou_admin('marches', 'copier');
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

  -- Identifiants des copies : md5(nouveau marché || ':' || identifiant source) (copier_parametres_marche).
  -- Une pièce dont le libellé n'a pas pu suivre Dolibarr (conflit à l'import) est copiée sans lien.
  update public.catalogue_pieces c
     set produit_dolibarr_id = s.produit_dolibarr_id,
         hors_nomenclature = s.hors_nomenclature,
         designation_initiale = s.designation_initiale
    from public.catalogue_pieces s
    left join public.produits_dolibarr d on d.dolibarr_id = s.produit_dolibarr_id
   where s.marche_id = p_source
     and c.marche_id = _cible
     and c.id = md5(_cible || ':' || s.id)::uuid
     and (s.hors_nomenclature or s.designation = d.designation);
  return _cible;
end
$$;

