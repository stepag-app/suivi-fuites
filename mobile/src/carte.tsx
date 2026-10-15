// Carte du terrain (bouton « Carte » de la liste) : page `/carte?mode=terrain` du panneau web dans une WebView, comme
// le Balayage, en plein écran et en lecture seule : fuites (par statut, prioritaires), réseau, zones balayées,
// satellite et position de l'agent, en calques. « Ouvrir la fiche » d'une bulle ouvre la fiche ici ; au retour, la
// carte revient sur cette fuite. Contrat de la page : web/src/app/(app)/carte/CarteTerrain.tsx.
import { CartePanneau } from './balayage';
import { t, useLangue } from './langue';
import { useSession } from './session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CarteFuites({ retour, ouvrirFiche, fuite }: {
  retour: () => void; ouvrirFiche: (id: string) => void; fuite?: string;
}) {
  useLangue();
  const marcheId = useSession().marche?.id;
  const chemin = `/carte?mode=terrain${marcheId ? `&marche=${marcheId}` : ''}${fuite ? `&fuite=${fuite}` : ''}`;
  return (
    <CartePanneau
      titre={t('Carte')} sousTitre={t('Fuites, réseau et zones balayées')} chemin={chemin} retour={retour}
      surMessage={(m) => {
        if (m.type === 'carte:ouvrir-fuite' && typeof m.id === 'string' && UUID.test(m.id)) ouvrirFiche(m.id);
      }}
    />
  );
}
