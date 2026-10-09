// Mise à jour de l'APK sur les tablettes (X2). Chaque APK de main signée avec la clé de production est publiée par la
// CI dans le compartiment privé R2 (workflow apk.yml) ; la fonction serveur version-apk donne la dernière version et
// une URL signée. Quand elle est plus récente que celle installée, la liste propose « Nouvelle version » : téléchargement
// dans le cache de l'appli, puis l'installateur d'Android (même signature : données et envois en attente gardés).
// Contrôle à l'ouverture puis au retour sur l'appli, au plus toutes les 6 h ; jamais sans réseau. Une version trouvée
// s'annonce d'abord par une fenêtre (sur la liste, jamais au milieu d'une saisie) ; « Plus tard » la referme jusqu'au
// prochain démarrage et le bandeau de la liste reste.
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Text, View } from 'react-native';
import { t, useLangue } from './langue';
import { versionPlusRecente } from './regles';
import { useSession } from './session';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import { Icone } from './icones';
import { Bouton, Carte, COULEURS, Message, s } from './ui';

export interface Version { version_code: number; version: string; taille: number; url: string }
const INTERVALLE_MS = 6 * 60 * 60 * 1000;
const DOSSIER = `${FileSystem.cacheDirectory}mises-a-jour/`;

export const versionInstallee = () => {
  const n = Number(Application.nativeBuildVersion);
  return Number.isInteger(n) ? n : null;
};

export function useMiseAJour(): Version | null {
  const { session, aRenouveler } = useSession();
  const [version, setVersion] = useState<Version | null>(null);
  const dernier = useRef(0);
  const verifier = useCallback(async () => {
    // Version de développement (APP_VARIANT=dev) : jamais remplacée par l'APK publiée, qui est une autre appli.
    if (__DEV__ || !session || aRenouveler || jetonARenouveler() || Date.now() - dernier.current < INTERVALLE_MS) return;
    dernier.current = Date.now();
    const { data, error } = await supabase.functions.invoke('version-apk', { body: {} });
    if (error || !data || data.aucune) return;
    const v = data as Version;
    setVersion(versionPlusRecente(versionInstallee(), v.version_code) ? v : null);
  }, [session, aRenouveler]);
  useEffect(() => {
    // APK d'une version précédente restée dans le cache : effacée.
    void FileSystem.deleteAsync(DOSSIER, { idempotent: true }).catch(() => undefined);
  }, []);
  useEffect(() => {
    void verifier().catch(() => undefined);
    const abonnement = AppState.addEventListener('change', (e) => e === 'active' && void verifier().catch(() => undefined));
    return () => abonnement.remove();
  }, [verifier]);
  return version;
}

const mo = (octets: number) => (octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

function useInstallation(version: Version) {
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState('');

  async function installer() {
    setErreur('');
    setProgression(0);
    try {
      await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true });
      const fichier = `${DOSSIER}suivi-fuites-${version.version_code}.apk`;
      const telechargement = FileSystem.createDownloadResumable(version.url, fichier, {}, (p) => {
        if (p.totalBytesExpectedToWrite > 0) setProgression(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      });
      const r = await telechargement.downloadAsync();
      const info = await FileSystem.getInfoAsync(fichier);
      if (!r || r.status !== 200 || !info.exists || (version.taille && info.size !== version.taille)) {
        throw new Error(t('fichier incomplet'));
      }
      const uri = await FileSystem.getContentUriAsync(fichier);
      setProgression(null);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: uri, flags: 1, type: 'application/vnd.android.package-archive',
      });
    } catch (e) {
      setProgression(null);
      setErreur(t('Téléchargement impossible ({erreur}). Réessayez avec une meilleure connexion.', { erreur: String((e as Error).message ?? e) }));
    }
  }

  const titreBouton = progression != null ? t('Téléchargement… {n} %', { n: Math.round(progression * 100) }) : null;
  return { installer: () => void installer(), occupe: progression != null, titreBouton, erreur };
}

export function BandeauMiseAJour({ version }: { version: Version }) {
  useLangue();
  const { installer, occupe, titreBouton, erreur } = useInstallation(version);
  return (
    <Carte>
      <View style={[s.ligne, { alignItems: 'center', justifyContent: 'space-between' }]}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 260, gap: 2 }}>
          <Text style={s.texteFort}>{t('Nouvelle version {version} disponible', { version: version.version })}</Text>
          <Text style={s.discret}>
            {t('{taille} Mo à télécharger ; vos saisies et envois en attente sont gardés.', { taille: mo(version.taille) })}
          </Text>
        </View>
        <Bouton titre={titreBouton ?? t('Installer')} icone="download" primaire onPress={installer} occupe={occupe} />
      </View>
      {!!erreur && <Message ton="erreur">{erreur}</Message>}
    </Carte>
  );
}

/** Annonce au démarrage : « Installer maintenant » ou « Plus tard » (le bandeau de la liste reste). */
export function FenetreMiseAJour({ version, plusTard }: { version: Version; plusTard: () => void }) {
  useLangue();
  const { installer, occupe, titreBouton, erreur } = useInstallation(version);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => !occupe && plusTard()}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
        <Carte style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16 }}>
          <View style={[s.ligne, { alignItems: 'center', flexWrap: 'nowrap' }]}>
            <Icone nom="download" taille={28} couleur={COULEURS.principal} />
            <Text style={[s.titreCarte, { flex: 1 }]}>{t('Mise à jour disponible')}</Text>
          </View>
          <Text style={s.texte}>{t('La version {version} de l\'application est prête à être installée.', { version: version.version })}</Text>
          <Text style={s.discret}>
            {t('{taille} Mo à télécharger ; vos saisies et envois en attente sont gardés.', { taille: mo(version.taille) })}
          </Text>
          {!!erreur && <Message ton="erreur">{erreur}</Message>}
          <View style={s.ligne}>
            <Bouton titre={t('Plus tard')} grand onPress={plusTard} desactive={occupe} style={{ flexGrow: 1, flexBasis: 160 }} />
            <Bouton
              titre={titreBouton ?? t('Installer maintenant')} icone="download" primaire grand onPress={installer} occupe={occupe}
              style={{ flexGrow: 2, flexBasis: 220 }}
            />
          </View>
        </Carte>
      </View>
    </Modal>
  );
}
