// Configuration Expo : celle d'app.json, plus ce que fixe la compilation (workflow apk.yml).
// - Numéro de version : APK_VERSION_CODE (numéro du run de la CI, toujours croissant) et APK_VERSION_NAME ; l'appli
//   compare le sien à la dernière version publiée (src/mise-a-jour.ts).
// - Firebase (notifications push) : google-services.json, écrit par la CI depuis un secret GitHub, jamais versionné.
//   Absent : l'APK se compile sans push (src/push.ts le détecte et n'enregistre aucun jeton).
// - APP_VARIANT=dev (workflow apk-dev.yml) : appli distincte « Suivi fuites DEV » (ma.stepag.suivifuites.dev),
//   installée à côté de la vraie ; son code JS vient du Mac par le câble (Metro), sans Firebase.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const code = Number(process.env.APK_VERSION_CODE);
  const dev = process.env.APP_VARIANT === 'dev';
  const firebase = !dev && fs.existsSync(path.join(__dirname, 'google-services.json'));
  return {
    ...config,
    ...(dev ? { name: 'Suivi fuites DEV', scheme: 'suivi-fuites-dev' } : {}),
    version: process.env.APK_VERSION_NAME || config.version,
    android: {
      ...config.android,
      ...(dev ? { package: 'ma.stepag.suivifuites.dev' } : {}),
      ...(Number.isInteger(code) && code > 0 ? { versionCode: code } : {}),
      ...(firebase ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
