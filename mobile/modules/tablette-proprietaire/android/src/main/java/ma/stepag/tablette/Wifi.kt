package ma.stepag.tablette

import android.content.Context
import android.net.wifi.SupplicantState
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * Wi-Fi de la tablette verrouillée (lot TP, demandes d'Issam du 2026-10-11 et du 2026-10-12) : les Paramètres sont
 * cachés, mais l'agent doit pouvoir rejoindre n'importe quel réseau Wi-Fi (forfait 4G épuisé : il saisit, se connecte,
 * les fuites partent). Choix du réseau dans le volet du haut, mot de passe dans la fenêtre de l'appli (ActiviteWifi).
 * Le propriétaire de l'appareil garde le droit d'allumer le Wi-Fi et d'ajouter des réseaux (WifiManager : « Device Owner,
 * Profile Owner and system apps »), ce qu'Android 10+ refuse aux applis ordinaires.
 */
object Wifi {
  private fun gestionnaire(ctx: Context) = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

  private fun sansGuillemets(s: String?) = s?.removeSurrounding("\"") ?: ""

  /** 'ouvert', 'wpa' (WPA/WPA2 ou WPA3 en mode transition), 'sae' (WPA3 seul), 'wep', 'entreprise'. */
  private fun type(capacites: String): String = when {
    capacites.contains("EAP") -> "entreprise"
    capacites.contains("PSK") -> "wpa"
    capacites.contains("SAE") -> "sae"
    capacites.contains("WEP") -> "wep"
    else -> "ouvert"
  }

  @Suppress("DEPRECATION")
  fun etat(ctx: Context): JSONObject {
    val wm = gestionnaire(ctx)
    val info = wm.connectionInfo
    val connecte = info != null && info.supplicantState == SupplicantState.COMPLETED && sansGuillemets(info.ssid).isNotEmpty() &&
      info.ssid != WifiManager.UNKNOWN_SSID
    val connus = runCatching { wm.configuredNetworks.map { sansGuillemets(it.SSID) }.toSet() }.getOrDefault(emptySet())
    // Derniers résultats connus du système (un balayage est demandé à chaque lecture ; Android le limite à quelques-uns
    // par minute, les résultats restent lisibles entre-temps).
    runCatching { wm.startScan() }
    val vus = linkedMapOf<String, JSONObject>()
    for (r in runCatching { wm.scanResults }.getOrDefault(emptyList())) {
      val ssid = if (Build.VERSION.SDK_INT >= 33) r.wifiSsid?.toString()?.let(::sansGuillemets) ?: "" else @Suppress("DEPRECATION") r.SSID
      if (ssid.isBlank()) continue
      val niveau = WifiManager.calculateSignalLevel(r.level, 5)
      val precedent = vus[ssid]
      if (precedent != null && precedent.getInt("niveau") >= niveau) continue
      vus[ssid] = JSONObject()
        .put("ssid", ssid)
        .put("niveau", niveau)
        .put("type", type(r.capabilities ?: ""))
        .put("connu", ssid in connus)
        .put("connecte", connecte && sansGuillemets(info.ssid) == ssid)
    }
    val reseaux = JSONArray(vus.values.sortedWith(compareByDescending<JSONObject> { it.getBoolean("connecte") }.thenByDescending { it.getInt("niveau") }))
    return JSONObject()
      .put("actif", wm.isWifiEnabled)
      .put("ssidConnecte", if (connecte) sansGuillemets(info.ssid) else JSONObject.NULL)
      .put("reseaux", reseaux)
  }

  @Suppress("DEPRECATION")
  fun activer(ctx: Context, actif: Boolean) {
    val wm = gestionnaire(ctx)
    if (!wm.setWifiEnabled(actif)) throw IllegalStateException("Le Wi-Fi n'a pas pu être ${if (actif) "allumé" else "éteint"}.")
  }

  /** Ajoute (ou remplace) le réseau et s'y connecte ; `motDePasse` vide pour un réseau ouvert ou déjà connu. */
  @Suppress("DEPRECATION")
  fun connecter(ctx: Context, ssid: String, motDePasse: String, type: String) {
    require(ssid.isNotBlank()) { "Nom de réseau vide" }
    val wm = gestionnaire(ctx)
    if (!wm.isWifiEnabled) activer(ctx, true)
    val existants = runCatching { wm.configuredNetworks }.getOrDefault(emptyList()).filter { sansGuillemets(it.SSID) == ssid }
    if (motDePasse.isBlank() && type != "ouvert") {
      val connu = existants.firstOrNull() ?: throw IllegalArgumentException("Mot de passe requis pour ce réseau.")
      wm.enableNetwork(connu.networkId, true)
      wm.reconnect()
      return
    }
    for (e in existants) wm.removeNetwork(e.networkId)
    val conf = WifiConfiguration().apply {
      SSID = "\"$ssid\""
      when (type) {
        "ouvert" -> allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
        "sae" -> {
          require(motDePasse.length >= 8) { "Mot de passe trop court (8 caractères au moins)." }
          allowedKeyManagement.set(WifiConfiguration.KeyMgmt.SAE)
          preSharedKey = "\"$motDePasse\""
        }
        "wep" -> {
          wepKeys[0] = "\"$motDePasse\""
          wepTxKeyIndex = 0
          allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
          allowedAuthAlgorithms.set(WifiConfiguration.AuthAlgorithm.SHARED)
        }
        "entreprise" -> throw IllegalArgumentException("Réseau d'entreprise (identifiant + mot de passe) : non pris en charge ici.")
        else -> {
          require(motDePasse.length >= 8) { "Mot de passe trop court (8 caractères au moins)." }
          allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
          preSharedKey = "\"$motDePasse\""
        }
      }
    }
    val id = wm.addNetwork(conf)
    if (id < 0) throw IllegalStateException("Réseau refusé par Android.")
    wm.saveConfiguration()
    if (!wm.enableNetwork(id, true)) throw IllegalStateException("Connexion refusée par Android.")
    wm.reconnect()
    Politique.noterEvenement(ctx, "wifi", JSONObject().put("ssid", ssid).put("type", type))
  }
}
