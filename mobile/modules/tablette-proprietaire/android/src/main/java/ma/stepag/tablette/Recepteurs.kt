package ma.stepag.tablette

import android.app.Activity
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle
import android.util.Log
import org.json.JSONObject
import kotlin.concurrent.thread

/** Travail hors du fil principal d'un récepteur (goAsync : une dizaine de secondes au plus). */
private fun BroadcastReceiver.enArrierePlan(travail: () -> String?) {
  val attente = goAsync()
  thread(name = "tablette-proprietaire") {
    try {
      travail()?.let { attente.resultData = it }
    } catch (e: Exception) {
      Log.w(Politique.ETIQUETTE, "récepteur : ${e.message}", e)
      attente.resultData = "erreur : ${e.message}"
    } finally {
      attente.finish()
    }
  }
}

@Suppress("DEPRECATION")
private fun extrasAdmin(intention: Intent?): PersistableBundle? =
  intention?.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)

/** Composant propriétaire de la tablette. */
class RecepteurAdmin : DeviceAdminReceiver() {
  // Préparation par QR code avant Android 12 (après : ActiviteConformite).
  override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
    Politique.retenirProfil(context, extrasAdmin(intent), "agent")
    enArrierePlan { Politique.appliquer(context).toString() }
  }

  // Propriété reçue de l'appli DEV (ou l'inverse) : même profil, mêmes applis gardées.
  override fun onTransferOwnershipComplete(context: Context, bundle: PersistableBundle?) {
    Politique.retenirProfil(context, bundle, Politique.profil(context))
    Politique.noterEvenement(context, "transfert_recu")
    thread { Politique.appliquer(context) }
  }
}

/** Assistant de préparation (QR code, Android 12+) : « appareil entièrement géré ». */
class ActiviteModeProvisionnement : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Politique.retenirProfil(this, extrasAdmin(intent), "agent")
    val resultat = Intent()
    if (Build.VERSION.SDK_INT >= 29) {
      resultat.putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE)
    }
    setResult(RESULT_OK, resultat)
    finish()
  }
}

/** Fin de l'assistant de préparation : politique appliquée avant le premier écran d'accueil. */
class ActiviteConformite : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    extrasAdmin(intent)?.let { Politique.retenirProfil(this, it, "agent") }
    thread {
      runCatching { Politique.appliquer(applicationContext) }
      Politique.noterEvenement(applicationContext, "preparation", JSONObject().put("profil", Politique.profil(applicationContext)))
      runOnUiThread {
        setResult(RESULT_OK)
        finish()
      }
    }
  }
}

/** Redémarrage de la tablette, mise à jour de l'appli : politique réappliquée, appli rouverte après sa mise à jour. */
class RecepteurDemarrage : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    enArrierePlan {
      if (!Politique.estProprietaire(context)) return@enArrierePlan null
      Politique.verifier(context)
      if (action == Intent.ACTION_MY_PACKAGE_REPLACED) {
        Politique.noterEvenement(context, "mise_a_jour")
        Politique.relancerSiDemande(context, "paquet remplacé")
      }
      null
    }
  }
}

class RecepteurInstallation : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    enArrierePlan {
      Installateur.resultat(context, intent)
      null
    }
  }
}

/** Fin d'un déverrouillage : reverrouillage, même si l'appli a été fermée. */
class RecepteurFinDeverrouillage : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    enArrierePlan { Politique.verifier(context).toString() }
  }
}

/**
 * Secours par adb, profil essai seulement (la Redmi d'Issam) :
 * `adb shell am broadcast -n <paquet>/ma.stepag.tablette.RecepteurSecours --es action <liberer|deverrouiller|reverrouiller|appliquer|etat> [--ei minutes 60]`
 */
class RecepteurSecours : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (Politique.profil(context) != "essai") {
      resultData = "refusé : tablette d'agent"
      return
    }
    val action = intent.getStringExtra("action")
    enArrierePlan {
      when (action) {
        "liberer" -> {
          Politique.liberer(context)
          "tablette libérée"
        }
        "deverrouiller" -> Politique.deverrouiller(context, intent.getIntExtra("minutes", 60)).toString()
        "reverrouiller" -> Politique.reverrouiller(context, false).toString()
        "appliquer" -> Politique.appliquer(context).toString()
        "etat" -> Politique.etat(context).toString()
        else -> "action inconnue : $action"
      }
    }
  }
}
