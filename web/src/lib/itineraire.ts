// Lien d'itinéraire vers une position : ouvre l'application Google Maps sur la tablette Android,
// le site sur ordinateur. Pas de carte Google intégrée (décision reportée).
export function lienItineraire(latitude: number | null | undefined, longitude: number | null | undefined): string | null {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
