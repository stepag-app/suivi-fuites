'use client';

// Langue de la tablette pour la partie du panneau ouverte dans l'APK (bouton Balayage : carte, barre d'outils,
// panneau Réseau, enregistrement, légende). L'APK passe `?langue=ar|hybride` dans l'adresse ; gardée pour l'onglet
// (sessionStorage). Mêmes termes et même règle que le dictionnaire de l'APK (mobile/src/traductions.ts) : en hybride,
// arabe complet, sauf les libellés entièrement en français (Balayage, Secteur, Diamètre, Lasso) et « Réfection ».
// Le panneau web lui-même reste en français.
import { useMemo, useSyncExternalStore } from 'react';

export type LangueApk = 'fr' | 'hybride' | 'ar';
interface Entree { ar: string; hyb?: string }

const CLE = 'suivi-fuites:langue-apk';
const RLM = '‏';

export const TRADUCTIONS_BALAYAGE: Record<string, Entree> = {
  // Barre du mode balayage et commandes de la carte
  'Réseau': { ar: 'الشبكة' },
  '{n} tronçons · {l}': { ar: 'عدد المقاطع: {n} · {l}' },
  ' · dont {n} déjà balayés': { ar: ' · منها {n} سبق مسحها' },
  'Toucher': { ar: 'لمس' },
  'Lasso': { ar: 'تحديد حرّ', hyb: 'Lasso' },
  'Prolonger': { ar: 'تمديد' },
  'Désélectionner tout': { ar: 'إلغاء تحديد الكل' },
  'Enregistrer…': { ar: 'حفظ…' },
  'Quitter le balayage': { ar: 'الخروج من مسح الشبكة' },
  'Préparation des tronçons…': { ar: 'جارٍ تجهيز المقاطع…' },
  'Secteurs, légende et enregistrement': { ar: 'القطاعات ومفتاح الخريطة والحفظ' },
  'Rien à prolonger : jonction à 3 branches, bout de rue ou changement de direction (± 20°).': {
    ar: 'لا شيء للتمديد: تقاطع بثلاثة فروع أو نهاية شارع أو تغيّر في الاتجاه (± 20°).',
  },
  'Déjà balayé : {etat}. Ce sera un second passage.': { ar: 'سبق مسحه: {etat}. سيكون مرورًا ثانيًا.' },
  '{n} tronçons déjà balayés dans la sélection : seconds passages.': { ar: 'في التحديد {n} مقاطع سبق مسحها: مرور ثانٍ.' },
  '{n} balayages enregistrés.': { ar: 'تم حفظ عمليات المسح: {n}.' },
  "{n} balayages gardés sur l'appareil : envoi au retour du réseau.": { ar: 'عمليات مسح محفوظة على الجهاز: {n}، تُرسَل عند عودة الاتصال.' },
  'Erreur : {e}': { ar: 'خطأ: {e}' },
  '{n} sur la carte': { ar: 'على الخريطة: {n}' },
  ' · {n} sans position': { ar: ' · بدون موقع: {n}' },
  'Recentrer': { ar: 'إعادة التمركز' },
  'Actualiser': { ar: 'تحديث' },
  'Image satellite': { ar: 'صورة القمر الصناعي' },
  'Chargement de la carte…': { ar: 'جارٍ تحميل الخريطة…' },

  // Panneau Réseau
  "Réseau d'eau": { ar: 'شبكة الماء' },
  'Fermer': { ar: 'إغلاق' },
  'Secteurs': { ar: 'القطاعات', hyb: 'Secteurs' },
  'Légende': { ar: 'مفتاح الخريطة' },
  'Balayage': { ar: 'مسح الشبكة', hyb: 'Balayage' },
  'Afficher le réseau': { ar: 'إظهار الشبكة' },
  'Chargement des zones et secteurs…': { ar: 'جارٍ تحميل المناطق والقطاعات…' },
  'Secteur': { ar: 'القطاع', hyb: 'Secteur' },
  'Diamètre': { ar: 'القطر', hyb: 'Diamètre' },
  'Tout': { ar: 'الكل' },
  'Aucun': { ar: 'لا شيء' },
  '{n} secteurs · {l}': { ar: 'عدد القطاعات: {n} · {l}' },
  ' · {p} % balayé': { ar: ' · {p} % ممسوح' },
  '{p} % balayé': { ar: '{p} % ممسوح' },
  ' · chargement ({n})…': { ar: ' · جارٍ التحميل ({n})…' },
  ' · préparation ({n})…': { ar: ' · جارٍ التجهيز ({n})…' },
  'Zone {n} · {libelle}': { ar: 'المنطقة {n} · {libelle}' },
  'Aucun secteur': { ar: 'لا يوجد قطاع' },
  'Tronçons non zonés': { ar: 'مقاطع غير مُلحقة بقطاع' },
  'Aucune zone ni secteur dans ce marché (Paramètres › Secteurs).': { ar: 'لا توجد منطقة ولا قطاع في هذه الصفقة (الإعدادات › القطاعات).' },
  'Affichage par secteur : le réseau a changé depuis la dernière génération des tuiles (Paramètres › Réseau › Tuiles).': {
    ar: 'عرض حسب القطاع: تغيّرت الشبكة منذ آخر توليد للمربعات (الإعدادات › الشبكة › المربعات).',
  },

  // Légende
  'Tronçon balayé': { ar: 'مقطع ممسوح' },
  'Repassé (2e passage ou plus)': { ar: 'مرور ثانٍ أو أكثر' },
  'Non balayé': { ar: 'غير ممسوح' },
  "Diamètre jusqu'à 63 mm": { ar: 'القطر حتى 63 مم' },
  'Diamètre 75 à 110 mm': { ar: 'القطر من 75 إلى 110 مم' },
  'Diamètre 125 à 200 mm': { ar: 'القطر من 125 إلى 200 مم' },
  'Diamètre 250 à 400 mm': { ar: 'القطر من 250 إلى 400 مم' },
  'Diamètre plus de 400 mm': { ar: 'القطر أكثر من 400 مم' },
  'Diamètre inconnu': { ar: 'القطر غير معروف' },
  'Non zoné': { ar: 'غير مُلحق بقطاع' },
  'Vanne': { ar: 'صمام' },
  "Bouche d'incendie": { ar: 'فوهة إطفاء الحريق' },
  'Ventouse': { ar: 'صمام هواء' },
  'Vidange': { ar: 'صمام تفريغ' },
  'Compteur': { ar: 'عداد' },
  'Réservoir': { ar: 'خزان' },
  'Jonction, extrémité': { ar: 'تقاطع، طرف' },
  'Nœuds à partir du zoom 15, sigles à partir du zoom 17. Diamètre et matériau écrits le long des conduites de près (« Ø110 PVC », zoom 16).': {
    ar: 'تظهر العُقد ابتداءً من التكبير 15، والرموز من التكبير 17. يُكتب القطر والمادة على طول القنوات عن قرب («Ø110 PVC»، تكبير 16).',
  },
  'Affichez le réseau (onglet Secteurs) pour voir sa légende.': { ar: 'أظهِر الشبكة (تبويب القطاعات) لرؤية مفتاح الخريطة.' },
  'Affichez le réseau (onglet Secteurs) pour balayer.': { ar: 'أظهِر الشبكة (تبويب القطاعات) للمسح.' },

  // Enregistrement d'un balayage
  'Quitter le mode balayage': { ar: 'الخروج من وضع مسح الشبكة' },
  'Mode balayage': { ar: 'وضع مسح الشبكة' },
  "Touchez les tronçons balayés (un second appui retire le tronçon), ou tracez un lasso au doigt ; « Prolonger » suit la rue jusqu'à la prochaine jonction. Les outils sont dans la barre en haut de la carte.": {
    ar: 'المس المقاطع التي مسحتها (لمسة ثانية تُلغي المقطع)، أو ارسم تحديدًا حرًّا بإصبعك؛ «تمديد» يتبع الشارع حتى التقاطع التالي. الأدوات في الشريط أعلى الخريطة.',
  },
  'Équipe': { ar: 'الفريق' },
  '— sans équipe —': { ar: '— بدون فريق —' },
  'Date du balayage': { ar: 'تاريخ المسح' },
  'Méthode (facultative)': { ar: 'الطريقة (اختيارية)' },
  'Écoute (sol, bouches à clé)': { ar: 'الإنصات (الأرض، فتحات المحابس)' },
  'Corrélation acoustique': { ar: 'الارتباط الصوتي' },
  'Prélocalisation': { ar: 'التحديد المسبق' },
  'Enregistreurs de bruit': { ar: 'مسجّلات الضجيج' },
  'Observation (facultative)': { ar: 'ملاحظة (اختيارية)' },
  '{n} tronçons déjà balayés': { ar: 'مقاطع سبق مسحها: {n}' },
  " : enregistrés comme second passage (gardé dans l'historique, compté à part, jamais payé deux fois).": {
    ar: '، تُسجَّل كمرور ثانٍ (تبقى في السجل، تُحسب على حدة، ولا تُؤدّى مرتين).',
  },
  'Motif du second passage': { ar: 'سبب المرور الثاني' },
  '— à choisir —': { ar: '— اختر —' },
  'Fuite suspectée': { ar: 'تسرب مشتبه به' },
  'Contrôle': { ar: 'مراقبة' },
  'Autre (voir observation)': { ar: 'آخر (انظر الملاحظة)' },
  'Enregistrement…': { ar: 'جارٍ الحفظ…' },
  'Enregistrer ({n})': { ar: 'حفظ ({n})' },
  'Enregistrer': { ar: 'حفظ' },
  'Vider la sélection': { ar: 'إفراغ التحديد' },
  '{n} balayages à envoyer.': { ar: 'عمليات مسح في انتظار الإرسال: {n}.' },
  'Envoyer maintenant': { ar: 'إرسال الآن' },
  'Pour annuler un balayage : quittez le mode balayage, touchez le tronçon puis « Annuler le balayage ».': {
    ar: 'لإلغاء مسح: اخرج من وضع المسح، المس المقطع ثم «إلغاء المسح».',
  },

  // Bulle d'un tronçon
  'Balayé le {date}': { ar: 'مُسح في {date}' },
  ' par {qui}': { ar: ' بواسطة {qui}' },
  ' · {n} passages': { ar: ' · عدد المرات: {n}' },
  'Annuler le balayage': { ar: 'إلغاء المسح' },
  "Motif de l'annulation du dernier balayage de ce tronçon :": { ar: 'سبب إلغاء آخر مسح لهذا المقطع:' },
  'Balayage annulé.': { ar: 'تم إلغاء المسح.' },
  'Aucun balayage à annuler sur ce tronçon.': { ar: 'لا يوجد مسح لإلغائه في هذا المقطع.' },
};

// Mots des noms d'équipe saisis en français dans la base (« Équipe détection 1 », « Réparation A (démo) »).
const MOTS_EQUIPE: [RegExp, string, string?][] = [
  [/\bÉquipe\b/gi, 'فريق'],
  [/\bDétection\b/gi, 'الكشف'],
  [/\bRéparation\b/gi, 'الإصلاح'],
  [/\bRéfection\b/gi, 'إعادة الرصف', 'Réfection'],
  [/\(démo\)/gi, '(تجريبي)'],
];

let courante: LangueApk | null = null;
const valide = (v: string | null): v is LangueApk => v === 'fr' || v === 'hybride' || v === 'ar';

function lire(): LangueApk {
  if (courante) return courante;
  try {
    const p = new URLSearchParams(window.location.search).get('langue');
    if (valide(p)) window.sessionStorage.setItem(CLE, p);
    const s = window.sessionStorage.getItem(CLE);
    courante = valide(p) ? p : valide(s) ? s : 'fr';
  } catch {
    courante = 'fr';
  }
  return courante;
}

const remplir = (texte: string, valeurs?: Record<string, string | number>) =>
  valeurs ? texte.replace(/\{(\w+)\}/g, (m, k: string) => (k in valeurs ? String(valeurs[k]) : m)) : texte;

/** Texte dans la langue de la tablette ; `fr` : texte français déjà composé (pluriels). Inconnu : tel quel. */
export function traduire(langue: LangueApk, cle: string, valeurs?: Record<string, string | number>, fr?: string): string {
  if (langue === 'fr') return fr ?? remplir(cle, valeurs);
  const e = TRADUCTIONS_BALAYAGE[cle];
  if (!e) return fr ?? remplir(cle, valeurs);
  return RLM + remplir(langue === 'hybride' ? e.hyb ?? e.ar : e.ar, valeurs);
}

/** Nom d'équipe venu de la base, mots connus traduits. */
export function traduireEquipe(langue: LangueApk, libelle: string): string {
  if (langue === 'fr') return libelle;
  return MOTS_EQUIPE.reduce((t, [motif, ar, hyb]) => t.replace(motif, langue === 'hybride' ? hyb ?? ar : ar), libelle);
}

/** Hors composant (bulles de la carte construites à la main) : langue lue dans l'adresse ou l'onglet. */
export const langueApk = (): LangueApk => (typeof window === 'undefined' ? 'fr' : lire());

const sAbonner = () => () => undefined;

/** Langue de la tablette (français au rendu serveur, puis celle de l'adresse) et fonctions de traduction. */
export function useLangueApk() {
  const langue = useSyncExternalStore(sAbonner, lire, () => 'fr' as LangueApk);
  return useMemo(() => ({
    langue,
    rtl: langue !== 'fr',
    tb: (cle: string, valeurs?: Record<string, string | number>, fr?: string) => traduire(langue, cle, valeurs, fr),
    te: (libelle: string) => traduireEquipe(langue, libelle),
  }), [langue]);
}

/** « Balayé le 05/10/2026 par Ahmed (Détection 1) · 2 passages » dans la langue de la tablette (bulle, messages). */
export function texteEtatTronconApk(etat: { balaye: boolean; dernier: string | null; agent: string | null; equipe: string | null; passages: number } | undefined): string {
  const l = langueApk();
  if (!etat || !etat.balaye) return traduire(l, 'Non balayé');
  const qui = [etat.agent, etat.equipe ? `(${traduireEquipe(l, etat.equipe)})` : null].filter(Boolean).join(' ');
  const quand = etat.dernier ? new Date(etat.dernier).toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' }) : '—';
  const base = traduire(l, 'Balayé le {date}', { date: quand }) + (qui ? traduire(l, ' par {qui}', { qui }).replace(/^‏/, '') : '');
  return etat.passages > 1 ? base + traduire(l, ' · {n} passages', { n: etat.passages }).replace(/^‏/, '') : base;
}
