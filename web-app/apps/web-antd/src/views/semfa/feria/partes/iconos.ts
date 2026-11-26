/**
 * Íconos de línea (24×24, `stroke`) de las categorías de la feria, elegidos por palabra clave del
 * nombre. Sin librerías: cada uno es un `d` de `<path>`.
 */
const ICONOS: [RegExp, string][] = [
  [/investig/, 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20'],
  [/cienc/, 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9'],
  [/tecnolog|sistema|informat/, 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4'],
  [/innova/, 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
  [/emprend|negocio/, 'M4 19h16M6 15l4-4 3 3 5-6M14 8h4v4'],
  [/posgrad|postgrad|maestr|doctor/, 'M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h5z'],
  [/educa|pedag/, 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6'],
  [/amazon|derecho|human/, 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l8-8'],
  [/socied|ambient|comunid/, 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z'],
  [/desarroll|product|industr/, 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1'],
  [/salud|medic|enferm/, 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM9 11h6M12 8v6'],
];
const ESTRELLA = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z';

export function iconoCategoria(nombre: null | string | undefined): string {
  const n = String(nombre ?? '').normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase();
  return ICONOS.find(([re]) => re.test(n))?.[1] ?? ESTRELLA;
}
