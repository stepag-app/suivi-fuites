# Interface « Studio Admin » (shadcn/ui) du panneau web

> **Adoptée par Issam le 2026-10-06** et fusionnée dans `main` avec les lots Q (droits), R (contrôles à l'attachement),
> S (réseau, balayage) et T (articles Dolibarr). Interface du modèle
> [next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) (MIT, « Studio Admin »).
> Les données, la base Supabase, les droits (RLS), les exports et le mode hors ligne ne changent pas : seule l'interface.

## Lancer le panneau en local

```bash
cd web && npm install && npm run dev
```

- Avec `web/.env.local` (mêmes variables que `main`) : vraie base Supabase, vraie connexion (identifiant et mot de passe).
- **Mode démonstration**, sans compte ni réseau : `NEXT_PUBLIC_MODE_DEMO=1 npm run dev`, puis n'importe quel
  identifiant et mot de passe. Jeu de données fictif en mémoire (marché SRM-4500004453 avec 52 fuites, lots
  d'attachement, bordereau, agents, marché DEMO) : rien n'est enregistré, les photos sont des images d'exemple.
  Un bandeau violet le rappelle sous l'en-tête. Code : `src/lib/demo/`.

## Ce qui vient du modèle, et où

| Rubrique du modèle | Écran de la maquette | Composants repris |
|---|---|---|
| Coque (sidebar, en-tête) | toutes les pages | barre latérale repliable (icônes / masquée, 3 styles), bouton « Nouvelle fuite », badge des envois en attente, carte d'aide, menu utilisateur ; en-tête : recherche ⌘J (écrans + saut à une fuite par son numéro), sélecteur de marché (modèle « Account switcher »), préférences d'affichage (jeu de couleurs, police, mode clair / sombre / système, largeur, barre latérale), bascule de thème, menu du compte |
| Auth v1 | `/connexion` | écran en deux volets, champs `Field`, erreurs en `Alert` |
| Default + Analytics | `/tableau-de-bord` | cartes d'indicateurs avec tendance (badge) et mini-courbe, graphique Recharts par semaine (aire + ligne, ou colonnes du délai), bande de 5 indicateurs « Situation à ce jour », anneau de répartition par statut + tableau, tableau par secteur avec barres, onglets, sélecteur de période, menu d'actions |
| Default (Recent customers) | `/tableau-de-bord` › Dernières fuites | tableau des dernières fuites |
| Finance | `/tableau-de-bord` › Attachements, `/attachements` | cellules KPI juxtaposées, liste `Item` des lots récents, raccourcis en boutons ronds, alerte « travaux à attacher » |
| Tasks + Kanban | `/fuites` | tableau TanStack (sélection, tri par colonne, colonnes masquables, pagination), filtres à facettes (secteur), période, « alertes seulement », onglets par statut avec compteurs, vue en colonnes par statut (sans glisser-déposer) ; cartes sur écran étroit |
| Profile | `/fuites/[id]` | fil d'Ariane, en-tête avec anneau d'avancement et badges, onglets Vue d'ensemble / Réparations / Réfections / Photos / Quantités / Historique, colonne « État du dossier » et étapes |
| File manager | `/fuites/[id]` › Photos | grille de cartes photo |
| Logistics | `/carte` | liste de cartes à gauche (anneau de progression, ligne pointillée), carte MapLibre à droite, onglets Fuite / Filtres / Impression sous la carte, feuille (Sheet) sur écran étroit |
| Invoice | `/attachements/[id]` | formulaire d'en-tête à gauche, « papier » du récapitulatif à droite, travaux du lot et « À attacher » en dessous |
| Users + Roles | `/utilisateurs` | tableau avec avatars colorés et pastille d'état, filtres Statut / Marché, menu d'actions par ligne, onglet Affectations et rôles, création dans une feuille latérale, ajout de rôle dans une boîte de dialogue |
| Infrastructure | `/marches` | en-tête à badges, recherche, groupes repliables par marché avec jauges (réparées / achevées / en attente) et tableau des agents, boîte de dialogue de création |
| Patient monitoring | `/alertes` (nouveau) | bandeau de surveillance avec horloge, grille de « moniteurs » (heures depuis détection, nombre d'alertes), bandeau d'alarme avec acquittement (repère d'écran, rien en base), barres par type d'alerte, chiffres vitaux, onglets Tendances (courbe 14 jours) / Événements / Fiche, pied de boutons |
| Productivity | `/a-faire` (nouveau) | salutation, 3 cartes de résumé, liste d'actions à cocher (réparations, réfections, communications SRM, photos manquantes), cartes des secteurs à suivre avec progression, raccourcis, calendrier des détections, seuil d'alerte, dernières réparations, bilan de la semaine |
| Settings (navigation latérale) | `/parametres` | sections à gauche (aussi dans la barre latérale sous « Paramètres »), contenu à droite ; Ouvriers / Équipes / Motifs en listes `Item` |

## Ce qui reste à l'ancienne

Les onglets des paramètres (Marché, Bordereau, Attachement, Événements, Secteurs, Réseau, Natures, Articles), le panneau
d'export, les formulaires de réparation / réfection, le bloc « À attacher », les corrections à l'attachement, la matrice
des droits, le journal des balayages, les travaux hors bordereau et le panneau Réseau de la carte gardent leur code
d'origine, habillé par `src/styles/ancien.css` (classes `.carte`, `.badge`, `.etiquette`, boutons, champs, tableaux)
sous un conteneur `.ancien` ; les anciens jetons de couleur de leurs modules CSS sont rapportés aux jetons shadcn en
tête de ce fichier. Ils ont l'apparence shadcn sans avoir été réécrits : conversion progressive, écran par écran.

## Technique

- Tailwind v4 (`postcss.config.mjs`, `src/app/globals.css` avec les jetons et les 3 préréglages du modèle),
  composants shadcn « radix-nova » copiés tels quels dans `src/components/ui/` (`cn` dans `src/lib/utils.ts`),
  `radix-ui`, `lucide-react`, `recharts`, `@tanstack/react-table` v8, `zustand` (préférences), `react-day-picker`.
- Préférences d'affichage mémorisées en cookies (`src/lib/preferences/`, `src/stores/preferences/`,
  `src/scripts/theme-boot.tsx`) ; la mise en page `(app)/layout.tsx` les lit côté serveur pour éviter le clignotement.
- Statuts et alertes : `src/components/statut.tsx` (badges, points, couleurs reprises par la carte).
- Composants réutilisés : `src/components/carte-indicateur.tsx` (cartes KPI, bande KPI, mini-courbe),
  `src/components/tableau/` (corps de tableau, pagination, en-tête triable, filtre à facettes, colonnes).
- Rien n'a changé dans `supabase/`, `mobile/`, `src/lib/export/` (hors style du panneau) ni dans les scripts de vérification.
