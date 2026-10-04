# Mission : extraire TOUTES les règles du marché n° 4500004453 dans un seul fichier Markdown

> Fichier à utiliser avec Claude Code **en local sur le Mac** (modèle Fable, forfait Max).
> Partie A : à exécuter par Issam dans le Terminal avant de lancer Claude Code.
> Partie B : le prompt proprement dit. Dans Claude Code, lancé depuis `~/Desktop/Suivi-fuites`, tapez :
> « Lis `docs/prompts/extraction-regles-marche-4500004453.md` et exécute la mission décrite dans la partie B. »

---

## Partie A : pré-requis (Issam, dans le Terminal, AVANT de lancer Claude Code)

```bash
# 1. Outils (Homebrew requis : https://brew.sh)
brew install poppler tesseract tesseract-lang pandoc ocrmypdf qpdf

# 2. Dossier de travail hors dépôt + environnement Python isolé (pip3 direct est refusé par Homebrew)
mkdir -p ~/extraction-4500004453 && cd ~/extraction-4500004453
python3 -m venv venv && source venv/bin/activate
pip install pypdf pdfplumber openpyxl python-docx xlrd pillow numbers-parser ezdxf

# 3. Lien court vers le dossier source (le nom original contient N°, accents et espaces)
ln -s "/Users/issamboussalam/Desktop/MARCHE N° 4500004453 DÉTECTION, RECHERCHE ET REPARATION DES FUITES" ~/extraction-4500004453/src
ls ~/extraction-4500004453/src | head        # accepter l'accès au Bureau si macOS le demande
tesseract --list-langs | grep -E "fra|ara"    # doit afficher fra et ara

# 4. Git : le push doit fonctionner avant de commencer
cd ~/Desktop/Suivi-fuites && git checkout main && git pull origin main
git push --dry-run origin main
mkdir -p references
```

5. Créer `~/Desktop/Suivi-fuites/.claude/settings.local.json` (fichier personnel, non versionné) pour éviter des centaines de demandes d'autorisation :

```json
{
  "permissions": {
    "allow": [
      "Bash(pdftotext:*)", "Bash(pdfinfo:*)", "Bash(pdftoppm:*)", "Bash(pdfimages:*)", "Bash(pdffonts:*)",
      "Bash(tesseract:*)", "Bash(ocrmypdf:*)", "Bash(pandoc:*)", "Bash(textutil:*)", "Bash(qpdf:*)",
      "Bash(sips:*)", "Bash(shasum:*)", "Bash(find:*)", "Bash(ls:*)", "Bash(wc:*)", "Bash(cat:*)",
      "Bash(mkdir:*)", "Bash(unzip:*)", "Bash(git status:*)", "Bash(git add:*)", "Bash(git commit:*)",
      "Bash(/Users/issamboussalam/extraction-4500004453/venv/bin/python:*)",
      "Read(~/extraction-4500004453/**)", "Read(~/Desktop/MARCHE*/**)",
      "Write(~/extraction-4500004453/**)", "Edit(~/extraction-4500004453/**)"
    ]
  }
}
```

À défaut, répondre « Oui, ne plus demander » à la première occurrence de chaque commande.

6. Lancer Claude Code depuis `~/Desktop/Suivi-fuites`, choisir le modèle Fable (`/model claude-fable-5-1`), puis coller la phrase indiquée en tête de ce fichier.

Prévoir **3 à 5 sessions** : la mission est découpée en lots avec des points de sauvegarde, une nouvelle session reprend là où la précédente s'est arrêtée.

---

## Partie B : le prompt

### Contexte

- Projet : application de détection et de réparation de fuites pour STEPAG SARL, maître d'ouvrage SRM Oriental, ville d'Oujda. Lis d'abord `CLAUDE.md` à la racine du dépôt : il décrit l'application, les rôles et les décisions déjà prises.
- Dossier source, **jamais versionné et en lecture seule** : `~/extraction-4500004453/src` (lien vers le dossier du bureau ; environ 164 éléments, 376 Mo : CPS, bordereau des prix, définition des prix, modèle d'attachement d'un marché STEPAG de 2017, fiches et modèles Canva en préparation, plans PDF d'Oujda, et peut-être d'autres pièces).
- Dépôt : `~/Desktop/Suivi-fuites`, branche `main`.
- Dossier de travail, hors dépôt : `~/extraction-4500004453/`.
- **Livrable unique dans le dépôt** : `references/regles-marche-4500004453.md`.

Ce fichier sera lu par une autre session Claude (cloud) qui **n'aura pas accès aux documents originaux**. Elle s'en servira pour concevoir le schéma Supabase, les écrans de la tablette, les exports, les attachements mensuels et les règles de calcul. Le fichier doit donc être **exhaustif et auto-suffisant**, lisible par un humain et exploitable par une machine.

### Règles de travail

1. **Exhaustivité sur les règles, pas sur le texte brut.** Cible : 3 000 à 7 000 lignes, moins de 500 Ko. Une règle, un chiffre, un champ ou une structure oubliés coûtent plus cher qu'une règle en trop ; en revanche aucune sortie OCR brute ni description page par page des plans n'entre dans le livrable.
2. **Ne rien inventer.** Chaque règle, chiffre, délai, unité ou prix porte sa source `[F012 p.7]`. Ce que les documents ne disent pas est écrit `[NON PRÉCISÉ]`, jamais omis en silence.
3. **Verbatim pour l'essentiel** : bordereau des prix complet, définition des prix, clauses clés du CPS (délais, pénalités, réception, paiement, attachements, états à fournir), extrait représentatif de l'attachement 2017, libellés exacts des fiches. Le reste est résumé.
4. **Lecture intégrale et prouvée.** Chaque page de chaque document est lue (texte, OCR ou visuel) et cela est consigné page par page. Annexes, notes de bas de page, tampons, mentions manuscrites, en-têtes et pieds de page compris.
5. **Rien ne vit dans ta mémoire de session.** Tout ce que tu apprends est écrit sur disque immédiatement, dans `~/extraction-4500004453/`, avant d'ouvrir le document suivant. Après une compaction ou une interruption, tu reprends depuis `etat.md` sans relire ce qui est déjà fait.
6. **Dossier source en lecture seule.** Aucun renommage, OCR en place, conversion ni déplacement dans `src/`. Toute sortie va dans le dossier de travail.
7. **Un seul fichier dans le dépôt.** Ne copie aucun document source ni fichier de travail dans le dépôt ; ne commite que `references/regles-marche-4500004453.md`.
8. **Aucun secret ni donnée personnelle.** Ne recopie jamais : RIB, IBAN, numéros de compte, CIN, passeport, téléphones ou e-mails personnels, images de signatures ou de cachets. Remplace par `[RIB non recopié]`, `[CIN non recopiée]`. Les noms, fonctions et qualités des signataires, les lignes fixes et adresses génériques de la SRM et de STEPAG, les numéros RC, patente, ICE et CNSS des en-têtes commerciaux sont conservés. Les prix et clauses du marché sont recopiés : le dépôt est privé.
9. **Questions regroupées en fin de mission** (section 12). Ne t'arrête jamais en cours de route pour une ambiguïté ou un outil manquant : note-le, applique la solution de repli, continue.
10. **Statut normatif sur chaque règle.** Une règle du modèle 2017 (autre marché, autres prix) ou d'une fiche Canva en préparation (idée interne STEPAG) ne doit jamais pouvoir être confondue avec une clause du marché 4500004453.

### Conventions de rédaction (obligatoires)

1. **Identifiants de fichiers.** Chaque fichier de l'inventaire reçoit un identifiant stable `F001`, `F002`… (tri par chemin relatif). Toute citation de source l'utilise : `[F003 p.12]`, `[F007 feuille "Attachement" C14]`, `[F012 image 2]`. Jamais de chemin complet ni de chemin absolu `/Users/…` dans le corps du texte.
2. **Identifiants de règles.** Chaque règle reformulée tient sur une ligne et porte un identifiant unique préfixé par sa section : `R-CPS-012`, `R-BPU-004`, `R-DEF-014`, `R-ATT-003`, `R-FICHE-021`, `R-DER-005`.
   Exemple : `- **R-CPS-012** [CONTRACTUEL] Le délai d'intervention est de 24 h à compter de la notification par la SRM. [F002 p.14, art. 18]`
3. **Statut normatif**, obligatoire sur chaque règle : `[CONTRACTUEL]` (CPS, bordereau, définition des prix, acte d'engagement, OS du marché 4500004453) ; `[2017]` (hérité de l'ancien marché : utile pour la forme, pas pour les prix, délais ni références) ; `[INTERNE]` (fiche ou modèle Canva STEPAG, non imposé par le client) ; `[DÉDUIT]` (interprétation de l'extracteur).
4. **Trois marqueurs distincts** : `[À CONFIRMER : raison]` = source ambiguë ou illisible ; `[NON PRÉCISÉ]` = les documents ne disent rien alors que le plan le demande ; `[CONTRADICTION : F002 p.5 vs F004 p.2]` = deux sources divergent.
5. **Tableaux Markdown** : une seule ligne d'en-tête, aucune cellule fusionnée, aucun retour à la ligne dans une cellule (séparer par ` ; `), une information par cellule. Nombres sans séparateur de milliers, point décimal (`1250.50`), jamais d'unité dans la cellule du nombre : l'unité a sa propre colonne. Dates `AAAA-MM-JJ`. Booléens `oui` / `non`. Sans objet `—`, inconnu `?`. L'arabe va dans une colonne `Libellé AR`, jamais mélangé au français.
6. **Verbatim** en bloc de citation (`>`), orthographe et ponctuation d'origine, chaque bloc immédiatement suivi des règles `R-…` qu'il fonde.
7. **Nombres et unités.** Dans le verbatim et les tableaux : la forme imprimée (`1 234,56 DH/ml`). Dans les blocs CSV : notation machine (`1234.56`) et unités en code court stable (`ml`, `m2`, `m3`, `u`, `forfait`, `kg`, `h`, `j`). Les équivalences rencontrées (`m2`/`m²`, `U`/`unité`, `ens.`/`ensemble`, `ML`/`ml`) vont au glossaire. Montants en MAD HT sauf mention contraire ; indiquer en tête de la section 4 le nombre de décimales des prix, quantités et montants tel qu'imprimé.
8. **Intervalles** avec bornes explicites et inclusivité : `63 < DN ≤ 110`, jamais « de 63 à 110 ». Borne incertaine → `[À CONFIRMER]`.
9. Les colonnes « proposé » (code proposé, nom canonique proposé) sont des propositions de l'extracteur, jamais sourcées, à ne pas confondre avec un libellé du marché.

### Dossier de travail et reprise

```
~/extraction-4500004453/
  src/                 lien vers le dossier source (lecture seule)
  venv/                environnement Python ; utilise toujours venv/bin/python, jamais python3 seul
  etat.md              tableau de bord : un fichier source par ligne, statut, prochaine action, phrase de reprise
  inventaire.csv       ID;chemin_relatif;type;taille;pages;nature;texte_ou_scanne;langues;sha256_8;statut_normatif;couvert_dans
  texte/F012.txt       texte brut extrait, un fichier par source, pages séparées par \f
  texte/F012-tables.json   tableaux extraits par pdfplumber
  texte/F012-ocr.txt   sortie OCR brute
  pages/F012.csv       page;nb_caracteres;methode(texte|ocr|visuel);lu(oui|non);remarque
  notes/F012.md        notes structurées : identité, pages lues, règles avec page, chiffres, marqueurs
  notes/bordereau.csv  numero;designation;unite;quantite;pu_ht;pu_lettres;montant_ht;source
  controle/F012-omissions.md   résultat de la seconde lecture par sous-agent
  sections/00-entete.md … 13-controle.md   le livrable, une section par fichier
```

Statuts dans `etat.md` : `à faire` → `texte extrait` → `lu et noté` → `intégré au livrable` → `vérifié (2e lecture)`. Mets `etat.md` à jour à chaque changement de statut, jamais en différé.

**Reprise** : au début de chaque session et après toute compaction, lis `etat.md`, puis les `notes/` des fichiers concernés, et reprends au premier fichier dont le statut n'est pas `vérifié`. Ne recharge jamais un texte source déjà `lu et noté`, sauf pour une vérification ciblée (une page, un tableau).

### Étape 0 : vérification des pré-requis (sans s'arrêter)

Exécute : `which pdftotext pdfinfo pdftoppm pdfimages pdffonts tesseract ocrmypdf pandoc qpdf textutil sips`, `tesseract --list-langs`, `~/extraction-4500004453/venv/bin/python -c "import pypdf, pdfplumber, openpyxl, docx, PIL"`, `ls ~/extraction-4500004453/src | head`, `cd ~/Desktop/Suivi-fuites && git push --dry-run origin main`.
Si un élément manque, note-le dans `etat.md` et dans la section 0, utilise le repli indiqué dans les recettes et **continue**.

### Étape 1 : inventaire

- Parcours `src/` avec `find src -type f -print0 | xargs -0 …` ; mets chaque chemin entre guillemets ; ne tape jamais un nom accentué à la main (macOS stocke les accents en forme décomposée, la recherche échoue en silence) : passe par des jokers (`-iname "*bordereau*"`) ou par `inventaire.csv`.
- Exclus `.DS_Store`, `Thumbs.db`, verrous Office `~$*`, en indiquant leur nombre. Fichiers de 0 octet : « vides, non exploitables ».
- Doublons exacts par `shasum -a 256` : une seule lecture, les deux chemins notés. Versions différentes d'un même document (taille ou pages différentes) : lues toutes les deux, différence décrite ; fait foi la version signée ou tamponnée, sinon la plus récente, choix marqué `[À CONFIRMER]`.
- **Natures** : CPS, acte d'engagement, règlement de consultation, offre technique ou mémoire, bordereau des prix, détail estimatif, sous-détail des prix, définition des prix, ordre de service, PV, décompte ou facture 2017, attachement 2017, état modèle SRM, fiche, modèle Canva, plan, courrier ou notification, image ou photo, caution ou assurance, autre. Aucun fichier ne reste « non classé ».
- **Statut normatif** par fichier : `contractuel signé` (signatures ou tampons) ; `contractuel non signé` (version d'appel d'offres ou de travail) ; `historique autre marché` (2017) ; `interne STEPAG en préparation` (fiches, Canva) ; `référence externe` (plans, normes, extraits de règlement).
- Le tableau devient la section 1 ; `inventaire.csv` en est la version machine.

### Étape 2 : extraction, document par document, par lots

Traite les fichiers par lots, le contractuel d'abord, les plans en dernier :

| Lot | Contenu | Sections produites |
|---|---|---|
| A | CPS, acte d'engagement, règlement de consultation, offre technique, ordres de service, courriers SRM | 2, 3 |
| B | Bordereau, détail estimatif, sous-détail, définition des prix, toutes versions | 4, 5, 6, 6 bis |
| C | Attachement 2017, décomptes, factures, états modèles | 7 |
| D | Fiches et modèles Canva | 8 |
| E | Plans | 9 |
| F | Synthèse : 10, 10 bis, 11, 11 bis, 12, 13, puis 0 et 1, assemblage, contrôle final, push | 0, 1, 10 à 13 |

Chaque lot se termine obligatoirement par : `etat.md` à jour, sections du lot écrites dans `sections/`, livrable régénéré et **commité localement** (voir Étape 3). C'est le seul point où il est acceptable de s'arrêter. Si la session approche de sa limite (contexte compacté deux fois, réponses qui ralentissent), termine le document en cours, fais ce point de sauvegarde, et écris dans `etat.md` la phrase exacte de reprise (« reprendre au lot C, fichier F041, page 12 »).

**Pour chaque fichier :** extraction selon la recette de son format → `pages/FXXX.csv` complet → `notes/FXXX.md` → statut `lu et noté`. Pour tout document de plus de 30 pages (CPS, définition des prix, attachement 2017), délègue cette étape à un sous-agent qui écrit `texte/`, `pages/` et `notes/` sur disque et te renvoie **seulement** un résumé de 20 lignes (nature, pages lues, pages illisibles, nombre de règles notées, questions). Tu rédiges à partir de `notes/`, jamais du texte intégral. Jamais plus de deux sous-agents en parallèle sur des PDF lourds.

#### Recette PDF : triage page par page

1. `pdfinfo` : pages, format, producteur, chiffrement (si chiffré sans mot de passe : `qpdf --decrypt` vers le dossier de travail).
2. `pdftotext -layout` → `texte/FXXX.txt`. Découpe sur `\f`, compte les caractères par page.
3. Page de moins de 80 caractères utiles → scannée → OCR. Page encore pauvre après OCR → `visuel`.
4. La **lecture visuelle** (outil Read sur le PDF, paramètre `pages`, 20 pages maximum par appel) est réservée : (a) aux pages `visuel` ; (b) aux tableaux de prix et d'attachement, pour contrôler l'extraction texte ; (c) aux images, modèles Canva et fiches ; (d) à un seul aperçu basse résolution par plan. Jamais pour lire un document texte de bout en bout.
5. Le nombre de pages avec une méthode et `lu=oui` doit être égal au nombre de pages de `pdfinfo`. Une page sans méthode est une page non lue : erreur à corriger avant le fichier suivant.
6. Extraction de plus de 2 minutes (gros plans vectoriels) : relance par tranches `pdftotext -f N -l M`.

#### Recette OCR (pages scannées, images)

- `ocrmypdf -l fra+ara --skip-text --sidecar texte/FXXX-ocr.txt "src/…" texte/FXXX-ocr.pdf`. À défaut : `pdftoppm -r 300 -gray -png` puis `tesseract page.png page -l fra+ara --psm 6`. Image seule : `tesseract image.jpg sortie -l fra+ara --psm 6`.
- OCR de moins de 200 caractères ou plus de 20 % de mots non reconnaissables → page `visuel`.
- **Aucun chiffre issu de l'OCR n'entre dans le livrable sans contrôle visuel** : prix, quantité, délai, montant, date lus par OCR sont vérifiés sur l'image de la page avant recopie. Marque `[OCR vérifié]` en section 13, `[À CONFIRMER : illisible]` si l'image ne permet pas de trancher.
- Tampons, visas, mentions manuscrites, signatures et passages en arabe : lecture visuelle (page entière ou zone recadrée et agrandie avec Pillow), pas tesseract. Recopie l'arabe tel quel suivi d'une traduction française entre crochets ; indique si la mention est manuscrite, tamponnée ou imprimée.

#### Recette tableaux de prix (bordereau, détail estimatif, définition des prix, attachement, états)

- Double extraction : `pdftotext -layout` **et** `pdfplumber` (`page.extract_tables()`) page par page vers `texte/FXXX-tables.json`. En cas de désaccord sur une cellule, tranche visuellement sur la page et marque la cellule `[visuel]`. Note en section 13 les pages où les deux extractions divergent.
- Transcris le bordereau dans `notes/bordereau.csv`, la définition des prix dans `notes/definition-prix.csv` (`numero;inclus;exclus;mode_metre;conditions;prix_lies;source`) et chaque ligne de l'attachement 2017 dans `notes/attachement-2017.csv`.
- **Recalcule par script Python, jamais de tête** : quantité × PU = montant ligne, sous-totaux, totaux, TVA, TTC ; prix en lettres = prix en chiffres. Consigne tout écart, même d'un centime, en section 13 avec la règle de prévalence du CPS ou du CCAG (en général le prix en lettres prévaut, et le prix unitaire prévaut sur le montant) ; la ligne concernée porte `[CONTRADICTION]` et la valeur retenue.
- Croise mécaniquement (différence d'ensembles) les numéros de prix entre bordereau, définition des prix et détail estimatif : tout numéro présent dans l'un et absent de l'autre va en section 12. L'attachement 2017 est rapproché du bordereau 2026 **uniquement via la table de passage** de la section 7, jamais numéro à numéro (autre marché).
- Pièges à corriger dans les CSV, pas dans le verbatim : prix en lettres coupés sur deux lignes, césures, ligatures (`ﬁ`), `°`/`º`, `m2`/`m²`, espaces insécables dans les nombres, désignations qui débordent sur la ligne suivante.

#### Recette classeurs (.xlsx, .xlsm, .xls, .numbers)

Script Python (venv) qui écrit `texte/FXXX-xlsx.md` :
- Ouvre deux fois : `load_workbook(p, data_only=False)` pour les formules, `data_only=True` pour les valeurs. Formule sans valeur en cache → signalée.
- Par feuille : nom, `sheet_state` (`visible`, `hidden`, `veryHidden` : lues et signalées), plage utilisée, lignes et colonnes masquées, cellules fusionnées, zone d'impression, en-têtes et pieds de page.
- **Listes de validation** (`ws.data_validations`) : ce sont les listes officielles de valeurs d'un champ (types de fuite, natures de voirie, statuts) → section 6 bis, intégralement, avec la cellule source.
- Noms définis, commentaires de cellule, hyperliens, **mise en forme conditionnelle** (ses seuils sont des règles : « rouge si délai > 48 h »).
- Chaque formule recopiée verbatim avec sa cellule, puis expliquée (`montant = quantité × PU`, `cumul à ce jour = cumul antérieur + mois`). Exporte chaque feuille en CSV dans `texte/`.
- `.xls` : `xlrd` (valeurs seulement, à signaler). `.numbers` : `numbers-parser`, sinon `preview.pdf` du paquet (`unzip -l`) et demande d'export en section 12.

#### Recette Word et Pages (.docx, .doc, .pages)

- `.docx` : `pandoc "src/…" -t gfm --track-changes=all --extract-media=texte/FXXX-media -o texte/FXXX.md` (tableaux conservés, modifications suivies visibles). Complète avec `python-docx` pour en-têtes, pieds de page et zones de texte (numéro de marché, visas, dates). Images extraites lues visuellement si elles portent du texte.
- `.doc` : `textutil -convert docx "src/…" -output texte/FXXX.docx`, puis pandoc.
- `.pages` / `.key` : archive zip ; extrais `preview.pdf` ou `QuickLook/Preview.pdf` et traite-le comme un PDF ; sinon `qlmanage -t -s 2500 -o texte/ "fichier.pages"` (première page seulement) et demande d'export PDF en section 12.
- Dans une fiche en préparation, modifications suivies et commentaires sont des règles en discussion : recopie-les avec `[brouillon : commentaire de X, date]`, jamais comme texte final.

#### Recette images et modèles Canva

- HEIC/HEIF : `sips -s format jpeg "src/…/photo.heic" --out texte/FXXX.jpg`. Images de plus de 2 000 px : `sips -Z 2000` sur la copie, jamais sur l'original.
- Texte trop petit : recadre par zones avec Pillow (agrandissement ×2) et lis chaque zone ; note les zones dans `pages/FXXX.csv`.
- Modèle Canva exporté en PNG numérotés : un seul document à plusieurs pages, même ID avec suffixe de page.
- `.webloc`, `.url` ou lien `canva.com` : non lisible localement ; inventaire avec statut « en ligne, non lu », demande d'export PDF en section 12 (Canva : Partager → Télécharger → PDF standard). Si un connecteur Canva est disponible dans Claude Code, utilise-le et signale-le en section 0.
- Une case à cocher, un cadre vide, une ligne pointillée ou un espace « Signature » est un champ, même sans libellé.

#### Recette plans (sans jamais charger une page en pleine résolution)

1. `pdfinfo` : pages, format en points (A3/A2/A1/A0), producteur (AutoCAD, Adobe, scanner).
2. `pdffonts` et `pdftotext -layout` : s'il y a des polices et du texte, le plan est vectoriel ou hybride ; relève cartouche (titre, échelle, date, dessinateur, indice), noms de rues et quartiers, et toute valeur ressemblant à une coordonnée Lambert (`X = 7xx xxx`, `Y = 4xx xxx`) ou à une grille.
3. `pdfimages -list` : un plan fait d'une seule grande image est une planche scannée (géoréférencement par points de contrôle nécessaire).
4. Un seul aperçu : `pdftoppm -r 40 -png -f 1 -l 1 "src/…" texte/FXXX-apercu`, lu pour légende, couleurs, présence du réseau, orientation. Cartouche illisible → recadre le coin du cartouche à 150 dpi (`pdftoppm -r 150 -x -y -W -H`), pas la page entière.
5. DXF : `ezdxf` pour les calques, `$INSUNITS`, `$EXTMIN`/`$EXTMAX`. DWG : non lisible sans conversion, demande d'export DXF en section 12.

### Étape 3 : rédaction et assemblage

- Rédige chaque section dans `sections/NN-nom.md` (`00-entete.md` … `13-controle.md`), ~600 lignes maximum par fichier ; au-delà, découpe (`04a-bordereau.md`, `04b-detail-estimatif.md`).
- Ne modifie jamais le livrable final à la main. Régénère-le : `cat ~/extraction-4500004453/sections/*.md > ~/Desktop/Suivi-fuites/references/regles-marche-4500004453.md`.
- Ordre de rédaction : 2, 4, 5, 6, 6 bis, 7, 3, 8, 9, 10, 10 bis, 11 bis, 11, 12, 13, puis 0 et 1 (ils récapitulent).
- Après chaque section terminée : `cd ~/Desktop/Suivi-fuites && git add references/regles-marche-4500004453.md && git commit -m "Règles du marché : section NN"`. Un seul fichier, plusieurs commits : c'est voulu, cela protège le travail. Le `push` reste à l'étape 5.

### Étape 4 : contrôle de complétude, par document, par un sous-agent neuf

Dès qu'une section couvrant un document est rédigée :
1. Lance un sous-agent au contexte vide avec uniquement : le chemin de `texte/FXXX.txt`, le chemin du PDF source pour les pages `visuel` ou `ocr` de `pages/FXXX.csv`, les chemins des sections qui couvrent ce document, et cette consigne : « Lis le texte source page par page. Pour chaque chiffre, délai, unité, prix, exception, renvoi à un autre article, mention manuscrite, total ou signature requise, vérifie qu'il figure dans la section. Pour les pages scannées ou les tableaux de prix, lis aussi l'image de la page. Écris la liste des omissions et des écarts dans `controle/FXXX-omissions.md` avec la page source. Ne corrige rien toi-même. Réponds en moins de 30 lignes. »
2. Intègre les omissions, puis passe le fichier au statut `vérifié` dans `etat.md`.

En fin de lot F, **croisements d'exploitabilité** (par script quand c'est possible) : chaque numéro de prix du bordereau a une règle de métré en section 5 et une ligne dans « saisie terrain → prix » ; chaque pénalité renvoie à un délai identifié ; chaque délai a une unité, un point de départ et une règle de suspension (ou « aucune ») ; chaque fiche de la section 8 indique où ses champs réapparaissent (état, attachement, facture) ; chaque champ de fiche a un nom canonique dans le dictionnaire 11 bis ; chaque fichier de l'inventaire a une colonne « couvert dans » renseignée. Les manques vont en section 12.

### Étape 5 : contrôle de forme, commit, push

- `wc -l -c` du livrable ; titres `## 0.` à `## 13.` présents et dans l'ordre ; table des matières à jour ; aucun chemin absolu `/Users/…` ; par script, les trois plus gros tableaux (bordereau, définition des prix, attachement) ont le même nombre de colonnes sur toutes leurs lignes.
- `git status --porcelain` ne doit lister que `references/regles-marche-4500004453.md`. Si `.claude/settings.local.json` apparaît, ne l'ajoute pas. Si un autre fichier apparaît (PDF, .txt, image, CSV), retire-le du dépôt sans toucher au dossier source.
- `git push origin main`. Si le push échoue (authentification, 2FA) : ni `--force`, ni changement d'URL distante, ni stockage de jeton ; laisse le commit local, affiche le message d'erreur exact et termine ; Issam fera le push.

### Plan du livrable

Chaque section commence par un résumé de trois lignes maximum et la liste de ses `[NON PRÉCISÉ]` les plus importants.

#### 0. En-tête, table des matières, guide de lecture
Date d'extraction, dossier source, nombre de fichiers, outils utilisés, limites rencontrées. Table des matières avec, par section, nombre de lignes et contenu. Guide de lecture en dix lignes : sections à lire pour le schéma (11 bis, 6 bis, 10 bis, 4, 5), pour les écrans tablette (8, 11), pour les exports et attachements (3-états, 7), pour les alertes (3-délais, 2).

#### 1. Inventaire des fichiers
Tableau de l'étape 1 : ID, chemin relatif, type, taille, pages ou feuilles, nature, texte ou scanné, langues, SHA-256 (8 caractères), statut normatif, couvert dans.

#### 2. Fiche d'identité du marché
Numéros distincts : appel d'offres, marché ou contrat, commande SAP (4500004453 en a la forme), engagement, code fournisseur STEPAG chez la SRM. Objet, maître d'ouvrage, titulaire, ville et périmètre, mode de passation, dates (notification, OS de démarrage, début, fin), durée. **Nature du marché** : prix unitaires, forfaitaire ou mixte ; ordinaire, cadre, reconductible, à bons de commande ; montants minimum et maximum HT et TTC et leur période de référence ; quantités du bordereau fermes ou prévisionnelles ; règle de fin (terme, épuisement du maximum, le premier des deux) ; reconduction, prolongation, variation dans la masse (seuils en plus et en moins, avenant ou OS requis). Montant HT et TTC, taux de TVA, devise, régime de révision ou d'actualisation des prix. Lots, intervenants, signataires, coordonnées génériques.

#### 3. CPS : règles contractuelles
Pour chaque article, dans l'ordre du document : titre, verbatim si l'article a un effet sur l'application, règles `R-CPS-…`. Tout autre article est résumé en une ligne. Couvrir obligatoirement :

- **Pièces constitutives et ordre de priorité** (verbatim) : quel document l'emporte en cas de contradiction entre acte d'engagement, CPS, bordereau, définition des prix ; quelle version fait foi.
- **Textes de référence et renvois externes** : CCAG applicable (CCAG-T, CCAG-EMO, règlement des achats de la SRM ou de l'ex-RADEEO) avec décret ou date ; article « Dérogations au CCAG » intégralement. Sous-section **3.x Renvois à des textes externes** : chaque « conformément au CCAG-T », « article X du règlement des achats », « norme NM… », avec l'article du CPS qui renvoie, ce que le renvoi régit, et si le CPS en reprend la substance ou s'il faut la demander (section 12). Pour les règles par défaut typiques non reprises dans le dossier (plafond des pénalités, retenue de garantie, cautionnement, variation dans la masse, prix nouveaux, attachements contradictoires) : une ligne « règle par défaut du CCAG, non vérifiée dans le dossier `[À CONFIRMER]` ».
- **Objet, consistance, périmètre** : définitions de détection, recherche, réparation, réfection ; inclus et exclus : fuites sur conduite, branchement, robinet, compteur, après compteur (domaine privé), vannes, ventouses, bouches à clé, ouvrages ; limites de diamètre ou de pression ; assainissement ; **fuites visibles signalées par la SRM ou les abonnés** contre **fuites invisibles détectées par STEPAG** : prix, délai et circuit propres à chacune ; si une fuite visible trouvée pendant le balayage donne droit au prix de détection.
- **Opérations annexes et qui les fait** : manœuvre des vannes et coupure d'eau (réservées à la SRM ?), avis aux abonnés, purge, désinfection, essai de pression ou remise en eau, analyse, remise en service ; autorisations de voirie et de la commune ; déclaration aux autres concessionnaires ; responsabilité des dégâts sur réseaux tiers ou chez un abonné.
- **Programme et rendement de la détection** : qui fixe secteurs ou tournées et leur ordre ; forme et périodicité du programme ; validation par la SRM ; cadence minimale (km de réseau par jour ou par mois, nombre d'équipes) ; nombre de passages ; campagnes nocturnes ou sectorisation et leurs livrables ; linéaire total du réseau et son découpage.
- **Caractérisation des fuites** : classes imposées (visible, invisible ; conduite, branchement ; débit faible, moyen, fort), méthode d'estimation du débit ou du volume récupéré, méthode de détection à consigner (corrélateur, géophone, gaz traceur, logger), marquage au sol exigé (couleur, code, photo), prime ou objectif lié au volume ou au nombre de fuites.
- **Signalement et circuit** : qui signale (SRM, équipe de dépannage, abonnés, agents STEPAG), par quel canal (OS, bon de commande, appel, SMS, courriel, fiche), avec quelle référence et quelle preuve admise de l'événement ; horaires, jours fériés, astreinte, urgences et leur critère de qualification.
- **Délais**, en tableau unique : `ID règle | Prestation ou obligation | Déclencheur exact | Délai | Unité (h/j) | Calendaire ou ouvrable (vendredis, dimanches, fériés inclus ?) | Fin du délai (fin de journée, heure) | Variante selon type de fuite, voirie, urgence | Pénalité liée | Source`. Plus : **suspension et neutralisation** (attente de manœuvre de vanne ou de coupure par la SRM, autorisation de voirie, réseaux tiers, intempéries), formalisme pour les faire reconnaître, effet sur les pénalités ; **interdictions horaires** (nuit, ramadan, grands axes) et plus-values associées.
- **Pénalités et retenues**, en tableau exhaustif, une ligne par pénalité où qu'elle figure : retard d'intervention, de réparation, de réfection, non remise d'une fiche ou d'un état, absence d'agent ou de matériel, absence de signalisation ou d'EPI, déblais non évacués, absence à une réunion, travaux non conformes, dépassement du délai global. Pour chacune : montant ou taux, unité de temps, assiette, point de départ, plafond individuel et global, mode de recouvrement, remise gracieuse, renvoi au CCAG. Un exemple chiffré par pénalité.
- **Confirmation de la fuite, fouilles négatives, tolérance de localisation** : définition d'une fuite confirmée ; distance tolérée par rapport au marquage ; sort d'une fouille blanche (payée, non payée, prix réduit) et qui supporte terrassement, réfection et pièces ; mention exigée sur la fiche.
- **Garantie des réparations** : délai par réparation ou global, point de départ ; reprise gratuite d'une fuite récidivante au même point et critères du « même point » ; conséquences sur l'attachement ; réparations provisoires.
- **Constat et attachements contradictoires** : mesure de la fouille et constat avant remblai, en présence de qui, délai de convocation, conséquence de l'absence du maître d'ouvrage ; preuves admises (mètre visible sur la photo, croquis coté) ; cahier ou journal de chantier ; qui établit, vérifie et signe l'attachement ; délai de contestation ; périodicité ; pièces à joindre.
- **États et rapports à fournir** : pour chaque état (journalier, hebdomadaire, mensuel, rapport par fuite, PV, constat) une fiche normalisée : `Nom exact | Périodicité et bornes (journée calendaire ? semaine lundi-dimanche ? mois calendaire ?) | Déclencheur ou heure limite | Destinataires (fonction exacte) | Support exigé (papier signé, Excel, PDF, e-mail, plateforme) | Langue | Signatures et visas | Statut normatif`, puis le tableau des colonnes **dans l'ordre** : `N° | Libellé exact | Type | Unité | Nom canonique (11 bis) | Regroupement ou total | Source`. Si le CPS exige un état sans modèle : `Modèle : [NON PRÉCISÉ] — mentions imposées par le texte : …`. **Photos** : nombre minimum par étape (avant, pendant, après), contenu visible (fuite, plaque de rue, compteur, tranchée, réfection finie), mentions obligatoires (date, heure, GPS, référence), format, présence dans un document signé. **Livrables ponctuels et de fin de marché** : rapport mensuel avec statistiques imposées, rapport final, base de données des fuites à remettre (format, champs), plans de récolement, PV de réunion, heure limite de remise de la fiche de fuite ou de l'état journalier, canal de remise.
- **Réceptions** : PV mensuels de validation, réception provisoire, réception définitive, qui signe, délais, réserves et levée.
- **Paiement et décompte** : structure du décompte provisoire (montant HT du mois, cumul, décomptes antérieurs, retenue de garantie avec taux, plafond, caution de remplacement et date de restitution, remboursement d'avance, pénalités déduites, révision ou actualisation avec formule, index, mois de référence et partie fixe, TVA par prix, net à payer en chiffres et en lettres) ; décompte dernier et définitif ; pièces justificatives ; **facture** : mentions imposées (numéro de commande SAP, engagement, marché, ICE et adresse de la SRM, service destinataire, code fournisseur), mode de dépôt, délai de paiement, intérêts moratoires.
- **Personnel, moyens, données exigées** : composition des équipes, qualifications, matériel de détection nommé (corrélateur, géophone, loggers, gaz traceur, débitmètre, enregistreur de pression, détecteur de canalisations, GPS) avec certificats à fournir ; véhicules, signalisation ; **système de coordonnées imposé** (Lambert Nord Maroc, Merchich, WGS84, décimal ou DMS) ; **formats de fichiers et destination exigés** (Excel, shapefile, KML, DWG, PDF ; SIG, GMAO ou SAP de la SRM, application imposée) ; moyens à mettre à disposition de la SRM.
- **Fournitures** : qui fournit les pièces (SRM sur bon de sortie magasin, ou STEPAG) ; procédure de retrait et de restitution des pièces déposées (compteurs, robinets, fonte, laiton) avec bons ; agrément des matériaux et marques ; si compteurs ou robinets avant compteur : numéros de série déposé et posé, index, plombage.
- **Engagements de l'offre** : si le dossier contient l'offre technique, le mémoire, la note méthodologique de STEPAG ou le règlement de consultation, tous les engagements chiffrés (équipes, matériel, délais, rapports, outil informatique) : ils ont valeur contractuelle.
- Sécurité, hygiène, environnement, déblais, remise en état ; sous-traitance, assurances, résiliation, litiges.

#### 4. Bordereau des prix
Tableau verbatim complet : `Ordre | Chapitre | N° prix | Désignation complète | Unité telle qu'écrite | Unité normalisée | Quantité | PU HT chiffres | PU HT lettres | Montant HT | Source`. Chapitres et sous-totaux ; prix « PM », à quantité nulle, optionnels ou en variante ; rabais de l'acte d'engagement et montant après rabais en chiffres et en lettres ; règle de priorité en cas d'écart ; taux de TVA par prix s'il n'est pas uniforme ; sous-détail des prix s'il existe ; totaux HT, TVA, TTC ; quantités fermes ou prévisionnelles ; écarts recalculés. Détail estimatif distinct reproduit aussi. Différences entre versions signalées.
En fin de section, un bloc ```csv produit par script depuis `notes/bordereau.csv` : `numero;designation;unite;quantite;pu_ht;montant_ht;source`.

#### 5. Définition des prix
Pour chaque numéro de prix : inclus, exclus, mode de métré, conditions d'application, prix liés, plafonds ou minimums, précision de mesure et règle d'arrondi de la quantité, quantité minimale facturable, règles d'inclusion et de non-cumul, mode de calcul imposé (L × l, L × l × P, largeur de tranchée forfaitaire selon le DN).
**Prix de détection et de recherche** : unité (km de réseau parcouru, fuite détectée, fuite confirmée après fouille, forfait mensuel par équipe, journée ou heure, campagne nocturne, secteur) ; mesure et validation du linéaire balayé ; détection payée pour une fuite visible ou seulement invisible, payée ou non si fouille négative ; pré-localisation, localisation précise et réparation : prix distincts ou prix unique ; prix par classe de débit ou type d'ouvrage ; forfaits de mobilisation, installation, repli.
**Prix de travaux** : tranches de diamètre, de profondeur (et comment la profondeur se mesure), de matériau (PEHD, PVC, fonte, acier, amiante-ciment, plomb), de type d'ouvrage et d'emplacement (chaussée, trottoir, terre-plein, terrain naturel) ; méthode de réparation (collier, manchon, remplacement de tronçon avec longueur incluse puis plus-value au ml ; par fuite ou par pièce) ; terrassement (dimensions forfaitaires ou réelles, déblai, remblai, compactage, apport de matériaux, évacuation des déblais et distance, blindage, pompage, démolition et sciage du revêtement, plus-value rocher ou nappe) ; réfection (prix par nature : enrobé à chaud, enrobé à froid, béton, pavés, carrelage, mosaïque, trottoir, bordures ; débord autour de la fouille ; épaisseur et couche de base ; surface minimale ; provisoire puis définitive ; cas d'exclusion) ; plus-values (nuit, vendredi ou férié, urgence, profondeur, distance, réseaux tiers) ; clause « toutes sujétions » recopiée et ce qui est au contraire rémunéré par un autre prix ; régie (heure ou journée d'équipe, camion, compresseur, pompe) ; **procédure hors bordereau** (prix nouveaux par OS, facture majorée, prix provisoires, qui approuve) ; règles d'arrondi.
Terminer par le tableau **« saisie terrain → prix »** et son bloc ```csv : `numero;mesures_a_relever;unite_saisie;formule_quantite;conditions;source`.

#### 6. Matériaux et articles
Tous les matériaux et fournitures cités dans l'ensemble des documents (manchons, robinets, tuyaux PEHD, colliers, raccords, vannes…) : diamètres, unités, normes ou agréments (NM, ISO, PN), numéro de prix de rattachement, qui fournit, compris dans un prix ou facturé à part, bon de sortie ou restitution, informations à relever à la pose (marque, DN, série, longueur). Signaler ceux sans prix au bordereau (hors bordereau probable).

#### 6 bis. Énumérations (listes de valeurs fermées)
Une table par liste, toutes ici et nulle part ailleurs (les autres sections renvoient au nom de la liste). Au minimum : type de fuite, ouvrage ou organe touché, matériau de conduite, diamètre nominal (tous les DN cités), nature de voirie ou de revêtement, type de réfection, nature du terrain, classe de profondeur, statut de la fuite, origine du signalement, type de prestation, fonction signataire, tournée, secteur, quartier. Colonnes : `Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source`. Chaque table est précédée de `Liste : FERMÉE` (la source énumère tout) ou `Liste : OUVERTE` (exemples, « etc. »). Listes de validation Excel relevées intégralement.

#### 7. Attachement modèle 2017 et pièces de paiement
Marqué `[2017]` partout. Structure exacte : en-têtes, colonnes, lignes, regroupements, cumul antérieur, quantités du mois, cumul à ce jour, PU, montants, références des fuites ou bons, numérotation, signatures et visas, annexes. Extrait verbatim représentatif et toutes les formules. Décompte, facture, état récapitulatif ou PV de 2017 décrits au même niveau de détail. Vérifier si une ligne par fuite (état récapitulatif, sous-détail) accompagne le tableau par prix et quelles colonnes elle porte.
**Règles de calcul** : rattachement au mois (quelle date fait foi : réparation, réfection, constat, visa SRM ; fuite réparée en M et refaite en M+1 ; fuites contestées ou non visées ; fouilles négatives ; reprises sous garantie ; date de clôture du mois, délai de remise) ; chaîne de calcul ligne par ligne avec ordre des opérations et arrondi à chaque étape (quantité du mois → cumul antérieur → cumul → montant HT ligne → total HT → TVA → TTC → retenue de garantie → avance → pénalités → révision → net à payer) ; l'attachement porte-t-il des cumuls et le décompte des différences, ou l'inverse ; régularisations d'un mois antérieur ; dépassement des quantités prévisionnelles.
**Exemple chiffré complet** recalculé par script sur trois lignes et un mois, cumul antérieur inclus, jusqu'au net à payer, avec toutes les valeurs intermédiaires : il servira de test unitaire.
**Table de passage 2017 → 2026** : `Prix 2017 (n°, désignation, unité) | Prix 2026 équivalent (n°) | Identique / modifié / sans équivalent | Commentaire`. Ce qui devra changer pour 2026.

#### 8. Fiches et modèles Canva
Pour chaque fiche ou modèle : nom, usage, support actuel (papier, Excel, Canva), numérotation, exemplaires, qui la remplit, quand, qui signe, statut normatif (`[CONTRACTUEL]` si le CPS impose la fiche ou son contenu, `[INTERNE]` sinon), maturité (validée ou brouillon). Puis la liste exhaustive des champs dans l'ordre : `N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type (texte, nombre, date, choix, case, photo, signature) | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source`. Tableaux reproduits. Champs calculés et règles implicites (« surface = longueur × largeur »). Commentaires et modifications suivies en `[brouillon]`.

#### 9. Plans
Par planche : ID, fichier, taille, zone ou quartier, échelle, format, système de coordonnées ou grille, légende, réseau dessiné ou non, date, source, vectoriel ou image, exploitable pour géoréférencement (vectoriel avec coordonnées / vectoriel sans / image). Synthèse des zones d'Oujda couvertes et de leur découpage (secteurs, tournées).

#### 10. Glossaire
Termes et abréviations de la SRM et du marché, en français et en arabe, avec définition ; équivalences d'unités.

#### 10 bis. Identifiants, références et numérotations
Toutes les références manipulées : référence de fuite SRM, numéro de tournée, code secteur, zone de distribution ou étage de pression, quartier, numéro d'OS, de bon de commande ou de travail, d'ordre de travail ou d'avis SAP, de police ou d'abonné, de compteur, de fiche STEPAG, de fiche SRM, de fuite imposé, de marquage au sol, d'attachement, de décompte, de facture, de planche. Colonnes : `Référence | Émetteur | Format exact ou motif | Exemples réels (3 au moins) | Portée d'unicité | Qui l'attribue et quand | Obligatoire sur quels documents | Source`. Format non défini → `[NON PRÉCISÉ]` et question en section 12.

#### 11. Règles dérivées pour l'application
Synthèse orientée développement, chaque règle `R-DER-…` reliée à ses sources. **Cycle de vie** en tableau de transitions : `État de départ | Événement | Acteur (fonction exacte) | Document ou visa produit | Données obligatoires à cet instant (noms canoniques) | Délai déclenché (ID) | État d'arrivée | Source`, en distinguant les états `[CONTRACTUEL]` des états de travail `[INTERNE]`, rapprochés des statuts du CLAUDE.md avec les écarts. Données à saisir à chaque étape ; calculs et unités ; contrôles de cohérence ; délais et seuils d'alerte ; exports et états avec leur contenu exact ; structure de l'attachement mensuel et règle de rattachement au mois ; identifiants SRM obligatoires par document ; **suivi du montant cumulé des attachements par rapport au montant du marché** (et minimum-maximum) avec les seuils d'alerte qui en découlent ; dépassement des quantités prévisionnelles par prix.

#### 11 bis. Dictionnaire de données consolidé
Une seule table, une ligne par donnée élémentaire rencontrée dans n'importe quel document : `Nom canonique proposé (snake_case) | Libellés rencontrés FR (tous, séparés par ;) | Libellé AR | Entité (fuite, intervention, réfection, agent, équipe, attachement, ligne d'attachement, OS, secteur, tournée…) | Type (texte, entier, décimal(p,s), date, datetime, booléen, énumération <liste 6 bis>, photo, signature, géopoint) | Unité | Obligatoire (oui / non / condition) | Qui la saisit et à quelle étape | Documents où elle apparaît (F005 fiche ; F009 état col. 4 ; F007 attachement col. C) | Alimente le(s) prix n° | Source`. Une donnée absente de ce tableau n'existera pas dans la base. Terminer par les cardinalités observées, sourcées (« une fuite a 0..n interventions », « un attachement couvre un mois et un seul », « une ligne d'attachement correspond à un prix et un seul ») ; `[NON PRÉCISÉ]` sinon.

#### 12. Points ambigus, contradictions et questions
Chaque question `Q-01`, `Q-02`… référence les règles (`R-…`) et sources concernées, son destinataire (SRM ou Issam), son impact (schéma, calcul, écran, export) et une **hypothèse par défaut** pour développer sans attendre la réponse. Inclure tous les `[À CONFIRMER]`, `[NON PRÉCISÉ]` importants, `[CONTRADICTION]`, exports à demander (Canva, Pages, DWG), renvois externes non résolus.

#### 13. Journal de contrôle de complétude
Fichiers couverts, secondes lectures faites, pages `[OCR vérifié]`, pages illisibles, divergences entre extractions, écarts de totaux, croisements d'exploitabilité, contrôle de forme.

### Quand tu as terminé

Affiche : nombre de lignes et taille du livrable, liste des sections avec leur taille, fichiers non exploitables, les questions de la section 12, et le résultat du `git push` (ou le message d'erreur exact).
