package ma.stepag.tablette

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Choix d'un Wi-Fi depuis le volet du haut (demande d'Issam du 2026-10-12). Tablette verrouillée, les Paramètres sont
 * cachés : toucher un réseau inconnu dans le volet lance la page Wi-Fi des Paramètres, qui ne s'ouvrait donc pas. Cette
 * fenêtre répond à la place des Paramètres (mêmes actions), seulement pendant le verrouillage (`activerRedirection`) ;
 * déverrouillée, la tablette retrouve la page Wi-Fi d'Android. Libellés en français et en arabe : la fenêtre s'ouvre
 * hors de l'appli, avant toute connexion, sans connaître la langue choisie.
 */
class ActiviteWifi : Activity() {
  private val principal = Handler(Looper.getMainLooper())
  private lateinit var liste: LinearLayout
  private lateinit var etatTexte: TextView
  private var choisi: JSONObject? = null
  private var demande: String? = null

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

  private fun fond(couleur: Int, bord: Int? = null, rayon: Int = 12) = GradientDrawable().apply {
    setColor(couleur)
    cornerRadius = dp(rayon).toFloat()
    bord?.let { setStroke(dp(1), it) }
  }

  private fun texte(s: String, taille: Float = 17f, gras: Boolean = false, couleur: Int = NOIR) = TextView(this).apply {
    text = s
    setTextSize(TypedValue.COMPLEX_UNIT_SP, taille)
    setTextColor(couleur)
    if (gras) setTypeface(typeface, Typeface.BOLD)
  }

  private fun bouton(s: String, primaire: Boolean, action: () -> Unit) = Button(this).apply {
    text = s
    isAllCaps = false
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
    setTextColor(if (primaire) Color.WHITE else NOIR)
    background = fond(if (primaire) NOIR else Color.WHITE, if (primaire) null else BORD, 10)
    minHeight = dp(56)
    setOnClickListener { action() }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    demande = ssidDemande()
    Log.i(Politique.ETIQUETTE, "wifi depuis le volet : ${intent?.action} ${intent?.extras?.keySet()?.joinToString()} -> ${demande ?: "aucun réseau"}")
    window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
    window.setLayout((resources.displayMetrics.widthPixels * 0.9).toInt().coerceAtMost(dp(560)), WRAP_CONTENT)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

    val racine = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), dp(22), dp(24), dp(20))
      background = fond(Color.WHITE, rayon = 20)
    }
    racine.addView(texte("Wi-Fi", 22f, gras = true))
    etatTexte = texte("", 15f, couleur = DISCRET).apply { setPadding(0, dp(4), 0, dp(12)) }
    racine.addView(etatTexte)
    liste = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    racine.addView(ScrollView(this).apply { addView(liste) }, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
    racine.addView(bouton("Fermer · إغلاق", primaire = false) { finish() }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(14) })
    setContentView(racine)
    relire()
  }

  override fun onNewIntent(nouvelle: android.content.Intent) {
    super.onNewIntent(nouvelle)
    intent = nouvelle
    demande = ssidDemande()
    choisi = null
    relire()
  }

  /** Réseau touché dans le volet, si le système l'a passé : clé d'extra inconnue selon le fabricant, d'où la recherche. */
  @Suppress("DEPRECATION")
  private fun ssidDemande(): String? {
    val extras = intent?.extras ?: return null
    val valeurs = extras.keySet().mapNotNull { runCatching { extras.get(it)?.toString() }.getOrNull() }.filter { it.isNotBlank() }
    val visibles = runCatching { Wifi.etat(this).getJSONArray("reseaux") }.getOrNull() ?: return null
    for (i in 0 until visibles.length()) {
      val ssid = visibles.getJSONObject(i).getString("ssid")
      if (valeurs.any { it == ssid || it.contains("\"$ssid\"") }) return ssid
    }
    return null
  }

  private fun relire() {
    val etat = runCatching { Wifi.etat(this) }.getOrElse {
      etatTexte.text = it.message
      return
    }
    liste.removeAllViews()
    if (!etat.getBoolean("actif")) {
      etatTexte.text = "Wi-Fi éteint · الواي فاي مطفأ"
      liste.addView(bouton("Allumer le Wi-Fi · تشغيل الواي فاي", primaire = true) {
        runCatching { Wifi.activer(this, true) }
        principal.postDelayed({ relire() }, 2500)
      })
      return
    }
    val connecte = etat.opt("ssidConnecte") as? String
    etatTexte.text = if (connecte != null) "Connecté à $connecte · متصل" else "Choisissez un réseau · اختر شبكة"
    val reseaux = etat.getJSONArray("reseaux")
    if (reseaux.length() == 0) liste.addView(texte("Recherche des réseaux… · جارٍ البحث عن الشبكات", 15f, couleur = DISCRET))
    for (i in 0 until reseaux.length()) {
      val r = reseaux.getJSONObject(i)
      if (r.getString("type") == "entreprise") continue
      liste.addView(ligne(r))
      if (choisi?.getString("ssid") == r.getString("ssid")) liste.addView(formulaire(r))
    }
    val voulu = demande
    if (voulu != null && choisi == null) {
      demande = null
      (0 until reseaux.length()).map { reseaux.getJSONObject(it) }.firstOrNull { it.getString("ssid") == voulu }?.let { choisir(it) }
    }
  }

  private fun ligne(r: JSONObject): View {
    val ssid = r.getString("ssid")
    val actif = r.getBoolean("connecte")
    val detail = when {
      actif -> "Connecté · متصل"
      r.getBoolean("connu") -> "Enregistré · محفوظ"
      r.getString("type") == "ouvert" -> "Ouvert · مفتوح"
      else -> "Mot de passe · كلمة المرور"
    }
    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(12), dp(16), dp(12))
      background = fond(if (actif) BLEU_FOND else Color.WHITE, if (actif) BLEU else BORD)
      minimumHeight = dp(60)
      gravity = Gravity.CENTER_VERTICAL
      addView(texte(ssid, 18f, gras = true))
      addView(texte("${"▮".repeat(r.getInt("niveau").coerceIn(1, 4))}  $detail", 14f, couleur = DISCRET))
      layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { bottomMargin = dp(8) }
      if (!actif) setOnClickListener { choisir(r) }
    }
  }

  private fun choisir(r: JSONObject) {
    if (r.getBoolean("connu") || r.getString("type") == "ouvert") {
      connecter(r, "")
      return
    }
    choisi = r
    relire()
  }

  private fun formulaire(r: JSONObject): View {
    val bloc = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(4), dp(4), dp(4), dp(16))
    }
    val mdp = EditText(this).apply {
      hint = "Mot de passe · كلمة المرور"
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      background = fond(Color.WHITE, BORD_CHAMP, 10)
      setPadding(dp(14), dp(14), dp(14), dp(14))
      isSingleLine = true
    }
    bloc.addView(mdp)
    bloc.addView(CheckBox(this).apply {
      text = "Afficher · إظهار"
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setOnCheckedChangeListener { _, voir ->
        mdp.inputType = InputType.TYPE_CLASS_TEXT or
          (if (voir) InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD else InputType.TYPE_TEXT_VARIATION_PASSWORD)
        mdp.setSelection(mdp.text.length)
      }
    })
    bloc.addView(bouton("Se connecter · اتصال", primaire = true) { connecter(r, mdp.text.toString()) })
    mdp.requestFocus()
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    return bloc
  }

  private fun connecter(r: JSONObject, motDePasse: String) {
    val ssid = r.getString("ssid")
    etatTexte.text = "Connexion à $ssid… · جارٍ الاتصال"
    thread(name = "wifi-volet") {
      val erreur = runCatching { Wifi.connecter(this, ssid, motDePasse, r.getString("type")) }.exceptionOrNull()
      principal.post {
        if (erreur != null) {
          etatTexte.text = erreur.message
          return@post
        }
        choisi = null
        attendre(ssid, 0)
      }
    }
  }

  /** Connexion vérifiée pendant 20 s ; réussie, la fenêtre se ferme seule. */
  private fun attendre(ssid: String, essai: Int) {
    if (isFinishing) return
    val connecte = runCatching { Wifi.etat(this).opt("ssidConnecte") as? String }.getOrNull()
    if (connecte == ssid) {
      etatTexte.text = "Connecté à $ssid · متصل"
      principal.postDelayed({ finish() }, 1200)
      return
    }
    if (essai >= 20) {
      etatTexte.text = "Échec : mot de passe incorrect ? · فشل الاتصال : كلمة المرور خاطئة؟"
      relire()
      return
    }
    principal.postDelayed({ attendre(ssid, essai + 1) }, 1000)
  }

  override fun onDestroy() {
    principal.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  companion object {
    private val NOIR = Color.parseColor("#171717")
    private val DISCRET = Color.parseColor("#737373")
    private val BORD = Color.parseColor("#e5e5e5")
    private val BORD_CHAMP = Color.parseColor("#d4d4d4")
    private val BLEU = Color.parseColor("#0084d1")
    private val BLEU_FOND = Color.parseColor("#e6f3fb")

    /** Fenêtre déclarée pour la page Wi-Fi des Paramètres : active seulement quand la tablette est verrouillée. */
    fun activerRedirection(ctx: Context, active: Boolean) {
      val composant = ComponentName(ctx, ActiviteWifi::class.java)
      val voulu = if (active) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
      if (ctx.packageManager.getComponentEnabledSetting(composant) != voulu) {
        ctx.packageManager.setComponentEnabledSetting(composant, voulu, PackageManager.DONT_KILL_APP)
      }
    }
  }
}
