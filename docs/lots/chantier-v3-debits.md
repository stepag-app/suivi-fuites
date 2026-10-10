# Chantier v3 : débits de nuit (S15) — contrat pour S17 (rapports) et S19 (APK)

> Fait par S15 (tâches D1 à D7 de `docs/lots/chantier-v3.md`). Migration `supabase/migrations/20261013300000_debits_nuit.sql`,
> tests `supabase/tests/database/40_s15_debits_nuit.test.sql` (91), calculs du panneau `web/src/lib/debits.ts`
> (`node scripts/verifier-debits.mjs`, mêmes jeux que les tests de la base). Règles : CPS art. II-15, II-17, II-22, II-23,
> tableau n° 1 (`references/regles-marche-4500004453.md`, R-CPS-100 à 115, 142 à 150).

## 1. Modèle

| Table / colonne | Rôle | Droits (RLS) |
|---|---|---|
| `zones.q_exige_m3h` (existant), `q_plus_bas_historique_m3h`, `q_actuel_m3h`, `balayage_acheve_le` | tableau n° 1 (SRM : 126 / 133 / 158 … 83 / 79 / 104) ; achèvement du balayage de la zone | lecture : affectés ; écriture : « paramètres / modifier » |
| `phases` (existant) | balayage, `maintien_1`, `maintien_2` : la fin de `maintien%` marque la pénalité de maintien définitive | idem |
| `marches.debits_mode_saisie` | `minimum` (défaut), `releves`, `import` : mode proposé | « paramètres / modifier » |
| `marches.debits_assiette` | `zone` (défaut : linéaire de la zone × prix) ou `marche` (τ global sur le montant total du prix) | idem |
| `marches.debits_points` | `entiers` (défaut depuis le 2026-10-10 : arrondis au point le plus proche, −3,5 → 4) ou `proportionnels` (τ sans arrondi) | idem |
| `marches.debits_plafond_pct`, `debits_seuil_arret_pct`, `debits_seuil_degradation_pct` | 25, 25, 25 par défaut | idem |
| `points_mesure` | ouvrage de comptage : `zone_id` (obligatoire), `secteur_id` (de la même zone), `code` unique par marché, `libelle`, `equipement`, `ordre`, `actif` | lecture : affectés ; création « paramètres / créer », modification « paramètres / modifier » ; jamais supprimé (désactivé) |
| `campagnes_debit` | `type` (`avant`, `apres`, `maintien`, `libre`), `zone_id` (null = toutes les zones), `date_debut`, `date_fin` (défaut : +2 jours pour avant / après, même jour sinon ; 31 nuits au plus), `mode_saisie`, `libelle`, `observation`, `pv_chemin`, `pv_signe_le`, `supprime_le` | lecture « mesures_debit / lire » ; création, modification, suppression logique « mesures_debit / valider » (bureau) |
| `mesures_nuit` | une ligne par campagne, point et nuit (index unique partiel sur les lignes non supprimées) : `nuit` (jour des relevés de 0 h à 6 h), `releves` jsonb `[{"h":"00:15","q":12.4}, …]` (triés, 00:00 à 06:00, heures distinctes, débits ≥ 0, 100 au plus) ou `minimum_m3h` seul ; `mode` et `minimum_m3h` posés par la base ; `origine` (`saisie`, `import`), `piece_jointe`, `observation`, `auteur_terrain_id`, `saisi_par`, `source_saisie`, `validee_le`, `validee_par`, `supprime_le` | lecture « lire », saisie « créer », modification « modifier » (portée vérifiée), retrait logique « supprimer » (non validée) ; validation, correction d'une mesure validée et saisie au nom d'un autre : « valider » |
| compartiment Storage `debits` (privé, 10 Mo, PDF / JPEG / PNG / WebP) | `<marché>/<campagne>/<fichier>` : PV signé, photo de l'afficheur | lecture « lire », dépôt « créer », suppression « valider » |

`id` de `mesures_nuit` peut être créé sur l'appareil (saisie hors ligne de S19). Toutes les tables sont journalisées
(`journal`), figent leur marché, n'ont aucun privilège `anon` ni `delete`.

**Validation (D6, circuit V1).** Une mesure saisie par un compte qui a « mesures_debit / valider » (responsable,
administrateur) est **validée d'emblée** ; sinon (terrain) elle est **à valider** et ne compte dans aucun calcul tant
qu'elle ne l'est pas. Validation : `valider_etapes([{"etape": "debit", "id": …}])` (même fonction que les fuites) ;
liste : vue `v_debits_a_valider` (marchés où le compte a « valider »). Après validation, l'agent ne modifie ni ne
retire plus sa mesure. Les modèles de rôles ne changent pas : le responsable a tout ; Détection et Réparation n'ont
rien par défaut et s'ouvrent dans la matrice des droits (Utilisateurs › Droits, rubrique « Débits de nuit »).

## 2. Calculs (D4)

| Objet | Contenu |
|---|---|
| `penalite_points(tau, plafond = 25, mode = 'proportionnels')` | `null` si τ inconnu, 0 si τ ≥ 0, sinon `least(plafond, −τ)` (entiers : `round(−τ)`, migration `20261014500000`) |
| vue `v_debits_nuits` | par campagne, zone et nuit (mesures **validées**) : `q_zone_m3h`, `approchee`, `complete`, `nb_points` (attendus : points actifs de la zone et points mesurés cette nuit), `nb_points_mesures`, `nb_points_releves`, `nb_instants`, `nb_valides`, `nb_a_valider`, `campagne_type`, `zone_numero`, `zone_libelle` |
| vue `v_debits_campagnes` | par campagne et zone : `q_m3h` = minimum des nuits **complètes** (Qi, Qf : minimum des trois minimums ; contrôle : minimum de la nuit), `nuit_minimum`, `approchee` (la nuit retenue l'est), `nb_nuits`, `nb_nuits_completes`, `nb_a_valider` |
| `debits_resultats(p_marche)` | une ligne par zone active (`niveau = 'zone'`) puis le marché (`'marche'`) ; colonnes ci-dessous |

Débit d'une zone pour une nuit (R-CPS-103) : si tous les points attendus ont des relevés détaillés et qu'il existe au
moins un instant relevé sur tous, **minimum, sur ces instants, de la somme des points** ; sinon **somme des minimums**
des points, marquée `approchee` dès qu'il y a plus d'un point. Une nuit où un point manque est `complete = false` et
n'entre pas dans le résultat de la campagne.

Colonnes de `debits_resultats` : `niveau, zone_id, zone_numero, zone_libelle, lineaire_m, q_exige_m3h,
q_plus_bas_historique_m3h, q_actuel_m3h, balayage_acheve_le, qi_m3h, qi_approche, qi_nuits, qf_m3h, qf_approche, qf_nuits,
delta_q_m3h, tau1_pct, points_balayage, montant_balayage, penalite_balayage, alerte_arret, nb_controles, dernier_controle,
dernier_controle_m3h, ecart_controles_max_j, q_maintien_moyen_m3h, tau2_pct, points_maintien, montant_maintien,
penalite_maintien, degradation_m3h, degradation_pct, alerte_degradation, assiette, mode_points, fin_maintien`.

- Qi : dernière campagne `avant` mesurée de la zone (ou de toutes les zones) ; Qf : dernière `apres` ; ΔQ = Qi − Qf.
- τ1 = 100 × (Q exigé − Qf) / Q exigé (2 décimales) ; points = `penalite_points(τ1)` ; montant = linéaire de la zone ×
  PU du prix de famille `balayage` ; pénalité = montant × points / 100 (assiette `zone`). `alerte_arret` : τ1 < −seuil.
- Maintien : contrôles = campagnes `maintien` mesurées, moyenne de leurs minimums ; τ2 = 100 × (Qf − moyenne) / Qf ;
  même pénalité sur le prix de famille `maintien`. `ecart_controles_max_j` : plus grand intervalle entre deux contrôles
  (alerte au-delà de 7 jours à l'écran).
- Dégradation des gains (R-CPS-107, 111) : `degradation_m3h` = moyenne − Qf ; `degradation_pct` = 100 × (moyenne − Qf) /
  ΔQ (si ΔQ > 0) ; `alerte_degradation` au-delà du seuil.
- Ligne `marche` : sommes des zones (Qi, Qf, moyenne seulement si toutes les zones en ont) ; τ global ; assiette
  `zone` : pénalités = somme des zones ; assiette `marche` : montant = quantité du marché × PU, pénalité au τ global,
  et rien par zone.
- Montants au **prix du bordereau, hors majoration**, `null` sans « quantités / lire » (RLS de `prix`) ; les τ restent
  visibles. Sans « mesures_debit / lire » : aucune ligne.

`enregistrer_mesures_nuit(p_campagne, p_mesures, p_origine = 'saisie', p_source = 'web')` : saisie ou import groupé,
`p_mesures = [{point_id, nuit, releves | minimum_m3h, observation?, piece_jointe?, auteur_terrain_id?}]`, 2 000 au plus ;
mesure existante (même campagne, point, nuit) remplacée, sinon ajoutée ; droits de l'appelant ; renvoie
`{"ajoutees": n, "modifiees": n}`.

## 3. Pour S17 : rubrique « Débits de nuit » des rapports (J1)

- **Débits de la période** : `v_debits_nuits` filtrée sur `marche_id` et `nuit` entre le début et la fin de la période
  (filtre zone : `zone_id`) ; colonnes utiles : `nuit`, `campagne_type` (libellés `TYPES_CAMPAGNE` de
  `web/src/lib/debits.ts`), `zone_numero`, `zone_libelle`, `q_zone_m3h` (préfixe « ≈ » à l'écran, « ~ » en PDF si
  `approchee`), `complete`, `nb_points_mesures` / `nb_points`.
- **Situation des performances** : `debits_resultats(p_marche)` (indépendante de la période) : Q exigé, Qi, Qf, ΔQ, τ1,
  τ2, points, pénalités (si droit « quantités / lire »), alertes `alerte_arret` et `alerte_degradation`.
- « Validées seulement » : la base ne compte déjà que les mesures validées ; `nb_a_valider` donne le reste.
- Polices standard du PDF (jsPDF, WinAnsi) : ni « ≈ », ni « τ », ni espaces fines (`toLocaleString('fr-FR')` en met) ;
  `web/src/app/(app)/debits/documents.ts` écrit « ~ », « Tau 1 » et remplace les espaces fines.
- Droit de la rubrique : « mesures_debit / lire ».

## 4. Pour S19 : écran « Mesures de nuit » de l'APK (D8)

- Montrer l'écran seulement si `mesures_debit / creer` (ou `lire` pour consulter) sur le marché.
- Lire : `campagnes_debit` (non supprimées, nuit du jour comprise entre `date_debut` et `date_fin`), `points_mesure`
  actifs (de la zone de la campagne si `zone_id`), ses propres `mesures_nuit`.
- Écrire : `insert` dans `mesures_nuit` avec un `id` créé sur la tablette (file hors ligne, renvoi sans doublon : une
  seconde insertion du même `id` échoue en clé primaire, la même campagne / point / nuit en `23505`), `marche_id`,
  `campagne_id`, `point_id`, `nuit`, `minimum_m3h` **ou** `releves`, `source_saisie = 'tablette'`, `observation`,
  `piece_jointe` (photo de l'afficheur déposée dans `debits/<marché>/<campagne>/<fichier>`). Correction avant
  validation : `update` des mêmes colonnes. La saisie arrive « à valider ».
- Refus à traduire : `42501` (pas le droit, campagne invisible, mesure validée), `23514` (nuit hors campagne, point
  hors zone, relevé hors 0 h – 6 h, débit négatif, deux relevés à la même heure), `22023` (heure illisible), `23502`
  (ni minimum ni relevés), `23505` (déjà saisie pour ce point et cette nuit).
- Libellés : `TYPES_CAMPAGNE`, `MODES_SAISIE`, `HEURES_NUIT` de `web/src/lib/debits.ts` à reprendre en FR / AR.

## 5. Panneau (D7)

- `/debits` (droit « mesures_debit / lire ») : onglets **Synthèse** (bandeau τ1, pénalités, alertes, dernier contrôle ;
  tableau par zone et marché ; courbe des nuits complètes face au Q exigé et au Q à maintenir), **Campagnes et saisie**
  (liste, nouvelle campagne, saisie point × nuit au minimum, relevés de 0 h à 6 h avec collage d'une colonne, import CSV ou
  Excel, aperçu du débit des zones, PV signé joint, procès-verbal PDF ou Excel, suppression), **À valider** (droit
  « valider »). Export Excel de la synthèse. Rappel sur `/a-valider`.
- Paramètres › **Débits de nuit** : points de mesure, tableau n° 1 et achèvement du balayage par zone, réglages,
  dates des phases.
- Tableau de bord : widget « Débits de nuit » (dernière valeur de chaque zone face au Q exigé, τ1, τ2, alertes).

## 6. Points à confirmer avec la SRM

1. Assiette (zone ou marché entier) des pénalités (R-CPS-150) : défaut « zone ». Arrondi des points **tranché par Issam le
   2026-10-10** : points entiers, arrondi normal au plus proche (mode « entiers », défaut).
2. Lecture « marché entier » : τ global calculé sur les sommes des zones (hypothèse de S15).
3. Dégradation des gains : seuil de 25 % rapporté au gain ΔQ de la zone (et non au Qf) ; le CPS parle « par secteur »,
   l'application calcule par zone (les points de mesure d'un secteur restent possibles).
4. Liste des ouvrages de comptage (points de mesure) par zone et par secteur, et format des fichiers de télé-relève.
5. Pénalité de maintien affichée « provisoire » jusqu'à la fin de la phase `maintien_2`.
