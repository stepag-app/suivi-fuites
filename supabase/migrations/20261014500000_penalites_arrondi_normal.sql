-- =============================================================================
-- Débits de nuit : points de pénalité arrondis au plus proche (R-CPS-150, décision d'Issam du 2026-10-10).
--
-- Le mode « entiers » gardait les points complets par troncature (τ = −3,6 % → 3 points) ; il arrondit désormais
-- au point le plus proche, demi-point vers le haut (τ = −3,4 % → 3 ; −3,5 % → 4 ; −7,14 % → 7). Il devient le
-- réglage par défaut et s'applique aux marchés existants, qui étaient tous sur « proportionnels » (défaut de S15).
-- « Proportionnels » reste possible, réglable par marché (Paramètres › Débits de nuit).
-- =============================================================================

create or replace function public.penalite_points(p_tau numeric, p_plafond numeric default 25, p_mode text default 'proportionnels')
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tau is null then null
    when p_tau >= 0 then 0::numeric
    else least(coalesce(p_plafond, 25), case when p_mode = 'entiers' then round(-p_tau) else -p_tau end)
  end
$$;

comment on function public.penalite_points(numeric, numeric, text) is
  'Points de pénalité (R-CPS-146, 149) : 0 si τ ≥ 0, sinon −τ plafonné ; mode « entiers » : arrondi au point le plus proche (−3,5 → 4)';

alter table public.marches alter column debits_points set default 'entiers';

comment on column public.marches.debits_points is
  'Points de pénalité (D5) : entiers (arrondis au plus proche, défaut, décision du 2026-10-10) ou proportionnels (τ sans arrondi).';

update public.marches set debits_points = 'entiers' where debits_points = 'proportionnels';
