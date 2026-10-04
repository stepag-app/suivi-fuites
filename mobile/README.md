# Application Android (Expo, React Native, TypeScript)

Socle de l'APK pour les tablettes Samsung. Même base Supabase et mêmes règles (RLS) que le panneau web :
aucun secret dans l'application, uniquement l'adresse du projet et la clé « anon » (publique).

## Ce que fait ce socle

| Écran | Contenu |
|---|---|
| Connexion | identifiant + mot de passe (compte créé par l'administrateur) |
| Liste | fuites du marché (statut, secteur, alerte 48 h), tirer pour rafraîchir ; dernière liste gardée hors ligne |
| Nouvelle fuite | GPS, référence SRM, secteur, adresse, observation, photos (redimensionnées à 1 600 px, qualité 70, stockées dans le dossier privé de l'appli, jamais dans la galerie) |
| Envois en attente | fuites gardées sur la tablette, envoi manuel, erreurs, abandon |

**Hors ligne** : la fuite et ses photos sont d'abord écrites sur la tablette, puis envoyées (ouverture de
l'appli, retour au premier plan, toutes les 30 s). Les identifiants sont créés sur l'appareil, donc un renvoi
ne crée pas de doublon ; les fichiers locaux ne sont supprimés qu'après confirmation du serveur.

**Pas encore fait** : réparations, réfections et changement de statut sur la tablette (se font dans le
panneau web ; les statuts avancent automatiquement), suivi GPS en arrière-plan (M4), notifications push,
mise à jour intégrée de l'APK, choix entre plusieurs marchés, détection des doublons.

## Développement

```bash
cd mobile
cp .env.example .env     # adresse du projet et clé anon (publique)
npm install
npx expo start           # nécessite Expo Go ou un build de développement
```

`expo install` et `expo-doctor` interrogent des serveurs Expo : les versions des modules natifs se lisent
dans `node_modules/expo/bundledNativeModules.json` si ces serveurs sont inaccessibles.

## Compilation de l'APK (GitHub Actions)

Workflow `.github/workflows/apk.yml` : types, `expo prebuild`, `gradlew assembleRelease`, APK en artefact
(14 jours). Une fois par dépôt, créer le secret **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** (clé anon, comme pour
Vercel) ; sans lui l'APK se compile mais ne peut pas se connecter.

L'APK est **signé avec la clé de test d'Expo** : suffisant pour les essais sur la tablette de test.
**Avant toute distribution aux agents**, créer un keystore de production **hors du dépôt**, en deux copies
(sans lui, plus aucune mise à jour possible par-dessus une version installée) et le brancher dans le workflow.

## Installation sur la tablette

Télécharger l'artefact `suivi-fuites-apk` (onglet Actions du dépôt), le copier sur la tablette, autoriser
l'installation depuis cette source. Sur Samsung : exclure l'appli de l'optimisation batterie
(Réglages > Batterie > Applications jamais en veille) pour le futur suivi GPS.
