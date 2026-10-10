# Chantier v3 : envoi des documents par e-mail (S18) — contrat pour S17 (Rapports) et les sessions suivantes

> Fait par S18 (tâches M1 et M2 de `docs/lots/chantier-v3.md`). Fournisseur : **Resend** (§ 5, Q1), expéditeur
> `contact@stepag.ma`. La boîte `contact@` reste chez l'hébergeur de stepag.ma (MX et SPF de la boîte inchangés) : seuls
> les envois passent par Resend. Migration `supabase/migrations/20261014100000_envoi_email.sql`, tests
> `supabase/tests/database/44_s18_envoi_email.test.sql`, route `web/src/app/api/email/route.ts`, composant
> `web/src/components/envoyer-email.tsx`, règles pures `web/src/lib/email.ts` (`node scripts/verifier-email.mjs`).

## 1. Brancher le bouton sur un document (S17 : écran Rapports)

```tsx
import { BoutonEnvoyerEmail } from "@/components/envoyer-email";

<BoutonEnvoyerEmail
  document="rapport"                       // voir DocumentEmail ci-dessous
  reference="État du 10/10/2026"           // texte libre court (≤ 120), repris au journal et dans l'objet par défaut
  fabriquer={async () => ({ blob, nom })}  // fabrique le fichier À L'OUVERTURE du dialogue (même code que « Télécharger »)
  objet="…"                                // facultatif : objet proposé (sinon « <titre du document> — <marché> »)
  message="…"                              // facultatif : message proposé (sinon texte type selon le document)
  disabled={!pret}                         // facultatif
/>
```

- Le bouton **se masque seul** si le compte n'est ni responsable du marché ouvert ni administrateur (`peut_envoyer_email`,
  lu une fois par marché) ; inutile de tester les droits autour.
- `fabriquer` renvoie le `Blob` et le nom du fichier avec son extension (`.pdf`, `.xlsx`, `.docx`, `.csv`). Pour un écran
  qui télécharge déjà, séparer « fabriquer » de « télécharger » : `telecharger(blob, nom)` d'un côté, `fabriquer` de l'autre.
- Pièce jointe : **4 Mo au plus** (`TAILLE_MAX_PIECE` de `web/src/lib/email.ts` ; plafond des fonctions Vercel : 4,5 Mo par
  requête). Au-delà, le dialogue l'affiche et propose de télécharger le fichier pour l'envoyer depuis la messagerie.
- `DocumentEmail` : `rapport` (écran Rapports, J1), `rapport_fuite`, `carte`, `attachement`, `pv_debits`, `rapport_balayage`,
  `export` (panneau « Exporter » générique). Ajouter une valeur = l'ajouter ici, dans `DOCUMENTS_EMAIL` de `email.ts` et
  dans le contrôle `envois_email_document_check` (nouvelle migration).

Dialogue : destinataires de la liste du marché (cochés si « par défaut »), adresses saisies en plus (10 destinataires au
plus), objet et message préremplis et modifiables, nom et poids de la pièce jointe, « Envoyer ». Réponse affichée :
envoyé, refusé (droit, limite du jour, taille) ou échec du fournisseur (rien n'est compté).

## 2. Route serveur `POST /api/email`

| Élément | Règle |
|---|---|
| Authentification | en-tête `Authorization: Bearer <jeton d'accès Supabase>` (le panneau garde sa session dans le navigateur, pas de cookie) ; la route appelle la base **avec ce jeton** (clé anon, RLS de l'appelant) : aucune clé `service_role` |
| Corps | `multipart/form-data` : `marche_id`, `document`, `reference`, `destinataires` (JSON : liste d'adresses), `objet` (≤ 200), `message` (≤ 5 000), `fichier` |
| Contrôles | adresses valides et distinctes (1 à 10), type de fichier PDF / Excel / Word / CSV, 4 Mo ; puis `reserver_envoi_email` (droit, marché actif, limites du jour) |
| Envoi | Resend : `from` = `STEPAG <contact@stepag.ma>`, `reply_to` et `bcc` = `contact@stepag.ma` (copie dans la boîte) ; texte et HTML (message échappé) ; puis `terminer_envoi_email` |
| Réponses | 200 `{ id }` ; 400 donnée invalide ; 401 sans session ; 403 pas responsable ni administrateur, ou marché désactivé ; 413 pièce trop lourde ; 429 limite du jour atteinte ; 503 fournisseur non configuré ; 502 refus du fournisseur |
| Variables (Vercel, **serveur seulement**) | `RESEND_API_KEY` (obligatoire pour envoyer ; jamais `NEXT_PUBLIC_`) ; facultatives : `EMAIL_EXPEDITEUR` (défaut `STEPAG <contact@stepag.ma>`), `EMAIL_COPIE` (défaut `contact@stepag.ma`), `EMAIL_FOURNISSEUR=essai` (essais : aucun envoi, réponse simulée), `RESEND_API_URL` (essais : faux serveur) |

## 3. Base

| Objet | Contenu | Droits |
|---|---|---|
| `destinataires_email` | par marché : `nom`, `email` (unique par marché, sans casse), `organisme`, `par_defaut` (coché d'office), `actif`, `ordre` | lecture et écriture : **responsable du marché et administrateur** ; suppression permise (simple carnet d'adresses) |
| `envois_email` | journal : `envoye_par`, `document`, `reference`, `objet`, `destinataires` (text[]), `piece_nom`, `piece_octets`, `statut` (`en_cours`, `envoye`, `echec`), `fournisseur_id`, `erreur`, `cree_le`, `termine_le` | lecture : responsable du marché et administrateur ; **aucune écriture directe** (fonctions ci-dessous) |
| `marches.emails_par_jour` | envois permis par marché et par jour d'Oujda (défaut 20, de 1 à 100) | réglé dans Paramètres › Marché › Destinataires |
| `peut_envoyer_email(p_marche)` | vrai pour le responsable du marché et l'administrateur | `authenticated` |
| `reserver_envoi_email(p_marche, p_document, p_reference, p_objet, p_destinataires, p_piece_nom, p_piece_octets)` | vérifie droit, marché actif, 1 à 10 adresses, limite du marché (envois `en_cours` et `envoye` du jour) et **limite commune de 90 envois par jour** (offre gratuite de Resend : 100 par jour) ; crée la ligne `en_cours`, renvoie son `id` | `authenticated` |
| `terminer_envoi_email(p_id, p_statut, p_fournisseur_id, p_erreur)` | `envoye` ou `echec`, seulement par l'auteur de la ligne et depuis `en_cours` | `authenticated` |

Un échec du fournisseur ne compte pas dans la limite du jour. Les codes d'erreur de `reserver_envoi_email` :
`insufficient_privilege` (403), `check_violation` + message « Limite » (429), `invalid_parameter_value` (400).

## 4. Où sont les boutons

| Écran | Document |
|---|---|
| Fiche d'une fuite › Rapport PDF | `rapport_fuite` |
| Liste des fuites › Rapports PDF (n) | `rapport_fuite` |
| Carte › Impression | `carte` |
| Panneau « Exporter » (lot d'attachement, liste des fuites, journal) | `attachement` sur la fiche d'un lot, `export` ailleurs |
| Débits de nuit › procès-verbal d'une campagne | `pv_debits` |
| Rapports (S17) | `rapport` — à brancher par la dernière des deux sessions fusionnée |
