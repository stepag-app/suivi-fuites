# Règles du marché n° 4500004453 : détection, recherche et réparation de fuites (SRM Oriental / STEPAG, Oujda)

## 0. En-tête, table des matières, guide de lecture

**Résumé.** Ce fichier rassemble toutes les règles tirées du dossier du marché n° 4500004453 (appel d'offres n° 10008883/1R) : pièces contractuelles, bordereau, modèles de 2017 et gabarits STEPAG. Il est destiné à une session de développement qui n'a pas accès aux documents d'origine. Chaque règle porte un identifiant (`R-…`), un statut normatif et sa source (`[F056 p.23]`).

**À retenir avant de lire.** Le marché n'est pas un simple marché de réparation à la demande : c'est un marché de performance en trois phases (balayage de 1466 km en 4 mois, puis deux phases de maintien de 4 mois), payé au mètre balayé et maintenu sous condition de débits nocturnes par zone, plus des réparations à l'unité. Le CPS ne fixe **aucun délai de réparation par fuite** ; il ne définit ni modèle de fiche, ni exigence de photos, ni format de données.

| Élément | Valeur |
|---|---|
| Date d'extraction | 2026-10-04 |
| Dossier source | dossier du marché sur le poste de STEPAG (lecture seule, jamais versionné) : 127 fichiers retenus, 15 exclus, 376 Mo |
| Livrable | ce fichier unique ; environ 3693 lignes |
| Outils utilisés | pdftotext, pdfinfo, pdftoppm, pdfimages, pdffonts (poppler) ; tesseract et ocrmypdf (fra+ara) ; pandoc ; textutil ; openpyxl, xlrd, python-docx, Pillow (Python) ; lecture visuelle des pages scannées, des tableaux et des plans ; sous-agents pour les documents longs et les secondes lectures |
| Limites rencontrées | dessin AutoCAD (DWG, 162,8 Mo) et sa sauvegarde non lisibles ; fichiers .xls lus en valeurs seules (formules non accessibles) ; ocrmypdf refusé sur les PDF signés (repli : pdftoppm + tesseract) ; aucun modèle Canva dans le dossier (connecteur Canva non utilisé) ; exemplaire du marché signé par la SRM absent |
| Pré-requis | tous les outils présents ; push à blanc réussi au démarrage |

### Statuts normatifs et marqueurs

| Marque | Sens |
|---|---|
| `[CONTRACTUEL]` | CPS, bordereau, définition des prix, acte d'engagement, ordres de service, règlement de consultation du marché 4500004453 |
| `[2017]` | hérité de l'ancien marché n° 59/E/2016 : utile pour la forme, jamais pour les prix, délais ou références |
| `[INTERNE]` | gabarit ou pratique STEPAG, non imposé par le client |
| `[DÉDUIT]` | interprétation ou calcul de l'extracteur |
| `[À CONFIRMER : raison]` | source ambiguë ou illisible |
| `[NON PRÉCISÉ]` | les documents ne disent rien |
| `[CONTRADICTION : A vs B]` | deux sources divergent |

Préfixes des règles : `R-ID` (section 2), `R-CPS` (3), `R-BPU` (4), `R-DEF` (5), `R-MAT` (6), `R-ATT` (7), `R-FICHE` (8), `R-PLAN` (9), `R-IDF` (10 bis), `R-DER` (11). Questions `Q-01` à `Q-41` et contradictions `C-01` à `C-10` en section 12. Les articles du CPS sont cités `art. I-n` (clauses administratives) et `art. II-n` (prescriptions spéciales) car la numérotation recommence.

### Table des matières

| Section | Titre | Lignes | Contenu |
|---|---|---|---|
| 0 | En-tête, table des matières, guide de lecture | 60 | ce préambule |
| 1 | Inventaire des fichiers | 146 | les 127 fichiers du dossier : identifiant, nature, statut normatif, section qui les couvre |
| 2 | Fiche d'identité du marché | 124 | numéros, parties, dates, nature et montants du marché, intervenants |
| 3 | CPS : règles contractuelles | 1295 | CPS article par article (citations et règles R-CPS), renvois externes, délais, pénalités, états et rapports, paiement, moyens |
| 4 | Bordereau des prix | 113 | bordereau des 13 prix, totaux, recalcul, bloc CSV |
| 5 | Définition des prix | 225 | définition de chaque prix, règles de métré, tableau « saisie terrain → prix » et CSV |
| 6 | Matériaux et articles | 313 | matériaux contractuels et catalogue interne de 266 pièces |
| 6 bis | Énumérations (listes de valeurs fermées) | 261 | toutes les listes de valeurs (zones, secteurs, revêtements, ouvrages, statuts…) |
| 7 | Attachement modèle 2017 et pièces de paiement | 316 | modèle 2017 : bordereau, chaîne de calcul, attachement, décompte, état de suivi, facture, table de passage, exemple chiffré |
| 8 | Fiches et modèles Canva | 291 | gabarits STEPAG actuels champ par champ : rapport journalier, fiche de réparation, rapport mensuel, classeur d'attachement |
| 9 | Plans | 73 | les 21 planches et le dessin AutoCAD |
| 10 | Glossaire | 108 | termes, abréviations, équivalences d'unités |
| 10 bis | Identifiants, références et numérotations | 39 | formats des numéros et références |
| 11 | Règles dérivées pour l'application | 119 | cycle de vie, saisies par étape, calculs, contrôles, alertes, exports, suivi financier |
| 11 bis | Dictionnaire de données consolidé | 126 | dictionnaire de données et cardinalités |
| 12 | Points ambigus, contradictions et questions | 84 | 41 questions avec hypothèse par défaut, contradictions, pièces à demander |

### Guide de lecture

1. **Pour le schéma de base de données** : sections 11 bis (dictionnaire et cardinalités), 6 bis (énumérations), 10 bis (formats d'identifiants), 4 (prix) et 5 (règles de métré et tableau « saisie terrain → prix »).
2. **Pour les écrans de la tablette** : sections 8 (champs des fiches actuelles) et 11 (cycle de vie, données par étape, contrôles de saisie).
3. **Pour les exports et les attachements** : sections 3.14 (états et rapports exigés), 3.16 (paiement et décompte), 7 (modèle d'attachement, de décompte et de facture, exemple chiffré servant de test) et 8.4 (classeur d'attachement actuel).
4. **Pour les alertes** : sections 3.9 (tableau unique des délais), 3.10 (pénalités), 11.5 (seuils d'alerte) et 2.3 (dates du marché).
5. **Pour la carte** : sections 9 (planches et dessin AutoCAD), 6 bis (zones et secteurs) et 3.3 (tableau n° 1 : linéaires et débits par zone).
6. **Avant toute décision de conception** : section 12 ; chaque question a une hypothèse par défaut qui permet d'avancer.
7. Les blocs ```csv des sections 4 et 5 sont directement importables (séparateur point-virgule, point décimal).
8. Les citations en retrait (`>`) reproduisent le texte du CPS tel quel, fautes comprises ; les règles qui suivent chaque citation en sont la traduction.
9. Tout ce qui porte `[2017]` décrit un autre marché : s'en servir comme modèle de forme uniquement, via la table de passage 7.9.
10. Fiabilité : section 13 (pages lues, secondes lectures, écarts recalculés).

## 1. Inventaire des fichiers

**Résumé.** 127 fichiers inventoriés (142 fichiers physiques, dont 15 exclus : `.DS_Store`, `Thumbs.db` et verrous Office `~$`), 376 Mo, dont 326 Mo pour le dessin AutoCAD et sa sauvegarde. Identifiants `F001` à `F127` attribués par ordre alphabétique du chemin relatif. Un doublon exact (F041 = F029) ; un fichier vide (F007) ; deux factures de contenu identique (F072, F075) ; une archive qui duplique les plans (F110).

**Principaux `[NON PRÉCISÉ]`.** Fichiers non exploitables : F125 et F124 (DWG et sauvegarde, non lisibles sans conversion) ; F007 (vide). Aucun modèle Canva.

Colonne « Pages ou feuilles » : nombre de pages (PDF) ou de feuilles (classeurs) lues, d'après le journal de lecture. SHA-256 : huit premiers caractères.

| ID | Chemin relatif | Type | Taille (octets) | Pages ou feuilles | Nature | Texte ou scanné | Langues | SHA-256 (8) | Statut normatif | Couvert dans |
|---|---|---|---|---|---|---|---|---|---|---|
| F001 | Attachement N°1 mois 10.xlsx | xlsx | 261513 | 9 | attachement (classeur STEPAG 2026) | classeur | fr ; ar (en-tête) | e5673aa4 | interne STEPAG en préparation | 8.4 ; 6.2 ; 6 bis ; 10 bis ; 11 bis |
| F002 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Cautions/caution_provisoire_1399641.pdf | pdf | 104808 | 2 | caution ou assurance | texte (p.1) ; scanné (p.2) | fr | 61dea06a | contractuel signé | 2.1 |
| F003 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Déclaration sur l'honneur.docx | docx | 20522 | 1 | autre (déclaration sur l'honneur) | texte | fr | f8641ce7 | contractuel signé | 2 ; 13 |
| F004 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Déclaration sur l'honneur.pdf | pdf | 249934 | 1 | autre (déclaration sur l'honneur) | texte | fr | 2ff9f5be | contractuel signé | 2 ; 13 |
| F005 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Déclaration sur l'honneur.pdf - 20260812193523 - Signature 1.xml | xml | 7736 | 1 | autre (preuve de signature électronique XML) | texte | — | cf777fa0 | référence externe | 13 |
| F006 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Statut + pv/changements de siège 2024 + documents annexes.pdf | pdf | 2225186 | 6 | autre (statuts et PV de la société) | scanné (OCR) | fr ; ar | 16d2f76a | référence externe | 13 |
| F007 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Statut + pv/changements de siège 2024 + documents annexes.pdf - 20260812193515 - Signature 1.xml | xml | 0 | 1 | autre (preuve de signature électronique, vide) | vide, non exploitable | — | e3b0c442 | référence externe | 13 |
| F008 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Statut + pv/STATUT MIS A JOUR 2023.pdf | pdf | 7510229 | 13 | autre (statuts et PV de la société) | scanné (OCR) | fr ; ar | 7f1839c6 | référence externe | 13 |
| F009 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier administratif/Statut + pv/STATUT MIS A JOUR 2023.pdf - 20260812193507 - Signature 1.xml | xml | 7748 | 1 | autre (preuve de signature électronique XML) | texte | — | 8f87c994 | référence externe | 13 |
| F010 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Attestation CA 2023.pdf | pdf | 45557 | 1 | autre (attestation de chiffre d'affaires) | texte | fr ; ar | d1f2930c | référence externe | 13 |
| F011 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Attestation CA 2023.pdf - 20260812193548 - Signature 1.xml | xml | 7721 | 1 | autre (preuve de signature électronique XML) | texte | — | 564c56df | référence externe | 13 |
| F012 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Attestation CA 2024 1.pdf | pdf | 127631 | 1 | autre (attestation de chiffre d'affaires) | texte | fr ; ar | 74b4c31d | référence externe | 13 |
| F013 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Attestation CA 2024 1.pdf - 20260812193556 - Signature 1.xml | xml | 7725 | 1 | autre (preuve de signature électronique XML) | texte | — | 64ada013 | référence externe | 13 |
| F014 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Attestation CA 2025.pdf | pdf | 45600 | 1 | autre (attestation de chiffre d'affaires) | texte | fr ; ar | 33e40d92 | référence externe | 13 |
| F015 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Attestation CA 2025.pdf - 20260812193604 - Signature 1.xml | xml | 7721 | 1 | autre (preuve de signature électronique XML) | texte | — | 89f14021 | référence externe | 13 |
| F016 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/ATTESTATION DE REFERENCE 65-E-2022.pdf | pdf | 485983 | 1 | autre (attestation de référence) | scanné (lu visuellement) | fr ; ar (en-tête) | ec066dfb | référence externe | 13 ; 6 bis |
| F017 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/ATTESTATION DE REFERENCE 65-E-2022.pdf - 20260812193531 - Signature 1.xml | xml | 7738 | 1 | autre (preuve de signature électronique XML) | texte | — | 6d6db55a | référence externe | 13 |
| F018 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/ATTESTATION DE REFRENCE Amendis.pdf | pdf | 346077 | 1 | autre (attestation de référence) | scanné (lu visuellement) | fr ; ar (en-tête) | 50fcb671 | référence externe | 13 ; 6 bis |
| F019 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/ATTESTATION DE REFRENCE Amendis.pdf - 20260812193540 - Signature 1.xml | xml | 7735 | 1 | autre (preuve de signature électronique XML) | texte | — | 555d4c04 | référence externe | 13 |
| F020 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Note des moyens humains.pdf | pdf | 191891 | 1 | offre technique ou mémoire (notes des moyens) | texte ; classeur | fr | 2b5df694 | contractuel signé | 3.19 |
| F021 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Note des moyens humains.pdf - 20260812193612 - Signature 1.xml | xml | 7727 | 1 | autre (preuve de signature électronique XML) | texte | — | 092e2f89 | référence externe | 13 |
| F022 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Note des moyens humains.xlsx | xlsx | 25774 | 1 | offre technique ou mémoire (notes des moyens) | texte ; classeur | fr | 3222ae5c | contractuel signé | 3.19 |
| F023 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Note des moyens matériels.pdf | pdf | 202235 | 1 | offre technique ou mémoire (notes des moyens) | texte ; classeur | fr | a58ffc10 | contractuel signé | 3.19 |
| F024 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Note des moyens matériels.pdf - 20260812193620 - Signature 1.xml | xml | 7734 | 1 | autre (preuve de signature électronique XML) | texte | — | 7ff85fcf | référence externe | 13 |
| F025 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/Note des moyens matériels.xlsx | xlsx | 27272 | 1 | offre technique ou mémoire (notes des moyens) | texte ; classeur | fr | 2f570e3c | contractuel signé | 3.19 |
| F026 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/plan de charge.docx | docx | 18589 | 1 | offre technique ou mémoire (plan de charge) | texte | fr | bb105f6a | contractuel signé | 2.1 ; 3.19 |
| F027 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/plan de charge.pdf | pdf | 219932 | 1 | offre technique ou mémoire (plan de charge) | texte | fr | ae4486bf | contractuel signé | 2.1 ; 3.19 |
| F028 | DAO 10008883-1R/01 - Dossier de l'enveloppe/dossier technique/plan de charge.pdf - 20260812193640 - Signature 1.xml | xml | 7716 | 1 | autre (preuve de signature électronique XML) | texte | — | 5c798e31 | référence externe | 13 |
| F029 | DAO 10008883-1R/02 - Dossier d'offre financiére/Acte d'engagement.docx | docx | 21088 | 1 | acte d'engagement | texte | fr | c08866ae | contractuel signé | 2 |
| F030 | DAO 10008883-1R/02 - Dossier d'offre financiére/Acte d'engagement.pdf | pdf | 187868 | 1 | acte d'engagement | texte | fr | 9f79503e | contractuel signé | 2 |
| F031 | DAO 10008883-1R/02 - Dossier d'offre financiére/Acte d'engagement.pdf - 20260812193704 - Signature 1.xml | xml | 7706 | 1 | autre (preuve de signature électronique XML) | texte | — | 8761decc | référence externe | 13 |
| F032 | DAO 10008883-1R/02 - Dossier d'offre financiére/P.3.2 BP majoration.pdf | pdf | 278375 | 1 | bordereau des prix (offre signée) | texte | fr | eb07d011 | contractuel signé | 4 |
| F033 | DAO 10008883-1R/02 - Dossier d'offre financiére/P.3.2 BP majoration.pdf - 20260812193712 - Signature 1.xml | xml | 7710 | 1 | autre (preuve de signature électronique XML) | texte | — | bca31bd4 | référence externe | 13 |
| F034 | DAO 10008883-1R/02 - Dossier d'offre financiére/P.3.2 BP majoration.xlsx | xlsx | 14553 | 1 | bordereau des prix (classeur) | classeur | fr | 099c73d9 | contractuel non signé | 4 |
| F035 | DAO 10008883-1R/Arrivées/NOTIFICATION DE L'APPROBATION.pdf | pdf | 365042 | 1 | ordre de service | scanné (lu visuellement) | fr ; ar (en-tête) | eebe5dc4 | contractuel signé | 2 |
| F036 | DAO 10008883-1R/Arrivées/OS DE COMMENCEMENT 02-10-2026.pdf | pdf | 342484 | 1 | ordre de service | scanné (lu visuellement) | fr ; ar (en-tête) | 26a16d4e | contractuel signé | 2 |
| F037 | DAO 10008883-1R/Arrivées/STE STEPAG- AO 10008883-1R.pdf | pdf | 366319 | 1 | courrier ou notification | scanné avec couche OCR (vérifié visuellement) | fr ; ar (en-tête) | 8de7f40b | contractuel signé | 2 |
| F038 | DAO 10008883-1R/Avis d'insertion/Avis d'insertion arabe.pdf | pdf | 1177117 | 1 | autre (avis d'appel d'offres, version arabe) | texte | ar | 230314d2 | référence externe | 2.3 ; 12.4 |
| F039 | DAO 10008883-1R/Avis d'insertion/Avis d'insertion français.pdf | pdf | 433932 | 1 | autre (avis d'appel d'offres) | texte | fr | 472e334e | référence externe | 2.3 |
| F040 | DAO 10008883-1R/complement dossier/Acte d'engagement- rectifié.pdf | pdf | 491141 | 1 | acte d'engagement | texte | fr | 815e1631 | contractuel signé | 2 |
| F041 | DAO 10008883-1R/complement dossier/Acte d'engagement- rectié.docx | docx | 21088 | 1 | acte d'engagement (doublon exact de F029) | texte | fr | c08866ae | contractuel signé | 2 |
| F042 | DAO 10008883-1R/complement dossier/Attestation de lASMP 2026-08-11.pdf | pdf | 94045 | 1 | autre (attestations CNSS, fiscale, registre de commerce) | texte | fr ; ar | dff85399 | référence externe | 13 |
| F043 | DAO 10008883-1R/complement dossier/ATTESTATION STEPAG MARCHES PUBLICS 14-05-2026.pdf | pdf | 159089 | 1 | autre (attestations CNSS, fiscale, registre de commerce) | texte | fr ; ar | 3d1fab06 | référence externe | 13 |
| F044 | DAO 10008883-1R/complement dossier/Déclaration sur l'honneur - rectifiée.docx | docx | 20665 | 1 | autre (déclaration sur l'honneur) | texte | fr | 833be3d4 | contractuel signé | 2 ; 13 |
| F045 | DAO 10008883-1R/complement dossier/Déclaration sur l'honneur - rectifiée.pdf | pdf | 489453 | 1 | autre (déclaration sur l'honneur) | texte | fr | 263c2d4a | contractuel signé | 2 ; 13 |
| F046 | DAO 10008883-1R/complement dossier/RC modèle 9 au 2026-08-13.pdf | pdf | 331304 | 1 | autre (attestations CNSS, fiscale, registre de commerce) | texte | fr ; ar | 64c39622 | référence externe | 13 |
| F047 | DAO 10008883-1R/complement dossier/RIB STEPAG -  BQ SAHAM.pdf | pdf | 179282 | 1 | autre (RIB, non recopié) | scanné (OCR) | fr | 51a4ffb9 | référence externe | 13 |
| F048 | DAO 10008883-1R/Dossier administratif/ATTESTATION D'enregistrement.PDF | pdf | 156896 | 1 | autre (enregistrement du marché) | texte | fr ; ar | 6b19b71b | contractuel signé | 2.1 ; 2.4 |
| F049 | DAO 10008883-1R/Dossier administratif/ORDRE_RECETTE1789487043337.pdf | pdf | 184620 | 1 | autre (enregistrement du marché) | texte | fr ; ar | a45d43dd | contractuel signé | 2.1 ; 2.4 |
| F050 | DAO 10008883-1R/Départ/Bordereau d'envoi - Attestation d'assurance AT+RC+auto.docx | docx | 33591 | 1 | courrier ou notification (départ STEPAG) | texte | fr ; ar (en-tête) | cc1ae0a7 | interne STEPAG en préparation | 8.5 ; 2.1 |
| F051 | DAO 10008883-1R/Départ/Bordereau d'envoi - Caution définitive.docx | docx | 33542 | 1 | courrier ou notification (départ STEPAG) | texte | fr ; ar (en-tête) | cc247435 | interne STEPAG en préparation | 8.5 ; 2.1 |
| F052 | DAO 10008883-1R/Départ/Bordereau d'envoi - Dépôt Droits d'enregitrement.docx | docx | 33450 | 1 | courrier ou notification (départ STEPAG) | texte | fr ; ar (en-tête) | 7e2e9e7e | interne STEPAG en préparation | 8.5 ; 2.1 |
| F053 | DAO 10008883-1R/Départ/Demande de caution déf Marché.docx | docx | 37822 | 1 | courrier ou notification (départ STEPAG) | texte | fr ; ar (en-tête) | 60d5f0f4 | interne STEPAG en préparation | 8.5 ; 2.1 |
| F054 | DAO 10008883-1R/P.1 RC.pdf | pdf | 816843 | 17 | règlement de consultation | texte | fr | feee2746 | contractuel signé | 3.19 ; 2 ; 4 |
| F055 | DAO 10008883-1R/P.1 RC.pdf - 20260812194456 - Signature 1.xml | xml | 7650 | 1 | autre (preuve de signature électronique XML) | texte | — | 3c6f5977 | référence externe | 13 |
| F056 | DAO 10008883-1R/P.2 CPS.pdf | pdf | 1324434 | 30 | CPS | texte (p.20 blanche) | fr | 6068ef2c | contractuel signé | 2 ; 3 ; 5 |
| F057 | DAO 10008883-1R/P.2 CPS.pdf - 20260812194515 - Signature 1.xml | xml | 7651 | 1 | autre (preuve de signature électronique XML) | texte | — | 239ef438 | référence externe | 13 |
| F058 | DAO 10008883-1R/P.3.1 BP rabais.pdf | pdf | 300105 | 4 | bordereau des prix (modèle) | texte | fr | 6fed1fb1 | contractuel non signé | 4 |
| F059 | DAO 10008883-1R/P.3.2 BP 10008883-1R majoration.xlsx | xlsx | 15588 | 1 | bordereau des prix (classeur) | classeur | fr | 3a6b0692 | contractuel non signé | 4 |
| F060 | DAO 10008883-1R/P.3.2 BP majoration.pdf | pdf | 300128 | 4 | bordereau des prix (modèle) | texte | fr | 64b44f30 | contractuel non signé | 4 |
| F061 | DAO 10008883-1R/P.4 Modèle déclaration sur l'honneur.docx | docx | 24796 | 1 | autre (modèles du dossier d'appel d'offres) | texte | fr | 0558aba2 | contractuel non signé | 13 |
| F062 | DAO 10008883-1R/P.5 Modèle acte d'engagement.docx | docx | 21763 | 1 | autre (modèles du dossier d'appel d'offres) | texte | fr | bfe3e004 | contractuel non signé | 13 |
| F063 | DAO 10008883-1R/P.6 Modèle déclaration plan de charge.docx | docx | 20026 | 1 | autre (modèles du dossier d'appel d'offres) | texte | fr | 3226f9b3 | contractuel non signé | 13 |
| F064 | LOGO-SRM.png | png | 51285 | 1 | image ou photo (logo) | image | — | bc584aeb | référence externe | 13 |
| F065 | Marché Détécton et réparation de fuites année 2017/Attachement réparation de fuites + Mouvements matériel.xlsx | xlsx | 1033043 | 8 | attachement 2017 | classeur | fr | ba4e8fa8 | historique autre marché | 7 |
| F066 | Marché Détécton et réparation de fuites année 2017/BP 59 E 2016 RAADEEO.xls | xls | 54272 | 1 | bordereau des prix (2017) | classeur (.xls) | fr | 113f13e9 | historique autre marché | 7.2 |
| F067 | Marché Détécton et réparation de fuites année 2017/contrat STEPAG AFW.docx | docx | 60694 | 1 | autre (sous-traitance AFW 2017) | texte ; classeur | fr | 0952d4b4 | historique autre marché | 7.1 |
| F068 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/Attachement + Décompte N°1.xlsx | xlsx | 1183158 | 15 | attachement 2017 et décompte | classeur | fr | 0d08a1c7 | historique autre marché | 7 |
| F069 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/attachement radeeo/Attachement + Décompte N°1 (1).xlsx | xlsx | 1328396 | 15 | attachement 2017 et décompte | classeur | fr | 0fcde2ff | historique autre marché | 7 |
| F070 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/attachement radeeo/Bordereau MARCHE  RADEEO (1).doc | doc | 44032 | 1 | courrier ou notification (2017) | texte | fr | 9afe3442 | historique autre marché | 7.1 |
| F071 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/attachement radeeo/Etat de suivi Recap 59-E-16 (1).xls | xls | 54784 | 1 | état modèle SRM (2017 : état de suivi, suivi du délai) | classeur (.xls) | fr | db37c38a | historique autre marché | 7.6 |
| F072 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/attachement radeeo/facture RADEEO (1).xls | xls | 67072 | 1 | décompte ou facture 2017 | classeur (.xls) | fr | 6083e3c6 | historique autre marché | 7.6 |
| F073 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/attachement radeeo/FICHE SUIVI DELAI 59-E-16.xls | xls | 21504 | 1 | état modèle SRM (2017 : état de suivi, suivi du délai) | classeur (.xls) | fr | 4ac24d44 | historique autre marché | 7.6 |
| F074 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/FACTURE  STEPAG.xls | xls | 70656 | 1 | décompte ou facture 2017 | classeur (.xls) | fr | 4d370d3f | historique autre marché | 7.6 |
| F075 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/facture RADEEO.xls | xls | 67072 | 1 | décompte ou facture 2017 | classeur (.xls) | fr | 7fc807cc | historique autre marché | 7.6 |
| F076 | Marché Détécton et réparation de fuites année 2017/Detection de fuite AFW/Fiche de réparation de fuites + Mouvements matériel + attachement (2).xlsx | xlsx | 1008935 | 9 | attachement 2017 et décompte | classeur | fr | cebb966e | historique autre marché | 7 |
| F077 | Marché Détécton et réparation de fuites année 2017/Dossier AO MARCHE N°59-E-2016 travaux de detection de fuites/MARCHE N°59-E-2016 travaux de detection de fuites/1 marché59.doc | doc | 439296 | 1 | CPS (marché 2017) | texte | fr | cb23218d | historique autre marché | 7 ; 3 (mentions [2017]) |
| F078 | Marché Détécton et réparation de fuites année 2017/Dossier AO MARCHE N°59-E-2016 travaux de detection de fuites/MARCHE N°59-E-2016 travaux de detection de fuites/2-BP.xls | xls | 40960 | 1 | bordereau des prix (2017) | classeur (.xls) | fr | 5161c74e | historique autre marché | 7.2 |
| F079 | Marché Détécton et réparation de fuites année 2017/Dossier AO MARCHE N°59-E-2016 travaux de detection de fuites/MARCHE N°59-E-2016 travaux de detection de fuites/3. derniére page.doc | doc | 45056 | 1 | CPS (marché 2017) | texte | fr | 88b0ffd7 | historique autre marché | 7 ; 3 (mentions [2017]) |
| F080 | Marché Détécton et réparation de fuites année 2017/Détail quantitatif Réparation + réfection.xls | xls | 203264 | 3 | attachement 2017 (prototype et fiche de fuite) | classeur (.xls) | fr | b3b373e5 | historique autre marché | 7.7 |
| F081 | Marché Détécton et réparation de fuites année 2017/en tete afw .doc | doc | 39936 | 1 | autre (sous-traitance AFW 2017) | texte ; classeur | fr | 25bd9cd2 | historique autre marché | 7.1 |
| F082 | Marché Détécton et réparation de fuites année 2017/essai AFW.xlsx | xlsx | 460437 | 3 | autre (essai de carottage ; mesure de débit 2017) | classeur | fr | 4ff0e9cc | historique autre marché | 7.1 |
| F083 | Marché Détécton et réparation de fuites année 2017/facture n°1 à affair of the water.xlsx | xlsx | 41222 | 4 | autre (sous-traitance AFW 2017) | texte ; classeur | fr | c8cb4cdc | historique autre marché | 7.1 |
| F084 | Marché Détécton et réparation de fuites année 2017/Fiche de réparation de fuites + Mouvements matériel + attachement.xlsx | xlsx | 699741 | 8 | attachement 2017 | classeur | fr | 4d817342 | historique autre marché | 7 |
| F085 | Marché Détécton et réparation de fuites année 2017/Fiche de réparation de fuites + Mouvements matériel.xlsx | xlsx | 809363 | 7 | attachement 2017 | classeur | fr | c1dcd377 | historique autre marché | 7 |
| F086 | Marché Détécton et réparation de fuites année 2017/Mesure/Riadi.xlsx | xlsx | 51502 | 3 | autre (essai de carottage ; mesure de débit 2017) | classeur | fr | 5d3b6168 | historique autre marché | 7.1 |
| F087 | Marché Détécton et réparation de fuites année 2017/Rapport journalier vide.xlsx | xlsx | 53328 | 1 | fiche (rapport journalier 2017) | classeur | fr | 4bd8d6fc | historique autre marché | 7.7 |
| F088 | Marché Détécton et réparation de fuites année 2017/Rapports hebdomadaires/Rapports hebdomadaires détéction de fuites.xlsx | xlsx | 83830 | 5 | fiche (rapport hebdomadaire 2017) | classeur | fr | 64a87581 | historique autre marché | 7.7 |
| F089 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers A. Guennoun.xlsx | xlsx | 82836 | 7 | fiche (rapport journalier 2017) | classeur | fr | 15316586 | historique autre marché | 7.7 |
| F090 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers Jawhara.xlsx | xlsx | 64104 | 3 | fiche (rapport journalier 2017) | classeur | fr | 475dd117 | historique autre marché | 7.7 |
| F091 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers Lazaret Haut - repasse.xlsx | xlsx | 72813 | 5 | fiche (rapport journalier 2017) | classeur | fr | e4068fe7 | historique autre marché | 7.7 |
| F092 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers Lazaret Haut.xlsx | xlsx | 113018 | 13 | fiche (rapport journalier 2017) | classeur | fr | ff5bebd3 | historique autre marché | 7.7 |
| F093 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers Mchiwer.xlsx | xlsx | 53406 | 1 | fiche (rapport journalier 2017) | classeur | fr | 9161fdf7 | historique autre marché | 7.7 |
| F094 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers Si Lakhder.xlsx | xlsx | 71165 | 4 | fiche (rapport journalier 2017) | classeur | fr | aff98c70 | historique autre marché | 7.7 |
| F095 | Marché Détécton et réparation de fuites année 2017/Rapports journaliers de détection/Rapports journaliers Sidi yahya.xlsx | xlsx | 94059 | 8 | fiche (rapport journalier 2017) | classeur | fr | bd7d1a03 | historique autre marché | 7.7 |
| F096 | plans/abdellah guennoun bas.pdf | pdf | 376937 | 1 | plan | texte vectoriel (aperçu lu) | fr | f480e622 | référence externe | 9 |
| F097 | plans/abdellah guennoun haut.pdf | pdf | 396303 | 1 | plan | texte vectoriel (aperçu lu) | fr | 996487e1 | référence externe | 9 |
| F098 | plans/Andalous.pdf | pdf | 534924 | 1 | plan | texte vectoriel (aperçu lu) | fr | e50acd73 | référence externe | 9 |
| F099 | plans/Azengot.pdf | pdf | 212961 | 1 | plan | texte vectoriel (aperçu lu) | fr | ea7172d4 | référence externe | 9 |
| F100 | plans/Ballaoui Bas-Irfane et autre part 1.pdf | pdf | 478498 | 1 | plan | texte vectoriel (aperçu lu) | fr | 27de084b | référence externe | 9 |
| F101 | plans/Château Sidi Aissa.pdf | pdf | 228277 | 1 | plan | texte vectoriel (aperçu lu) | fr | 03ad235c | référence externe | 9 |
| F102 | plans/Ghar el baroud-zone indust.pdf | pdf | 588322 | 1 | plan | texte vectoriel (aperçu lu) | fr | 0ab3a799 | référence externe | 9 |
| F103 | plans/lazaret bas.pdf | pdf | 297944 | 1 | plan | texte vectoriel (aperçu lu) | fr | e213d57b | référence externe | 9 |
| F104 | plans/Lazaret haut part 1.pdf | pdf | 663464 | 1 | plan | texte vectoriel (aperçu lu) | fr | 870f5bd2 | référence externe | 9 |
| F105 | plans/Lazaret Haut part 2.pdf | pdf | 719283 | 1 | plan | texte vectoriel (aperçu lu) | fr | 69902d0b | référence externe | 9 |
| F106 | plans/Maafa Bekkay Bas.pdf | pdf | 1819543 | 1 | plan | texte vectoriel (aperçu lu) | fr | 0b28c66d | référence externe | 9 |
| F107 | plans/Maksam-Kharoub.pdf | pdf | 302689 | 1 | plan | texte vectoriel (aperçu lu) | fr | 50f1b37f | référence externe | 9 |
| F108 | plans/Mbasso.pdf | pdf | 427089 | 1 | plan | texte vectoriel (aperçu lu) | fr | 8b18cd51 | référence externe | 9 |
| F109 | plans/pam.pdf | pdf | 287297 | 1 | plan | texte vectoriel (aperçu lu) | fr | 2401fb96 | référence externe | 9 |
| F110 | plans/plans.rar | rar | 10533325 | 1 | plan (archive des mêmes PDF) | archive | — | 92b98734 | référence externe | 9.3 |
| F111 | plans/Qods Bas.pdf | pdf | 303140 | 1 | plan | texte vectoriel (aperçu lu) | fr | 6648b87e | référence externe | 9 |
| F112 | plans/Qods Haut,Chu,Mouhoub-Irriss.pdf | pdf | 580184 | 1 | plan | texte vectoriel (aperçu lu) | fr | 21f780c6 | référence externe | 9 |
| F113 | plans/Sidi driss.pdf | pdf | 351501 | 1 | plan | texte vectoriel (aperçu lu) | fr | 5898dc5e | référence externe | 9 |
| F114 | plans/tairet bas.pdf | pdf | 451777 | 1 | plan | texte vectoriel (aperçu lu) | fr | 8c00b315 | référence externe | 9 |
| F115 | plans/tairet haut.pdf | pdf | 400689 | 1 | plan | texte vectoriel (aperçu lu) | fr | efa01045 | référence externe | 9 |
| F116 | plans/Tazaghine.pdf | pdf | 1043706 | 1 | plan | texte vectoriel (aperçu lu) | fr | 88d8f081 | référence externe | 9 |
| F117 | plans/Tennis 2.pdf | pdf | 233989 | 1 | plan | texte vectoriel (aperçu lu) | fr | 1aac4f48 | référence externe | 9 |
| F118 | plot.log | log | 831 | 1 | autre (journal et verrous AutoCAD) | texte | fr | 5d766121 | référence externe | 9.3 |
| F119 | Rapports journaliers Abdellah guenoun.xlsx | xlsx | 99296 | 1 | fiche (rapport journalier 2026) | classeur | fr | 43fce673 | interne STEPAG en préparation | 8.1 |
| F120 | Rapports journaliers LAZARET HAUT.xlsx | xlsx | 99399 | 1 | fiche (rapport journalier 2026) | classeur | fr | b80a1810 | interne STEPAG en préparation | 8.1 |
| F121 | Rapports/Rapport détection STEPAG.xlsx | xlsx | 41532 | 1 | fiche (rapport de détection) | classeur | fr | 10b9ad9b | interne STEPAG en préparation | 8.1 |
| F122 | Rapports/RAPPORT MENSUEL STEPAG.xlsx | xlsx | 42801 | 1 | fiche (rapport mensuel) | classeur | fr | aeeb46f1 | interne STEPAG en préparation | 8.3 |
| F123 | Rapports/Rapport réparation STEPAG.xlsx | xlsx | 41014 | 1 | fiche (fiche individuelle de réparation) | classeur | fr | 8659e712 | interne STEPAG en préparation | 8.2 |
| F124 | Reseau aep oujda.bak | bak | 162845162 | 1 | plan (dessin AutoCAD, non lisible) | binaire | — | a5e8d7f2 | référence externe | 9.3 ; 12.4 |
| F125 | Reseau aep oujda.dwg | dwg | 162838568 | 1 | plan (dessin AutoCAD, non lisible) | binaire | — | 0823a9d5 | référence externe | 9.3 ; 12.4 |
| F126 | Reseau aep oujda.dwl | dwl | 55 | 1 | autre (journal et verrous AutoCAD) | texte | fr | 0b34cb0d | référence externe | 9.3 |
| F127 | Reseau aep oujda.dwl2 | dwl2 | 205 | 1 | autre (journal et verrous AutoCAD) | texte | fr | 04259caa | référence externe | 9.3 |

| Statut normatif | Nombre de fichiers |
|---|---|
| référence externe | 56 |
| historique autre marché | 31 |
| contractuel signé | 23 |
| interne STEPAG en préparation | 10 |
| contractuel non signé | 7 |

## 2. Fiche d'identité du marché

**Résumé.** Marché de travaux à prix unitaires n° 4500004453 passé par la SRM Oriental avec STEPAG SARL après l'appel d'offres ouvert « au rabais ou à majoration » n° 10008883/1R : détection, recherche et réparation de fuites sur 1 466 km de réseau d'eau potable d'Oujda (5 zones), 12 mois à compter du 02/10/2026, 5 191 974,00 DH TTC après majoration de 15 %. Le marché se déroule en trois phases : balayage (4 mois), puis deux phases de maintien des débits nocturnes (4 + 4 mois).

**Principaux `[NON PRÉCISÉ]`.** Numéro d'engagement et code fournisseur STEPAG chez la SRM ; exemplaire du marché signé par la SRM (seule la version signée par STEPAG est dans le dossier) ; nom de l'agent chargé du suivi (à notifier par OS, R-CPS-013) ; application de la majoration ligne à ligne ou sur le total ; montants minimum et maximum (sans objet : marché ordinaire).

### 2.1 Numéros et références

| Référence | Valeur | Nature | Source |
|---|---|---|---|
| Numéro du marché (référence SAP de la SRM) | 4500004453 | n° de marché cité sur les ordres de service, l'attestation d'enregistrement, la demande de caution | [F035 p.1] ; [F036 p.1] ; [F048 p.1] |
| Numéro de l'appel d'offres (« Numéro DA/Marché » sur le bordereau) | 10008883/1R | appel d'offres ouvert au rabais ou à majoration | [F056 p.1] ; [F054 p.1] ; [F032 p.1] |
| Ordre de service n° 1 | 01/4500004453 (registre : 01/4500004453/2026) | notification de l'approbation | [F035 p.1] |
| Ordre de service n° 2 | 02/4500004453 | commencement des travaux | [F036 p.1] |
| Référence de la lettre de résultat | 1132/2026 (manuscrit) | courrier SRM du 2026-09-02 | [F037 p.1] |
| Cautionnement provisoire | FINEA n° 230197 du 2026-08-12 ; 40 000,00 DH | caution personnelle et solidaire | [F002 p.1] |
| Cautionnement définitif | FINEA n° 231882 ; 155 760,00 DH | 3 % du montant initial arrondi au dirham supérieur | [F051] ; [F035 p.1] ; [F053] |
| Enregistrement du marché | ordre de recette 25223/2026 ; registre d'entrée 202600257344032 | droits 5 212,00 DH payés le 2026-09-15 | [F048 p.1] ; [F049 p.1] |
| Numéro d'engagement | `[NON PRÉCISÉ]` | — | — |
| Code fournisseur STEPAG chez la SRM | `[NON PRÉCISÉ]` | — | — |

- **R-ID-001** [CONTRACTUEL] Le numéro du marché est `4500004453` (10 chiffres) ; il figure sur les deux ordres de service sous la forme « Marché N° :4500004453 ». [F035 p.1 ; F036 p.1]
- **R-ID-002** [CONTRACTUEL] Le numéro de l'appel d'offres est `10008883/1R` ; le CPS, le RC et le bordereau ne portent que ce numéro (pied de page « A.O N°10008883/1R -CPS ») et jamais 4500004453. [F056 p.1 à p.30 ; F032 p.1]
- **R-ID-003** [INTERNE] Les gabarits STEPAG (attachement, rapport détection, rapport mensuel) écrivent le numéro « 45000004453 » avec 11 chiffres : `[CONTRADICTION : F001 feuille "Parametre" F5 ; F121 A10 ; F122 E6 vs F035 p.1]`. Valeur retenue : `4500004453`. [F001 ; F121 ; F122]
- **R-ID-004** [DÉDUIT] Les numéros de marché de la SRM Oriental ont la forme d'une commande SAP à 10 chiffres commençant par `45000` (autres exemples : 4500000150, 4500000148, 4500000396, 4500000549, 4500001165, 4500003179). [F027 p.1]
- **R-ID-005** [CONTRACTUEL] Les ordres de service sont numérotés `NN/4500004453` (01 = notification de l'approbation ; 02 = commencement) et inscrits au registre du marché. [F035 p.1 ; F036 p.1 ; F056 p.8, art. I-20]

### 2.2 Objet, parties, périmètre

| Élément | Valeur | Source |
|---|---|---|
| Objet | TRAVAUX DE DÉTECTION, RECHERCHE ET RÉPARATION DE FUITES SUR LE RÉSEAU DE DISTRIBUTION D'EAU POTABLE DE LA VILLE D'OUJDA | [F056 p.1] ; [F036 p.1] |
| Maître d'ouvrage | Société Régionale Multiservices L'Oriental « SRM-Ori » / « SRM-ORI », société anonyme, capital 100 000 000.00 DH | [F056 p.2] |
| Identifiants du maître d'ouvrage | ICE 003507258000090 ; RC Oujda n° 42897 ; IF 66022781 | [F056 p.2] ; [F036 p.1] |
| Adresse du maître d'ouvrage | Hay Al Hikma, Bd la Liberté, BP 418 Oujda | [F056 p.2] |
| Coordonnées génériques du maître d'ouvrage | tél. 05 36 50 56 84 ; fax 05 36 50 14 06 ; centre de relation clientèle 05 36 743 743 ; www.srm-ori.ma ; contact@srm-ori.ma ; bureau.ordre@srm-ori.ma | [F036 p.1] |
| Représentant légal du maître d'ouvrage | Directeur Général, M. Mounir OUKHOUYA, ou la personne déléguée | [F056 p.2] |
| Représentant du maître d'ouvrage pour l'exécution | LE DIRECTEUR EXPLOITATION EAU POTABLE (M. Mohamed DAHMANI) | [F036 p.1] |
| Service de suivi | Département Mesures et Amélioration du Rendement, Direction Exploitation Eau Potable (chef : M. Mohamed HIKMAT) ; adresse : ANNEXE LAZARET DHAR LAMHALA LAZARET (en face de la piscine municipale), Oujda | [F035 p.1] ; [F036 p.1] |
| Service achats | Département Achats et Marchés (chef : M. Adil MAHROUG) | [F035 p.1] ; [F037 p.1] |
| Service financier | Département Financement et Trésorerie (destinataire du cautionnement définitif) | [F035 p.1] |
| Titulaire | STEPAG SARL (Société des Travaux d'Eau Potable, Assainissement liquide et Génie civil), capital 15.000.000,00 dhs | [F040 p.1] |
| Identifiants du titulaire | RC Oujda 26239 ; taxe professionnelle 11265141 ; IF 14447728 ; CNSS 9628093 ; ICE 001544809000060 | [F040 p.1] ; [F020 p.1] |
| Siège et domicile élu du titulaire | Bureau N°02 sis à res nasrr imm 110 appt 08 oujda | [F040 p.1] |
| Adresse de correspondance du titulaire | BP 356 Poste du Maroc Agence Sidi Yahya Oujda ; contact@stepag.ma | [F020 p.1] |
| Signataire du titulaire | BOUSALAM Imad, « Gérant de la société » | [F040 p.1] |
| Banque du titulaire | SAHAM BANK, Oujda Agence Principale `[RIB non recopié]` | [F040 p.1] |
| Lieu d'exécution | ville d'Oujda (« certains secteurs de la Préfecture Oujda-Angad ») | [F056 p.3, art. I-1] ; [F056 p.17, art. II-15] |
| Périmètre | 5 zones d'intervention, 34 secteurs dans le découpage proposé (à confirmer), 1466 km de réseau (voir liste `zone_intervention` et `secteur` en section 6 bis) | [F056 p.18-19, tableau n°1] |
| Lots | lot unique | [F054 p.3, art. 3] |

- **R-ID-006** [CONTRACTUEL] L'adresse de notification diffère entre les deux ordres de service : OS n° 01 → « Bureau N°02 SIS à RES NASRR IMM 110 APPT 08- OUJDA » ; OS n° 02 → « 19 rue Al Kaoutar II Hay 19 rue Al K 60000 OUJDA » (ancien siège). `[CONTRADICTION : F035 p.1 vs F036 p.1]` ; le domicile élu de l'acte d'engagement est le Bureau N°02. [F035 p.1 ; F036 p.1 ; F040 p.1]
- **R-ID-007** [CONTRACTUEL] L'objet de l'article I-1 cite quatre zones (« ZONES UNIVERSITE 7000M3- CHAMP TIR, JBEL HAMRA, AIN SERRAK 5000, ET SIDI YAHYA ») alors que le tableau n° 1 en compte cinq, « Jbel Hamra » étant scindée en DN700 et DN600. `[CONTRADICTION : F056 p.3 vs F056 p.18-19]` ; le tableau n° 1 (5 zones, 1466 km) est retenu car il porte les linéaires et les débits. [F056 p.3 ; F056 p.18-19]

### 2.3 Passation et dates

| Étape | Date | Source |
|---|---|---|
| Signature du RC par la SRM (signature numérique) | 2026-07-18 | [F054 p.17] |
| Visite des lieux (siège SRM-ORI, 10 h 00) | 2026-07-29 | [F039 p.1] |
| Acte d'engagement daté | 2026-08-10 | [F040 p.1] |
| Signature numérique des pièces par STEPAG | 2026-08-12 | [F056 p.30] ; [F032 p.1] |
| Ouverture des plis (heure limite de remise 09h45) | 2026-08-13 | [F039 p.1] |
| Lettre de résultat (offre retenue) | 2026-09-02 | [F037 p.1] |
| Approbation du marché ; OS n° 01 de notification de l'approbation | 2026-09-11 | [F035 p.1] |
| Paiement des droits d'enregistrement | 2026-09-15 | [F048 p.1] |
| Envoi du cautionnement définitif | 2026-09-16 | [F051] |
| OS n° 02 établi | 2026-09-25 | [F036 p.1] |
| **Commencement des travaux** | **2026-10-02** | [F036 p.1] |
| Fin du délai de balayage (4 mois) | 2027-02-02 `[DÉDUIT]` | [F056 p.17, art. II-14] |
| Fin de la première phase de maintien (4 mois) | 2027-06-02 `[DÉDUIT]` | [F056 p.17, art. II-14] |
| **Fin du délai d'exécution (12 mois)** | **2027-10-02** `[DÉDUIT]` | [F056 p.8, art. I-19] ; [F036 p.1] |
| Réception définitive au plus tôt (garantie 12 mois après réception provisoire) | 2028-10 `[DÉDUIT]` | [F056 p.10, art. I-28] |

- **R-ID-008** [CONTRACTUEL] Mode de passation : appel d'offres ouvert « au rabais ou à majoration », en application du § I de l'article 17 et de l'alinéa a du § 3 de l'article 18 du règlement des marchés de la SRM Oriental ; attribution à l'offre la moins-disante. [F056 p.1 ; F054 p.13, art. 20]
- **R-ID-009** [CONTRACTUEL] L'OS n° 02 invite STEPAG « À commencer l'exécution des travaux le : 02/10/2026 pour une durée maximale de : 12 mois ». [F036 p.1]
- **R-ID-010** [DÉDUIT] Dates d'échéance calculées de date à date (mois calendaires) à partir du 2026-10-02 ; le CPS ne dit pas si le dernier jour est le 2027-10-01 ou le 2027-10-02 `[À CONFIRMER : mode de décompte des mois, règle du CCAG-T non reproduite]`. En 2017 la régie comptait un délai de 4 mois du 2016-11-28 au 2017-03-27 (veille du jour anniversaire, R-ATT-018) : les échéances seraient alors 2027-02-01, 2027-06-01 et 2027-10-01. [F056 p.8, art. I-19 ; F073]

### 2.4 Nature du marché et montants

| Élément | Valeur | Source |
|---|---|---|
| Nature des prix | prix unitaires (« Le présent marché est à prix unitaires ») | [F056 p.10, art. I-29] |
| Type | marché ordinaire de travaux (ni cadre, ni reconductible, ni à bons de commande) `[DÉDUIT : aucune clause de minimum/maximum ni de reconduction]` | [F056] |
| Montants minimum et maximum | — (sans objet) | — |
| Estimation du maître d'ouvrage | 4514760.00 DH TTC (3762300.00 HT + TVA 752460.00) | [F039 p.1] ; [F032 p.1] |
| Taux de TVA | 20 % uniforme sur tous les prix | [F059 feuille "Table 1" F18] |
| Taux de majoration offert | 15,00 % (« Quinze pour cent ») | [F040 p.1] ; [F032 p.1] |
| **Montant du marché TTC après majoration** | **5191974.00 DH** (« Cinq millions cent quatre-vingt-onze mille neuf cent soixante-quatorze dirhams ») | [F040 p.1] ; [F037 p.1] |
| Montant HT après majoration | 4326645.00 DH `[DÉDUIT : 3762300.00 × 1.15]` | [F059] |
| TVA après majoration | 865329.00 DH `[DÉDUIT]` | [F059] |
| Base d'enregistrement | 5191980.00 DH `[CONTRADICTION : F048 p.1 vs F040 p.1]`, écart de 6,00 DH (arrondi probable de l'administration fiscale) | [F048 p.1] |
| Devise | dirham marocain (DH) | [F032 p.1] |
| Quantités du bordereau | prévisionnelles : paiement sur « quantités réellement exécutées » | [F056 p.10, art. I-29] |
| Révision des prix | prix révisables, deux formules (voir R-CPS-051 à R-CPS-054) | [F056 p.10-11, art. I-30] |
| Durée | 12 mois | [F056 p.8, art. I-19] |
| Règle de fin | terme du délai de 12 mois ; pas de clause d'épuisement d'un maximum `[DÉDUIT]` | [F056 p.8] |
| Reconduction ou prolongation | `[NON PRÉCISÉ]` ; seul l'avenant de force majeure prolonge le délai | [F056 p.8, art. I-23] |
| Variation dans la masse des travaux | renvoi aux articles 57 et 58 du CCAG-T ; changement dans les quantités : article 59 | [F056 p.13, art. I-33 et I-34] |
| Cautionnement provisoire | 40000.00 DH | [F056 p.9, art. I-24] |
| Cautionnement définitif | 3 % du montant initial arrondi au dirham supérieur = 155760.00 DH | [F056 p.9, art. I-25] ; [F035 p.1] |
| Retenue de garantie | 10 % de chaque acompte, plafonnée à 7 % du montant initial augmenté des avenants = 363438.18 DH `[DÉDUIT : 7 % × 5191974.00]` | [F056 p.9, art. I-26] |
| Délai de garantie | 12 mois à compter du PV de réception provisoire | [F056 p.10, art. I-28] |
| Délai de paiement | 90 jours | [F056 p.12-13, art. I-32] |

- **R-ID-011** [CONTRACTUEL] Le marché est à prix unitaires : les sommes dues résultent de l'application des prix unitaires du bordereau des prix – détail estimatif aux quantités réellement exécutées. [F056 p.10, art. I-29]
- **R-ID-012** [CONTRACTUEL] La majoration de 15 % s'applique au montant issu du bordereau : le modèle calcule `TOTAL TTC × 1.15` ; le CPS dit que le décompte applique les prix du bordereau « accordés éventuellement du rabais ou de la majoration indiqués dans le marché ». [F059 feuille "Table 1" F21 ; F056 p.13, art. I-32 §4]
- **R-ID-013** [DÉDUIT] Prix unitaires effectifs = PU du bordereau × 1.15 (exemple : prix 1 → 0.345 DH HT/ml) ; le dossier n'indique pas si la majoration est appliquée ligne par ligne ou sur le total `[À CONFIRMER : niveau d'application et arrondi de la majoration]`. Le gabarit de facture STEPAG l'applique sur le total TTC. [F001 feuille "facture" F30]
- **R-ID-014** [CONTRACTUEL] Offre retenue « pour un montant total de 5 191 974,00 DH TTC (avec une majoration de 15,00%) ». [F037 p.1]

### 2.5 Intervenants et signataires

| Fonction | Nom | Organisme | Rôle dans le dossier | Source |
|---|---|---|---|---|
| Directeur Général | M. Mounir OUKHOUYA | SRM-ORI | représente le maître d'ouvrage ; signe le marché | [F056 p.2] |
| Directeur Exploitation Eau Potable | M. Mohamed DAHMANI | SRM-ORI | signe l'OS de commencement | [F036 p.1] |
| Chef de Département Mesures et Amélioration du Rendement | M. Mohamed HIKMAT | SRM-ORI | vise l'OS de commencement ; reçoit les attestations d'assurance | [F035 p.1] ; [F036 p.1] |
| Chef de Département Achats et Marchés | M. Adil MAHROUG | SRM-ORI | signe la lettre de résultat et l'OS n° 01 | [F035 p.1] ; [F037 p.1] |
| Agent chargé du suivi de l'exécution du marché | `[NON PRÉCISÉ]` (à notifier par OS sous 15 jours) | SRM-ORI | dresse les décomptes | [F056 p.4, art. I-7] |
| Commission de réception | `[NON PRÉCISÉ]` | SRM-ORI | signe les PV de réception | [F056 p.9, art. I-27] |
| Gérant | M. Imad BOUSALAM | STEPAG | signe l'offre et les pièces | [F040 p.1] |
| Directeur de chantier | `[NON PRÉCISÉ]` | STEPAG | représente l'entrepreneur sur place | [F056 p.16, art. II-10] |
| Organisme de cautionnement | FINEA (succursale Oujda) | — | cautions provisoire et définitive | [F002 p.1] ; [F053] |

## 3. CPS : règles contractuelles

**Résumé.** Le CPS de l'AO 10008883/1R (30 pages, [F056]) comprend trois parties dont la numérotation des articles recommence : I « Cahier des clauses administratives et financières » (articles 1 à 39, cités `art. I-n`), II « Cahier des prescriptions spéciales » (articles 1 à 30, cités `art. II-n`), III « Définition des prix » (section 5). Le marché est un marché de **performance** : la SRM paie un linéaire balayé puis maintenu, sous condition d'atteindre et de conserver des débits nocturnes par zone, et paie les réparations à l'unité. Il n'existe **aucun délai contractuel de réparation par fuite** ni seuil de 48 h : les délais du CPS portent sur les phases (4 + 4 + 4 mois), la communication des fuites (le jour même), la réfection de chaussée (1 mois) et les rapports.

**Principaux `[NON PRÉCISÉ]`.** Délai d'intervention et de réparation par fuite ; modèle des rapports et de la fiche de réparation ; photos exigées par fuite ; système de coordonnées et formats de fichiers ; classes de débit de fuite ; marquage au sol ; horaires, astreinte, jours fériés ; pénalité pour non-remise d'un rapport ; sort financier d'une fouille négative ; garantie par réparation ; périodicité des attachements.

**Convention.** Chaque article est donné dans l'ordre du document. Les articles ayant un effet sur l'application sont recopiés en citation puis traduits en règles ; les autres sont résumés en une ligne. La version lue est celle signée numériquement par STEPAG le 2026-08-12 (mention « Lu et accepté ») ; l'exemplaire signé par la SRM n'est pas dans le dossier.

### 3.1 Préambule et parties

- **R-CPS-001** [CONTRACTUEL] Marché passé par appel d'offres ouvert au rabais ou à majoration (§ I de l'article 17 et alinéa A du § 3 de l'article 18 du règlement des marchés de la SRM Oriental), entre la SRM-Ori (« MAITRE D'OUVRAGE ») et l'« ENTREPRENEUR » ou « ENTREPRISE ». [F056 p.2, préambule]
- **R-CPS-002** [CONTRACTUEL] Les champs d'identité du titulaire sont vides dans le CPS du dossier d'appel d'offres ; l'identité du titulaire vient de l'acte d'engagement (section 2). [F056 p.2 ; F040 p.1]

### 3.2 Partie I : cahier des clauses administratives et financières

#### Art. I-1 Objet du marché

> ARTICLE N° 1. OBJET DU MARCHE
> Le présent marché a pour objet la réalisation de travaux relatifs de détection, recherche et
> réparation de fuites sur le réseau de distribution d’eau potable de la ville d’Oujda :
> ZONES UNIVERSITE 7000M3- CHAMP TIR, JBEL HAMRA, AIN SERRAK 5000, ET SIDI YAHYA
> Le Lieu d’exécution des travaux objet du marché se situe à : ville d’Oujda

- **R-CPS-003** [CONTRACTUEL] L'objet est la réalisation de travaux de détection, recherche et réparation de fuites sur le réseau de distribution d'eau potable de la ville d'Oujda. [F056 p.3, art. I-1]
- **R-CPS-004** [CONTRACTUEL] Zones citées : Université 7000 m3 - Champ de tir ; Jbel Hamra ; Ain Serrak 5000 ; Sidi Yahya. Le détail par secteur est au tableau n° 1 (R-CPS-100). [F056 p.3, art. I-1]

#### Art. I-2 Consistance des travaux

> ARTICLE N° 2. CONSISTANCE DES TRAVAUX
> Les travaux à exécuter au titre du présent marché consistent en ce qui suit :
> Recherche et détection de fuites sur conduites, tous diamètres et toutes natures
> Réfection de trottoirs et chaussées.
> Réparation des fuites sur conduites de différents diamètres.
> Réparation des fuites sur branchements
> La signalisation du chantier.

- **R-CPS-005** [CONTRACTUEL] Les travaux comprennent cinq natures : (1) recherche et détection de fuites sur conduites, tous diamètres et toutes natures ; (2) réfection de trottoirs et chaussées ; (3) réparation des fuites sur conduites de différents diamètres ; (4) réparation des fuites sur branchements ; (5) signalisation du chantier. [F056 p.3, art. I-2]
- **R-CPS-006** [DÉDUIT] Ne sont pas cités dans la consistance : l'assainissement, les compteurs, les fuites après compteur (domaine privé), les vannes, ventouses et ouvrages ; aucune limite de pression. Le catalogue interne STEPAG prévoit le motif « Assainissement » pour une fouille révélant une fuite d'égout. [F056 p.3 ; F001 feuille "LISTE" A3]

#### Art. I-3 Documents constitutifs du marché

> ARTICLE N° 3. DOCUMENTS CONSTITUTIFS DU MARCHE
> Les documents constitutifs du marché sont ceux énumérés ci-après :
> 1. L'acte d'engagement ;
> 2. Le présent Cahier des Prescriptions Spéciales ;
> 3. Le bordereau des prix – détail estimatif ;
> 4. Le cahier des clauses administratives générales applicable aux marchés de travaux,
> approuvé par le Décret n° 2-14-394 du 06 chaabane 1437 (13 Mai 2016), à l’exception
> des clauses auxquelles il est dérogé dans le présent marché.
> En cas de discordance ou contradiction entre les documents constitutifs du marché autres que celle
> se rapportant à l’offre financière telle que décrite par l’article 28 du règlement des marchés de la
> SRM- ORI, ceux-ci prévalent dans l’ordre où ils sont énumérés ci-dessus.

- **R-CPS-007** [CONTRACTUEL] Pièces constitutives, dans l'ordre : (1) acte d'engagement ; (2) CPS ; (3) bordereau des prix – détail estimatif ; (4) CCAG-Travaux approuvé par le décret n° 2-14-394 du 13 mai 2016, sauf clauses auxquelles le marché déroge. [F056 p.3, art. I-3]
- **R-CPS-008** [CONTRACTUEL] En cas de discordance entre ces pièces, elles prévalent dans l'ordre de leur énumération, sauf pour les discordances de l'offre financière, traitées selon l'article 28 du règlement des marchés de la SRM-ORI. [F056 p.3, art. I-3]
- **R-CPS-009** [DÉDUIT] Le règlement de consultation, les notes de moyens humains et matériels et les rapports-types ne sont pas des pièces constitutives : le RC et l'offre technique n'engagent qu'au titre de la procédure d'attribution. [F056 p.3, art. I-3]

#### Art. I-4 Pièces contractuelles postérieures

> ARTICLE N° 4. PIECES CONTRACTUELLES POSTERIEURES A LA CONCLUSION DU MARCHE
> Les pièces contractuelles postérieures à la conclusion du marché comprennent :
> Les ordres de service ;
> Les avenants éventuels ;
> La décision prévue à l’article 57 du CCAG applicable aux marchés de travaux, le cas
> échéant.

- **R-CPS-010** [CONTRACTUEL] Pièces postérieures à la conclusion : ordres de service ; avenants éventuels ; décision prévue à l'article 57 du CCAG-T (augmentation dans la masse des travaux). [F056 p.3, art. I-4]

#### Art. I-5 Textes généraux et spéciaux

- **R-CPS-011** [CONTRACTUEL] Textes applicables : règlement des marchés de la SRM Oriental ; législation de l'emploi et des salaires ; Code général des impôts ; loi n° 112-13 (nantissement) ; dahir n° 1-56-211 et circulaire n° 72/CAB (garanties pécuniaires) ; arrêté n° 3-302-15 du 27 novembre 2015 (révision des prix) ; loi n° 09-08 (données personnelles) ; arrêté n° 1692-23 du 23 juin 2023 (dématérialisation) ; décret n° 2-14-272 du 14 mai 2014 (avances). Le titulaire ne peut exciper de leur ignorance. [F056 p.3-4, art. I-5]

#### Art. I-6 à I-9 (résumés)

- **R-CPS-012** [CONTRACTUEL] Art. I-6 : le marché n'est valable, définitif et exécutoire qu'après sa signature par le Directeur Général de la SRM-ORI ou son délégué. [F056 p.4, art. I-6]

> ARTICLE N° 7. DEVOLUTION DES ATTRIBUTIONS
> Conformément à l’article 4 du CCAG applicable aux marchés des travaux, le maître d’ouvrage
> notifie, par ordre de service, à l’entrepreneur dans les quinze (15) jours qui suivent la date de
> notification de l’ordre de service prescrivant le commencement de l’exécution des travaux, le nom,
> la qualité et les missions de l’agent chargé du suivi de l’exécution du marché.
> Les noms des organismes chargés du contrôle technique, du contrôle de qualité et d’assistance
> technique sont notifiés par ordre de service dès qu’ils soient connus le cas échéant.
> Toute modification ultérieure relative à la désignation des intervenants est communiquée à
> l’entrepreneur par ordre du service du maître d’ouvrage.

- **R-CPS-013** [CONTRACTUEL] Art. I-7 : la SRM notifie par ordre de service, dans les quinze (15) jours suivant la notification de l'OS de commencement, le nom, la qualité et les missions de l'agent chargé du suivi de l'exécution du marché ; toute modification des intervenants est communiquée par OS. [F056 p.4, art. I-7]
- **R-CPS-014** [CONTRACTUEL] Art. I-8 : les notifications sont faites au domicile indiqué dans l'acte d'engagement ; tout changement de domicile est signalé par lettre recommandée avec accusé de réception dans les quinze (15) jours. [F056 p.4, art. I-8]
- **R-CPS-015** [CONTRACTUEL] Art. I-9 : nantissement selon la loi n° 112-13 ; liquidation des sommes par le Directeur Général ; paiements effectués par le Directeur Général et le Directeur Administratif et Financier. [F056 p.4, art. I-9]

#### Art. I-10 Sous-traitance

- **R-CPS-016** [CONTRACTUEL] La sous-traitance ne peut dépasser cinquante pour cent (50 %) du montant TTC du marché ni porter sur le lot ou le corps d'état principal ; les sous-traitants doivent être installés au Maroc et remplir les conditions de l'article 25 du règlement. [F056 p.5, art. I-10]
- **R-CPS-017** [CONTRACTUEL] Le titulaire notifie à la SRM une copie certifiée conforme du contrat de sous-traitance ; la SRM peut récuser le sous-traitant dans les quinze (15) jours suivant la réception du contrat ; le titulaire justifie les paiements faits au sous-traitant et reste seul responsable. [F056 p.5, art. I-10]

#### Art. I-11 à I-16 (résumés)

- **R-CPS-018** [CONTRACTUEL] Art. I-11 : recours à la main-d'œuvre locale (commune, à défaut préfecture, province ou région) à hauteur de vingt pour cent (20 %) de l'effectif requis. [F056 p.5, art. I-11]
- **R-CPS-019** [CONTRACTUEL] Art. I-12 : protection de la main-d'œuvre selon l'article 23 du CCAG-T. [F056 p.5, art. I-12]
- **R-CPS-020** [CONTRACTUEL] Art. I-13 : avant tout commencement, attestations d'assurance couvrant les risques du marché, avec dates de validité (article 25 du CCAG-T), plus la police « dommages à l'ouvrage » (§ d de l'article 25). [F056 p.5, art. I-13]
- **R-CPS-021** [CONTRACTUEL] Art. I-14 : garantie contre les revendications de propriété industrielle (article 26 du CCAG-T). Art. I-15 : cession du marché interdite sauf fusion ou scission, sur autorisation expresse et avenant. Art. I-16 : enregistrement du marché à la charge de l'entrepreneur. [F056 p.6, art. I-14 à I-16]

#### Art. I-17 Protection des données à caractère personnel

- **R-CPS-022** [CONTRACTUEL] Le titulaire traite les données personnelles communiquées par la SRM conformément à la loi n° 09-08, uniquement dans le cadre des instructions et de l'autorisation de la SRM, « entièrement et exclusivement en son sein ». [F056 p.6-7, art. I-17]
- **R-CPS-023** [CONTRACTUEL] Il lui est interdit d'exploiter, copier ou stocker des fichiers de données personnelles de la SRM pour d'autres fins que la mission, et de les divulguer. [F056 p.6-7, art. I-17]
- **R-CPS-024** [CONTRACTUEL] Pas de sous-traitant sur ces données sans habilitation préalable et expresse de la SRM-ORI, dans un contrat soumis à sa validation. [F056 p.7, art. I-17]
- **R-CPS-025** [CONTRACTUEL] Le titulaire prend toutes mesures de sécurité matérielle et logique pour conserver l'intégrité des données et empêcher tout accès non autorisé ou usage détourné. [F056 p.6-7, art. I-17]
- **R-CPS-026** [CONTRACTUEL] En fin de marché, le titulaire procède « à la destruction des données, fichiers informatisés ou manuels, figurant sur tout support ». [F056 p.7, art. I-17]
- **R-CPS-027** [CONTRACTUEL] La SRM peut faire vérifier (audit) le respect de ces obligations ; le titulaire coopère, applique à ses frais et sans délai les mesures correctives, et aide la SRM à répondre aux demandes d'accès, de rectification et d'opposition des personnes. [F056 p.7, art. I-17]
- **R-CPS-028** [CONTRACTUEL] Le non-respect du secret, de la confidentialité ou de la sécurité des données permet la résiliation immédiate du marché sans indemnité et engage la responsabilité pénale et civile du titulaire. [F056 p.7-8, art. I-17]
- **R-CPS-029** [DÉDUIT] Conséquence pour l'application : la « liste des branchements avec adresses des abonnés » remise par la SRM (R-CPS-163) et les références d'abonnés saisies sont des données personnelles : accès restreint par rôle, hébergement maîtrisé, purge en fin de marché. [F056 p.6-8 ; F056 p.27, art. II-29]

#### Art. I-18 (résumé)

- **R-CPS-030** [CONTRACTUEL] Art. I-18 : interdiction des actes de corruption, manœuvres frauduleuses, pratiques collusoires, promesses, dons ou présents. [F056 p.8, art. I-18]

#### Art. I-19 Délai d'exécution

> ARTICLE N° 19. DELAI D’EXECUTION
> L’entrepreneur devra exécuter les travaux désignés en objet dans un délai de 12 mois.
> Le délai d’exécution court à partir de la date prévue par l’ordre de service prescrivant le
> commencement de l’exécution des travaux.
> Ce délai s’applique à l’achèvement de tous les travaux incombant au titulaire y compris le
> repliement des installations de chantier et la remise en état des terrains et des lieux.

- **R-CPS-031** [CONTRACTUEL] Le délai d'exécution est de 12 mois ; il court à partir de la date prévue par l'ordre de service de commencement (2026-10-02). [F056 p.8, art. I-19 ; F036 p.1]
- **R-CPS-032** [CONTRACTUEL] Ce délai couvre l'achèvement de tous les travaux, y compris le repliement des installations de chantier et la remise en état des lieux. [F056 p.8, art. I-19]

#### Art. I-20 Ordres de service

> ARTICLE N° 20. ORDRES DE SERVICE
> Les ordres de service sont écrits et signés par le maître d’ouvrage. Ils sont datés, numérotés et
> enregistrés dans le registre du marché.
> Les ordres de service sont établis en deux exemplaires et notifiés par courrier porté contre récépissé
> ou par lettre recommandée avec accusé de réception à l’entrepreneur. Celui-ci renvoie dans les
> trois (3) jours suivants, au maître d’ouvrage l’un des deux exemplaires après l’avoir signé et y avoir
> porté la date à laquelle il l’a reçu ; à défaut, l’ordre de service est réputé être reçu à la date de sa
> notification.
> L'entrepreneur doit se conformer aux prescriptions des ordres de service qui lui sont notifiés.
> Lorsque l’entrepreneur estime que les prescriptions d’un ordre de service dépassent les obligations
> découlant du présent marché ou soulèvent de sa part des réserves, les dispositions de l’article 11
> du CCAG-T sont applicables.
> En cas de groupement d’entreprises, les notifications des ordres de service sont faites au
> mandataire qui a, seul, qualité pour présenter des réserves au nom du groupement.

- **R-CPS-033** [CONTRACTUEL] Les ordres de service sont écrits, signés par le maître d'ouvrage, datés, numérotés et enregistrés au registre du marché ; établis en deux exemplaires, notifiés par courrier porté contre récépissé ou lettre recommandée avec accusé de réception. [F056 p.8, art. I-20]
- **R-CPS-034** [CONTRACTUEL] L'entrepreneur renvoie un exemplaire signé et daté dans les trois (3) jours ; à défaut, l'OS est réputé reçu à la date de sa notification. Réserves : article 11 du CCAG-T. [F056 p.8, art. I-20]

#### Art. I-21 à I-23 Ajournement, cessation, force majeure

> ARTICLE N° 21. AJOURNEMENTS DE L’EXECUTION DES TRAVAUX
> L’ajournement de l’exécution des travaux est prescrit par ordre de service motivé d’arrêt et de
> reprise de l’exécution, et ce conformément aux dispositions de l’article 48 du CCAG-T.
> ARTICLE N° 22. CESSATION DES TRAVAUX
> Les dispositions de l’article 49 du CCAG-Travaux sont applicables.
> ARTICLE N° 23. CAS DE FORCE MAJEURE
> Conformément aux prescriptions de l’article 47 du C.C.A.G-T, et en cas de survenance d’un
> événement de force majeure, le titulaire a droit à une augmentation raisonnable des délais
> d’exécution qui doit faire l’objet d’un avenant. Aucune indemnité ne peut être accordée au titulaire
> pour perte totale ou partielle de sa fourniture, les frais d’assurance de cette fourniture étant
> réputés compris dans les prix du marché.
> Les seuils d’intempéries qui sont réputés constituer un événement de force majeure sont définis
> comme suit :
> - La neige : 50 cm
> - La pluie : 70 mm
> - Le vent : 70 km/h
> - Le séisme : 5 degré sur l’échelle de Richter.
> En cas de survenance d’un événement de force majeure, il sera fait application des dispositions de
> l’article 47 du C.C.A.G-T et toute législation en la matière en vigueur.

- **R-CPS-035** [CONTRACTUEL] L'ajournement des travaux est prescrit par ordre de service motivé d'arrêt et de reprise (article 48 du CCAG-T) : c'est le seul mécanisme de suspension du délai prévu par le CPS, avec la force majeure. [F056 p.8, art. I-21]
- **R-CPS-036** [CONTRACTUEL] Cessation des travaux : article 49 du CCAG-T. [F056 p.8, art. I-22]
- **R-CPS-037** [CONTRACTUEL] Force majeure (article 47 du CCAG-T) : droit à une augmentation raisonnable du délai, par avenant ; aucune indemnité. [F056 p.8, art. I-23]
- **R-CPS-038** [CONTRACTUEL] Seuils d'intempéries valant force majeure : neige 50 cm ; pluie 70 mm ; vent 70 km/h ; séisme de degré 5 sur l'échelle de Richter. La période de mesure (par jour, par épisode) est `[NON PRÉCISÉ]`. [F056 p.8-9, art. I-23]

#### Art. I-24 à I-26 Cautionnements et retenue de garantie

> ARTICLE N° 25. CAUTIONNEMENT DEFINITIF
> En garantie des engagements contractés par lui, l’entrepreneur fournira un cautionnement définitif
> sous forme d’une caution bancaire personnelle et solidaire délivrée par un organisme financier
> choisi parmi les établissements bancaires marocains agrées à cet effet. Il ne devra en aucun cas
> inclure un délai de validité.
> Le montant du cautionnement définitif est fixé à trois pour cent (3%) du montant initial du marché
> arrondi au dirham supérieur.
> Le cautionnement définitif doit être constitué dans les vingt (20) jours qui suivent la notification du
> marché. Il reste affecté à la garantie des engagements contractuels de l’entrepreneur jusqu’à la
> réception définitive des travaux.
> Le cautionnement définitif est libéré à la suite d’une main levée délivrée par le maître d’ouvrage
> dès la signature du procès-verbal de la réception définitive des travaux.
> ARTICLE N° 26. RETENUE DE GARANTIE
> Une retenue de garantie sera prélevée sur les acomptes. Elle est égale à dix pour cent (10 %) du
> montant de chaque acompte.
> Elle cessera de croître lorsqu'elle atteindra sept pour cent (7%) du montant initial du marché
> augmenté le cas échéant, du montant des avenants.
> La retenue de garantie peut être remplacée, à la demande de l’entrepreneur, par une caution
> personnelle et solidaire constituée dans les conditions prévues par la réglementation en vigueur.
> La retenue de garantie est restituée ou la caution qui la remplace est libérée à la suite d’une
> mainlevée délivrée par le maître d’ouvrage dès la signature du procès-verbal de la réception
> définitive des travaux.

- **R-CPS-039** [CONTRACTUEL] Art. I-24 : cautionnement provisoire de 40 000 dhs (Quarante Mille dirhams), remplacé par le cautionnement définitif. [F056 p.9, art. I-24]
- **R-CPS-040** [CONTRACTUEL] Cautionnement définitif : caution bancaire personnelle et solidaire, sans délai de validité, égale à trois pour cent (3 %) du montant initial du marché arrondi au dirham supérieur, constituée dans les vingt (20) jours suivant la notification du marché ; libérée par mainlevée à la signature du PV de réception définitive. [F056 p.9, art. I-25]
- **R-CPS-041** [CONTRACTUEL] Retenue de garantie : dix pour cent (10 %) du montant de chaque acompte ; elle cesse de croître lorsqu'elle atteint sept pour cent (7 %) du montant initial du marché augmenté le cas échéant des avenants. [F056 p.9, art. I-26]
- **R-CPS-042** [CONTRACTUEL] La retenue de garantie peut être remplacée, à la demande de l'entrepreneur, par une caution personnelle et solidaire ; elle est restituée (ou la caution libérée) par mainlevée à la signature du PV de réception définitive. [F056 p.9, art. I-26]
- **R-CPS-043** [DÉDUIT] Exemple : acompte de 400000.00 DH → retenue 40000.00 DH ; plafond cumulé 7 % × 5191974.00 = 363438.18 DH (assiette TTC ou HT `[À CONFIRMER : le CPS dit « montant initial du marché » sans préciser]`). [F056 p.9, art. I-26]

#### Art. I-27 et I-28 Réceptions et garantie

> ARTICLE N° 27. RECEPTIONS PROVISOIRE ET DEFINITIVE
> A l’achèvement des travaux et en application de l’article 73 du CCAG-T, le maître d’ouvrage s’assure
> en présence de l’entrepreneur de la conformité des travaux aux spécifications techniques du
> marché et prononcera la réception provisoire.
> S’il constate que les travaux présentent des insuffisances ou des défauts ou ne sont pas conformes
> aux spécifications du marché, l’entrepreneur procédera aux réparations nécessaires conformément
> aux règles de l’art. A défaut, la réception ne sera pas prononcée, et le délai d’exécution ne sera pas
> prorogé pour autant.
> Conformément aux stipulations de l’article 76 du CCAG-T et après expiration du délai de garantie,
> il sera procédé à la réception définitive, après que le maître d’ouvrage se soit assuré que les
> malfaçons ou les imperfections éventuelles ont été réparées par l’entrepreneur.
> Les opérations sus mentionnées sont sanctionnées, selon le cas, par un procès-verbal de réception
> provisoire ou définitive signé par les membres de la commission de réception désignée à cet effet.
> ARTICLE N° 28. DELAI DE GARANTIE
> Le délai de garantie est fixé à douze (12) mois à compter de la date du procès-verbal de la réception
> provisoire des travaux, et ce conformément aux dispositions de l’article 75 du CCAG-T.
> Pendant le délai de garantie, l’entrepreneur sera tenu de remettre au maître d’ouvrage les plans
> des ouvrages conformes à l’exécution, de procéder aux rectifications qui lui seraient demandées en
> cas de malfaçons ou d’insuffisances constatées et de remédier à l’ensemble des défectuosités, sans
> pour autant que ces travaux supplémentaires puissent donner lieu à paiement à l'exception de ceux
> résultant de l’usure normale, d'un abus d'usage ou de dommages causés par des tiers.

- **R-CPS-044** [CONTRACTUEL] Réception provisoire : à l'achèvement des travaux (article 73 du CCAG-T), le maître d'ouvrage vérifie en présence de l'entrepreneur la conformité aux spécifications ; en cas de défauts, l'entrepreneur répare ; à défaut la réception n'est pas prononcée et le délai n'est pas prorogé. [F056 p.9, art. I-27]
- **R-CPS-045** [CONTRACTUEL] Réception définitive : après expiration du délai de garantie (article 76 du CCAG-T), une fois les malfaçons réparées. Chaque réception fait l'objet d'un procès-verbal signé par les membres de la commission de réception. [F056 p.9, art. I-27]
- **R-CPS-046** [CONTRACTUEL] Délai de garantie : douze (12) mois à compter de la date du PV de réception provisoire (article 75 du CCAG-T) ; garantie globale du marché, il n'existe pas de délai de garantie par réparation. [F056 p.10, art. I-28]
- **R-CPS-047** [CONTRACTUEL] Pendant la garantie, l'entrepreneur remet les plans des ouvrages conformes à l'exécution, rectifie les malfaçons et remédie à toutes les défectuosités sans paiement, sauf usure normale, abus d'usage ou dommages causés par des tiers. [F056 p.10, art. I-28]
- **R-CPS-048** [DÉDUIT] Une fuite réapparaissant sur une réparation faite par STEPAG pendant le marché ou la garantie est à reprendre gratuitement (défectuosité) ; le critère du « même point » et la preuve sont `[NON PRÉCISÉ]`. [F056 p.10, art. I-28]

#### Art. I-29 et I-30 Nature, caractère et révision des prix

> ARTICLE N° 29. NATURE DES PRIX
> Le présent marché est à prix unitaires.
> Les sommes dues au titulaire du marché sont calculées par application des prix unitaires portés au
> bordereau des prix - détail estimatif, joint au présent cahier des prescriptions spéciales, aux
> quantités réellement exécutées conformément au marché.
> ARTICLE N° 30. CARACTERE DES PRIX
> Les prix du marché comprennent le bénéfice et tous droits, impôts, taxes, frais généraux, faux frais
> et, de manière générale, toutes les dépenses induites par la prestation objet du marché jusqu’à
> l’exécution de celle-ci.
> Les prix seront révisables pour tenir compte des variations éventuelles des conditions
> économiques.
> Les prix du marché sont réputés comprendre toutes les dépenses résultant de l’exécution des
> prestations y compris tous les droits, impôts, taxes, frais généraux, faux frais et assurer au titulaire
> une marge pour bénéfice et risques et d'une façon générale toutes les dépenses qui sont la
> conséquence nécessaire et directe du travail.
> les prix de marché sont révisables selon les formules suivantes :
> a – TERRASSEMENTS, ET ENTRETIEN RESEAU :
> P = Po 0,15 + 0,30 S (1 + ChTp ) + 0,35McI+ 0,20 Mtn
> So (1 + ChTpo) McIo Mtno
> b – OUVRAGES ANNEXES ET REFECTION DE TROTTOIRS OU DE CHAUSSEES
> P = Po 0, 15 + 0, 30S (1 + ChTp ) + 0,20 Mtn + 0,15 At + 0,2 Cs
> So (1 + ChTpo) Mtno Ato Cso
> Les index “o” sont les valeurs de références des Index du mois de la date limite de remise des
> offres.
> Dans ces formules :
> P = Désigne le prix révisé
> Po = Désigne le prix initial du bordereau des prix établis par le contractant et qui doit être
> déterminé suivant les conditions économiques en vigueur au jour J (J étant la date limite fixée pour
> la remise des offres).
> Les index sont extraits de la liste des indices économiques publiée chaque mois par le Ministère de
> l’équipement, du transport et de la logistique conformément à l’arrêté du Chef de Gouvernement
> n° 03-302 du 27 Novembre 2015 fixant les règles et conditions de révision des prix des marchés
> publics.
> Les Indices suivants représentent les valeurs des indexes du mois de la date d’exigibilité de la
> révision :
> S (1 + ChTp) = Indice salaire et charge sociales (Ouvrages de Génie Civil)
> McI = Indice global pour les terrassements ordinaires
> Mtn = Indice transport privé par route
> At= Indice acier torsadé
> Cs= Indice ciment en sacs
> Les valeurs à prendre en compte seront celles publiées par le ministère de l’Equipement.
> La révision du prix contractuel se fera après consultation des valeurs publiées des index globaux à
> la date limite de remise des offres d’une part et à la date d’exigibilité de la révision d’autre part.
> Le résultat final du coefficient de révision des prix ainsi que les résultats des rapports relatifs aux
> calculs intermédiaires sont arrêtés à la quatrième décimale.
> Les prix ainsi calculés s’appliquent à tous les travaux exécutés dans les délais normaux.
> Au cours de l’exécution des travaux, l’Entrepreneur ne pourra se prévaloir d’aucun élément de
> variation des conditions économiques de son offre pour réclamer des augmentations qui ne
> résulteraient pas de la formule de révision ci-dessus.
> Les valeurs à prendre en compte seront celles publiées par le ministère de l’Equipement.
> La révision du prix contractuel se fera après consultation des valeurs publiées des index globaux à
> la date limite de remise des offres d’une part et à la date d’exigibilité de la révision d’autre part.
> Le résultat final du coefficient de révision des prix ainsi que les résultats des rapports relatifs aux
> calculs intermédiaires sont arrêtés à la quatrième décimale.
> Les prix ainsi calculés s’appliquent à tous les travaux exécutés dans les délais normaux.
> Au cours de l’exécution des travaux, l’Entrepreneur ne pourra se prévaloir d’aucun élément de
> variation des conditions économiques de son offre pour réclamer des augmentations qui ne
> résulteraient pas de la formule de révision ci-dessus.
> L’application de la révision des prix sera faite conformément aux dispositions de l’arrêté du Chef du
> gouvernement n°3-302-15 du 15 safar 1437 (27 novembre 2015) fixant les règles et les conditions
> de révision des prix des marchés publics.

- **R-CPS-049** [CONTRACTUEL] Marché à prix unitaires ; sommes dues = prix unitaires du bordereau × quantités réellement exécutées. [F056 p.10, art. I-29]
- **R-CPS-050** [CONTRACTUEL] Les prix comprennent le bénéfice, tous droits, impôts, taxes, frais généraux, faux frais et toutes les dépenses conséquence nécessaire et directe du travail. [F056 p.10, art. I-30]
- **R-CPS-051** [CONTRACTUEL] Les prix sont révisables. Formule a « terrassements et entretien réseau » : `P = Po × [0,15 + 0,30 × S(1+ChTp)/So(1+ChTpo) + 0,35 × McI/McIo + 0,20 × Mtn/Mtno]`. [F056 p.10, art. I-30 ; contrôle visuel]
- **R-CPS-052** [CONTRACTUEL] Formule b « ouvrages annexes et réfection de trottoirs ou de chaussées » : `P = Po × [0,15 + 0,30 × S(1+ChTp)/So(1+ChTpo) + 0,20 × Mtn/Mtno + 0,15 × At/Ato + 0,2 × Cs/Cso]`. [F056 p.10, art. I-30 ; contrôle visuel]
- **R-CPS-053** [CONTRACTUEL] Index : S(1+ChTp) = salaires et charges sociales (ouvrages de génie civil) ; McI = indice global des terrassements ordinaires ; Mtn = transport privé par route ; At = acier torsadé ; Cs = ciment en sacs ; publiés chaque mois par le ministère de l'Équipement. Les index « o » sont ceux du mois de la date limite de remise des offres (août 2026) ; les autres, ceux du mois de la date d'exigibilité de la révision. [F056 p.10-11, art. I-30 ; F039 p.1]
- **R-CPS-054** [CONTRACTUEL] Le coefficient de révision et les rapports intermédiaires sont arrêtés à la quatrième décimale. La révision suit l'arrêté n° 3-302-15 du 27 novembre 2015. Partie fixe : 0,15 ; somme des coefficients de chaque formule : 1,00. [F056 p.11, art. I-30]
- **R-CPS-055** [DÉDUIT] Affectation proposée : formule a → prix 3 et 6 à 13 (terrassement, entretien réseau) ; formule b → prix 4, 5 et 10 (réfections, ouvrages annexes) ; prix 1 et 2 (détection) : formule applicable `[À CONFIRMER : non écrit]`. [F056 p.10, art. I-30]
- **R-CPS-056** [CONTRACTUEL] Les prix révisés s'appliquent aux travaux exécutés dans les délais normaux ; aucune autre augmentation ne peut être réclamée. [F056 p.11, art. I-30]

#### Art. I-31 Avances

- **R-CPS-057** [CONTRACTUEL] Une avance peut être accordée selon le décret n° 2-14-272, sur demande du titulaire et contre caution personnelle et solidaire du même montant. [F056 p.11, art. I-31]
- **R-CPS-058** [CONTRACTUEL] Remboursement de l'avance : 20 % du montant de l'avance prélevés sur chaque acompte ; remboursement total au plus tard quand les prestations exécutées atteignent 80 % du montant TTC du marché ; liquidation immédiate en cas de résiliation. [F056 p.11, art. I-31]

#### Art. I-32 Modalités de règlement

> ARTICLE N° 32. MODALITES DE REGLEMENT
> Le règlement des travaux réalisés sera effectué sur la base de décomptes. Une copie de chaque
> décompte sera communiquée à l’entrepreneur dans un délai n'excédant pas dix (10) jours à partir
> de la date de sa signature par le maître d’ouvrage.
> L’entrepreneur établie les factures correspondantes aux décomptes en cinq (5) exemplaires. Les
> factures doivent mentionner :
> La référence du marché ;
> Les mentions légales, à savoir :
> - L’identité de l’entrepreneur ;
> - Le numéro d’identification fiscale attribué par le service local des impôts, ainsi que
> le numéro d’article d’imposition à la taxe professionnelle ;
> - L’identifiant commun de l’entreprise ;
> - La date de la fature;
> - Le nom, prénom ou raison sociale et adresses ;
> - Les prix, quantités et nature des marchandises vendues, des travaux exécutés ou des
> services rendus ;
> - D’une manière distincte le montant de la taxe sur la valeur ajoutée réclamée en sus
> du prix ou comprise dans le prix ;
> - Les références et le mode de paiement se rapportant à ces factures ;
> - et tous autres renseignements prescrits par les dispositions légales.
> Le montant de chaque facture est réglé au prestataire, dans un délai maximum de Quatre-vingt-
> dix (90) jours.
> Attachements :
> Les attachements seront pris au fur et à mesure de l'exécution des travaux.
> Les attachements sont établis et validés conformément aux dispositions de l’article 61 du CCAG-T.
> Les attachements mentionneront :
> La référence du marché ;
> La référence de l’ordre de service correspondant ;
> Le lieu exact du début et de la fin du chantier concerné par cet attachement avec si
> besoin un croquis ou un plan ;
> Les numéros des postes du bordereau, les désignations et les quantités
> correspondantes.
> Décomptes provisoires :
> Conformément à l'article 62 du CCAG-T, l’agent chargé du suivi de l’exécution du marché dresse
> chaque fois qu’il est nécessaire à partir des attachements, un décompte provisoire, qu’il soumet à
> la signature du maître d’ouvrage indiquant la date d’acceptation des attachements et servant de
> base de versement d’acomptes à l’entrepreneur.
> Décompte général définitif :
> Le décompte général définitif est établi par l’agent chargé du suivi de l’exécution du marché et signé
> par le maître d’ouvrage selon les dispositions de l’article 68 du CCAG-T.
> Modalités de paiement :
> Les paiements seront effectués par application des prix du bordereau aux quantités réalisées
> suivant les modalités suivantes :
> 1.Une facture provisoire représentant 100 % du montant des travaux réalisés du prix du balayage
> (prix n° 1), (diminué en fonction des performances réalisées (débits minimum atteints à
> l’achèvement du balayage) par rapport aux débits objectifs fixés par la SRM-ORI dans le tableau
> N°1: tableau récapitulatif relatif aux conditions de réalisation des travaux exigées par la SRM-ORI),
> sera adressée après achèvement des travaux du balayage et des mesures de débit nocturne.
> La facture comprendra également 100% des travaux de réparation de fuites et des réfections
> réalisés par la Société durant la période du balayage.
> 2.Une facture provisoire représentant 40 % du montant des travaux du maintien des résultats (prix
> n° 2) sera adressée à la SRM-ORI, après achèvement de la moitié du délai de garantie sur le maintien
> des gains du balayage, soit après quatre mois de l’achèvement du balayage des secteurs objet du
> marché.
> La facture comprendra également 100% des travaux de réparation de fuites et des réfections
> réalisés par la Société durant les quatre premiers mois de la période de maintien des performances
> de réseaux.
> 3.Une facture dernière représentant 60% du montant des travaux de maintien des résultats (prix
> n° 2) (diminué en fonction des débits maintenus (par rapport aux débits atteints par la Société après
> achèvement du balayage) sera adressée à la SRM-ORI, après achèvement du délai de maintien, soit
> après huit mois de l’achèvement du balayage des secteurs objet du marché. La facture comprendra
> également 100% des travaux de réparation de fuites et des réfections réalisés par la Société durant
> les quatre mois de la seconde période de maintien des performances de réseaux.
> 4.Il est à noter que le montant de chaque décompte est réglé au titulaire après réception par le
> maître d’ouvrage des prestations objet du marché en application des prix du bordereau des prix –
> détail estimatif y accordés éventuellement du rabais ou de la majoration indiqués dans le marché,
> aux prestations réellement exécutées.
> 5.Les attachements correspondants au balayage, au maintien des résultats et aux travaux de
> réparation et des réfections seront établis à partir des constatations contradictoires faites sur le
> terrain des travaux et prestations exécutés.
> 6.La Société soumettra à l’approbation de la SRM-ORI à l’achèvement du balayage, et à l’expiration
> de la période du maintien des performances des secteurs hydrauliques et de réparation des fuites
> détectées, la facture relative aux prestations réalisées, accompagnées de tous les attachements,
> pièces justificatives nécessaires à la vérification. Ces factures seront fournies en 5 exemplaires et
> les pièces justificatives en 3 exemplaires.
> La SRM-ORI vérifie la facture et y apporte les rectifications qu’elle juge nécessaires. Dans ce dernier
> cas, la facture rectifiée est soumise dans un délai maximal de quinze jours à la SRM-ORI pour
> validation.
> En cas de contestation par la Société sur la facture rectifiée, seul sera effectué le paiement du
> montant arrêté par la SRM-ORI tant qu’un accord ne sera pas intervenu.
> Il demeure entendu qu’en cas de désaccord, les travaux ne pourront pas être arrêtés par la Société.
> Le paiement se fera dans un délai de 90 jours à partir de la date de dépôt de la facture de décompte
> au bureau d’ordre de la SRM-ORI, accompagnée des attachements des travaux réalisés objet de la
> facture, validés par le maître d’ouvrage.

- **R-CPS-059** [CONTRACTUEL] Le règlement se fait sur la base de décomptes ; une copie de chaque décompte est communiquée à l'entrepreneur dans un délai n'excédant pas dix (10) jours à partir de sa signature par le maître d'ouvrage. [F056 p.11, art. I-32]
- **R-CPS-060** [CONTRACTUEL] L'entrepreneur établit les factures correspondant aux décomptes en cinq (5) exemplaires. [F056 p.11, art. I-32]
- **R-CPS-061** [CONTRACTUEL] Mentions obligatoires de la facture : référence du marché ; identité de l'entrepreneur ; numéro d'identification fiscale ; numéro d'article d'imposition à la taxe professionnelle ; identifiant commun de l'entreprise (ICE) ; date de la facture ; nom ou raison sociale et adresses ; prix, quantités et nature des travaux ; montant de la TVA de manière distincte ; références et mode de paiement ; autres mentions légales. [F056 p.11-12, art. I-32]
- **R-CPS-062** [CONTRACTUEL] Chaque facture est réglée dans un délai maximum de quatre-vingt-dix (90) jours, compté à partir de la date de dépôt de la facture de décompte au bureau d'ordre de la SRM-ORI, accompagnée des attachements validés par le maître d'ouvrage. [F056 p.12-13, art. I-32]
- **R-CPS-063** [CONTRACTUEL] Les attachements sont pris au fur et à mesure de l'exécution des travaux, établis et validés selon l'article 61 du CCAG-T. [F056 p.12, art. I-32]
- **R-CPS-064** [CONTRACTUEL] Mentions obligatoires de l'attachement : (1) référence du marché ; (2) référence de l'ordre de service correspondant ; (3) lieu exact du début et de la fin du chantier concerné, avec si besoin un croquis ou un plan ; (4) numéros des postes du bordereau, désignations et quantités correspondantes. [F056 p.12, art. I-32]
- **R-CPS-065** [CONTRACTUEL] Décomptes provisoires (article 62 du CCAG-T) : dressés par l'agent chargé du suivi « chaque fois qu'il est nécessaire » à partir des attachements, soumis à la signature du maître d'ouvrage ; ils indiquent la date d'acceptation des attachements et servent de base au versement d'acomptes. [F056 p.12, art. I-32]
- **R-CPS-066** [CONTRACTUEL] Le décompte général définitif est établi par l'agent chargé du suivi et signé par le maître d'ouvrage (article 68 du CCAG-T). [F056 p.12, art. I-32]
- **R-CPS-067** [CONTRACTUEL] Facture n° 1 (provisoire) : 100 % du montant du balayage (prix 1), diminué en fonction des performances (débits minimum atteints par rapport aux débits objectifs du tableau n° 1), adressée après achèvement du balayage et des mesures de débit nocturne ; elle comprend aussi 100 % des réparations et réfections réalisées pendant la période du balayage. [F056 p.12, art. I-32 §1]
- **R-CPS-068** [CONTRACTUEL] Facture n° 2 (provisoire) : 40 % du montant du maintien (prix 2), adressée après quatre mois à compter de l'achèvement du balayage ; elle comprend 100 % des réparations et réfections des quatre premiers mois de maintien. [F056 p.12, art. I-32 §2]
- **R-CPS-069** [CONTRACTUEL] Facture n° 3 (« facture dernière ») : 60 % du montant du maintien (prix 2), diminué en fonction des débits maintenus, adressée après huit mois à compter de l'achèvement du balayage ; elle comprend 100 % des réparations et réfections des quatre mois de la seconde période de maintien. [F056 p.13, art. I-32 §3]
- **R-CPS-070** [CONTRACTUEL] Le montant de chaque décompte est réglé après réception par le maître d'ouvrage des prestations, par application des prix du bordereau affectés de la majoration, aux prestations réellement exécutées. [F056 p.13, art. I-32 §4]
- **R-CPS-071** [CONTRACTUEL] Les attachements du balayage, du maintien, des réparations et des réfections sont établis à partir de constatations contradictoires faites sur le terrain. [F056 p.13, art. I-32 §5]
- **R-CPS-072** [CONTRACTUEL] À l'achèvement du balayage et à l'expiration de la période de maintien, la société soumet à l'approbation de la SRM la facture accompagnée de tous les attachements et pièces justificatives : factures en 5 exemplaires, pièces justificatives en 3 exemplaires. [F056 p.13, art. I-32 §6]
- **R-CPS-073** [CONTRACTUEL] La SRM vérifie la facture et la rectifie si nécessaire ; la facture rectifiée est soumise à la SRM pour validation dans un délai maximal de quinze jours ; en cas de contestation, seul le montant arrêté par la SRM est payé tant qu'un accord n'est pas intervenu ; le désaccord n'autorise pas l'arrêt des travaux. [F056 p.13, art. I-32 §6]
- **R-CPS-074** [DÉDUIT] Le CPS organise donc **trois factures** (fin de balayage ; +4 mois ; +8 mois) et non une facturation mensuelle ; il prévoit pourtant des décomptes « chaque fois qu'il est nécessaire » : la tenue d'attachements mensuels (pratique STEPAG, [F001]) reste possible comme pièce de suivi `[À CONFIRMER : périodicité réelle des attachements et des acomptes acceptée par la SRM]`. [F056 p.12-13, art. I-32 ; F001]
- **R-CPS-075** [CONTRACTUEL] Mentions de la facture propres à la SRM (numéro de commande, engagement, service destinataire, code fournisseur) : `[NON PRÉCISÉ]` ; seule « la référence du marché » est exigée. [F056 p.11, art. I-32]

#### Art. I-33 et I-34 Variation de la masse et des quantités

> ARTICLE N° 33. AUGMENTATION OU DIMINUTION DANS LA MASSE DES TRAVAUX
> Elles sont appliquées conformément aux dispositions des articles 57 et 58 du CCAG-T.
> ARTICLE N° 34. CHANGEMENT DANS LES QUANTITES DU DETAIL ESTIMATIF
> Les dispositions de l’article 59 du CCAG-T sont applicables.

- **R-CPS-076** [CONTRACTUEL] Augmentation ou diminution dans la masse des travaux : articles 57 et 58 du CCAG-T ; changement dans les quantités du détail estimatif : article 59. Les seuils ne sont pas reproduits dans le CPS `[À CONFIRMER : règle par défaut du CCAG-T, non vérifiée dans le dossier]`. [F056 p.13, art. I-33 et I-34]

#### Art. I-35 Pénalités

> ARTICLE N° 35. PENALITES POUR RETARD – PENALITES PARTICULIERES
> A – Pénalités pour retard :
> En cas de retard dans l’exécution des travaux, il est appliqué une pénalité par jour calendaire à
> l’encontre de l’entrepreneur. Cette pénalité est égale à un pour mille (1/1000) du montant du
> marché. Ce montant est celui du marché initial, éventuellement majoré par les montants
> correspondants aux travaux supplémentaires et à l’augmentation dans la masse des travaux.
> L’application de ces pénalités ne libère en rien l’entrepreneur de l’ensemble des autres obligations
> et responsabilités qu’il a souscrites au titre du marché.
> Le montant des pénalités est plafonné à huit pour cent (8%) du montant initial du marché
> éventuellement majoré par les montants correspondants aux travaux supplémentaires et à
> l’augmentation dans la masse des travaux.
> Lorsque le plafond des pénalités est atteint, le Maître d’Ouvrage est en droit de résilier le marché.
> B – Pénalités particulières
> A défaut de respect des conditions de remise par l’entrepreneur des documents ou rapports ou à
> défaut de réalisation de certaines de ses obligations, il est appliqué à l’encontre de l’entrepreneur
> les pénalités particulières fixées comme suit :
> - En cas de non-respect des signalisations du chantier conformément à la réglementation,
> la SRM-ORI appliquera une pénalité de 1000 DH/Jour de retard.
> - En cas de non-respect du port des équipements de protection individuels (EPI) par les
> ouvriers de la société conformément à la réglementation, la SRM-ORI appliquera une
> pénalité de 500,00 DH/jour de retard et par ouvrier.
> L'ensemble des montants de ces pénalités est plafonné à deux pour cent (2%) du montant initial du
> marché éventuellement complété par les montants correspondant aux travaux supplémentaires et
> à l'augmentation dans la masse des travaux.
> Elles sont prélevées dans les mêmes conditions que celles prévues au paragraphe A du présent
> article.

- **R-CPS-077** [CONTRACTUEL] Pénalité de retard : par jour calendaire de retard dans l'exécution des travaux, un pour mille (1/1000) du montant du marché (montant initial, éventuellement majoré des travaux supplémentaires et de l'augmentation dans la masse). [F056 p.13, art. I-35 A]
- **R-CPS-078** [CONTRACTUEL] Les pénalités de retard sont plafonnées à huit pour cent (8 %) du montant initial du marché éventuellement majoré ; lorsque le plafond est atteint, le maître d'ouvrage est en droit de résilier le marché. [F056 p.13, art. I-35 A]
- **R-CPS-079** [CONTRACTUEL] Pénalités particulières : non-respect de la signalisation du chantier : 1000 DH par jour de retard ; non-port des équipements de protection individuels : 500,00 DH par jour de retard et par ouvrier. Leur total est plafonné à deux pour cent (2 %) du montant initial éventuellement majoré ; elles sont prélevées comme les pénalités de retard. [F056 p.13-14, art. I-35 B]
- **R-CPS-080** [CONTRACTUEL] Le chapeau du § B annonce des pénalités « à défaut de respect des conditions de remise […] des documents ou rapports », mais aucun montant n'est fixé pour la non-remise d'un rapport ou d'une fiche : `[NON PRÉCISÉ]`. [F056 p.13, art. I-35 B]

#### Art. I-36 à I-39 (résumés)

- **R-CPS-081** [CONTRACTUEL] Art. I-36 : retenue à la source de 10 % pour les titulaires étrangers non résidents (sans objet pour STEPAG). Art. I-37 : mesures coercitives, article 79 du CCAG-T. Art. I-38 : résiliation selon le règlement des marchés de la SRM et le CCAG-T, notamment l'article 69. Art. I-39 : différends réglés selon les articles 81 à 84 du CCAG-T ; tribunaux compétents d'Oujda. [F056 p.14, art. I-36 à I-39]

### 3.3 Partie II : cahier des prescriptions spéciales

La numérotation recommence à l'article 1 : les articles ci-dessous sont cités `art. II-n`.

#### Art. II-1 à II-6 Lieux, installation, hygiène, gardiennage (résumés)

- **R-CPS-082** [CONTRACTUEL] Art. II-1 : l'entrepreneur est réputé connaître les lieux et toutes les conditions d'exécution (accès, nature des terrains, géologie, pluies). [F056 p.15, art. II-1]
- **R-CPS-083** [CONTRACTUEL] Art. II-2 : l'entrepreneur fait son affaire de l'occupation des terrains d'installation de chantier ; la SRM peut mettre des emprises à disposition, sur demande et accord préalables. [F056 p.15, art. II-2]
- **R-CPS-084** [CONTRACTUEL] Art. II-3 : l'installation de chantier, à la charge de l'entreprise, comprend un bureau pour la SRM d'environ quinze (15) m2, équipé en eau, électricité, téléphone et mobilier de réunion (table, chaises, panneaux d'affichage). [F056 p.15, art. II-3]
- **R-CPS-085** [CONTRACTUEL] Art. II-4 à II-6 : hygiène des cantonnements, service médical (dont bénéficie gratuitement le personnel de la SRM), gardiennage de jour et de nuit, propreté du chantier et respect des consignes de police de chantier sont à la charge de l'entrepreneur ; aucune indemnité pour vol. [F056 p.15-16, art. II-4 à II-6]

#### Art. II-7 Signalisation de chantier

> ARTICLE N° 7. SIGNALISATION DE CHANTIER
> 1. La signalisation complète de jour ou de nuit de ses chantiers (travaux de pose des conduites, de
> branchements, etc…), tant extérieure qu'intérieure incombe à l'Entrepreneur (Acquisition et
> installation à sa charge) et ce conformément aux règles de l’art.
> Ainsi, l’Entrepreneur doit procéder pour chaque chantier à la mise en place de :
> - Panneaux de renseignements sur chantier en toile suivant indication de la SRM-ORI.
> - Panneaux de signalisation des Travaux suivant indication de la SRM-ORI.
> - Panneaux de limitation de vitesse.
> - Des cônes de signalisation avec un espacement de 10 m.
> - Des bandes fluorescentes de signalisation.
> - Des gyrophares de signalisation de nuit.
> 2. Lorsque les travaux intéressent la circulation routière ou ferroviaire, l'Entrepreneur doit
> satisfaire à toutes les obligations et prescriptions de signalisation en vigueur. Il soumettra aux
> autorités compétentes les plans de signalisation, les modalités d'interruption de circulation et
> les panneaux, feux de signalisation qu'il compte utiliser et demandera, en temps utile, aux
> Administrations les autorisations nécessaires pour le ralentissement, ou l'interruption
> temporaire de la circulation. L'Entrepreneur devra se soumettre aux conditions que ces mêmes
> Administrations jugeraient à propos de lui imposer en vue de la sécurité routière en général,
> notamment la mise en place des palissades dans les endroits sensibles de la ville.

- **R-CPS-086** [CONTRACTUEL] Pour chaque chantier, l'entrepreneur met en place à ses frais : panneaux de renseignements en toile (suivant indication SRM) ; panneaux de signalisation des travaux ; panneaux de limitation de vitesse ; cônes espacés de 10 m ; bandes fluorescentes ; gyrophares de signalisation de nuit. [F056 p.16, art. II-7]
- **R-CPS-087** [CONTRACTUEL] Quand les travaux touchent la circulation, l'entrepreneur soumet aux autorités les plans de signalisation et demande lui-même, en temps utile, les autorisations de ralentissement ou d'interruption de circulation ; palissades dans les endroits sensibles. [F056 p.16, art. II-7]

#### Art. II-8 à II-13 (résumés)

- **R-CPS-088** [CONTRACTUEL] Art. II-8 et II-9 : près des lieux habités, réduire la gêne (accès, bruit, fumées, poussières) aux frais de l'entrepreneur ; respect des règlements de police et de voirie ; l'entrepreneur est responsable des dégâts commis sur son chantier par son personnel ou des tiers. [F056 p.16, art. II-8 et II-9]

> ARTICLE N° 10. PRESENCE DE L’ENTREPRENEUR
> L’entrepreneur sera tenu d’assister personnellement à toute visite de chantier ou à toute réunion
> demandée par le Maître de l’ouvrage.
> Pendant la durée des travaux, l’entrepreneur sera représenté sur place par le Directeur de chantier
> qualifié. Si cette qualification n’apparaît pas suffisante, le Maître de l’ouvrage peut demander le
> remplacement ou l’assistance jugée nécessaire, le remplacement doit être effectué 48 heures après
> la demande de la SRM-ORI.

- **R-CPS-089** [CONTRACTUEL] Art. II-10 : l'entrepreneur assiste personnellement à toute visite de chantier ou réunion demandée ; il est représenté sur place par un directeur de chantier qualifié, dont la SRM peut demander le remplacement, à effectuer 48 heures après la demande. [F056 p.16, art. II-10]
- **R-CPS-090** [CONTRACTUEL] Art. II-11 : en cas d'insuffisance professionnelle ou de non-respect du marché, avertissement écrit préalable à une résiliation. Art. II-12 : garantie contre les revendications de brevets. Art. II-13 : aucun arrêt des travaux sans accord de la SRM ; pas d'indemnité si une autorité ordonne l'arrêt. [F056 p.16-17, art. II-11 à II-13]

#### Art. II-14 Réalisation des travaux (phasage)

> ARTICLE N° 14. REALISATION DES TRAVAUX
> Les travaux seront réalisés de la manière suivante :
> Après établissement et réception de l’ordre de service de commencement des travaux par
> l’entreprise, celle-ci entamera les travaux de balayage des secteurs objet du présent marché
> conformément au tableau n° 1 , le délai de cette première opération est fixé à 4 mois qui seront
> sanctionnes par la réalisation de mesure des performances atteintes conformément à l’article 52.8
> Après expiration du délai du balayage, l’entreprise entamera les deux phases de maintien des
> performances dont les délais sont fixés à 4 mois chacune soit 2x4= 8 mois
> Si l’entreprise accuse un retard dans des phases précédemment décrite, ce retard entrainera une
> pénalité calculée conformément au CPS

- **R-CPS-091** [CONTRACTUEL] Phase 1 : après réception de l'ordre de service de commencement, l'entreprise entame le balayage des secteurs conformément au tableau n° 1 ; délai de cette opération : 4 mois, sanctionnés par la mesure des performances atteintes. [F056 p.17, art. II-14]
- **R-CPS-092** [CONTRACTUEL] Phases 2 et 3 : après expiration du délai du balayage, deux phases de maintien des performances de 4 mois chacune, soit 2 × 4 = 8 mois. [F056 p.17, art. II-14]
- **R-CPS-093** [CONTRACTUEL] Un retard dans l'une de ces phases entraîne une pénalité « calculée conformément au CPS » (renvoi implicite à l'art. I-35 A : 1/1000 par jour calendaire). [F056 p.17, art. II-14 ; F056 p.13, art. I-35]
- **R-CPS-094** [CONTRACTUEL] Le renvoi « conformément à l'article 52.8 » ne correspond à aucun article du CPS `[À CONFIRMER : renvoi hérité d'un ancien cahier des charges ; la mesure des performances après balayage est décrite à l'art. II-22]`. [F056 p.17, art. II-14]

#### Art. II-15 Conditions de réalisation des travaux

> ARTICLE N° 15. LES CONDITIONS DE RÉALISATION DES TRAVAUX
> Les prestations de la mission définies ci-après sont indicatives et nullement limitatives. En fait
> l’Entrepreneur s’engage à exécuter les travaux dans les règles de l’art.
> L’Entrepreneur doit donner tous les renseignements et documents nécessaires à la compréhension
> et à la justification du travail effectué, il est aussi tenu d’apporter à son projet, et sans rémunération
> supplémentaire, toutes les modifications qui seront jugées nécessaires pour son approbation.
> L’Entrepreneur doit noter que pour les différentes prestations définies ci-après, l’élaboration des
> documents devra tenir compte des différentes directives émises par la SRM-ORI et traiter tous les
> aspects que la SRM-ORI souhaite voir analyser dans ce genre prestations. L’approbation finale des
> prestations ne se fera que lorsque tous les intervenants dans cette opération auront donné leur
> accord définitif.
> Les prestations consistent en la réalisation des travaux de recherche à l’aide des équipements de
> recherche des fuites sur les réseaux de distribution d'eau potable de certains secteurs de la
> Préfecture Oujda-Angad conformément aux directives de la SRM-ORI ainsi que la réalisation des
> travaux visant le maintien des résultats obtenus après l’achèvement du délai de balayage.
> L’établissement de rapports journaliers et mensuels et le report des fuites sur plans, concernant les
> secteurs objets des travaux fait également partie des prestations à réaliser par l’adjudicataire,
> l’établissement de ces rapports sera à la charge de l’entreprise adjudicataire et à ses frais).
> En cas de besoin particulier, la SRM-ORI peut demander la substitution des travaux de détection
> d’un secteur prévu initialement dans le tableau récapitulatif relatif aux conditions de réalisation des
> travaux exigés par la SRM-ORI par un autre de même caractéristiques hydrauliques et performances
> pourvu que ce changement reçoît l’accord de l’entreprise, cet accord sera consigné sur un procès-
> verbal.
> N.B. :
> - Les travaux de réparation des fuites seront réalisés par l’entreprise (fourniture, transport et
> pose du matériel à la charge de la société).
> -Tout le matériel de réparation de fuites utilisé sera soumis à l'approbation de la SRM-ORI avant
> le démarrage des travaux (le matériel doit être conforme aux normes en vigueur)
> Les conditions de réalisation des travaux sont arrêtées conformément au tableau récapitulatif N°1
> ci-après :

- **R-CPS-095** [CONTRACTUEL] Les prestations décrites sont « indicatives et nullement limitatives » ; l'entrepreneur apporte sans rémunération supplémentaire toutes les modifications jugées nécessaires à l'approbation de ses documents, qui tiennent compte des directives de la SRM. [F056 p.17, art. II-15]
- **R-CPS-096** [CONTRACTUEL] L'établissement des rapports journaliers et mensuels et le report des fuites sur plans, pour les secteurs objet des travaux, font partie des prestations, à la charge et aux frais de l'entreprise. [F056 p.17, art. II-15]
- **R-CPS-097** [CONTRACTUEL] La SRM peut demander la substitution d'un secteur du tableau n° 1 par un autre de mêmes caractéristiques hydrauliques et performances, avec l'accord de l'entreprise consigné sur procès-verbal. [F056 p.17, art. II-15]
- **R-CPS-098** [CONTRACTUEL] Les travaux de réparation des fuites sont réalisés par l'entreprise : fourniture, transport et pose du matériel à sa charge. [F056 p.17, art. II-15 N.B.]
- **R-CPS-099** [CONTRACTUEL] Tout le matériel de réparation utilisé est soumis à l'approbation de la SRM-ORI avant le démarrage des travaux et doit être conforme aux normes en vigueur. [F056 p.17, art. II-15 N.B.]

**Tableau n° 1 : « TABLEAU RECAPITULATIF RELATIF AUX CONDITIONS DE REALISATION DES TRAVAUX EXIGEES PAR LA SRM-ORI »** (transcription contrôlée visuellement sur les pages 18 et 19 ; les quatre dernières colonnes sont des cellules fusionnées communes à toutes les zones).

| N° | Zone d'intervention | Secteur d'intervention (texte exact) | Linéaire approximatif du réseau par zone | Unité | Nombre de balayages prévus sur la totalité des secteurs | Délai maximum d'exécution du balayage | Débit nocturne minimum à assurer à l'achèvement du balayage « Q exigé » | Unité | Périodicité maximale du contrôle du débit nocturne après achèvement du balayage | Délai de garantie sur maintien du gain après achèvement du balayage | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Zone université 7000m3 et champ tir | Qods Haut, Andalous, Chu - Mouhoub -Iriss, Maafa Bekay Bas, Ballaoui Bas-Irfane- Unisit-Colline-Partie H Ain Serrak, Qods Bas, Château Sidi Aissa Azengot, Maksam-Kharoub | 358 | km | Une fois au minimum | 4 mois | 126 | m3/h | Hebdomadaire | 8 mois | [F056 p.18] |
| 2 | Zone jbel hamra DN700 | Lazaret Bas, Tairet, Mbasso, Tennis2, Sidi Driss, Secteur Tazaghine, El Boustane, Ghar El Baroud-Zone Industrielle | 362 | km | Une fois au minimum | 4 mois | 130 | m3/h | Hebdomadaire | 8 mois | [F056 p.18] |
| 3 | Zone Reservoir AIN SERRAK 5000M3 | Derfoufi et Zerkrtouni – Mohammadi Intérieur – Allal Ben Abdellah – Oued Makhazine, Mauritanie et Hassani – Mohammadi Extérieur - Benkhirane | 228 | km | Une fois au minimum | 4 mois | 118 | m3/h | Hebdomadaire | 8 mois | [F056 p.18] |
| 4 | Zone Sidi Yahya 5000 M3 4000M3 | Sidi yahya, Pam ,Lazaret haut,Abdellah Guenoun | 399 | km | Une fois au minimum | 4 mois | 112 | m3/h | Hebdomadaire | 8 mois | [F056 p.18] |
| 5 | Zone jbel hamra DN600 | Medina , Rte Algerie, Tennis 1 Aounia,Atlas,Lieutenant Belhoucine,Boudir | 119 | km | Une fois au minimum | 4 mois | 83 | m3/h | Hebdomadaire | 8 mois | [F056 p.19] |
| TOTAL | — | — | 1466 | km | — | — | - | — | — | — | [F056 p.19] |

Texte complet de la cellule « Périodicité » : « Hebdomadaire (moyennant le matériel de télégestion' télé relève' des compteurs de la SRM-ORI ou en cas d'indisponibilité le matériel de mesure de la SRM-ORI ou de l'entreprise.) ». [F056 p.18]

| N° | Zone | Débit minimum le plus bas atteint lors des campagnes précédentes | Débit actuel mesuré | Q exigé | Unité | Baisse exigée par rapport au débit actuel (déduit) | Source |
|---|---|---|---|---|---|---|---|
| 1 | Zone université 7000m3 et champ tir | 133 | 158 | 126 | m3/h | 32 | [F056 p.18-19] |
| 2 | Zone jbel hamra DN700 | 136 | 162 | 130 | m3/h | 32 | [F056 p.18-19] |
| 3 | Zone Reservoir AIN SERRAK 5000 | 133 | 148 | 118 | m3/h | 30 | [F056 p.18-19] |
| 4 | Zone Sidi Yahya 5000 M3 et 4000M3 | 99 | 140 | 112 | m3/h | 28 | [F056 p.18-19] |
| 5 | Zone jbel hamra DN600 | 79 | 104 | 83 | m3/h | 21 | [F056 p.18-19] |

> N.B/ Débits min les plus bas atteints lors des précédentes compagnes de recherche de fuites par la SRM ou dans le cadre de la sous-traitance :
> Zone université 7000m3 et champ tir : 133 m3/h
> Zone jbel hamra DN700 : 136 m3/h
> Zone Reservoir AIN SERRAK 5000 :133 m3/h
> Zone Sidi Yahya 5000 M3 et 4000M3 : 99 m3/h
> Zone jbel hamra DN600 : 79 m3/h
> Débits actuels mesurés aux secteurs
> Zone université 7000m3 et champ tir : 158 m3/h
> Zone jbel hamra DN700 : 162 m3/h
> Zone Reservoir AIN SERRAK 5000 : 148 m3/h
> Zone Sidi Yahya 5000 M3 et 4000M3 : 140 m3/h
> Zone Jbel hamra DN600 : 104 m3/h
> A noter que les débits indiqués concernent la somme des débits relevés sur les ouvrages du comptage de chaque secteur de la zone d’intervention, les débits à
> assurer seront mesurés de cette manière.
> Les différents secteurs hydrauliques mentionnés sont identifiés par des points de mesures
> implantés sur le réseau de distribution qui serviront pour le contrôle et le suivi de l’évolution des
> débits nocturnes minimums enregistrés au niveau des réseaux correspondants.
> Les travaux de recherche de fuites réalisés par l’entrepreneur doivent réduire au maximum les
> pertes d’eau existantes sur les réseaux des différents secteurs, et assurer le maintien des gains en
> distribution obtenus à l’achèvement du balayage.
> Au cours du balayage l’entrepreneur doit réduire les débits nocturnes minimums enregistrés
> mesurés avant intervention suivant les débits minimums et conformément au tableau récapitulatif
> N° 1 et ci-dessus.
> Au cours du balayage, le linéaire d'une conduite inspectée ne sera rémunéré qu'une seule fois quel
> que soit le nombre de passages qui y seront opérés.
> L’entrepreneur peut faire recours à des techniques de pointes telle que la technique de pré
> localisation des fuites par l’exploitation des capteurs enregistreurs de bruit permettant la
> surveillance et le contrôle du fonctionnement des réseaux des différents secteurs au cours de la
> période de garantie pour assurer le maintien des gains obtenus au cours du balayage.
> Les gains en distribution assurés par l’entrepreneur au niveau de chaque secteur à partir de la date
> d’achèvement du balayage ne doivent pas connaître une détérioration supérieure à 25%.
> Néanmoins, au cours de la période de garantie, les débits minimums seront contrôlés avec une
> fréquence maximale d’un contrôle chaque semaine, ces contrôles seront effectués, avec les moyens
> de télégestion (télé relève) de la SRM-ORI ou en cas d’indisponibilité par les enregistreurs de débit
> et pression de l’adjudicataire ou de la SRM-ORI, ayant reçu l’accord de celui-ci.
> Les dates de contrôle qui seront pris en considération pour le calcul de l’amélioration ou de la
> dégradation des résultats obtenus durant la période du maintien, seront fixées par la SRM-ORI, la
> durée entre ces dates prises pour ce calcul, doit être la même, elle ne doit pas dépasser sept jours.
> En cas de non-participation de l’entreprise à ces contrôles, les résultats qui en découlent ne peuvent
> être remis en cause par celle-ci et seront pris en considération pour le calcul des variations des gains
> obtenus après le balayage, ces mesures de contrôle serviront de base au calcul des pénalités.
> Pour un secteur donné le résultat de la différence entre la moyenne des débits minimum
> enregistrés lors des opérations de contrôle du maintien et le débit minimum enregistré à
> l’achèvement du balayage est égal à la dégradation ou à l’amélioration des gains obtenus.
> L’entrepreneur doit donner tous les renseignements et documents nécessaires à la compréhension
> et à la justification du travail effectué et sera aussi tenu d’apporter à son projet, et sans
> rémunération supplémentaire toutes les modifications qui seront jugées nécessaires pour son
> approbation.
> L’entrepreneur doit noter que pour les différentes prestations définies ci-après, l’élaboration des
> documents devra tenir compte des différentes directives émises par la SRM-ORI et traiter tous les
> aspects que celle-ci souhaite voir analyser dans ce genre de prestations.

- **R-CPS-100** [CONTRACTUEL] Le tableau n° 1 fixe, pour chacune des 5 zones, les secteurs, le linéaire approximatif (358, 362, 228, 399, 119 km ; total 1466 km) et le débit nocturne minimum à atteindre à la fin du balayage (Q exigé : 126, 130, 118, 112, 83 m3/h). [F056 p.18-19, tableau n° 1]
- **R-CPS-101** [CONTRACTUEL] Pour toutes les zones : au moins un balayage de la totalité des secteurs ; délai maximum du balayage 4 mois ; contrôle du débit nocturne au plus hebdomadaire après le balayage ; garantie de maintien du gain 8 mois après l'achèvement du balayage. [F056 p.18, tableau n° 1]
- **R-CPS-102** [CONTRACTUEL] Débits de référence par zone (1 à 5) : plus bas historiques 133, 136, 133, 99, 79 m3/h ; débits actuels mesurés 158, 162, 148, 140, 104 m3/h. Pour la zone 4, le Q exigé (112) est supérieur au plus bas historique (99) ; pour les autres zones il est inférieur. [F056 p.19]
- **R-CPS-103** [CONTRACTUEL] Le débit d'une zone est la somme des débits relevés sur les ouvrages de comptage de chaque secteur de la zone ; les débits à assurer sont mesurés de cette manière. [F056 p.19]
- **R-CPS-104** [CONTRACTUEL] Les secteurs hydrauliques sont identifiés par des points de mesure implantés sur le réseau, qui servent au contrôle et au suivi des débits nocturnes minimums. [F056 p.21, art. II-15]
- **R-CPS-105** [CONTRACTUEL] Au cours du balayage, le linéaire d'une conduite inspectée n'est rémunéré qu'une seule fois, quel que soit le nombre de passages. [F056 p.21, art. II-15]
- **R-CPS-106** [CONTRACTUEL] L'entrepreneur peut utiliser des techniques de pointe, telle la pré-localisation par capteurs enregistreurs de bruit, pour surveiller les réseaux pendant la période de garantie. [F056 p.21, art. II-15]
- **R-CPS-107** [CONTRACTUEL] Les gains en distribution obtenus à la fin du balayage ne doivent pas connaître, par secteur, une détérioration supérieure à 25 %. [F056 p.21, art. II-15]
- **R-CPS-108** [CONTRACTUEL] Pendant la période de garantie, les débits minimums sont contrôlés au plus une fois par semaine, par la télégestion (télé-relève) de la SRM ou, à défaut, par les enregistreurs de débit et de pression de l'adjudicataire ou de la SRM ayant reçu l'accord de celle-ci. [F056 p.21, art. II-15]
- **R-CPS-109** [CONTRACTUEL] Les dates de contrôle retenues pour le calcul sont fixées par la SRM ; l'intervalle entre deux dates est constant et ne dépasse pas sept jours. [F056 p.21, art. II-15]
- **R-CPS-110** [CONTRACTUEL] Si l'entreprise ne participe pas aux contrôles, elle ne peut en contester les résultats ; ces mesures servent de base au calcul des pénalités. [F056 p.21, art. II-15]
- **R-CPS-111** [CONTRACTUEL] Pour un secteur, dégradation ou amélioration des gains = moyenne des débits minimums enregistrés lors des contrôles du maintien − débit minimum enregistré à l'achèvement du balayage. [F056 p.21, art. II-15]

#### Art. II-16 Vérification de la sectorisation

> ARTICLE N° 16. VERIFICATION DE LA SECTORISATION DU RESEAU
> L’entrepreneur est tenu d’adopter le même mode d’alimentation des secteurs au cours des travaux
> de mesures des débits nocturnes minimums enregistrés avant et après intervention en tenant
> compte de l’état des vannes de séparation.
> L'entreprise, en collaboration avec les services de la SRM-ORI, prendra en charge la vérification de
> la sectorisation par le diagnostic et le contrôle de l'étanchéité des vannes de séparation. La
> manœuvre des vannes sera effectuée par les agents de la SRM-ORI.

- **R-CPS-112** [CONTRACTUEL] L'entreprise adopte le même mode d'alimentation des secteurs pour les mesures de débit avant et après intervention, en tenant compte de l'état des vannes de séparation ; elle vérifie avec la SRM la sectorisation (diagnostic et étanchéité des vannes de séparation). [F056 p.22, art. II-16]
- **R-CPS-113** [CONTRACTUEL] La manœuvre des vannes est effectuée par les agents de la SRM-ORI. [F056 p.22, art. II-16]

#### Art. II-17 Mesure des débits de nuit avant recherche

> ARTICLE N° 17. MESURE DES DEBITS DE NUIT, AVANT OPERATION DE RECHERCHE DES
> FUITE
> Les Mesures de nuit avant intervention seront effectuées sur l’ensemble des zones objets
> du marché juste après l’établissement de l’ordre de service. Ces mesures seront effectuées chaque
> 15 minute et chaque nuit de 0h à 6h du matin pendant trois jours. Le débit de nuit en m3/h retenu
> pour chaque nuit sera le débit minimal enregistré lors des mesures effectuées pendant cette nuit.
> Le débit de nuit (Qi) avant intervention qui sera pris en considération par la suite sera donc le
> minimum des trois valeurs minimales trouvées pendant les trois nuits. (Le minimum des trois
> minimums). (Voir tableau indicatif ci -après) :
> Nuit : (i= 1,2 ou 3)
> Heure de mesure Débit de nuit mesuré
> (m3/h)
> 0h 00 min Q1
> 0h 15 min Q2
> 0h 30min Q3
> … …
> 6h 00 min Q25
> Débit de nuit (m3 / h) de la nuit i : Qi = Min (Q1, Q2, Q3, ….Q25)
> Un procès-verbal des mesures sera établi et signé par l’entreprise et la SRM-ORI.
> N.B : Pour les secteurs dotés de comptage, les mesures de débits de nuit seront réalisées
> en se basant sur les données du système de télégestion (télé-relève). Cependant
> l'entreprise pourra procéder à la vérification des Débit Mètre secteur par un
> débitmètre portable à insertion ou à ultrasons. Dans le cas où les mesures de
> débits de nuit (soit lors des balayages ou au cours des opérations de suivi du
> maintien des performances des secteurs) seront réalisées directement sur les
> conduites de la SRM-ORI, l'entreprise ne pourra prétendre dans ce cas à aucune
> rémunération.

- **R-CPS-114** [CONTRACTUEL] Les mesures de nuit avant intervention sont faites sur toutes les zones juste après l'ordre de service : toutes les 15 minutes, chaque nuit de 0 h à 6 h, pendant trois jours (25 mesures Q1 à Q25 par nuit). [F056 p.22, art. II-17]
- **R-CPS-115** [CONTRACTUEL] Débit de la nuit i : `Qi = Min(Q1, Q2, …, Q25)` en m3/h ; le débit de nuit avant intervention retenu est le minimum des trois minimums. [F056 p.22, art. II-17]
- **R-CPS-116** [CONTRACTUEL] Un procès-verbal des mesures est établi et signé par l'entreprise et la SRM-ORI. [F056 p.22, art. II-17]
- **R-CPS-117** [CONTRACTUEL] Pour les secteurs dotés de comptage, les mesures s'appuient sur la télégestion (télé-relève) ; l'entreprise peut vérifier les débitmètres de secteur par débitmètre portable à insertion ou à ultrasons ; les mesures faites directement sur les conduites de la SRM ne donnent droit à aucune rémunération. [F056 p.22, art. II-17 N.B.]

#### Art. II-18 Recherche des fuites

> ARTICLE N° 18. RECHERCHE DES FUITES
> Recherche et détection de fuites par l’entreprise
> Cette phase consiste en :
> Les opérations de détection des fuites par les différentes méthodes de détection de
> fuites à savoir détection systématique de fuites par appareil acoustique, localisation
> des fuites par corrélations et mise en place de capteurs enregistreurs de bruit
> Le repérage des fuites détectées et leur implantation sur un plan à une échelle
> appropriée, avec toutes les indications nécessaires ;
> La confirmation de la fuite en présence des agents de la SRM-ORI et de l’entreprise
> après exécution des travaux d’ouverture de tranchée
> Dans tous les cas la cadence moyenne de l’inspection du réseau par l’entreprise
> adjudicataire ne doit pas être inférieure à quatre kilomètres par jour par équipe (4
> Kms/jour/équipe), pendant la période du balayage.
> Le nombre minimum des équipes de détection de fuites exigées est de 4 équipes pendant la
> période du balayage et du maintien.

- **R-CPS-118** [CONTRACTUEL] La recherche comprend : la détection systématique par appareil acoustique, la localisation par corrélation et la mise en place de capteurs enregistreurs de bruit. [F056 p.22, art. II-18]
- **R-CPS-119** [CONTRACTUEL] Les fuites détectées sont repérées et implantées sur un plan à une échelle appropriée, avec toutes les indications nécessaires. [F056 p.22, art. II-18]
- **R-CPS-120** [CONTRACTUEL] La fuite est confirmée en présence des agents de la SRM-ORI et de l'entreprise, après exécution des travaux d'ouverture de tranchée. [F056 p.22, art. II-18]
- **R-CPS-121** [CONTRACTUEL] La cadence moyenne d'inspection ne doit pas être inférieure à quatre kilomètres par jour et par équipe (4 km/jour/équipe) pendant la période du balayage. [F056 p.23, art. II-18]
- **R-CPS-122** [CONTRACTUEL] Le nombre minimum d'équipes de détection exigé est de 4 équipes pendant le balayage et le maintien. [F056 p.23, art. II-18]
- **R-CPS-123** [DÉDUIT] Contrôle de cohérence : 1466 km en 4 mois avec 4 équipes à 4 km/jour = 16 km/jour, soit environ 92 jours de travail ; la cadence minimale permet de tenir le délai si l'on travaille 6 jours par semaine (≈ 104 jours ouvrés en 4 mois). [F056 p.23 ; F056 p.19]

#### Art. II-19 Réparation des fuites

> ARTICLE N° 19. REPARATION DES FUITES
> Toute fuite détectée et localisée par les moyens de recherche des fuites, doit être signalée au
> représentant de la SRM-ORI
> La tranchée au niveau de la fuite détectée sera ouverte, en présence du représentant de la SRM-
> ORI et celui de l’entreprise.
> Si la fuite est constatée, au niveau de la tranchée ouverte, la fiche qui la concerne devra être
> renseignée et signée par L’entreprise, dont une copie sera transmise à la SRM-ORI.
> Il faut signaler que :
> Si une tranchée ouverte ne révèle aucune fuite (siège de la fuite ne se situe pas dans le tranché), le
> soumissionnaire aura l’obligation de Recommencer la prospection sure :
> Toute la zone d'influence du capteur enregistreur indiquant la présence de la fuite, en cas
> d’inspection avec enregistreurs de bruit ;
> Le tronçon concerné en cas d’inspection par corrélateur
> Dans tous les cas, chaque mètre du secteur prospecté n’étant rémunéré qu’une seule fois ;
> En vue d’avoir une bonne précision de la localisation des fuites et quelque soit la nature de
> la conduite, leur inspection par le matériel de recherche de fuites sera faite sur des
> distances inférieures à 100 mètres entre capteurs, dans le cas de conduite en PVC ou
> polyéthylène cette distance est réduite à 50 mètres ;
> Lors de la recherche des fuites, les opérations de mise en évidence des accès aux conduites
> (au niveau des bouches à clés, vanne, robinets et autres) restent à la charge de l'entreprise
> ; ces opérations comprennent la détection des bouches à clé, le curage, et toute autre
> opération permettant la mise en place des équipements de détection ;
> L’inspection du réseau concernera également les branchements sans que leurs linéaires ne
> soient pris en compte dans la rémunération
> NB : Les fuites détectées doivent être communiquées le jour même à la SRM-ORI pour validation.

- **R-CPS-124** [CONTRACTUEL] Toute fuite détectée et localisée doit être signalée au représentant de la SRM-ORI. [F056 p.23, art. II-19]
- **R-CPS-125** [CONTRACTUEL] La tranchée au niveau de la fuite détectée est ouverte en présence du représentant de la SRM-ORI et de celui de l'entreprise. [F056 p.23, art. II-19]
- **R-CPS-126** [CONTRACTUEL] Si la fuite est constatée dans la tranchée ouverte, la fiche qui la concerne est renseignée et signée par l'entreprise, et une copie est transmise à la SRM-ORI. [F056 p.23, art. II-19]
- **R-CPS-127** [CONTRACTUEL] Si la tranchée ne révèle aucune fuite (le siège de la fuite n'est pas dans la tranchée), l'entreprise doit recommencer la prospection sur toute la zone d'influence du capteur enregistreur (inspection par enregistreurs de bruit) ou sur le tronçon concerné (inspection par corrélateur), sans nouvelle rémunération du linéaire. Le paiement du terrassement de cette fouille est `[NON PRÉCISÉ]`. [F056 p.23, art. II-19]
- **R-CPS-128** [CONTRACTUEL] Distance entre capteurs lors de l'inspection : inférieure à 100 mètres quelle que soit la conduite ; réduite à 50 mètres pour les conduites en PVC ou en polyéthylène (`distance < 100 m` ; `distance ≤ 50 m` pour PVC et PE `[À CONFIRMER : inclusivité]`). [F056 p.23, art. II-19]
- **R-CPS-129** [CONTRACTUEL] La mise en évidence des accès aux conduites (détection des bouches à clé, vannes, robinets, curage et toute opération permettant de poser les équipements de détection) reste à la charge de l'entreprise. [F056 p.23, art. II-19]
- **R-CPS-130** [CONTRACTUEL] L'inspection porte aussi sur les branchements, sans que leur linéaire soit pris en compte dans la rémunération. [F056 p.23, art. II-19]
- **R-CPS-131** [CONTRACTUEL] « Les fuites détectées doivent être communiquées le jour même à la SRM-ORI pour validation. » Canal, heure limite et forme : `[NON PRÉCISÉ]`. [F056 p.23, art. II-19 NB]
- **R-CPS-132** [CONTRACTUEL] Aucun délai de réparation à compter de la détection ou de la validation n'est fixé par le CPS : `[NON PRÉCISÉ]`. Le seuil de 48 h du cadrage de l'application est une règle interne STEPAG, non contractuelle. [F056 p.23, art. II-19]

#### Art. II-20 Réfection de chaussées

> ARTICLE N° 20. REFECTION DE CHAUSSEES
> La réfection de la chaussée doit comprendre :
> le remblaiement de la tranchée par tout venant GNA de 0,50 m de hauteur compacté arrosé
> jusqu’au niveau de la chaussée.
> Une couche d’imprégnation de cut back ou émulsion
> Une couche d’enrobés à chaud conformément à l’épaisseur originale de la chaussée
> conformément aux exigences de la Commune Urbaine (Epaisseur des enrobés de 7 cm).
> Les réfections de chaussés doivent être exécutées dans un délai ne dépassant pas 1 mois à partir
> de la date de réparation des fuites.
> En cas de dépassement de ce délai, l’entreprise doit exécutées les réfections en utilisant une
> enrobé-résine à froid à base de bitume et d'élastomère qui a les caractéristiques suivantes :
> • Granulométrie : mm UNE EN 12697 – 2 0/4
> • Densité Gr/cm3 UNE EN 12697 – 6 1,7 / 1,9
> • Résistance à la perte de particules ONE EN 12697 - 17* 0,0 / 5,0
> En cas d’utilisation d’enrobé-résine pour les réfections de chaussées, l'entreprise ne pourra
> prétendre à aucune rémunération supplémentaire.

- **R-CPS-133** [CONTRACTUEL] La réfection de chaussée comprend : remblaiement de la tranchée en tout venant GNA de 0,50 m compacté et arrosé jusqu'au niveau de la chaussée ; couche d'imprégnation de cut back ou émulsion ; couche d'enrobés à chaud de 7 cm (exigence de la Commune Urbaine). [F056 p.23, art. II-20]
- **R-CPS-134** [CONTRACTUEL] Les réfections de chaussée sont exécutées dans un délai ne dépassant pas 1 mois à partir de la date de réparation de la fuite. [F056 p.23, art. II-20]
- **R-CPS-135** [CONTRACTUEL] Passé ce délai, l'entreprise doit réaliser la réfection en enrobé-résine à froid à base de bitume et d'élastomère (granulométrie 0/4 selon UNE EN 12697-2 ; densité 1,7 / 1,9 g/cm3 selon UNE EN 12697-6 ; résistance à la perte de particules 0,0 / 5,0 selon EN 12697-17), sans aucune rémunération supplémentaire. [F056 p.23-24, art. II-20]
- **R-CPS-136** [CONTRACTUEL] Aucun délai n'est fixé pour la réfection des trottoirs : `[NON PRÉCISÉ]`. [F056 p.23, art. II-20]

#### Art. II-21 Essais et documents de suivi

> ARTICLE N° 21. ESSAIS PAR LE LABORATOIRE
> Les essais à la charge de l’entreprise sont :
> Contrôle de réfections de chaussée par carottage (corps de chaussée)
> La fréquence des essais est détaillée comme suit :
> 1 prélèvement chaque 50m2 réalisé
> Si les résultats des essais ne sont pas satisfaisants, l’entreprise est invitée à reprendre les anomalies
> constatées et effectuer d’autres essais avec la même fréquence à sa charge, une pénalité sera
> appliquée à l’entreprise elle sera équivalente à deux fois le prix des travaux de réfection de la partie
> dont la réalisation n’est pas conforme aux exigences de la SRM-ORI prévues dans le présent cahier
> des charges.
> L’opération de recherche de fuites donnera lieu à l’établissement des rapports, plans et fiches de
> suivi ci-dessous détaillées :
> Rapport journalier de suivi sous forme de tableau indiquant les informations
> concernant la zone balayée, le linéaire des conduites inspectées et les fuites détectées
> et leurs adresses, illustré par un extrait du plan du réseau (format A4) permettant de
> localiser l’emplacement des conduites inspectées et des fuites détectées ;
> Fiche de réparation de fuites, remplie pour chaque fuite détectée et réparée par
> l’entreprise
> Rapport d’avancement mensuel dressant le bilan des travaux effectués

- **R-CPS-137** [CONTRACTUEL] Essais à la charge de l'entreprise : contrôle des réfections de chaussée par carottage du corps de chaussée, à raison d'un prélèvement par 50 m2 réalisés. [F056 p.24, art. II-21]
- **R-CPS-138** [CONTRACTUEL] Si les résultats ne sont pas satisfaisants, l'entreprise reprend les anomalies et refait les essais à sa charge ; une pénalité égale à deux fois le prix des travaux de réfection de la partie non conforme est appliquée. [F056 p.24, art. II-21]
- **R-CPS-139** [CONTRACTUEL] Rapport journalier de suivi : sous forme de tableau, il indique la zone balayée, le linéaire des conduites inspectées, les fuites détectées et leurs adresses ; il est illustré par un extrait du plan du réseau au format A4 localisant les conduites inspectées et les fuites détectées. [F056 p.24, art. II-21]
- **R-CPS-140** [CONTRACTUEL] Fiche de réparation de fuites : remplie pour chaque fuite détectée et réparée par l'entreprise. Son modèle n'est pas annexé au CPS. [F056 p.24, art. II-21]
- **R-CPS-141** [CONTRACTUEL] Rapport d'avancement mensuel : il dresse le bilan des travaux effectués. Contenu détaillé `[NON PRÉCISÉ]`. [F056 p.24, art. II-21]

#### Art. II-22 Mesures de débit de nuit après recherche

> ARTICLE N° 22. MESURES DE DEBIT DE NUIT APRES OPERATION DE RECHERCHE DES
> FUITES
> La mesure de débit de nuit après intervention sera réalisée aux mêmes points de mesure que la
> phase 1, pendant trois jours successifs après l’achèvement des travaux de détection et de
> réparation des fuites dans les secteurs objets du marché. Des relevés du débit nocturne doivent se
> faire quotidiennement pendant ces trois jours selon la même méthodologie que les mesures de
> débit effectuées lors de la phase 1, et ce pour l’évaluation des gains apportés par la compagne de
> recherche de fuites.
> Le débit de nuit après intervention (Qf) sera pris égal au minimum des trois mesures minimales
> correspondant aux trois nuits qui suivent la compagne de recherche et réparation des fuites.
> Un procès-verbal des mesures sera établi entre l’entreprise et la SRM-ORI
> Le volume récupéré sera donc la différence entre Qi et Qf soit Q.
> Q = Qi – Qf (en m3/h)
> En vue de détecter le maximum de fuites et améliorer le gain Q, l’Entreprise pourra prospecter
> plusieurs fois (par plusieurs procédés ; corrélation, écoute, pré localisation.) la longueur d’une
> conduite ou d’un secteur. Les longueurs prospectées ne seront rémunérées qu’une seule fois.

- **R-CPS-142** [CONTRACTUEL] Les mesures après intervention se font aux mêmes points et selon la même méthode que les mesures avant, pendant trois jours successifs après l'achèvement de la détection et de la réparation dans les secteurs. [F056 p.24, art. II-22]
- **R-CPS-143** [CONTRACTUEL] Le débit de nuit après intervention Qf est le minimum des trois minimums des trois nuits ; un procès-verbal est établi entre l'entreprise et la SRM ; volume récupéré `ΔQ = Qi − Qf` en m3/h. [F056 p.24, art. II-22]
- **R-CPS-144** [CONTRACTUEL] L'entreprise peut prospecter plusieurs fois un même linéaire (corrélation, écoute, pré-localisation) ; les longueurs prospectées ne sont rémunérées qu'une seule fois. [F056 p.24, art. II-22]

#### Art. II-23 Pénalités sur les résultats du balayage et du maintien

> ARTICLE N° 23. PENALITES SUR LES RESULTATS D’EXECUTION DES TRAVAUX DE
> BALAYAGE ET DU MAINTIEN
> En se référant au tableau récapitulatif N° 1 fixant les conditions de réalisation des travaux exigés
> par la SRM-ORI, les modalités d’application des pénalités sur les résultats obtenus par
> l’entrepreneur sont les suivantes :
> PENALITES SUR RESULTATS DU BALAYAGE
> Après l’achèvement des travaux du balayage, si les objectifs de débits min fixés au tableau
> N°1 :tableau récapitulatif relatifs aux conditions de réalisation des travaux exigées par la SRM-ORI)
> ne sont pas atteints, l’entreprise subira une pénalité en fonctions des performances atteintes selon
> le tableau suivant :
> Soit :
> Q Réal = Débit nocturne minimum réalisé par l'entreprise à la fin du balayage (m3/h)
> Q exigé = Débit nocturne minimum exigé par la SRM-ORI (cf. tableau n°1 ) (m3/h)
> 1 (%) = 100 x (Q (exigé) – Q réal) / Q exigé
> Calcul de la Pénalité période balayage
> si 1< 0 % Pénalité de 1% du montant de balayage par point de pourcentage (1) non
> atteint avec un plafond de = 25%
> NB : Après la phase de balayage si 1< -25 % (inférieur strictement) pour une zone, La SRM-ORI
> arrête les travaux de recherche détection et réparation de fuites à l’achèvement du premier
> balayage de quatre mois prévus sur la zone en question. Les travaux de maintien des résultats y
> compris la réparation de fuites détectées seront maintenus sur les autres zones.
> PENALITES SUR RESULTATS DU MAINTIEN DES PERFORMANCES ATTEINTES
> Après l’achèvement de la période du maintien (8 mois), si les performances de fin de balayage ne
> sont pas maintenues, l’entreprise subira une pénalité en fonctions des performances atteintes
> selon le tableau suivant :
> Soit :
> Q Réal maintien= Débit minimum moyen calculée à partir des débits minimums mesurés
> hebdomadaires durant la période du maintien (m3/h).
> Q exigé à maintenir = Débit nocturne minimum réalisé par l'entreprise à la fin du balayage (m3/h)
> 2 (%) = 100 x (Q (exigé à maintenir) – Q (réal maintien)) / Q (exigé à maintenir)
> Calcul de la Pénalité période maintien
> si 2< 0 % Pénalité de 1% du montant de maintien par point de pourcentage (2) non
> atteint avec un plafond de = 25%

Le symbole imprimé devant « 1 » et « 2 » est la lettre grecque τ (contrôle visuel de la page 25) : le texte extrait l'a perdu.

- **R-CPS-145** [CONTRACTUEL] Indicateur du balayage : `τ1 (%) = 100 × (Q exigé − Q réal) / Q exigé`, où Q réal est le débit nocturne minimum réalisé par l'entreprise à la fin du balayage et Q exigé celui du tableau n° 1 (m3/h). [F056 p.25, art. II-23]
- **R-CPS-146** [CONTRACTUEL] Si τ1 < 0 % (objectif non atteint : Q réal > Q exigé) : pénalité de 1 % du montant de balayage par point de pourcentage de τ1 non atteint, avec un plafond de τ = 25 %. [F056 p.25, art. II-23]
- **R-CPS-147** [CONTRACTUEL] Si, après le balayage, τ1 < −25 % (strictement) pour une zone, la SRM arrête les travaux de recherche, détection et réparation sur cette zone à l'achèvement du premier balayage de quatre mois ; le maintien et les réparations continuent sur les autres zones. [F056 p.25, art. II-23 NB]
- **R-CPS-148** [CONTRACTUEL] Indicateur du maintien : `τ2 (%) = 100 × (Q exigé à maintenir − Q réal maintien) / Q exigé à maintenir`, où Q exigé à maintenir est le débit nocturne minimum réalisé à la fin du balayage et Q réal maintien la moyenne des débits minimums hebdomadaires mesurés pendant le maintien. [F056 p.25, art. II-23]
- **R-CPS-149** [CONTRACTUEL] Si τ2 < 0 %, après la période de maintien de 8 mois : pénalité de 1 % du montant de maintien par point de pourcentage de τ2 non atteint, avec un plafond de τ = 25 %. [F056 p.25, art. II-23]
- **R-CPS-150** [DÉDUIT] Points non écrits : assiette par zone ou sur le montant total du prix 1 ou 2 ; arrondi du nombre de points (proportionnel ou par point entier) ; articulation entre le seuil de 25 % de détérioration des « gains » (R-CPS-107) et τ2 calculé sur les débits. Hypothèse de travail : calcul par zone, sur le montant du prix de la zone (linéaire de la zone × PU), proportionnel sans arrondi `[À CONFIRMER]`. [F056 p.25, art. II-23]

#### Art. II-24 et II-25 Préparation et localisation

> ARTICLE N° 24. TRAVAUX DE PREPARATION
> L’opération de détection des conduites et d’accessoires (Bouche à clé carrée, robinet de prise en
> charge) nécessaires à la recherche des fuites est à la charge de l’entrepreneur. Naturellement celui-
> ci disposera des plans disponibles dont-il reconnaît avoir apprécié la qualité de précision.
> ARTICLE N° 25. LOCALISATION DES FUITES
> L’entrepreneur devra localiser toutes les fuites, visibles (préciser la localisation) ou invisibles (par
> détection), quelle que soit leurs importances.
> Il indiquera dans le rapport de détection la nature et le diamètre de la conduite constaté sur place
> après ouverture de la tranchée.
> On entend par fuite
> Fuite proprement dite ;
> Découverte d’un élément inconnu pour la SRM-ORI (exemple : branchement clandestin…)

- **R-CPS-151** [CONTRACTUEL] La détection des conduites et accessoires (bouche à clé carrée, robinet de prise en charge) nécessaire à la recherche est à la charge de l'entrepreneur, qui dispose des plans disponibles dont il reconnaît avoir apprécié la précision. [F056 p.25, art. II-24]
- **R-CPS-152** [CONTRACTUEL] L'entrepreneur localise toutes les fuites, visibles (en précisant la localisation) ou invisibles (par détection), quelle que soit leur importance. [F056 p.25, art. II-25]
- **R-CPS-153** [CONTRACTUEL] Le rapport de détection indique la nature et le diamètre de la conduite constatés sur place après ouverture de la tranchée. [F056 p.25, art. II-25]
- **R-CPS-154** [CONTRACTUEL] « On entend par fuite » : la fuite proprement dite ; la découverte d'un élément inconnu de la SRM-ORI (exemple : branchement clandestin). [F056 p.25, art. II-25]
- **R-CPS-155** [DÉDUIT] Les fuites visibles et invisibles sont traitées de la même façon : aucun prix de détection à la fuite, aucun circuit distinct pour les fuites signalées par la SRM ou les abonnés, aucune classe de débit ni méthode d'estimation du débit par fuite : `[NON PRÉCISÉ]`. [F056 p.25, art. II-25]

#### Art. II-26 Moyens mis en œuvre

> ARTICLE N° 26. MOYENS MIS EN OEUVRE
> L’entreprise doit disposer de :
> L’ensemble du matériel nécessaire à la réalisation de l’opération de recherche des fuites
> dans de bonnes conditions et conformément aux exigences de la SRM-ORI.
> L’entreprise doit disposer au minimum des moyens matériels suivants pour accomplir les travaux
> objet du présent appel d’offres :
> NOMBRE MINIMAL AFFECTE
> DÉSIGNATION DU MATÉRIEL AU PROJET DU PRESENT APPEL
> D’OFFRES
> Corrélateurs acoustiques 2
> Débitmètre portable 2
> Enregistreurs de débit et pression 6
> Pré-localisateurs de fuites 50
> Détecteurs de fuites acoustiques 4
> Véhicules légers pour la détection et pickup
> pour réparation des fuites 2
> Petit outillage (curage bouches à clé,..) Deux Ensembles
> Ensemble matériel réparation de fuites Ensemble
> N.B : Tout le matériel utilisé sera soumis à l'approbation de la SRM-ORI avant le démarrage des
> travaux.
> Le matériel de mesure de débit et de recherche des fuites devra être de technologie récente, fiable
> et adapté aux conditions d'exploitation des secteurs hydrauliques objet des prestations.
> À tout moment, la SRM-ORI se réservent le droit de procéder à des vérifications, du
> fonctionnement, de la précision et de la fiabilité du matériel qui sera utilisé pour la mesure des
> débits et la recherche des fuites.
> En cas de défaillance du matériel appartenant à l’entreprise, celle-ci fera son affaire pour le
> remplacement dans l’immédiat du matériel qui sera reconnu non fiable ou non fonctionnel.

| Désignation du matériel (texte exact) | Nombre minimal affecté au projet | Source |
|---|---|---|
| Corrélateurs acoustiques | 2 | [F056 p.26] |
| Débitmètre portable | 2 | [F056 p.26] |
| Enregistreurs de débit et pression | 6 | [F056 p.26] |
| Pré-localisateurs de fuites | 50 | [F056 p.26] |
| Détecteurs de fuites acoustiques | 4 | [F056 p.26] |
| Véhicules légers pour la détection et pickup pour réparation des fuites | 2 | [F056 p.26] |
| Petit outillage (curage bouches à clé,..) | Deux Ensembles | [F056 p.26] |
| Ensemble matériel réparation de fuites | Ensemble | [F056 p.26] |

- **R-CPS-156** [CONTRACTUEL] L'entreprise dispose au minimum du matériel du tableau ci-dessus (2 corrélateurs, 2 débitmètres portables, 6 enregistreurs de débit et pression, 50 pré-localisateurs, 4 détecteurs acoustiques, 2 véhicules, deux ensembles de petit outillage, un ensemble de matériel de réparation). [F056 p.25-26, art. II-26]
- **R-CPS-157** [CONTRACTUEL] Tout le matériel est soumis à l'approbation de la SRM avant le démarrage ; le matériel de mesure et de recherche est de technologie récente et fiable ; la SRM peut à tout moment en vérifier le fonctionnement, la précision et la fiabilité ; tout matériel défaillant est remplacé « dans l'immédiat ». Certificats d'étalonnage : `[NON PRÉCISÉ]`. [F056 p.26, art. II-26]

#### Art. II-27 Sécurité des ouvriers et des tiers

> ARTICLE N° 27. SECURITE DES OUVRIERS ET DES TIERS
> L’entrepreneur prendra toutes les dispositions nécessaires pour protéger efficacement son
> chantier. Il devra, à ses frais se conformer à l’instruction générale sur la signalisation routière en
> vigueur au moment des travaux.
> Ces dispositions devront être préalablement agréés par la SRM-ORI qui se réserve le droit d’imposer
> toutes mesures propres à assurer la sécurité des ouvriers, de la circulation et des immeubles voisins.
> Aucun agent ne pourra travailler sur les chantiers sans qu’il soit assuré nominativement par
> l’entrepreneur contre tout accident.
> Pour la protection de leur sécurité, le personnel devra porter des Equipements de Protection
> Individuels (EPI) en particulier le gilet réfléchissant et les chaussures de sécurité et procéder à une
> analyse locale des risques avant chaque intervention (circulation, chute, espace confiné, présence
> d’amiante ….) afin de prendre les mesures de prévention adaptées (signalisation, masque,
> détecteur de gaz…).
> Durant la réalisation des prestations, l’entrepreneur ne doit procéder à aucune intervention en
> matière de manœuvre des vannes, terrassement, sans demander l’avis préalable de la SRM-ORI.

- **R-CPS-158** [CONTRACTUEL] L'entrepreneur protège son chantier et se conforme à ses frais à l'instruction générale sur la signalisation routière ; ses dispositions sont préalablement agréées par la SRM. [F056 p.26, art. II-27]
- **R-CPS-159** [CONTRACTUEL] Aucun agent ne peut travailler sur les chantiers sans être assuré nominativement contre tout accident. [F056 p.26, art. II-27]
- **R-CPS-160** [CONTRACTUEL] Le personnel porte des équipements de protection individuels (en particulier gilet réfléchissant et chaussures de sécurité) et procède à une analyse locale des risques avant chaque intervention (circulation, chute, espace confiné, présence d'amiante…). [F056 p.26, art. II-27]
- **R-CPS-161** [CONTRACTUEL] L'entrepreneur ne procède à aucune manœuvre de vanne ni à aucun terrassement sans demander l'avis préalable de la SRM-ORI. [F056 p.26, art. II-27]

#### Art. II-28 à II-30 Organismes, documents

> ARTICLE N° 29. DOCUMENTS A FOURNIR PAR LA SRM-ORI
> Pour la réalisation des prestations, objet du présent appel d'offres, la SRM-ORI mettra à la
> disposition de l’Entrepreneur :
> -Les plans de réseau disponibles sous format Papier/Autocad ;
> -Liste des branchements avec adresses des abonnés.
> Tous les documents fournis à l’Entrepreneur devront être restitués à la SRM-ORI après
> l’achèvement des travaux, la réception définitive ne sera prononcée qu’après avoir restitué ces
> documents.
> ARTICLE N° 30. DOCUMENTS A FOURNIR PAR L’ENTREPRENEUR
> A la fin des travaux, l’entrepreneur doit fournir à la SRM-ORI les documents suivants sur supports
> papier et informatiques :
> 1) Report sur plans de la répartition spatiale des fuites localisées sur les conduites du
> réseau de distribution, (le tirage et la reproduction des copies relatives aux plans des
> réseaux nécessaires sont à la charge totale de l’entreprise) ;
> 2) Album photos relatif à quelques fuites localisées sur le réseau de distribution ;
> 3) Un rapport final de synthèse dressant le bilan final de l’opération ainsi que les
> propositions techniques d’amélioration du rendement des secteurs inspectés.
> Après sa mission, et dans un délai de quinze jours, l’Entrepreneur remettra à la SRM-ORI, pour
> chaque secteur inspecté, le rapport de synthèse correspondant en (02) deux exemplaires.

- **R-CPS-162** [CONTRACTUEL] Art. II-28 : les correspondances avec les organismes tiers (administrations, établissements publics, collectivités) sont faites par la SRM ; l'entrepreneur prépare les projets de lettres avec les documents techniques. [F056 p.26, art. II-28]
- **R-CPS-163** [CONTRACTUEL] La SRM met à disposition : les plans de réseau disponibles au format papier / Autocad ; la liste des branchements avec adresses des abonnés. Ces documents sont restitués après l'achèvement des travaux ; la réception définitive n'est prononcée qu'après leur restitution. [F056 p.27, art. II-29]
- **R-CPS-164** [CONTRACTUEL] À la fin des travaux, l'entrepreneur fournit sur supports papier et informatique : (1) le report sur plans de la répartition spatiale des fuites localisées (tirages à sa charge) ; (2) un album photos relatif à quelques fuites localisées ; (3) un rapport final de synthèse dressant le bilan de l'opération et les propositions d'amélioration du rendement des secteurs. [F056 p.27, art. II-30]
- **R-CPS-165** [CONTRACTUEL] Dans un délai de quinze jours après sa mission, l'entrepreneur remet, pour chaque secteur inspecté, le rapport de synthèse correspondant en deux (02) exemplaires. [F056 p.27, art. II-30]
- **R-CPS-166** [CONTRACTUEL] Le CPS n'impose ni format de fichier (Excel, shapefile, KML, DWG), ni système de coordonnées (Lambert, WGS84), ni plateforme SRM (SIG, GMAO, SAP), ni base de données des fuites à remettre : `[NON PRÉCISÉ]` ; seule exigence : « supports papier et informatiques ». [F056 p.27, art. II-30]

#### Page de signatures

- **R-CPS-167** [CONTRACTUEL] La page de signatures prévoit une signature « pour la Société Régionale Multiservices l'Oriental S.A » (vide dans cet exemplaire) et une signature « pour le soumissionnaire », précédée des nom et prénom et de la mention manuscrite « Lu et Accepté » ; l'exemplaire porte la signature numérique de IMAD BOUSALAM (STEPAG) du 2026-08-12 17:38:57 +01:00. [F056 p.30]

### 3.4 Renvois à des textes externes

Le CPS renvoie souvent au CCAG-Travaux (décret n° 2-14-394 du 13 mai 2016) et au règlement des marchés de la SRM Oriental sans en reprendre le contenu. Aucun de ces textes n'est dans le dossier.

| Article du CPS qui renvoie | Texte visé | Ce que le renvoi régit | Substance reprise dans le CPS | Suite à donner |
|---|---|---|---|---|
| art. I-3 | règlement des marchés SRM-ORI, art. 28 | discordances de l'offre financière | non | demander le règlement (Q-21) |
| art. I-4 ; art. I-33 | CCAG-T, art. 57 et 58 | augmentation et diminution dans la masse des travaux ; décision de poursuivre | non | règle par défaut du CCAG, non vérifiée dans le dossier `[À CONFIRMER]` |
| art. I-34 | CCAG-T, art. 59 | changement dans les quantités du détail estimatif | non | règle par défaut du CCAG, non vérifiée dans le dossier `[À CONFIRMER]` |
| art. I-7 | CCAG-T, art. 4 | désignation de l'agent chargé du suivi | oui (15 jours, par OS) | — |
| art. I-10 ; art. I-24 | règlement des marchés SRM-ORI, art. 25, 34, 41, 56 | conditions des concurrents et sous-traitants ; validité des offres ; refus de signer | partielle | — |
| art. I-12 | CCAG-T, art. 23 | protection de la main-d'œuvre | non | — |
| art. I-13 | CCAG-T, art. 25 | assurances (dont § d : dommages à l'ouvrage) | partielle | liste des polices à confirmer |
| art. I-14 | CCAG-T, art. 26 | propriété industrielle | oui | — |
| art. I-20 | CCAG-T, art. 11 | réserves sur un ordre de service | non | délai de réserve `[À CONFIRMER]` |
| art. I-21 | CCAG-T, art. 48 | ajournement des travaux | non | effets de l'ajournement sur le délai `[À CONFIRMER]` |
| art. I-22 | CCAG-T, art. 49 | cessation des travaux | non | — |
| art. I-23 | CCAG-T, art. 47 | force majeure | oui (seuils d'intempéries) | délai de déclaration `[À CONFIRMER]` |
| art. I-27 | CCAG-T, art. 73 et 76 | réceptions provisoire et définitive | partielle | réserves et délais de levée `[À CONFIRMER]` |
| art. I-28 | CCAG-T, art. 75 | délai de garantie | oui (12 mois) | — |
| art. I-30 | arrêté n° 3-302-15 du 27 novembre 2015 | révision des prix | oui (formules) | valeurs des index à relever chaque mois |
| art. I-31 | décret n° 2-14-272 du 14 mai 2014 | avances | partielle (remboursement) | taux de l'avance `[À CONFIRMER]` |
| art. I-32 | CCAG-T, art. 61 | attachements : établissement et validation | partielle (mentions) | qui signe, délai de contestation : règle par défaut du CCAG, non vérifiée `[À CONFIRMER]` |
| art. I-32 | CCAG-T, art. 62 | décomptes provisoires | partielle | — |
| art. I-32 | CCAG-T, art. 68 | décompte général définitif | non | — |
| art. I-37 | CCAG-T, art. 79 | mesures coercitives | non | — |
| art. I-38 | CCAG-T, art. 69 ; règlement SRM-ORI | résiliation | non | — |
| art. I-39 | CCAG-T, art. 81 à 84 | différends et litiges | non | — |
| art. II-14 | « article 52.8 » | mesure des performances après balayage | renvoi introuvable | lire art. II-22 `[À CONFIRMER]` |
| art. II-20 | UNE EN 12697-2 ; UNE EN 12697-6 ; « ONE EN 12697 - 17* » | caractéristiques de l'enrobé-résine à froid | oui (valeurs) | — |
| art. II-27 | instruction générale sur la signalisation routière | signalisation de chantier | non | — |
| art. I-17 | loi n° 09-08 | données personnelles | oui (obligations) | — |

- **R-CPS-168** [CONTRACTUEL] Le CPS ne contient aucun article « Dérogations au CCAG » : `[NON PRÉCISÉ]` ; les dérogations éventuelles résultent des clauses elles-mêmes (plafond de pénalités 8 %, délai de paiement 90 jours, facturation en trois temps). [F056 p.3, art. I-3]
- **R-CPS-169** [DÉDUIT] Règles par défaut du CCAG-T non reprises dans le dossier et non vérifiées `[À CONFIRMER]` : intérêts moratoires ; prix nouveaux ; seuils de variation dans la masse ; signature et contestation des attachements ; réserves à la réception ; procédure d'ajournement. Une ligne « règle par défaut du CCAG, non vérifiée dans le dossier » vaut pour chacune. [F056 p.3, art. I-3]

### 3.5 Objet, consistance, périmètre et opérations annexes

| Élément | Dans le marché | Précision | Source |
|---|---|---|---|
| Recherche et détection sur conduites | oui | tous diamètres et toutes natures | [F056 p.3, art. I-2] |
| Inspection des branchements | oui, non rémunérée au linéaire | — | [F056 p.23, art. II-19] |
| Réparation sur conduites | oui | prix 11 à 13 : amiante-ciment et PVC, DN ≤ 315 ; autres cas hors bordereau | [F056 p.29] |
| Réparation sur branchements et extensions en polyéthylène | oui | prix 6 à 9 ; du robinet de prise en charge ou du collier jusqu'à la niche du compteur | [F056 p.28-29] |
| Robinet cache-entrée, raccords standard du compteur, compteur | non compris | — | [F056 p.29] |
| Après compteur (domaine privé) | `[NON PRÉCISÉ]` | — | — |
| Vannes, ventouses, bouches d'incendie, ouvrages | `[NON PRÉCISÉ]` (aucun prix) | — | — |
| Bouches à clé | oui | mise à niveau : prix 10 | [F056 p.29] |
| Réfection de trottoirs et de chaussées | oui | prix 4 et 5 | [F056 p.3, art. I-2] |
| Assainissement | non cité | — | [F056 p.3] |
| Fuites visibles | oui, à localiser comme les invisibles | aucun prix ni circuit distinct | [F056 p.25, art. II-25] |
| Élément inconnu de la SRM (branchement clandestin…) | compté comme « fuite » | — | [F056 p.25, art. II-25] |
| Mesures de débit nocturne | oui, sans rémunération | avant, après, puis hebdomadaires | [F056 p.22 ; p.24 ; p.21] |

| Opération annexe | Qui la fait | Source |
|---|---|---|
| Manœuvre des vannes | agents de la SRM-ORI ; l'entreprise ne manœuvre aucune vanne sans avis préalable | [F056 p.22, art. II-16] ; [F056 p.26, art. II-27] |
| Coupure d'eau, avis aux abonnés, purge, désinfection, remise en eau, analyse | `[NON PRÉCISÉ]` | — |
| Avis préalable avant terrassement | à demander à la SRM par l'entreprise | [F056 p.26, art. II-27] |
| Autorisations de circulation et plans de signalisation | entreprise, auprès des autorités | [F056 p.16, art. II-7] |
| Correspondances avec les organismes tiers (administrations, commune, autres concessionnaires) | SRM, sur projets de lettres de l'entreprise | [F056 p.26, art. II-28] |
| Dégâts sur le chantier, aux tiers ou aux bâtiments voisins | responsabilité de l'entreprise | [F056 p.16, art. II-9] |
| Détection des conduites, des bouches à clé ; curage | entreprise, à sa charge | [F056 p.23, art. II-19] ; [F056 p.25, art. II-24] |
| Fourniture, transport et pose des pièces de réparation | entreprise | [F056 p.17, art. II-15 N.B.] |
| Essais de laboratoire (carottage) | entreprise, à sa charge | [F056 p.24, art. II-21] |
| Vérification de la sectorisation | entreprise avec les services de la SRM | [F056 p.22, art. II-16] |
| Fourniture des plans et de la liste des branchements | SRM | [F056 p.27, art. II-29] |

### 3.6 Programme et rendement de la détection

- **R-CPS-170** [CONTRACTUEL] Les secteurs à balayer et leur regroupement en zones sont fixés par la SRM (tableau n° 1) ; l'ordre de passage, la forme et la périodicité d'un programme de balayage et sa validation par la SRM sont `[NON PRÉCISÉ]`. [F056 p.18-19]
- **R-CPS-171** [CONTRACTUEL] Rendement minimal : 4 km par jour et par équipe en moyenne pendant le balayage ; 4 équipes de détection au minimum pendant le balayage et le maintien. [F056 p.23, art. II-18]
- **R-CPS-172** [CONTRACTUEL] Nombre de passages : un balayage complet au minimum (« Une fois au minimum ») en 4 mois ; les passages supplémentaires sont libres et non rémunérés. [F056 p.18 ; p.24, art. II-22]
- **R-CPS-173** [CONTRACTUEL] Campagnes nocturnes : trois nuits de mesures de 0 h à 6 h avant le balayage, trois nuits après, puis un contrôle au plus hebdomadaire pendant 8 mois ; livrables : procès-verbaux signés par l'entreprise et la SRM. [F056 p.22 ; p.24 ; p.21]
- **R-CPS-174** [DÉDUIT] Les cinq valeurs de Q exigé valent 80 % du débit actuel mesuré, arrondi à l'unité (158 → 126 ; 162 → 130 ; 148 → 118 ; 140 → 112 ; 104 → 83) : l'objectif implicite est une baisse de 20 % du débit nocturne de chaque zone. En conséquence, si rien ne change (Q réal = débit actuel), τ1 vaut −25 % environ (zone 4 : exactement −25,00 %), soit la pénalité maximale. [F056 p.18-19]

### 3.7 Caractérisation des fuites

| Attribut de la fuite | Exigence du CPS | Source |
|---|---|---|
| Visible ou invisible | à distinguer (« visibles (préciser la localisation) ou invisibles (par détection) ») | [F056 p.25, art. II-25] |
| Conduite ou branchement | implicite (prix distincts 6 à 9 et 11 à 13) | [F056 p.28-29] |
| Nature (matériau) et diamètre de la conduite | à indiquer dans le rapport de détection, constatés après ouverture de la tranchée | [F056 p.25, art. II-25] |
| Adresse de la fuite | à porter au rapport journalier | [F056 p.24, art. II-21] |
| Position sur plan | implantation sur un plan à échelle appropriée ; extrait A4 joint au rapport journalier | [F056 p.22, art. II-18] ; [F056 p.24, art. II-21] |
| Classe de débit (faible, moyen, fort) ; débit estimé par fuite | `[NON PRÉCISÉ]` | — |
| Méthode de détection à consigner | `[NON PRÉCISÉ]` (méthodes admises : acoustique, corrélation, enregistreurs de bruit) | [F056 p.22, art. II-18] |
| Marquage au sol (couleur, code, photo) | `[NON PRÉCISÉ]` | — |
| Prime ou objectif par nombre de fuites | aucun ; l'objectif porte sur le débit nocturne de la zone | [F056 p.25, art. II-23] |
| Coordonnées GPS | `[NON PRÉCISÉ]` | — |

### 3.8 Signalement et circuit de la fuite

- **R-CPS-175** [CONTRACTUEL] Circuit imposé : détection et localisation par l'entreprise → signalement au représentant de la SRM et communication le jour même pour validation → avis préalable de la SRM avant terrassement → ouverture de la tranchée en présence du représentant de la SRM et de celui de l'entreprise → confirmation de la fuite → réparation par l'entreprise → fiche renseignée et signée par l'entreprise, copie à la SRM → réfection → attachement contradictoire. [F056 p.22-23, art. II-18 et II-19 ; F056 p.26, art. II-27]
- **R-CPS-176** [CONTRACTUEL] Le CPS ne prévoit pas de signalement par la SRM, par les abonnés ou par une équipe de dépannage, ni bon de commande ou ordre de travail par fuite : les fuites traitées sont celles que l'entreprise détecte dans les secteurs du marché. Canal (appel, SMS, courriel, fiche), référence et preuve de l'événement : `[NON PRÉCISÉ]`. [F056 p.23, art. II-19]
- **R-CPS-177** [CONTRACTUEL] Horaires de travail, jours fériés, astreinte, urgences et critère d'urgence : `[NON PRÉCISÉ]`. Seules les mesures de débit sont imposées de nuit (0 h à 6 h). [F056 p.22, art. II-17]
- **R-CPS-178** [INTERNE] En pratique STEPAG, la fuite est identifiée par la référence SRM du point de livraison (« Tournée », format `NNN-NNN-NNN`) et un numéro de fuite séquentiel (section 10 bis). [F001 feuille "Fiche de réparation Zone " ; F119]

### 3.9 Délais (tableau unique)

| ID règle | Prestation ou obligation | Déclencheur exact | Délai | Unité | Calendaire ou ouvrable | Fin du délai | Variante | Pénalité liée | Source |
|---|---|---|---|---|---|---|---|---|---|
| R-CPS-031 | exécution de tous les travaux, repliement compris | date de commencement fixée par l'OS (2026-10-02) | 12 | mois | calendaire | `[NON PRÉCISÉ]` | — | R-CPS-077 | [F056 p.8, art. I-19] |
| R-CPS-091 | balayage de tous les secteurs | réception de l'OS de commencement | 4 | mois | calendaire | `[NON PRÉCISÉ]` | — | R-CPS-093 ; R-CPS-146 | [F056 p.17, art. II-14] |
| R-CPS-092 | première phase de maintien | expiration du délai du balayage | 4 | mois | calendaire | `[NON PRÉCISÉ]` | — | R-CPS-093 | [F056 p.17, art. II-14] |
| R-CPS-092 | seconde phase de maintien | fin de la première phase de maintien | 4 | mois | calendaire | `[NON PRÉCISÉ]` | — | R-CPS-093 ; R-CPS-149 | [F056 p.17, art. II-14] |
| R-CPS-131 | communication des fuites détectées à la SRM | détection de la fuite | le jour même | j | calendaire | fin de la journée `[À CONFIRMER]` | — | aucune chiffrée | [F056 p.23, art. II-19] |
| R-CPS-132 | réparation d'une fuite détectée | — | `[NON PRÉCISÉ]` | — | — | — | — | aucune | [F056 p.23] |
| R-CPS-134 | réfection de chaussée | date de réparation de la fuite | 1 | mois | calendaire | `[NON PRÉCISÉ]` | au-delà : enrobé-résine à froid obligatoire | aucune en argent ; changement de procédé sans supplément | [F056 p.23, art. II-20] |
| R-CPS-136 | réfection de trottoir | — | `[NON PRÉCISÉ]` | — | — | — | — | aucune | [F056 p.23] |
| R-CPS-114 | mesures de débit de nuit avant recherche | « juste après l'établissement de l'ordre de service » | 3 | nuits | calendaire | — | 0 h à 6 h, pas de 15 min | aucune | [F056 p.22, art. II-17] |
| R-CPS-142 | mesures de débit de nuit après recherche | achèvement de la détection et de la réparation dans les secteurs | 3 | nuits successives | calendaire | — | même méthode | aucune | [F056 p.24, art. II-22] |
| R-CPS-109 | intervalle entre deux contrôles du maintien | date du contrôle précédent | ≤ 7 | j | calendaire | — | dates fixées par la SRM, intervalle constant | base des pénalités τ2 | [F056 p.21, art. II-15] |
| R-CPS-165 | rapport de synthèse par secteur, 2 exemplaires | fin de la mission | 15 | j | calendaire `[À CONFIRMER]` | — | — | aucune chiffrée | [F056 p.27, art. II-30] |
| R-CPS-089 | remplacement du directeur de chantier | demande de la SRM | 48 | h | calendaire `[À CONFIRMER]` | — | — | aucune chiffrée | [F056 p.16, art. II-10] |
| R-CPS-034 | retour de l'exemplaire signé d'un OS | notification de l'OS | 3 | j | `[NON PRÉCISÉ]` | — | à défaut, OS réputé reçu | — | [F056 p.8, art. I-20] |
| R-CPS-013 | notification du nom de l'agent de suivi (obligation de la SRM) | notification de l'OS de commencement | 15 | j | `[NON PRÉCISÉ]` | — | — | — | [F056 p.4, art. I-7] |
| R-CPS-014 | avis de changement de domicile | changement | 15 | j | `[NON PRÉCISÉ]` | — | lettre recommandée | — | [F056 p.4, art. I-8] |
| R-CPS-017 | récusation d'un sous-traitant (droit de la SRM) | réception du contrat de sous-traitance | 15 | j | `[NON PRÉCISÉ]` | — | — | — | [F056 p.5, art. I-10] |
| R-CPS-040 | constitution du cautionnement définitif | notification du marché (2026-09-11) | 20 | j | `[NON PRÉCISÉ]` | 2026-10-01 `[DÉDUIT]` | — | — | [F056 p.9, art. I-25] |
| R-CPS-059 | communication de la copie du décompte (obligation de la SRM) | signature du décompte par le maître d'ouvrage | ≤ 10 | j | `[NON PRÉCISÉ]` | — | — | — | [F056 p.11, art. I-32] |
| R-CPS-073 | soumission de la facture rectifiée | rectification par la SRM | ≤ 15 | j | `[NON PRÉCISÉ]` | — | — | — | [F056 p.13, art. I-32] |
| R-CPS-062 | paiement de la facture (obligation de la SRM) | dépôt de la facture au bureau d'ordre avec attachements validés | ≤ 90 | j | calendaire `[À CONFIRMER]` | — | — | intérêts moratoires `[NON PRÉCISÉ]` | [F056 p.12-13, art. I-32] |
| R-CPS-068 | facture n° 2 (40 % du prix 2) | achèvement du balayage | 4 | mois | calendaire | — | — | — | [F056 p.12, art. I-32] |
| R-CPS-069 | facture n° 3 (60 % du prix 2) | achèvement du balayage | 8 | mois | calendaire | — | — | — | [F056 p.13, art. I-32] |
| R-CPS-046 | délai de garantie | date du PV de réception provisoire | 12 | mois | calendaire | — | — | — | [F056 p.10, art. I-28] |

- **R-CPS-179** [CONTRACTUEL] Suspension et neutralisation des délais : seuls l'ordre de service d'ajournement (arrêt puis reprise) et l'avenant de force majeure prolongent le délai. L'attente d'une manœuvre de vanne ou d'une coupure par la SRM, d'une autorisation de voirie ou d'un avis avant terrassement n'est pas prévue comme cause de suspension : `[NON PRÉCISÉ]` ; formalisme pour la faire reconnaître : `[NON PRÉCISÉ]`. [F056 p.8, art. I-21 et I-23]
- **R-CPS-180** [CONTRACTUEL] Un arrêt ordonné par une autorité (travaux publics, municipalité, police) n'ouvre droit à aucune indemnité ; son effet sur le délai est `[NON PRÉCISÉ]`. [F056 p.17, art. II-13]
- **R-CPS-181** [CONTRACTUEL] Interdictions horaires (nuit, ramadan, grands axes) et plus-values associées : `[NON PRÉCISÉ]`. [F056]
- **R-CPS-182** [DÉDUIT] Pour l'application : enregistrer l'heure de chaque demande faite à la SRM (avis avant terrassement, manœuvre de vanne, validation) et l'heure de la réponse, afin de justifier un retard non imputable. [F056 p.26, art. II-27]

### 3.10 Pénalités et retenues (tableau exhaustif)

Montant de référence pour les exemples : montant du marché 5191974.00 DH TTC `[À CONFIRMER : le CPS dit « montant du marché » sans préciser HT ou TTC]` ; prix 1 par zone = linéaire × 0.30 DH HT (hors majoration).

| ID règle | Fait générateur | Montant ou taux | Unité de temps | Assiette | Point de départ | Plafond individuel | Plafond global | Recouvrement | Exemple chiffré | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| R-CPS-077 | retard dans l'exécution des travaux (délai global ou phase) | 1/1000 | jour calendaire | montant du marché initial + travaux supplémentaires + augmentation de masse | lendemain de l'échéance `[À CONFIRMER]` | 8 % | 8 % ; au plafond, résiliation possible | prélevée sur les décomptes `[À CONFIRMER : mode non écrit]` | 10 jours → 10 × 5191.974 = 51919.74 DH ; plafond 415357.92 DH atteint au 80e jour | [F056 p.13, art. I-35 A] |
| R-CPS-079 | signalisation de chantier non conforme | 1000 DH | jour de retard | forfait | constat `[NON PRÉCISÉ]` | — | 2 % pour l'ensemble des pénalités particulières (103839.48 DH) | comme les pénalités de retard | 3 jours → 3000 DH | [F056 p.14, art. I-35 B] |
| R-CPS-079 | non-port des EPI | 500,00 DH | jour de retard et par ouvrier | forfait | constat `[NON PRÉCISÉ]` | — | 2 % (commun avec la ligne précédente) | comme les pénalités de retard | 2 ouvriers pendant 3 jours → 3000 DH | [F056 p.14, art. I-35 B] |
| R-CPS-146 | objectif de débit non atteint à la fin du balayage (τ1 < 0) | 1 % par point de τ1 | une fois, à la fin du balayage | montant du balayage (prix 1) | mesure de Qf | 25 % | — | diminution de la facture n° 1 | zone 4 : Q exigé 112, Q réal 120 → τ1 = −7.1429 % → 7.1429 % × (399000 × 0.30 = 119700.00) = 8550.00 DH HT | [F056 p.25, art. II-23] ; [F056 p.12, art. I-32 §1] |
| R-CPS-147 | τ1 < −25 % sur une zone | arrêt des travaux sur la zone | — | — | fin du balayage | — | — | — | zone 4 : Q réal > 140 m3/h → arrêt de la zone 4 | [F056 p.25, art. II-23 NB] |
| R-CPS-149 | performances non maintenues (τ2 < 0) | 1 % par point de τ2 | une fois, après 8 mois | montant du maintien (prix 2) | fin de la période de maintien | 25 % | — | diminution de la facture n° 3 | zone 4 : Q fin de balayage 112, moyenne des contrôles 118 → τ2 = −5.3571 % → 5.3571 % × (399000 × 0.45 = 179550.00) = 9618.75 DH HT | [F056 p.25, art. II-23] ; [F056 p.13, art. I-32 §3] |
| R-CPS-138 | réfection de chaussée non conforme aux essais | 2 × le prix de la réfection de la partie non conforme | une fois | surface non conforme × prix 5 | résultat d'essai | — | — | `[NON PRÉCISÉ]` | 10 m2 non conformes → 2 × 10 × 150.00 = 3000.00 DH HT, plus la reprise à ses frais | [F056 p.24, art. II-21] |
| R-CPS-135 | réfection de chaussée après plus d'un mois | pas de pénalité en argent : enrobé-résine à froid imposé sans supplément | — | — | date de réparation + 1 mois | — | — | — | réparation le 2026-10-03 → réfection à faire avant le 2026-11-03 | [F056 p.23-24, art. II-20] |
| R-CPS-080 | non-remise d'un rapport, d'une fiche ou d'un état | `[NON PRÉCISÉ]` (annoncée, non chiffrée) | — | — | — | — | — | — | — | [F056 p.13, art. I-35 B] |
| — | absence d'agent ou de matériel ; absence à une réunion ; déblais non évacués ; travaux non conformes (hors chaussée) | `[NON PRÉCISÉ]` | — | — | — | — | — | — | — | — |
| R-CPS-041 | retenue de garantie (n'est pas une pénalité) | 10 % de chaque acompte | à chaque acompte | montant de l'acompte | premier acompte | 7 % du montant initial + avenants | — | prélèvement ; remplaçable par caution | acompte 400000.00 → 40000.00 retenus | [F056 p.9, art. I-26] |

- **R-CPS-183** [CONTRACTUEL] Plafonds cumulés : 8 % (retard) + 2 % (pénalités particulières) ; les pénalités de résultat (25 % du prix 1, 25 % du prix 2) s'y ajoutent sans plafond commun écrit. Remise gracieuse : `[NON PRÉCISÉ]`. [F056 p.13-14, art. I-35 ; F056 p.25, art. II-23]
- **R-CPS-184** [DÉDUIT] Pénalité maximale de résultat : 25 % × 439800.00 (prix 1) = 109950.00 DH HT et 25 % × 659700.00 (prix 2) = 164925.00 DH HT, hors majoration. [F032 p.1 ; F056 p.25]

### 3.11 Confirmation de la fuite, fouilles négatives, tolérance de localisation

- **R-CPS-185** [CONTRACTUEL] Une fuite est confirmée lorsqu'elle est constatée dans la tranchée ouverte, en présence des agents de la SRM-ORI et de l'entreprise. [F056 p.22, art. II-18 ; p.23, art. II-19]
- **R-CPS-186** [CONTRACTUEL] Fouille négative (« le siège de la fuite ne se situe pas dans le tranché ») : obligation de recommencer la prospection (R-CPS-127) ; distance tolérée par rapport au marquage : `[NON PRÉCISÉ]` ; paiement du terrassement et de la réfection de la fouille négative, mention à porter sur la fiche : `[NON PRÉCISÉ]`. [F056 p.23, art. II-19]
- **R-CPS-187** [INTERNE] Le catalogue STEPAG prévoit les motifs « sondage negatif », « RAS », « refusé par l'abonné », « Assainissement » et « A DETECTER » pour qualifier une intervention sans réparation. [F001 feuille "LISTE" A1:A5]
- **R-CPS-188** [2017] Dans le marché de 2017, la découverte d'un élément inconnu (branchement clandestin, vanne, piquage) n'était pas considérée comme une erreur de détection. [F077 art. 45.4]

### 3.12 Garantie des réparations

- **R-CPS-189** [CONTRACTUEL] Garantie globale de 12 mois après la réception provisoire (R-CPS-046, R-CPS-047) ; aucun délai par réparation ; reprise gratuite des défectuosités, sauf usure normale, abus d'usage ou dommages causés par des tiers ; réparations provisoires : `[NON PRÉCISÉ]`. [F056 p.10, art. I-28]
- **R-CPS-190** [DÉDUIT] Une reprise sous garantie ne doit pas générer de ligne payante à l'attachement : l'application doit pouvoir marquer une intervention « reprise sans paiement » liée à la réparation d'origine `[À CONFIRMER : critère du même point]`. [F056 p.10, art. I-28]

### 3.13 Constat et attachements contradictoires

- **R-CPS-191** [CONTRACTUEL] Les attachements (balayage, maintien, réparations, réfections) sont établis à partir de constatations contradictoires faites sur le terrain, au fur et à mesure de l'exécution. [F056 p.12-13, art. I-32]
- **R-CPS-192** [CONTRACTUEL] Le constat de la fuite a lieu tranchée ouverte, en présence du représentant de la SRM ; délai de convocation, conséquence de l'absence du représentant de la SRM, mesure de la fouille avant remblai, preuves admises (mètre visible sur la photo, croquis coté), cahier ou journal de chantier : `[NON PRÉCISÉ]`. [F056 p.23, art. II-19]
- **R-CPS-193** [CONTRACTUEL] Qui établit l'attachement : l'entreprise le prépare (pratique : gabarit STEPAG signé « SRM.ORI » et « Sté STEPAG ») ; validation selon l'article 61 du CCAG-T, non reproduit ; délai de contestation : `[À CONFIRMER : règle par défaut du CCAG-T]` ; périodicité : « au fur et à mesure » ; pièces jointes : croquis ou plan si besoin. [F056 p.12, art. I-32 ; F001 feuille "attachement recap" A28:C28]
- **R-CPS-194** [2017] En 2017, les attachements de réparation n'étaient visés par la régie « qu'après achèvement des réfections et remise en état des lieux » ; cette règle n'est pas reprise dans le CPS 2026 `[À CONFIRMER : pratique actuelle de la SRM]`. [F077 art. 45]

### 3.14 États et rapports à fournir

Chaque état est décrit par une fiche normalisée. Les colonnes des modèles réellement utilisés par STEPAG sont en section 8 ; celles des modèles de 2017 en section 7.

| Nom exact | Périodicité et bornes | Déclencheur ou heure limite | Destinataires | Support exigé | Langue | Signatures et visas | Statut normatif | Source |
|---|---|---|---|---|---|---|---|---|
| « Rapport journalier de suivi » | chaque jour de balayage ; bornes de la journée `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` ; les fuites sont communiquées le jour même | SRM-ORI (service `[NON PRÉCISÉ]` ; en pratique Département Mesures et Amélioration du Rendement) | tableau + extrait de plan A4 ; papier ou fichier `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` (français en pratique) | `[NON PRÉCISÉ]` (gabarit : STEPAG et S.R.M) | CONTRACTUEL | [F056 p.24, art. II-21] |
| « Fiche de réparation de fuites » | une par fuite détectée et réparée | après constat de la fuite dans la tranchée | SRM-ORI (copie) | `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` | renseignée et signée par l'entreprise | CONTRACTUEL | [F056 p.23, art. II-19] ; [F056 p.24, art. II-21] |
| « Rapport d'avancement mensuel » | mensuel ; mois calendaire `[À CONFIRMER]` | `[NON PRÉCISÉ]` | SRM-ORI | `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` (gabarit : STEPAG et SRM ORIENTAL) | CONTRACTUEL | [F056 p.24, art. II-21] |
| Rapport hebdomadaire | non exigé par le CPS 2026 (exigé en 2017) | — | — | — | — | — | 2017 | [F077 art. 45] ; [F088] |
| Procès-verbal des mesures de débit de nuit (avant) | une fois, après l'OS | après les 3 nuits de mesure | SRM-ORI | `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` | entreprise et SRM-ORI | CONTRACTUEL | [F056 p.22, art. II-17] |
| Procès-verbal des mesures de débit de nuit (après) | une fois, après le balayage | après les 3 nuits de mesure | SRM-ORI | `[NON PRÉCISÉ]` | `[NON PRÉCISÉ]` | entreprise et SRM-ORI | CONTRACTUEL | [F056 p.24, art. II-22] |
| Relevé des contrôles hebdomadaires du maintien | au plus hebdomadaire pendant 8 mois | dates fixées par la SRM | SRM-ORI | `[NON PRÉCISÉ]` | — | `[NON PRÉCISÉ]` | CONTRACTUEL (contrôle) ; forme `[NON PRÉCISÉ]` | [F056 p.21, art. II-15] |
| Procès-verbal de substitution de secteur | à l'occasion | accord de l'entreprise | — | — | — | les deux parties | CONTRACTUEL | [F056 p.17, art. II-15] |
| Attachement | au fur et à mesure | constat contradictoire | agent chargé du suivi | `[NON PRÉCISÉ]` ; 3 exemplaires joints à la facture | — | contradictoire | CONTRACTUEL | [F056 p.12-13, art. I-32] |
| Décompte provisoire | chaque fois que nécessaire | attachements acceptés | maître d'ouvrage ; copie à l'entrepreneur sous 10 jours | — | — | dressé par l'agent de suivi, signé par le maître d'ouvrage | CONTRACTUEL | [F056 p.12, art. I-32] |
| Facture | trois factures (fin de balayage ; + 4 mois ; + 8 mois) | dépôt au bureau d'ordre | SRM-ORI | papier, 5 exemplaires | — | entreprise | CONTRACTUEL | [F056 p.11-13, art. I-32] |
| Rapport de synthèse par secteur | une fois par secteur inspecté | 15 jours après la mission | SRM-ORI | 2 exemplaires | — | — | CONTRACTUEL | [F056 p.27, art. II-30] |
| Rapport final de synthèse | fin des travaux | — | SRM-ORI | papier et informatique | — | — | CONTRACTUEL | [F056 p.27, art. II-30] |
| Report sur plans de la répartition spatiale des fuites | fin des travaux | — | SRM-ORI | papier et informatique | — | — | CONTRACTUEL | [F056 p.27, art. II-30] |
| Album photos | fin des travaux | — | SRM-ORI | papier et informatique | — | — | CONTRACTUEL | [F056 p.27, art. II-30] |
| Plans des ouvrages conformes à l'exécution | pendant le délai de garantie | — | maître d'ouvrage | — | — | — | CONTRACTUEL | [F056 p.10, art. I-28] |
| PV de réception provisoire ; PV de réception définitive | une fois chacun | achèvement ; fin de garantie | — | — | — | commission de réception | CONTRACTUEL | [F056 p.9, art. I-27] |

**Rapport journalier de suivi.** Modèle : `[NON PRÉCISÉ]` — mentions imposées par le texte :

| N° | Libellé exact | Type | Unité | Nom canonique (11 bis) | Regroupement ou total | Source |
|---|---|---|---|---|---|---|
| 1 | « la zone balayée » | texte (énumération zone, secteur) | — | zone_id ; secteur_id | — | [F056 p.24] |
| 2 | « le linéaire des conduites inspectées » | décimal | m ou km `[NON PRÉCISÉ]` | lineaire_inspecte_m | total du jour | [F056 p.24] |
| 3 | « les fuites détectées » | liste | — | fuite_numero ; fuite_visibilite | nombre du jour | [F056 p.24] |
| 4 | « leurs adresses » | texte | — | fuite_adresse ; reference_srm | — | [F056 p.24] |
| 5 | « un extrait du plan du réseau (format A4) permettant de localiser l'emplacement des conduites inspectées et des fuites détectées » | image ou PDF | — | extrait_plan | — | [F056 p.24] |
| 6 | nature et diamètre de la conduite constatés après ouverture (« rapport de détection ») | énumération ; entier | mm | conduite_materiau ; conduite_dn_mm | — | [F056 p.25, art. II-25] |

**Fiche de réparation de fuites.** Modèle : `[NON PRÉCISÉ]` — mentions imposées par le texte : une fiche par fuite détectée et réparée ; renseignée et signée par l'entreprise ; copie à la SRM. Aucun champ n'est énuméré par le CPS. Champs du modèle STEPAG : section 8.3.

**Rapport d'avancement mensuel.** Modèle : `[NON PRÉCISÉ]` — mentions imposées par le texte : « dressant le bilan des travaux effectués ». Statistiques imposées : `[NON PRÉCISÉ]`. Champs du modèle STEPAG : section 8.4.

**Photos.** Le CPS ne fixe ni nombre minimum par étape (avant, pendant, après), ni contenu, ni mentions (date, heure, GPS, référence), ni format ; il exige seulement, en fin de marché, un « album photos relatif à quelques fuites localisées ». Tout le reste est `[NON PRÉCISÉ]`. [F056 p.27, art. II-30]

- **R-CPS-195** [CONTRACTUEL] Trois documents de suivi sont exigés pendant l'exécution : rapport journalier, fiche de réparation par fuite, rapport d'avancement mensuel ; le rapport hebdomadaire de 2017 n'est plus exigé. [F056 p.24, art. II-21]
- **R-CPS-196** [CONTRACTUEL] Les livrables de fin de marché sont remis sur supports papier et informatique : report des fuites sur plans, album photos, rapport final de synthèse avec propositions d'amélioration du rendement ; plus un rapport de synthèse par secteur en 2 exemplaires sous 15 jours. Base de données des fuites, formats et champs : `[NON PRÉCISÉ]`. [F056 p.27, art. II-30]
- **R-CPS-197** [DÉDUIT] Les états « journaliers et hebdomadaires pour les agents de suivi SRM » et les « rapports PDF par fuite avec photos et GPS » prévus par le cadrage de l'application vont au-delà du CPS : ce sont des choix STEPAG (statut INTERNE), à valider avec la SRM. [F056 p.24]

### 3.15 Réceptions

- **R-CPS-198** [CONTRACTUEL] PV mensuels de validation : non prévus. Réception provisoire à l'achèvement des travaux ; réception définitive après 12 mois de garantie ; PV signés par la commission de réception ; la réception définitive est subordonnée à la restitution des documents fournis par la SRM. Réserves et levée : article 73 du CCAG-T `[À CONFIRMER]`. [F056 p.9, art. I-27 ; p.27, art. II-29]
- **R-CPS-199** [CONTRACTUEL] Chaque décompte est réglé « après réception par le maître d'ouvrage des prestations » : la validation des attachements par la SRM conditionne le paiement. [F056 p.13, art. I-32 §4]

### 3.16 Paiement et décompte

| Élément du décompte | Règle | Source |
|---|---|---|
| Base | attachements acceptés ; prix du bordereau × quantités réellement exécutées | [F056 p.12 ; p.10] |
| Majoration | + 15 % appliqués aux prix du bordereau | [F056 p.13, art. I-32 §4] ; [F040 p.1] |
| TVA | 20 % | [F032 p.1] |
| Retenue de garantie | 10 % de chaque acompte, plafond 7 % du montant initial + avenants ; remplaçable par caution ; restituée à la réception définitive | [F056 p.9, art. I-26] |
| Remboursement d'avance | 20 % du montant de l'avance par acompte ; soldé à 80 % du montant TTC ; seulement si une avance a été versée | [F056 p.11, art. I-31] |
| Pénalités | retard (1/1000 par jour, plafond 8 %) ; particulières (plafond 2 %) ; résultat τ1 sur la facture n° 1 ; τ2 sur la facture n° 3 ; essais non conformes | [F056 p.13-14 ; p.25 ; p.24] |
| Révision des prix | formules a et b, coefficient à 4 décimales, index du mois d'exigibilité contre index d'août 2026 | [F056 p.10-11, art. I-30] |
| Décomptes antérieurs, cumul, net à payer en lettres | structure `[NON PRÉCISÉ]` dans le CPS (voir modèle 2017, section 7) | — |
| Décompte général définitif | établi par l'agent de suivi, signé par le maître d'ouvrage (art. 68 du CCAG-T) | [F056 p.12] |
| Facture | 5 exemplaires ; mentions de R-CPS-061 ; pièces justificatives en 3 exemplaires | [F056 p.11-13] |
| Dépôt | bureau d'ordre de la SRM-ORI | [F056 p.13] |
| Délai de paiement | 90 jours à compter du dépôt | [F056 p.13] |
| Intérêts moratoires | `[NON PRÉCISÉ]` | — |

- **R-CPS-200** [DÉDUIT] Ordre des opérations proposé pour un décompte (aucun ordre n'est écrit dans le CPS) : montant HT des travaux aux prix du bordereau → majoration 15 % → révision des prix → TVA 20 % → TTC → retenue de garantie → remboursement d'avance → pénalités → net à payer `[À CONFIRMER : ordre et assiettes HT ou TTC]`. [F056 p.9-14]

### 3.17 Personnel, moyens et données exigés

- **R-CPS-201** [CONTRACTUEL] Équipes : 4 équipes de détection au minimum ; composition et qualifications : `[NON PRÉCISÉ]` ; un directeur de chantier qualifié sur place ; 20 % de main-d'œuvre locale. [F056 p.23, art. II-18 ; p.16, art. II-10 ; p.5, art. I-11]
- **R-CPS-202** [CONTRACTUEL] Matériel de détection et de mesure : tableau de l'art. II-26 (R-CPS-156) ; véhicules : 2 (véhicules légers pour la détection et pickup pour la réparation) ; GPS, détecteur de canalisations, gaz traceur : non exigés. [F056 p.25-26, art. II-26]
- **R-CPS-203** [CONTRACTUEL] Moyens à mettre à la disposition de la SRM : bureau de chantier de 15 m2 équipé ; soins et transports médicaux pour le personnel de la SRM sur le chantier. [F056 p.15, art. II-3 et II-5]
- **R-CPS-204** [CONTRACTUEL] Système de coordonnées, formats de fichiers, destination des données (SIG, GMAO, SAP de la SRM), application imposée : `[NON PRÉCISÉ]`. Les plans sont fournis au format « Papier/Autocad ». [F056 p.27, art. II-29 et II-30]

### 3.18 Fournitures

- **R-CPS-205** [CONTRACTUEL] Les pièces de réparation sont fournies, transportées et posées par l'entreprise, à sa charge (changement par rapport à 2017, où la régie fournissait le matériel sur bon de sortie). [F056 p.17, art. II-15 N.B. ; F077 art. 45 N.B. et art. 47]
- **R-CPS-206** [CONTRACTUEL] Le matériel de réparation est soumis à l'approbation de la SRM avant le démarrage et doit être conforme aux normes en vigueur ; marques et agréments : `[NON PRÉCISÉ]`. [F056 p.17, art. II-15 N.B.]
- **R-CPS-207** [CONTRACTUEL] Procédure de retrait en magasin, bons de sortie, restitution des pièces déposées, numéros de série et index des compteurs, plombage : `[NON PRÉCISÉ]` (les compteurs sont hors périmètre des prix). [F056 p.29]
- **R-CPS-208** [DÉDUIT] Les feuilles « Mouvements matériel » et « Détail BS » (bons de sortie) du modèle de 2017 n'ont plus d'objet contractuel en 2026 ; un suivi de stock des pièces reste utile à STEPAG (statut INTERNE). [F065 ; F056 p.17]

### 3.19 Engagements de l'offre et règlement de consultation

- **R-CPS-209** [CONTRACTUEL] Le règlement de consultation n'exige pas d'offre technique, interdit les variantes et ne fixe aucun moyen humain ou matériel ; il demande seulement une « note indiquant les moyens humains et techniques ». [F054 p.7-9, art. 14-B, 14-D, 14-E]
- **R-CPS-210** [CONTRACTUEL] Critères d'admissibilité du RC : au moins une référence de travaux similaires en 10 ans d'un montant ≥ 1 000 000 DH TTC pour un gestionnaire public d'eau potable au Maroc ; chiffre d'affaires moyen annuel sur 3 ans ≥ 100 % de l'estimation HT ; reste à réaliser du plan de charge ≤ moyenne du chiffre d'affaires majorée de 50 %. [F054 p.9, art. 14-B]
- **R-CPS-211** [CONTRACTUEL] Offre excessive si supérieure de plus de 20 % à l'estimation ; anormalement basse si inférieure de plus de 20 % ; validité des offres 60 jours à compter de l'ouverture des plis. [F054 p.13, art. 20 ; p.15, art. 22]
- **R-CPS-212** [CONTRACTUEL] Note des moyens humains de l'offre : 73 personnes déclarées (directeur technique et commercial ; assistante technique ; chef de chantier ; magasinier ; technicien électricien ; soudeur ; chauffeurs ; plombiers et poseurs ; ferrailleurs ; maçons ; 40 ouvriers et aides). Aucun profil « agent de détection de fuites » n'y est nommé. `[noms et numéros CNSS individuels non recopiés]`. [F020 p.1]
- **R-CPS-213** [CONTRACTUEL] Note des moyens matériels de l'offre : engins de génie civil et de transport (pelles, tractopelles, camions, camionnettes, compresseurs, compacteurs, pompes, scies à sol…). Aucun matériel de détection (corrélateur, pré-localisateur, débitmètre, enregistreur) n'y figure `[CONTRADICTION : F023 p.1 vs F056 p.25-26, art. II-26]` : le matériel minimal de l'art. II-26 reste dû et doit être présenté à l'approbation de la SRM. [F023 p.1]
- **R-CPS-214** [INTERNE] Le gabarit de rapport mensuel STEPAG cite comme équipements « Aquaphone A 50, Aquaphone Mikron Junior 3, Eureka ». [F122 feuille "Table 2" A12]
- **R-CPS-215** [DÉDUIT] Aucun engagement chiffré de l'offre ne porte sur un outil informatique, un délai par fuite ou un format de rapport : l'application de suivi est une initiative de STEPAG. [F020 ; F023 ; F027]

### 3.20 Sécurité, hygiène, environnement, sous-traitance, assurances, résiliation, litiges (renvois)

| Thème | Règles | Source |
|---|---|---|
| Signalisation de chantier | R-CPS-086 ; R-CPS-087 ; R-CPS-158 ; pénalité R-CPS-079 | [F056 p.16 ; p.26 ; p.14] |
| EPI et analyse de risques | R-CPS-160 ; pénalité R-CPS-079 | [F056 p.26 ; p.14] |
| Assurance nominative des agents | R-CPS-159 | [F056 p.26] |
| Hygiène, service médical, gardiennage | R-CPS-085 | [F056 p.15-16] |
| Riverains, bruit, poussières | R-CPS-088 | [F056 p.16] |
| Déblais | compris dans le prix 3 (« transport des terres en excédent ») ; distance et lieu de décharge `[NON PRÉCISÉ]` | [F056 p.28] |
| Remise en état des lieux | comprise dans le délai d'exécution (R-CPS-032) | [F056 p.8] |
| Amiante | cité comme risque à analyser avant intervention ; conduites en amiante-ciment réparées aux prix 11 à 13 ; procédure particulière `[NON PRÉCISÉ]` | [F056 p.26 ; p.29] |
| Sous-traitance | R-CPS-016 ; R-CPS-017 ; R-CPS-024 | [F056 p.5 ; p.7] |
| Assurances | R-CPS-020 | [F056 p.5] |
| Résiliation | R-CPS-028 ; R-CPS-078 ; R-CPS-081 ; R-CPS-090 | [F056] |
| Litiges | R-CPS-081 | [F056 p.14] |

## 4. Bordereau des prix

**Résumé.** Le bordereau des prix – détail estimatif du marché est un tableau unique de 13 prix (n° 00001 à 00013), sans chapitres, établi par la SRM avec ses propres prix unitaires ; le concurrent n'a offert qu'un taux unique de majoration (15 %). Total 3 762 300,00 DH HT, 4 514 760,00 DH TTC, 5 191 974,00 DH TTC après majoration. Tous les montants ont été recalculés par script : aucun écart.

**Principaux `[NON PRÉCISÉ]`.** Prix unitaires en lettres (le modèle n'a pas de colonne en lettres) ; sous-détail des prix (absent du dossier) ; niveau d'application de la majoration (ligne ou total) et arrondi ; prix pour les conduites de diamètre supérieur à 315 mm, pour les matériaux autres qu'amiante-ciment et PVC (fonte, acier, PEHD de gros diamètre), pour les pièces spéciales, vannes et ventouses, pour le terrain naturel et les pavés.

**Décimales telles qu'imprimées.** Quantités : entières, séparateur de milliers « . » dans le PDF (`1.466.000`). Prix unitaires : 2 décimales, virgule décimale (`0,30`). Montants : 2 décimales (`439.800,00` dans le tableau ; `3 762 300,00` dans les totaux de la version signée). Montants en DH HT, sauf les lignes TTC indiquées.

### 4.1 Versions du bordereau présentes dans le dossier

| ID | Fichier | Contenu | Signé | Différences |
|---|---|---|---|---|
| F058 | P.3.1 BP rabais.pdf | modèle « Bordereau des prix au rabais », 4 pages, taux vide | non | titre ; lignes finales « POURCENTAGE DU RABAIS(%) » et « MONANT TOTAL APRES RABAIS » |
| F060 | P.3.2 BP majoration.pdf | modèle « Bordereau des prix à majoration », 4 pages, taux vide | non | titre ; coquille « D#OUJDA » ; lignes finales « POURCENTAGE MAJORATION (%) » et « MONANT TOTAL APRES MAJORATION » |
| F059 | P.3.2 BP 10008883-1R majoration.xlsx | classeur du modèle rempli (majoration 15) | non | formules visibles |
| F034 | P.3.2 BP majoration.xlsx (offre) | identique à F059 (seule la zone d'impression diffère) | non | — |
| F032 | P.3.2 BP majoration.pdf (offre) | bordereau de l'offre STEPAG, 1 page, majoration 15,00, total 5 191 974,00 | oui (signature numérique STEPAG 2026-08-12) | **fait foi** |
| F001 | feuille « BP » de l'attachement | copie du classeur F059 | non | — |

- **R-BPU-001** [CONTRACTUEL] Le bordereau porte l'en-tête « Bordereau des prix à majoration », « Numéro DA/Marché : 10008883/1R » et six colonnes : « N° de prix », « Désignation des prestations », « Unité de mesure », « Quantité », « Prix unitaire en DH HT », « Prix total en DH HT ». [F032 p.1 ; F060 p.1]
- **R-BPU-002** [CONTRACTUEL] Les treize désignations, unités, quantités et prix unitaires sont identiques dans les versions F058, F060, F059, F034 et F032 (comparaison par script des textes extraits) ; seuls changent le titre et le taux. [F058 ; F060 ; F032]
- **R-BPU-003** [CONTRACTUEL] La version signée numériquement par STEPAG (F032) fait foi pour le taux de majoration et le montant ; `[À CONFIRMER : exemplaire signé par la SRM absent du dossier]`. [F032 p.1]

### 4.2 Tableau complet (verbatim)

Les désignations sont recopiées telles qu'écrites (fautes comprises : « polyéthèlyne », « sujestions », « dissymetrique ») ; seul le caractère corrompu « #uvre » de la source est rétabli en « œuvre ». Le bordereau n'a ni chapitres ni sous-totaux : colonne Chapitre = `—`.

| Ordre | Chapitre | N° prix | Désignation complète | Unité telle qu'écrite | Unité normalisée | Quantité | PU HT chiffres | PU HT lettres | Montant HT | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | — | 00001 | Recherche et détection de fuites sur conduites, tous diamètres et toutes natures ( Balayage) | M | ml | 1466000 | 0,30 | [NON PRÉCISÉ] | 439 800,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 4] |
| 2 | — | 00002 | Recherche et détection de fuites sur conduites pour le maintien des résultats | M | ml | 1466000 | 0,45 | [NON PRÉCISÉ] | 659 700,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 5] |
| 3 | — | 00003 | Confection de tranchée en terrain de toute nature y compris remblaiement de la tranchée, compactage, transport des terres en excédent et toutes sujétions, pour conduites et branchements y compris réglage du fond de fouille, étaiement, blindage et épuisement en cas de terrassement pour réparation de fuite ou sondage L'Unité = Le Mètre Cube | M3 | m3 | 2400 | 50,00 | [NON PRÉCISÉ] | 120 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 6] |
| 4 | — | 00004 | Réfection et revêtement des trottoirs en béton, granito lavé, en carreaux ciment ou en mosaïque conforme à l'original épaisseur 0,10 m y compris blocage en pierre d'une épaisseur minimale de 15 cm,couche en tout venant GNA compactée et toutes sujétions | M2 | m2 | 2000 | 100,00 | [NON PRÉCISÉ] | 200 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 7] |
| 5 | — | 00005 | Réfection et revêtement de chaussée goudronnée en enrobé à chaud d'épaisseur de 7 cm, y compris couche en tout venant GNA de 0,50 m | M2 | m2 | 800 | 150,00 | [NON PRÉCISÉ] | 120 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 8] |
| 6 | — | 00006 | Fourniture,Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur strictement inférieur à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords , collier pour polyéthèlyne et ou manchon ou bouchon | U | u | 2400 | 400,00 | [NON PRÉCISÉ] | 960 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 9] |
| 7 | — | 00007 | Fourniture ,Transport et pose pour changement de Robinet PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l'entreprise) | U | u | 900 | 460,00 | [NON PRÉCISÉ] | 414 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 10] |
| 8 | — | 00008 | Fourniture ,Transport et pose pour changement de collier PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l'entreprise) | U | u | 500 | 460,00 | [NON PRÉCISÉ] | 230 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 11] |
| 9 | — | 00009 | Fourniture,Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur supérieur ou égal à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords , collier pour polyéthèlyne et ou manchon ou bouchon | U | u | 600 | 400,00 | [NON PRÉCISÉ] | 240 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 12] |
| 10 | — | 00010 | Mise à niveau de bouche à clé carrée ou ronde y compris pose de tube allonge en PVC, tabernacle et socle en béton de 0,40 m x 0,40 m x 0,20 | U | u | 300 | 140,00 | [NON PRÉCISÉ] | 42 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 13] |
| 11 | — | 00011 | réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : -Diam compris entre 315 mm et 225 mm | U | u | 8 | 4 600,00 | [NON PRÉCISÉ] | 36 800,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 14] |
| 12 | — | 00012 | réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : -Diam compris entre 200 mm et 110 mm | U | u | 40 | 2 900,00 | [NON PRÉCISÉ] | 116 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 15] |
| 13 | — | 00013 | réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : -Diam inférieur à 110 mm | U | u | 80 | 2 300,00 | [NON PRÉCISÉ] | 184 000,00 | [F032 p.1] ; [F059 feuille "Table 1" ligne 16] |

| Ligne de total (libellé exact) | Valeur imprimée | Valeur machine | Formule du classeur | Source |
|---|---|---|---|---|
| TOTAL ANNUEL HORS TVA | 3 762 300,00 | 3762300.00 | =SUM(F4:F16) | [F032 p.1] ; [F059 feuille "Table 1" F17] |
| TVA | 752 460,00 | 752460.00 | =F17*0.2 | [F032 p.1] ; [F059 feuille "Table 1" F18] |
| TOTAL ANNUEL TTC | 4 514 760,00 | 4514760.00 | =F17+F18 | [F032 p.1] ; [F059 feuille "Table 1" F19] |
| POURCENTAGE MAJORATION (%) | 15,00 | 15.00 | saisi | [F032 p.1] ; [F059 feuille "Table 1" F20] |
| MONANT TOTAL APRES MAJORATION | 5 191 974,00 | 5191974.00 | =F19*1.15 | [F032 p.1] ; [F059 feuille "Table 1" F21] |

- **R-BPU-004** [CONTRACTUEL] Montant de chaque ligne = quantité × prix unitaire HT (formule `=D×E`) ; total HT = somme des 13 lignes ; TVA = total HT × 0,2 ; TTC = HT + TVA ; montant après majoration = TTC × 1,15. [F059 feuille "Table 1" F4:F21]
- **R-BPU-005** [CONTRACTUEL] Le total est qualifié d'« ANNUEL » (« TOTAL ANNUEL HORS TVA », « TOTAL ANNUEL TTC ») : les quantités sont celles des 12 mois du marché. [F032 p.1]
- **R-BPU-006** [CONTRACTUEL] Les quantités des prix 1 et 2 sont toutes deux de 1.466.000 m, soit les 1466 km du tableau n° 1 du CPS : le balayage et le maintien portent sur le même linéaire. [F032 p.1 ; F056 p.19]
- **R-BPU-007** [CONTRACTUEL] Les unités du bordereau sont `M` (mètre linéaire, prix 1 et 2), `M3` (prix 3), `M2` (prix 4 et 5) et `U` (prix 6 à 13). [F032 p.1]
- **R-BPU-008** [CONTRACTUEL] Aucun prix n'est « pour mémoire », à quantité nulle, optionnel ou en variante ; les variantes sont interdites par le RC. [F032 p.1 ; F054 p.9, art. 14-E]
- **R-BPU-009** [CONTRACTUEL] Le taux de majoration ne peut être nul et s'exprime avec deux décimales au plus. [F054 p.10, art. 14-G]
- **R-BPU-010** [CONTRACTUEL] En cas de discordance dans l'acte d'engagement entre le montant en chiffres et le montant en lettres, le montant en lettres prévaut ; la commission rectifie les erreurs de calcul. [F054 p.10, art. 14-G-a ; F054 p.12, art. 20-I-3]
- **R-BPU-011** [DÉDUIT] Le dossier ne contient ni sous-détail des prix ni détail estimatif distinct : le « bordereau des prix – détail estimatif » est un document unique. [F056 p.3, art. I-3]
- **R-BPU-012** [DÉDUIT] Familles de prix (proposition de l'extracteur, non sourcée comme chapitres) : détection (1, 2) ; terrassement (3) ; réfection (4, 5) ; réparation sur polyéthylène et branchements (6, 7, 8, 9) ; bouche à clé (10) ; réparation sur conduites amiante-ciment et PVC (11, 12, 13). La formule de révision « a » vise les « terrassements et entretien réseau », la formule « b » les « ouvrages annexes et réfection de trottoirs ou de chaussées » (R-CPS-051, R-CPS-052). [F056 p.10, art. I-30]

### 4.3 Recalcul par script et contrôles

| Contrôle | Résultat |
|---|---|
| quantité × PU = montant, 13 lignes | 13 égalités exactes, écart 0.00 |
| somme des montants | 3762300.00 = total imprimé |
| TVA 20 % | 752460.00 = imprimé |
| TTC | 4514760.00 = imprimé = estimation de l'avis d'appel d'offres [F039 p.1] |
| TTC × 1.15 | 5191974.00 = imprimé = acte d'engagement [F040 p.1] = lettre de résultat [F037 p.1] |
| 3 % du montant après majoration | 155759.22 → arrondi au dirham supérieur 155760.00 = cautionnement définitif [F035 p.1] |
| prix en lettres = prix en chiffres | non vérifiable : aucun prix unitaire en lettres ; le total en lettres de l'acte d'engagement correspond au total en chiffres |
| numéros de prix bordereau vs définition des prix du CPS | 1 à 13 présents des deux côtés ; aucun numéro orphelin (la définition regroupe 6 à 9 et 11 à 13) |

### 4.4 Prix unitaires après majoration (déduits)

Le marché ne publie pas de prix unitaires majorés. Valeurs calculées `PU × 1.15`, à utiliser seulement si la majoration est appliquée ligne à ligne `[À CONFIRMER]` (voir R-ID-013).

| N° prix | Unité | PU HT bordereau | PU HT majoré (× 1.15) | PU TTC majoré (× 1.15 × 1.20) |
|---|---|---|---|---|
| 1 | ml | 0.30 | 0.3450 | 0.4140 |
| 2 | ml | 0.45 | 0.5175 | 0.6210 |
| 3 | m3 | 50.00 | 57.5000 | 69.0000 |
| 4 | m2 | 100.00 | 115.0000 | 138.0000 |
| 5 | m2 | 150.00 | 172.5000 | 207.0000 |
| 6 | u | 400.00 | 460.0000 | 552.0000 |
| 7 | u | 460.00 | 529.0000 | 634.8000 |
| 8 | u | 460.00 | 529.0000 | 634.8000 |
| 9 | u | 400.00 | 460.0000 | 552.0000 |
| 10 | u | 140.00 | 161.0000 | 193.2000 |
| 11 | u | 4600.00 | 5290.0000 | 6348.0000 |
| 12 | u | 2900.00 | 3335.0000 | 4002.0000 |
| 13 | u | 2300.00 | 2645.0000 | 3174.0000 |

### 4.5 Bloc machine

```csv
numero;designation;unite;quantite;pu_ht;montant_ht;source
1;Recherche et détection de fuites sur conduites, tous diamètres et toutes natures ( Balayage);ml;1466000;0.30;439800.00;F032 p.1
2;Recherche et détection de fuites sur conduites pour le maintien des résultats;ml;1466000;0.45;659700.00;F032 p.1
3;Confection de tranchée en terrain de toute nature y compris remblaiement de la tranchée, compactage, transport des terres en excédent et toutes sujétions, pour conduites et branchements y compris réglage du fond de fouille, étaiement, blindage et épuisement en cas de terrassement pour réparation de fuite ou sondage L'Unité = Le Mètre Cube;m3;2400;50.00;120000.00;F032 p.1
4;Réfection et revêtement des trottoirs en béton, granito lavé, en carreaux ciment ou en mosaïque conforme à l'original épaisseur 0,10 m y compris blocage en pierre d'une épaisseur minimale de 15 cm,couche en tout venant GNA compactée et toutes sujétions;m2;2000;100.00;200000.00;F032 p.1
5;Réfection et revêtement de chaussée goudronnée en enrobé à chaud d'épaisseur de 7 cm, y compris couche en tout venant GNA de 0,50 m;m2;800;150.00;120000.00;F032 p.1
6;Fourniture,Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur strictement inférieur à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords , collier pour polyéthèlyne et ou manchon ou bouchon;u;2400;400.00;960000.00;F032 p.1
7;Fourniture ,Transport et pose pour changement de Robinet PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l'entreprise);u;900;460.00;414000.00;F032 p.1
8;Fourniture ,Transport et pose pour changement de collier PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l'entreprise);u;500;460.00;230000.00;F032 p.1
9;Fourniture,Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur supérieur ou égal à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords , collier pour polyéthèlyne et ou manchon ou bouchon;u;600;400.00;240000.00;F032 p.1
10;Mise à niveau de bouche à clé carrée ou ronde y compris pose de tube allonge en PVC, tabernacle et socle en béton de 0,40 m x 0,40 m x 0,20;u;300;140.00;42000.00;F032 p.1
11;réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : -Diam compris entre 315 mm et 225 mm;u;8;4600.00;36800.00;F032 p.1
12;réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : -Diam compris entre 200 mm et 110 mm;u;40;2900.00;116000.00;F032 p.1
13;réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris Fourniture, transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : -Diam inférieur à 110 mm;u;80;2300.00;184000.00;F032 p.1
```

## 5. Définition des prix

**Résumé.** La définition des prix est la partie III du CPS (2 pages). Elle décrit 13 prix en 8 blocs : balayage et maintien au mètre linéaire (prix 1 et 2), terrassement au mètre cube (prix 3), réfections au mètre carré (prix 4 et 5), réparations à l'unité (prix 6 à 13). Elle est brève : la plupart des règles de métré fines (largeur et profondeur de fouille, arrondis, minimum facturable, fouille négative) ne sont pas écrites.

**Principaux `[NON PRÉCISÉ]`.** Largeur et profondeur de tranchée prises en attachement ; précision de mesure et arrondi des quantités ; quantité minimale facturable ; débord de réfection autour de la fouille ; sort de la fouille négative ; plus-values (nuit, férié, urgence, rocher, nappe) ; travaux en régie ; procédure de prix nouveaux ; réparation au-delà de 2 m de polyéthylène ; diamètres 200 < DN < 225 et DN > 315.

### 5.1 Texte de la définition des prix (verbatim) et règles

#### Prix n° 1 : balayage

> Prix n° 1 : Recherche et détection de fuites sur conduites, tous diamètres et toutes natures
> (Balayage)
> Ce Prix rémunère le balayage de l’ensemble des réseaux des secteurs inspectés afin d’atteindre
> les débits nocturnes fixés par la SRM-ORI dans le tableau N°1 ci-dessous (DH/ mètre balayé), ce
> prix sera le même pour l’ensemble des secteurs objets des travaux de détection de fuites.
> Ce prix est rémunéré au mètre linéaire.

- **R-DEF-001** [CONTRACTUEL] Le prix 1 rémunère le balayage de l'ensemble des réseaux des secteurs inspectés, au mètre linéaire de conduite balayée (« DH/ mètre balayé ») ; le prix est le même pour tous les secteurs. [F056 p.28, prix 1]
- **R-DEF-002** [CONTRACTUEL] Le prix 1 a pour finalité d'atteindre les débits nocturnes fixés par le tableau n° 1 ; son paiement est diminué par la pénalité de résultat τ1 (R-CPS-146). [F056 p.28 ; F056 p.12, art. I-32 §1 ; F056 p.25, art. II-23]
- **R-DEF-003** [CONTRACTUEL] Le linéaire d'une conduite inspectée n'est rémunéré qu'une seule fois, quel que soit le nombre de passages et de procédés (corrélation, écoute, pré-localisation). [F056 p.21, art. II-15 ; F056 p.23, art. II-19 ; F056 p.24, art. II-22]
- **R-DEF-004** [CONTRACTUEL] Le linéaire des branchements inspectés n'est pas pris en compte dans la rémunération. [F056 p.23, art. II-19]
- **R-DEF-005** [CONTRACTUEL] Les mesures de débit de nuit, la vérification de la sectorisation, la détection des conduites et accessoires, le curage des bouches à clé, les rapports et le report sur plans ne font l'objet d'aucun prix : ils sont compris dans les prix 1 et 2. [F056 p.22, art. II-17 ; F056 p.23, art. II-19 ; F056 p.25, art. II-24 ; F056 p.17, art. II-15]
- **R-DEF-006** [DÉDUIT] Quantité plafond théorique du prix 1 : 1466000 m (somme des linéaires « approximatifs » des 5 zones) ; le linéaire payé est celui réellement balayé et constaté contradictoirement, qui peut différer du linéaire approximatif du tableau n° 1 `[À CONFIRMER : source du linéaire de référence par secteur (plans AutoCAD, SIG SRM)]`. [F056 p.18-19 ; F056 p.29]

#### Prix n° 2 : maintien des résultats

> Prix n° 2 : Recherche et détection de fuites sur conduites, pour le maintien des résultats
> Ce Prix rémunère le maintien des débits nocturnes atteints durant la période du balayage de
> l’ensemble des réseaux des secteurs inspectés (DH/ mètre maintenu), ce prix sera le même pour
> l’ensemble des secteurs objets des travaux de détection de fuites pour le maintien des résultats
> atteints au premier balayage.
> Ce prix est rémunéré au mètre linéaire.

- **R-DEF-007** [CONTRACTUEL] Le prix 2 rémunère le maintien des débits nocturnes atteints à la fin du balayage, au mètre linéaire « maintenu », même prix pour tous les secteurs. [F056 p.28, prix 2]
- **R-DEF-008** [CONTRACTUEL] Le prix 2 est facturé en deux fois : 40 % après les quatre premiers mois de maintien, 60 % à la fin des huit mois, cette dernière part étant diminuée par la pénalité τ2. [F056 p.12-13, art. I-32 §2 et §3]
- **R-DEF-009** [DÉDUIT] Le « mètre maintenu » est le linéaire des secteurs sur lesquels le maintien est assuré ; une zone arrêtée après le balayage pour τ1 < −25 % (R-CPS-147) n'entre pas dans le prix 2 `[À CONFIRMER : aucune règle écrite sur le métré du linéaire maintenu]`. [F056 p.25, art. II-23]

#### Prix n° 3 : terrassement

> Prix n° 3 : Terrassement (Confection de tranchée en terrain de toute nature y compris
> remblaiement de la tranchée, compactage, transport des terres en excédent et toutes sujétions,
> pour conduites et branchements y compris réglage du fond de fouille, étaiement, blindage et
> épuisement en cas de terrassement pour réparation de fuite ou sondage)
> Les terrassements seront conduits suivant les règles de l’art et conformément aux règlements
> en vigueur.
> Les fouilles pour tranchés sont exécutées en tout terrain.
> Longueur de la tranchée :
> La longueur de la tranchée doit être celle nécessaire pour assurer la réparation des fuites, sans
> pour autant que cette longueur dépasse deux (2) mètres de longueur et sauf si cette réparation
> nécessite le remplacement d’un élément à changer majorée de (1) mètre.
> Ce prix est rémunéré au mètre cube.

- **R-DEF-010** [CONTRACTUEL] Le prix 3 rémunère au mètre cube la confection de tranchée en terrain de toute nature, pour réparation de fuite ou sondage, sur conduites et branchements. [F056 p.28, prix 3 ; F032 p.1, prix 00003]
- **R-DEF-011** [CONTRACTUEL] Le prix 3 comprend : remblaiement, compactage, transport des terres en excédent, réglage du fond de fouille, étaiement, blindage, épuisement et toutes sujétions. Aucune plus-value pour rocher, nappe ou profondeur. [F056 p.28, prix 3]
- **R-DEF-012** [CONTRACTUEL] La longueur de tranchée prise en compte est celle nécessaire à la réparation, sans dépasser deux (2) mètres ; exception : si la réparation exige le remplacement d'un élément, la longueur est celle de l'élément à changer majorée de un (1) mètre. [F056 p.28, prix 3]
- **R-DEF-013** [DÉDUIT] Volume = longueur × largeur × profondeur de la fouille, en mètres ; la largeur et la profondeur admises, la façon de mesurer la profondeur et l'arrondi sont `[NON PRÉCISÉ]`. Le gabarit STEPAG relève les trois dimensions par fuite avec une ou deux décimales (ex. 1.2 × 0.7 × 0.8). [F001 feuille "Fiche de réparation Zone " E14:G14]
- **R-DEF-014** [2017] Dans le marché de 2017, la largeur prise en attachement était le « diamètre externe de la conduite majorée de 25 cm de chaque coté » ; cette règle n'est PAS reprise dans le CPS 2026. [F077 art. 16, prix 4]
- **R-DEF-015** [CONTRACTUEL] Le terrassement d'un « sondage » est payable au prix 3 (désignation : « en cas de terrassement pour réparation de fuite ou sondage ») ; le CPS ne dit pas si une fouille ne révélant aucune fuite est payée `[À CONFIRMER : fouille négative]` (voir R-CPS-127). [F032 p.1, prix 00003 ; F056 p.23, art. II-19]

#### Prix n° 4 : réfection des trottoirs

> Prix n° 4 : Réfection des trottoirs en béton, granito lavé, en carreaux ciment ou en mosaïque
> (cf. au Bordereau des Prix - Détail Estimatif)
> L’empierrement, le blocage et la forme identique en nature, qualité et épaisseur à son état initial
> seront réalisés avec les matériaux de récupération et des matériaux neufs si nécessaires.
> L’ensemble sera soigneusement compacté avant la mise en place du revêtement de surface qui
> devra lui aussi être le plus possible identique en tous points au revêtement initial.
> Ce prix comprend aussi la fourniture et mise en œuvre de tout venant GNA compactée et arrosée
> aux différents endroits de réparations de fuites.
> Au cas où les travaux de réfection réalisés soulèvent des observations des services de voirie
> municipaux, l’entreprise sera tenue de reprendre les travaux et obtenir la réception conforme
> de ses services.
> Ces prix sont rémunérés au mètre carré.

- **R-DEF-016** [CONTRACTUEL] Le prix 4 rémunère au mètre carré la réfection et le revêtement des trottoirs en béton, granito lavé, carreaux ciment ou mosaïque, conforme à l'original, épaisseur 0,10 m, y compris blocage en pierre d'au moins 15 cm et couche de tout venant GNA compactée. Un seul prix pour les quatre natures de revêtement. [F032 p.1, prix 00004 ; F056 p.28, prix 4]
- **R-DEF-017** [CONTRACTUEL] L'empierrement, le blocage et la forme sont refaits identiques à l'état initial avec les matériaux de récupération, complétés de matériaux neufs si nécessaire ; le revêtement de surface est le plus possible identique au revêtement initial. [F056 p.28, prix 4]
- **R-DEF-018** [CONTRACTUEL] Si les services de voirie municipaux font des observations, l'entreprise reprend les travaux à ses frais jusqu'à obtenir la réception conforme de ces services. [F056 p.28, prix 4]
- **R-DEF-019** [INTERNE] Surface de réfection = longueur × largeur de la fouille (formule `=IF($H17="C",D17*E17,"-")` du gabarit), sans débord ; débord autour de la fouille et surface minimale : `[NON PRÉCISÉ]` dans le CPS. [F001 feuille "REFECTION" I17:M17]
- **R-DEF-020** [INTERNE] Le gabarit STEPAG range les natures « Béton » (B), « Mosaique » (M), « Lavé » (L) et « Carreaux » (C) sous le prix 4, « Asphalt à chaud » (AC) sous le prix 5 et compte « Terrain naturel » (TN) pour zéro. [F001 feuille "REFECTION" I14:N17]
- **R-DEF-021** [DÉDUIT] Les pavés (« pave », rencontré dans la fiche de réparation) et le terrain naturel n'ont pas de prix de réfection au bordereau `[À CONFIRMER : rattachement des pavés au prix 4 ou hors bordereau]`. [F001 feuille "Fiche de réparation Zone " colonne H ; F032 p.1]

#### Prix n° 5 : réfection de chaussée en enrobé à chaud

> Prix n° 5 : Réfection de chaussées en enrobé à chaud
> La réfection de la chaussée doit comprendre :
> le remblaiement de la tranchée par tout venant GNA de 0,50 m de hauteur compacté
> arrosé jusqu’au niveau de la chaussée ;
> Une couche d’imprégnation de Cut back ;
> Une couche d’enrobés à chaud conformément à l’épaisseur originale de la chaussée 7
> cm
> Ce prix est rémunéré au mètre carré.

- **R-DEF-022** [CONTRACTUEL] Le prix 5 rémunère au mètre carré la réfection de chaussée goudronnée : remblaiement en tout venant GNA de 0,50 m compacté et arrosé jusqu'au niveau de la chaussée, couche d'imprégnation de cut back, couche d'enrobés à chaud de 7 cm. [F056 p.28, prix 5 ; F032 p.1, prix 00005]
- **R-DEF-023** [CONTRACTUEL] La réfection de chaussée doit être faite dans un délai d'un mois après la réparation ; au-delà, l'entreprise doit utiliser un enrobé-résine à froid, sans aucune rémunération supplémentaire (même prix 5). [F056 p.23-24, art. II-20]
- **R-DEF-024** [CONTRACTUEL] Les réfections de chaussée sont contrôlées par carottage (1 prélèvement par 50 m2) à la charge de l'entreprise ; une réfection non conforme est reprise et pénalisée de deux fois son prix (R-CPS-138). [F056 p.24, art. II-21]

#### Prix n° 6 à 9 : réparations sur branchements et extensions en polyéthylène

> Prix n° 6 à 9: Fourniture, transport et pose pour réparation de fuites sur branchements et sur
> extensions du réseau de distribution d’eau en polyéthylène (cf. au Bordereau des Prix - Détail
> Estimatif)
> Les réparations seront faites après terrassement et épuisement de fond de fouille et consistent
> en le remplacement de l’accessoire défectueux ou d’une partie du polyéthylène.
> On désigne par raccord toute pièce rentrant dans la réalisation d’un branchement ou extension
> en polyéthylène depuis le raccord fixé sur le robinet de PEC ou le collier Astor fixé sur
> polyéthylène et jusqu’à la niche du compteur non compris le robinet cache-entrée et raccords
> standard du compteur.
> Ces prix sont rémunérés à l’unité.

- **R-DEF-025** [CONTRACTUEL] Les prix 6 à 9 rémunèrent à l'unité la fourniture, le transport et la pose pour réparation de fuites sur branchements et sur extensions du réseau en polyéthylène, après terrassement et épuisement du fond de fouille, par remplacement de l'accessoire défectueux ou d'une partie du polyéthylène. [F056 p.28-29, prix 6 à 9]
- **R-DEF-026** [CONTRACTUEL] Prix 6 : réparation au niveau du tuyau polyéthylène de diamètre extérieur strictement inférieur à 40 mm (`DE < 40`), longueur de polyéthylène inférieure ou égale à 2 m ; comprend sable pour lit de pose de 0,10 m, grillage avertisseur bleu de 50 cm, cisaillement, montage par raccords, collier pour polyéthylène et/ou manchon ou bouchon. [F032 p.1, prix 00006]
- **R-DEF-027** [CONTRACTUEL] Prix 9 : même prestation pour un diamètre extérieur supérieur ou égal à 40 mm (`DE ≥ 40`), longueur de polyéthylène inférieure ou égale à 2 m. Les prix 6 et 9 ont le même prix unitaire (400,00). [F032 p.1, prix 00009]
- **R-DEF-028** [CONTRACTUEL] Prix 7 : changement de robinet de prise en charge (PEC) de différents diamètres, pour branchement ou conduite en polyéthylène, y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton 0,40 × 0,40 × 0,20 pour la bouche à clé (béton fourni par l'entreprise). [F032 p.1, prix 00007]
- **R-DEF-029** [CONTRACTUEL] Prix 8 : changement de collier de prise en charge (PEC), mêmes inclusions que le prix 7. Les prix 7 et 8 ont le même prix unitaire (460,00). [F032 p.1, prix 00008]
- **R-DEF-030** [CONTRACTUEL] « Raccord » désigne toute pièce entrant dans la réalisation d'un branchement ou d'une extension en polyéthylène, depuis le raccord fixé sur le robinet de PEC ou le collier Astor fixé sur polyéthylène jusqu'à la niche du compteur, non compris le robinet cache-entrée et les raccords standard du compteur. [F056 p.29, prix 6 à 9]
- **R-DEF-031** [DÉDUIT] Le robinet cache-entrée, les raccords standard du compteur et le compteur lui-même sont hors du périmètre des prix 6 à 9 ; aucun prix du bordereau ne les couvre (hors bordereau). [F056 p.29]
- **R-DEF-032** [DÉDUIT] Unité d'œuvre des prix 6 et 9 : une réparation (une fuite sur tuyau) jusqu'à 2 m de polyéthylène ; au-delà de 2 m : `[NON PRÉCISÉ]`. Cumul possible, sur une même fuite, d'un prix 6 ou 9 avec un prix 7 ou 8, et avec les prix 3, 4, 5 et 10 : `[À CONFIRMER : règles de cumul non écrites]`. [F032 p.1]
- **R-DEF-033** [DÉDUIT] Le bordereau paie une réparation à l'unité, pas les pièces : les quantités de manchons, raccords et mètres de PEHD saisis sur la fiche servent à la justification et au suivi du stock, non au calcul du montant. [F032 p.1 ; F056 p.17, art. II-15 N.B.]

#### Prix n° 10 : mise à niveau de bouche à clé

> Prix n° 10 : Mise à niveau de bouche à clé carrée ou ronde
> Mise à niveau de bouche à clé carrée ou ronde, y compris Fourniture, transport et pose de tube
> PVC, tabernacle en polyester et socle de béton de longueur = largeur = 40 cm et profondeur = 20
> c
> Ce prix est rémunéré à l’unité.

- **R-DEF-034** [CONTRACTUEL] Le prix 10 rémunère à l'unité la mise à niveau d'une bouche à clé carrée ou ronde, y compris fourniture, transport et pose du tube allonge en PVC, du tabernacle en polyester et d'un socle en béton de 0,40 m × 0,40 m × 0,20. [F056 p.29, prix 10 ; F032 p.1, prix 00010]
- **R-DEF-035** [CONTRACTUEL] La mise en évidence des accès aux conduites pendant la recherche (détection des bouches à clé, curage) reste à la charge de l'entreprise et n'est pas payée par le prix 10. [F056 p.23, art. II-19]
- **R-DEF-036** [DÉDUIT] Les prix 7 et 8 incluent déjà le tabernacle, le tube PVC et le socle : le prix 10 ne se cumule pas avec eux pour la même bouche à clé `[À CONFIRMER]`. [F032 p.1]

#### Prix n° 11 à 13 : réparation sur conduites

> Prix n°11 à 13 : Réparation de fuites sur conduites diamètre inférieur ou égal A 315 MM
> (cf. au Bordereau des Prix - Détail Estimatif)
> Réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymétrique
> ou autres matériels de jonction y compris fourniture, transport ,coupe et pose pour
> remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du
> sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose
> grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation
> des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et
> toutes sujétions.
> Ces prix sont rémunérés à l’unité.

- **R-DEF-037** [CONTRACTUEL] Les prix 11 à 13 rémunèrent à l'unité la réparation de fuites sur conduites en amiante-ciment et en PVC, par joint gibault, joint dissymétrique ou autre matériel de jonction, y compris fourniture, transport, coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux. [F056 p.29, prix 11 à 13 ; F032 p.1]
- **R-DEF-038** [CONTRACTUEL] Ils comprennent : sable pour lit de pose de 0,10 m, grillage avertisseur bleu de 50 cm de large, cisaillement de la conduite, préparation des bouts de montage, démontage de l'élément, épuisement du fond de fouille et toutes sujétions. [F032 p.1, prix 00011 à 00013]
- **R-DEF-039** [CONTRACTUEL] Tranches de diamètre : prix 11 « compris entre 315 mm et 225 mm » ; prix 12 « compris entre 200 mm et 110 mm » ; prix 13 « inférieur à 110 mm ». [F032 p.1]
- **R-DEF-040** [DÉDUIT] Lecture proposée des tranches : prix 13 : `DN < 110` ; prix 12 : `110 ≤ DN ≤ 200` ; prix 11 : `225 ≤ DN ≤ 315`. Les bornes 110, 200, 225 et 315 sont réputées incluses `[À CONFIRMER : inclusivité]` ; aucun diamètre nominal usuel ne tombe dans `200 < DN < 225` ; `DN > 315` (400, 500, 600, 700) est hors bordereau. [F032 p.1 ; F056 p.29]
- **R-DEF-041** [DÉDUIT] Les conduites en fonte, acier galvanisé et PEHD de gros diamètre, les pièces spéciales (té, coude, cône), vannes et ventouses, présentes au catalogue de pièces STEPAG, n'ont pas de prix au bordereau 2026 (le marché de 2017 avait un prix 17 pour les pièces spéciales). [F001 feuille "LISTE" ; F077 art. 16, prix 17]
- **R-DEF-042** [DÉDUIT] Unité d'œuvre des prix 11 à 13 : une réparation par fuite, quelle que soit la longueur de l'élément remplacé (« remplacement total ou partiel d'un élément ») ; aucune plus-value au mètre. [F032 p.1]

#### Rémunération du balayage et du maintien

> Concernant le balayage de l’ensemble des secteurs inspectés :
> La rémunération de l’entreprise sera faite sur la base des prix unitaires du bordereau des prix et
> d'après les linéaires des réseaux ayant fait l’objet des balayages et des travaux de maintien des
> performances des réseaux. Des attachements contradictoires seront établis. La recherche
> détection des fuites sera effectuée avec la technique et le matériel de recherche des fuites
> proposé par l’entreprise et accepté par la SRM-ORI.

- **R-DEF-043** [CONTRACTUEL] La rémunération se fait sur la base des prix unitaires et d'après les linéaires de réseau ayant fait l'objet des balayages et du maintien ; des attachements contradictoires sont établis. [F056 p.29]
- **R-DEF-044** [CONTRACTUEL] La technique et le matériel de recherche sont proposés par l'entreprise et acceptés par la SRM-ORI. [F056 p.29]

### 5.2 Règles communes à tous les prix

- **R-DEF-045** [CONTRACTUEL] Clause « toutes sujétions » : « Les prix du marché comprennent le bénéfice et tous droits, impôts, taxes, frais généraux, faux frais et, de manière générale, toutes les dépenses induites par la prestation objet du marché jusqu'à l'exécution de celle-ci. » [F056 p.10, art. I-30]
- **R-DEF-046** [CONTRACTUEL] Fourniture, transport et pose du matériel de réparation sont à la charge de l'entreprise et compris dans les prix 6 à 13. [F056 p.17, art. II-15 N.B.]
- **R-DEF-047** [CONTRACTUEL] Signalisation de chantier, installation de chantier, bureau de 15 m2 pour la SRM, gardiennage, essais de laboratoire, rapports et tirages de plans sont à la charge de l'entreprise sans prix dédié. [F056 p.15-16, art. II-3 à II-7 ; F056 p.24, art. II-21 ; F056 p.27, art. II-30]
- **R-DEF-048** [CONTRACTUEL] Plus-values de nuit, de vendredi ou jour férié, d'urgence, de profondeur, de distance ou de réseaux tiers ; travaux en régie ; forfait d'installation ou de repli : aucun n'existe au bordereau. `[NON PRÉCISÉ]` dans le CPS. [F032 p.1]
- **R-DEF-049** [CONTRACTUEL] Procédure hors bordereau : le CPS renvoie aux articles 57, 58 et 59 du CCAG-T pour l'augmentation de la masse et le changement des quantités ; la procédure de prix nouveaux n'est pas reproduite `[À CONFIRMER : règle par défaut du CCAG-T, non vérifiée dans le dossier]`. [F056 p.13, art. I-33 et I-34]
- **R-DEF-050** [CONTRACTUEL] Arrondi des quantités et des montants : `[NON PRÉCISÉ]`. Seul arrondi écrit : coefficients de révision des prix arrêtés à la quatrième décimale (R-CPS-054). [F056 p.11, art. I-30]

### 5.3 Tableau « saisie terrain → prix »

| N° prix | Mesures à relever sur le terrain | Unité de saisie | Formule de quantité | Conditions | Statut | Source |
|---|---|---|---|---|---|---|
| 1 | linéaire de conduite inspecté par jour, par secteur et par tronçon (hors branchements) | ml | somme des linéaires inspectés, chaque conduite comptée une seule fois | période de balayage ; attachement contradictoire | CONTRACTUEL | [F056 p.28 ; p.21 ; p.23] |
| 2 | linéaire de réseau des secteurs maintenus | ml | linéaire des secteurs dont le maintien est assuré ; facturé 40 % puis 60 % | période de maintien ; zone non arrêtée | CONTRACTUEL | [F056 p.28 ; p.12-13] |
| 3 | longueur, largeur, profondeur de la fouille | m | L × l × P ; L ≤ 2 m, ou longueur de l'élément remplacé + 1 m | réparation de fuite ou sondage | CONTRACTUEL ; formule DÉDUIT | [F056 p.28] |
| 4 | longueur, largeur de la réfection ; nature du revêtement (béton, granito lavé, carreaux ciment, mosaïque) | m | L × l | revêtement de trottoir | CONTRACTUEL ; formule INTERNE | [F056 p.28] ; [F001 feuille "REFECTION"] |
| 5 | longueur, largeur de la réfection ; date de réfection | m | L × l | chaussée goudronnée ; enrobé à chaud 7 cm (enrobé-résine à froid si délai > 1 mois, même prix) | CONTRACTUEL ; formule INTERNE | [F056 p.28 ; p.23-24] |
| 6 | diamètre extérieur du tuyau PE ; longueur de PE remplacée ; pièces posées | mm ; m ; u | 1 par réparation | DE < 40 ; longueur PE ≤ 2 m | CONTRACTUEL | [F032 p.1] |
| 7 | robinet PEC changé (diamètre) | u | 1 par robinet changé | branchement ou conduite PE | CONTRACTUEL | [F032 p.1] |
| 8 | collier PEC changé (diamètre) | u | 1 par collier changé | branchement ou conduite PE | CONTRACTUEL | [F032 p.1] |
| 9 | diamètre extérieur du tuyau PE ; longueur de PE remplacée ; pièces posées | mm ; m ; u | 1 par réparation | DE ≥ 40 ; longueur PE ≤ 2 m | CONTRACTUEL | [F032 p.1] |
| 10 | bouche à clé mise à niveau (carrée ou ronde) | u | 1 par bouche à clé | hors bouches à clé comprises dans les prix 7 et 8 [À CONFIRMER] | CONTRACTUEL | [F032 p.1] |
| 11 | matériau (AC ou PVC) ; diamètre de la conduite | mm | 1 par réparation | 225 ≤ DN ≤ 315 | CONTRACTUEL ; bornes DÉDUIT | [F032 p.1] |
| 12 | matériau (AC ou PVC) ; diamètre de la conduite | mm | 1 par réparation | 110 ≤ DN ≤ 200 | CONTRACTUEL ; bornes DÉDUIT | [F032 p.1] |
| 13 | matériau (AC ou PVC) ; diamètre de la conduite | mm | 1 par réparation | DN < 110 | CONTRACTUEL ; bornes DÉDUIT | [F032 p.1] |

```csv
numero;mesures_a_relever;unite_saisie;formule_quantite;conditions;source
1;lineaire_inspecte_m par jour, secteur, troncon (hors branchements);ml;somme des lineaires inspectes sans double compte;phase balayage, attachement contradictoire;F056 p.28
2;lineaire_maintenu_m par secteur;ml;lineaire des secteurs maintenus, facture 40 % puis 60 %;phase maintien, zone non arretee;F056 p.28
3;fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m;m;longueur*largeur*profondeur avec longueur<=2 ou longueur element+1;reparation de fuite ou sondage;F056 p.28
4;refection_longueur_m, refection_largeur_m, nature_revetement;m;longueur*largeur;revetement in (beton, granito_lave, carreaux_ciment, mosaique);F056 p.28
5;refection_longueur_m, refection_largeur_m, date_refection;m;longueur*largeur;revetement = enrobe (chaussee goudronnee);F056 p.28
6;diametre_ext_mm, longueur_pe_m, pieces_posees;u;1 par reparation;materiau = polyethylene et diametre_ext_mm < 40 et longueur_pe_m <= 2;F032 p.1
7;robinet_pec_change;u;1 par robinet change;branchement ou conduite polyethylene;F032 p.1
8;collier_pec_change;u;1 par collier change;branchement ou conduite polyethylene;F032 p.1
9;diametre_ext_mm, longueur_pe_m, pieces_posees;u;1 par reparation;materiau = polyethylene et diametre_ext_mm >= 40 et longueur_pe_m <= 2;F032 p.1
10;bouche_a_cle_mise_a_niveau;u;1 par bouche a cle;bouche a cle carree ou ronde;F032 p.1
11;materiau, diametre_nominal_mm;u;1 par reparation;materiau in (amiante_ciment, pvc) et 225 <= dn <= 315;F032 p.1
12;materiau, diametre_nominal_mm;u;1 par reparation;materiau in (amiante_ciment, pvc) et 110 <= dn <= 200;F032 p.1
13;materiau, diametre_nominal_mm;u;1 par reparation;materiau in (amiante_ciment, pvc) et dn < 110;F032 p.1
```

### 5.4 Synthèse par numéro de prix

| N° prix | Inclus | Exclus | Mode de métré | Conditions | Prix liés | Source |
|---|---|---|---|---|---|---|
| 1 | balayage de l'ensemble des réseaux ; toutes méthodes de détection ; mesures de débit ; rapports | linéaire des branchements ; second passage | ml de conduite balayée, une fois | objectif Q exigé du tableau n° 1 | pénalité τ1 ; prix 2 | [F056 p.28] |
| 2 | maintien des débits nocturnes atteints ; contrôles hebdomadaires | — | ml de réseau maintenu | 8 mois après le balayage | pénalité τ2 ; prix 1 | [F056 p.28] |
| 3 | tranchée tout terrain ; remblaiement ; compactage ; transport des terres ; réglage ; étaiement ; blindage ; épuisement | [NON PRÉCISÉ] | m3 | longueur ≤ 2 m ou élément + 1 m | prix 4 ; 5 ; 6 à 13 | [F056 p.28] |
| 4 | empierrement ; blocage pierre ≥ 15 cm ; forme ; revêtement identique épaisseur 0,10 m ; tout venant GNA | [NON PRÉCISÉ] | m2 | trottoir béton, granito lavé, carreaux ciment, mosaïque ; reprise si observations de la voirie | prix 3 | [F056 p.28] ; [F032 p.1] |
| 5 | GNA 0,50 m compacté arrosé ; imprégnation cut back ; enrobés à chaud 7 cm | rémunération supplémentaire de l'enrobé-résine à froid | m2 | chaussée ; délai 1 mois ; carottage 1 par 50 m2 | prix 3 ; pénalité de non-conformité | [F056 p.28] |
| 6 | fourniture, transport, pose ; sable 0,10 m ; grillage bleu 50 cm ; cisaillement ; raccords ; collier ; manchon ou bouchon | robinet cache-entrée ; raccords standard du compteur | u | PE DE < 40 ; longueur ≤ 2 m | prix 3 ; 4 ; 5 ; 9 | [F032 p.1] |
| 7 | fourniture, transport, pose du robinet PEC ; tabernacle ; tube PVC ; socle béton 0,40 × 0,40 × 0,20 | — | u | tous diamètres | prix 8 ; 10 | [F032 p.1] |
| 8 | fourniture, transport, pose du collier PEC ; tabernacle ; tube PVC ; socle béton 0,40 × 0,40 × 0,20 | — | u | tous diamètres | prix 7 ; 10 | [F032 p.1] |
| 9 | comme le prix 6 | comme le prix 6 | u | PE DE ≥ 40 ; longueur ≤ 2 m | prix 6 | [F032 p.1] |
| 10 | tube allonge PVC ; tabernacle polyester ; socle béton 0,40 × 0,40 × 0,20 | curage et recherche des bouches à clé | u | bouche à clé carrée ou ronde | prix 7 ; 8 | [F056 p.29] |
| 11 | joint gibault, dissymétrique ou autre ; remplacement total ou partiel d'un élément ; sable ; grillage ; cisaillement ; démontage ; épuisement | [NON PRÉCISÉ] | u | AC ou PVC ; 225 ≤ DN ≤ 315 | prix 3 ; 12 ; 13 | [F032 p.1] |
| 12 | comme le prix 11 | [NON PRÉCISÉ] | u | AC ou PVC ; 110 ≤ DN ≤ 200 | prix 3 ; 11 ; 13 | [F032 p.1] |
| 13 | comme le prix 11 | [NON PRÉCISÉ] | u | AC ou PVC ; DN < 110 | prix 3 ; 11 ; 12 | [F032 p.1] |

## 6. Matériaux et articles

**Résumé.** Les documents contractuels ne citent que peu de matériaux (polyéthylène, PVC, amiante-ciment, robinet et collier de prise en charge, collier Astor, joint gibault, joint dissymétrique, tabernacle, tube PVC, bouche à clé, sable, grillage avertisseur, GNA, cut back, enrobés). Le catalogue détaillé (268 désignations) vient du classeur d'attachement STEPAG ([F001], feuille « LISTE ») : c'est une liste interne, héritée de 2017, qui sert à saisir les pièces posées. En 2026 toutes les fournitures sont à la charge de l'entreprise et comprises dans les prix unitaires de réparation.

**Principaux `[NON PRÉCISÉ]`.** Normes et agréments exigés par pièce (le CPS dit seulement « conforme aux normes en vigueur », approbation préalable de la SRM) ; marques ; pression nominale ; informations à relever à la pose (marque, série) ; rattachement officiel de chaque pièce à un prix.

### 6.1 Matériaux cités par les pièces contractuelles

| Matériau ou fourniture | Caractéristique imposée | Norme ou agrément | Prix de rattachement | Qui fournit | Compris dans un prix | Source |
|---|---|---|---|---|---|---|
| Tuyau polyéthylène (branchements et extensions) | diamètre extérieur < 40 mm ou ≥ 40 mm ; longueur ≤ 2 m par réparation | [NON PRÉCISÉ] | 6 ; 9 | entreprise | oui | [F032 p.1] |
| Raccords, collier pour polyéthylène, manchon, bouchon | montage par mise en place | [NON PRÉCISÉ] | 6 ; 9 | entreprise | oui | [F032 p.1] |
| Robinet de prise en charge (PEC) | différents diamètres | [NON PRÉCISÉ] | 7 | entreprise | oui | [F032 p.1] |
| Collier de prise en charge (PEC) | différents diamètres | [NON PRÉCISÉ] | 8 | entreprise | oui | [F032 p.1] |
| Collier Astor | fixé sur polyéthylène | [NON PRÉCISÉ] | 6 à 9 | entreprise | oui | [F056 p.29] |
| Tabernacle | en polyester | [NON PRÉCISÉ] | 7 ; 8 ; 10 | entreprise | oui | [F056 p.29] ; [F032 p.1] |
| Tube PVC (tube allonge de bouche à clé) | — | [NON PRÉCISÉ] | 7 ; 8 ; 10 | entreprise | oui | [F032 p.1] |
| Bouche à clé carrée ou ronde | socle béton 0,40 × 0,40 × 0,20 | [NON PRÉCISÉ] | 7 ; 8 ; 10 | entreprise | oui | [F032 p.1] |
| Béton du socle | fourni par l'entreprise | [NON PRÉCISÉ] | 7 ; 8 ; 10 | entreprise | oui | [F032 p.1] |
| Joint gibault, joint dissymétrique, autres matériels de jonction | pour conduites amiante-ciment et PVC, DN ≤ 315 | [NON PRÉCISÉ] | 11 ; 12 ; 13 | entreprise | oui | [F032 p.1] |
| Élément de conduite de remplacement (amiante-ciment, PVC) | remplacement total ou partiel | [NON PRÉCISÉ] | 11 ; 12 ; 13 | entreprise | oui | [F032 p.1] |
| Sable pour lit de pose | épaisseur 0,10 m | — | 6 ; 9 ; 11 ; 12 ; 13 | entreprise | oui | [F032 p.1] |
| Grillage avertisseur | couleur bleue ; largeur 50 cm | — | 6 ; 9 ; 11 ; 12 ; 13 | entreprise | oui | [F032 p.1] |
| Tout venant GNA | 0,50 m compacté arrosé (chaussée) ; couche sous trottoir | — | 4 ; 5 | entreprise | oui | [F056 p.28] |
| Blocage en pierre | épaisseur minimale 15 cm | — | 4 | entreprise | oui | [F032 p.1] |
| Revêtement de trottoir | béton, granito lavé, carreaux ciment, mosaïque ; épaisseur 0,10 m ; identique à l'original | — | 4 | entreprise | oui | [F032 p.1] |
| Couche d'imprégnation | cut back ou émulsion | — | 5 | entreprise | oui | [F056 p.23] |
| Enrobé à chaud | épaisseur 7 cm | exigence de la Commune Urbaine | 5 | entreprise | oui | [F056 p.23] |
| Enrobé-résine à froid (bitume et élastomère) | granulométrie 0/4 ; densité 1,7 / 1,9 g/cm3 ; perte de particules 0,0 / 5,0 | UNE EN 12697-2 ; UNE EN 12697-6 ; EN 12697-17 | 5 (sans supplément) | entreprise | oui | [F056 p.23-24] |
| Robinet cache-entrée ; raccords standard du compteur | exclus de la définition du « raccord » | — | aucun (hors bordereau) | [NON PRÉCISÉ] | non | [F056 p.29] |

- **R-MAT-001** [CONTRACTUEL] Tout le matériel de réparation est fourni, transporté et posé par l'entreprise, soumis à l'approbation de la SRM avant le démarrage et conforme aux normes en vigueur ; aucun bon de sortie magasin ni restitution de pièces déposées n'est prévu. [F056 p.17, art. II-15 N.B.]
- **R-MAT-002** [DÉDUIT] Les pièces posées ne sont pas facturées à part : elles justifient le prix unitaire de réparation retenu (6 à 13). Les colonnes « Prix proposé » ci-dessous sont une proposition de l'extracteur, à valider avec la SRM. [F032 p.1]
- **R-MAT-003** [INTERNE] Informations relevées à la pose dans le gabarit STEPAG : désignation de la pièce (qui encode type et diamètres) et quantité posée (unités, ou mètres pour le PEHD). Marque, numéro de série, norme : non relevés. [F001 feuille "Fiche de réparation Zone " I:J]
- **R-MAT-004** [INTERNE] Convention de nommage du catalogue : « PEHD 26/32 » = diamètre intérieur / extérieur en mm ; « Manchon réduit 32/25 » = deux diamètres raccordés ; « Collier PEC 110/20 » = diamètre de la conduite / diamètre de la prise ; « Raccord en laiton 32 3/4 » = diamètre du polyéthylène et filetage en pouces ; « Joint Gibault 75/80 », « Joint dissymétrique 90*80 » = diamètres des deux bouts. [F001 feuille "LISTE" ; notes F065]

### 6.2 Catalogue des pièces du classeur STEPAG (liste interne, intégrale)

Statut `[INTERNE]`. Colonnes « Famille proposée » et « Prix 2026 proposé » : propositions de l'extracteur calculées par script à partir du premier diamètre lu dans la désignation (diamètre extérieur pour le PEHD).

| N° | Désignation exacte | Famille proposée | Unité de saisie | Prix 2026 proposé | Compris dans le prix | Source |
|---|---|---|---|---|---|---|
| 1 | A DETECTER | motif (pas une pièce) | — | — | — | [F001 feuille "LISTE" A] |
| 2 | RAS | motif (pas une pièce) | — | — | — | [F001 feuille "LISTE" A] |
| 3 | Assainissement | motif (pas une pièce) | — | — | — | [F001 feuille "LISTE" A] |
| 4 | refusé par l'abonné | motif (pas une pièce) | — | — | — | [F001 feuille "LISTE" A] |
| 5 | sondage negatif | motif (pas une pièce) | — | — | — | [F001 feuille "LISTE" A] |
| 6 | Manchon droit 15 | manchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 7 | Manchon droit 75/75 | manchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 8 | Manchon DN 600 | manchon | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 9 | Manchon droit 63/63 | manchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 10 | Manchon droit 50/50 | manchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 11 | Manchon droit 40/40 | manchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 12 | Manchon droit 32/32 | manchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 13 | Manchon droit 20/20 | manchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 14 | Manchon droit 25/25 | manchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 15 | Manchon réduit 32/25 | manchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 16 | Manchon réduit 40/32 | manchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 17 | Manchon réduit 75/63 | manchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 18 | Robinet d'arret 25/15 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 19 | Robinet d'arret 32/15 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 20 | Robinet d'arret 15 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 21 | Robinet d'arret 63 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 22 | Robinet d'arret 20 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 23 | Robinet FF 32 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 24 | Robinet FF 20 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 25 | Robinet FF 50/50 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 26 | Robinet PEC 50 1-1/2 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 27 | Robinet PEC 40 1-1/2 F | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 28 | Robinet PEC 63 1-1/2 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 29 | Robinet PEC 20/32 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 30 | Robinet PEC 20/25 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 31 | Robinet PEC 40/40 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 32 | Robinet PEC 40/50 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 33 | Robinet PEC 63/40 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 34 | Robinet vanne 200 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 35 | Robinet vanne 100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 36 | Robinet vanne 150 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 37 | Robinet vanne 60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 38 | Robinet vanne 80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 39 | Robinet vanne 50/40 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 40 | Robinet vanne 30 1-1/4 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 41 | Raccord en laiton 50 1-1/2 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 42 | Raccord en laiton 63 1-1/2 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 43 | Raccord en laiton 75 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 44 | Raccord en laiton 40 1-1/4 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 45 | Raccord en laiton 40 1/2 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 46 | Raccord en laiton 32 1/2 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 47 | Raccord en laiton 32 3/4 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 48 | Raccord en laiton 25 3/4 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 49 | Raccord en laiton 25 1/2 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 50 | Raccord standard 15 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 51 | Raccord standard 30 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 52 | coude dn 15 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 53 | coude dn 40 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 54 | coude dn 20 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 55 | coude dn 50 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 56 | coude dn 75 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 57 | coude dn 90 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 58 | coude dn 63 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 59 | coude dn 100 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 60 | coude dn 1/8 110 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 61 | Collier PEC 50/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 62 | Collier PEC 40/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 63 | Collier PEC 80/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 64 | Collier PEC 80/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 65 | Collier PEC 63/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 66 | Collier PEC 60/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 67 | Collier PEC 60/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 68 | Collier PEC 63/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 69 | Collier PEC 75/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 70 | Collier PEC 40/90 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 71 | Collier PEC 100/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 72 | Collier PEC 110/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 73 | Collier PEC 110/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 74 | Collier PEC 100/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 75 | Collier PEC 150/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 76 | Collier PEC 150/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 77 | Collier PEC 160/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 78 | Collier PEC 200/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 79 | Collier PEC 225/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 80 | Collier PEC  400/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 81 | Collier PEC 160/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 82 | Collier ASTOR 32 3/4 | collier pour polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 83 | Collier ASTOR 50 3/4 | collier pour polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 84 | Collier ASTOR 40 3/4 | collier pour polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 85 | Collier ASTOR 63 3/4 | collier pour polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 86 | compteur dn 100 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 87 | boulon 24 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 88 | boulon 16x80 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 89 | boulon 20x80 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 90 | boulon 16X70 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 91 | boulon 20X110 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 92 | Fillasse | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 93 | PEHD 75/75 | tuyau polyéthylène | m | 9 | compris | [F001 feuille "LISTE" A] |
| 94 | PEHD 53/63 | tuyau polyéthylène | m | 9 | compris | [F001 feuille "LISTE" A] |
| 95 | PEHD 33/40 | tuyau polyéthylène | m | 9 | compris | [F001 feuille "LISTE" A] |
| 96 | PEHD 42/50 | tuyau polyéthylène | m | 9 | compris | [F001 feuille "LISTE" A] |
| 97 | PEHD 19/25 | tuyau polyéthylène | m | 6 | compris | [F001 feuille "LISTE" A] |
| 98 | PEHD 20 | tuyau polyéthylène | m | 6 | compris | [F001 feuille "LISTE" A] |
| 99 | PEHD 15 | tuyau polyéthylène | m | 6 | compris | [F001 feuille "LISTE" A] |
| 100 | PEHD 26/32 | tuyau polyéthylène | m | 6 | compris | [F001 feuille "LISTE" A] |
| 101 | PEHD /75 | tuyau polyéthylène | m | 9 | compris | [F001 feuille "LISTE" A] |
| 102 | PPR 25 | manchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 103 | Robinet equerre 32 1/2 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 104 | Robinet equerre 25 1/2 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 105 | Robinet equerre 25 3/4 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 106 | Robinet equerre 15 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 107 | Robinet equerre 20 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 108 | Tabernacle | bouche à clé | u | 7 ; 8 ; 10 | compris | [F001 feuille "LISTE" A] |
| 109 | Bouche à clé carrée | bouche à clé | u | 7 ; 8 ; 10 | compris | [F001 feuille "LISTE" A] |
| 110 | Tube PVC 90 | bouche à clé | u | 7 ; 8 ; 10 | compris | [F001 feuille "LISTE" A] |
| 111 | Robinet FF 1/2 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 112 | Robinet FF 25/15 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 113 | Robinet pec 32/15 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 114 | Robinet PEC 30/40 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 115 | Robinet PEC 40/20 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 116 | Robinet PEC 20/15 | robinet de prise en charge | u | 7 | compris | [F001 feuille "LISTE" A] |
| 117 | Collier PEC 140/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 118 | Collier PEC 50/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 119 | Joint Gibault 60 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 120 | Joint Gibault 63 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 121 | Joint Gibault 75/80 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 122 | Joint Gibault 75 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 123 | Joint Gibault 75/60 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 124 | Joint Gibault 80 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 125 | Joint Gibault 90 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 126 | Joint Gibault 80/90 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 127 | Joint Gibault  100 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 128 | Joint Gibault 110 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 129 | Joint Gibault 125 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 130 | Joint Gibault 140 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 131 | Joint Gibault 150 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 132 | Joint Gibault 160 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 133 | Joint Gibault 200 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 134 | Joint Gibault  225 | jonction ou tuyau de conduite AC/PVC | u | 11 | compris | [F001 feuille "LISTE" A] |
| 135 | Joint Gibault  250 | jonction ou tuyau de conduite AC/PVC | u | 11 | compris | [F001 feuille "LISTE" A] |
| 136 | Joint Gibault  300 | jonction ou tuyau de conduite AC/PVC | u | 11 | compris | [F001 feuille "LISTE" A] |
| 137 | Joint Gibault  315 | jonction ou tuyau de conduite AC/PVC | u | 11 | compris | [F001 feuille "LISTE" A] |
| 138 | Joint Gibault  400 | jonction ou tuyau de conduite AC/PVC | u | hors bordereau (DN > 315) | — | [F001 feuille "LISTE" A] |
| 139 | Joint Gibault  500 | jonction ou tuyau de conduite AC/PVC | u | hors bordereau (DN > 315) | — | [F001 feuille "LISTE" A] |
| 140 | Joint de démontage dn 400 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 141 | Joint de démontage dn 100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 142 | Joint dissymétrique  90*80 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 143 | Joint dissymétrique  150*160 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 144 | Joint dissymétrique  100*110 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 145 | Joint dissymétrique  200*225 | jonction ou tuyau de conduite AC/PVC | u | 12 | compris | [F001 feuille "LISTE" A] |
| 146 | Joint dissymétrique  60*75 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 147 | buse DN200 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 148 | Tuyau PVC D 63 | jonction ou tuyau de conduite AC/PVC | m | 13 | compris | [F001 feuille "LISTE" A] |
| 149 | Tuyau PVC D 75 | jonction ou tuyau de conduite AC/PVC | m | 13 | compris | [F001 feuille "LISTE" A] |
| 150 | Tuyau PVC D 90 | jonction ou tuyau de conduite AC/PVC | m | 13 | compris | [F001 feuille "LISTE" A] |
| 151 | Tuyau PVC D 110 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 152 | Tuyau PVC D 125 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 153 | Tuyau PVC D 140 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 154 | Tuyau AC D 150 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 155 | Tuyau AC D 151 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 156 | Tuyau PVC D 160 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 157 | Tuyau PVC D 200 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 158 | Tuyau PVC D 225 | jonction ou tuyau de conduite AC/PVC | m | 11 | compris | [F001 feuille "LISTE" A] |
| 159 | Tuyau PVC D 250 | jonction ou tuyau de conduite AC/PVC | m | 11 | compris | [F001 feuille "LISTE" A] |
| 160 | Tuyau PVC D 315 | jonction ou tuyau de conduite AC/PVC | m | 11 | compris | [F001 feuille "LISTE" A] |
| 161 | Tuyau PVC D 400 | jonction ou tuyau de conduite AC/PVC | m | hors bordereau (DN > 315) | — | [F001 feuille "LISTE" A] |
| 162 | Tuyau PVC D 500 | jonction ou tuyau de conduite AC/PVC | m | hors bordereau (DN > 315) | — | [F001 feuille "LISTE" A] |
| 163 | Tuyau AC DN 150 | jonction ou tuyau de conduite AC/PVC | m | 12 | compris | [F001 feuille "LISTE" A] |
| 164 | Tuyau AC DN 300 | jonction ou tuyau de conduite AC/PVC | m | 11 | compris | [F001 feuille "LISTE" A] |
| 165 | Collier PEC 75/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 166 | Collier PEC 90/20 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 167 | Joint tolérance 75 | jonction ou tuyau de conduite AC/PVC | u | 13 | compris | [F001 feuille "LISTE" A] |
| 168 | tuyau  pehd | tuyau polyéthylène | m | 6 ou 9 | compris | [F001 feuille "LISTE" A] |
| 169 | Joint tapis | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 170 | ventouse DN 100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 171 | ventouse DN 80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 172 | ventouse DN 60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 173 | bouchon dn 25 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 174 | bouchon dn20 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 175 | bouchon dn 40 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 176 | bouchon dn 32 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 177 | bouchon dn 20 ASTORE | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 178 | bouchon dn 32 ASTORE | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 179 | bouchon dn 50 ASTORE | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 180 | bouchon dn 50 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 181 | bouchon dn 75 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 182 | bouchon dn 90 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 183 | bouchon dn 110 | raccord ou bouchon gros diamètre | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 184 | bouchon dn 315 | raccord ou bouchon gros diamètre | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 185 | bouchon dn 63 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 186 | bouchon dn  160 | raccord ou bouchon gros diamètre | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 187 | adaptateur de bride dn 60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 188 | adaptateur de bride dn 80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 189 | adaptateur de bride dn 90/80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 190 | adaptateur de bride dn 150 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 191 | adaptateur de bride dn 300 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 192 | adaptateur de bride dn 315 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 193 | adaptateur de bride dn 100/110 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 194 | adaptateur de bride dn 200/225 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 195 | adaptateur de bride dn 400 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 196 | bride major dn 400 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 197 | bride major dn 225/200 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 198 | bride major dn 315/300 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 199 | bride major dn 110/100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 200 | bride major dn 160 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 201 | bride major dn 90/80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 202 | bride major dn 90 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 203 | bride major dn 75 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 204 | bride major dn 63 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 205 | BU DN 200 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 206 | BU DN 100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 207 | BU DN 150 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 208 | BU DN 160 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 209 | BU DN 300 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 210 | BU DN 60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 211 | BU DN 80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 212 | obturateur dn 40 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 213 | obturateur dn 50 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 214 | obturateur dn 63 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 215 | obturateur dn 75 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 216 | obturateur dn 90 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 217 | obturateur dn 60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 218 | obturateur dn 80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 219 | obturateur dn 100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 220 | obturateur dn 150 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 221 | obturateur dn 200 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 222 | cône de réduction 160/110 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 223 | réducteur dn 400 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 224 | PLAQ REGARD CADRE CARRE TAMP ROND 800X800 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 225 | PLAQ REGARD TAMPON ET CADRE CARRE  500X500 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 226 | touvenant | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 227 | Réducteur 300 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 228 | TE 150/100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 229 | TE 150/150 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 230 | TE 100/100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 231 | TE 100/80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 232 | TE 110/80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 233 | TE 200/60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 234 | TE 100/60 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 235 | TE 150/80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 236 | TE 160/160 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 237 | TE 200/100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 238 | TE 63 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 239 | TE 75/75 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 240 | TE 50 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 241 | TE 200/80 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 242 | TE 63 ASTORE | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 243 | FUITE SUR CONDUITE DN 700 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 244 | FUITE SUR CONDUITE DN 600 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 245 | Fonte ductile dn400 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 246 | CONDUITE DN 90 ACIER GALVANISE | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 247 | vanne dn 400 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 248 | beton b2 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 249 | acier haut adherance 10 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 250 | acier haut adherance 12 | consommable ou matériau | — | compris dans les prix (sujétions) | compris | [F001 feuille "LISTE" A] |
| 251 | Collier pec 200/40 | collier de prise en charge | u | 8 | compris | [F001 feuille "LISTE" A] |
| 252 | Raccord  40/30 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 253 | Raccord  63/40 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 254 | Raccord  20 | raccord, coude ou bouchon polyéthylène | u | 6 | compris | [F001 feuille "LISTE" A] |
| 255 | Raccord  Astore 50 | raccord, coude ou bouchon polyéthylène | u | 9 | compris | [F001 feuille "LISTE" A] |
| 256 | AC dn 300 | jonction ou tuyau de conduite AC/PVC | m | 11 | compris | [F001 feuille "LISTE" A] |
| 257 | CONE 225/160 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 258 | CONE DE REDUCTION 160/110 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 259 | CONE DE REDUCTION 150/100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 260 | CONE DE REDUCTION 160/225 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 261 | plaque de regard | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 262 | Porte de niche 50/50 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |
| 263 | bouche d'incendie | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 264 | monchette dn 200 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 265 | monchette dn 100 | pièce spéciale, robinetterie ou ouvrage | u | hors bordereau probable | — | [F001 feuille "LISTE" A] |
| 266 | Robinet FF 50 | côté compteur (cache-entrée, raccord standard, compteur) | u | hors périmètre des prix 6 à 9 | — | [F001 feuille "LISTE" A] |

- **R-MAT-005** [INTERNE] Le catalogue compte 266 désignations distinctes (268 cellules, doublons compris), dont 5 motifs qui ne sont pas des pièces (« A DETECTER », « RAS », « Assainissement », « refusé par l'abonné », « sondage negatif »). [F001 feuille "LISTE"]
- **R-MAT-006** [DÉDUIT] 109 désignations n'ont pas de prix évident au bordereau 2026 (robinets-vannes, ventouses, tés, cônes, brides, adaptateurs, obturateurs, plaques de regard, conduites de diamètre > 315, fonte, acier, pièces côté compteur) : hors bordereau probable, à traiter par prix nouveaux (question en section 12). [F001 feuille "LISTE" ; F032 p.1]
- **R-MAT-007** [DÉDUIT] Diamètres de conduite cités dans le catalogue : 60, 63, 75, 80, 90, 100, 110, 125, 140, 150, 160, 200, 225, 250, 300, 315, 400, 500, 600, 700 ; diamètres de polyéthylène : 15, 20, 25, 32, 40, 50, 63, 75 (voir liste `diametre_nominal` en 6 bis). [F001 feuille "LISTE"]

## 6 bis. Énumérations (listes de valeurs fermées)

**Résumé.** Toutes les listes de valeurs sont réunies ici ; les autres sections y renvoient par le nom de la liste. Aucun classeur du dossier ne contient de liste de validation Excel (vérifié par script sur tous les `.xlsx` ; non vérifiable sur les `.xls`) : les listes ci-dessous sont reconstituées à partir du CPS, du bordereau et des valeurs réellement saisies. La colonne « Code proposé » est une proposition de l'extracteur.

**Principaux `[NON PRÉCISÉ]`.** Classes de débit de fuite ; classes de profondeur ; nature du terrain ; origine du signalement ; quartiers ; liste officielle des tournées ; statuts contractuels d'une fuite ; découpage exact des secteurs de la zone 1 et de la zone 3.

### Liste `zone_intervention`

Liste : FERMÉE (tableau n° 1 du CPS).

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| zone_1_universite | Zone université 7000m3 et champ tir | — | zone n° 1 ; 358 km ; Q exigé 126 m3/h | 1 ; 2 | [F056 p.18] |
| zone_2_jbel_hamra_dn700 | Zone jbel hamra DN700 | — | zone n° 2 ; 362 km ; Q exigé 130 m3/h | 1 ; 2 | [F056 p.18] |
| zone_3_ain_serrak | Zone Reservoir AIN SERRAK 5000M3 | — | zone n° 3 ; 228 km ; Q exigé 118 m3/h | 1 ; 2 | [F056 p.18] |
| zone_4_sidi_yahya | Zone Sidi Yahya 5000 M3 4000M3 | — | zone n° 4 ; 399 km ; Q exigé 112 m3/h | 1 ; 2 | [F056 p.18] |
| zone_5_jbel_hamra_dn600 | Zone jbel hamra DN600 | — | zone n° 5 ; 119 km ; Q exigé 83 m3/h | 1 ; 2 | [F056 p.19] |

Variante d'écriture rencontrée : « Zone 4 Sidi yahya 5000 M3 et 4000 M3 » [F119 F8]. Les mentions « 7000m3 », « 5000M3 », « 4000M3 » désignent vraisemblablement la capacité du réservoir de tête et « DN700 », « DN600 » le diamètre de la conduite d'alimentation `[À CONFIRMER : non écrit]`.

### Liste `secteur`

Liste : FERMÉE (tableau n° 1), découpage `[À CONFIRMER]` : la ponctuation du tableau est ambiguë (« Château Sidi Aissa Azengot » sans virgule ; « Derfoufi et Zerkrtouni – Mohammadi Intérieur – … ») et les planches traitent « Qods Haut, Chu-Mouhoub-Irriss » comme un seul secteur. Le découpage proposé suit les planches quand elles existent.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| qods_haut_chu_mouhoub_iriss | Qods Haut, Andalous, Chu - Mouhoub -Iriss (« QODS HAUT, CHU -MOUHOUB -IRRISS » sur la planche) | — | zone 1 ; planche F112 ; Qods Haut et Chu-Mouhoub-Iriss réunis sur la planche `[À CONFIRMER]` | 1 ; 2 | [F056 p.18] ; [F112] |
| andalous | Andalous | — | zone 1 ; planche F098 | 1 ; 2 | [F056 p.18] ; [F098] |
| maafa_bekay_bas | Maafa Bekay Bas (« SIDI MAAFA BAS » sur la planche) | — | zone 1 ; planche F106 | 1 ; 2 | [F056 p.18] ; [F106] |
| ballaoui_bas_irfane | Ballaoui Bas-Irfane- Unisit-Colline-Partie H Ain Serrak | — | zone 1 ; planche F100 (« part 1 » : « UNISIT-COLLINE-PARTIE H AIN SERRAK », « BELLAOUI HAUT ») ; un ou plusieurs secteurs `[À CONFIRMER]` | 1 ; 2 | [F056 p.18] ; [F100] |
| qods_bas | Qods Bas | — | zone 1 ; planche F111 | 1 ; 2 | [F056 p.18] ; [F111] |
| chateau_sidi_aissa | Château Sidi Aissa | — | zone 1 ; planche F101 | 1 ; 2 | [F056 p.18] ; [F101] |
| azengot | Azengot | — | zone 1 ; planche F099 | 1 ; 2 | [F056 p.18] ; [F099] |
| maksam_kharoub | Maksam-Kharoub | — | zone 1 ; planche F107 | 1 ; 2 | [F056 p.18] ; [F107] |
| lazaret_bas | Lazaret Bas | — | zone 2 ; planche F103 | 1 ; 2 | [F056 p.18] ; [F103] |
| tairet | Tairet (planches : « TAIRET BAS », « TAIRET HAUT ») | — | zone 2 ; planches F114, F115 ; un ou deux secteurs `[À CONFIRMER]` | 1 ; 2 | [F056 p.18] ; [F114] ; [F115] |
| mbasso | Mbasso | — | zone 2 ; planche F108 | 1 ; 2 | [F056 p.18] ; [F108] |
| tennis_2 | Tennis2 | — | zone 2 ; planche F117 | 1 ; 2 | [F056 p.18] ; [F117] |
| sidi_driss | Sidi Driss | — | zone 2 ; planche F113 | 1 ; 2 | [F056 p.18] ; [F113] |
| tazaghine | Secteur Tazaghine | — | zone 2 ; planche F116 | 1 ; 2 | [F056 p.18] ; [F116] |
| el_boustane | El Boustane | — | zone 2 ; visible sur la planche F102 | 1 ; 2 | [F056 p.18] ; [F102] |
| ghar_el_baroud_zone_industrielle | Ghar El Baroud-Zone Industrielle | — | zone 2 ; planche F102 | 1 ; 2 | [F056 p.18] ; [F102] |
| derfoufi_zerktouni | Derfoufi et Zerkrtouni | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| mohammadi_interieur | Mohammadi Intérieur | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| allal_ben_abdellah | Allal Ben Abdellah | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| oued_makhazine | Oued Makhazine | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| mauritanie_hassani | Mauritanie et Hassani | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| mohammadi_exterieur | Mohammadi Extérieur | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| benkhirane | Benkhirane | — | zone 3 ; aucune planche | 1 ; 2 | [F056 p.18] |
| sidi_yahya | Sidi yahya | — | zone 4 ; aucune planche | 1 ; 2 | [F056 p.18] |
| pam | Pam | — | zone 4 ; planche F109 | 1 ; 2 | [F056 p.18] ; [F109] |
| lazaret_haut | Lazaret haut | — | zone 4 ; planches F104, F105 (parts 1 et 2) | 1 ; 2 | [F056 p.18] ; [F104] ; [F105] |
| abdellah_guenoun | Abdellah Guenoun (planches : « ABDELLAH GUNOUN BAS », « ABDELLAH GUNOUN HAUT ») | — | zone 4 ; planches F096, F097 ; un ou deux secteurs `[À CONFIRMER]` | 1 ; 2 | [F056 p.18] ; [F096] ; [F097] |
| medina | Medina | — | zone 5 ; aucune planche | 1 ; 2 | [F056 p.19] |
| rte_algerie | Rte Algerie | — | zone 5 ; aucune planche | 1 ; 2 | [F056 p.19] |
| tennis_1 | Tennis 1 | — | zone 5 ; aucune planche (visible en bord de F117) | 1 ; 2 | [F056 p.19] |
| aounia | Aounia | — | zone 5 ; aucune planche | 1 ; 2 | [F056 p.19] |
| atlas | Atlas | — | zone 5 ; aucune planche | 1 ; 2 | [F056 p.19] |
| lieutenant_belhoucine | Lieutenant Belhoucine | — | zone 5 ; aucune planche | 1 ; 2 | [F056 p.19] |
| boudir | Boudir | — | zone 5 ; aucune planche | 1 ; 2 | [F056 p.19] |

Autres noms de secteur rencontrés hors tableau n° 1 : « SIDI MOUSSA MHAYA », « LABSARA » (noms de feuilles des gabarits STEPAG, [F121], [F123]) ; secteurs de 2017 `[2017]` : Lazaret, Lazaret 2, Mchiwer, Si Lakhder, Si Lakhder 2, Riad, SIDI YAHYA 2, A. Guennoun, A,GUENNOUN 2, Rte ALGERIE, Alaounia, Medina, Taza, Moritanie, Jawhara, Tennis 1, Mir Ali [F065]. Le linéaire par secteur n'est donné nulle part : `[NON PRÉCISÉ]` (seul le linéaire par zone est connu).

### Liste `phase_marche`

Liste : FERMÉE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| balayage | balayage | — | 4 mois à compter de l'OS de commencement | 1 ; 3 à 13 | [F056 p.17, art. II-14] |
| maintien_1 | maintien des performances (première phase) | — | 4 mois après le balayage ; facture de 40 % du prix 2 | 2 ; 3 à 13 | [F056 p.17] ; [F056 p.12] |
| maintien_2 | maintien des performances (seconde phase) | — | 4 mois suivants ; facture de 60 % du prix 2 | 2 ; 3 à 13 | [F056 p.17] ; [F056 p.13] |
| garantie | délai de garantie | — | 12 mois après la réception provisoire | aucun | [F056 p.10, art. I-28] |

### Liste `visibilite_fuite`

Liste : FERMÉE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| visible | Visibles | — | fuite visible, dont la localisation est à préciser | aucun prix propre | [F056 p.25, art. II-25] ; [F119 G15] |
| invisible | Invisibles | — | fuite trouvée par détection | aucun prix propre | [F056 p.25, art. II-25] ; [F119 H15] |

### Liste `type_fuite` (définition contractuelle de la « fuite »)

Liste : OUVERTE (« exemple : branchement clandestin… »).

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| fuite_proprement_dite | Fuite proprement dite | — | — | 6 à 13 | [F056 p.25, art. II-25] |
| element_inconnu | Découverte d'un élément inconnu pour la SRM-ORI | — | exemple : branchement clandestin | [NON PRÉCISÉ] | [F056 p.25, art. II-25] |

### Liste `ouvrage_touche`

Liste : OUVERTE (reconstituée ; le CPS ne distingue que conduite et branchement).

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| conduite | Conduites ; « CDT » ; « Cdt » | — | fuite sur conduite | 11 ; 12 ; 13 (AC, PVC) ; 6 ; 9 (extension PE) | [F122 F14] ; [F121 E16] ; [F123 B10] |
| branchement | Branchement ; « BRT » ; « Brt » ; « Bt » | — | fuite sur branchement, du robinet de prise en charge à la niche du compteur | 6 ; 7 ; 8 ; 9 | [F122 G14] ; [F121 E18] ; [F123 B10] |
| piece_speciale | Piece Spéciale | — | coude, té, cône… `[2017 : prix 17]` | hors bordereau 2026 | [F122 H14] ; [F088] |
| bouche_incendie | B.I | — | bouche d'incendie `[À CONFIRMER : abréviation]` | hors bordereau 2026 | [F122 I14] ; [F088] |
| vanne | Vanne | — | `[2017]` colonne du rapport hebdomadaire | hors bordereau 2026 | [F088] |
| branchement_clandestin | Br. Clandestin | — | `[2017]` ; « élément inconnu » au sens du CPS | [NON PRÉCISÉ] | [F088] ; [F056 p.25] |
| autre | Autre | — | `[2017]` | — | [F088] |

### Liste `materiau_conduite`

Liste : OUVERTE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| amiante_ciment | amiante ciment ; « AC » | — | conduite | 11 ; 12 ; 13 | [F032 p.1] ; [F087] |
| pvc | PVC | — | conduite ; distance entre capteurs réduite à 50 m | 11 ; 12 ; 13 | [F032 p.1] ; [F056 p.23] |
| polyethylene | polyéthylène ; « PE » ; « PEHD » | — | branchements et extensions ; distance entre capteurs réduite à 50 m | 6 ; 7 ; 8 ; 9 | [F032 p.1] ; [F056 p.23] |
| fonte_ductile | Fonte ductile | — | catalogue interne (« Fonte ductile dn400 ») | hors bordereau | [F001 feuille "LISTE"] |
| acier_galvanise | ACIER GALVANISE | — | catalogue interne (« CONDUITE DN 90 ACIER GALVANISE ») | hors bordereau | [F001 feuille "LISTE"] |
| ppr | PPR | — | catalogue interne (« PPR 25 ») | [NON PRÉCISÉ] | [F001 feuille "LISTE"] |

Attention : le code « AC » désigne l'amiante-ciment dans la colonne « Nature » de la canalisation et l'asphalte à chaud dans la colonne « Symbole » de réfection.

### Liste `diametre_nominal` (tous les diamètres cités)

Liste : OUVERTE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| pe_15 ; pe_20 ; pe_25 ; pe_32 | PEHD 15 ; 20 ; 19/25 ; 26/32 | — | polyéthylène, diamètre extérieur < 40 mm | 6 | [F001 feuille "LISTE"] ; [F032 p.1] |
| pe_40 ; pe_50 ; pe_63 ; pe_75 | PEHD 33/40 ; 42/50 ; 53/63 ; 75/75 | — | polyéthylène, diamètre extérieur ≥ 40 mm | 9 | [F001 feuille "LISTE"] ; [F032 p.1] |
| dn_60 ; dn_63 ; dn_75 ; dn_80 ; dn_90 ; dn_100 | 60 ; 63 ; 75 ; 80 ; 90 ; 100 | — | conduite, DN < 110 | 13 | [F001 feuille "LISTE"] ; [F087] |
| dn_110 ; dn_125 ; dn_140 ; dn_150 ; dn_160 ; dn_200 | 110 ; 125 ; 140 ; 150 ; 160 ; 200 | — | conduite, 110 ≤ DN ≤ 200 | 12 | [F001 feuille "LISTE"] ; [F016 p.1] |
| dn_225 ; dn_250 ; dn_300 ; dn_315 | 225 ; 250 ; 300 ; 315 | — | conduite, 225 ≤ DN ≤ 315 | 11 | [F001 feuille "LISTE"] |
| dn_400 ; dn_500 ; dn_600 ; dn_700 | 400 ; 500 ; 600 ; 700 | — | conduite, DN > 315 | hors bordereau | [F001 feuille "LISTE"] ; [F056 p.18-19] |

Calibres réellement prospectés en 2017 `[2017]` : AC 60, 80, 100, 150, 200 ; PE 32, 40, 50, 63, 80 ; PVC 63, 75, 90, 110 [F087 à F095].

### Liste `nature_revetement` (« Nature de dégradation ») et `type_refection`

Liste : OUVERTE (saisie libre dans les gabarits ; le bordereau n'énumère que cinq revêtements).

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| beton | Béton ; « Beton » ; symbole B | — | trottoir en béton | 4 | [F032 p.1] ; [F001 feuille "REFECTION" I14] |
| mosaique | Mosaique ; « Mozaig » ; symbole M | — | trottoir en mosaïque | 4 | [F032 p.1] ; [F001 feuille "REFECTION" J14] |
| granito_lave | granito lavé ; « Lavé » ; symbole L | — | trottoir en granito lavé | 4 | [F032 p.1] ; [F001 feuille "REFECTION" K14] |
| carreaux_ciment | carreaux ciment ; « Carreaux » ; « carrelage » ; symbole C | — | trottoir en carreaux ciment | 4 | [F032 p.1] ; [F001 feuille "REFECTION" L14] |
| enrobe_a_chaud | enrobé à chaud ; « Asphalt à chaud » ; « asphaltage » ; symbole AC | — | chaussée goudronnée, enrobé 7 cm | 5 | [F032 p.1] ; [F001 feuille "REFECTION" M14] |
| enrobe_resine_a_froid | enrobé-résine à froid | — | chaussée, si la réfection dépasse 1 mois ; même prix | 5 | [F056 p.23-24] |
| terrain_naturel | Terrain naturel ; symbole TN | — | pas de réfection payée (formule × 0) | aucun | [F001 feuille "REFECTION" N14] |
| pave | « pave » ; « Pavé » | — | rencontré en saisie ; en 2017 rangé sous le symbole L | [À CONFIRMER] | [F001 feuille "Fiche de réparation Zone "] ; [F065] |
| faience | Faience `[2017]` | — | en 2017 rangé sous le symbole C | [À CONFIRMER] | [F065] |
| marbre | Marbre `[2017]` | — | en 2017 rangé sous le symbole C ; cas de refus de l'abonné | [À CONFIRMER] | [F065] |
| enrobe_a_froid_2017 | Asphalt à froid ; symbole AF `[2017]` | — | prix 9.b de 2017 | sans équivalent 2026 | [F065 feuille "Fiche réfection" M14] |

### Liste `statut_fuite`

Liste : OUVERTE. Le CPS ne définit aucun statut ; les trois statuts du cadrage de l'application sont `[INTERNE]`, les états de 2017 étaient portés par des couleurs.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| detectee_non_reparee | Détectée, non réparée | — | cadrage de l'application ; 2017 : « Non réparée, non réfectionnée » (jaune) ; « Fiche des fuites détectées et a réparer » | — | CLAUDE.md du dépôt ; [F065 feuille "Fiche réfection" N7] ; [F084] |
| reparation_en_cours | Réparation en cours / reste à finir | — | cadrage de l'application ; 2017 : « Réparée non encore réfectionnée » (vert) | — | CLAUDE.md du dépôt ; [F065 feuille "Fiche réfection" N6] |
| achevee | Achevée | — | cadrage de l'application ; 2017 : « Fuite réparée et entièrement réfectionnée » (sans couleur) | — | CLAUDE.md du dépôt ; [F065 feuille "Fiche réfection" N8] |
| reparee_par_srm | Réparée par les agents de la RADEEO `[2017]` | — | fuite détectée par l'entreprise mais réparée par le maître d'ouvrage : aucune ligne payante de réparation | — | [F065 feuille "Fiche réfection" N4] |

### Liste `motif_sans_reparation`

Liste : OUVERTE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| a_detecter | A DETECTER | — | localisation à reprendre | — | [F001 feuille "LISTE" A1] |
| ras | RAS | — | rien à signaler | — | [F001 feuille "LISTE" A2] |
| assainissement | Assainissement | — | l'eau vient du réseau d'assainissement | 3 `[À CONFIRMER]` | [F001 feuille "LISTE" A3] |
| refus_abonne | refusé par l'abonné | — | l'abonné refuse l'intervention | — | [F001 feuille "LISTE" A4] |
| sondage_negatif | sondage negatif | — | fouille sans fuite | 3 `[À CONFIRMER]` | [F001 feuille "LISTE" A5] ; [F056 p.23] |

### Liste `origine_signalement`

Liste : `[NON PRÉCISÉ]`. Le CPS ne connaît que les fuites détectées par l'entreprise (balayage ou maintien) ; proposition : `balayage`, `maintien`, `fuite_visible_constatee`, `signalement_srm` `[À CONFIRMER]`. [F056 p.25, art. II-25]

### Liste `methode_detection`

Liste : OUVERTE (« à savoir… »).

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| acoustique | détection systématique de fuites par appareil acoustique | — | écoute au sol | 1 ; 2 | [F056 p.22, art. II-18] |
| correlation | localisation des fuites par corrélations | — | distance entre capteurs < 100 m (50 m en PVC et PE) | 1 ; 2 | [F056 p.22-23] |
| enregistreurs_de_bruit | mise en place de capteurs enregistreurs de bruit | — | pré-localisation | 1 ; 2 | [F056 p.22] |

### Liste `type_prestation` (familles de prix, proposition)

Liste : FERMÉE (13 prix du bordereau).

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| detection_balayage | Recherche et détection de fuites sur conduites, tous diamètres et toutes natures ( Balayage) | — | ml | 1 | [F032 p.1] |
| detection_maintien | Recherche et détection de fuites sur conduites pour le maintien des résultats | — | ml | 2 | [F032 p.1] |
| terrassement | Confection de tranchée… | — | m3 | 3 | [F032 p.1] |
| refection_trottoir | Réfection et revêtement des trottoirs… | — | m2 | 4 | [F032 p.1] |
| refection_chaussee | Réfection et revêtement de chaussée goudronnée… | — | m2 | 5 | [F032 p.1] |
| reparation_pe | réparation de fuites au niveau du tuyau polyéthylène | — | u ; DE < 40 ou DE ≥ 40 | 6 ; 9 | [F032 p.1] |
| changement_robinet_pec | changement de Robinet PEC | — | u | 7 | [F032 p.1] |
| changement_collier_pec | changement de collier PEC | — | u | 8 | [F032 p.1] |
| mise_a_niveau_bouche_a_cle | Mise à niveau de bouche à clé carrée ou ronde | — | u | 10 | [F032 p.1] |
| reparation_conduite | réparation de fuites sur conduites (amiante ciment et PVC) | — | u ; par tranche de DN | 11 ; 12 ; 13 | [F032 p.1] |

### Liste `unite`

Liste : FERMÉE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| ml | M | — | mètre linéaire | 1 ; 2 | [F032 p.1] |
| m3 | M3 | — | mètre cube | 3 | [F032 p.1] |
| m2 | M2 | — | mètre carré | 4 ; 5 | [F032 p.1] |
| u | U | — | unité | 6 à 13 | [F032 p.1] |

### Liste `fonction_signataire`

Liste : OUVERTE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| srm_directeur_general | Directeur Général | — | signe le marché ; liquide les sommes | — | [F056 p.2] |
| srm_directeur_exploitation_eau_potable | Directeur Exploitation Eau Potable | — | représente le maître d'ouvrage ; signe l'OS de commencement | — | [F036 p.1] |
| srm_chef_dept_mesures_rendement | Chef de Département Mesures et Amélioration du Rendement | — | service de suivi | — | [F036 p.1] |
| srm_chef_dept_achats_marches | Chef de Département Achats et Marchés | — | notification, résultat | — | [F035 p.1] |
| srm_agent_suivi | agent chargé du suivi de l'exécution du marché | — | dresse les décomptes | — | [F056 p.4] |
| srm_representant_terrain | représentant de la SRM-ORI | — | présent à l'ouverture de la tranchée ; valide les fuites | — | [F056 p.23] |
| srm_commission_reception | commission de réception | — | signe les PV de réception | — | [F056 p.9] |
| stepag_gerant | Gérant de la société | — | signe l'offre, les factures | — | [F040 p.1] |
| stepag_directeur_chantier | Directeur de chantier | — | représente l'entrepreneur sur place | — | [F056 p.16] |
| stepag_chercheur_de_fuite | CHERCHEUR DE FUITE `[2017]` | — | agent de détection | — | [F084] |
| visa_stepag | « STEPAG » ; « Sté STEPAG » | — | case de visa des gabarits | — | [F121 A23] ; [F001 feuille "attachement recap" C28] |
| visa_srm | « S.R.M » ; « SRM ORIENTAL » ; « SRM.ORI » | — | case de visa des gabarits | — | [F121 G23] ; [F122 G20] ; [F001 feuille "attachement recap" A28] |

### Liste `famille_piece` (proposition, catalogue interne)

Liste : OUVERTE. Valeurs : tuyau polyéthylène ; manchon polyéthylène ; raccord, coude ou bouchon polyéthylène ; collier pour polyéthylène ; robinet de prise en charge ; collier de prise en charge ; bouche à clé (tabernacle, tube PVC 90, bouche à clé carrée) ; jonction ou tuyau de conduite AC/PVC ; côté compteur ; consommable ou matériau ; pièce spéciale, robinetterie ou ouvrage ; motif (pas une pièce). Détail pièce par pièce en section 6.2. [F001 feuille "LISTE"]

### Liste `equipement_detection`

Liste : OUVERTE.

| Code proposé (snake_case) | Libellé exact FR | Libellé AR | Définition ou critère | Prix associé | Source |
|---|---|---|---|---|---|
| aquaphone_a50 | Aquaphone A 50 | — | détecteur acoustique cité par le gabarit mensuel STEPAG | — | [F122 A12] |
| aquaphone_mikron_junior_3 | Aquaphone Mikron Junior 3 | — | idem | — | [F122 A12] |
| eureka | Eureka | — | corrélateur `[À CONFIRMER]` | — | [F122 A12] |
| aquaphon_a100 | Aquaphon A100 ; Sewerin A100 `[2017]` | — | détecteur acoustique utilisé en 2017 | — | [F087] ; [F088] |

### Listes `tournee`, `quartier`, `classe_profondeur`, `nature_terrain`, `classe_debit`

- `tournee` : aucune liste ; c'est une référence au format `NNN-NNN-NNN` (section 10 bis). [F001 ; F119]
- `quartier` : `[NON PRÉCISÉ]` ; les documents ne connaissent que zone et secteur.
- `classe_profondeur` : `[NON PRÉCISÉ]` ; la profondeur est une mesure libre en mètres.
- `nature_terrain` : aucune classe ; le prix 3 vaut pour un « terrain de toute nature ». [F032 p.1]
- `classe_debit` : `[NON PRÉCISÉ]`.

## 7. Attachement modèle 2017 et pièces de paiement

**Résumé.** Tout ce qui suit est `[2017]` : il s'agit du marché n° 59/E/2016 de la RADEEO (régie d'Oujda, devenue SRM), titulaire AFFAIR OF THE WATER (AFW), STEPAG sous-traitant. Même logique que le marché 2026 (balayage, maintien, réparations à l'unité) mais **autres prix, autres unités, autres zones, autres plafonds**. Ces classeurs donnent la forme de l'attachement, du décompte, de l'état de suivi et de la facture, et la chaîne de calcul « fiche de réparation → attachement détaillé → récapitulatif → décompte ». Le classeur que STEPAG prépare pour 2026 ([F001], section 8) en est la reprise simplifiée.

**Principaux `[NON PRÉCISÉ]`.** Règle officielle d'affectation des pièces posées aux numéros de prix (faite à la main en 2017) ; date de rattachement d'une fuite au mois ; arrondi par ligne ou sur le total ; décompte en quantités du mois ou en cumul (les versions de 2017 divergent) ; sens des suffixes « R », « bis » et « RP ».

**Avertissement.** Aucun prix, délai, plafond ou numéro de cette section ne s'applique au marché 4500004453. Les numéros de prix 2017 (1 à 17, avec 9.a, 13.a…) ne correspondent pas aux numéros 2026 (1 à 13) : passer uniquement par la table de passage 7.9.

### 7.1 Fichiers du modèle 2017

| ID | Fichier | Rôle | Feuilles | Source des notes |
|---|---|---|---|---|
| F077 | 1 marché59.doc | marché valant CPS n° 59/E/2016 (art. 1 à 51) | — | notes F077 |
| F079 | 3. derniére page.doc | dernière page du marché : montant et cinq cadres de visa | — | notes F079 |
| F066 ; F078 | BP 59 E 2016 RAADEEO.xls ; 2-BP.xls | bordereau des prix 2017 (24 prix), identiques | Bdrx de prix | notes F066 |
| F065 | Attachement réparation de fuites + Mouvements matériel.xlsx | classeur de travail du décompte n° 01 (brouillon) | Détail BS ; Fiche de réparation ; Fiche réfection ; Linéaire prospecté ; attachement detaillé ; decompte ; attach recap ; etat de suivi | notes F065 |
| F084 | Fiche de réparation de fuites + Mouvements matériel + attachement.xlsx | version du 2017-03-27 (453 fuites) ; feuille « detectees et non reparees » en plus | 8 | notes F084 |
| F085 | Fiche de réparation de fuites + Mouvements matériel.xlsx | version antérieure | 7 | notes F085 |
| F068 ; F069 ; F076 | Attachement + Décompte N°1.xlsx et variantes | attachement n° 1 et décompte provisoire n° 1 par zone (SY4000, RJ5000, JH600) | 15 ; 15 ; 9 | notes F068 |
| F072 ; F075 | facture RADEEO.xls (contenu identique) | facture 18/2017/AT 1 du 2017-04-11 | FACTURE N° 26 | notes F072 |
| F071 | Etat de suivi Recap 59-E-16 (1).xls | état de suivi récapitulatif des décomptes (document de la régie) | 01 | notes F071 |
| F073 | FICHE SUIVI DELAI 59-E-16.xls | fiche de suivi du délai d'exécution (document de la régie) | 01 | notes F073 |
| F080 | Détail quantitatif Réparation + réfection.xls | prototype de janvier 2017 ; modèle papier de fiche de fuite | réparation ; Réfection ; Fiche de fuite | notes F080 |
| F087 à F095 | Rapports journaliers (modèle vierge + 7 secteurs, 41 journées) | rapports journaliers de détection | une feuille par journée | notes F087 |
| F088 | Rapports hebdomadaires détéction de fuites.xlsx | rapports hebdomadaires (5 semaines) | Semaine 1 à 5 | notes F088 |
| F067 ; F074 ; F083 ; F081 | contrat STEPAG AFW ; facture STEPAG à AFW ; facture d'avance ; en-tête | sous-traitance AFW / STEPAG | — | notes F067 |
| F070 | Bordereau MARCHE RADEEO (1).doc | bordereau d'envoi de facture du 2017-12-15 | — | notes F070 |
| F082 ; F086 | essai AFW.xlsx ; Mesure/Riadi.xlsx | PV de carottage d'enrobé à froid ; mesure nocturne de débit du secteur Riadi (2017-02-26) | — | notes F082 ; F086 |

### 7.2 Bordereau des prix 2017 (verbatim, marché 59/E/2016)

Total 2017 : 1 719 636,50 DH HT ; TVA 20 % 343 927,30 ; TTC 2 063 563,80. Les lignes 9, 10, 13 et 16 sont des lignes chapeau sans prix.

| N° prix 2017 | Désignation | Unité telle qu'écrite | Quantité marché | PU HT | Montant HT | Source |
|---|---|---|---|---|---|---|
| 1 | Recherche et detection de fuites sur conduites, tous diamètres et toutes natures dans les divers secteurs de la ville ( Balayage) | Km | 580 | 994 | 576520 | [F066 feuille "Bdrx de prix"] |
| 2 | Recherche et detection de fuites sur conduites, dans les divers secteurs de la ville pour le maintien des résultats | Km | 580 | 875 | 507500 | [F066 feuille "Bdrx de prix"] |
| 3 | Mesure des débits de nuits, par installation d'un ou des débitmètres enregistreurs portables(conformément à l'article 17 Chap II) | U | 6 | 2500 | 15000 | [F066 feuille "Bdrx de prix"] |
| 4 | Confection de tranchée en terrain de toute nature y compris remblaiement de la tranchée, compactage, transport des terres en excédent et toutes sujétions, pour conduites et branchements y compris réglage du fond de fouille, étaiement, blindage et épuisement en cas de terrassement pour réparation de fuite ou sondage | m3 | 1200 | 29.5 | 35400 | [F066 feuille "Bdrx de prix"] |
| 5 | Réfection et revêtement de trottoir en béton conforme à l'original épaisseur 0,10 m y compris blocage en pierre d'une épaisseur minimale de 15 cm et toutes sujétions | m² | 200 | 43 | 8600 | [F066 feuille "Bdrx de prix"] |
| 6 | Réfection et revêtement de trottoir en mosaïque conforme à l'original y compris béton d'accrochage, blocage en pierre d'une épaisseur minimale de 15 cm et toutes sujétions | m² | 200 | 57.2 | 11440 | [F066 feuille "Bdrx de prix"] |
| 7 | Réfection et revêtement de trottoir en granito lavé conforme à l'original y compris béton d'accrochage, blocage en pierre d'une épaisseur minimale de 15 cm et toutes sujétions | m² | 200 | 57.2 | 11440 | [F066 feuille "Bdrx de prix"] |
| 8 | Réfection et revêtement de trottoir en carreaux ciment conforme à à l'original y compris béton d'accrochage, blocage en pierre d'une épaisseur minimale de 15 cm et toutes sujétions | m² | 220 | 68.2 | 15004 | [F066 feuille "Bdrx de prix"] |
| 9 | Réfection et revêtement de chaussée goudronnée en enrobé d'épaisseur de 10 cm, y compris couche en tout venant GNA de 0,50 m | — | — | — | — | [F066 feuille "Bdrx de prix"] |
| 9.a | Réfection et revêtement de chaussée goudronnée en enrobé d'épaisseur de 10 cm, y compris couche en tout venant GNA de 0,50 m — - à chaud | m² | 50 | 200 | 10000 | [F066 feuille "Bdrx de prix"] |
| 9.b | Réfection et revêtement de chaussée goudronnée en enrobé d'épaisseur de 10 cm, y compris couche en tout venant GNA de 0,50 m — - à froid | m2 | 400 | 105.2 | 42080 | [F066 feuille "Bdrx de prix"] |
| 10 | Fourniture, transport et pose de buses d'égout en béton classe 60B ou en PVC série 1 vibré pour réfection branchements d'assainissement y compris confection de joint en mortier ordinaire dosé à 250 kg/m3, evacuation des eaux et toutes sujétions | — | — | — | — | [F066 feuille "Bdrx de prix"] |
| 10.a | Fourniture, transport et pose de buses d'égout en béton classe 60B ou en PVC série 1 vibré pour réfection branchements d'assainissement y compris confection de joint en mortier ordinaire dosé à 250 kg/m3, evacuation des eaux et toutes sujétions — - Diam 200 mm à 500 mm 60 B en béton vibré | ml | 10 | 700 | 7000 | [F066 feuille "Bdrx de prix"] |
| 10.b | Fourniture, transport et pose de buses d'égout en béton classe 60B ou en PVC série 1 vibré pour réfection branchements d'assainissement y compris confection de joint en mortier ordinaire dosé à 250 kg/m3, evacuation des eaux et toutes sujétions — - Diam 200 mm 400 en PVC Série 1 | ml | 5 | 900 | 4500 | [F066 feuille "Bdrx de prix"] |
| 11 | Transport et pose de bouche à clé carrée ou ronde y compris tube en PVC, tabernacle en polyester et socle de béton de : Dimension = Longueur = Largeur =20 cm Profondeur = 10 cm | U | 25 | 50 | 1250 | [F066 feuille "Bdrx de prix"] |
| 12 | Fourniture et mise en œuvre de tout venant aux différents endroits de réparation de fuites | m3 | 10 | 60 | 600 | [F066 feuille "Bdrx de prix"] |
| 13 | Transport et pose pour réparation de fuites sur la partie enterrée de branchement de diamètre extérieur allant de 25 ou 32 mm(longueur max 2ml) | — | — | — | — | [F066 feuille "Bdrx de prix"] |
| 13.a | Transport et pose pour réparation de fuites sur la partie enterrée de branchement de diamètre extérieur allant de 25 ou 32 mm(longueur max 2ml) — T.P pour changement du polyéthylène de branchement défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose de grillage avertisseur de couleur bleue de largeur (50 cm), pose de raccords et ou manchon | U | 800 | 215.45 | 172360 | [F066 feuille "Bdrx de prix"] |
| 13.b | Transport et pose pour réparation de fuites sur la partie enterrée de branchement de diamètre extérieur allant de 25 ou 32 mm(longueur max 2ml) — T.P pour changement de collier pour polyéthylène et ou raccord défectueux de différents diamètres | U | 400 | 216.45 | 86580 | [F066 feuille "Bdrx de prix"] |
| 13.c | Transport et pose pour réparation de fuites sur la partie enterrée de branchement de diamètre extérieur allant de 25 ou 32 mm(longueur max 2ml) — T.P pour changement de Robinet PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l'entreprise) | U | 250 | 255 | 63750 | [F066 feuille "Bdrx de prix"] |
| 13.d | Transport et pose pour réparation de fuites sur la partie enterrée de branchement de diamètre extérieur allant de 25 ou 32 mm(longueur max 2ml) — T.P pour changement de collier PEC de différents diamètres pour branchement ou conduites en polyéthylène y compris pose du tabernacle et du tube en PVC et confection d'un socle en béton (0,40x0,40x0,20) pour la bouche à clé (béton fourni par l'entreprise) | U | 150 | 255 | 38250 | [F066 feuille "Bdrx de prix"] |
| 14 | Transport et pose pour réparation de fuites au niveau du tuyau polyéthylène de diamètre extérieur supérieur ou égal à 40 mm (longueur polyéthylène inférieur ou égale à 2m) y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue de largeur (50 cm), cisaillement, montage par mise en place de raccords et ou manchon ou bouchon | U | 120 | 255 | 30600 | [F066 feuille "Bdrx de prix"] |
| 15 | Mise à niveau de bouche à clé carrée ou ronde y compris pose de tube allonge en PVC, tabernacle et socle en béton de 0,40 m x 0,40 m x 0,20 | U | 25 | 110.5 | 2762.5 | [F066 feuille "Bdrx de prix"] |
| 16 | Réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : | — | — | — | — | [F066 feuille "Bdrx de prix"] |
| 16.a | Réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : — Diam compris entre 315 mm et 225 mm | U | 4 | 3000 | 12000 | [F066 feuille "Bdrx de prix"] |
| 16.b | Réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : — Diam compris entre 200 mm et 110 mm | U | 20 | 1500 | 30000 | [F066 feuille "Bdrx de prix"] |
| 16.c | Réparation de fuites sur conduites (amiante ciment et PVC) par joint gibault, joint dissymetrique ou autres matériels de jonction y compris transport ,coupe et pose pour remplacement total ou partiel d'un élément de conduite défectueux y compris la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement de conduite, préparation des bouts de montage ainsi que le démontage de l'élément épuisement du fond de fouille et toutes sujestions : — Diam inférieur à 110 mm | U | 40 | 800 | 32000 | [F066 feuille "Bdrx de prix"] |
| 17 | Réparation de fuites sur Pièces spéciales (coude- té- cone de réduction-obturateur...) par remplacement de la pièce déféctueuse, y compris transport ,coupe et pose,la fourniture du sable et sa mise en œuvre pour lit de pose d'une épaisseur de 0,10 m, la fourniture et la pose grillage avertisseur de couleur bleue et de largeur (50 cm), cisaillement épuisement du fond de fouille et toutes sujestions : | U | 5 | 1000 | 5000 | [F066 feuille "Bdrx de prix"] |

- **R-ATT-001** [2017] Le bordereau 2017 comptait 24 prix chiffrés : détection au kilomètre (prix 1 à 994 DH/km, prix 2 à 875 DH/km, 580 km chacun), mesure de débit de nuit à l'unité (prix 3), terrassement (4), réfections par nature de revêtement (5 à 9.b), buses, bouche à clé, tout venant (10 à 12), réparations de branchements (13.a à 13.d, 14), bouche à clé (15), conduites (16.a à 16.c), pièces spéciales (17). [F066 feuille "Bdrx de prix"]
- **R-ATT-002** [2017] En 2017 les prix 13 à 17 étaient des prix de « transport et pose » : les pièces étaient fournies par la régie sur bons de sortie magasin ; en 2026 la fourniture est à la charge de l'entreprise (R-CPS-205). [F077 art. 45 N.B. ; F065 feuille "Détail BS"]

### 7.3 Chaîne de calcul 2017 (fiche → attachement détaillé → récapitulatif → décompte)

| Étape | Feuille | Nature | Règle | Source |
|---|---|---|---|---|
| 1 | Fiche de réparation | saisie pure | une fuite = une ligne d'identité (secteur, n° de fuite, tournée, date de réparation, terrassement, nature de dégradation) + une ligne par pièce posée (pièce, quantité) ; observations = motif de non-réparation | [F065 feuille "Fiche de réparation"] |
| 2 | attachement detaillé | recopie par formules + une colonne par prix | terrassement `=E8*F8*G8` (m3) ; réfection `=IF($J8="M",E8*F8,"-")` selon un symbole saisi à la main ; prix de réparation : un « 1 » saisi à la main par fuite dans la colonne du prix ; ligne « Total » `=SUM(...)` par colonne | [F065 feuille "attachement detaillé" H8:AO2427] |
| 3 | Fiche réfection | une ligne par fuite | surface `=IF($G16="B",D16*E16,"-")` : longueur × largeur placée dans la colonne du code matériau (B, M, L, C, AC, AF) ; total par revêtement | [F065 feuille "Fiche réfection" H16:M444] |
| 4 | attach recap (attachement récapitulatif) | une ligne par prix | « Cumulé » = total de la colonne du prix ; « Quantité du mois » `=H16-F16` (cumulé − quantités précédentes) ; prix 1 et 3 saisis à la main | [F065 feuille "attach recap" F:H] |
| 5 | decompte | une ligne par prix | quantité (du mois dans F065, cumulée dans F068 et F084) × PU, sans arrondi ; total HT ; TVA ; TTC ; retenue ; net | [F065 feuille "decompte" ; F068 feuille "decompte"] |
| 6 | etat de suivi | une ligne par prix | antérieur, partiel, cumul, disponible, taux de réalisation, alertes de quantité | [F065 feuille "etat de suivi"] |

- **R-ATT-003** [2017] La fiche de réparation est la seule saisie ; tout le reste en découle par formules, sauf deux gestes manuels : le symbole de revêtement et le « 1 » par prix de réparation. [F065 feuille "attachement detaillé" J, Y:AO]
- **R-ATT-004** [2017] Volume de terrassement d'une fuite = Long × Larg × Prof, sans arrondi (`=E8*F8*G8`) ; total = somme. [F065 feuille "attachement detaillé" H8]
- **R-ATT-005** [2017] Surface de réfection = Long × Larg de la fouille, sans débord ni arrondi, affectée au prix du revêtement ; la profondeur n'intervient pas. [F065 feuille "Fiche réfection" H16]
- **R-ATT-006** [2017] Une réfection n'est comptée que lorsque le code du revêtement (B, M, L, C, AC, AF) remplace le nom en toutes lettres, c'est-à-dire une fois la réfection faite ; tant qu'elle n'est pas faite, la ligne reste colorée et la surface n'est pas payée. [F065 feuille "Fiche réfection" G, N4:N8]
- **R-ATT-007** [2017] Le statut d'une fuite était porté par la couleur de la ligne : « Réparée par les agents de la RADEEO » ; « Réfection Béton » ; « Réparée non encore réfectionnée » ; « Non réparée, non réfectionnée » ; « Fuite réparée et entièrement réfectionnée » (sans couleur). À transformer en champ de statut. [F065 feuille "Fiche réfection" N4:N8]
- **R-ATT-008** [2017] Règle observée (non écrite) d'affectation des pièces aux prix 2017 : PEHD de diamètre ≤ 32 → 13.a ; robinet PEC → 13.c ; collier PEC → 13.d ; collier Astor, raccord ou bouchon seul → 13.b ; PEHD de diamètre ≥ 40 → 14 ; tabernacle + tube PVC + bouche à clé sans robinet PEC → 15 (ou 11 selon la version) ; joint Gibault ou dissymétrique, tuyau PVC → 16.c. Conformité mesurée : 85 % des fuites de F084. Plusieurs prix peuvent se cumuler sur une fuite, jamais plus de 1 par prix. [F065 ; F084 feuille "attachement detaillé (2)"]
- **R-ATT-009** [2017] L'attachement récapitulatif porte des cumuls depuis le début du marché ; la quantité du mois s'obtient par différence avec la colonne « Quantités précédentes », à reporter d'un attachement au suivant. [F065 feuille "attach recap" G16]
- **R-ATT-010** [2017] L'attachement ne montre pas les prix : la colonne « Prix Unitaire H.T » est masquée à l'impression et il n'y a pas de ligne de total (quantités seulement). [F065 feuille "attach recap" E ; F068 feuille "attachement recap"]
- **R-ATT-011** [2017] En 2017 l'attachement existait en version « partielle » par zone (SY4000, RJ5000, JH600), chacune rattachée à un ordre de service partiel, plus un récapitulatif global ; le récapitulatif lisait les feuilles globales, non la somme des partiels. [F068 feuilles "attachement partiel SY4000", "attachement recap" ; F069]

### 7.4 Attachement récapitulatif 2017 : structure et données

En-tête : « R.A.D.E.E.O » ; « DIVISION EXPLOITATION » ; « SERVICE AMELIORATION RENDEMENT » ; « Travaux exécutés au : » ; « Marché N° 59/E/2016 » ; « Lieu des travaux : Secteur ……. » ; « N° de travail : » ; « Nature des travaux : » ; « O.S N° : » ; « Projet N° : » ; « Entreprise : » ; titre « ATTACHEMENT RECAPTITULATIF ». Signatures : « Pour la RADEEO » ; « Pour l'Entreprise ». [F065 feuille "attach recap" ; F068 feuille "attachement recap" A140:F141]

| N° | Colonne (libellé exact) | Type | Unité | Règle | Source |
|---|---|---|---|---|---|
| 1 | « N° Des Prix » | texte | — | numéro du bordereau | [F065 feuille "attach recap" A13] |
| 2 | « Designation des prestations » | texte | — | sur 2 à 8 lignes ; la dernière porte « L'Unité = … » | [F065 feuille "attach recap" B13] |
| 3 | « Unité » | texte | — | — | [F065 feuille "attach recap" C13] |
| 4 | « Quantié Marché » | décimal | selon prix | saisie (masquée dans les partiels) | [F065 feuille "attach recap" D13] |
| 5 | « Prix Unitaire H.T » | décimal | DH | saisie ; colonne masquée | [F065 feuille "attach recap" E13] |
| 6 | « Quantités précédentes » | décimal | selon prix | cumul de l'attachement précédent | [F065 feuille "attach recap" F13] |
| 7 | « Quantité du mois » | décimal | selon prix | `=H16-F16` | [F065 feuille "attach recap" G13] |
| 8 | « Cumulé » | décimal | selon prix | total de la colonne du prix | [F065 feuille "attach recap" H13] |
| 9 | « % » | décimal | % | cumulé ÷ quantité marché (F068, colonne masquée) | [F068 feuille "attachement recap" I] |

Lignes de l'attachement récapitulatif du décompte n° 01 (extrait complet, version brouillon F065) :

| N° prix 2017 | Unité | Quantité marché | Quantité antérieure | Quantité du mois | Quantité cumulée | PU HT | Montant HT (non arrondi) |
|---|---|---|---|---|---|---|---|
| 1 | Km | 580 | 0 | 580 | 580 | 994 | 576520 |
| 2 | Km | 580 | 0 | 0 | 0 | 875 | 0 |
| 3 | U | 6 | 0 | 3 | 3 | 2500 | 7500 |
| 4 | m3 | 1200 | 0 | 267.4928 | 267.4928 | 29.5 | 7891.0376 |
| 5 | m² | 200 | 0 | 24.82 | 24.82 | 43 | 1067.26 |
| 6 | m² | 200 | 0 | 88.66 | 88.66 | 57.2 | 5071.352 |
| 7 | m² | 200 | 0 | 45.07 | 45.07 | 57.2 | 2578.004 |
| 8 | m² | 220 | 0 | 61.17 | 61.17 | 68.2 | 4171.794 |
| 9.a | m² | 50 | 0 | 0 | 0 | 200 | 0 |
| 9.b | m2 | 400 | 0 | 87.66 | 87.66 | 105.2 | 9221.832 |
| 10.a | ml | 10 | 0 | 0 | 0 | 700 | 0 |
| 10.b | ml | 5 | 0 | 0 | 0 | 900 | 0 |
| 11 | U | 25 | 0 | 0 | 0 | 50 | 0 |
| 12 | m3 | 10 | 0 | 0 | 0 | 60 | 0 |
| 13.a | U | 800 | 0 | 290 | 290 | 215.45 | 62480.5 |
| 13.b | U | 400 | 0 | 77 | 77 | 216.45 | 16666.65 |
| 13.c | U | 250 | 0 | 132 | 132 | 255 | 33660 |
| 13.d | U | 150 | 0 | 4 | 4 | 255 | 1020 |
| 14 | U | 120 | 0 | 29 | 29 | 255 | 7395 |
| 15 | U | 25 | 0 | 6 | 6 | 110.5 | 663 |
| 16.a | U | 4 | 0 | 0 | 0 | 3000 | 0 |
| 16.b | U | 20 | 0 | 0 | 0 | 1500 | 0 |
| 16.c | U | 40 | 0 | 5 | 5 | 800 | 4000 |
| 17 | U | 5 | 0 | 0 | 0 | 1000 | 0 |
| TOTAL H.T. |  | — | 0 | 0 | 0 |  | 739906.4296 |
| T.V.A. 20 % |  | — | 0 | 0 | 0 |  | 147981.29 |
| TOTAL T.T.C |  | — | 0 | 0 | 0 |  | 887887.72 |

### 7.5 Décompte provisoire 2017 : structure et formules

En-tête : « ROYAUME DU MAROC » ; « MINISTERE DE L'INTERIEUR » ; « R.A.D.E.E.O - OUJDA » ; date ; « Données Entreprise » (RC, CNSS, compte bancaire, patente, IF : `[valeurs non recopiées]`) ; « MARCHE N° 59/E/2016 » ; objet ; société ; « Décompte provisoire n°1 » ; « Des travaux éxécutés et des dépenses éffectuées à la date du 27/03/2017 ». [F068 feuille "decompte"]

| N° | Colonne ou ligne (libellé exact) | Formule (verbatim) | Explication | Source |
|---|---|---|---|---|
| 1 | « N° DES PRIX » ; désignation ; « UNITE » | — | reprise du bordereau | [F068 feuille "decompte" A16:C18] |
| 2 | « QUANTITE » | `=+'attachement recap'!H15` (F068, F084) ; `='attach recap'!G16` (F065) | quantité cumulée (F068, F084) ou quantité du mois (F065) | [F068 feuille "decompte" D21] ; [F065 feuille "decompte" D20] |
| 3 | « P. UNITAIRE DHS/H.T. » | saisie | prix du bordereau | [F068 feuille "decompte" E] |
| 4 | « PRIX TOTAL DHS/H.T. » | `=D21*E21` | montant de ligne, sans arrondi | [F068 feuille "decompte" F21] |
| 5 | « TOTAL H.T. » | `=SUM(F19:F144)` | somme non arrondie | [F068 feuille "decompte" F145] |
| 6 | « T.V.A. 20 % » | `=ROUND(+F145*0.2,2)` | TVA arrondie à 2 décimales | [F068 feuille "decompte" F146] |
| 7 | « TOTAL T.T.C » | `=ROUND(+F145+F146,2)` | TTC arrondi à 2 décimales | [F068 feuille "decompte" F147] |
| 8 | RECAPITULATION « TRAVAUX NON TERMINES » : « Dépenses faites » | `=F147` | TTC des travaux | [F068 feuille "decompte" C153] |
| 9 | « Retenue de garantie » | `=+C153*0.1` | 10 % du TTC, non arrondie, sans plafond dans le classeur | [F068 feuille "decompte" E153] |
| 10 | « Total » | `=C153-E153` | TTC − retenue | [F068 feuille "decompte" F153] |
| 11 | « APPROVISIONNEMENTS » ; « REVISION DE PRIX » | saisie | lignes prévues, vides ; la formule du total les soustrait `[À CONFIRMER]` | [F068 feuille "decompte" F154:F155] |
| 12 | « TOTAL » | `=F153-F154-F155` | — | [F068 feuille "decompte" F156] |
| 13 | « A déduire le Montant des dépenses imputés sur les exercices antérieures » | saisie | — | [F068 feuille "decompte" F157] |
| 14 | « Reste à payer sur l'exercice en cours » | `=F156-F157` | — | [F068 feuille "decompte" F158] |
| 15 | « A déduire le Montant des acomptes imputés sur l'exercice en cours » | saisie | acomptes des décomptes précédents | [F068 feuille "decompte" F159] |
| 16 | « A déduire montant Pénalité de retard » | saisie | — | [F068 feuille "decompte" F160] |
| 17 | « A déduire montant Pénalité sur balayage » | saisie | pénalité de résultat | [F068 feuille "decompte" F161] |
| 18 | « A déduire montant réfactions » | saisie | — | [F068 feuille "decompte" F162] |
| 19 | « Montant de l'acompte à payer » | `=F156-F157-F159-F160-F162-F161` | net à payer | [F068 feuille "decompte" F163] |
| 20 | « Arrêté par nous ordonnateur à la somme de : … Dirhams … Centimes TTC » | saisie | montant en lettres | [F068 feuille "decompte" A166] |

Visas du décompte 2017 (tous côté régie, aucun pour l'entreprise) : « Dréssé par : Bureau Détection de fuite et sectorisation » ; « Vérifié par : Chef de Service Amélioration du Rendement » ; « Chef Division Exploitation » ; « Le Directeur Général ». [F068 feuille "decompte" A168:C173]

- **R-ATT-012** [2017] Ordre des opérations du décompte 2017 : Σ (quantité × PU) non arrondie → total HT ; TVA = arrondi à 2 décimales de HT × 0,2 ; TTC = arrondi à 2 décimales de HT + TVA ; retenue de garantie = 10 % du TTC, non arrondie ; total = TTC − retenue ; déductions (exercices antérieurs, acomptes, pénalité de retard, pénalité sur balayage, réfactions) ; acompte à payer. [F068 feuille "decompte" F145:F163]
- **R-ATT-013** [2017] Les montants de ligne ne sont pas arrondis ; l'état de suivi de la régie, lui, arrondit chaque ligne à 2 décimales, d'où un écart d'un centime (HT 746 317,93 contre 746 317,8966 arrondi à 746 317,90). [F071 ; F068 feuille "ETAT DE SUIVI" L139]
- **R-ATT-014** [2017] Les versions divergent sur la quantité portée au décompte : quantité du mois (F065) ou cumul (F068, F084) ; un décompte provisoire en cumul, dont on déduit les acomptes antérieurs, est la forme retenue par la version datée. [F065 feuille "decompte" D20 ; F068 feuille "decompte" D21]
- **R-ATT-015** [2017] Pénalité de résultat appliquée en 2017 (calcul annexe au décompte) : zone Route Jerada, débit après intervention 86,4 m3/h pour un objectif de 80 → (86,4 − 80) ÷ 80 = 8 % × 250 km × 994 DH = 19 880 DH HT (23 856 TTC). La pénalité est donc calculée **par zone**, proportionnellement (sans arrondi au point), sur le montant de balayage de la zone ; les zones ayant atteint l'objectif portent « Pas de pénalité ». [F068 feuille "decompte" H20:L24]
- **R-ATT-016** [2017] Montant en lettres : contrôle indispensable (F068 affiche un montant en lettres de 595 742,74 pour 806 023,33 calculés ; F084 garde le texte d'un autre modèle). [F068 feuille "decompte" A166 ; F084]

### 7.6 État de suivi, fiche de suivi du délai, facture (2017)

**État de suivi du marché** (joint au décompte ; visas « Bureau Détection de fuite et sectorisation », « Chef de Service Amélioration du Rendement », « Chef Division Exploitation ») :

| N° | Colonne (libellé exact) | Formule (verbatim) | Explication | Source |
|---|---|---|---|---|
| 1 | « N° DES PRIX » ; « DESIGNATION DES PRESTATIONS » ; « UNITE » | — | — | [F065 feuille "etat de suivi" A11:C11] |
| 2 | « QUANTITE » ; « P. UNITAIRE DHS/H.T. » ; « PRIX TOTAL DHS/H.T. » | `=D14*E14` | données du marché | [F065 feuille "etat de suivi" D14:F14] |
| 3 | « ANTERIEURE » : « QTTE » ; « P.PART DH/HT » | `='attach recap'!F16` ; `=E14*G14` | cumul antérieur | [F065 feuille "etat de suivi" G14:H14] |
| 4 | « REALISATION PARTIELLE » : « QTTE » ; « P.PART DH/HT » | `=K14-G14` ; `=I14*E14` | période | [F065 feuille "etat de suivi" I14:J14] |
| 5 | « CUMUL (2) » : « QTTE » ; « P.PART DH/HT » | `='attach recap'!H16` ; `=K14*E14` | cumul à ce jour | [F065 feuille "etat de suivi" K14:L14] |
| 6 | « DISPONIBLE » : « QTTE » ; « P.PART DH/HT » | `=D14-K14` ; `=M14*E14` | reste par rapport au marché | [F065 feuille "etat de suivi" M14:N14] |
| 7 | « TAUX REAL. EN % » | `=L14/F14*100` | taux de réalisation | [F065 feuille "etat de suivi" O14] |
| 8 | « DIFFERENCE DE QTTE/ARTICLE » « <25% (*) » | `=IF(+((D14-K14)/D14)*100>25,+((D14-K14)/D14),0)` | signale une sous-consommation de plus de 25 % de la quantité du marché | [F065 feuille "etat de suivi" P14] |
| 9 | « DIFFERENCE DE QTTE/ARTICLE » « >30% (**) » | `=IF(+((K14-D14)/D14)*100>30,+((K14-D14)/D14),0)` | signale un dépassement de plus de 30 % de la quantité du marché | [F065 feuille "etat de suivi" Q14] |
| 10 | « OBS » | saisie | — | [F065 feuille "etat de suivi" R11] |
| 11 | totaux H.T., T.V.A. 20 %, T.T.C | `=SUM(F14:F137)` ; `=ROUND(+F138*0.2,2)` ; `=ROUND(+F138+F139,2)` | par bloc (marché, antérieur, partiel, cumul, disponible) | [F065 feuille "etat de suivi" 138:140] |

- **R-ATT-017** [2017] Seuils d'alerte de l'état de suivi : écart de quantité par article inférieur de plus de 25 % ou supérieur de plus de 30 % à la quantité du marché ; ils correspondent vraisemblablement aux limites de variation des quantités de l'ancien CCAG-T `[À CONFIRMER : valeurs applicables en 2026, CCAG-T de 2016 art. 59]`. [F065 feuille "etat de suivi" P14:Q14]

**Fiche de suivi du délai d'exécution** (une ligne par facture) : « N° FACTURE » ; « N° ORDRE DE SERVICE » ; « DATE ORDRE DE SERVICE » ; « DATE DEBUT DES TRAVAUX » ; « DATE DEBUT DES TRAVAUX BALAYAGE » ; « N° ORDRE D'ARRET » ; « DATE ORDRE D'ARRET » ; « N° ORDRE DE REPRISE » ; « DATE ORDRE DE REPRISE » ; « DELAI D'EXECUTION BALAYAGE » ; « DATE D'ACHEVEMENT BALAYAGE » ; « DELAI DE REALISATION CONSTATE » ; « RETARD CONSTATE (en jours) » ; « PENALITE DE RETARD (en DH/TTC) » ; « OBS ». Exemple : `18/2017/AT 1 ; 285/2016 ; 28/11/2016 ; 28/11/2016 ; 28/11/2016 ; — ; — ; — ; — ; 4 mois ; 27/03/2017 ; 4 mois ; — ; —`. [F073 feuille "01"]

- **R-ATT-018** [2017] Décompte des mois en 2017 : un balayage commencé le 2016-11-28 et achevé le 2017-03-27 est compté « 4 mois » sans retard : l'échéance est la veille du jour anniversaire. Transposé au marché 2026 `[DÉDUIT]` : balayage du 2026-10-02 au 2027-02-01 ; fin du délai global le 2027-10-01 `[À CONFIRMER]`. [F073 feuille "01" ligne 20]
- **R-ATT-019** [2017] Le délai est suspendu par un ordre d'arrêt et reprend par un ordre de reprise (numéro et date de chacun) ; le retard constaté s'exprime en jours et la pénalité en DH TTC. [F073 feuille "01"]

**Facture 2017** (« 18/2017/AT 1 du 11/04/2017 ») : en-tête « FACTURE » ; numéro et date ; « Nom » (client) ; « Marché n° » ; « N° O.S » ; « Projet » ; « Travaux réalisés au » ; colonnes « N° » ; « DÉSIGNATION » ; « Unité » ; « QTE » ; « P.U-HT » ; « P.P-HT » ; pied « TOTAL H.T » ; « T.V.A 20% » ; « TOTAL T.T.C » ; « Retenue de garantie » ; « Net à payer » ; « Arrêté à la somme de: … /TTC ». Valeurs : HT 746 317,932 ; TVA 149 263,5864 ; TTC 895 581,5184 ; retenue 89 558,15184 ; net 806 023,36656, arrêté à 806 023,37. [F072 feuille "FACTURE N° 26"]

- **R-ATT-020** [2017] La facture 2017 reprend toutes les lignes du bordereau (y compris à quantité nulle) avec les quantités cumulées, déduit la retenue de garantie de 10 % du TTC et arrête le net à payer en lettres ; elle cite le marché, l'ordre de service et la date d'arrêt des travaux. [F072]
- **R-ATT-021** [2017] Format du numéro de facture d'AFW : `NN/AAAA/AT N` (18/2017/AT 1) ; numéro d'ordre de service : `NNN/AAAA` (285/2016 global ; 286, 287, 288/2016 partiels par zone). [F072 ; F069]

### 7.7 Feuilles de saisie 2017 utiles au modèle de données

**Fiche de réparation** (une fuite = un bloc de lignes) : « Zone d'intervention » (déduite du secteur par formule) ; « Secteur » ; « N° de fuite » ; « Tournée » ; « Date de réparation » ; « Terrassement » : « Long », « Larg », « Prof » ; « Nature de degradation » ; « Détails de reparation des fuites (pièces) » ; « Qté » ; « Observations ». [F068 feuille "Fiche de réparation" A6:L7]

- **R-ATT-022** [2017] Table secteur → zone de 2017 : Sidi Yahya 4000 = Lazaret Haut, Sidi Yahya, A. Guennoun ; Route Jerada 5000 = Jawhara, Riad, Mchiwer, Taza, Mir Ali, Si Lakhder ; Jbel Hemra DN600 = Medina, Alaounia, Mauritanie, Tennis 1, Rte Algerie. Ne vaut pas pour 2026 (voir liste `secteur` en 6 bis). [F068 feuille "Fiche de réparation" A8]
- **R-ATT-023** [2017] Une fuite peut porter deux lignes de terrassement (deux revêtements différents) ; les quantités de PEHD sont en mètres (0,5 ; 0,6 ; 0,8 ; 1,2…), les autres pièces à l'unité. [F068 ; F065 feuille "Fiche de réparation" J]
- **R-ATT-024** [2017] Observations tenant lieu de statut : « Réparée par l'équipe de la RADEEO » ; « Sondage négatif (l'eau provient du voisinage) » ; « Sondage négatif (conduite d'assainissement) » ; « Sondage négatif » ; « Refus de l'abonné » ; « Trottoir en marbre - refus de l'abonné » ; « Trottoir en faience - refus de l'abonné » ; « A tracer par l'équipe de la détection ». [F065 feuille "Fiche de réparation" K]
- **R-ATT-025** [2017] Sondage négatif : exemple de la fuite 106 (terrassement 0,8 × 1 × 0,8 saisi, aucune pièce) : le terrassement entre dans le total du prix de terrassement, donc était payé ; aucune réparation comptée. [F065 feuille "Fiche de réparation" ; notes F065 § 6]
- **R-ATT-026** [2017] Fiche des fuites détectées et à réparer : « Secteur » ; « Numéro de fuite » ; « Tournée » ; « CHERCHEUR DE FUITE » ; « Date de detection de fuite » ; « Date de reparation ». C'est le seul document 2017 portant le nom du détecteur et la date de détection. [F084 feuille " detectees et non reparees" A6:F7]
- **R-ATT-027** [2017] Détail BS (mouvements de matériel) : par pièce, « Ecarts » `=D4-C4`, « Total des pièces posées » `=SUMIF('Fiche de réparation'!$I$8:$I$3442,"<pièce>",'Fiche de réparation'!$J$8:$J$3442)`, « Total des entrées » `=SUM(E4:AA4)`, puis une colonne par « N° de BS » ; mise en forme conditionnelle : écart négatif mis en évidence. Sans objet contractuel en 2026 (fourniture par l'entreprise) mais utile comme suivi de stock interne. [F065 feuille "Détail BS"]
- **R-ATT-028** [2017] Linéaire prospecté (journal du balayage) : « Semaine » ; « Journée » ; « Date » ; « Secteur » ; « Linéaire prospecté par jour en (Km linéaire) » ; « Fuites localisées » (« Visibles », « Invisibles ») × (« Conduite », « Brt ») ; « Total global du linéaire prospecté (Km linéaire) » `=SUM(E12:E2535)`. Les jours de second passage portent le mot « Repasse » à la place du linéaire (non payé). [F065 feuille "Linéaire prospecté"]
- **R-ATT-029** [2017] Le prix de balayage facturé (580 km = quantité du marché) était saisi à la main et ne correspondait pas au journal (735,75 km puis 853,75 km) : le linéaire payé était plafonné au linéaire du marché. [F065 feuille "attach recap" H16 ; F084]
- **R-ATT-030** [2017] Modèle papier de fiche par fuite : « Fiche de réparation de fuite détection dans le cadre du marché 59/E/2016 » ; « Tournée de la fuite : » ; « Terrassement » : « Longueur (m) », « Largeur (m) », « profondeur (m) », « Nature de dégradation » ; « Détail de réparation de la fuite : » ; « Emmargement Entreprise » ; « Emmargement agent RADEEO » (double signature par fuite). [F080 feuille "Fiche de fuite"]

**Rapport journalier 2017** (« RAPPORT JOURNALIER DE RECHERCHE DE FUITES », une feuille par journée) : en-tête « Marché N° 59 /E/2016 » ; « Société : » ; « journée du : » ; « Equipe : » ; « Equipements utilisés : » ; « Secteur d'intervention : » ; « Linéaire : … km » ; colonnes « Secteur » ; « Planche N° » ; « Adresse » ; « Canalisation prospectée » : « Calibre », « Nature » ; « Fuite » : « N° », « Nature », « Nbre de Branchement prospecté », « Visibles », « Invisibles » ; « Observation » ; ligne « TOTAL » `=SUM(K16:K29)` et `=SUM(L16:L29)` ; « COMMENTAIRE » ; signatures « Pour AFW » et « Pour RADEEO ». [F087 feuille "Rapport journalier"]

- **R-ATT-031** [2017] Dans les 41 journées de 2017 : la colonne « Adresse » contient la référence `999-999-999` (ou « R.A.S » s'il n'y a pas de fuite) ; « Planche N° », « Nature » de fuite, « Nbre de Branchement prospecté » et « Equipe » ne sont jamais remplis ; les numéros de fuite se suivent sur tout le chantier (1 à 129). [F087 ; F089 à F095]
- **R-ATT-032** [2017] Rendement constaté en 2017 : 334,05 km en 36 jours renseignés (9,28 km par jour) ; 129 fuites dont 8 visibles et 121 invisibles (0,34 fuite par km hors repasse). [F087 à F095, calcul par script]

**Rapport hebdomadaire 2017** (« RAPPORT HEBDOMADAIRE DE RECHERCHE DE FUITES ») : « Zone : » ; « Semaine du : … Au : … » ; « Société : » ; « Equipements Utilisés : » ; lignes Lundi à Dimanche (deux lignes par jour : « Visibles », « Invisibles ») ; colonnes « Journée » ; « Date » ; « Linéaire prospecté ml » (valeurs en km) ; « Fuites localisées » : « Conduite » ; « Brt » ; « Piéce spéciale » ; « Vanne » ; « Br. Clandestin » ; « B.I. » ; « Autre » ; totaux `=SUM(C19:C32)`, `=SUM(E19,E21,E23,E25,E27,E29,E31)` (visibles), `=SUM(E20,E22,E24,E26,E28,E30,E32)` (invisibles) ; « COMMENTAIRE » ; « Pour AFW » ; « Pour RADEEO ». Semaine du lundi au dimanche. [F088 feuille "Semaine 1"]

### 7.8 Règles de calcul à retenir pour l'attachement mensuel

| Question | Réponse du modèle 2017 | Réponse du CPS 2026 | Hypothèse proposée pour 2026 |
|---|---|---|---|
| Date qui rattache une fuite au mois | date de réparation (seule date saisie) ; la réfection n'entre que lorsqu'elle est faite | `[NON PRÉCISÉ]` | réparation : mois de la date de réparation ; réfection : mois de la date de réfection `[À CONFIRMER]` |
| Fuite réparée en M, réfection en M+1 | réparation en M, surface de réfection en M+1 (ligne colorée tant que non faite) | `[NON PRÉCISÉ]` | même règle |
| Fuites contestées ou non visées | `[NON PRÉCISÉ]` ; attachements visés « qu'après achèvement des réfections » (art. 45) | attachement contradictoire validé par la SRM | n'entrent à l'attachement que les lignes validées |
| Fouilles négatives | terrassement compté, pas de prix de réparation | `[NON PRÉCISÉ]` | terrassement au prix 3 (« sondage ») `[À CONFIRMER]` |
| Reprises sous garantie | `[NON PRÉCISÉ]` (reprise à la charge du titulaire, art. 28) | gratuites | ligne sans quantité payante |
| Date de clôture du mois ; délai de remise | « Travaux exécutés au : » (date libre) | `[NON PRÉCISÉ]` | dernier jour du mois calendaire `[À CONFIRMER]` |
| Cumuls | attachement : précédent, mois, cumulé ; décompte : cumul (version datée) | décomptes « chaque fois qu'il est nécessaire » | attachement en cumul + quantité du mois ; décompte en cumul moins acomptes antérieurs |
| Arrondi | aucun par ligne ; TVA et TTC à 2 décimales ; retenue non arrondie | coefficient de révision à 4 décimales ; reste `[NON PRÉCISÉ]` | quantités à 2 décimales (m, m2) ou 3 (m3), montants à 2 décimales `[À CONFIRMER]` |
| Régularisation d'un mois antérieur | par le cumul (toute correction se retrouve dans la quantité du mois) | `[NON PRÉCISÉ]` | même règle |
| Dépassement des quantités prévisionnelles | colonnes « <25% » et « >30% » de l'état de suivi | art. 57 à 59 du CCAG-T | alerte par prix sur le cumul rapporté à la quantité du bordereau |

- **R-ATT-033** [DÉDUIT] Chaîne de calcul proposée pour 2026, ligne par ligne : quantité du mois (saisies validées du mois) → cumul antérieur (cumul de l'attachement précédent) → cumul à ce jour = antérieur + mois → montant HT de ligne = cumul × PU → total HT → majoration 15 % → révision des prix éventuelle → TVA 20 % → TTC → retenue de garantie (10 % de l'acompte, plafond 7 %) → remboursement d'avance éventuel → pénalités → déduction des acomptes antérieurs → net à payer. Ordre et assiettes `[À CONFIRMER]` (R-CPS-200). [F068 feuille "decompte" ; F056 p.9-14]
- **R-ATT-034** [DÉDUIT] Ce qui doit changer pour 2026 par rapport au modèle 2017 : 13 prix au lieu de 24 ; prix 1 et 2 en mètres et non en kilomètres ; un seul prix de réfection de trottoir (prix 4) ; pas de prix de mesure de débit ; ligne de majoration de 15 % ; retenue de garantie plafonnée à 7 % ; cinq zones au lieu de trois ; fourniture des pièces par l'entreprise (plus de bons de sortie) ; en-tête SRM-ORI (« Exploitation eau potable », « Département Mesures et Amelioration du rendement ») ; numéro de marché 4500004453 et OS n° 02/4500004453 du 2026-10-02 ; affectation automatique des pièces aux prix (section 5.3) au lieu du « 1 » saisi à la main ; statut en champ et non en couleur ; dates de détection et nom du détecteur dans la fiche. [F001 ; F065 ; F056]

### 7.9 Table de passage 2017 → 2026

| Prix 2017 (n° ; désignation abrégée ; unité) | Prix 2026 équivalent (n°) | Identique / modifié / sans équivalent | Commentaire |
|---|---|---|---|
| 1 ; balayage ; Km | 1 | modifié | unité km → m ; 994 DH/km (0,994 DH/m) → 0,30 DH/m ; 580 km → 1466 km |
| 2 ; maintien des résultats ; Km | 2 | modifié | unité km → m ; 875 DH/km → 0,45 DH/m |
| 3 ; mesure des débits de nuit par débitmètre portable ; U | — | sans équivalent | en 2026 les mesures ne sont pas rémunérées (R-CPS-117) |
| 4 ; confection de tranchée ; m3 | 3 | identique (désignation) | PU 29,50 → 50,00 ; la règle de largeur « diamètre + 25 cm de chaque côté » disparaît |
| 5 ; réfection trottoir béton ; m² | 4 | modifié | quatre prix 2017 fusionnés en un seul prix 2026 à 100,00 |
| 6 ; réfection trottoir mosaïque ; m² | 4 | modifié | idem |
| 7 ; réfection trottoir granito lavé ; m² | 4 | modifié | idem |
| 8 ; réfection trottoir carreaux ciment ; m² | 4 | modifié | idem |
| 9.a ; chaussée enrobé à chaud 10 cm ; m² | 5 | modifié | épaisseur 10 cm → 7 cm ; PU 200,00 → 150,00 |
| 9.b ; chaussée enrobé à froid ; m2 | 5 (sans supplément) | sans équivalent | en 2026 l'enrobé à froid n'est qu'un procédé de substitution après 1 mois, payé au prix 5 |
| 10.a ; 10.b ; buses d'égout ; ml | — | sans équivalent | assainissement hors bordereau 2026 |
| 11 ; transport et pose de bouche à clé (socle 20 × 20 × 10) ; U | — (voir 10) | sans équivalent | — |
| 12 ; tout venant ; m3 | — | sans équivalent | compris dans les prix 4 et 5 |
| 13.a ; changement du polyéthylène de branchement Ø 25 ou 32 ; U | 6 | modifié | 2026 : diamètre extérieur < 40 mm, fourniture comprise ; PU 215,45 → 400,00 |
| 13.b ; changement de collier pour polyéthylène et/ou raccord ; U | 6 `[À CONFIRMER]` | modifié | le prix 6 de 2026 inclut « raccords, collier pour polyéthylène et ou manchon ou bouchon » |
| 13.c ; changement de robinet PEC ; U | 7 | modifié | fourniture comprise ; PU 255,00 → 460,00 |
| 13.d ; changement de collier PEC ; U | 8 | modifié | fourniture comprise ; PU 255,00 → 460,00 |
| 14 ; réparation PE diamètre extérieur ≥ 40 mm ; U | 9 | modifié | fourniture comprise ; PU 255,00 → 400,00 |
| 15 ; mise à niveau de bouche à clé (socle 0,40 × 0,40 × 0,20) ; U | 10 | modifié | fourniture comprise ; PU 110,50 → 140,00 |
| 16.a ; conduite AC ou PVC 315 à 225 mm ; U | 11 | modifié | fourniture comprise ; PU 3000,00 → 4600,00 |
| 16.b ; conduite AC ou PVC 200 à 110 mm ; U | 12 | modifié | PU 1500,00 → 2900,00 |
| 16.c ; conduite AC ou PVC < 110 mm ; U | 13 | modifié | PU 800,00 → 2300,00 |
| 17 ; pièces spéciales (coude, té, cône, obturateur) ; U | — | sans équivalent | hors bordereau 2026 |

### 7.10 Exemple chiffré complet (test unitaire)

**Exemple A `[2017]`** : trois lignes du bordereau 2017, décompte n° 2 en cumul, selon les formules du modèle (aucun arrondi de ligne ; TVA et TTC à 2 décimales ; retenue 10 % du TTC non arrondie ; acompte antérieur déduit). Quantités antérieures = attachement n° 1 de F065 ; quantités cumulées = F084. Valeurs calculées par script.

| N° prix 2017 | Unité | PU HT | Quantité antérieure | Quantité du mois | Quantité cumulée | Montant HT antérieur | Montant HT cumulé |
|---|---|---|---|---|---|---|---|
| 4 | m3 | 29.50 | 267.4928 | 35.7360 | 303.2288 | 7891.0376 | 8945.2496 |
| 6 | m² | 57.20 | 85.6500 | 5.1300 | 90.7800 | 4899.1800 | 5192.6160 |
| 13.a | U | 215.45 | 290.0000 | 48.0000 | 338.0000 | 62480.5000 | 72822.1000 |

| Étape | Formule | Décompte n° 1 (antérieur) | Décompte n° 2 (cumul) |
|---|---|---|---|
| Total HT | somme des montants de ligne, non arrondie | 75270.7176 | 86959.9656 |
| TVA 20 % | ROUND(HT × 0.2 ; 2) | 15054.14 | 17391.99 |
| Total TTC | ROUND(HT + TVA ; 2) | 90324.86 | 104351.96 |
| Retenue de garantie | TTC × 0.1 (non arrondie) | 9032.4860 | 10435.1960 |
| Total après retenue | TTC − retenue | 81292.3740 | 93916.7640 |
| À déduire : acomptes antérieurs | net du décompte n° 1 | 0.0000 | 81292.3740 |
| À déduire : pénalités, réfactions | saisie | 0.0000 | 0.0000 |
| **Montant de l'acompte à payer** | total − acomptes − pénalités | **81292.3740** | **12624.3900** |

Attendu pour un test : acompte n° 2 = 12624.3900, soit 12624.39 DH TTC une fois arrondi au centime.

**Exemple B `[DÉDUIT]`** : même chaîne transposée aux prix 2026, avec majoration de 15 % et retenue de garantie de 10 % de l'acompte. L'ordre des opérations et les arrondis sont une proposition de l'extracteur (R-CPS-200, R-ATT-033), à valider avec la SRM ; arrondi au centime à chaque étape.

| N° prix 2026 | Unité | PU HT | Cumul antérieur | Quantité du mois | Cumul à ce jour | Montant HT cumulé |
|---|---|---|---|---|---|---|
| 3 | m3 | 50.00 | 14.56 | 16.688 | 31.248 | 1562.40 |
| 4 | m2 | 100.00 | 5.51 | 13.39 | 18.9 | 1890.00 |
| 6 | u | 400.00 | 12 | 19 | 31 | 12400.00 |

| Étape | Formule | Cumul antérieur | Cumul à ce jour |
|---|---|---|---|
| Total HT aux prix du bordereau | Σ cumul × PU | 6079.00 | 15852.40 |
| Majoration 15 % | HT × 0.15 | 911.85 | 2377.86 |
| Total HT majoré | HT + majoration | 6990.85 | 18230.26 |
| TVA 20 % | HT majoré × 0.2 | 1398.17 | 3646.05 |
| Total TTC | HT majoré + TVA | 8389.02 | 21876.31 |

| Étape | Formule | Valeur |
|---|---|---|
| Acompte brut du mois (TTC) | TTC cumulé − TTC antérieur | 13487.29 |
| Retenue de garantie | 10 % de l'acompte (tant que le cumul des retenues < 363438.18) | 1348.73 |
| Pénalités | aucune dans l'exemple | 0.00 |
| **Net à payer** | acompte − retenue − pénalités | **12138.56** |

Contrôle : TTC cumulé = HT × 1.15 × 1.20 = 15852.40 × 1.38 = 21876.31.

## 8. Fiches et modèles Canva

**Résumé.** Le dossier ne contient **aucun modèle Canva** (ni export PNG ou PDF, ni lien `canva.com`, ni fichier `.webloc`) : les « fiches en préparation » sont des classeurs Excel de STEPAG, datés d'avril à octobre 2026, dérivés des modèles de 2017. Cinq gabarits sont décrits : rapport journalier, fiche individuelle de réparation, rapport mensuel, classeur d'attachement (fiche de réparation, réfection, détail, récapitulatif, facture, bordereau d'envoi) et bordereau d'envoi Word. Tous sont `[INTERNE]` pour leur forme ; trois répondent à une exigence `[CONTRACTUEL]` du CPS (rapport journalier, fiche de réparation, rapport mensuel).

**Principaux `[NON PRÉCISÉ]`.** Numérotation des fiches et des rapports ; nombre d'exemplaires ; qui signe côté SRM (fonction exacte) ; heure limite de remise ; version arabe (aucun libellé arabe dans les fiches, hors raison sociale de STEPAG) ; modèles imposés par la SRM (aucun dans le dossier).

**Convention.** « Obligatoire » : `oui` si le CPS impose l'information, `interne` si seul le gabarit la prévoit. Aucun classeur ne contient de commentaire de cellule, de modification suivie ni de liste de validation ; il n'y a donc pas de mention `[brouillon]`.

### 8.1 Rapport journalier de recherche de fuites (en usage, octobre 2026)

| Élément | Valeur |
|---|---|
| Nom | « RAPPORT JOURNALIER DE RECHERCHE DE FUITES » |
| Fichiers | [F119] (secteur Abdellah Guenoun) ; [F120] (secteur Lazaret Haut) ; feuille nommée par la date (« 02-10-2026 ») ; variante [F121] |
| Usage | rendre compte chaque jour du secteur balayé, du linéaire et des fuites détectées (exigence R-CPS-139) |
| Support actuel | Excel, un classeur par secteur, une feuille par journée ; 2 logos |
| Numérotation | aucune (identifié par secteur + date) |
| Exemplaires | `[NON PRÉCISÉ]` |
| Qui la remplit ; quand | STEPAG (équipes de détection) ; chaque jour de balayage |
| Qui signe | zone de signature en bas à droite (H54) ; variante F121 : « STEPAG » et « S.R.M » |
| Statut normatif | contenu `[CONTRACTUEL]` (zone balayée, linéaire, fuites, adresses, extrait de plan A4) ; forme `[INTERNE]` |
| Maturité | brouillon en usage : total faux (`=SUM(H16:H46)` sur 31 lignes pré-remplies), numéros de fuite non incrémentés dans F120, linéaire et calibre vides, extrait de plan absent |
| Où les champs réapparaissent | référence et numéro de fuite → fiche de réparation et attachement ; linéaire → attachement (prix 1) et rapport mensuel ; nombre de fuites → rapport mensuel |

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « Marché N° 4500004453 » | — | en-tête, B2 | texte fixe | — | — | interne | marche_numero | [F119 B2] |
| 2 | « TRAVAUX DE DÉTECTION, RECHERCHE ET RÉPARATION DE FUITES SUR LE RÉSEAU DE DISTRIBUTION D'EAU POTABLE DE LA VILLE D'OUJDA » | — | en-tête, B3 | texte fixe | — | — | interne | marche_objet | [F119 B3] |
| 3 | « RAPPORT JOURNALIER DE RECHERCHE DE FUITES » | — | titre, A5 | texte fixe | — | — | interne | — | [F119 A5] |
| 4 | « SOCIETE : STEPAG » | — | A7 | texte fixe | — | — | interne | entreprise_nom | [F119 A7] |
| 5 | « Journée du : » | — | F7 | date | — | — | oui | rapport_date | [F119 F7] |
| 6 | « EQUIPE N° : 1-2-3-4 » | — | A8 | texte | — | 1 ; 2 ; 3 ; 4 | interne | equipe_numero | [F119 A8] |
| 7 | « Zone d'intervention : Zone 4 Sidi yahya 5000 M3 et 4000 M3 » | — | F8 | choix | — | `zone_intervention` | oui | zone_id | [F119 F8] |
| 8 | « Secteur d'intervention : Abdellah Guenoun » | — | F9 | choix | — | `secteur` | oui | secteur_id | [F119 F9] |
| 9 | « Linéaire : » | — | F10 | nombre | km (variante F121 : « Linéaire en Km : 16 Km ») | — | oui | lineaire_inspecte_m | [F119 F10] ; [F121 D10] |
| 10 | « N° Fuite » | — | tableau, col. A | nombre | — | — | interne | fuite_numero | [F119 A14] |
| 11 | « Adresse ou Référence » (variante : « Réf » + « Adresse ») | — | tableau, col. B-D | texte | — | format `NNN-NNN-NNN` | oui (adresse) | reference_srm ; fuite_adresse | [F119 B14] ; [F121 A14:B14] |
| 12 | « Canalisation prospectée » › « Calibre » | — | tableau, col. E | nombre | mm | `diametre_nominal` | oui (diamètre) | conduite_dn_mm | [F119 E14:E15] |
| 13 | « Fuite » › « Nature » | — | tableau, col. F | choix | — | `ouvrage_touche` (CDT, BRT) | interne | ouvrage_touche | [F119 F15] ; [F121 E16] |
| 14 | « Fuite » › « Visibles » | — | tableau, col. G | case (1 ou X) | — | `visibilite_fuite` | oui | fuite_visibilite | [F119 G15] |
| 15 | « Fuite » › « Invisibles » | — | tableau, col. H | case (1 ou X) | — | `visibilite_fuite` | oui | fuite_visibilite | [F119 H15] |
| 16 | « Nature Dégradation » | — | tableau, col. I | choix | — | `nature_revetement` | interne | nature_revetement | [F119 I14] |
| 17 | « TOTAL » | — | ligne 48 | nombre calculé | fuites | — | interne | nb_fuites_jour | [F119 A48:H48] |
| 18 | « COMMENTAIRE » | — | A50 | texte | — | — | interne | commentaire | [F119 A50] |
| 19 | (cadre vide en bas à droite) | — | H54:J54 | signature | — | — | interne | visa_stepag ; visa_srm | [F119 H54] |
| 20 | « Total des fuites : 3 FUITES » (variante F121) | — | A21 | texte | — | — | interne | nb_fuites_jour | [F121 A21] |
| 21 | « STEPAG » ; « S.R.M » (variante F121) | — | pied, A23 ; G23 | signature | — | `fonction_signataire` | interne | visa_stepag ; visa_srm | [F121 A23 ; G23] |

- **R-FICHE-001** [INTERNE] Formule du total : `=SUM(H16:H46)` (somme de la colonne « Invisibles » seulement) ; la colonne « Visibles » n'est pas totalisée et la plage s'arrête une ligne trop tôt dans F120. [F119 H48 ; F120 H48]
- **R-FICHE-002** [INTERNE] Une mise en forme conditionnelle « valeurs en double » porte sur la colonne des références : une même référence ne doit pas figurer deux fois dans un rapport. [F121 A16:A20]
- **R-FICHE-003** [INTERNE] Le gabarit traite les quatre équipes ensemble (« EQUIPE N° : 1-2-3-4 ») : il ne permet pas de vérifier la cadence contractuelle de 4 km par jour et par équipe (R-CPS-121) `[À CONFIRMER : un rapport par équipe ou une colonne équipe]`. [F119 A8]
- **R-FICHE-004** [DÉDUIT] Manquent au gabarit par rapport au CPS : le linéaire renseigné, l'extrait de plan A4, la nature (matériau) de la canalisation ; par rapport au modèle 2017 : « Planche N° », « Equipements utilisés », « Nbre de Branchement prospecté », « Observation ». [F056 p.24 ; F087]
- **R-FICHE-005** [INTERNE] Données réelles du 2026-10-02 : secteur Abdellah Guenoun, 15 références (402-673-001 ; 040-152-010 ; 400-474-001…) ; secteur Lazaret Haut, 32 références (302-560-030 ; 037-287-009 ; 058-149-001…) ; toutes « Invisibles ». [F119 ; F120]

### 8.2 Fiche individuelle de réparation des fuites

| Élément | Valeur |
|---|---|
| Nom | « FICHE INDIVIDUELLE DE REPARATION DES FUITES » |
| Fichier | [F123], feuille « LABSARA » (nom de secteur), exemple daté du 20/05/2026 |
| Usage | une fiche par fuite réparée (exigence R-CPS-126 et R-CPS-140) |
| Support actuel | Excel, une feuille ; 1 logo |
| Numérotation | « Numéro de la fuite » (séquentiel) ; pas de numéro de fiche |
| Exemplaires | `[NON PRÉCISÉ]` ; le CPS exige une copie pour la SRM |
| Qui la remplit ; quand | STEPAG (équipe de réparation) ; après constat de la fuite et réparation |
| Qui signe | « STEPAG » et « S.R.M » (cases de visa) ; le CPS n'exige que la signature de l'entreprise |
| Statut normatif | existence `[CONTRACTUEL]` ; contenu et forme `[INTERNE]` |
| Maturité | brouillon (gabarit recopié : nom de feuille ≠ secteur saisi ; DN et nature vides) |
| Où les champs réapparaissent | tous → « Fiche de réparation Zone » du classeur d'attachement, puis REFECTION, détail d'attachement, récapitulatif, facture |

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « Date du: 20/05/2026 » | — | en-tête, E2 | date | — | — | interne | date_reparation | [F123 E2] |
| 2 | objet du marché | — | C4 | texte fixe | — | — | interne | marche_objet | [F123 C4] |
| 3 | « MARCHE 4500004453 » | — | C5 | texte fixe | — | — | interne | marche_numero | [F123 C5] |
| 4 | « FICHE INDIVIDUELLE DE REPARATION DES FUITES » | — | titre, F5 | texte fixe | — | — | interne | — | [F123 F5] |
| 5 | « Secteur de la fuite : » | — | B6 ; valeur D6 | choix | — | `secteur` | interne | secteur_id | [F123 B6] |
| 6 | « Numéro de la fuite : » | — | B7 ; valeur D7 | nombre | — | — | interne | fuite_numero | [F123 B7] |
| 7 | « Tournée : » | — | B8 ; valeur D8 | texte | — | format `NNN-NNN-NNN` | interne | reference_srm | [F123 B8] |
| 8 | « Fuite » › « Nature "Bt/Cdt" » | — | B10 | choix | — | `ouvrage_touche` | oui (rapport de détection) | ouvrage_touche | [F123 B10] |
| 9 | « Fuite » › « DN "conduite" » | — | C10 | nombre | mm | `diametre_nominal` | oui (R-CPS-153) | conduite_dn_mm | [F123 C10] |
| 10 | « TERRASSEMENT » › « Longueur (m) » | — | D10 | nombre | m | — | interne | fouille_longueur_m | [F123 D10] |
| 11 | « TERRASSEMENT » › « Largeur » | — | E10 | nombre | m | — | interne | fouille_largeur_m | [F123 E10] |
| 12 | « TERRASSEMENT » › « Profondeur » | — | F10 | nombre | m | — | interne | fouille_profondeur_m | [F123 F10] |
| 13 | « Nature de dégradation » | — | G10 | choix | — | `nature_revetement` | interne | nature_revetement | [F123 G10] |
| 14 | « DETAIL DE LA REPARATION DE FUITE » | — | B12 ; texte libre B13 | texte | — | pièces du catalogue (section 6.2) | interne | piece_designation ; piece_quantite | [F123 B12:B13] |
| 15 | « Nombre de piéces » | — | G12 ; valeur G13 | nombre | u | — | interne | piece_quantite | [F123 G12] |
| 16 | « STEPAG » | — | pied, C15 | signature | — | `fonction_signataire` | oui (signature de l'entreprise) | visa_stepag | [F123 C15] |
| 17 | « S.R.M » | — | pied, G15 | signature | — | `fonction_signataire` | interne | visa_srm | [F123 G15] |

- **R-FICHE-006** [INTERNE] Exemple du gabarit : secteur LAZARET BAS ; fuite n° 1 ; tournée 461-229-057 ; terrassement 0.9 × 0.6 × 0.7 ; « Carrelage » ; détail « Manchon 32 + 0.7 PVC 75 + 1 Bouche à clé » ; 3 pièces. [F123 D6:G13]
- **R-FICHE-007** [DÉDUIT] Manquent à la fiche pour alimenter l'attachement : date de détection, date de réfection, matériau de la conduite, visible ou invisible, pièces saisies une par une (le détail est un texte libre), longueur de polyéthylène remplacée, photos, position GPS. [F123 ; F001]
- **R-FICHE-008** [2017] Le modèle papier de 2017 prévoyait un « Emmargement Entreprise » et un « Emmargement agent RADEEO » par fuite. [F080 feuille "Fiche de fuite"]

### 8.3 Rapport mensuel de recherche de fuites

| Élément | Valeur |
|---|---|
| Nom | « RAPPORT MENSUEL DE RECHERCHE DE FUITES » |
| Fichier | [F122], feuille « Table 2 » ; exemple « JANVIER » |
| Usage | bilan mensuel (exigence R-CPS-141) |
| Support actuel | Excel, une page ; 1 logo |
| Numérotation ; exemplaires | aucune ; `[NON PRÉCISÉ]` |
| Qui la remplit ; quand | STEPAG ; chaque mois |
| Qui signe | « STEPAG » et « SRM ORIENTAL » |
| Statut normatif | existence `[CONTRACTUEL]` ; contenu et forme `[INTERNE]` |
| Maturité | brouillon (valeurs d'exemple ; total et ratios incomplets) |
| Où les champs réapparaissent | linéaire balayé → attachement (prix 1) ; nombres de fuites → rapports journaliers (somme) |

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « MARCHE 45000004453 » | — | E6 | texte fixe | — | — | interne | marche_numero | [F122 E6] |
| 2 | objet du marché | — | A8 | texte fixe | — | — | interne | marche_objet | [F122 A8] |
| 3 | « SOCIETE : STEPAG » | — | A10 | texte fixe | — | — | interne | entreprise_nom | [F122 A10] |
| 4 | « RAPPORT MENSUEL DE RECHERCHE DE FUITES » | — | titre, G10 | texte fixe | — | — | interne | — | [F122 G10] |
| 5 | « Mois » | — | H11 ; valeur I11 | choix | — | JANVIER à DÉCEMBRE | oui | mois_rapport | [F122 H11] |
| 6 | « Equipements Utilisés : Aquaphone A 50 , Aquaphone Mikron Junior 3 , Eureka » | — | A12 | texte | — | `equipement_detection` | interne | equipements_utilises | [F122 A12] |
| 7 | « Nbr Jours » | — | A13 ; valeur A14 | nombre | j | — | interne | nb_jours_travailles | [F122 A13] |
| 8 | « Linéaire Balayé » | — | B13 ; valeur B14 | nombre | km | — | oui | lineaire_inspecte_m (somme du mois) | [F122 B13] |
| 9 | « Nombre de fuites localisées » › « Fuites localisée » | — | D13:D14 | en-tête | — | — | oui | — | [F122 D13] |
| 10 | « Visibles » (ligne) | — | D15 | nombre | fuites | `visibilite_fuite` | oui | nb_fuites (visibles) | [F122 D15] |
| 11 | « Invisibles » (ligne) | — | D16 | nombre | fuites | `visibilite_fuite` | oui | nb_fuites (invisibles) | [F122 D16] |
| 12 | « Conduites » (colonne) | — | F14 | nombre | fuites | `ouvrage_touche` | interne | nb_fuites_par_ouvrage | [F122 F14] |
| 13 | « Branchement » (colonne) | — | G14 | nombre | fuites | `ouvrage_touche` | interne | nb_fuites_par_ouvrage | [F122 G14] |
| 14 | « Piece Spéciale » (colonne) | — | H14 | nombre | fuites | `ouvrage_touche` | interne | nb_fuites_par_ouvrage | [F122 H14] |
| 15 | « B.I » (colonne) | — | I14 | nombre | fuites | `ouvrage_touche` | interne | nb_fuites_par_ouvrage | [F122 I14] |
| 16 | « TOTAL » (colonne) | — | J14 | nombre calculé | fuites | — | interne | nb_fuites_total | [F122 J14] |
| 17 | « RATIO » › « Linéaire prospecté (Km.j) » | — | A18 ; valeur A19 | nombre calculé | km/j | — | interne | ratio_km_par_jour | [F122 A18] |
| 18 | « Fuite sur Branchement par Km » | — | D18 ; valeur D19 | nombre calculé | fuites/km | — | interne | ratio_fuites_branchement_km | [F122 D18] |
| 19 | (libellé vide : fuites sur conduite par km) | — | G18 ; valeur G19 | nombre calculé | fuites/km | — | interne | ratio_fuites_conduite_km | [F122 G19] |
| 20 | « Total des fuites par Km » | — | I18 ; valeur I19 | nombre calculé | fuites/km | — | interne | ratio_fuites_km | [F122 I18] |
| 21 | « STEPAG » | — | pied, A20 | signature | — | `fonction_signataire` | interne | visa_stepag | [F122 A20] |
| 22 | « SRM ORIENTAL » | — | pied, G20 | signature | — | `fonction_signataire` | interne | visa_srm | [F122 G20] |

- **R-FICHE-009** [INTERNE] Formules : total des fuites `=F16+G16` (conduites + branchements de la ligne « Invisibles » seulement) ; linéaire par jour `=B14/A14` ; fuites sur branchement par km `=G16/B14` ; fuites sur conduite par km `=F16/B14` ; total des fuites par km `=J16/B14`. Exemple : 20 jours ; 240 km ; 11 + 43 = 54 fuites ; 12 km/j ; 0.1792 ; 0.0458 ; 0.225. [F122 J16 ; A19 ; D19 ; G19 ; I19]
- **R-FICHE-010** [DÉDUIT] Champs calculés à corriger dans l'application : le total doit additionner visibles et invisibles et les quatre ouvrages ; les ratios doivent porter sur le total. Le rapport mensuel du CPS doit « dresser le bilan des travaux effectués » : y ajouter les réparations et réfections du mois, les débits mesurés et, en 2017, le programme prévisionnel du mois suivant `[2017 : F077 art. 45]`. [F122 ; F056 p.24]

### 8.4 Classeur d'attachement « Attachement N°1 mois 10 »

| Élément | Valeur |
|---|---|
| Nom | « ATTACHEMENT N°01 des travaux exécutés au … » (classeur de 9 feuilles) |
| Fichier | [F001] |
| Usage | établir l'attachement, le calcul des réfections et la facture à partir de la fiche de réparation |
| Support actuel | Excel ; reprise du modèle 2017 (en-tête d'impression encore « Marché N° 59/E/2016 ») |
| Numérotation | attachement « N°01 » ; facture « FA 2610-0002 » |
| Exemplaires | facture 5 ; attachement 3 (feuille B.ENVOI ; conforme à R-CPS-072) |
| Qui la remplit ; quand | bureau STEPAG ; au fil des réparations, arrêté en fin de mois (« Travaux executés au 31/10/2026 ») |
| Qui signe | « SRM.ORI » et « Sté STEPAG » (attachement récapitulatif) ; « Signature: » (facture) |
| Statut normatif | attachement et facture `[CONTRACTUEL]` dans leur principe et leurs mentions (R-CPS-061, R-CPS-064) ; forme `[INTERNE]` |
| Maturité | brouillon en cours : 22 fuites saisies (détectées le 2026-10-02, réparées le 2026-10-03) ; détail d'attachement et récapitulatif encore vides ; restes de gabarit (titre « au 30/01/2026 », bordereau d'envoi d'un autre marché, numéro de marché à 11 chiffres) |
| Où les champs réapparaissent | Parametre → en-têtes de toutes les feuilles ; fiche de réparation → REFECTION → détail → récapitulatif → facture |

**Feuille « Parametre »** (source unique des en-têtes ; les autres feuilles y pointent par formule `=Parametre!A3` etc.) :

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « SRM-Oriental » | — | A3 | texte | — | — | interne | client_nom | [F001 feuille "Parametre" A3] |
| 2 | « Exploitation eau potable » | — | A4 | texte | — | — | interne | client_direction | [F001 feuille "Parametre" A4] |
| 3 | « Département Mesures et Amelioration du rendement » | — | A5 | texte | — | — | interne | client_service | [F001 feuille "Parametre" A5] |
| 4 | « Marché N° 45000004453 » | — | F5 | texte | — | — | oui (référence du marché) | marche_numero | [F001 feuille "Parametre" F5] |
| 5 | objet du marché | — | D7 | texte | — | — | interne | marche_objet | [F001 feuille "Parametre" D7] |
| 6 | « O.S.N°: 02/45000004453 Du 02/10/2026 » | — | A9 | texte | — | — | oui (référence de l'OS) | os_numero ; os_date | [F001 feuille "Parametre" A9] |
| 7 | « Entreprise STEPAG » | — | A11 | texte | — | — | interne | entreprise_nom | [F001 feuille "Parametre" A11] |
| 8 | « Travaux executés au 31/10/2026 » | — | A13 | date | — | — | interne | date_arrete_travaux | [F001 feuille "Parametre" A13] |
| 9 | « Zone » | — | A15 | choix | — | `zone_intervention` | oui (lieu du chantier) | zone_id | [F001 feuille "Parametre" A15] |

**Feuille « Fiche de réparation Zone »** (saisie ; une fuite = une ligne principale + une ligne par pièce supplémentaire) :

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « N° de fuite » | — | col. A | nombre | — | — | interne | fuite_numero | [F001 feuille "Fiche de réparation Zone " A12] |
| 2 | « Tournée » | — | col. B | texte | — | format `NNN-NNN-NNN` ; doublons signalés | interne | reference_srm | [F001 feuille "Fiche de réparation Zone " B12] |
| 3 | « DATE DE DETECTION » | — | col. C | date | — | — | interne | date_detection | [F001 feuille "Fiche de réparation Zone " C12] |
| 4 | « DATE DE REPARATION » | — | col. D | date | — | — | interne | date_reparation | [F001 feuille "Fiche de réparation Zone " D12] |
| 5 | « Terrassement » › « Longueur » | — | col. E | nombre | m | — | interne | fouille_longueur_m | [F001 feuille "Fiche de réparation Zone " E13] |
| 6 | « Terrassement » › « Largeur » | — | col. F | nombre | m | — | interne | fouille_largeur_m | [F001 feuille "Fiche de réparation Zone " F13] |
| 7 | « Terrassement » › « Profondeur » | — | col. G | nombre | m | — | interne | fouille_profondeur_m | [F001 feuille "Fiche de réparation Zone " G13] |
| 8 | « Nature de degradation » | — | col. H | choix | — | `nature_revetement` | interne | nature_revetement | [F001 feuille "Fiche de réparation Zone " H12] |
| 9 | « Détail des pieces de reparation des fuites » | — | col. I | choix | — | catalogue (section 6.2) ; `motif_sans_reparation` | interne | piece_designation | [F001 feuille "Fiche de réparation Zone " I12] |
| 10 | « Qté posée » | — | col. J | nombre | u, ou m pour le PEHD | — | interne | piece_quantite | [F001 feuille "Fiche de réparation Zone " J12] |
| 11 | « Observations » | — | col. K | texte | — | — | interne | observation | [F001 feuille "Fiche de réparation Zone " K12] |

Lignes réelles (extrait) :

| N° de fuite | Tournée | Date de détection | Date de réparation | Longueur | Largeur | Profondeur | Nature de dégradation | Pièce | Qté posée |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 302-684-001 | 2026-10-02 | 2026-10-03 | 1.2 | 0.7 | 0.8 | carrelage | Robinet equerre 32 1/2 | 1 |
| — | — | — | — | — | — | — | — | Manchon droit 32/32 | 1 |
| — | — | — | — | — | — | — | — | PEHD 26/32 | 1 |
| 2 | 302-683-020 | 2026-10-02 | 2026-10-03 | 1.2 | 0.6 | 0.9 | carrelage | Manchon droit 32/32 | 2 |
| — | — | — | — | — | — | — | — | PEHD 33/40 | 1 |
| 4 | 302-650-030 | 2026-10-02 | 2026-10-03 | 1.2 | 0.7 | 0.9 | mosaique | Assainissement | — |
| 21 | 029-122-001 | ? | ? | 1 | 0.6 | 0.7 | carrelage | Manchon droit 25/25 | 2 |
| — | — | — | — | — | — | — | — | PEHD 19/25 | 0.5 |

**Feuille « REFECTION »** (calcul) :

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « N° de fuite » | — | col. A | lien | — | — | interne | fuite_numero | [F001 feuille "REFECTION" A14] |
| 2 | « Référence » | — | col. B | lien | — | — | interne | reference_srm | [F001 feuille "REFECTION" B14] |
| 3 | « Date de réparation » | — | col. C | lien | — | — | interne | date_reparation | [F001 feuille "REFECTION" C14] |
| 4 | « Long » ; « Larg » ; « prof » | — | col. D ; E ; F | lien | m | — | interne | fouille_longueur_m ; fouille_largeur_m ; fouille_profondeur_m | [F001 feuille "REFECTION" D14:F14] |
| 5 | « Nature de degradation » | — | col. G | lien | — | `nature_revetement` | interne | nature_revetement | [F001 feuille "REFECTION" G14] |
| 6 | « Symbole » | — | col. H | choix (saisie) | — | B ; M ; L ; C ; AC ; TN | interne | symbole_refection | [F001 feuille "REFECTION" H14] |
| 7 | « Béton » (B) ; « Mosaique » (M) ; « Lavé » (L) ; « Carreaux » (C) | — | col. I ; J ; K ; L ; n° de prix 4 en I16 | nombre calculé | m2 | — | interne | surface_refection_m2 (prix 4) | [F001 feuille "REFECTION" I14:L16] |
| 8 | « Asphalt à chaud » (AC) | — | col. M ; n° de prix 5 en M16 | nombre calculé | m2 | — | interne | surface_refection_m2 (prix 5) | [F001 feuille "REFECTION" M14:M16] |
| 9 | « Terrain naturel » (TN) | — | col. N | nombre calculé (toujours 0) | m2 | — | interne | — | [F001 feuille "REFECTION" N14] |
| 10 | « Ovservation » | — | col. O | texte | — | — | interne | observation | [F001 feuille "REFECTION" O14] |
| 11 | « Total » | — | ligne 445 | somme | m2 | — | interne | — | [F001 feuille "REFECTION" A445] |

- **R-FICHE-011** [INTERNE] Formules de la feuille REFECTION : `A17 ='Fiche de réparation Zone '!A14` (recopie ligne à ligne) ; `I17 =IF($H17="B",D17*E17,"-")` ; `J17 =IF($H17="M",D17*E17,"-")` ; `K17 =IF($H17="L",D17*E17,"-")` ; `L17 =IF($H17="C",D17*E17,"-")` ; `M17 =IF($H17="AC",D17*E17,"-")` ; `N17 =IF($H17="TN",E17*F17*0,"-")` ; totaux `=SUM(I17:I444)`. Surface = longueur × largeur de la fouille, placée dans la colonne du symbole saisi. [F001 feuille "REFECTION" A17:N445]
- **R-FICHE-012** [INTERNE] Le symbole de réfection est saisi à la main et seulement une fois la réfection faite (5 symboles saisis pour 22 fuites : 4 « c », 1 « m » ; totaux 4.67 m2 de carreaux et 0.84 m2 de mosaïque) : la saisie du symbole tient lieu de constat « réfection faite ». [F001 feuille "REFECTION" H ; L445 ; J445]

**Feuille « DETAIL ATTACHEMENT Zone »** (matrice fuite × prix, vide de données) : colonnes « DATE » ; « Tournée » ; « Terrassement » (« Longueur », « Largeur », « Profondeur », « Nature de degradation ») ; « Détail des de reparation des fuites » ; « Qté Posée » ; puis une colonne par prix du bordereau, libellé complet en ligne 14 et numéro 1 à 13 en ligne 15 ; lignes de pied « Total » `=SUM(K16:K929)`, « Total mois -1 » (saisie), « total partiel » `=K930-K932`. [F001 feuille "DETAIL ATTACHEMENT Zone" A14:U933]

- **R-FICHE-013** [INTERNE] Le détail d'attachement porte des cumuls ; la quantité de la période (« total partiel ») = total cumulé − total du mois précédent, pour chacun des 13 prix. [F001 feuille "DETAIL ATTACHEMENT Zone" 930:933]

**Feuille « attachement recap »** :

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | en-tête repris de Parametre (client, marché, objet, OS, entreprise, date d'arrêt) | — | A1:A11 | lien | — | — | oui (marché, OS) | marche_numero ; os_numero ; date_arrete_travaux | [F001 feuille "attachement recap" A1:A11] |
| 2 | « ATTACHEMENT N°01 des travaux exécutés au 30/01/2026 » | — | A7 | texte | — | — | interne | attachement_numero ; date_arrete_travaux | [F001 feuille "attachement recap" A7] |
| 3 | « Des prix » | — | col. A | nombre | — | 1 à 13 | oui (numéros des postes) | prix_numero | [F001 feuille "attachement recap" A13] |
| 4 | « Désignation des prestations » | — | col. B | texte | — | — | oui | prix_designation | [F001 feuille "attachement recap" B13] |
| 5 | « Unité » | — | col. C | texte | — | `unite` | interne | prix_unite | [F001 feuille "attachement recap" C13] |
| 6 | « Quantité mois -1 » | — | col. D (masquée) | nombre | selon prix | — | interne | quantite_anterieure | [F001 feuille "attachement recap" D13] |
| 7 | « Quantité partielle » | — | col. E | nombre | selon prix | — | oui (quantités) | quantite_mois | [F001 feuille "attachement recap" E13] |
| 8 | « SRM.ORI » | — | pied, A28 | signature | — | `fonction_signataire` | oui (contradictoire) | visa_srm | [F001 feuille "attachement recap" A28] |
| 9 | « Sté STEPAG » | — | pied, C28 | signature | — | `fonction_signataire` | oui | visa_stepag | [F001 feuille "attachement recap" C28] |

- **R-FICHE-014** [DÉDUIT] Mentions exigées par le CPS et absentes du gabarit d'attachement : « lieu exact du début et de la fin du chantier concerné avec si besoin un croquis ou un plan » ; le gabarit ne porte que « Zone ». Pas de colonne « cumulé » imprimée (présente dans le modèle 2017). [F056 p.12, art. I-32 ; F001 feuille "attachement recap"]

**Feuille « facture »** :

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « STEPAG » ; « Société des Travaux d'Eau Potable, Assainissement liquide et Génie civil. » | ستيݒاݣ (ش,م,م) ; شركة أشغال الماء الصالح للشرب ، التطهير السائل والهندسة المدنية [STEPAG (SARL) ; Société des travaux d'eau potable, d'assainissement liquide et de génie civil] | en-tête, A1:C2 | texte fixe | — | — | oui (identité) | entreprise_nom | [F001 feuille "facture" A1:C2] |
| 2 | « Facture Partielle N° : FA 2610-0002 » | — | A4 | texte | — | format `FA AAMM-NNNN` | oui | facture_numero | [F001 feuille "facture" A4] |
| 3 | « Client : SRM-ORI » | — | A4 | texte | — | — | oui | client_nom | [F001 feuille "facture" A4] |
| 4 | « Oujda le 16/07/2026 » | — | A4 | date | — | — | oui (date de la facture) | facture_date | [F001 feuille "facture" A4] |
| 5 | « ice:003507258000090 » (ICE du client) | — | A5 | texte | — | — | interne | client_ice | [F001 feuille "facture" A5] |
| 6 | marché ; objet ; OS ; « Travaux executés au » ; « Entreprise: » | — | A6:B10 | lien | — | — | oui (référence du marché) | marche_numero ; os_numero ; date_arrete_travaux | [F001 feuille "facture" A6:B10] |
| 7 | « N° de prix » ; « Désignation des prestations » ; « Unité de mesure » | — | col. A ; B ; C | texte | — | — | oui | prix_numero ; prix_designation ; prix_unite | [F001 feuille "facture" A12:C12] |
| 8 | « Quantité » | — | col. D | lien | selon prix | — | oui | quantite_mois | [F001 feuille "facture" D12] |
| 9 | « Prix unitaire en DH HT » | — | col. E | nombre | DH | — | oui | prix_pu_ht | [F001 feuille "facture" E12] |
| 10 | « Prix total en DH HT » | — | col. F | nombre calculé | DH | — | oui | montant_ht | [F001 feuille "facture" F12] |
| 11 | « TOTAL ANNUEL HORS TVA » | — | F26 | nombre calculé | DH | — | oui | total_ht | [F001 feuille "facture" A26] |
| 12 | « TVA » | — | F27 | nombre calculé | DH | — | oui (TVA distincte) | tva | [F001 feuille "facture" A27] |
| 13 | « TOTAL ANNUEL TTC » | — | F28 | nombre calculé | DH | — | oui | total_ttc | [F001 feuille "facture" A28] |
| 14 | « POURCENTAGE MAJORATION (%) » | — | F29 | nombre | % | 15 | oui | taux_majoration | [F001 feuille "facture" A29] |
| 15 | « MONANT TOTAL APRES MAJORATION » | — | F30 | nombre calculé | DH | — | oui | montant_apres_majoration | [F001 feuille "facture" A30] |
| 16 | « Arrêtée la presente facture à la somme de : » | — | A32 | texte | — | — | interne | montant_en_lettres | [F001 feuille "facture" A32] |
| 17 | « Signature: » | — | D37 | signature | — | — | interne | visa_stepag | [F001 feuille "facture" D37] |
| 18 | pied : capital ; T.P ; R.C ; I.F ; CNSS ; ICE ; adresse ; e-mail générique `[comptes bancaires et téléphone non recopiés]` | — | A52:A56 | texte fixe | — | — | oui (IF, taxe professionnelle, ICE, mode de paiement) | entreprise_identifiants | [F001 feuille "facture" A52:A56] |

- **R-FICHE-015** [INTERNE] Formules de la facture : `D13 ='attachement recap'!E14` (quantité = quantité partielle de l'attachement) ; `F13 =D13*E13` ; `F26 =SUM(F13:F25)` ; `F27 =F26*0.2` ; `F28 =F26+F27` ; `F30 =F28*1.15`. La majoration est appliquée sur le total TTC. [F001 feuille "facture" D13:F30]
- **R-FICHE-016** [DÉDUIT] La facture du gabarit ne comporte ni retenue de garantie, ni pénalité, ni révision, ni arrondi, ni règle des 100 % / 40 % / 60 % des prix 1 et 2 : ces éléments relèvent du décompte dressé par la SRM (R-CPS-065) ou restent à ajouter. Les libellés « TOTAL ANNUEL » viennent du bordereau et sont impropres pour une facture partielle. [F001 feuille "facture" ; F056 p.12-13]
- **R-FICHE-017** [INTERNE] Format du numéro de facture STEPAG : `FA AAMM-NNNN` (« FA 2610-0002 » = octobre 2026, n° 0002 ; « FA2607-0002 »). [F001 feuille "facture" A4 ; feuille "B.ENVOI" B20]

**Feuille « B.ENVOI »** : bordereau d'envoi à « MONSIEUR LE DIRECTEUR GENERAL SRM -ORI » ; colonnes « DESIGNATION » ; « NBRE » ; « OBSERVATION » ; lignes « OBJET : MARCHE N°… » ; « FACTURE N° … » (5) ; « ATTACHEMENT N°… » (3). [F001 feuille "B.ENVOI" A7:D21]

### 8.5 Bordereau d'envoi (Word)

| Élément | Valeur |
|---|---|
| Nom | « BORDEREAU D'ENVOI » |
| Fichiers | [F050], [F051], [F052] ; lettre [F053] (demande de caution) |
| Usage | transmettre une pièce à un département de la SRM |
| Support ; numérotation | Word ; aucune |
| Qui signe | STEPAG |
| Statut normatif ; maturité | `[INTERNE]` ; validé (envoyé en septembre 2026), mais deux objets visent un autre marché (4500004350) `[À CONFIRMER]` |

| N° | Libellé exact FR | Libellé AR | Emplacement (page, zone) | Type | Unité | Valeurs possibles (liste 6 bis) | Obligatoire | Nom canonique (11 bis) | Source |
|---|---|---|---|---|---|---|---|---|---|
| 1 | « Oujda le 16/09/2026 » | — | haut | date | — | — | interne | envoi_date | [F051] |
| 2 | « A Monsieur le Directeur Général de la SRM-ORI » | — | adresse | texte fixe | — | — | interne | — | [F051] |
| 3 | « Destinataire : Département Financement et trésorerie » | — | adresse | choix | — | Département Financement et trésorerie ; Département achats et marchés ; Chef de département Etudes et Planification | interne | envoi_destinataire | [F051] ; [F052] ; [F050] |
| 4 | « Objet : MARCHÉ N° 4500004453 - … » | — | objet | texte | — | — | interne | marche_numero ; marche_objet | [F051] |
| 5 | « DESIGNATION » | — | tableau | texte | — | — | interne | envoi_piece | [F051] |
| 6 | « NOMBRE » | — | tableau | nombre | exemplaires | — | interne | envoi_nombre | [F051] |
| 7 | « OBSERVATION » | — | tableau | texte | — | RAS | interne | observation | [F051] |
| 8 | « Signature : » | — | bas | signature | — | — | interne | visa_stepag | [F051] |

### 8.6 Modèles absents du dossier

- **R-FICHE-018** [DÉDUIT] Aucun modèle Canva, aucune fiche en arabe, aucun modèle fourni par la SRM (état journalier, hebdomadaire, fiche de fuite, attachement, décompte) ne figure dans le dossier ; si des modèles Canva existent, en demander l'export PDF (Canva : Partager → Télécharger → PDF standard) (section 12). Le connecteur Canva disponible dans la session n'a pas été utilisé, faute de référence à un design dans le dossier. [section 1]
- **R-FICHE-019** [DÉDUIT] Aucune fiche de détection distincte de la fiche de réparation n'existe en 2026 ; en 2017 le CPS exigeait une « fiche de détection de fuites » par fuite, transmise pour réparation `[2017 : F077 art. 45]`. [F056 p.24]

## 9. Plans

**Résumé.** Le dossier contient 21 planches PDF au format A3, une par secteur, imprimées les 24, 28 et 30 septembre 2026 depuis le dessin AutoCAD « Reseau aep oujda.dwg » (162,8 Mo). Elles sont vectorielles mais sans cartouche, sans échelle, sans légende et sans coordonnées : elles ne peuvent pas être géoréférencées telles quelles. Le DWG est la source utile ; il n'a pas pu être lu (format non convertible localement). Les planches couvrent les zones 1, 2 et 4 du tableau n° 1 ; les zones 3 et 5 n'ont aucune planche.

**Principaux `[NON PRÉCISÉ]`.** Système de coordonnées du DWG (Lambert Nord Maroc / Merchich probable, à confirmer) ; échelle ; légende des couleurs ; diamètres et matériaux portés sur le dessin ; linéaire par secteur ; découpage en tournées.

### 9.1 Caractéristiques communes

| Caractéristique | Valeur | Source |
|---|---|---|
| Format | A3 (842 × 1191 points), orientation paysage | pdfinfo |
| Producteur | PScript5.dll Version 5.2.2 puis GPL Ghostscript 9.25 (impression PDF depuis AutoCAD) | pdfinfo |
| Nature | vectoriel ; 2 à 3 polices ; texte extractible ; images incrustées seulement sur F098, F100, F106, F111, F112 | pdffonts ; pdfimages |
| Cartouche, titre | aucun cartouche ; titre du secteur en bas à gauche (sauf F106) | aperçu 40 dpi |
| Échelle | `[NON PRÉCISÉ]` ; impressions à l'échelle libre (journal de traçage : 1:2.80181 ; 1:3.67785 ; 1:3.81616 ; 1:3.9207 unités de dessin) | [F118] |
| Système de coordonnées, grille | aucune coordonnée, aucune grille, aucune flèche nord (recherche de « X = », « Y = » dans le texte : rien) | pdftotext |
| Légende | aucune | aperçu 40 dpi |
| Contenu visible | parcellaire et bâti ; conduites en traits bleus, rouges et verts ; limites de secteur en pointillé magenta ; nom du secteur en grands caractères violets, parfois suivi d'un nombre (cote probable en mètres : 538 à 619 `[À CONFIRMER]`) ; références foncières « TF … » ; noms de lieux | aperçu 40 dpi ; pdftotext |
| Réseau dessiné | oui | aperçu 40 dpi |
| Exploitable pour géoréférencement | vectoriel sans coordonnées : non exploitable directement ; passer par le DWG ou caler chaque planche par 3 à 4 points de contrôle | — |

### 9.2 Planches

| ID | Fichier | Taille (octets) | Secteur (titre de la planche) | Secteurs voisins visibles | Zone du tableau n° 1 | Échelle | Format | Coordonnées ou grille | Légende | Réseau dessiné | Date d'impression | Vectoriel ou image | Géoréférencement |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F096 | abdellah guennoun bas.pdf | 376937 | Abdellah Guennoun Bas | — | 4 Sidi Yahya | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F097 | abdellah guennoun haut.pdf | 396303 | Abdellah Guennoun Haut (580) | — | 4 Sidi Yahya | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F098 | Andalous.pdf | 534924 | Andalous | Sidi Maafa Bas | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F099 | Azengot.pdf | 212961 | Azengot (575) | Château Sidi Aissa ; Maksam-Kharoub | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F100 | Ballaoui Bas-Irfane et autre part 1.pdf | 478498 | Unisit-Colline-Partie H Ain Serrak ; Bellaoui Haut | Qods Haut, Chu-Mouhoub-Irriss (619) | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F101 | Château Sidi Aissa.pdf | 228277 | Château Sidi Aissa | Lieutenant Belhoucine | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F102 | Ghar el baroud-zone indust.pdf | 588322 | Ghar El Baroud-Zone Industrielle ; El Boustane (540) | — | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F103 | lazaret bas.pdf | 297944 | Lazaret Bas (563,5) | — | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F104 | Lazaret haut part 1.pdf | 663464 | Lazaret Haut (580) | Lazaret Bas | 4 Sidi Yahya | ? | A3 | non | non | oui | 2026-09-30 | vectoriel | vectoriel sans coordonnées |
| F105 | Lazaret Haut part 2.pdf | 719283 | Lazaret Haut (suite) | Abdellah Gunoun Bas | 4 Sidi Yahya | ? | A3 | non | non | oui | 2026-09-30 | vectoriel | vectoriel sans coordonnées |
| F106 | Maafa Bekkay Bas.pdf | 1819543 | Sidi Maafa Bas (sans titre en pied) | Pam | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F107 | Maksam-Kharoub.pdf | 302689 | Maksam-Kharoub | Azengot (575) ; Abdellah… | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F108 | Mbasso.pdf | 427089 | Mbasso (556) | Aounia (552) | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F109 | pam.pdf | 287297 | Pam | — | 4 Sidi Yahya | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F111 | Qods Bas.pdf | 303140 | Qods Bas (599) | Qods Haut, Chu-Mouhoub-Irriss (619) | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F112 | Qods Haut,Chu,Mouhoub-Irriss.pdf | 580184 | Qods Haut, Chu-Mouhoub-Irriss | Qods Bas (599) ; Hay Saada | 1 Université | ? | A3 | non | non | oui | 2026-09-28 | vectoriel | vectoriel sans coordonnées |
| F113 | Sidi driss.pdf | 351501 | Sidi Driss | Mbasso (556) ; Aounia (552) | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F114 | tairet bas.pdf | 451777 | Tairet Bas (574) | Mbasso (556) ; Tairet Haut ; Belhoucine | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F115 | tairet haut.pdf | 400689 | Tairet Haut | Lieutenant Belhoucine ; Maksam-Kharoub | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F116 | Tazaghine.pdf | 1043706 | Tazaghine | Tennis 2 (541,5) ; Lazaret Bas (563,5) ; Lazaret Haut (580) ; Abdellah Gunoun Bas | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |
| F117 | Tennis 2.pdf | 233989 | Tennis 2 (541,5) | Tennis 1 (538) | 2 Jbel Hamra DN700 | ? | A3 | non | non | oui | 2026-09-24 | vectoriel | vectoriel sans coordonnées |

### 9.3 Autres fichiers de plans

| ID | Fichier | Taille (octets) | Nature | Exploitation |
|---|---|---|---|---|
| F125 | Reseau aep oujda.dwg | 162838568 | dessin AutoCAD du réseau AEP d'Oujda, source des planches | non lu : DWG non lisible sans conversion ; demander un export DXF (ou GeoJSON) avec le système de coordonnées (section 12) |
| F124 | Reseau aep oujda.bak | 162845162 | sauvegarde AutoCAD du même dessin | non lu |
| F126 ; F127 | Reseau aep oujda.dwl ; .dwl2 | 55 ; 205 | verrous AutoCAD (poste DELL, 2026-10-02 15:34:21) | sans contenu métier |
| F118 | plot.log | 831 | journal de 4 impressions A3 du DWG le 2026-10-02 (15:05 à 15:36) | donne les échelles d'impression |
| F110 | plans.rar | 10533325 | archive contenant les mêmes 21 PDF (mêmes noms et tailles) | doublon, non relu |

### 9.4 Synthèse de la couverture

| Zone du tableau n° 1 | Secteurs avec planche | Secteurs sans planche |
|---|---|---|
| 1 Université 7000 m3 et champ de tir | Qods Haut, Chu-Mouhoub-Irriss (F112) ; Andalous (F098) ; Maafa Bekay Bas (F106) ; Ballaoui Bas-Irfane, Unisit-Colline-Partie H Ain Serrak (F100, « part 1 ») ; Qods Bas (F111) ; Château Sidi Aissa (F101) ; Azengot (F099) ; Maksam-Kharoub (F107) | suite de Ballaoui Bas-Irfane (« part 2 » absente) |
| 2 Jbel Hamra DN700 | Lazaret Bas (F103) ; Tairet Bas (F114) ; Tairet Haut (F115) ; Mbasso (F108) ; Tennis 2 (F117) ; Sidi Driss (F113) ; Tazaghine (F116) ; Ghar El Baroud-Zone Industrielle et El Boustane (F102) | — |
| 3 Réservoir Ain Serrak 5000 m3 | — | tous : Derfoufi et Zerktouni ; Mohammadi Intérieur ; Allal Ben Abdellah ; Oued Makhazine ; Mauritanie et Hassani ; Mohammadi Extérieur ; Benkhirane |
| 4 Sidi Yahya 5000 m3 et 4000 m3 | Pam (F109) ; Lazaret Haut (F104, F105) ; Abdellah Guenoun Bas (F096) et Haut (F097) | Sidi Yahya |
| 5 Jbel Hamra DN600 | — | tous : Medina ; Rte Algérie ; Tennis 1 ; Aounia ; Atlas ; Lieutenant Belhoucine ; Boudir |

- **R-PLAN-001** [CONTRACTUEL] La SRM fournit les plans de réseau disponibles « sous format Papier/Autocad » ; ils sont à restituer avant la réception définitive. [F056 p.27, art. II-29]
- **R-PLAN-002** [CONTRACTUEL] Les fuites détectées sont implantées sur un plan « à une échelle appropriée » ; chaque rapport journalier comporte un extrait de plan au format A4 ; le report final des fuites sur plans est remis sur papier et sur support informatique. [F056 p.22, art. II-18 ; p.24, art. II-21 ; p.27, art. II-30]
- **R-PLAN-003** [DÉDUIT] Les planches découpent le réseau par secteur hydraulique (limites en pointillé magenta) ; ce découpage est celui du tableau n° 1, avec des subdivisions « Bas » / « Haut » et « part 1 » / « part 2 » propres aux tirages. Il n'existe dans le dossier aucun découpage en tournées ; la « tournée » des fiches est une référence d'abonné (section 10 bis). [F096 à F117]
- **R-PLAN-004** [DÉDUIT] Orthographes concurrentes d'un même secteur à normaliser : Guenoun / Guennoun / Gunoun ; Maafa Bekay / Maafa Bekkay / Sidi Maafa ; Ballaoui / Bellaoui ; Iriss / Irriss ; Tairet (CPS) / Tairet Bas et Tairet Haut (planches). [F056 p.18 ; F096 à F117]
- **R-PLAN-005** [DÉDUIT] Pour la carte de l'application : privilégier l'export du DWG en DXF puis GeoJSON (conduites, limites de secteur, noms) avec conversion du système de coordonnées vers WGS84 ; à défaut, utiliser les planches comme simple fond de référence calé par points de contrôle. Le linéaire par secteur, nécessaire au suivi du prix 1, devra être calculé à partir de ce dessin `[À CONFIRMER avec la SRM]`. [F125 ; F056 p.18-19]

## 10. Glossaire

**Résumé.** Termes et abréviations du marché, de la SRM et des gabarits STEPAG, avec leur définition telle qu'elle ressort des documents. Les documents sont rédigés en français ; les seuls textes arabes sont des en-têtes (raison sociale de la SRM et de STEPAG) et des pièces administratives bilingues.

**Principaux `[NON PRÉCISÉ]`.** Signification officielle des trois blocs de la référence `NNN-NNN-NNN` ; sens de « 7000m3 », « 5000M3 », « DN700 » dans les noms de zone ; sens de « B.I ».

### 10.1 Termes et abréviations

| Terme ou abréviation | Libellé AR | Définition | Statut | Source |
|---|---|---|---|---|
| SRM-ORI ; SRM-Ori ; SRM Oriental ; S.R.M | الشركة الجهوية متعددة الخدمات الشرق ش.م [Société Régionale Multiservices de l'Oriental S.A] | Société Régionale Multiservices L'Oriental S.A, maître d'ouvrage | CONTRACTUEL | [F056 p.1] ; [F036 p.1] |
| RADEEO ; R.A.D.E.E.O | الوكالة المستقلة الجماعية لتوزيع الماء والكهرباء بوجدة [Régie autonome intercommunale de distribution d'eau et d'électricité d'Oujda] | ancienne régie d'Oujda, maître d'ouvrage du marché de 2017 | 2017 | [F016 p.1] ; [F077] |
| STEPAG | ستيݒاݣ (ش,م,م) [STEPAG (SARL)] | Société des Travaux d'Eau Potable, Assainissement liquide et Génie civil ; titulaire | CONTRACTUEL | [F040 p.1] ; [F001 feuille "facture" C1] |
| AFW | — | AFFAIR OF THE WATER SARL, titulaire du marché de 2017 dont STEPAG était sous-traitant | 2017 | [F077] ; [F067] |
| AO ; AOO | — | appel d'offres (ouvert) ; ici n° 10008883/1R | CONTRACTUEL | [F039 p.1] |
| DAO | — | dossier d'appel d'offres | CONTRACTUEL | [F054] |
| RC | — | règlement de consultation (aussi : registre de commerce) | CONTRACTUEL | [F054] |
| CPS | — | cahier des prescriptions spéciales | CONTRACTUEL | [F056] |
| CCAG-T ; CCAG-Travaux | — | cahier des clauses administratives générales applicables aux marchés de travaux (décret n° 2-14-394 du 13 mai 2016) | CONTRACTUEL | [F056 p.3] |
| BP ; bordereau des prix – détail estimatif | — | tableau des 13 prix, quantités et prix unitaires | CONTRACTUEL | [F032] |
| OS ; O.S | — | ordre de service ; écrit, daté, numéroté, inscrit au registre du marché | CONTRACTUEL | [F056 p.8] |
| Maître d'ouvrage ; MO | — | la SRM-ORI | CONTRACTUEL | [F056 p.2] |
| Entrepreneur ; entreprise ; titulaire ; société ; adjudicataire ; soumissionnaire | — | STEPAG (le CPS emploie ces termes indifféremment) | CONTRACTUEL | [F056 p.2] |
| Agent chargé du suivi de l'exécution du marché | — | agent de la SRM désigné par OS, qui dresse les décomptes | CONTRACTUEL | [F056 p.4] |
| Rabais ; majoration | — | pourcentage unique offert par le concurrent sur l'estimation de la SRM ; ici majoration de 15 % | CONTRACTUEL | [F054 p.10] ; [F040 p.1] |
| Balayage | — | inspection systématique de l'ensemble des conduites des secteurs par les moyens de détection ; phase de 4 mois ; prix 1 | CONTRACTUEL | [F056 p.17 ; p.28] |
| Maintien des résultats ; maintien des performances ; maintien des gains | — | période de 8 mois (2 × 4) après le balayage, pendant laquelle les débits nocturnes atteints doivent être conservés ; prix 2 | CONTRACTUEL | [F056 p.17 ; p.28] |
| Zone d'intervention | — | regroupement de secteurs alimentés par un même réservoir ou une même conduite ; 5 zones | CONTRACTUEL | [F056 p.18-19] |
| Secteur ; secteur hydraulique ; secteur d'intervention | — | partie du réseau identifiée par des points de mesure de débit ; unité de balayage et de contrôle | CONTRACTUEL | [F056 p.21] |
| Sectorisation | — | découpage du réseau en secteurs isolés par des vannes de séparation, dont l'étanchéité est vérifiée | CONTRACTUEL | [F056 p.22] |
| Débit nocturne minimum ; débit de nuit | — | plus petit débit mesuré entre 0 h et 6 h (pas de 15 minutes) à l'entrée d'un secteur ; indicateur de fuites | CONTRACTUEL | [F056 p.22] |
| Qi | — | débit de nuit avant intervention : minimum des minimums de trois nuits | CONTRACTUEL | [F056 p.22] |
| Qf | — | débit de nuit après intervention : minimum des minimums de trois nuits après le balayage | CONTRACTUEL | [F056 p.24] |
| ΔQ | — | volume récupéré : Qi − Qf, en m3/h | CONTRACTUEL | [F056 p.24] |
| Q exigé | — | débit nocturne minimum à assurer à l'achèvement du balayage, par zone (tableau n° 1) | CONTRACTUEL | [F056 p.18] |
| Q réal | — | débit nocturne minimum réalisé par l'entreprise à la fin du balayage | CONTRACTUEL | [F056 p.25] |
| Q exigé à maintenir | — | égal au Q réal de fin de balayage | CONTRACTUEL | [F056 p.25] |
| Q réal maintien | — | moyenne des débits minimums hebdomadaires mesurés pendant le maintien | CONTRACTUEL | [F056 p.25] |
| τ1 ; τ2 | — | écarts relatifs (en %) entre débit exigé et débit réalisé, pour le balayage et pour le maintien ; négatifs quand l'objectif n'est pas atteint | CONTRACTUEL | [F056 p.25] |
| Gain | — | baisse du débit nocturne obtenue par la campagne | CONTRACTUEL | [F056 p.21] |
| Télégestion ; télé-relève | — | système de la SRM qui relève à distance les compteurs de secteur ; source des mesures de débit | CONTRACTUEL | [F056 p.21-22] |
| Corrélateur acoustique ; corrélation | — | appareil et méthode de localisation d'une fuite entre deux capteurs | CONTRACTUEL | [F056 p.22 ; p.26] |
| Pré-localisateur ; capteur enregistreur de bruit | — | enregistreur posé sur le réseau qui signale une zone d'influence contenant une fuite | CONTRACTUEL | [F056 p.21 ; p.26] |
| Détecteur de fuites acoustique | — | appareil d'écoute au sol (ex. Aquaphone) | CONTRACTUEL | [F056 p.26] ; [F122] |
| Fuite | — | fuite proprement dite, ou découverte d'un élément inconnu de la SRM (ex. branchement clandestin) | CONTRACTUEL | [F056 p.25] |
| Fuite visible ; fuite invisible | — | fuite apparente en surface ; fuite trouvée par détection | CONTRACTUEL | [F056 p.25] |
| Sondage | — | fouille de vérification ; « sondage négatif » : fouille ne révélant pas de fuite | CONTRACTUEL (mot) ; INTERNE (motif) | [F032 p.1] ; [F001 feuille "LISTE"] |
| Tranchée ; fouille | — | terrassement ouvert au droit de la fuite | CONTRACTUEL | [F056 p.23 ; p.28] |
| Conduite ; CDT ; Cdt | — | canalisation du réseau de distribution | CONTRACTUEL ; abréviation INTERNE | [F056] ; [F121] |
| Branchement ; BRT ; Brt ; Bt | — | liaison entre la conduite et le compteur de l'abonné | CONTRACTUEL ; abréviation INTERNE | [F056 p.29] ; [F121] ; [F123] |
| Extension | — | prolongement du réseau en polyéthylène | CONTRACTUEL | [F056 p.28] |
| PEC ; robinet de prise en charge ; collier de prise en charge | — | organe de piquage du branchement sur la conduite | CONTRACTUEL | [F032 p.1] ; [F056 p.29] |
| Collier Astor | — | collier fixé sur tuyau polyéthylène | CONTRACTUEL | [F056 p.29] |
| Raccord | — | toute pièce d'un branchement ou d'une extension en polyéthylène, du robinet de PEC ou du collier jusqu'à la niche du compteur, hors robinet cache-entrée et raccords standard du compteur | CONTRACTUEL | [F056 p.29] |
| Robinet cache-entrée | — | robinet situé avant le compteur, exclu des prix 6 à 9 | CONTRACTUEL | [F056 p.29] |
| Niche du compteur | — | logement du compteur de l'abonné ; limite aval des réparations de branchement | CONTRACTUEL | [F056 p.29] |
| Bouche à clé ; tabernacle ; tube allonge | — | ensemble donnant accès depuis la surface au robinet enterré | CONTRACTUEL | [F032 p.1] |
| Joint gibault ; joint dissymétrique | — | pièces de jonction pour réparer une conduite (diamètres égaux ; diamètres différents) | CONTRACTUEL | [F032 p.1] |
| AC | — | amiante-ciment (matériau de conduite) ; aussi « Asphalt à chaud » (symbole de réfection) | CONTRACTUEL ; INTERNE | [F032 p.1] ; [F001 feuille "REFECTION"] |
| PVC | — | polychlorure de vinyle (matériau de conduite) | CONTRACTUEL | [F032 p.1] |
| PE ; PEHD | — | polyéthylène (haute densité) | CONTRACTUEL ; INTERNE | [F032 p.1] ; [F001] |
| DN | — | diamètre nominal, en mm | CONTRACTUEL | [F056 p.18] |
| Calibre | — | diamètre de la canalisation prospectée (rapport journalier) | INTERNE | [F119 E15] |
| GNA | — | grave non traitée de type A (« tout venant GNA ») | CONTRACTUEL | [F056 p.23] |
| Cut back | — | bitume fluidifié utilisé en couche d'imprégnation | CONTRACTUEL | [F056 p.23] |
| Enrobé à chaud ; enrobé-résine à froid | — | revêtements de chaussée (7 cm à chaud ; à froid si la réfection dépasse un mois) | CONTRACTUEL | [F056 p.23-24] |
| Granito lavé ; mosaïque ; carreaux ciment | — | revêtements de trottoir | CONTRACTUEL | [F032 p.1] |
| Nature de dégradation | — | revêtement démoli par la fouille, à refaire | INTERNE | [F001] |
| Symbole | — | code du revêtement refait : B, M, L, C, AC, TN | INTERNE | [F001 feuille "REFECTION" H14] |
| Réfection | — | remise en état du trottoir ou de la chaussée après réparation | CONTRACTUEL | [F056 p.23] |
| Tournée | — | dans les gabarits : référence SRM de l'abonné ou du point de livraison au format `NNN-NNN-NNN` (pas une tournée de travail) | INTERNE | [F001] ; [F123 B8] |
| Référence ; Réf ; Adresse ou Référence | — | même donnée que « Tournée » | INTERNE | [F119 B14] ; [F121 A14] |
| Attachement | — | relevé contradictoire des quantités exécutées, par numéro de prix | CONTRACTUEL | [F056 p.12] |
| Décompte provisoire ; décompte général définitif (DGD) | — | état des sommes dues dressé par l'agent de suivi à partir des attachements ; décompte final | CONTRACTUEL | [F056 p.12] |
| Acompte | — | paiement fait sur la base d'un décompte provisoire | CONTRACTUEL | [F056 p.9 ; p.12] |
| Retenue de garantie | — | 10 % de chaque acompte, plafonnée à 7 % du marché | CONTRACTUEL | [F056 p.9] |
| Cautionnement provisoire ; cautionnement définitif | — | garanties bancaires de l'offre (40 000 DH) et de l'exécution (3 %, 155 760 DH) | CONTRACTUEL | [F056 p.9] ; [F035 p.1] |
| Réception provisoire ; réception définitive | — | constat d'achèvement ; constat de fin de garantie (12 mois après) | CONTRACTUEL | [F056 p.9-10] |
| Révision des prix | — | ajustement des prix selon des index officiels (formules a et b) | CONTRACTUEL | [F056 p.10] |
| Bureau d'ordre | — | service de la SRM où les factures sont déposées | CONTRACTUEL | [F056 p.13] |
| EPI | — | équipements de protection individuels | CONTRACTUEL | [F056 p.14 ; p.26] |
| ICE ; IF ; TP ; CNSS | — | identifiant commun de l'entreprise ; identifiant fiscal ; taxe professionnelle ; Caisse nationale de sécurité sociale | CONTRACTUEL | [F056 p.12] ; [F040 p.1] |
| TF | — | titre foncier (mention portée sur les planches) | référence externe | [F098] |
| B.I | — | bouche d'incendie `[À CONFIRMER]` | INTERNE | [F122 I14] |
| BS ; bon de sortie | — | bon de sortie du magasin de la régie pour les pièces fournies | 2017 | [F065 feuille "Détail BS"] |
| Repasse | — | second passage de détection sur un secteur déjà balayé (non rémunéré) | 2017 | [F065 feuille "Linéaire prospecté"] |
| RP (suffixe de pièce) ; R, bis (suffixes de numéro de fuite) | — | `[À CONFIRMER : sens non écrit]` | 2017 | [F065] |
| SY4000 ; RJ5000 ; JH600 | — | zones de 2017 : Sidi Yahya 4000+750 ; Route Jerada 5000 ; Jbel Hemra DN600 | 2017 | [F068] |
| FINEA | — | organisme ayant délivré les cautions | référence externe | [F002 p.1] |

### 10.2 Équivalences d'unités et d'écritures

| Écriture rencontrée | Code normalisé | Sens | Source |
|---|---|---|---|
| M ; ml ; « mètre linéaire » ; « DH/ mètre balayé » | ml | mètre linéaire | [F032 p.1] ; [F056 p.28] |
| Km ; KM ; km ; « Km linéaire » | km (= 1000 ml) | kilomètre de réseau (tableau n° 1, rapports) | [F056 p.18] ; [F121 D10] |
| M2 ; m2 ; m² ; « mètre carré » | m2 | mètre carré | [F032 p.1] ; [F056 p.28] |
| M3 ; m3 ; « mètre cube » ; « L'Unité = Le Mètre Cube » | m3 | mètre cube | [F032 p.1] |
| U ; « l'unité » | u | unité | [F032 p.1] ; [F056 p.29] |
| m3/h | m3_h | débit | [F056 p.18] |
| mm ; « MM » | mm | diamètre | [F032 p.1] ; [F056 p.29] |
| DH ; dhs ; Dhs ; DHS ; dirhams | MAD | dirham marocain | [F032 p.1] ; [F040 p.1] |
| DH/Jour ; DH/jour | MAD_j | pénalité journalière | [F056 p.14] |
| Km.j | km_j | kilomètres par jour (ratio du rapport mensuel) | [F122 A18] |
| 1.466.000 ; 1466000 ; 1466 km | 1466000 ml | linéaire total du marché | [F032 p.1] ; [F056 p.19] |
| 4 Kms/jour/équipe | 4000 ml par jour et par équipe | cadence minimale | [F056 p.23] |
| 45000004453 | 4500004453 | numéro du marché (coquille des gabarits) | [F001] ; [F035 p.1] |

## 10 bis. Identifiants, références et numérotations

**Résumé.** Les seules références dont le format est établi par des exemples réels sont : le numéro de marché, le numéro d'appel d'offres, les numéros d'ordre de service, la référence SRM `NNN-NNN-NNN` (appelée « Tournée » ou « Référence ») et le numéro de facture STEPAG. Le numéro de fuite est un simple compteur. Aucune autre numérotation n'est imposée par le CPS.

**Principaux `[NON PRÉCISÉ]`.** Signification et émetteur exact de la référence `NNN-NNN-NNN` ; numéros de bon de travail, d'avis SAP, de police, de compteur ; code de secteur ; numéro de marquage au sol ; numérotation officielle des attachements et des décomptes ; portée d'unicité du numéro de fuite (par zone, par marché).

| Référence | Émetteur | Format exact ou motif | Exemples réels (3 au moins) | Portée d'unicité | Qui l'attribue et quand | Obligatoire sur quels documents | Source |
|---|---|---|---|---|---|---|---|
| Numéro du marché | SRM-ORI (SAP) | `^45\d{8}$` (10 chiffres) | 4500004453 ; 4500000150 ; 4500003179 | SRM | SRM, à l'approbation du marché | facture et attachement (« référence du marché ») ; ordres de service | [F035 p.1] ; [F027 p.1] ; [F056 p.11-12] |
| Numéro de l'appel d'offres | SRM-ORI | `^\d{8}(/\dR)?$` | 10008883/1R ; 10009837 ; 10010170 | SRM | SRM, au lancement | CPS, RC, bordereau, acte d'engagement | [F039 p.1] ; [F056 p.1] |
| Numéro d'ordre de service | SRM-ORI | `NN/<numéro du marché>` ; au registre : `NN/<numéro du marché>/AAAA` | 01/4500004453 ; 02/4500004453 ; 01/4500004453/2026 | marché | SRM, à chaque OS | attachement (« référence de l'ordre de service correspondant ») | [F035 p.1] ; [F036 p.1] ; [F056 p.12] |
| Numéro d'ordre de service `[2017]` | RADEEO | `NNN/AAAA` | 285/2016 ; 286/2016 ; 287/2016 ; 288/2016 | régie | un OS global puis un OS partiel par zone | décompte, facture, fiche de suivi du délai | [F073] ; [F069] |
| Référence SRM de la fuite (« Tournée » ; « Référence » ; « Réf » ; « Adresse ou Référence ») | SRM-ORI `[À CONFIRMER : référence d'abonné ou de point de livraison de la liste des branchements]` | `^\d{3}-\d{3}-\d{3}$` (zéros initiaux conservés, texte) | 302-684-001 ; 040-152-010 ; 461-229-057 ; 075-169-010 ; 513-157-010 ; 2017 : 037-409-020 | non unique par fuite (une même référence peut porter deux fuites) | relevée par l'agent de détection sur place (compteur ou liste des branchements) | rapport journalier (adresse), fiche de réparation, attachement détaillé | [F001] ; [F119] ; [F123] ; [F065] |
| Numéro de fuite | STEPAG | entier séquentiel à partir de 1 ; `[2017]` suffixes « bis » et « R » | 1 ; 2 ; 22 ; 2017 : 109 bis ; 309 R | `[NON PRÉCISÉ]` ; en 2017 unique sur tout le chantier ; en 2026 le classeur est par zone | STEPAG, à la détection | fiche de réparation, rapport journalier, attachement | [F001] ; [F087] ; [F065] |
| Numéro de zone | SRM-ORI | entier 1 à 5 | 1 ; 4 ; 5 | marché | tableau n° 1 du CPS | rapports, attachement (« Zone ») | [F056 p.18-19] |
| Code de secteur | — | `[NON PRÉCISÉ]` : le secteur est désigné par son nom | Lazaret Haut ; Abdellah Guenoun ; Qods Bas | marché | tableau n° 1 du CPS | rapport journalier | [F056 p.18] ; [F119 F9] |
| Zone de distribution ; étage de pression | — | `[NON PRÉCISÉ]` ; nombres portés sur les planches à côté du nom de secteur | 580 ; 563,5 ; 541,5 | — | — | — | [F103] ; [F104] ; [F117] |
| Quartier | — | `[NON PRÉCISÉ]` | — | — | — | — | — |
| Numéro d'équipe | STEPAG | entier 1 à 4 | 1 ; 2 ; 3 ; 4 | marché | STEPAG | rapport journalier (« EQUIPE N° ») | [F119 A8] ; [F056 p.23] |
| Numéro de planche | STEPAG | `[NON PRÉCISÉ]` ; les planches sont nommées par secteur ; « Planche N° » prévu mais jamais rempli en 2017 | Lazaret Bas ; Tennis 2 ; Azengot | — | — | — | [F096 à F117] ; [F087] |
| Numéro d'attachement | STEPAG | `N°NN` | ATTACHEMENT N°01 ; ATTACHEMENT N°12 (autre marché) ; 2017 : attachement n° 1 | marché | STEPAG, à chaque attachement | attachement ; bordereau d'envoi | [F001 feuille "attachement recap" A7] ; [F001 feuille "B.ENVOI" B21] |
| Numéro de décompte | SRM-ORI | `[NON PRÉCISÉ]` ; 2017 : « Décompte provisoire n°1 » | 2017 : n° 01 ; n°1 | marché | agent chargé du suivi | décompte | [F068 feuille "decompte" A13] |
| Numéro de facture STEPAG | STEPAG | `^FA ?\d{4}-\d{4}$` (FA + année sur 2 chiffres + mois + numéro d'ordre) | FA 2610-0002 ; FA2607-0002 | STEPAG | STEPAG, à l'émission | facture ; bordereau d'envoi | [F001 feuille "facture" A4] ; [F001 feuille "B.ENVOI" B20] |
| Numéro de facture `[2017]` | AFW | `NN/AAAA/AT N` | 18/2017/AT 1 | AFW | AFW | facture, état de suivi, fiche de suivi du délai | [F072] ; [F073] |
| Numéro de bon de sortie (BS) `[2017]` | RADEEO (magasin) | entier de 5 ou 6 chiffres | 553552 ; 67001 ; 569442 | régie | magasin de la régie | détail des mouvements de matériel | [F065 feuille "Détail BS"] |
| Numéro de prix | SRM-ORI | `00001` à `00013` (bordereau) ; `1` à `13` (gabarits) | 00001 ; 00006 ; 00013 | marché | bordereau | attachement, décompte, facture | [F032 p.1] |
| Référence de courrier SRM | SRM-ORI | `NNNN/AAAA` (manuscrit) | 1132/2026 | SRM | bureau d'ordre | courriers | [F037 p.1] |
| Numéro de caution | FINEA | entier à 6 chiffres | 230197 ; 231882 | FINEA | organisme | cautions | [F002 p.1] ; [F051] |
| Bon de commande ; bon ou ordre de travail ; avis SAP | — | `[NON PRÉCISÉ]` (en 2017 l'attachement prévoyait « N° de travail » et « Projet N° », vides) | — | — | — | — | [F065 feuille "attach recap" C6:C8] |
| Numéro de police ou d'abonné ; numéro de compteur | — | `[NON PRÉCISÉ]` (voir référence SRM de la fuite) | — | — | — | — | — |
| Numéro de fiche STEPAG ; numéro de fiche SRM | — | `[NON PRÉCISÉ]` : aucune fiche n'est numérotée | — | — | — | — | [F123] |
| Numéro de marquage au sol | — | `[NON PRÉCISÉ]` | — | — | — | — | — |
| Numéro d'engagement ; code fournisseur | — | `[NON PRÉCISÉ]` | — | — | — | — | — |

- **R-IDF-001** [INTERNE] La référence `NNN-NNN-NNN` est la clé de rapprochement entre le rapport journalier (colonne « Adresse ou Référence »), la fiche de réparation (« Tournée ») et la feuille de réfection (« Référence ») ; les gabarits signalent les doublons par mise en forme conditionnelle mais ne les interdisent pas. [F001 feuille "Fiche de réparation Zone " B12:B13 ; F121 A16:A20]
- **R-IDF-002** [DÉDUIT] Les préfixes observés semblent liés au secteur (302-… et 03x-… à Lazaret Haut ; 040-… et 40x-… à Abdellah Guenoun ; 461-… à Lazaret Bas) : le premier bloc serait un code de tournée de relève, le deuxième un rang, le troisième un indice `[À CONFIRMER auprès de la SRM]`. [F119 ; F120 ; F123]
- **R-IDF-003** [DÉDUIT] Clé proposée d'une fuite dans l'application : identifiant interne unique + numéro de fuite séquentiel par marché (affiché) + référence SRM (non unique) ; le couple (référence SRM, date de détection) sert de contrôle de doublon. [F001 ; F065 § 8]
- **R-IDF-004** [CONTRACTUEL] Mentions de référence obligatoires : sur l'attachement, la référence du marché et celle de l'ordre de service ; sur la facture, la référence du marché. [F056 p.11-12, art. I-32]

## 11. Règles dérivées pour l'application

**Résumé.** Synthèse orientée développement. Le marché impose à l'application trois axes que le cadrage initial ne prévoyait pas : (1) le **balayage au mètre linéaire** par secteur et par équipe, avec cadence minimale ; (2) le **suivi des débits nocturnes** par zone, dont dépendent les pénalités et l'arrêt éventuel d'une zone ; (3) un **phasage** balayage / maintien 1 / maintien 2 qui gouverne la facturation. Le cycle de vie de la fuite reste central pour les réparations, les réfections et l'attachement. Toutes les règles ci-dessous sont `[DÉDUIT]` et renvoient à leurs sources.

**Principaux `[NON PRÉCISÉ]`.** Délai de réparation contractuel ; contenu des photos ; format des exports ; règle d'affectation des pièces aux prix ; arrondis ; assiette HT ou TTC des pénalités.

### 11.1 Cycle de vie de la fuite (tableau de transitions)

| État de départ | Événement | Acteur (fonction exacte) | Document ou visa produit | Données obligatoires à cet instant (noms canoniques) | Délai déclenché (ID) | État d'arrivée | Statut de l'état | Source |
|---|---|---|---|---|---|---|---|---|
| — | détection et localisation pendant le balayage ou le maintien | agent de détection STEPAG (équipe n° 1 à 4) | ligne du rapport journalier | secteur_id ; rapport_date ; fuite_numero ; reference_srm ; fuite_adresse ; fuite_visibilite ; position_fuite ; date_detection | R-CPS-131 (communication le jour même) | detectee | INTERNE | [F056 p.23] ; [F119] |
| detectee | communication à la SRM pour validation | bureau STEPAG | rapport journalier remis | date_communication_srm | — | communiquee_srm | CONTRACTUEL | [F056 p.23, art. II-19 NB] |
| communiquee_srm | avis préalable de la SRM avant terrassement | représentant de la SRM-ORI | [NON PRÉCISÉ] | avis_terrassement_srm | — | a_reparer | CONTRACTUEL | [F056 p.26, art. II-27] |
| a_reparer | ouverture de la tranchée, fuite constatée | équipe de réparation STEPAG + représentant de la SRM-ORI | constat contradictoire | validation_srm ; ouvrage_touche ; conduite_materiau ; conduite_dn_mm ; fouille_longueur_m ; fouille_largeur_m ; fouille_profondeur_m ; nature_revetement | — | confirmee | CONTRACTUEL | [F056 p.22-23] ; [F056 p.25] |
| a_reparer | ouverture de la tranchée, aucune fuite | équipe de réparation STEPAG + représentant de la SRM-ORI | mention sur la fiche [NON PRÉCISÉ] | motif_sans_reparation = sondage_negatif ; dimensions de la fouille | reprise de la prospection (R-CPS-127) | sondage_negatif | CONTRACTUEL (fait) ; INTERNE (libellé) | [F056 p.23] ; [F001 feuille "LISTE"] |
| a_reparer | refus de l'abonné ; fuite d'assainissement ; réparation par la SRM | équipe de réparation STEPAG | observation | motif_sans_reparation ; observation | — | classee_sans_reparation | INTERNE ; 2017 | [F001 feuille "LISTE"] ; [F065] |
| confirmee | réparation | équipe de réparation STEPAG | « Fiche de réparation de fuites » signée par l'entreprise, copie à la SRM | date_reparation ; piece_designation ; piece_quantite ; longueur_pe_m ; visa_stepag | R-CPS-134 (réfection de chaussée sous 1 mois) | reparee_a_refectionner | CONTRACTUEL (fiche) ; INTERNE (état) | [F056 p.23-24] |
| reparee_a_refectionner | réfection du trottoir ou de la chaussée | équipe de réfection STEPAG | symbole de réfection saisi ; essai de carottage pour la chaussée | date_refection ; symbole_refection ; surface_refection_m2 ; type_enrobe | — | achevee | INTERNE | [F056 p.23-24] ; [F001 feuille "REFECTION"] |
| reparee_a_refectionner | terrain naturel (pas de réfection) | équipe de réparation STEPAG | — | symbole_refection = TN | — | achevee | INTERNE | [F001 feuille "REFECTION" N14] |
| achevee | constat contradictoire des quantités | représentant de la SRM-ORI + STEPAG | attachement visé « SRM.ORI » et « Sté STEPAG » | quantités par prix ; visa_srm ; visa_stepag | — | attachee | CONTRACTUEL | [F056 p.12-13] |
| attachee | facturation de la période | bureau STEPAG ; agent chargé du suivi (décompte) | facture ; décompte provisoire | facture_numero ; facture_date ; facture_date_depot | R-CPS-062 (paiement sous 90 jours) | facturee | CONTRACTUEL | [F056 p.11-13] |
| achevee, attachee ou facturee | fuite réapparue au même point (garantie) | SRM ou STEPAG | [NON PRÉCISÉ] | lien vers la réparation d'origine | — | reprise_sous_garantie | CONTRACTUEL (principe) | [F056 p.10, art. I-28] |
| reparee_a_refectionner | essai de chaussée non conforme | laboratoire ; SRM | résultat d'essai | essai_carottage_resultat | reprise + pénalité R-CPS-138 | reparee_a_refectionner | CONTRACTUEL | [F056 p.24] |

- **R-DER-001** [DÉDUIT] Rapprochement avec les trois statuts du cadrage de l'application : « Détectée, non réparée » = detectee, communiquee_srm, a_reparer, confirmee ; « Réparation en cours / reste à finir » = reparee_a_refectionner ; « Achevée » = achevee, attachee, facturee. Écarts : le cadrage ignore la validation par la SRM, le sondage négatif, les classements sans réparation, l'attachement et la reprise sous garantie ; à ajouter comme sous-états ou champs. [F056 p.22-24 ; CLAUDE.md du dépôt]
- **R-DER-002** [DÉDUIT] Aucun état n'est défini par le CPS ; seuls des faits contractuels existent (communication le jour même, tranchée ouverte en présence de la SRM, fiche signée, réfection sous un mois, attachement contradictoire). Les libellés d'états sont donc `[INTERNE]`. [F056 p.23-24]

### 11.2 Données à saisir à chaque étape

| Étape | Qui | Données (noms canoniques) | Contrôles à la saisie | Source |
|---|---|---|---|---|
| Paramétrage du marché | administrateur STEPAG | marche_numero ; ao_numero ; marche_objet ; taux_majoration ; taux_tva ; date_commencement ; delai_execution_mois ; os_numero ; os_date ; 13 prix ; 5 zones ; secteurs ; équipes | numéro de marché à 10 chiffres ; somme des linéaires = 1466 km | sections 2, 4, 6 bis |
| Journée de balayage | agent de détection | rapport_date ; equipe_numero ; secteur_id ; lineaire_inspecte_m (tracé ou saisie) ; equipements_utilises ; tracé GPS | secteur de la zone ; linéaire > 0 ; cumul du secteur ≤ linéaire du secteur | [F056 p.24] |
| Détection d'une fuite | agent de détection | fuite_numero (automatique) ; reference_srm ; fuite_adresse ; position_fuite ; fuite_visibilite ; photo ; date_detection | format `NNN-NNN-NNN` ; doublon de référence signalé | [F056 p.24-25] ; [F001] |
| Ouverture et réparation | équipe de réparation | validation_srm ; ouvrage_touche ; conduite_materiau ; conduite_dn_mm ; dimensions de fouille ; nature_revetement ; pièces et quantités ; longueur_pe_m ; date_reparation ; photos ; motif_sans_reparation | longueur de fouille ≤ 2 m sauf remplacement d'élément ; longueur PE ≤ 2 m ; date de réparation ≥ date de détection | [F056 p.25 ; p.28] ; [F032 p.1] |
| Réfection | équipe de réfection | date_refection ; symbole_refection ; type_enrobe ; photos | date ≥ date de réparation ; si chaussée et délai > 1 mois : type_enrobe = resine_a_froid | [F056 p.23-24] |
| Mesures de débit | bureau STEPAG (d'après la télégestion SRM) | mesure_debit_campagne ; zone_id ; date et heure ; valeur ; PV signé | 25 mesures par nuit ; 3 nuits ; intervalle entre contrôles ≤ 7 jours | [F056 p.21-22 ; p.24] |
| Clôture du mois | bureau STEPAG | date_arrete_travaux ; attachement_numero ; lignes validées | fuite attachée une seule fois ; quantités ≥ 0 | [F001] |

### 11.3 Calculs et unités

- **R-DER-003** [DÉDUIT] Prix 1 : quantité = somme des linéaires inspectés pendant le balayage, chaque tronçon compté une fois, branchements exclus, en mètres ; plafonner le suivi par secteur au linéaire du secteur. [R-DEF-001 ; R-DEF-003 ; R-DEF-004]
- **R-DER-004** [DÉDUIT] Prix 2 : quantité = linéaire des secteurs maintenus, facturable à 40 % puis 60 %. [R-DEF-007 ; R-DEF-008]
- **R-DER-005** [DÉDUIT] Prix 3 : volume = longueur × largeur × profondeur par ligne de terrassement, avec alerte si longueur > 2 m sans remplacement d'élément. [R-DEF-012 ; R-DEF-013]
- **R-DER-006** [DÉDUIT] Prix 4 et 5 : surface = longueur × largeur du terrassement, affectée au prix 4 (béton, mosaïque, granito lavé, carreaux ciment) ou au prix 5 (chaussée en enrobé) ; zéro pour le terrain naturel ; comptée seulement quand la réfection est faite. [R-DEF-019 ; R-DEF-020 ; R-FICHE-012]
- **R-DER-007** [DÉDUIT] Prix 6 à 13 : proposition d'affectation automatique à partir des pièces et des caractéristiques de la fuite : polyéthylène de diamètre extérieur < 40 mm → prix 6 ; ≥ 40 mm → prix 9 ; robinet PEC changé → prix 7 ; collier PEC changé → prix 8 ; mise à niveau de bouche à clé sans robinet ni collier PEC → prix 10 ; conduite AC ou PVC → prix 11, 12 ou 13 selon le DN ; au plus une unité de chaque prix par fuite ; cas restants signalés « hors bordereau ». L'utilisateur doit pouvoir corriger, la règle n'étant écrite nulle part. [R-DEF-026 à R-DEF-042 ; R-ATT-008]
- **R-DER-008** [DÉDUIT] Unités de saisie : mètres pour les longueurs (les gabarits saisissent le linéaire en km : convertir × 1000) ; millimètres pour les diamètres ; mètres pour le PEHD posé ; m3/h pour les débits. [F032 p.1 ; F121 D10]
- **R-DER-009** [DÉDUIT] Indicateurs de débit : `Qi`, `Qf` = minimum des minimums de trois nuits ; `ΔQ = Qi − Qf` ; `τ1 = 100 × (Q exigé − Qf) / Q exigé` ; `τ2 = 100 × (Qf − moyenne des contrôles) / Qf` ; pénalité = min(25 ; −τ) % du montant du prix concerné si τ < 0 ; arrêt de la zone si τ1 < −25. [R-CPS-115 ; R-CPS-143 ; R-CPS-145 à R-CPS-149]
- **R-DER-010** [DÉDUIT] Montants : montant de ligne = quantité × PU ; majoration 15 % ; TVA 20 % ; retenue de garantie 10 % par acompte jusqu'à 7 % du marché ; voir l'exemple B de la section 7.10 comme test. [R-ID-012 ; R-CPS-041 ; R-CPS-200]

### 11.4 Contrôles de cohérence

| Contrôle | Règle | Gravité | Source |
|---|---|---|---|
| Référence SRM | motif `^\d{3}-\d{3}-\d{3}$` ; doublon signalé, non bloquant | avertissement | R-IDF-001 |
| Diamètre et prix | PE : DE < 40 → prix 6 ; DE ≥ 40 → prix 9 ; conduite : DN > 315 → hors bordereau | bloquant pour l'affectation | R-DEF-040 |
| Matériau et prix | prix 11 à 13 réservés à l'amiante-ciment et au PVC | avertissement | R-DEF-037 |
| Longueur de fouille | > 2 m sans remplacement d'élément | avertissement | R-DEF-012 |
| Longueur de polyéthylène | > 2 m | avertissement (hors définition du prix) | R-DEF-026 |
| Linéaire | cumul par secteur ≤ linéaire du secteur ; un tronçon payé une fois | bloquant | R-DEF-003 |
| Cadence | linéaire du jour ÷ nombre d'équipes ≥ 4000 m en moyenne | alerte | R-CPS-121 |
| Nombre d'équipes | ≥ 4 équipes actives | alerte | R-CPS-122 |
| Distance entre capteurs | < 100 m ; ≤ 50 m en PVC ou PE | information | R-CPS-128 |
| Avis SRM | terrassement sans avis préalable enregistré | bloquant | R-CPS-161 |
| Présence SRM | confirmation de fuite sans représentant SRM identifié | avertissement | R-CPS-125 |
| Dates | date de réparation ≥ date de détection ; date de réfection ≥ date de réparation | bloquant | — |
| Sommes | Σ linéaires des zones = 1466 km ; Σ montants du bordereau = 3762300.00 | test de paramétrage | section 4 |
| Numéro de marché | 10 chiffres (rejeter 45000004453) | bloquant | R-ID-003 |

### 11.5 Délais et seuils d'alerte

| Alerte | Déclencheur | Seuil | Statut | Source |
|---|---|---|---|---|
| Fuite non communiquée à la SRM | date de détection | fin de la journée | CONTRACTUEL | R-CPS-131 |
| Fuite détectée non réparée | date de détection | 48 h (paramétrable) | INTERNE (cadrage de l'application ; aucun délai au CPS) | R-CPS-132 |
| Réfection de chaussée en attente | date de réparation | J+20 (pré-alerte) ; 1 mois (échéance : passage à l'enrobé-résine à froid) | CONTRACTUEL (échéance) ; INTERNE (pré-alerte) | R-CPS-134 ; R-CPS-135 |
| Réfection de trottoir en attente | date de réparation | paramétrable | INTERNE | R-CPS-136 |
| Fin du balayage | date de commencement | 4 mois (2027-02-01 ou 2027-02-02) ; avancement cumulé comparé à 1466 km | CONTRACTUEL | R-CPS-091 |
| Fin du maintien 1 ; fin du maintien 2 ; fin du marché | fin du balayage | + 4 mois ; + 8 mois ; 12 mois | CONTRACTUEL | R-CPS-092 ; R-CPS-031 |
| Cadence de balayage insuffisante | moyenne glissante | < 4 km par jour et par équipe ; ou linéaire restant ÷ jours restants > capacité | CONTRACTUEL | R-CPS-121 |
| Débit nocturne au-dessus de l'objectif | mesure de fin de balayage ou contrôle hebdomadaire | Qf > Q exigé (pénalité) ; Qf > 1.25 × Q exigé (arrêt de la zone) ; moyenne de maintien > Qf (pénalité τ2) | CONTRACTUEL | R-CPS-146 ; R-CPS-147 ; R-CPS-149 |
| Contrôle hebdomadaire manquant | date du dernier contrôle | > 7 jours | CONTRACTUEL | R-CPS-109 |
| Rapport de synthèse par secteur | fin de mission sur le secteur | 15 jours | CONTRACTUEL | R-CPS-165 |
| Retour d'OS signé | notification de l'OS | 3 jours | CONTRACTUEL | R-CPS-034 |
| Paiement en retard | dépôt de la facture | 90 jours | CONTRACTUEL | R-CPS-062 |
| Pénalités de retard cumulées | cumul | approche de 8 % du marché | CONTRACTUEL | R-CPS-078 |
| Essai de carottage dû | surface de chaussée refaite | chaque 50 m2 | CONTRACTUEL | R-CPS-137 |

### 11.6 Exports et états

| Export | Contenu exact | Périodicité | Statut | Source |
|---|---|---|---|---|
| Rapport journalier | en-tête (marché, société, journée, équipe, zone, secteur, linéaire) ; tableau des fuites (n°, adresse ou référence, calibre, nature, visible ou invisible, nature de dégradation) ; total ; commentaire ; visas STEPAG et SRM ; extrait de plan A4 avec conduites inspectées et fuites | chaque jour de balayage | CONTRACTUEL (contenu) | section 3.14 ; section 8.1 |
| Fiche de réparation par fuite | secteur, n° de fuite, référence, nature Bt/Cdt, DN, terrassement L × l × P, nature de dégradation, détail des pièces, visas ; photos et GPS en plus (choix STEPAG) | par fuite réparée | CONTRACTUEL (existence) | section 8.2 |
| Rapport mensuel | mois, équipements, nombre de jours, linéaire balayé, fuites visibles et invisibles par ouvrage, ratios ; bilan des réparations et réfections | mensuel | CONTRACTUEL (existence) | section 8.3 |
| État hebdomadaire | linéaire par jour, fuites par ouvrage, visibles et invisibles (modèle 2017) | hebdomadaire | INTERNE (non exigé en 2026) | section 7.7 |
| Attachement | en-tête (SRM, marché, OS, entreprise, date d'arrêt, zone, lieu du chantier) ; par prix : n°, désignation, unité, quantité antérieure, quantité du mois, cumul ; visas SRM.ORI et Sté STEPAG ; annexes : fiche de réparation, feuille de réfection, détail par fuite | à chaque facture ; mensuel en pratique | CONTRACTUEL | sections 3.13 ; 8.4 |
| Facture | mentions de R-CPS-061 ; 13 lignes ; total HT ; TVA ; TTC ; majoration ; montant en lettres ; 5 exemplaires + pièces en 3 exemplaires + bordereau d'envoi | trois factures contractuelles | CONTRACTUEL | sections 3.16 ; 8.4 |
| Suivi des débits | par zone : Qi, Qf, Q exigé, τ1, contrôles hebdomadaires, moyenne, τ2 ; PV signés | campagnes et hebdomadaire | CONTRACTUEL (PV) | section 3.9 |
| Rapport de synthèse par secteur ; rapport final ; report des fuites sur plans ; album photos | bilan, propositions d'amélioration du rendement, carte des fuites, photos | fin de secteur ; fin de marché | CONTRACTUEL | R-CPS-164 ; R-CPS-165 |
| État de suivi du marché | par prix : marché, antérieur, période, cumul, disponible, taux, alertes | à chaque décompte | 2017 (utile en interne) | section 7.6 |

- **R-DER-011** [DÉDUIT] Identifiants à faire figurer sur chaque document : numéro du marché 4500004453 partout ; numéro et date de l'OS n° 02 sur l'attachement et la facture ; référence SRM `NNN-NNN-NNN` et numéro de fuite sur toute ligne de fuite ; numéro de prix sur toute ligne de quantité. [R-IDF-004 ; F001]
- **R-DER-012** [DÉDUIT] Structure de l'attachement mensuel : un attachement par période et par zone (ou global avec sous-totaux par zone), 13 lignes de prix, colonnes antérieur / mois / cumul ; rattachement au mois par la date de réparation (réparations, terrassements) et par la date de réfection (réfections) `[À CONFIRMER]` ; seules les lignes validées contradictoirement sont attachées. [section 7.8 ; R-CPS-191]

### 11.7 Suivi financier du marché

- **R-DER-013** [DÉDUIT] Suivre le cumul des attachements (HT bordereau, HT majoré, TTC) par rapport au montant du marché : 3762300.00 HT bordereau ; 4326645.00 HT majoré ; 5191974.00 TTC. Il n'y a ni minimum ni maximum contractuel ; l'alerte porte sur l'approche de 100 % du montant et sur la variation de la masse (articles 57 à 59 du CCAG-T, seuils `[À CONFIRMER]`). [section 2.4 ; R-CPS-076]
- **R-DER-014** [DÉDUIT] Suivre par prix le cumul rapporté à la quantité du bordereau ; reprendre à titre provisoire les seuils de l'état de suivi 2017 : alerte si le cumul dépasse de plus de 30 % la quantité prévue, information si la sous-consommation dépasse 25 % en fin de marché. [R-ATT-017]
- **R-DER-015** [DÉDUIT] Suivre la retenue de garantie cumulée (plafond 363438.18 DH), les pénalités cumulées par type (plafonds 8 % et 2 %), l'échéancier des trois factures et le délai de paiement de 90 jours. [R-CPS-041 ; R-CPS-078 ; R-CPS-079 ; R-CPS-062]
- **R-DER-016** [DÉDUIT] Quantités prévisionnelles utiles au dimensionnement : 2400 + 600 = 3000 réparations sur polyéthylène, 900 robinets PEC, 500 colliers PEC, 300 bouches à clé, 128 réparations sur conduite, 2400 m3 de terrassement, 2000 m2 de trottoir, 800 m2 de chaussée sur 12 mois ; soit de l'ordre de 10 à 15 réparations par jour ouvré. [F032 p.1]

### 11.8 Conséquences pour le modèle de données et la sécurité

- **R-DER-017** [DÉDUIT] Entités minimales : marché ; ordre de service ; prix ; zone ; secteur ; équipe ; agent ; journée de balayage (secteur, équipe, date, linéaire, tracé) ; fuite ; intervention ; terrassement ; pièce posée ; réfection ; essai ; mesure de débit ; procès-verbal ; attachement ; ligne d'attachement ; facture ; pénalité ; photo. Le marché est porté par toutes les entités (application multi-marchés). [section 11 bis]
- **R-DER-018** [DÉDUIT] Tout ce qui varie d'un marché à l'autre doit être paramétrable : nombre et libellé des prix, règles d'affectation, zones et secteurs, phases, taux de majoration ou de rabais, TVA, retenue, plafonds, formules de pénalité, catalogue de pièces (2017 : 24 prix, 3 zones, km ; 2026 : 13 prix, 5 zones, m). [section 7.9]
- **R-DER-019** [DÉDUIT] Données personnelles : restreindre par rôle l'accès aux références et adresses d'abonnés, ne pas les exporter hors des documents dus à la SRM, prévoir leur suppression en fin de marché et une trace des accès. [R-CPS-022 à R-CPS-029]
- **R-DER-020** [DÉDUIT] Rôle « agent de suivi SRM » : le CPS prévoit une validation des fuites le jour même, un avis avant terrassement et un constat contradictoire ; un accès de consultation et de validation pour la SRM répondrait à ces trois obligations `[À CONFIRMER avec la SRM]`. [R-CPS-131 ; R-CPS-161 ; R-CPS-191]

## 11 bis. Dictionnaire de données consolidé

**Résumé.** Une ligne par donnée élémentaire rencontrée dans les documents. Les noms canoniques sont des propositions de l'extracteur. « Obligatoire » : `oui` = exigé par le CPS ; `interne` = prévu seulement par un gabarit STEPAG ; `non` = absent des documents mais nécessaire à une règle (proposé). Une donnée absente de ce tableau n'existe dans aucun document du dossier.

**Principaux `[NON PRÉCISÉ]`.** Coordonnées GPS, photos, heure de détection, débit estimé de la fuite, marquage au sol : aucun document ne les prévoit (elles viennent du cadrage de l'application, statut `[INTERNE]`).

| Nom canonique proposé (snake_case) | Libellés rencontrés FR | Libellé AR | Entité | Type | Unité | Obligatoire | Qui la saisit et à quelle étape | Documents où elle apparaît | Alimente le(s) prix n° | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| marche_numero | Marché N° ; MARCHE ; Marché N° : ; Numéro DA/Marché | — | marché | texte | — | oui | administrateur, à la création du marché | F035 OS ; F001 Parametre F5 ; F119 B2 ; F123 C5 | — | [F035 p.1] |
| ao_numero | Appel d'Offres N° ; A.O N° ; Numéro DA/Marché | — | marché | texte | — | non | administrateur | F056 pied de page ; F032 en-tête | — | [F056 p.1] |
| marche_objet | Objet du marché ; TRAVAUX DE DÉTECTION, RECHERCHE ET RÉPARATION DE FUITES… | — | marché | texte | — | interne | administrateur | F036 ; F001 Parametre D7 ; F119 B3 | — | [F036 p.1] |
| marche_montant_ttc | Montant total toutes taxes comprises après majoration ; MONANT TOTAL APRES MAJORATION | — | marché | décimal(12,2) | MAD | oui | administrateur | F040 ; F032 ; F037 | — | [F040 p.1] |
| taux_majoration | POURCENTAGE MAJORATION (%) ; Taux de majoration | — | marché | décimal(5,2) | % | oui | administrateur | F032 ; F040 ; F001 facture F29 | tous | [F032 p.1] |
| taux_tva | TVA ; T.V.A | — | marché | décimal(5,2) | % | oui | administrateur | F032 F18 ; F001 facture F27 | tous | [F059 feuille "Table 1" F18] |
| delai_execution_mois | délai de 12 mois ; durée maximale de : 12 mois | — | marché | entier | mois | oui | administrateur | F056 art. I-19 ; F036 | — | [F056 p.8] |
| client_nom | SRM-Oriental ; Client : SRM-ORI ; SRM-ORI | الشركة الجهوية متعددة الخدمات الشرق | marché | texte | — | interne | administrateur | F001 Parametre A3 ; F001 facture A4 | — | [F001 feuille "Parametre" A3] |
| client_direction ; client_service | Exploitation eau potable ; Département Mesures et Amelioration du rendement | — | marché | texte | — | interne | administrateur | F001 Parametre A4:A5 | — | [F001 feuille "Parametre" A4] |
| client_ice | ice: | — | marché | texte | — | interne | administrateur | F001 facture A5 | — | [F001 feuille "facture" A5] |
| entreprise_nom | SOCIETE : STEPAG ; Entreprise STEPAG ; Entreprise: | ستيݒاݣ (ش,م,م) | marché | texte | — | oui (facture) | administrateur | F119 A7 ; F001 Parametre A11 ; F001 facture | — | [F056 p.12] |
| entreprise_identifiants | T.P ; R.C ; I.F ; CNSS ; ICE | — | marché | texte | — | oui (facture) | administrateur | F001 facture A52 | — | [F056 p.12] |
| os_numero | O.S.N° ; Ordre de service N° ; O.S N° | — | OS | texte | — | oui (attachement) | administrateur, à réception de l'OS | F035 ; F036 ; F001 Parametre A9 | — | [F056 p.12] |
| os_date | Du 02/10/2026 ; Fait à Oujda le | — | OS | date | — | oui | administrateur | F036 ; F001 Parametre A9 | — | [F036 p.1] |
| os_objet | Relatif à la notification de l'approbation ; Relatif au commencement d'exécution des travaux | — | OS | énumération (notification, commencement, arrêt, reprise, agent de suivi) | — | oui | administrateur | F035 ; F036 | — | [F056 p.8] |
| date_commencement | À commencer l'exécution des travaux le | — | marché | date | — | oui | administrateur | F036 | — | [F036 p.1] |
| zone_id | Zone d'intervention ; Zone ; N° | — | zone | énumération `zone_intervention` | — | oui | administrateur (paramétrage) ; agent (rapport) | F056 tableau n° 1 ; F119 F8 ; F001 Parametre A15 | 1 ; 2 | [F056 p.18] |
| zone_lineaire_km | Linéaire approximatif du réseau par zone (Km) | — | zone | entier | km | oui | administrateur | F056 tableau n° 1 | 1 ; 2 | [F056 p.18] |
| zone_q_exige | Débit nocturne minimum à assurer à l'achèvement du balayage (m3/h) ' Q exigé ' | — | zone | décimal(6,1) | m3/h | oui | administrateur | F056 tableau n° 1 | pénalité τ1 | [F056 p.18] |
| zone_q_actuel ; zone_q_min_historique | Débits actuels mesurés aux secteurs ; Débits min les plus bas atteints | — | zone | décimal(6,1) | m3/h | oui | administrateur | F056 p.19 | — | [F056 p.19] |
| secteur_id | Secteur d'intervention ; Secteur de la fuite ; Secteur | — | secteur | énumération `secteur` | — | oui | administrateur (paramétrage) ; agent (rapport) | F056 tableau n° 1 ; F119 F9 ; F123 B6 | 1 ; 2 | [F056 p.18] |
| secteur_lineaire_m | [NON PRÉCISÉ] (linéaire par secteur absent des documents) | — | secteur | décimal(10,2) | m | non | administrateur, d'après le plan | — | 1 ; 2 | — |
| mesure_debit_date_heure ; mesure_debit_valeur | Heure de mesure ; Débit de nuit mesuré (m3/h) ; Q1…Q25 | — | mesure de débit | datetime ; décimal(6,1) | m3/h | oui | SRM (télégestion) ou entreprise | F056 art. II-17 ; PV de mesures | pénalités τ1, τ2 | [F056 p.22] |
| mesure_debit_campagne | avant opération de recherche ; après opération ; contrôle du maintien | — | mesure de débit | énumération (avant, apres, maintien) | — | oui | administrateur | F056 art. II-17, II-22, II-15 | — | [F056 p.22] |
| qi ; qf ; delta_q | Qi ; Qf ; ΔQ = Qi – Qf | — | zone ou secteur | décimal(6,1) | m3/h | oui | calculé | PV de mesures | pénalité τ1 | [F056 p.24] |
| q_reel_maintien | Q Réal maintien | — | zone | décimal(6,1) | m3/h | oui | calculé (moyenne des minimums hebdomadaires) | F056 art. II-23 | pénalité τ2 | [F056 p.25] |
| rapport_date | Journée du : ; Journée du: ; journée du : | — | rapport journalier | date | — | oui | agent de détection, chaque jour | F119 F7 ; F121 D9 ; F087 | — | [F056 p.24] |
| equipe_numero | EQUIPE N° : ; EQUIPE N° ; Equipe : | — | équipe | entier | — | interne | agent ou chef d'équipe | F119 A8 ; F121 A11 | — | [F119 A8] |
| equipements_utilises | Equipements Utilisés : ; Equipements utilisés : | — | rapport | texte ou énumération `equipement_detection` | — | interne | agent | F122 A12 ; F087 | — | [F122 A12] |
| lineaire_inspecte_m | Linéaire : ; Linéaire en Km : ; Linéaire Balayé ; Linéaire prospecté par jour ; le linéaire des conduites inspectées | — | rapport journalier (par secteur et par jour) | décimal(10,2) | m (saisi en km dans les gabarits) | oui | agent de détection, chaque jour | F119 F10 ; F121 D10 ; F122 B13 ; attachement prix 1 | 1 ; 2 | [F056 p.24] |
| fuite_numero | N° Fuite ; N° ; Numéro de la fuite ; N° de fuite | — | fuite | entier | — | interne | attribué à la détection | F119 A14 ; F123 B7 ; F001 fiche A12 | — | [F001] |
| reference_srm | Tournée ; Référence ; Réf ; Adresse ou Référence | — | fuite | texte `NNN-NNN-NNN` | — | interne | agent de détection, sur place | F119 B14 ; F123 B8 ; F001 fiche B12 ; REFECTION B14 | — | [F001] |
| fuite_adresse | Adresse ; leurs adresses | — | fuite | texte | — | oui | agent de détection | F056 art. II-21 ; F121 B14 | — | [F056 p.24] |
| fuite_visibilite | Visibles ; Invisibles | — | fuite | énumération `visibilite_fuite` | — | oui | agent de détection | F119 G15:H15 ; F122 D15:D16 | — | [F056 p.25] |
| ouvrage_touche | Nature ; Nature "Bt/Cdt" ; Conduites ; Branchement ; Piece Spéciale ; B.I | — | fuite | énumération `ouvrage_touche` | — | interne | agent, confirmé à l'ouverture | F121 E15 ; F123 B10 ; F122 F14:I14 | 6 à 13 | [F123 B10] |
| conduite_materiau | Nature (canalisation prospectée) ; la nature de la conduite | — | fuite | énumération `materiau_conduite` | — | oui | agent, après ouverture de la tranchée | F056 art. II-25 ; F087 | 6 ; 9 ; 11 ; 12 ; 13 | [F056 p.25] |
| conduite_dn_mm | Calibre ; DN "conduite" ; le diamètre de la conduite | — | fuite | entier | mm | oui | agent, après ouverture de la tranchée | F119 E15 ; F123 C10 ; F056 art. II-25 | 6 ; 9 ; 11 ; 12 ; 13 | [F056 p.25] |
| date_detection | DATE DE DETECTION ; Date de detection de fuite | — | fuite | date | — | oui (communication le jour même) | agent de détection | F001 fiche C12 ; F084 | délai R-CPS-131 | [F001 feuille "Fiche de réparation Zone " C12] |
| date_communication_srm | communiquées le jour même à la SRM-ORI pour validation | — | fuite | datetime | — | oui | système ou bureau, à l'envoi | F056 art. II-19 | — | [F056 p.23] |
| validation_srm | pour validation ; confirmation de la fuite en présence des agents de la SRM-ORI | — | fuite | booléen + date + nom du représentant | — | oui | représentant de la SRM | F056 art. II-18, II-19 | — | [F056 p.22-23] |
| avis_terrassement_srm | sans demander l'avis préalable de la SRM-ORI | — | intervention | booléen + datetime | — | oui | bureau ou chef d'équipe, avant terrassement | F056 art. II-27 | — | [F056 p.26] |
| chercheur_fuite | CHERCHEUR DE FUITE `[2017]` | — | fuite | référence agent | — | non | système | F084 | — | [F084] |
| date_reparation | DATE DE REPARATION ; Date de réparation ; Date du: | — | intervention | date | — | oui (point de départ du délai de réfection) | équipe de réparation | F001 fiche D12 ; REFECTION C14 ; F123 E2 | délai R-CPS-134 | [F056 p.23] |
| fouille_longueur_m | Terrassement Longueur ; Long ; Longueur (m) | — | intervention (terrassement) | décimal(5,2) | m | interne | équipe de réparation, fouille ouverte | F001 fiche E13 ; F123 D10 | 3 ; 4 ; 5 | [F001 feuille "Fiche de réparation Zone " E13] |
| fouille_largeur_m | Terrassement Largeur ; Larg | — | intervention (terrassement) | décimal(5,2) | m | interne | équipe de réparation | F001 fiche F13 ; F123 E10 | 3 ; 4 ; 5 | [F001 feuille "Fiche de réparation Zone " F13] |
| fouille_profondeur_m | Terrassement Profondeur ; prof | — | intervention (terrassement) | décimal(5,2) | m | interne | équipe de réparation | F001 fiche G13 ; F123 F10 | 3 | [F001 feuille "Fiche de réparation Zone " G13] |
| volume_terrassement_m3 | Vol `[2017]` ; colonne du prix 3 | — | intervention (terrassement) | décimal(8,3) | m3 | oui (quantité du prix 3) | calculé : L × l × P | F001 détail K ; F065 attachement détaillé H | 3 | [F056 p.28] |
| nature_revetement | Nature de degradation ; Nature Dégradation ; Nature de dégradation | — | intervention (terrassement) | énumération `nature_revetement` | — | interne | équipe de réparation | F119 I14 ; F123 G10 ; F001 fiche H12 | 4 ; 5 | [F001] |
| symbole_refection | Symbole ; Matériaux `[2017]` | — | réfection | énumération (B ; M ; L ; C ; AC ; TN) | — | interne | bureau, une fois la réfection faite | F001 REFECTION H14 | 4 ; 5 | [F001 feuille "REFECTION" H14] |
| date_refection | [NON PRÉCISÉ] (aucun champ ; exigée pour le délai d'un mois) | — | réfection | date | — | non | équipe de réfection | — | délai R-CPS-134 | [F056 p.23] |
| type_enrobe | enrobés à chaud ; enrobé-résine à froid | — | réfection | énumération (a_chaud ; resine_a_froid) | — | oui | équipe de réfection | F056 art. II-20 | 5 | [F056 p.23-24] |
| surface_refection_m2 | Béton ; Mosaique ; Lavé ; Carreaux ; Asphalt à chaud (colonnes de surface) | — | réfection | décimal(8,2) | m2 | oui (quantité des prix 4 et 5) | calculé : L × l | F001 REFECTION I:M | 4 ; 5 | [F001 feuille "REFECTION" I17] |
| essai_carottage_resultat | Contrôle de réfections de chaussée par carottage ; 1 prélèvement chaque 50m2 | — | réfection (essai) | énumération (conforme ; non_conforme) + date | — | oui | bureau, au résultat du laboratoire | F056 art. II-21 ; F082 `[2017]` | pénalité R-CPS-138 | [F056 p.24] |
| piece_designation | Détail des pieces de reparation des fuites ; DETAIL DE LA REPARATION DE FUITE ; Détails de reparation des fuites (pièces) | — | pièce posée | énumération (catalogue 6.2) | — | interne | équipe de réparation | F001 fiche I12 ; F123 B12 | 6 à 13 (choix du prix) | [F001 feuille "Fiche de réparation Zone " I12] |
| piece_quantite | Qté posée ; Qté ; Nombre de piéces | — | pièce posée | décimal(6,2) | u, ou m pour PEHD et tuyau | interne | équipe de réparation | F001 fiche J12 ; F123 G12 | 6 ; 9 (longueur PE ≤ 2 m) | [F001 feuille "Fiche de réparation Zone " J12] |
| longueur_pe_m | longueur polyéthylène inférieur ou égale à 2m | — | intervention | décimal(4,2) | m | oui (condition des prix 6 et 9) | calculé : somme des quantités de PEHD | F032 prix 6 et 9 | 6 ; 9 | [F032 p.1] |
| motif_sans_reparation | A DETECTER ; RAS ; Assainissement ; refusé par l'abonné ; sondage negatif | — | intervention | énumération `motif_sans_reparation` | — | interne | équipe de réparation | F001 LISTE A1:A5 | 3 [À CONFIRMER] | [F001 feuille "LISTE"] |
| observation ; commentaire | Observations ; Ovservation ; OBSERVATION ; COMMENTAIRE | — | fuite ; rapport | texte | — | interne | tout agent | F001 fiche K12 ; F119 A50 | — | [F001] |
| statut_fuite | [NON PRÉCISÉ] (couleurs de ligne en 2017) | — | fuite | énumération `statut_fuite` | — | non | calculé ou saisi | F065 Fiche réfection N4:N8 | — | [F065] |
| extrait_plan | extrait du plan du réseau (format A4) | — | rapport journalier | fichier (image ou PDF) | — | oui | bureau | F056 art. II-21 | — | [F056 p.24] |
| position_fuite | repérage des fuites détectées et leur implantation sur un plan | — | fuite | géopoint | — | oui (sur plan ; coordonnées [NON PRÉCISÉ]) | agent de détection | F056 art. II-18 | — | [F056 p.22] |
| photo | Album photos relatif à quelques fuites localisées | — | fuite | photo | — | oui (album final ; par fuite [NON PRÉCISÉ]) | agents | F056 art. II-30 | — | [F056 p.27] |
| visa_stepag | STEPAG ; Sté STEPAG ; Signature: ; signée par L'entreprise | — | fiche ; rapport ; attachement | signature | — | oui (fiche de réparation) | représentant STEPAG | F123 C15 ; F121 A23 ; F001 recap C28 | — | [F056 p.23] |
| visa_srm | S.R.M ; SRM ORIENTAL ; SRM.ORI | — | fiche ; rapport ; attachement | signature | — | oui (attachement contradictoire ; PV de mesures) | représentant de la SRM | F123 G15 ; F122 G20 ; F001 recap A28 | — | [F056 p.13] |
| mois_rapport | Mois | — | rapport mensuel | énumération (mois) | — | oui | bureau | F122 H11 | — | [F122 H11] |
| nb_jours_travailles | Nbr Jours | — | rapport mensuel | entier | j | interne | calculé | F122 A13 | — | [F122 A13] |
| nb_fuites_jour ; nb_fuites_total ; nb_fuites ; nb_fuites_par_ouvrage | TOTAL ; Total des fuites ; Nombre de fuites localisées | — | rapport | entier | fuites | oui | calculé | F119 A48 ; F121 A21 ; F122 J14 | — | [F056 p.24] |
| ratio_km_par_jour ; ratio_fuites_km ; ratio_fuites_branchement_km ; ratio_fuites_conduite_km | Linéaire prospecté (Km.j) ; Total des fuites par Km ; Fuite sur Branchement par Km | — | rapport mensuel | décimal(8,4) | km/j ; fuites/km | interne | calculé | F122 A18:I19 | — | [F122] |
| prix_numero | N° de prix ; Des prix ; N° Des Prix | — | prix | entier 1 à 13 | — | oui | administrateur (bordereau) | F032 ; F001 BP ; recap ; facture | — | [F032 p.1] |
| prix_designation | Désignation des prestations | — | prix | texte | — | oui | administrateur | F032 ; F001 | — | [F032 p.1] |
| prix_unite | Unité de mesure ; Unité | — | prix | énumération `unite` | — | oui | administrateur | F032 ; F001 | — | [F032 p.1] |
| prix_quantite_marche | Quantité (bordereau) | — | prix | décimal(12,2) | selon prix | oui | administrateur | F032 | seuils de dépassement | [F032 p.1] |
| prix_pu_ht | Prix unitaire en DH HT | — | prix | décimal(10,2) | MAD | oui | administrateur | F032 ; F001 facture E12 | — | [F032 p.1] |
| attachement_numero | ATTACHEMENT N°01 | — | attachement | entier | — | interne | bureau | F001 recap A7 | — | [F001 feuille "attachement recap" A7] |
| date_arrete_travaux | Travaux executés au ; des travaux exécutés au | — | attachement | date | — | interne | bureau | F001 Parametre A13 | — | [F001 feuille "Parametre" A13] |
| lieu_chantier | Le lieu exact du début et de la fin du chantier concerné par cet attachement avec si besoin un croquis ou un plan | — | attachement | texte + fichier | — | oui | bureau | F056 art. I-32 | — | [F056 p.12] |
| quantite_anterieure | Quantité mois -1 ; Total mois -1 ; Quantités précédentes `[2017]` | — | ligne d'attachement | décimal(12,3) | selon prix | interne | reprise du cumul précédent | F001 recap D13 ; détail 932 | — | [F001 feuille "attachement recap" D13] |
| quantite_mois | Quantité partielle ; total partiel ; Quantité du mois `[2017]` | — | ligne d'attachement | décimal(12,3) | selon prix | oui | calculé : cumul − antérieur | F001 recap E13 ; facture D12 | — | [F056 p.12] |
| quantite_cumulee | Total ; Cumulé `[2017]` | — | ligne d'attachement | décimal(12,3) | selon prix | interne | calculé | F001 détail 930 ; F065 attach recap H | — | [F001 feuille "DETAIL ATTACHEMENT Zone" 930] |
| montant_ht | Prix total en DH HT | — | ligne de facture ou de décompte | décimal(12,2) | MAD | oui | calculé : quantité × PU | F001 facture F12 | — | [F001 feuille "facture" F13] |
| total_ht ; tva ; total_ttc ; montant_apres_majoration | TOTAL ANNUEL HORS TVA ; TVA ; TOTAL ANNUEL TTC ; MONANT TOTAL APRES MAJORATION | — | facture ; décompte | décimal(12,2) | MAD | oui | calculé | F001 facture F26:F30 ; F032 | — | [F001 feuille "facture"] |
| retenue_garantie | Retenue de garantie | — | décompte | décimal(12,2) | MAD | oui | calculé : 10 % de l'acompte, plafond 7 % | F056 art. I-26 ; F068 decompte `[2017]` | — | [F056 p.9] |
| penalite_montant ; penalite_type | pénalité ; A déduire montant Pénalité de retard ; Pénalité sur balayage `[2017]` | — | pénalité | décimal(12,2) ; énumération (retard ; signalisation ; epi ; resultat_balayage ; resultat_maintien ; essai_non_conforme) | MAD | oui | SRM (constat) ; saisie par le bureau | F056 art. I-35, II-21, II-23 | 1 ; 2 ; 5 | [F056 p.13-14 ; p.25] |
| coefficient_revision | coefficient de révision des prix | — | décompte | décimal(6,4) | — | oui | calculé d'après les index publiés | F056 art. I-30 | tous | [F056 p.11] |
| acompte_net | Montant de l'acompte à payer `[2017]` ; Net à payer `[2017]` | — | décompte | décimal(12,2) | MAD | oui | calculé | F068 decompte F163 ; F072 | — | [F056 p.12] |
| facture_numero | Facture Partielle N° : ; FACTURE N° | — | facture | texte `FA AAMM-NNNN` | — | oui | bureau | F001 facture A4 ; B.ENVOI B20 | — | [F001 feuille "facture" A4] |
| facture_date | Oujda le | — | facture | date | — | oui | bureau | F001 facture A4 | — | [F056 p.12] |
| facture_date_depot | date de dépôt de la facture de décompte au bureau d'ordre | — | facture | date | — | oui (point de départ des 90 jours) | bureau | F056 art. I-32 | — | [F056 p.13] |
| montant_en_lettres | Arrêtée la presente facture à la somme de : | — | facture | texte | — | interne | calculé | F001 facture A32 | — | [F001 feuille "facture" A32] |
| envoi_date ; envoi_destinataire ; envoi_piece ; envoi_nombre | Oujda le ; Destinataire : ; DESIGNATION ; NOMBRE ; NBRE | — | bordereau d'envoi | date ; texte ; texte ; entier | — | interne | bureau | F051 ; F001 B.ENVOI | — | [F051] |
| materiel_designation ; materiel_nombre | DÉSIGNATION DU MATÉRIEL ; NOMBRE MINIMAL AFFECTE AU PROJET | — | matériel | texte ; entier | — | oui | administrateur | F056 art. II-26 | — | [F056 p.26] |
| agent_nom ; agent_role ; agent_assurance | personnel ; agent assuré nominativement | — | agent | texte ; énumération ; booléen | — | oui (assurance nominative) | administrateur | F056 art. II-27 | — | [F056 p.26] |

### Cardinalités observées

| Relation | Cardinalité | Statut | Source |
|---|---|---|---|
| marché → zones | 1 marché a 5 zones | CONTRACTUEL | [F056 p.18-19] |
| zone → secteurs | 1 zone a 4 à 8 secteurs ; 1 secteur appartient à 1 zone | CONTRACTUEL (découpage [À CONFIRMER]) | [F056 p.18-19] |
| marché → prix | 1 marché a 13 prix ; un prix appartient à un seul marché | CONTRACTUEL | [F032 p.1] |
| marché → ordres de service | 1 marché a 0..n ordres de service numérotés | CONTRACTUEL | [F056 p.8] |
| secteur × jour → rapport journalier | 1 rapport par secteur et par journée (gabarit : un classeur par secteur, une feuille par jour) | INTERNE | [F119] |
| rapport journalier → fuites | 1 rapport liste 0..n fuites (31 lignes prévues ; 14 en 2017) | INTERNE | [F119 ; F087] |
| fuite → secteur | 1 fuite appartient à 1 secteur | INTERNE | [F123 B6] |
| fuite → référence SRM | 1 fuite a 1 référence ; 1 référence peut porter plusieurs fuites | 2017 ; INTERNE | [F065 § 8] |
| fuite → interventions de réparation | 0..1 dans les gabarits (une date de réparation) ; 0 si motif sans réparation ; reprises sous garantie [NON PRÉCISÉ] | INTERNE | [F001 feuille "Fiche de réparation Zone "] |
| intervention → terrassements | 1..2 lignes de terrassement par fuite (deux revêtements) | INTERNE ; 2017 | [F001 fuite 22 ; F068] |
| intervention → pièces posées | 0..n lignes de pièce (1 à 8 observées) | INTERNE | [F001 ; F065] |
| fuite → prix de réparation | 0..n prix distincts, au plus 1 unité par prix et par fuite | 2017 | [F065 feuille "attachement detaillé"] |
| terrassement → réfection | 0..1 réfection par terrassement ; aucune pour le terrain naturel | INTERNE | [F001 feuille "REFECTION"] |
| attachement → période | 1 attachement arrêté à une date (« Travaux executés au ») ; un mois par attachement dans le nom du fichier (« mois 10 ») | INTERNE | [F001] |
| attachement → lignes | 1 ligne par prix (13) ; une ligne correspond à un prix et un seul | INTERNE | [F001 feuille "attachement recap"] |
| attachement → zone | 1 attachement par zone dans le gabarit (« Zone ») ; en 2017 : partiels par zone + récapitulatif | INTERNE ; 2017 | [F001 feuille "Parametre" A15 ; F068] |
| attachement → facture | 1 facture reprend les quantités d'un attachement | INTERNE | [F001 feuille "facture" D13] |
| marché → factures | 3 factures prévues par le CPS (fin de balayage ; + 4 mois ; + 8 mois) | CONTRACTUEL | [F056 p.12-13] |
| zone → mesures de débit | 3 nuits × 25 mesures avant ; 3 nuits après ; puis au plus 1 contrôle par semaine pendant 8 mois | CONTRACTUEL | [F056 p.22 ; p.24 ; p.21] |
| agent → marchés ; agent → équipe | [NON PRÉCISÉ] dans les documents (cadrage de l'application) | — | — |

## 12. Points ambigus, contradictions et questions

**Résumé.** 41 questions, classées par destinataire (SRM, puis Issam / STEPAG). Chacune donne les règles et sources concernées, son impact et une hypothèse par défaut qui permet de développer sans attendre. Les contradictions relevées sont récapitulées en 12.3 et les exports à demander en 12.4.

**Les cinq questions les plus structurantes.** Q-01 (délai de réparation : aucun au CPS), Q-03 (assiette et arrondi des pénalités τ), Q-05 (périodicité des attachements et des acomptes), Q-07 (règle d'affectation des pièces aux prix), Q-13 (linéaire par secteur et système de coordonnées du plan).

### 12.1 Questions à poser à la SRM

| N° | Question | Règles et sources | Impact | Hypothèse par défaut |
|---|---|---|---|---|
| Q-01 | Existe-t-il un délai de réparation d'une fuite après détection ou validation (le CPS n'en fixe aucun) ? | R-CPS-132 ; [F056 p.23] | alertes ; écran | seuil interne paramétrable de 48 h, sans effet contractuel |
| Q-02 | Par quel canal et avant quelle heure les fuites du jour doivent-elles être communiquées, et à qui ? Qui valide ? | R-CPS-131 ; R-CPS-175 ; [F056 p.23] | écran ; export | rapport journalier PDF envoyé le soir même au Département Mesures et Amélioration du Rendement ; validation tracée dans l'application |
| Q-03 | Pénalités τ1 et τ2 : calcul par zone ou global ? au prorata ou par point entier ? sur le montant HT bordereau ou majoré ? | R-CPS-146 ; R-CPS-149 ; R-CPS-150 ; R-ATT-015 ; [F056 p.25] | calcul | par zone, proportionnel sans arrondi, sur le montant HT majoré du prix de la zone (pratique 2017) |
| Q-04 | Le « montant du marché » servant d'assiette aux pénalités de retard (1/1000), aux plafonds (8 %, 2 %) et à la retenue de garantie (7 %) est-il HT ou TTC ? | R-CPS-077 à R-CPS-079 ; R-CPS-041 ; R-CPS-043 | calcul | TTC après majoration (5191974.00) |
| Q-05 | Quelle périodicité pour les attachements, décomptes et acomptes : mensuelle, ou seulement les trois factures prévues (fin de balayage, + 4 mois, + 8 mois) ? | R-CPS-065 ; R-CPS-067 à R-CPS-069 ; R-CPS-074 ; [F056 p.12-13] | export ; calcul | attachement mensuel de suivi ; factures aux trois échéances contractuelles |
| Q-06 | La majoration de 15 % s'applique-t-elle ligne par ligne (prix unitaires majorés) ou sur le total ? Avant ou après TVA ? Avec quel arrondi ? | R-ID-012 ; R-ID-013 ; R-FICHE-015 | calcul ; export | sur le total HT, arrondi au centime, puis TVA |
| Q-07 | Quelle est la règle d'affectation des réparations aux prix 6 à 13 (cumul de plusieurs prix sur une fuite, prix 10 avec les prix 7 et 8, collier Astor, raccord seul) ? | R-DEF-032 ; R-DEF-036 ; R-ATT-008 ; R-DER-007 | schéma ; calcul | règle automatique de R-DER-007, corrigible à la main, au plus une unité par prix et par fuite |
| Q-08 | Une fouille négative (sondage sans fuite) est-elle payée au prix 3, avec sa réfection ? Quelle mention porter sur la fiche ? | R-DEF-015 ; R-CPS-127 ; R-CPS-186 ; R-ATT-025 | calcul ; écran | terrassement et réfection payés (pratique 2017), motif « sondage négatif » |
| Q-09 | Largeur et profondeur de tranchée admises en attachement ; débord de réfection ; arrondi des quantités ; surface minimale. | R-DEF-013 ; R-DEF-014 ; R-DEF-019 ; R-DEF-050 | calcul | dimensions réelles mesurées contradictoirement, sans débord, quantités à 2 décimales |
| Q-10 | Tranches de diamètre : les bornes 110, 200, 225 et 315 sont-elles incluses ? Que devient une conduite de DN > 315, en fonte, en acier, ou une pièce spéciale ? | R-DEF-039 à R-DEF-041 ; R-MAT-006 | schéma ; calcul | bornes incluses (prix 12 pour DN 110 et 200 ; prix 11 pour 225 et 315) ; au-delà : hors bordereau, prix nouveau à demander |
| Q-11 | Réfection des pavés, du marbre, de la faïence, du terrain naturel : quel prix ? | R-DEF-021 ; liste `nature_revetement` | calcul | pavés, marbre, faïence au prix 4 ; terrain naturel non payé |
| Q-12 | Réparation de polyéthylène de plus de 2 m ; remplacement complet d'un branchement ; compteur et robinet cache-entrée. | R-DEF-031 ; R-DEF-032 | calcul | hors bordereau, signalé à la SRM |
| Q-13 | Quel est le linéaire de référence par secteur (le tableau n° 1 ne donne que le linéaire par zone) et d'où vient-il (SIG, AutoCAD) ? Le linéaire payé est-il plafonné au linéaire du tableau ? | R-DEF-006 ; R-ATT-029 ; R-PLAN-005 | schéma ; calcul | linéaire mesuré sur le plan AutoCAD, plafonné par zone au linéaire du tableau n° 1 |
| Q-14 | Découpage exact des secteurs : zone 1 (« Château Sidi Aissa Azengot », « Ballaoui Bas-Irfane- Unisit-Colline-Partie H Ain Serrak »), zone 2 (Tairet Bas et Haut), zone 3, zone 4 (Abdellah Guenoun Bas et Haut) ; orthographe officielle. | R-ID-007 ; R-PLAN-004 ; liste `secteur` | schéma | les 34 secteurs de la liste `secteur`, renommables |
| Q-15 | Que désigne la référence `NNN-NNN-NNN` (tournée de relève, rang, police d'abonné) ? Une liste des branchements avec adresses sera-t-elle fournie sous forme de fichier ? | R-IDF-001 ; R-IDF-002 ; R-CPS-163 | schéma | champ texte libre contrôlé par le motif ; import possible de la liste SRM |
| Q-16 | Système de coordonnées exigé pour le report des fuites ; format des livrables « informatiques » (Excel, shapefile, KML, DWG, PDF) ; plateforme de destination. | R-CPS-166 ; R-CPS-204 | export | WGS84 en interne ; exports PDF et Excel ; KML ou GeoJSON sur demande |
| Q-17 | Photos : sont-elles exigées par fuite (avant, pendant, après), avec quelles mentions ? | section 3.14 ; R-CPS-164 | écran ; stockage | 3 photos minimum par fuite (avant, pendant, après) avec date, heure et GPS, choix STEPAG |
| Q-18 | Modèles imposés : la SRM a-t-elle ses propres modèles de rapport journalier, de fiche de réparation, de rapport mensuel, d'attachement et de décompte ? Qui signe (fonction) ? En combien d'exemplaires ? | R-CPS-139 à R-CPS-141 ; R-CPS-195 ; R-FICHE-018 | export | gabarits STEPAG de la section 8, visas « STEPAG » et « S.R.M » |
| Q-19 | Date de rattachement d'une fuite au mois (réparation, réfection, constat, visa) ; date de clôture du mois ; délai de remise de l'attachement. | section 7.8 ; R-DER-012 | calcul ; export | date de réparation pour les réparations, date de réfection pour les réfections, clôture le dernier jour du mois |
| Q-20 | Décompte des mois : le délai de 12 mois se termine-t-il le 2027-10-01 ou le 2027-10-02 ? Les phases sont-elles communes à toutes les zones ou propres à chaque zone (OS partiels) ? | R-ID-010 ; R-ATT-018 ; R-ATT-011 | alertes | échéance la veille du jour anniversaire ; phases communes aux 5 zones |
| Q-21 | Obtenir le règlement des marchés de la SRM-ORI et confirmer les articles du CCAG-T applicables (57 à 59, 61, 62, 68, 73 à 76) : seuils de variation de la masse, prix nouveaux, intérêts moratoires, réserves à la réception. | section 3.4 ; R-CPS-169 ; R-CPS-076 | calcul ; alertes | seuils d'alerte provisoires de 2017 (−25 % ; +30 % par article) |
| Q-22 | À quel article renvoie « l'article 52.8 » de l'art. II-14 ? | R-CPS-094 | aucun | lire art. II-22 |
| Q-23 | Suspension des délais en cas d'attente d'une manœuvre de vanne, d'un avis avant terrassement ou d'une autorisation de voirie : formalisme ? | R-CPS-179 ; R-CPS-182 | alertes | horodater chaque demande et chaque réponse ; pas de suspension automatique |
| Q-24 | Coupure d'eau, avis aux abonnés, purge, désinfection, remise en eau : qui les fait ? | section 3.5 | écran | SRM (comme la manœuvre des vannes) |
| Q-25 | Révision des prix : quelle formule pour les prix 1 et 2 ? Quel mois d'exigibilité ? | R-CPS-053 ; R-CPS-055 | calcul | formule a pour 1, 2, 3, 6 à 13 ; formule b pour 4, 5, 10 ; champ « coefficient » saisi par décompte |
| Q-26 | Pénalité pour non-remise d'un rapport ou d'une fiche (annoncée, non chiffrée) ; délai de réfection des trottoirs. | R-CPS-080 ; R-CPS-136 | alertes | aucune pénalité ; délai de trottoir aligné sur 1 mois |
| Q-27 | Reprise sous garantie : critère du « même point » ; durée ; trace exigée. | R-CPS-048 ; R-CPS-190 | schéma | même référence SRM et distance < 2 m de la réparation d'origine ; intervention marquée « reprise sans paiement » |
| Q-28 | Nom et fonction de l'agent chargé du suivi (OS attendu sous 15 jours après le 2026-09-25) ; un accès de consultation ou de validation dans l'application est-il souhaité ? | R-CPS-013 ; R-DER-020 | rôles | rôle « agent de suivi SRM » en lecture + validation |
| Q-29 | Mesures de débit : les valeurs de télégestion seront-elles transmises (fichier, accès) ? Qui rédige les PV ? Dates des contrôles hebdomadaires. | R-CPS-108 à R-CPS-110 ; R-CPS-117 | schéma ; écran | saisie manuelle par le bureau STEPAG à partir des PV signés |
| Q-30 | L'adresse de notification : Bureau N°02 Rés. Nasrr (OS n° 01) ou 19 rue Al Kaoutar II (OS n° 02) ? | R-ID-006 | aucun | Bureau N°02 (domicile élu de l'acte d'engagement) |
| Q-31 | Base d'enregistrement 5 191 980,00 contre montant du marché 5 191 974,00 : confirmer le montant contractuel. | section 2.4 ; [F048 p.1] | calcul | 5191974.00 |

### 12.2 Questions à trancher par Issam / STEPAG

| N° | Question | Règles et sources | Impact | Hypothèse par défaut |
|---|---|---|---|---|
| Q-32 | Le marché a-t-il un exemplaire signé par la SRM (CPS, acte d'engagement) ? Le dossier ne contient que les versions signées par STEPAG. | R-BPU-003 ; R-CPS-167 | fiabilité | les versions signées par STEPAG font foi |
| Q-33 | Le matériel de détection exigé (2 corrélateurs, 2 débitmètres portables, 6 enregistreurs, 50 pré-localisateurs, 4 détecteurs acoustiques) est-il disponible et approuvé par la SRM ? Il n'apparaît pas dans la note des moyens matériels. | R-CPS-156 ; R-CPS-213 | hors application | à présenter à l'approbation de la SRM |
| Q-34 | Rapport journalier : un rapport par équipe ou un rapport commun aux 4 équipes ? (la cadence contractuelle est par équipe) | R-FICHE-003 ; R-CPS-121 | schéma ; écran | une journée de balayage par équipe et par secteur ; rapport consolidé par secteur |
| Q-35 | Numérotation des fuites : par marché, par zone ou par secteur ? | R-IDF-003 ; liste 10 bis | schéma | séquence unique par marché |
| Q-36 | Corriger le numéro de marché dans les gabarits (45000004453 → 4500004453), les titres et dates hérités (« au 30/01/2026 », « Marché N° 59/E/2016 »), les objets des bordereaux d'envoi (4500004350, 4500000169). | R-ID-003 ; section 8.4 ; section 8.5 | export | l'application génère ces documents avec le bon numéro |
| Q-37 | Suivi de stock des pièces (les pièces sont maintenant fournies par STEPAG) : à gérer dans l'application ? | R-CPS-208 ; R-ATT-027 | périmètre | hors du premier noyau ; les pièces posées sont saisies par fuite |
| Q-38 | Sens des suffixes hérités de 2017 : « RP » sur les pièces, « R » et « bis » sur les numéros de fuite. | R-ATT-024 ; section 10 | schéma | « R » = repasse ; « bis » = seconde fuite sur la même référence ; « RP » ignoré |
| Q-39 | Les bordereaux d'envoi [F050] et [F052] (objet « MARCHÉ N° 4500004350 ») concernent-ils ce marché ? | section 8.5 | aucun | gabarit non corrigé ; pièces bien destinées au marché 4500004453 |
| Q-40 | Sous-traitance éventuelle (détection) : dans la limite de 50 % et hors corps d'état principal, avec habilitation pour les données personnelles. | R-CPS-016 ; R-CPS-024 | rôles | aucun sous-traitant ; sinon comptes dédiés et accès restreints |
| Q-41 | Fin de marché : destruction des données personnelles exigée par le CPS ; quelle durée de conservation pour les besoins de STEPAG (garantie de 12 mois, litiges) ? | R-CPS-026 ; R-DER-019 | stockage | conserver jusqu'à la réception définitive, puis anonymiser les références d'abonnés |

### 12.3 Contradictions relevées

| N° | Contradiction | Sources | Valeur retenue |
|---|---|---|---|
| C-01 | 4 zones dans l'objet du marché, 5 dans le tableau n° 1 | [F056 p.3] vs [F056 p.18-19] | 5 zones |
| C-02 | numéro de marché à 11 chiffres dans les gabarits | [F001 feuille "Parametre" F5] ; [F121 A10] ; [F122 E6] vs [F035 p.1] | 4500004453 |
| C-03 | base d'enregistrement 5 191 980,00 contre 5 191 974,00 | [F048 p.1] vs [F040 p.1] | 5191974.00 |
| C-04 | adresse de notification différente sur les deux OS | [F035 p.1] vs [F036 p.1] | Bureau N°02, Rés. Nasrr |
| C-05 | matériel de détection exigé absent de la note des moyens matériels de l'offre | [F023 p.1] vs [F056 p.25-26] | l'exigence du CPS prévaut |
| C-06 | « quatre mois de la seconde période » et « huit mois » de maintien : garantie de maintien de 8 mois, payée 40 % à 4 mois et 60 % à 8 mois | [F056 p.12-13] | 2 phases de 4 mois |
| C-07 | renvoi à un « article 52.8 » inexistant | [F056 p.17] | art. II-22 |
| C-08 | acte d'engagement : « n°10008883 » puis « 10008883/1R » dans la version rectifiée | [F030 p.1] vs [F040 p.1] | 10008883/1R |
| C-09 | attachement « N°01 des travaux exécutés au 30/01/2026 » contre « Travaux executés au 31/10/2026 » ; facture datée du 16/07/2026 | [F001 feuille "attachement recap" A7] vs [F001 feuille "Parametre" A13] | 2026-10-31 |
| C-10 | Q exigé de la zone 4 (112) supérieur au plus bas historique (99), à l'inverse des autres zones | [F056 p.18-19] | valeurs du tableau n° 1 |

### 12.4 Exports et pièces à demander

| Pièce | Pourquoi | À qui |
|---|---|---|
| Export DXF (ou GeoJSON) du dessin « Reseau aep oujda.dwg », avec le système de coordonnées (Lambert Nord Maroc, Merchich ?) et la liste des calques | le DWG de 162,8 Mo n'est pas lisible sans conversion ; les planches PDF n'ont ni échelle ni coordonnées | Issam (poste AutoCAD) ; SRM pour le système de coordonnées |
| Planches des zones 3 et 5 et du secteur Sidi Yahya ; « part 2 » de Ballaoui Bas-Irfane | absentes du dossier | Issam |
| Modèles Canva éventuels (Partager → Télécharger → PDF standard) | aucun modèle Canva dans le dossier | Issam |
| Exemplaire du marché signé par la SRM ; OS désignant l'agent de suivi | non présents | SRM |
| Règlement des marchés de la SRM-ORI ; CCAG-T (décret n° 2-14-394) | renvois non résolus (section 3.4) | SRM ; texte public |
| Liste des branchements avec adresses des abonnés ; linéaire par secteur ; emplacement des points de mesure | prévus par le CPS (art. II-29), nécessaires au paramétrage | SRM |
| Procès-verbaux des mesures de débit de nuit avant intervention (Qi par zone) | point de départ du calcul des gains | SRM / STEPAG |
| Version arabe de l'avis ([F038]) : non exploitée au-delà du constat d'équivalence avec la version française | sans effet sur les règles | — |
