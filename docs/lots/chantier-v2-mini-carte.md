# Chantier v2 — contrat de la mini-carte servie à l'APK (F4, C5)

> Publié par la session S10 (cartes) pour S7 (APK). Code du panneau : route `web/src/app/mini-carte/page.tsx`, composant
> réutilisable `web/src/app/(app)/carte/MiniCarte.tsx`, fonctions pures `web/src/lib/reseau/mini-carte.ts` (vérifiées par
> `web/scripts/verifier-tuiles.mjs`). Base : `suggestions_localisation` (contrat S2 § 3), rien de nouveau en base.

## 1. Ce que fait la page

Dans le formulaire « Nouvelle fuite » (et la correction de position du responsable, V5), l'agent ouvre une petite carte :

- zoom rapproché (18, ou 17 si la précision dépasse 50 m) sur la position GPS : point bleu et cercle de précision ;
- **épingle rouge déplaçable** (glisser, ou toucher la carte à l'endroit exact) ; « Ma position » la ramène au GPS ;
- **conduite la plus proche en surbrillance** (jaune) et carte d'information : « Conduite la plus proche : Ø110 · PVC ·
  à 5,4 m · Secteur AOUNIA », ou « Aucune conduite à moins de 30 m » ;
- tout le réseau autour (tuiles vectorielles du réseau ; sans archive à jour, le secteur de la position), coloré par
  diamètre, diamètres et matériaux écrits le long des conduites, vannes et autres équipements ;
- bouton **Satellite** (Esri) si la clé est posée sur le panneau, sinon absent ;
- barre du bas : **Annuler** et **Valider la position**.

Règle d'Issam : diamètre, matériau, tronçon, secteur et rues sont des **suggestions** ; le formulaire les propose, l'agent
les accepte d'un toucher, rien n'est pré-rempli.

## 2. Ouverture depuis l'APK

Même mécanisme que l'écran Balayage (`mobile/src/balayage.tsx`) :

```
${EXPO_PUBLIC_WEB_URL}/session#access_token=<jeton>&refresh_token=<jeton>&suite=<suite encodée>
suite = /mini-carte?marche=<uuid>&lat=<latitude>&lng=<longitude>&precision=<m>&langue=<fr|ar|hybride>&satellite=<0|1>
```

| Paramètre | Obligatoire | Valeur |
|---|---|---|
| `marche` | oui (sinon le marché mémorisé de la session) | uuid du marché de la fuite |
| `lat`, `lng` | non | position GPS en degrés WGS84 ; absentes : carte centrée sur le réseau, épingle au centre |
| `precision` | non | précision annoncée par le GPS, en mètres (`coords.accuracy`) |
| `langue` | non | `fr` (défaut), `ar` ou `hybride` (« Valider la position · تأكيد الموقع ») ; arabe à relire par Issam |
| `satellite` | non | `1` : image satellite dès l'ouverture (si la clé est posée) |

- `suite` est vérifiée par `suiteSure` (chemin relatif, 500 caractères au plus) : la forme ci-dessus passe.
- Avant d'ouvrir, sonder le panneau comme Balayage (GET de `/session`, 15 s) ; sans réseau, ne pas ouvrir la mini-carte :
  la saisie de la fuite reste possible avec la seule position GPS (suggestions absentes).
- Jetons : mêmes règles que Balayage (fragment jamais journalisé, renouvellement par la tablette ; la page ne renouvelle
  pas la session dans la WebView : `estContexteApk`).
- Retour Android : l'APK ferme la WebView ; c'est un « Annuler ».

## 3. Messages de la page vers l'APK

`window.ReactNativeWebView.postMessage(JSON.stringify(message))` ; dans un navigateur, la page parente (cadre) ou la
fenêtre qui l'a ouverte reçoit l'objet, et un événement `mini-carte` (CustomEvent, `detail` = message) est émis dans la
page. Tous les messages ont `type` et `version: 1`.

| `type` | Quand | Champs |
|---|---|---|
| `mini-carte:prete` | page chargée | — |
| `mini-carte:position` | à chaque position de l'épingle (ouverture, glisser, toucher, « Ma position »), une fois les suggestions reçues (350 ms après le dernier geste) | voir ci-dessous |
| `mini-carte:valider` | appui sur « Valider la position » | mêmes champs que `position` |
| `mini-carte:annuler` | appui sur « Annuler » | — |
| `mini-carte:erreur` | session absente (`message: 'session_absente'`) ou marché inconnu (`'marche_absent'`) | `message` |

Champs de `position` et `valider` :

```json
{
  "type": "mini-carte:valider", "version": 1,
  "latitude": 34.68172, "longitude": -1.90762,
  "precision_m": 12,
  "deplacee": true,
  "distance_gps_m": 36.9,
  "troncon": {"id": "…", "reference": "T816758_455992", "diametre_mm": 200, "materiau": "pvc", "materiau_plan": "PVC",
              "secteur_id": "…", "distance_m": 7.4, "geojson": {"type": "LineString", "coordinates": […]}},
  "suggestions": {"rayon_m": 30, "precision_insuffisante": false, "rues": […], "secteur": {…}, "troncon": {…}}
}
```

- `latitude`, `longitude` : position de l'épingle (celle à enregistrer dans la fuite si l'agent valide).
- `precision_m` : précision du GPS d'origine (pas celle de l'épingle) ; `deplacee` : l'épingle a été posée à la main ;
  `distance_gps_m` : écart entre l'épingle et le GPS (null sans GPS). Le formulaire peut garder la position GPS d'origine
  et la position validée (V5 : correction tracée).
- `troncon` : `null` si aucune conduite dans le rayon. Correspondance avec la fuite (contrat S2 § 2) :
  `troncon.id` → `fuites.troncon_id`, `troncon.diametre_mm` → `fuites.diametre_mm`, `troncon.materiau` → `fuites.materiau`
  (code normalisé, nul si le plan ne le donne pas : afficher `materiau_plan`). Toujours en suggestion.
- `suggestions` : la réponse complète de `suggestions_localisation` pour la position de l'épingle (rues, secteur), ou
  `null` si l'appel a échoué (réseau) ; alors le formulaire garde la saisie manuelle. Après un déplacement à la main,
  l'appel se fait avec une précision de 5 m (rayon minimal de 30 m).

## 4. Messages de l'APK vers la page (facultatif)

Pour suivre le GPS pendant que la carte est ouverte :

```js
// injectJavaScript (recommandé)
window.miniCarte && window.miniCarte.gps(34.68172, -1.90762, 8); true;
// ou postMessage
webView.postMessage(JSON.stringify({ type: 'mini-carte:gps', latitude: 34.68172, longitude: -1.90762, precision: 8 }));
```

Le point bleu et le cercle suivent ; l'épingle suit aussi tant que l'agent ne l'a pas déplacée.

## 5. Dans le panneau web (S5)

Le composant s'emploie directement dans un formulaire (pas de cadre) :

```tsx
import dynamic from 'next/dynamic';
const MiniCarte = dynamic(() => import('@/app/(app)/carte/MiniCarte').then((m) => m.MiniCarte), { ssr: false });

<div className="h-80"><MiniCarte marcheId={marche.id} gps={{ latitude, longitude, precision }} surChangement={(r) => …} /></div>
```

`surChangement` reçoit les mêmes champs que `mini-carte:position` (type `ResultatMiniCarte`). Sans `gps`, la carte part du
centre du réseau.

## 6. Limites

- La page a besoin du réseau (fond de carte, suggestions) : pas de mini-carte hors ligne.
- Satellite : seulement si `NEXT_PUBLIC_ESRI_CLE` est posée sur Vercel (clé restreinte au domaine du panneau ; la WebView
  charge le panneau, donc le référent est `fuites.stepag.ma`) ; bornée à l'emprise du réseau + 1 km, zooms 13 à 19.
- Libellés arabes de la page (§ 2) à relire par Issam avec le dictionnaire de l'APK.
