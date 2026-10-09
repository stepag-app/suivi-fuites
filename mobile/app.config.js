// Configuration Expo : celle d'app.json, plus ce que fixe la compilation (workflow apk.yml).
// - Numéro de version : APK_VERSION_CODE (numéro du run de la CI, toujours croissant) et APK_VERSION_NAME ; l'appli
//   compare le sien à la dernière version publiée (src/mise-a-jour.ts).
// - Firebase (notifications push) : google-services.json, écrit par la CI depuis un secret GitHub, jamais versionné.
//   Absent : l'APK se compile sans push (src/push.ts le détecte et n'enregistre aucun jeton).
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const code = Number(process.env.APK_VERSION_CODE);
  const firebase = fs.existsSync(path.join(__dirname, 'google-services.json'));
  return {
    ...config,
    version: process.env.APK_VERSION_NAME || config.version,
    android: {
      ...config.android,
      ...(Number.isInteger(code) && code > 0 ? { versionCode: code } : {}),
      ...(firebase ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
