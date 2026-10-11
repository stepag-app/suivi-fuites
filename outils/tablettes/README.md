# Tablettes : ménage par câble (adb)

Lot TP (`docs/lots/lot-tablette-proprietaire.md`, note Claude Docs « Briefing — Tablettes verrouillées Suivi fuites »).

| Fichier | Rôle |
|---|---|
| `applis-retirees.txt` | 59 applis retirées pour l'utilisateur (`pm uninstall -k --user 0`) : elles restent dans le système et se remettent sans téléchargement |
| `applis-desactivees.txt` | 7 applis que Xiaomi refuse de retirer (`Failure [-1000]`) : désactivées (`pm disable-user --user 0`) |
| `menage.sh [série]` | applique les deux listes ; bilan : retirées, désactivées, déjà absentes, refusées ; ne touche jamais aux applis gardées |
| `remise.sh [série] [paquet…]` | remet tout, ou seulement les paquets donnés (`cmd package install-existing`, `pm enable`) |

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
