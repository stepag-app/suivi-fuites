-- =============================================================================
-- Audit S20 (fiabilité) : envois d'e-mail restés « en cours ».
-- Un envoi réservé par reserver_envoi_email et jamais clos par terminer_envoi_email (fonction Vercel interrompue
-- entre la réservation et la clôture : délai dépassé, coupure) restait « en cours » dans le journal et comptait pour
-- toujours dans les limites du jour (marché et ensemble des marchés). reserver_envoi_email clôt désormais en « échec »
-- les envois en cours depuis plus de 15 minutes avant de compter ceux du jour. terminer_envoi_email ne change pas.
-- =============================================================================

create or replace function public.reserver_envoi_email(
  p_marche uuid, p_document text, p_reference text, p_objet text, p_destinataires text[],
  p_piece_nom text, p_piece_octets integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _jour date := private.jour_maroc(now());
  _limite integer;
  _du_marche integer;
  _total integer;
  _adresses text[];
  _id uuid;
begin
  if auth.uid() is null or not public.peut_envoyer_email(p_marche) then
    raise exception 'Envoi par e-mail réservé au responsable du marché et à l''administrateur'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(array_agg(distinct lower(btrim(a))), '{}') into _adresses
    from unnest(coalesce(p_destinataires, '{}')) a
   where btrim(a) <> '';
  if cardinality(_adresses) not between 1 and 10 then
    raise exception 'De 1 à 10 destinataires' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from unnest(_adresses) a
              where length(a) > 254 or a !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$') then
    raise exception 'Adresse e-mail invalide' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(btrim(p_objet), '') = '' or length(p_objet) > 200 then
    raise exception 'Objet obligatoire (200 caractères au plus)' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(p_piece_octets, 0) not between 1 and 4194304 then
    raise exception 'Pièce jointe : 4 Mo au plus' using errcode = 'invalid_parameter_value';
  end if;

  -- Un envoi à la fois pour le décompte du jour (deux clics simultanés ne dépassent pas la limite).
  perform pg_advisory_xact_lock(hashtext('envois_email'));

  -- Envoi jamais clos par le serveur (interrompu) : en échec, hors du décompte du jour.
  update public.envois_email e
     set statut = 'echec',
         erreur = 'Envoi interrompu : le serveur n''a pas confirmé l''envoi dans les 15 minutes',
         termine_le = now()
   where e.statut = 'en_cours' and e.cree_le < now() - interval '15 minutes';

  select m.emails_par_jour into _limite from public.marches m where m.id = p_marche;
  select count(*) filter (where e.marche_id = p_marche), count(*)
    into _du_marche, _total
    from public.envois_email e
   where e.statut <> 'echec'
     and e.cree_le >= private.instant_maroc(_jour::timestamp)
     and e.cree_le < private.instant_maroc((_jour + 1)::timestamp);
  if _du_marche >= _limite then
    raise exception 'Limite du jour atteinte pour ce marché (% envois)', _limite using errcode = 'check_violation';
  end if;
  if _total >= private.limite_emails_jour_total() then
    raise exception 'Limite du jour atteinte pour l''ensemble des marchés (% envois)', private.limite_emails_jour_total()
      using errcode = 'check_violation';
  end if;

  insert into public.envois_email (marche_id, envoye_par, document, reference, objet, destinataires, piece_nom, piece_octets)
  values (p_marche, auth.uid(), p_document, nullif(btrim(p_reference), ''), btrim(p_objet), _adresses,
          btrim(p_piece_nom), p_piece_octets)
  returning id into _id;
  return _id;
end
$$;

comment on function public.reserver_envoi_email(uuid, text, text, text, text[], text, integer) is
  'Réserve un envoi d''e-mail (droit du responsable ou de l''administrateur, marché actif, limites du jour) ; les envois '
  'restés en cours depuis plus de 15 minutes passent d''abord en échec (audit S20).';
