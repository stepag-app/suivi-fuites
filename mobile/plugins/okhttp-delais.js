// Délais du client OkHttp de l'APK (fetch d'Expo, réseau de React Native, images), posés dans le MainApplication.kt
// généré par « expo prebuild » (dossier android/ jamais versionné).
//
// React Native n'en met aucun. Sur une connexion HTTP/2 morte (4G : paquets perdus, sans fermeture), l'abandon d'une
// requête par reseau.ts n'est pour OkHttp qu'une annulation locale : il garde la connexion, et les requêtes suivantes
// s'y bloquent jusqu'à ce qu'Android ferme le socket (souvent un quart d'heure). Un délai de lecture ou d'écriture
// dépassé, lui, envoie un PING sur la connexion : sans réponse en 1 s, OkHttp ne la donne plus à aucune requête et en
// ouvre une neuve (OkHttp 4.9.2 : Http2Stream.StreamTimeout, Http2Connection.isHealthy).
//
// Délais d'inactivité, plus courts que ceux de JavaScript (liste : 20 s ; reseau.ts : 60 s, 3 min pour une photo) pour
// tomber avant eux : un abandon par JavaScript, arrivé le premier, laisserait la connexion morte en place. Corps de plus
// de 16 Ko (photos) : 60 s, le temps de vider sur une 4G très lente les 64 Ko que le serveur laisse en route.
// Pas de PING régulier (pingInterval) : il réveillerait la radio 4G sans arrêt (batterie).
const { AndroidConfig, CodeGenerator, withMainApplication } = require('expo/config-plugins');

const CONNEXION_S = 10;
const LECTURE_S = 15;
const GROS_CORPS_OCTETS = 16 * 1024;
const GROS_CORPS_S = 60;

const FABRIQUE = `    // Délais d'OkHttp : voir mobile/plugins/okhttp-delais.js
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(applicationContext)
        .connectTimeout(${CONNEXION_S}, TimeUnit.SECONDS)
        .readTimeout(${LECTURE_S}, TimeUnit.SECONDS)
        .writeTimeout(${LECTURE_S}, TimeUnit.SECONDS)
        .addInterceptor { chain ->
          val requete = chain.request()
          if ((requete.body?.contentLength() ?: 0L) > ${GROS_CORPS_OCTETS}) {
            chain.withReadTimeout(${GROS_CORPS_S}, TimeUnit.SECONDS)
              .withWriteTimeout(${GROS_CORPS_S}, TimeUnit.SECONDS)
              .proceed(requete)
          } else {
            chain.proceed(requete)
          }
        }
        .build()
    }`;

module.exports = function withOkHttpDelais(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('okhttp-delais : MainApplication.kt (Kotlin) attendu');
    }
    const avecImports = AndroidConfig.CodeMod.addImports(
      config.modResults.contents,
      ['com.facebook.react.modules.network.OkHttpClientProvider', 'java.util.concurrent.TimeUnit'],
      false,
    );
    // Juste après super.onCreate() : avant le démarrage de React Native et donc avant toute requête. Échoue (et la
    // compilation avec) si le modèle d'Expo change, plutôt que de livrer un APK sans délais.
    config.modResults.contents = CodeGenerator.mergeContents({
      src: avecImports,
      newSrc: FABRIQUE,
      tag: 'okhttp-delais',
      comment: '    //',
      anchor: /super\.onCreate\(\)/,
      offset: 1,
    }).contents;
    return config;
  });
};
