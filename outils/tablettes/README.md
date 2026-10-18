# Tablettes : ménage par câble (adb)

Lot TP (`docs/lots/lot-tablette-proprietaire.md`, note Claude Docs « Briefing — Tablettes verrouillées Suivi fuites »).

| Fichier | Rôle |
|---|---|
| `applis-retirees.txt` | 59 applis retirées pour l'utilisateur (`pm uninstall -k --user 0`) : elles restent dans le système et se remettent sans téléchargement |
| `applis-desactivees.txt` | 7 applis que Xiaomi refuse de retirer (`Failure [-1000]`) : désactivées (`pm disable-user --user 0`) |
| `menage.sh [série]` | applique les deux listes ; bilan : retirées, désactivées, déjà absentes, refusées ; ne touche jamais aux applis gardées |
| `remise.sh [série] [paquet…]` | remet tout, ou seulement les paquets donnés (`cmd package install-existing`, `pm enable`) |
| `preparer-cable.sh [série] [apk]` | prépare une Redmi par câble : contrôle des comptes, installation de la dernière APK publiée, ménage, propriétaire, réglages de la tablette 1, redémarrage (§ Préparer une tablette par câble) |

Listes de la Redmi Pad 2 4G (HyperOS OS2.0.203.0.VOWMIXM), appliquées le 2026-10-11. La **même liste** est cachée par la
politique de Suivi fuites quand l'appli est propriétaire de la tablette (`mobile/modules/tablette-proprietaire/…/Politique.kt`,
`SERVICES_CACHES`) ; `mobile/essais/tablette-listes.test.mjs` (CI de l'APK) vérifie que les trois listes restent identiques.

Quand s'en servir :
- **Redmi d'essai** (profil essai, adb gardé) : ménage complet, libère la place et les services sans icône.
- **Tablette d'agent préparée par QR code** : inutile ; adb y est coupé et la politique cache déjà ces applis (une appli
  cachée ne tourne plus). Pour en remettre une, déverrouiller la tablette avec un code du panneau web.
- Une tablette dont Suivi fuites est propriétaire refuse `install-existing` tant que l'interdiction d'installer est posée :
  la déverrouiller d'abord.

```bash
outils/tablettes/menage.sh nzxcijwchixklrij
```

```bash
outils/tablettes/remise.sh nzxcijwchixklrij com.miui.calculator
```

Avant toute commande sur une tablette en service : vérifier que personne ne l'utilise (une saisie en cours n'est pas
touchée par ces commandes, mais une appli retirée se ferme).

## Préparer une tablette par câble (Redmi / HyperOS)

**Le QR code à 6 touchers n'existe pas sur les tablettes Xiaomi** (essayé le 2026-10-18 sur la REDMI Pad 2 9.7 4G,
HyperOS 3.0 : rien ne se passe). Les Redmi se préparent donc par câble, en **profil essai** (adb gardé, commande de
secours disponible), comme la tablette 1. Recette suivie pour la tablette 2 ; même chose pour la tablette 3 (9,7 pouces,
64 Go).

| | Tablette | Modèle | Système |
|---|---|---|---|
| 1 | Redmi Pad 2 11 pouces 4G | `koto`, 2505DRP06G | HyperOS 2.0, Android 15 |
| 2 | REDMI Pad 2 9.7 4G, 128 Go | `erhu`, 2604ERP4DG | HyperOS 3.0, Android 16 |
| 3 | REDMI Pad 2 9.7 4G, 64 Go | `erhu`, 2604ERP4DG | HyperOS 3.0, Android 16 (préparée le 2026-10-18) |

Gestes d'Issam avant le câble :

1. Tablette neuve, ou : retirer le compte Google (Paramètres › Comptes et synchronisation) et se déconnecter du compte
   Xiaomi, puis **À propos de la tablette › Réinitialisation d'usine**. SIM insérée, batterie au-dessus de 50 %.
2. Assistant : Français, Maroc, 4G ou Wi-Fi ; **Ignorer** les comptes Google et Xiaomi ; pas de code PIN à ce stade.
3. **À propos de la tablette** : toucher 7 fois « Version d'HyperOS ».
4. **Paramètres supplémentaires › Options pour les développeurs** : **Débogage USB** activé ; rubrique Mise en réseau,
   **Configuration USB par défaut › Transfert de fichiers** (sinon le Mac ne voit rien sur le câble).
5. Brancher au Mac, accepter « Autoriser le débogage USB ? » (Toujours autoriser) ; sur le Mac, autoriser l'accessoire.

Puis Claude :

```bash
outils/tablettes/preparer-cable.sh <série>
```

HyperOS refuse l'installation par câble (« Installer via USB » exige un compte Xiaomi) : le script dépose l'APK dans
Téléchargements et attend qu'Issam l'installe d'un toucher (Gestionnaire de fichiers › Téléchargements ›
suivi-fuites.apk › Installer, puis Terminé sans ouvrir l'appli).
Si **Google Play Protect** affiche « Appli bloquée » (tablette 3), ne pas toucher OK (= refus) : **Plus d'infos ›
Installer quand même**, puis « Ne pas envoyer » pour l'analyse. L'installation prend ensuite une à deux minutes.

Gestes d'Issam après le script :

6. Ouvrir Suivi fuites, connecter l'agent ; le **cadenas** est en haut à droite (il n'apparaît qu'après le redémarrage
   fait par le script).
7. Panneau : Paramètres › Tablettes › **Déverrouiller 1 heure** ; taper le code dans le cadenas.
8. Ouvrir les Paramètres › Comptes et synchronisation › Ajouter un compte › Google : compte des tablettes.
9. Applis › Gérer les applis › Suivi fuites › **Économiseur de batterie › Aucune restriction**. Ne pas toucher aux
   « Autres autorisations » : le script les a mises à « autoriser » et HyperOS en remet à « refuser » dès qu'on y touche.
10. Écran de verrouillage › **Données faciales et verrouillage d'écran** › Code PIN (le même sur toutes les tablettes).
11. Cadenas › **Reverrouiller maintenant** (vérifier que Paramètres disparaît de l'écran d'accueil ; sinon, par adb :
    `am broadcast -n ma.stepag.suivifuites/ma.stepag.tablette.RecepteurSecours --es action reverrouiller`) ; redémarrer, taper le PIN, essayer de sortir de l'appli (seules Suivi fuites,
    Appareil photo, Maps, Messages, Contacts, Téléphone doivent apparaître).

Réglages de référence (relevés sur la tablette 1 le 2026-10-18, posés par le script) : luminosité automatique, veille
2 min, rotation automatique coupée, sons des touches coupés, vibration activée, 24 h, heure automatique, fuseau GMT
(politique de l'appli), localisation précise, données mobiles activées, itinérance coupée, mode sombre coupé, Gboard en
français, Suivi fuites exemptée de l'optimisation de batterie et autorisée en arrière-plan.
