-- =============================================================================
-- Chantier v2, S6 (R3) : compte de l'administrateur « issam » nommé BOUSALAM Issam (règle d'Issam).
-- Le déclencheur b_normaliser_profil recompose nom_complet en « BOUSALAM Issam ». Un nom ou un prénom
-- déjà saisi par l'écran (Utilisateurs > Comptes) n'est pas écrasé. Données seulement, aucun objet créé.
-- =============================================================================
update public.profils
   set nom = 'BOUSALAM', prenom = 'Issam'
 where identifiant = 'issam'
   and nom is null
   and prenom is null;
