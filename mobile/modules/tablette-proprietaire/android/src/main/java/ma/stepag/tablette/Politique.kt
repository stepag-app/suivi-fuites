package ma.stepag.tablette

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.PersistableBundle
import android.os.Process
import android.os.UserManager
import android.provider.Settings
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Politique de la tablette quand Suivi fuites en est propriétaire (lot TP, docs/lots/lot-tablette-proprietaire.md).
 *
 * Fermée (état normal) : applis à icône hors de la liste gardée et services en arrière-plan cachés (une appli cachée
 * ne tourne plus), installations, comptes, réinitialisation, utilisateurs et mode sans échec interdits, 4G réservée à
 * Suivi fuites et à ses dépendances, heure automatique, autorisations de Suivi fuites accordées.
 * Déverrouillée (code temporaire du panneau web) : Paramètres et Play Store remontrés, installations et comptes permis,
 * rien de nouveau n'est caché ; au reverrouillage, les applis installées entre-temps restent visibles sur la tablette.
 *
 * Idempotente : appliquée à chaque démarrage de l'appli, au redémarrage de la tablette et après une mise à jour.
 */
object Politique {
  const val ETIQUETTE = "TabletteProprietaire"
  private const val PREFS = "tablette-proprietaire"
  private const val APPLI = "ma.stepag.suivifuites"
  private const val APPLI_DEV = "ma.stepag.suivifuites.dev"
  private const val PARAMETRES = "com.android.settings"
  private const val PLAY_STORE = "com.android.vending"

  /** Applis gardées visibles (décision d'Issam du 2026-10-11). */
  private val GARDEES = setOf(
    APPLI,
    "com.android.camera",
    "com.google.android.apps.maps",
    "com.google.android.dialer",
    "com.google.android.contacts",
    "com.google.android.apps.messaging",
    "com.whatsapp",
  )

  /** Jamais cachées, même avec une icône : sans elles, plus d'écran d'accueil, de clavier, de téléphone ou de services Google. */
  private val JAMAIS = setOf(
    "android",
    "com.android.systemui",
    "com.miui.home",
    "com.google.android.gms",
    "com.google.android.gsf",
    "com.google.android.webview",
    "com.android.webview",
    "com.google.android.permissioncontroller",
    "com.android.permissioncontroller",
    "com.google.android.packageinstaller",
    "com.android.packageinstaller",
    "com.miui.powerkeeper",
    "com.xiaomi.xmsf",
    "com.lbe.security.miui",
    "com.miui.securitycore",
    "com.android.phone",
    "com.android.providers.telephony",
    "com.android.server.telecom",
    "com.google.android.inputmethod.latin",
  )

  /**
   * Remontrées pendant un déverrouillage : Paramètres, Play Store, et la « Sécurité » de Xiaomi, dont les pages règlent
   * le démarrage automatique, la batterie et les fenêtres en arrière-plan de Suivi fuites (HyperOS les exige pour que
   * l'appli reçoive ses diffusions et se rouvre seule après une mise à jour : préparation de la tablette).
   */
  private val VISIBLES_DEVERROUILLEE = setOf(PARAMETRES, PLAY_STORE, "com.miui.securitycenter")

  /** 4G permise : Suivi fuites et ses dépendances (notifications, position, WebView du balayage), Maps, WhatsApp. */
  private val DONNEES_PERMISES = setOf(
    APPLI,
    APPLI_DEV,
    "com.google.android.gms",
    "com.google.android.gsf",
    "com.google.android.webview",
    "com.android.webview",
    "com.google.android.apps.maps",
    "com.whatsapp",
  )

  /**
   * Services et applis sans usage au travail, cachés (donc arrêtés) même sans icône : la liste du ménage de la Redmi
   * (outils/tablettes/applis-retirees.txt et applis-desactivees.txt ; les deux listes et celle-ci sont comparées par
   * mobile/essais/tablette-listes.test.mjs).
   */
  val SERVICES_CACHES = setOf(
    "com.king.candycrushsaga", "com.oakever.tiletrip", "com.bekids.art", "com.zhiliaoapp.musically",
    "com.netflix.mediaclient", "com.spotify.music", "com.linkedin.android", "com.lemon.lvoverseas", "com.lemon.ccpadpro",
    "com.google.android.youtube", "com.google.android.apps.youtube.music", "com.google.android.videos",
    "com.miui.videoplayer", "com.miui.player", "com.miui.fm", "com.miui.fmservice", "cn.wps.moffice_eng",
    "cn.wps.xiaomi.abroad.lite", "com.xiaomi.calendar", "com.android.deskclock", "com.miui.mediaeditor", "com.miui.phrase",
    "com.android.chrome", "com.mi.globalbrowser", "com.mi.android.globalFileexplorer", "com.google.android.apps.nbu.files",
    "com.mi.global.shop", "com.xiaomi.smarthome", "com.google.android.apps.chromecast.app", "com.xiaomi.discover",
    "com.xiaomi.payment", "com.google.android.gm", "com.google.android.apps.docs", "com.google.android.apps.photos",
    "com.google.android.apps.tachyon", "com.google.android.apps.subscriptions.red", "com.google.android.apps.bard",
    "com.google.android.projection.gearhead", "com.google.android.apps.safetyhub", "com.google.android.apps.adm",
    "com.google.android.apps.restore", "com.google.android.apps.wellbeing", "com.google.ambient.streaming",
    "com.android.hotwordenrollment.okgoogle", "com.android.hotwordenrollment.xgoogle", "com.miui.msa.global",
    "com.miui.analytics", "com.miui.bugreport", "com.miui.miservice", "com.miui.cleaner", "com.xiaomi.barrage",
    "com.miui.huanji", "com.xiaomi.mi_connect_service", "com.xiaomi.miralink", "com.miui.mishare.connectivity",
    "com.milink.service", "com.microsoftsdk.crossdeviceservicebroker", "com.google.android.googlequicksearchbox",
    "com.android.providers.downloads.ui",
    "com.miui.notes", "com.miui.creation", "com.miui.calculator", "com.miui.weather2", "com.android.soundrecorder",
    "com.miui.screenrecorder", "com.xiaomi.scanner",
  )

  private val INTERDICTIONS = listOf(
    UserManager.DISALLOW_INSTALL_APPS,
    UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
    UserManager.DISALLOW_MODIFY_ACCOUNTS,
    UserManager.DISALLOW_FACTORY_RESET,
    UserManager.DISALLOW_ADD_USER,
    UserManager.DISALLOW_SAFE_BOOT,
  )
  private val LEVEES_DEVERROUILLEE = setOf(
    UserManager.DISALLOW_INSTALL_APPS,
    UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
    UserManager.DISALLOW_MODIFY_ACCOUNTS,
  )

  private fun permissionsAccordees(): List<String> = buildList {
    add(Manifest.permission.ACCESS_FINE_LOCATION)
    add(Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= 29) add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    add(Manifest.permission.CAMERA)
    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // État mémorisé

  private fun prefs(ctx: Context): SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun dpm(ctx: Context) = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
  fun admin(ctx: Context) = ComponentName(ctx, RecepteurAdmin::class.java)

  fun estProprietaire(ctx: Context): Boolean = dpm(ctx).isDeviceOwnerApp(ctx.packageName)

  /** « agent » (préparée par QR code) ou « essai » (préparée par adb, la Redmi : adb et appli DEV gardés). */
  fun profil(ctx: Context): String = prefs(ctx).getString("profil", null) ?: "essai"

  fun retenirProfil(ctx: Context, extras: PersistableBundle?, parDefaut: String) {
    val p = extras?.getString("profil")?.takeIf { it == "agent" || it == "essai" } ?: parDefaut
    prefs(ctx).edit().putString("profil", p).apply()
    extras?.getStringArray("gardees")?.let { prefs(ctx).edit().putStringSet("gardees", it.toSet()).apply() }
  }

  fun deverrouilleeJusqua(ctx: Context): Long = prefs(ctx).getLong("jusqua", 0L)
  private fun estDeverrouillee(ctx: Context) = deverrouilleeJusqua(ctx) > System.currentTimeMillis()

  private fun gardees(ctx: Context): Set<String> {
    val g = GARDEES + (prefs(ctx).getStringSet("gardees", emptySet()) ?: emptySet()) + ctx.packageName
    return if (profil(ctx) == "essai") g + APPLI_DEV else g
  }

  fun appareil(ctx: Context): String =
    Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: "inconnu"

  fun etat(ctx: Context): JSONObject {
    val proprietaire = estProprietaire(ctx)
    return JSONObject()
      .put("proprietaire", proprietaire)
      .put("profil", profil(ctx))
      .put("deverrouilleeJusqua", if (proprietaire && estDeverrouillee(ctx)) deverrouilleeJusqua(ctx) else JSONObject.NULL)
      .put("cachees", JSONArray((prefs(ctx).getStringSet("cachees", emptySet()) ?: emptySet()).sorted()))
      .put("gardees", JSONArray((prefs(ctx).getStringSet("gardees", emptySet()) ?: emptySet()).sorted()))
      .put("appareil", appareil(ctx))
      .put("modele", "${Build.MANUFACTURER} ${Build.MODEL}")
      .put("android", Build.VERSION.RELEASE)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Événements à journaliser par l'appli (table journal_tablettes) dès qu'elle a le réseau.

  @Synchronized
  fun noterEvenement(ctx: Context, action: String, details: JSONObject = JSONObject()) {
    val liste = evenements(ctx)
    liste.put(JSONObject().put("action", action).put("details", details).put("le", System.currentTimeMillis()))
    while (liste.length() > 50) liste.remove(0)
    prefs(ctx).edit().putString("evenements", liste.toString()).apply()
    Log.i(ETIQUETTE, "$action $details")
  }

  fun evenements(ctx: Context): JSONArray =
    runCatching { JSONArray(prefs(ctx).getString("evenements", "[]")) }.getOrDefault(JSONArray())

  @Synchronized
  fun acquitterEvenements(ctx: Context, n: Int) {
    val liste = evenements(ctx)
    val reste = JSONArray()
    for (i in n until liste.length()) reste.put(liste.get(i))
    prefs(ctx).edit().putString("evenements", reste.toString()).apply()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Application de la politique

  private fun installee(pm: PackageManager, paquet: String): Boolean = try {
    val info = pm.getApplicationInfo(paquet, PackageManager.MATCH_UNINSTALLED_PACKAGES)
    info.flags and ApplicationInfo.FLAG_INSTALLED != 0
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }

  /** Paquets qui ont une icône sur l'écran d'accueil (les applis cachées n'y figurent plus). */
  private fun lanceurs(pm: PackageManager): Set<String> =
    pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
      .mapNotNull { it.activityInfo?.packageName }
      .toSet()

  private fun paquetsInstalles(pm: PackageManager): List<ApplicationInfo> = pm.getInstalledApplications(0)

  @Synchronized
  fun appliquer(ctx: Context): JSONObject {
    val bilan = JSONObject().put("proprietaire", false)
    if (!estProprietaire(ctx)) return bilan
    val dpm = dpm(ctx)
    val admin = admin(ctx)
    val pm = ctx.packageManager
    val ouverte = estDeverrouillee(ctx)
    val gardees = gardees(ctx)
    bilan.put("proprietaire", true).put("profil", profil(ctx)).put("deverrouillee", ouverte)
    // 0. Wi-Fi du volet : la fenêtre de l'appli remplace la page Wi-Fi des Paramètres, cachés pendant le verrouillage.
    runCatching { ActiviteWifi.activerRedirection(ctx, !ouverte) }

    // 1. Applis. Déverrouillée, rien de nouveau n'est caché (une appli installée par l'administrateur doit rester).
    val dejaCachees = prefs(ctx).getStringSet("cachees", emptySet()) ?: emptySet()
    val candidates = lanceurs(pm) + SERVICES_CACHES + dejaCachees + VISIBLES_DEVERROUILLEE
    val cachees = mutableSetOf<String>()
    val refus = JSONArray()
    for (paquet in candidates) {
      if (paquet in gardees || paquet in JAMAIS || !installee(pm, paquet)) continue
      val cachee = dpm.isApplicationHidden(admin, paquet)
      val voulue = if (ouverte) cachee && paquet !in VISIBLES_DEVERROUILLEE else true
      if (cachee != voulue && !dpm.setApplicationHidden(admin, paquet, voulue)) refus.put(paquet)
      if (dpm.isApplicationHidden(admin, paquet)) cachees.add(paquet)
    }
    for (paquet in gardees) {
      if (installee(pm, paquet) && dpm.isApplicationHidden(admin, paquet)) dpm.setApplicationHidden(admin, paquet, false)
    }
    prefs(ctx).edit().putStringSet("cachees", cachees).apply()
    bilan.put("cachees", cachees.size).put("refusCacher", refus)

    // 2. Interdictions.
    val posees = JSONArray()
    for (r in INTERDICTIONS) {
      if (ouverte && r in LEVEES_DEVERROUILLEE) dpm.clearUserRestriction(admin, r)
      else {
        dpm.addUserRestriction(admin, r)
        posees.put(r)
      }
    }
    if (profil(ctx) == "agent") {
      dpm.addUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES)
      posees.put(UserManager.DISALLOW_DEBUGGING_FEATURES)
    } else {
      dpm.clearUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES)
    }
    bilan.put("interdictions", posees)

    // 3. 4G réservée. Applis du système (uid < 10000) et applis persistantes (téléphone, appels en 4G) jamais coupées.
    if (Build.VERSION.SDK_INT >= 28) {
      val privees = paquetsInstalles(pm)
        .filter { it.uid >= Process.FIRST_APPLICATION_UID && it.flags and ApplicationInfo.FLAG_PERSISTENT == 0 }
        .map { it.packageName }
        .filter { it !in DONNEES_PERMISES && !(ouverte && it == PLAY_STORE) }
      val refusees = runCatching { dpm.setMeteredDataDisabledPackages(admin, privees) }
        .onFailure { Log.w(ETIQUETTE, "4G : ${it.message}") }
        .getOrDefault(emptyList())
      bilan.put("sans4g", privees.size - refusees.size).put("sans4gRefusees", JSONArray(refusees))
    }

    // 4. Localisation allumée (suivi GPS, et liste des réseaux Wi-Fi), heure automatique (heures des fuites fiables). Le fuseau reste réglable : celui du Maroc peut être en retard
    // dans Android (mobile/src/date-heure.tsx).
    runCatching {
      if (Build.VERSION.SDK_INT >= 30) dpm.setAutoTimeEnabled(admin, true)
      else @Suppress("DEPRECATION") dpm.setAutoTimeRequired(admin, true)
    }.onFailure { Log.w(ETIQUETTE, "heure automatique : ${it.message}") }
    if (Build.VERSION.SDK_INT >= 30) {
      runCatching { dpm.setLocationEnabled(admin, true) }.onFailure { Log.w(ETIQUETTE, "localisation : ${it.message}") }
    }
    corrigerFuseauMaroc(ctx, dpm, admin, bilan)

    // 5. Suivi fuites jamais arrêtée par l'agent ni endormie par Android (suivi GPS) : ni arrêt forcé ni effacement des
    // données depuis les Paramètres, exemption des paliers d'inactivité (App Standby). L'économiseur de batterie
    // d'HyperOS reste un réglage de la préparation (mode d'emploi du panneau).
    val protegees = setOf(ctx.packageName, APPLI).filter { installee(pm, it) }
    if (Build.VERSION.SDK_INT >= 30) {
      runCatching { dpm.setUserControlDisabledPackages(admin, protegees) }
        .onFailure { Log.w(ETIQUETTE, "paquets protégés : ${it.message}") }
    }

    // 6. Autorisations de Suivi fuites (et de l'appli normale quand l'appli DEV est propriétaire).
    val permissions = JSONObject()
    for (paquet in protegees) {
      for (p in permissionsAccordees()) {
        val ok = runCatching {
          dpm.setPermissionGrantState(admin, paquet, p, DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED)
        }.getOrDefault(false)
        if (!ok) permissions.put("$paquet ${p.substringAfterLast('.')}", false)
      }
    }
    bilan.put("permissionsRefusees", permissions)

    if (ouverte) programmerFin(ctx, deverrouilleeJusqua(ctx))
    Log.i(ETIQUETTE, "politique : $bilan")
    return bilan
  }

  /** Bascule du Maroc à UTC+0 sans heure d'été (tzdata 2026d) : 2026-09-20 01:00 UTC. */
  private const val BASCULE_MAROC_UTC_MS = 1789866000000L

  /**
   * Tablette réglée sur Africa/Casablanca avec une base des fuseaux d'avant 2026d (Redmi Pad 2, HyperOS 2.0 : encore
   * UTC+1) : l'heure affichée a une heure d'avance. Fuseau fixé à GMT, fuseau automatique coupé (il remettrait
   * Casablanca) ; l'heure elle-même reste automatique. Sans effet sur une tablette à jour (décalage déjà nul).
   */
  private fun corrigerFuseauMaroc(ctx: Context, dpm: DevicePolicyManager, admin: ComponentName, bilan: JSONObject) {
    if (Build.VERSION.SDK_INT < 30) return
    val maintenant = System.currentTimeMillis()
    val casablanca = java.util.TimeZone.getTimeZone("Africa/Casablanca")
    if (java.util.TimeZone.getDefault().id != casablanca.id || maintenant < BASCULE_MAROC_UTC_MS || casablanca.getOffset(maintenant) == 0) return
    runCatching {
      dpm.setAutoTimeZoneEnabled(admin, false)
      check(dpm.setTimeZone(admin, "GMT")) { "fuseau refusé" }
      bilan.put("fuseau", "GMT")
      noterEvenement(ctx, "fuseau", JSONObject().put("avant", casablanca.id).put("apres", "GMT"))
    }.onFailure { Log.w(ETIQUETTE, "fuseau : ${it.message}") }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Déverrouillage par code (le code est vérifié par le serveur avant l'appel)

  @Synchronized
  fun deverrouiller(ctx: Context, minutes: Int): JSONObject {
    check(estProprietaire(ctx)) { "Suivi fuites n'est pas propriétaire de cette tablette." }
    require(minutes in 1..24 * 60) { "Durée invalide : $minutes min" }
    val p = prefs(ctx)
    val edition = p.edit().putLong("jusqua", System.currentTimeMillis() + minutes * 60_000L)
    // Applis présentes avant l'ouverture, cachées comprises : les nouvelles resteront visibles au reverrouillage.
    if (!estDeverrouillee(ctx)) {
      val avant = ctx.packageManager.getInstalledApplications(PackageManager.MATCH_UNINSTALLED_PACKAGES)
      edition.putStringSet("avant", avant.map { it.packageName }.toSet())
    }
    edition.apply()
    return appliquer(ctx)
  }

  @Synchronized
  fun reverrouiller(ctx: Context, automatique: Boolean): JSONObject {
    val p = prefs(ctx)
    val avant = p.getStringSet("avant", null)
    val nouvelles = if (avant == null) emptySet() else {
      lanceurs(ctx.packageManager)
        .filter { it !in avant && it !in GARDEES && it !in JAMAIS && it !in VISIBLES_DEVERROUILLEE && it !in SERVICES_CACHES }
        .toSet()
    }
    p.edit()
      .putLong("jusqua", 0L)
      .remove("avant")
      .putStringSet("gardees", (p.getStringSet("gardees", emptySet()) ?: emptySet()) + nouvelles)
      .apply()
    annulerFin(ctx)
    val bilan = appliquer(ctx)
    noterEvenement(ctx, "reverrouillage", JSONObject().put("automatique", automatique).put("gardees", JSONArray(nouvelles.sorted())))
    return bilan
  }

  /** Au démarrage de l'appli ou de la tablette : reverrouille si l'heure est passée, sinon applique. */
  fun verifier(ctx: Context): JSONObject =
    if (estProprietaire(ctx) && deverrouilleeJusqua(ctx) != 0L && !estDeverrouillee(ctx)) reverrouiller(ctx, true)
    else appliquer(ctx)

  private fun intentionFin(ctx: Context) = PendingIntent.getBroadcast(
    ctx, 1, Intent(ctx, RecepteurFinDeverrouillage::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun programmerFin(ctx: Context, quand: Long) {
    val alarmes = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmes.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quand, intentionFin(ctx))
  }

  private fun annulerFin(ctx: Context) {
    (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(intentionFin(ctx))
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Mise à jour de Suivi fuites (Installateur) : l'interdiction d'installer s'applique aussi au propriétaire.

  fun leverPourInstallation(ctx: Context) {
    if (estProprietaire(ctx)) dpm(ctx).clearUserRestriction(admin(ctx), UserManager.DISALLOW_INSTALL_APPS)
  }

  // Écriture synchrone (commit) : l'installateur tue le processus juste après, une écriture différée serait perdue.
  fun relancerApresMiseAJour(ctx: Context, oui: Boolean) {
    prefs(ctx).edit().putBoolean("relancer", oui).commit()
  }

  fun doitRelancer(ctx: Context): Boolean {
    val oui = prefs(ctx).getBoolean("relancer", false)
    if (oui) relancerApresMiseAJour(ctx, false)
    return oui
  }

  /**
   * Rouvre l'appli après sa mise à jour si « Installer » l'a demandé. Appelée par le compte rendu d'installation
   * (RecepteurInstallation, PendingIntent du système : il atteint le nouveau processus même quand HyperOS refuse le
   * « démarrage automatique ») et par la diffusion « paquet remplacé » (RecepteurDemarrage) ; le premier arrivé consomme
   * le drapeau. Au premier plan seulement si Android (propriétaire : permis) et HyperOS (« fenêtres contextuelles en
   * arrière-plan », réglage de la préparation) l'acceptent.
   */
  fun relancerSiDemande(ctx: Context, origine: String) {
    if (!doitRelancer(ctx)) return
    val lancement = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    val resultat = runCatching { ctx.startActivity(lancement) }
    Log.i(ETIQUETTE, "relance après mise à jour ($origine) : ${if (resultat.isSuccess) "demandée" else "refusée : ${resultat.exceptionOrNull()?.message}"}")
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Passage de la propriété (appli DEV → appli normale) et libération

  fun transfererVers(ctx: Context, paquet: String) {
    check(estProprietaire(ctx)) { "Suivi fuites n'est pas propriétaire de cette tablette." }
    check(Build.VERSION.SDK_INT >= 28) { "Android 9 ou plus exigé." }
    val extras = PersistableBundle().apply {
      putString("profil", profil(ctx))
      putStringArray("gardees", (prefs(ctx).getStringSet("gardees", emptySet()) ?: emptySet()).toTypedArray())
    }
    dpm(ctx).transferOwnership(admin(ctx), ComponentName(paquet, RecepteurAdmin::class.java.name), extras)
    runCatching { ActiviteWifi.activerRedirection(ctx, false) }
    noterEvenement(ctx, "transfert", JSONObject().put("vers", paquet))
  }

  /** Tout remontrer, tout lever, puis cesser d'être propriétaire. L'appli reste installée comme une appli normale. */
  @Synchronized
  fun liberer(ctx: Context) {
    check(estProprietaire(ctx)) { "Suivi fuites n'est pas propriétaire de cette tablette." }
    val dpm = dpm(ctx)
    val admin = admin(ctx)
    val pm = ctx.packageManager
    for (info in pm.getInstalledApplications(PackageManager.MATCH_UNINSTALLED_PACKAGES)) {
      runCatching { if (dpm.isApplicationHidden(admin, info.packageName)) dpm.setApplicationHidden(admin, info.packageName, false) }
    }
    for (r in INTERDICTIONS + UserManager.DISALLOW_DEBUGGING_FEATURES) dpm.clearUserRestriction(admin, r)
    if (Build.VERSION.SDK_INT >= 28) runCatching { dpm.setMeteredDataDisabledPackages(admin, emptyList()) }
    if (Build.VERSION.SDK_INT >= 30) runCatching { dpm.setUserControlDisabledPackages(admin, emptyList()) }
    for (paquet in setOf(ctx.packageName, APPLI).filter { installee(pm, it) }) {
      for (p in permissionsAccordees()) {
        runCatching { dpm.setPermissionGrantState(admin, paquet, p, DevicePolicyManager.PERMISSION_GRANT_STATE_DEFAULT) }
      }
    }
    annulerFin(ctx)
    runCatching { ActiviteWifi.activerRedirection(ctx, false) }
    prefs(ctx).edit().clear().apply()
    @Suppress("DEPRECATION") dpm.clearDeviceOwnerApp(ctx.packageName)
    Log.i(ETIQUETTE, "tablette libérée")
  }
}
