-- Second passage permis, avec motif (décision d'Issam du 2026-10-09, revient sur 20261012100000) : un agent peut
-- rebalayer un tronçon déjà balayé (fuite suspectée, contrôle). Le panneau l'avertit et lui fait choisir un motif ;
-- le second passage reste dans l'historique, coloré et compté à part (premier_passage faux), jamais payé deux fois.
--
-- Le motif n'est pas exigé par la base : deux agents hors ligne peuvent balayer le même tronçon sans le savoir, et
-- la file d'attente ne doit pas se bloquer ; ce second passage arrive alors sans motif.

drop trigger a0_balayage_unique on public.balayages;
drop function private.balayage_unique();
drop function private.troncon_deja_balaye(uuid, uuid);

alter table public.balayages
  add column motif_repasse text check (motif_repasse in ('fuite_suspectee', 'controle', 'autre'));

comment on column public.balayages.motif_repasse is
  'Motif d''un second passage choisi par l''agent (fuite_suspectee, controle, autre) ; nul pour un premier passage ou un second passage non signalé (hors ligne).';
