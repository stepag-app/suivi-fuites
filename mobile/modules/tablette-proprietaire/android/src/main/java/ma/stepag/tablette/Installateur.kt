package ma.stepag.tablette

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * Mise à jour de Suivi fuites par une session PackageInstaller. Propriétaire de la tablette : aucune fenêtre d'Android
 * (l'agent a seulement touché « Installer »). Contrôles avant installation : empreinte SHA-256 publiée par la CI, même
 * nom de paquet et même certificat que l'appli installée.
 */
object Installateur {
  @Volatile private var attente: Promise? = null

  private fun refus(message: String) = CodedException("ERR_TABLETTE_INSTALLATION", message, null)

  private fun empreinte(fichier: File): String {
    val sha = MessageDigest.getInstance("SHA-256")
    fichier.inputStream().use { entree ->
      val tampon = ByteArray(64 * 1024)
      while (true) {
        val n = entree.read(tampon)
        if (n < 0) break
        sha.update(tampon, 0, n)
      }
    }
    return sha.digest().joinToString("") { "%02x".format(it) }
  }

  @Suppress("DEPRECATION")
  private fun signataires(pm: PackageManager, archive: String?, paquet: String?): Set<String> {
    val info = if (Build.VERSION.SDK_INT >= 28) {
      val drapeau = PackageManager.GET_SIGNING_CERTIFICATES
      if (archive != null) pm.getPackageArchiveInfo(archive, drapeau) else pm.getPackageInfo(paquet!!, drapeau)
    } else {
      val drapeau = PackageManager.GET_SIGNATURES
      if (archive != null) pm.getPackageArchiveInfo(archive, drapeau) else pm.getPackageInfo(paquet!!, drapeau)
    } ?: return emptySet()
    val signatures: Array<Signature>? = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures.orEmpty().map { it.toCharsString() }.toSet()
  }

  fun installer(ctx: Context, chemin: String, sha256: String, promise: Promise) {
    val fichier = File(chemin.removePrefix("file://"))
    if (!fichier.isFile) throw refus("Fichier absent : $chemin")
    if (sha256.isNotBlank() && !empreinte(fichier).equals(sha256.trim(), ignoreCase = true)) {
      throw refus("Fichier altéré (empreinte différente de celle publiée)")
    }
    val pm = ctx.packageManager
    val archive = pm.getPackageArchiveInfo(fichier.path, 0) ?: throw refus("Fichier APK illisible")
    if (archive.packageName != ctx.packageName) throw refus("APK d'une autre appli : ${archive.packageName}")
    val siens = signataires(pm, null, ctx.packageName)
    val ceuxDuFichier = signataires(pm, fichier.path, null)
    if (siens.isEmpty() || siens != ceuxDuFichier) throw refus("APK signée par une autre clé que celle de l'appli")

    Politique.leverPourInstallation(ctx)
    Politique.relancerApresMiseAJour(ctx, true)
    val installateur = pm.packageInstaller
    val parametres = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(ctx.packageName)
      setSize(fichier.length())
      if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
    }
    val id = installateur.createSession(parametres)
    try {
      installateur.openSession(id).use { session ->
        session.openWrite("suivi-fuites.apk", 0, fichier.length()).use { sortie ->
          fichier.inputStream().use { it.copyTo(sortie) }
          session.fsync(sortie)
        }
        attente = promise
        val intention = Intent(ctx, RecepteurInstallation::class.java)
        // MUTABLE : l'installateur d'Android y ajoute le résultat.
        val drapeaux = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
        session.commit(PendingIntent.getBroadcast(ctx, id, intention, drapeaux).intentSender)
      }
    } catch (e: Exception) {
      attente = null
      runCatching { installateur.abandonSession(id) }
      Politique.relancerApresMiseAJour(ctx, false)
      Politique.appliquer(ctx)
      throw refus("Installation impossible : ${e.message}")
    }
    // La promesse se règle à la réception du résultat ; une mise à jour réussie de l'appli elle-même ferme le processus
    // avant (RecepteurDemarrage la rouvre).
  }

  fun resultat(ctx: Context, intention: Intent) {
    val statut = intention.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val message = intention.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""
    when (statut) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        // Appli non propriétaire : Android demande la confirmation de l'agent.
        @Suppress("DEPRECATION")
        val confirmation = intention.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
        confirmation?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { ctx.startActivity(it) }
      }
      PackageInstaller.STATUS_SUCCESS -> {
        Politique.appliquer(ctx)
        attente?.resolve(null)
        attente = null
      }
      else -> {
        Log.w(Politique.ETIQUETTE, "installation refusée : $statut $message")
        Politique.relancerApresMiseAJour(ctx, false)
        Politique.appliquer(ctx)
        Politique.noterEvenement(ctx, "installation_echec", JSONObject().put("statut", statut).put("message", message))
        attente?.reject(refus("Installation refusée par Android ($statut) : $message"))
        attente = null
      }
    }
  }
}
