/** Cálculos simples para «Iniciar ruta» (sin servicios externos de rutas). */
import { numero, t } from './i18n';


/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/** «≈ 120 m · 2 min a pie» a paso de caminata (~75 m por minuto, con algo de rodeo), en el idioma que se ve. */
export function textoCaminata(metros: number): string {
  const real = metros * 1.25;
  const distancia = real < 1000 ? `${Math.max(5, Math.round(real / 5) * 5)} m` : `${numero(Math.round(real / 100) / 10)} km`;
  const min = Math.max(1, Math.round(real / 75));
  const tiempo = min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  return t('≈ {d} · {t} a pie', { d: distancia, t: tiempo });
}

export const urlGoogleMaps = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=walking`;
