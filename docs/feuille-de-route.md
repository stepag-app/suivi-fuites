# Feuille de route (retouches et évolutions planifiées)

> Notée le 2026-10-04 au soir avec Issam. Complète `docs/etat-avancement.md` (fait, en attente) :
> ici, ce qui est **décidé ou demandé mais pas encore fait**, dans l'ordre prévu. Mettre à jour à
> chaque lot terminé (déplacer la ligne dans `etat-avancement.md`).

## 1. Décisions prises ce soir

| Sujet | Décision |
|---|---|
| Ce que voit chacun | Tout le monde voit toutes les fuites (détectées, en réparation, réparées). Attachements, paramètres, exports, prix et autres rubriques : **responsable et administrateur** seulement (déjà en place, garanti par les tests `05_marche_demo`). |
| Agent de détection | Signale les fuites et **modifie seulement celles qu'il a signalées**, tant qu'elles sont « détectées » (règle actuelle, confirmée). Voit aussi les fuites réparées, en lecture. |
| Équipes de réparation | Voient toutes les fuites, saisissent réparations et réfections (lot A, tablette). |
| Itinéraire | Chaque fuite a un lien « **Y aller** » qui ouvre une appli de cartes **externe** (Google Maps, Waze…) avec la fuite comme destination, sans rien demander : tablette (lot A, URI `geo:`), fiche web et rapport PDF (lot D), bulle de la carte (lot B). |
| Google Maps intégré | **Reporté** : on garde le fond OpenStreetMap / MapLibre du lot B (gratuit, sans clé, utilisable hors ligne plus tard) ; Issam décide après l'avoir vu s'il passe à Google Maps (clé API Google Cloud, facturation par carte). |
| Photos sur Cloudflare R2 | Carte bancaire acceptée, **R2 Paid actif** (2026-10-04). Compartiment et clé créés par Issam (étapes au § 3) ; développement **après la fusion des lots A et D** (même code photo). |

## 2. Lots en cours (sessions parallèles du 2026-10-04)

| Lot | Contenu | État au 2026-10-04 23 h 30 UTC |
|---|---|---|
| A. Tablette | fiche d'une fuite, réparations et réfections hors ligne, doublons, « Y aller », envoi des photos regroupé dans une seule fonction | PR #13 ouverte |
| B. Carte | page `/carte`, fond OSM minimal, couleurs par statut, filtres, lien « Y aller » dans la bulle | PR #18, fond réel à vérifier sur Vercel |
| C. Paramètres | page Marchés (copie, activation), secteurs, natures, catalogue, règles des prix | PR #14 ouverte |
| D. Rapport PDF | rapport par fuite et par liste filtrée (fusionné, PR #15) ; suite : « Y aller », lecture des photos regroupée | suite en cours |

## 3. Photos sur Cloudflare R2 (lot E, après A et D)

**À faire par Issam maintenant** (aucune valeur secrète dans le chat ni le dépôt) :
1. Cloudflare → **R2 Object Storage** → **Create bucket** : nom `suivi-fuites-photos`, emplacement
   automatique avec l'indication **Western Europe (WEUR)**, classe Standard. **Accès public : désactivé**
   (ni r2.dev ni domaine public : les photos restent privées).
2. Le compartiment → **Settings → CORS policy** : origine `https://suivi-fuites-web.vercel.app`
   (plus tard `https://fuites.stepag.ma`), méthodes `GET`, `PUT`, `HEAD`, en-tête `Content-Type`,
   durée 3600 s. Le lot E ajustera si besoin.
3. R2 → **Manage API tokens** → **Create API token** : permission **Object Read & Write**, limité au
   seul compartiment `suivi-fuites-photos`. Noter tout de suite, dans le gestionnaire de mots de passe :
   l'**Account ID**, l'**Access Key ID** et la **Secret Access Key** (affichée une seule fois).
4. GitHub → dépôt → Settings → Secrets and variables → Actions : créer `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Le lot E les fera passer à la fonction serveur
   Supabase par le workflow de déploiement ; **jamais** dans l'APK ni dans le panneau.

**Ce que fera le lot E** : fonction serveur (Supabase Edge Function) qui vérifie le compte et ses droits
sur la fuite, puis délivre des URL signées S3 (dépôt `PUT`, lecture `GET`, durée courte) ; la tablette
et le panneau compressent toujours avant envoi (1 600 px, qualité 70, déjà en place) puis envoient
directement dans R2 ; la ligne `photos` porte `stockage = 'r2'` (colonne prévue dès la migration 1) ;
les anciennes photos Supabase restent lisibles (transfert éventuel par script) ; tests des droits ;
plus tard, purge des photos de plus de 6 à 7 mois (règle de cycle de vie R2), une fois les rapports
PDF archivés.

## 4. À faire ensuite (ordre proposé)

1. **Logos** du titulaire et du maître d'ouvrage dans Paramètres > Marché (envoi d'une image, stockage
   privé), repris dans les en-têtes PDF, Word et Excel (exports, attachements, rapport par fuite).
   Après la fusion des lots C et D (mêmes fichiers).
2. **États journaliers et hebdomadaires** : écran « Rapports » où le responsable choisit ce qu'il
   exporte ou imprime (sections, colonnes, regroupements, période), aperçu avant tirage, modèles
   enregistrés par marché ; s'appuie sur le panneau d'export. **Bloqué par** le modèle exact de la SRM
   (à fournir par Issam).
3. **Suivi GPS en arrière-plan** (M4) : tracé de chaque agent, **un tracé par agent et par jour**
   (pas un point par ligne), distance réellement parcourue, notification permanente Android, fréquence
   réglable (15-20 m ou 30 s en mouvement), exclusion de l'optimisation batterie Samsung. Questions :
   heures de suivi (journée de travail seulement ?), information des agents et déclaration à la
   **CNDP** (loi 09-08 sur les données personnelles : la géolocalisation des salariés est encadrée, à
   vérifier avec un conseil).
4. **Tronçons du réseau et balayage** (migration 2) : import du réseau en tronçons (DXF issu du DWG de
   préférence ; sinon planches PDF si elles sont **vectorielles** et calées par 3 à 4 points connus) ;
   sur la tablette, l'agent de détection touche chaque tronçon parcouru (petits traits le long des
   conduites, couleur qui change à la validation) ; la zone balayée se déduit des tronçons validés ;
   un tronçon n'est payé qu'une fois (prix 1). **Bloqué par** le DWG / DXF ou 1 ou 2 planches PDF à
   examiner (à déposer hors dépôt).
5. **Contrôle croisé** : tronçon coché sans passage GPS à moins de X m (seuil à fixer) → signalé au
   responsable.
6. **Tableaux journaliers et hebdomadaires** des distances parcourues (GPS) et des linéaires balayés
   (tronçons), par agent, équipe, secteur, zone.
7. **Tableau de bord** (à concevoir avec Issam) : fuites par statut et par secteur, délais, alertes,
   avancement du balayage, quantités attachées / reste à attacher, contrôle tracking / cochage.
8. **Google Maps intégré** : décision après avoir vu la carte du lot B.
9. **Passe d'interface** (après stabilisation des fonctions) : Claude Code avec les serveurs MCP
   **21st.dev** (composants) et **Higgsfield** (visuels) et la skill « UI/UX Pro Max » (GitHub), pour
   des composants réactifs et responsives sans « AI slop ». À cadrer : choix d'un socle (Tailwind /
   shadcn ou CSS actuel), poids des pages, grands boutons et lisibilité sur la tablette, mode hors
   ligne, clés d'API et coûts de ces services.

## 5. Questions ouvertes pour Issam

- Modèle exact des états journaliers / hebdomadaires et du rapport par fuite exigé par la SRM.
- Suivi GPS : heures de suivi, information des agents, CNDP ; seuil de contrôle tronçon / tracé.
- Plan du réseau : DWG (→ DXF) ou planches PDF vectorielles, et le système de coordonnées.
- Logos : fichiers du titulaire (STEPAG) et du maître d'ouvrage (SRM), droit d'usage du logo client.
