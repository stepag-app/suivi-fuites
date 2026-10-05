# Travailler en local sur le MacBook (Claude Code en ligne de commande)

Décision d'Issam du 2026-10-05 (piste 2) : le travail courant (interface, APK, retouches) se fait
**en local** avec Claude Code, sur le quota de l'abonnement Max ; le solde cloud (≈ 60 $, expire le
5 novembre 2026) est gardé pour **un ou deux gros lots autonomes** en parallèle.
Le circuit ne change pas : branche → PR → CI GitHub + aperçu Vercel → « fusionner ».

## 1. Installation (une fois)

Dans le Terminal du Mac :

```bash
# Homebrew (si absent) : https://brew.sh
brew install node git gh            # Node 22 ou plus, Git, client GitHub
npm install -g @anthropic-ai/claude-code
gh auth login                        # compte GitHub stepag-app, navigateur
git clone https://github.com/stepag-app/suivi-fuites.git ~/suivi-fuites
cd ~/suivi-fuites/web
cp .env.example .env.local           # renseigner les 2 valeurs (voir ci-dessous)
npm install
```

`web/.env.local` (jamais dans le dépôt, déjà ignoré par git) :
- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` : les **mêmes** que dans Vercel
  (Settings > Environment Variables), ou dans Supabase > Project Settings > API (clé `anon`).
- **Jamais** la clé `service_role`.

Facultatif, pour tester sur une **copie locale** de la base (sans toucher à la production) :
Docker Desktop, puis `supabase start` (voir `supabase/README.md` § Essai local complet).

## 2. Chaque séance

```bash
cd ~/suivi-fuites
git checkout main && git pull        # partir de la dernière version
claude                               # lance Claude Code dans le dépôt
```

Première phrase à donner à Claude : le **prompt de reprise** de `docs/etat-avancement.md` § 6, puis
l'objectif de la séance (« lot X : … »). Claude lit `CLAUDE.md` tout seul.

Voir l'application pendant le travail : `cd web && npm run dev`, puis http://localhost:3000
(connexion avec votre compte habituel ; choisir le marché **DEMO** pour les essais).

Fin de séance : Claude met à jour `docs/etat-avancement.md`, pousse la branche et ouvre la PR ;
vous vérifiez l'aperçu Vercel et dites « fusionner ».

## 3. Économiser le quota (il est partagé avec l'application de paie du client, prioritaire)

- **Une session par lot**, puis `/clear` (ou nouvelle session) : une longue session coûte plus cher à
  chaque échange, même avec le cache.
- `/compact` en milieu de lot si la conversation devient longue.
- Surveiller `/usage` ; si la limite hebdomadaire approche, s'arrêter et laisser la priorité à la paie.

## 4. Quand utiliser le cloud (solde restant)

Gros blocs autonomes qui tournent sans vous : plusieurs lots en parallèle, migration des tronçons
quand le DXF arrivera, sauvegarde complète (base + photos). Démarrer chaque session cloud avec le
prompt de reprise et un périmètre de fichiers précis (comme les lots A à D du 2026-10-04).
