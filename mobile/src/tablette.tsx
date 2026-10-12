// Tablette verrouillée par Suivi fuites (lot TP, docs/lots/lot-tablette-proprietaire.md). Quand l'appli est
// propriétaire de la tablette : politique réappliquée à l'ouverture, événements de la tablette journalisés en base,
// déverrouillage par un code temporaire créé sur le panneau web (Paramètres > Tablettes), bandeau pendant l'ouverture.
// Ailleurs (tablettes non préparées, émulateur, ancienne APK) : rien ne s'affiche.
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import {
  acquitterEvenements, appliquerPolitique, deverrouiller, etatTablette, evenementsEnAttente, liberer, reverrouiller, transfererVers,
  type EtatTablette,
} from '../modules/tablette-proprietaire';
import { t, useLangue } from './langue';
import { hhmm, heureLocale } from './suivi-gps-regles';
import { supabase } from './supabase';
import { BarreApp, Bouton, Carte, Message, Saisie, s, useBas } from './ui';

const REAPPLIQUER_MS = 10 * 60 * 1000;
const heure = (ms: number) => hhmm(heureLocale(ms).minutes);

/** Événements notés par le module (reverrouillage, mise à jour…), envoyés au journal dès qu'une session est là. */
async function envoyerEvenements(appareil: string, modele: string | null) {
  const liste = evenementsEnAttente();
  let envoyes = 0;
  for (const e of liste) {
    const { error } = await supabase.rpc('journaliser_tablette', {
      p_appareil: appareil, p_modele: modele, p_action: e.action, p_details: e.details ?? {},
      p_survenu_le: new Date(e.le).toISOString(),
    });
    // Action inconnue de la base (APK plus récente que la base) : écartée plutôt que de bloquer la file.
    if (error && error.code !== '22023') break;
    envoyes += 1;
  }
  if (envoyes > 0) acquitterEvenements(envoyes);
}

/**
 * État de la tablette ; politique réappliquée à l'ouverture et au retour sur l'appli (au plus toutes les 10 min),
 * et à la fin d'un déverrouillage. `connecte` : session ouverte et jeton valide (journal).
 */
export function useTablette(connecte: boolean): [EtatTablette | null, () => void] {
  const [etat, setEtat] = useState(etatTablette);
  const relire = useCallback(() => setEtat(etatTablette()), []);
  const proprietaire = etat?.proprietaire === true;

  useEffect(() => {
    if (!proprietaire) return;
    let dernier = 0;
    const verifier = () => {
      if (Date.now() - dernier < REAPPLIQUER_MS) return relire();
      dernier = Date.now();
      void appliquerPolitique().catch(() => undefined).finally(relire);
    };
    verifier();
    const abonnement = AppState.addEventListener('change', (e) => e === 'active' && verifier());
    return () => abonnement.remove();
  }, [proprietaire, relire]);

  const fin = etat?.deverrouilleeJusqua ?? null;
  useEffect(() => {
    if (!fin) return;
    const minuteur = setTimeout(
      () => void appliquerPolitique().catch(() => undefined).finally(relire),
      Math.max(1000, fin - Date.now() + 1000),
    );
    return () => clearTimeout(minuteur);
  }, [fin, relire]);

  const appareil = etat?.appareil;
  const modele = etat?.modele;
  useEffect(() => {
    if (!proprietaire || !connecte || !appareil) return;
    const envoyer = () => void envoyerEvenements(appareil, modele ?? null).catch(() => undefined);
    envoyer();
    const abonnement = AppState.addEventListener('change', (e) => e === 'active' && envoyer());
    return () => abonnement.remove();
  }, [proprietaire, connecte, appareil, modele]);

  return [etat, relire];
}

/** Sur la liste, pendant un déverrouillage : heure de fin ; toucher ouvre l'écran Tablette (reverrouiller). */
export function BandeauTablette({ etat, ouvrir }: { etat: EtatTablette | null; ouvrir: () => void }) {
  useLangue();
  if (!etat?.deverrouilleeJusqua) return null;
  return (
    <Pressable onPress={ouvrir} accessibilityRole="button">
      <Message ton="attention" icone="lock-open">
        {t("Tablette déverrouillée jusqu'à {heure}. Touchez ici pour la reverrouiller.", { heure: heure(etat.deverrouilleeJusqua) })}
      </Message>
    </Pressable>
  );
}

type Retour = { ton: 'erreur' | 'info'; texte: string } | null;

export function EcranTablette({ etat, relire, retour }: { etat: EtatTablette | null; relire: () => void; retour: () => void }) {
  useLangue();
  const bas = useBas();
  const [code, setCode] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<Retour>(null);
  const ouverte = etat?.deverrouilleeJusqua ?? null;
  const dev = Application.applicationId?.endsWith('.dev') ?? false;

  async function valider() {
    if (!etat) return;
    setOccupe(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('utiliser_code_tablette', {
        p_code: code, p_appareil: etat.appareil, p_modele: etat.modele,
      });
      if (error) throw error;
      const r = data as { ok: boolean; erreur?: string; type?: 'deverrouiller' | 'liberer'; minutes?: number | null };
      if (!r.ok) {
        setMessage({
          ton: 'erreur',
          texte: r.erreur === 'trop_d_essais' ? t('Trop de codes refusés : réessayez dans une heure.') : t('Code inconnu, expiré ou déjà utilisé.'),
        });
        return;
      }
      setCode('');
      if (r.type === 'liberer') {
        await liberer();
        setMessage({ ton: 'info', texte: t('Tablette libérée : toutes les applis et tous les réglages sont de nouveau accessibles.') });
      } else {
        await deverrouiller(r.minutes ?? 60);
      }
      relire();
    } catch (e) {
      const erreur = e as { message?: string; code?: string };
      const texte = erreur.message ?? String(e);
      setMessage({
        ton: 'erreur',
        // PGRST202 : fonction absente de la base (migration du lot pas encore déployée).
        texte: erreur.code === 'PGRST202' ? t('Serveur pas encore à jour pour les codes : réessayez plus tard.')
          : /fetch|network|réseau|timeout|abort/i.test(texte) ? t('Vérification impossible : vérifiez le réseau.') : texte,
      });
    } finally {
      setOccupe(false);
    }
  }

  async function agir(action: () => Promise<unknown>) {
    setOccupe(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({ ton: 'erreur', texte: (e as { message?: string }).message ?? String(e) });
    } finally {
      relire();
      setOccupe(false);
    }
  }

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Tablette')} sousTitre={etat ? `${etat.modele} · ${etat.appareil.slice(-6)}` : undefined} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        {ouverte ? (
          <Carte style={{ gap: 14 }}>
            <Text style={s.titreCarte}>{t("Tablette déverrouillée jusqu'à {heure}", { heure: heure(ouverte) })}</Text>
            <Text style={s.texte}>
              {t('Paramètres et Play Store sont visibles ; une appli installée maintenant restera sur la tablette. Elle se reverrouille seule à {heure}.', { heure: heure(ouverte) })}
            </Text>
            <View style={s.ligne}>
              <Bouton titre={t('Ouvrir les Paramètres')} icone="wrench" onPress={() => void agir(() => IntentLauncher.startActivityAsync('android.settings.SETTINGS'))} />
              <Bouton titre={t('Ouvrir le Play Store')} icone="download" onPress={() => void agir(async () => IntentLauncher.openApplication('com.android.vending'))} />
            </View>
            <Bouton titre={t('Reverrouiller maintenant')} icone="lock" primaire grand occupe={occupe} onPress={() => void agir(reverrouiller)} />
            {dev && (
              // Redmi d'essai : passer la propriété de l'appli DEV à l'appli normale, sans réinitialiser.
              <Bouton titre="Transférer la propriété à l'appli normale" onPress={() => void agir(() => transfererVers('ma.stepag.suivifuites'))} />
            )}
          </Carte>
        ) : etat?.proprietaire ? (
          <Carte style={{ gap: 14 }}>
            <Text style={s.titreCarte}>{t('Tablette verrouillée')}</Text>
            <Text style={s.texte}>
              {t("Cette tablette est réservée au travail. Pour installer une appli ou changer un réglage, demandez un code à l'administrateur.")}
            </Text>
            <Text style={s.texteFort}>{t('Code de déverrouillage')}</Text>
            <Saisie
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
              placeholder={t('Code à 8 chiffres')}
              keyboardType="number-pad"
              maxLength={8}
              style={{ fontSize: 28, letterSpacing: 6, textAlign: 'center' }}
              accessibilityLabel={t('Code de déverrouillage')}
            />
            <Bouton titre={t('Déverrouiller')} icone="lock-open" primaire grand occupe={occupe} desactive={code.length !== 8} onPress={() => void valider()} />
            <View style={{ gap: 4 }}>
              <Text style={s.texteFort}>{t('Comment faire ?')}</Text>
              <Text style={s.discret}>{t("1. L'administrateur crée un code sur le panneau web (Paramètres › Tablettes) et vous le donne.")}</Text>
              <Text style={s.discret}>{t('2. Tapez le code ici, puis « Déverrouiller » : Paramètres et Play Store réapparaissent.')}</Text>
              <Text style={s.discret}>{t("3. Après le réglage ou l'installation, « Reverrouiller maintenant ». Sinon la tablette se reverrouille seule à l'heure.")}</Text>
            </View>
          </Carte>
        ) : null}
        {!!message && <Message ton={message.ton}>{message.texte}</Message>}
        <Bouton titre={t('Retour')} icone="arrow-left" onPress={retour} />
      </ScrollView>
    </View>
  );
}
