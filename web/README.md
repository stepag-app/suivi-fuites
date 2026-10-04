# Panneau web et mode terrain (version rapide)

Application Next.js 15 (App Router, TypeScript), hébergée sur Vercel. Elle parle directement
à Supabase depuis le navigateur : la **RLS** de la base fait la sécurité, il n'y a aucun secret
côté client. Les comptes sont créés par la fonction serveur `supabase/functions/gerer-utilisateurs`.

Une seule application, utilisable sur ordinateur (bureau, responsable) et sur la tablette Samsung
(navigateur Chrome, « Ajouter à l'écran d'accueil » pour l'installer comme une application).
C'est la **version rapide de test** : elle n'a pas encore de mode hors ligne ni de GPS en arrière-plan ;
l'APK Expo prévu dans CLAUDE.md viendra après validation du parcours.

## Écrans

| Écran | Qui | Contenu |
|---|---|---|
| `/connexion` | tous | identifiant + mot de passe |
| `/fuites` | tous les affectés | liste, filtres (statut, secteur, texte, alertes), export Excel (CSV) |
| `/fuites/nouvelle` | droit « fuites / créer » | GPS, référence SRM, secteur, photos, détection des doublons (rayon ou référence) |
| `/fuites/[id]` | selon droits | détail, photos, suivi SRM, réparations (fouille, pièces), réfections ou clôture sans réfection, quantités et prix, verrouillage, statut, suppression logique |
| `/utilisateurs` | administrateur | créer un agent, rôles par marché, changer le mot de passe, révoquer / réactiver |

## Variables d'environnement (Vercel et `web/.env.local`)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://osajiinsibwrsltntmsk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé « anon / publishable » de *Project Settings > API Keys* |

La clé anon est publique par conception (elle est dans le navigateur de chaque utilisateur).
**Ne jamais** mettre la clé `service_role` ici.

## Développement local

```bash
cd web
cp .env.example .env.local   # puis renseigner les deux valeurs
npm install
npm run dev
```

## Mise en ligne sur Vercel (équipe STEPAG)

1. vercel.com → équipe **STEPAG** → *Add New… > Project* → importer `stepag-app/suivi-fuites`.
2. **Root Directory : `web`**. Framework : Next.js (détecté).
3. *Environment Variables* : ajouter les deux variables ci-dessus, puis *Deploy*.
4. Chaque fusion dans `main` redéploie automatiquement.
