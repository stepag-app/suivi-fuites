// Neutralisation de l'injection de formules CSV (OWASP « CSV/Formula Injection », CWE-1236).
// Une cellule TEXTE dont le premier caractère est = + - @ (ou une tabulation / un retour) est
// interprétée comme une formule par Excel et LibreOffice à l'ouverture du fichier. Préfixée d'une
// apostrophe, elle redevient du texte (l'apostrophe est masquée par le tableur). C'est important
// car les exports CSV peuvent partir par e-mail au maître d'ouvrage (SRM).
//
// À n'appliquer qu'aux valeurs TEXTE : les nombres déjà formatés (y compris négatifs, « -5,00 »)
// ne doivent jamais être préfixés, sinon le tableur les traite comme du texte (tri/somme cassés).
export function neutraliserFormuleCsv(valeur: string): string {
  return /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
}
