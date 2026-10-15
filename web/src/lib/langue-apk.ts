'use client';

// Langue de la tablette pour la partie du panneau ouverte dans l'APK (boutons Balayage et Carte : carte, barre
// d'outils, panneau Réseau, calques, bulles, enregistrement, légende). L'APK passe `?langue=fr|ar|hybride` dans
// l'adresse ; gardée pour l'onglet (sessionStorage). Changée sur la tablette pendant que la carte est ouverte : l'APK
// envoie l'événement `langue-apk` à la page, qui se redessine sans recharger (sélection de balayage gardée).
// Mêmes termes et même règle que le dictionnaire de l'APK (mobile/src/traductions.ts) : en hybride, arabe complet,
// sauf les libellés entièrement en français (Balayage, Secteur, Diamètre, Lasso) et « Réfection ».
// Le panneau web lui-même reste en français.
import { useMemo, useSyncExternalStore } from 'react';
import { dateMaroc } from '@/lib/heure-maroc';

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
  'Satellite': { ar: 'القمر الصناعي', hyb: 'Satellite' },
  'Plan': { ar: 'الخريطة' },
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

  // Carte sans réseau (lot CH)
  'Carte sans réseau': { ar: 'الخريطة دون اتصال' },
  'Téléchargement de la carte…': { ar: 'جارٍ تنزيل الخريطة…' },
  'Prête : réseau du {r}, fond de carte du {f}.': { ar: 'جاهزة: الشبكة بتاريخ {r}، خلفية الخريطة بتاريخ {f}.' },
  'Prête : réseau du {r} (pas de fond de carte déposé : fond uni sans réseau).': {
    ar: 'جاهزة: الشبكة بتاريخ {r} (لم تُرفع خلفية الخريطة: خلفية فارغة دون اتصال).',
  },
  'Pas encore téléchargée : ouvrez cette carte avec du réseau (Wi-Fi ou 4G).': { ar: 'لم تُنزَّل بعد: افتح هذه الخريطة مع اتصال (Wi-Fi أو 4G).' },
  'Échec du téléchargement : {e}': { ar: 'فشل التنزيل: {e}' },
  'Mettre à jour maintenant': { ar: 'تحديث الآن' },
  'Hors ligne · état du {date}': { ar: 'دون اتصال · الحالة بتاريخ {date}' },

  // Bulle d'un tronçon
  'Balayé le {date}': { ar: 'مُسح في {date}' },
  ' par {qui}': { ar: ' بواسطة {qui}' },
  ' · {n} passages': { ar: ' · عدد المرات: {n}' },
  'Annuler le balayage': { ar: 'إلغاء المسح' },
  "Motif de l'annulation du dernier balayage de ce tronçon :": { ar: 'سبب إلغاء آخر مسح لهذا المقطع:' },
  'Balayage annulé.': { ar: 'تم إلغاء المسح.' },
  'Aucun balayage à annuler sur ce tronçon.': { ar: 'لا يوجد مسح لإلغائه في هذا المقطع.' },
  'Conduite': { ar: 'قناة' },
  'Branchement': { ar: 'ربط فرعي' },
  'Adduction': { ar: 'قناة جلب' },
  'Autre': { ar: 'آخر' },
  'Tronçon': { ar: 'مقطع' },
  'Longueur {l}': { ar: 'الطول {l}' },
  ' · diamètre inconnu': { ar: ' · القطر غير معروف' },

  // Carte terrain (bouton « Carte » de l'APK) : lecture seule, calques, position de l'agent
  'Calques': { ar: 'الطبقات' },
  'Afficher ou masquer les calques': { ar: 'إظهار الطبقات أو إخفاؤها' },
  'Fuites': { ar: 'التسربات' },
  'Fuites prioritaires': { ar: 'التسربات ذات الأولوية' },
  'Non réparées au-delà du délai, réfection de chaussée hors délai': {
    ar: 'لم تُصلَح بعد انقضاء الأجل، إعادة رصف الطريق خارج الأجل', hyb: 'لم تُصلَح بعد انقضاء الأجل، Réfection الطريق خارج الأجل',
  },
  'Détectée, non réparée': { ar: 'تم الكشف، لم يتم الإصلاح' },
  'Réparation en cours': { ar: 'الإصلاح جارٍ' },
  'Réparée, réfection à faire': { ar: 'تم الإصلاح، إعادة الرصف متبقية', hyb: 'تم الإصلاح، الـ Réfection متبقية' },
  'Achevée': { ar: 'مكتمل' },
  'Sans réparation': { ar: 'بدون إصلاح' },
  'Réseau et balayage': { ar: 'الشبكة والمسح' },
  'Conduites (couleur du diamètre)': { ar: 'القنوات (لون القطر)' },
  'Zones balayées': { ar: 'المناطق الممسوحة' },
  'Tronçons et secteurs déjà balayés': { ar: 'المقاطع والقطاعات التي سبق مسحها' },
  'Limites des secteurs': { ar: 'حدود القطاعات' },
  'Fond de carte': { ar: 'خلفية الخريطة' },
  'Image satellite (à partir du zoom {z})': { ar: 'صورة القمر الصناعي (ابتداءً من التكبير {z})' },
  'Image satellite à partir du zoom {z} : rapprochez-vous.': { ar: 'صورة القمر الصناعي ابتداءً من التكبير {z}: اقترب أكثر.' },
  'Ma position': { ar: 'موقعي' },
  'Point bleu : votre position GPS actuelle': { ar: 'النقطة الزرقاء: موقعك الحالي حسب GPS' },
  'Aller à ma position': { ar: 'الانتقال إلى موقعي' },
  'Recherche de la position…': { ar: 'جارٍ تحديد الموقع…' },
  'Position refusée : autorisez la localisation dans les réglages de la tablette.': {
    ar: 'تم رفض تحديد الموقع: فعّل خاصية الموقع في إعدادات الجهاز اللوحي.',
  },
  "Position introuvable. Sortez à l'air libre et réessayez.": { ar: 'تعذّر تحديد الموقع. اخرج إلى مكان مكشوف وأعد المحاولة.' },
  'Position ± {n} m': { ar: 'الموقع ± {n} م' },
  'Secteur balayé': { ar: 'قطاع ممسوح' },
  'Secteur en cours de balayage': { ar: 'قطاع في طور المسح' },
  'Lecture seule : les balayages se saisissent par le bouton « Balayage ».': {
    ar: 'للاطلاع فقط: يُسجَّل المسح من زر «مسح الشبكة».', hyb: 'للاطلاع فقط: يُسجَّل المسح من زر «Balayage».',
  },
  'Chargement des fuites…': { ar: 'جارٍ تحميل التسربات…' },
  "Pas de réseau : la carte des fuites s'affichera au retour de la connexion (bouton « Actualiser »).": {
    ar: 'لا يوجد اتصال: ستظهر خريطة التسربات عند عودة الاتصال (زر «تحديث»).',
  },
  'Fond de carte indisponible (réseau) : les fuites sont affichées sans le plan des rues.': {
    ar: 'خلفية الخريطة غير متاحة (الاتصال): تظهر التسربات بدون مخطط الشوارع.',
  },

  // Bulle d'une fuite
  'N° {numero}': { ar: 'رقم {numero}' },
  '{reference} : {valeur}': { ar: '{reference}: {valeur}' },
  'Secteur non renseigné': { ar: 'القطاع غير محدد' },
  'Détectée le {date}': { ar: 'تاريخ الكشف: {date}' },
  ' · signalée {sigle}': { ar: ' · بلاغ من {sigle}' },
  'Non réparée > {delai} h': { ar: 'لم يُصلَح > {delai} ساعة' },
  'Non communiquée {sigle}': { ar: 'لم تُبلَّغ إلى {sigle}' },
  'Réfection chaussée hors délai': { ar: 'إعادة رصف الطريق خارج الأجل', hyb: 'Réfection الطريق خارج الأجل' },
  'Réfection chaussée à faire': { ar: 'إعادة رصف الطريق متبقية', hyb: 'Réfection الطريق متبقية' },
  'Réfection trottoir à faire': { ar: 'إعادة رصف الرصيف متبقية', hyb: 'Réfection الرصيف متبقية' },
  'Ouvrir la fiche': { ar: 'فتح البطاقة' },
  'Y aller': { ar: 'الذهاب إلى الموقع' },
};

let courante: LangueApk | null = null;
const valide = (v: string | null): v is LangueApk => v === 'fr' || v === 'hybride' || v === 'ar';

// Gardée seulement une fois lue (adresse ou onglet) : pendant le passage de /session à la carte, la page s'affiche
// avant que l'adresse ne change ; un « fr » par défaut gardé à ce moment-là masquerait la langue demandée.
function lire(): LangueApk {
  if (courante) return courante;
  try {
    const p = new URLSearchParams(window.location.search).get('langue');
    if (valide(p)) window.sessionStorage.setItem(CLE, p);
    const s = window.sessionStorage.getItem(CLE);
    const l = valide(p) ? p : valide(s) ? s : null;
    if (l) courante = l;
    return l ?? 'fr';
  } catch {
    return 'fr';
  }
}

/** Page /session (APK) : langue de la suite demandée gardée pour l'onglet avant d'ouvrir la carte. */
export function memoriserLangueApk(suite: string) {
  try {
    const p = new URLSearchParams(suite.split('?')[1]?.split('#')[0] ?? '').get('langue');
    if (valide(p)) {
      window.sessionStorage.setItem(CLE, p);
      courante = p;
    }
  } catch {
    /* stockage indisponible : la carte relira l'adresse */
  }
}

// En arabe, chaque valeur insérée est isolée (FSI … PDI) : sans cela « 0 m » devient « m 0 » dans la phrase.
const remplir = (texte: string, valeurs?: Record<string, string | number>, isoler = false) =>
  valeurs
    ? texte.replace(/\{(\w+)\}/g, (m, k: string) => (k in valeurs ? (isoler ? `\u2068${valeurs[k]}\u2069` : String(valeurs[k])) : m))
    : texte;

/** Texte dans la langue de la tablette ; `fr` : texte français déjà composé (pluriels). Inconnu : tel quel. */
export function traduire(langue: LangueApk, cle: string, valeurs?: Record<string, string | number>, fr?: string): string {
  if (langue === 'fr') return fr ?? remplir(cle, valeurs);
  const e = TRADUCTIONS_BALAYAGE[cle];
  if (!e) return fr ?? remplir(cle, valeurs);
  return RLM + remplir(langue === 'hybride' ? e.hyb ?? e.ar : e.ar, valeurs, true);
}

/** Hors composant (bulles de la carte construites à la main) : langue lue dans l'adresse ou l'onglet. */
export const langueApk = (): LangueApk => (typeof window === 'undefined' ? 'fr' : lire());

const abonnes = new Set<() => void>();

/**
 * Langue changée sur la tablette, carte ouverte : gardée pour l'onglet et dans l'adresse (un rechargement de la page
 * la garde), puis les écrans abonnés se redessinent.
 */
export function changerLangueApk(l: string) {
  if (!valide(l) || l === courante) return;
  courante = l;
  try {
    window.sessionStorage.setItem(CLE, l);
    const adresse = new URL(window.location.href);
    adresse.searchParams.set('langue', l);
    window.history.replaceState(window.history.state, '', adresse);
  } catch {
    /* stockage indisponible : la langue vaut pour cette page */
  }
  abonnes.forEach((f) => f());
}

// Envoyé par l'APK (injectJavaScript) quand l'agent change de langue, carte ouverte.
if (typeof window !== 'undefined') {
  window.addEventListener('langue-apk', (e) => changerLangueApk(String((e as CustomEvent).detail)));
}

function sAbonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Langue de la tablette (français au rendu serveur, puis celle de l'adresse) et fonctions de traduction. */
export function useLangueApk() {
  const langue = useSyncExternalStore(sAbonner, lire, () => 'fr' as LangueApk);
  return useMemo(() => ({
    langue,
    rtl: langue !== 'fr',
    tb: (cle: string, valeurs?: Record<string, string | number>, fr?: string) => traduire(langue, cle, valeurs, fr),
  }), [langue]);
}

/** « Balayé le 05/10/2026 par Ahmed · 2 passages » dans la langue de la tablette (bulle, messages). */
export function texteEtatTronconApk(etat: { balaye: boolean; dernier: string | null; agent: string | null; passages: number } | undefined): string {
  const l = langueApk();
  if (!etat || !etat.balaye) return traduire(l, 'Non balayé');
  const qui = etat.agent ?? '';
  const quand = etat.dernier ? dateMaroc(etat.dernier) : '—';
  const base = traduire(l, 'Balayé le {date}', { date: quand }) + (qui ? traduire(l, ' par {qui}', { qui }).replace(/^‏/, '') : '');
  return etat.passages > 1 ? base + traduire(l, ' · {n} passages', { n: etat.passages }).replace(/^‏/, '') : base;
}
