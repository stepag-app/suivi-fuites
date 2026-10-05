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

Session 5 (2026-10-05), lots menés en parallèle, PR **en brouillon** (CI verte) :

| Lot | Contenu | PR |
|---|---|---|
| F. Logos | logos du titulaire et du maître d'ouvrage dans tous les en-têtes (PDF, Word, Excel) | #22 |
| G. Impression de la carte | PDF A4 / A3 : carte 200 dpi, légende, échelle, nord, coordonnées WGS84, liste | #25 |
| H. Tablette | style Fiori de l'APK, photos depuis la fiche, modification d'une réparation | #24 |
| I. Tableau de bord v1 | indicateurs, statuts, 12 semaines, secteurs / zones, attachements | #23 |
| J. Marché désactivé | lecture seule en base (sauf administrateur) | #21 |

Lots F à J fusionnés le 2026-10-05 (session 6). Session 6, lots en parallèle, PR **en brouillon** :

| Lot | Contenu | PR |
|---|---|---|
| K. Test de restauration | restauration hebdomadaire de la dernière sauvegarde dans une base vierge de la CI, lignes comparées | #27 |
| L. Filtres dans l'adresse | filtres de `/fuites` dans l'URL (dont la période), chiffres du tableau de bord cliquables | #28 |
| M. Fiche hors ligne | fiche déjà vue consultable sans réseau (données et photos en cache, lecture seule) | #29 |
| N. Photos sur R2 | **non lancé** : secrets R2 absents de GitHub | — |

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

1. ~~**Logos**~~ (lot F, PR #22) du titulaire et du maître d'ouvrage dans Paramètres > Marché (envoi d'une image, stockage
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
7. **Tableau de bord** : version 1 faite (lot I, PR #23) ; restent l'avancement du balayage et le contrôle tracé /
   cochage (après la migration 2 et le suivi GPS), et les réponses d'Issam (voir `etat-avancement.md` § 2). Prévu : fuites par statut et par secteur, délais, alertes,
   avancement du balayage, quantités attachées / reste à attacher, contrôle tracking / cochage.
8. **Google Maps intégré** : décision après avoir vu la carte du lot B.
9. **Passe d'interface** : **faite pour le panneau web** (2026-10-05, PR #19) : style SAP Fiori en CSS
   maison, widgets d'indicateurs, fiche d'une fuite au format de la maquette. APK : fait (lot H, PR #24).
10. **Sauvegarde complète et restaurable** (demande d'Issam du 2026-10-05) :
    - ~~Activer la sauvegarde nocturne~~ : active depuis le 2026-10-05. ~~Test de restauration~~ : lot K (PR #27).
    - **D'abord** : corriger les trois défauts de l'export relevés par le lot K (tables `storage` vectorielles
      non inscriptibles, `donnees_auth.sql` en doublon, déclencheur sur `auth.users` et règles de
      `storage.objects` absents ; détail dans `supabase/README.md` § Sauvegarde et restauration).
    - **Ensuite** : envoyer aussi la sauvegarde **hors de GitHub** (une boîte Gmail dédiée, par exemple),
      sous un format restaurable à tout moment (SQL ou archive), **photos comprises**.
    - Contraintes à trancher avec Issam (**stockage et destination décidés plus tard**) :
      - une pièce jointe Gmail est limitée à **25 Mo** : la base (SQL compressé et chiffré, quelques Mo)
        y tient ; les photos (2 à 7 Go sur 12 mois) **non** : il faudra un lien vers une archive
        déposée ailleurs (R2, Google Drive du compte `stepag.app`) ou des envois incrémentaux
        (seulement les photos du jour) ;
      - envoi d'e-mail depuis GitHub Actions : compte Gmail avec mot de passe d'application ou
        API Gmail (secret GitHub) ; le fichier reste **chiffré** (la phrase secrète ne part jamais
        avec le fichier) ;
      - **procédure de restauration écrite et testée** (base + photos) sur une pile Supabase locale.

## 5. Questions ouvertes pour Issam

- Modèle exact des états journaliers / hebdomadaires et du rapport par fuite exigé par la SRM.
- Suivi GPS : heures de suivi, information des agents, CNDP ; seuil de contrôle tronçon / tracé.
- Plan du réseau : DWG (→ DXF) ou planches PDF vectorielles, et le système de coordonnées.
- Logos : fichiers du titulaire (STEPAG) et du maître d'ouvrage (SRM), droit d'usage du logo client.
- Sauvegarde complète : destination (Gmail dédié, Drive, R2), fréquence (nuit ? semaine pour les photos ?),
  durée de conservation, qui détient la phrase secrète.
