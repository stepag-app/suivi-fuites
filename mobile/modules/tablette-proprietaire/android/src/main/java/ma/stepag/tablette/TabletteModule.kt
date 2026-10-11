package ma.stepag.tablette

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Fonctions offertes au JS (mobile/modules/tablette-proprietaire/index.ts). Résultats en JSON. */
class TabletteModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private fun <T> garde(bloc: () -> T): T = try {
    bloc()
  } catch (e: CodedException) {
    throw e
  } catch (e: Exception) {
    throw CodedException("ERR_TABLETTE", e.message ?: e.toString(), e)
  }

  override fun definition() = ModuleDefinition {
    Name("TabletteProprietaire")

    Function("etat") { Politique.etat(ctx).toString() }

    AsyncFunction("appliquerPolitique") { garde { Politique.verifier(ctx).toString() } }

    AsyncFunction("deverrouiller") { minutes: Int -> garde { Politique.deverrouiller(ctx, minutes).toString() } }

    AsyncFunction("reverrouiller") { garde { Politique.reverrouiller(ctx, false).toString() } }

    AsyncFunction("installerApk") { chemin: String, sha256: String, promise: Promise ->
      garde { Installateur.installer(ctx, chemin, sha256, promise) }
    }

    AsyncFunction("transfererVers") { paquet: String -> garde { Politique.transfererVers(ctx, paquet) } }

    AsyncFunction("liberer") { garde { Politique.liberer(ctx) } }

    // Wi-Fi depuis l'appli (tablette verrouillée : les Paramètres sont cachés)
    Function("wifiEtat") { garde { Wifi.etat(ctx).toString() } }
    AsyncFunction("wifiActiver") { actif: Boolean -> garde { Wifi.activer(ctx, actif) } }
    AsyncFunction("wifiConnecter") { ssid: String, motDePasse: String, type: String -> garde { Wifi.connecter(ctx, ssid, motDePasse, type) } }
    AsyncFunction("wifiOublier") { ssid: String -> garde { Wifi.oublier(ctx, ssid) } }

    Function("evenementsEnAttente") { Politique.evenements(ctx).toString() }

    Function("acquitterEvenements") { n: Int -> Politique.acquitterEvenements(ctx, n) }
  }
}
