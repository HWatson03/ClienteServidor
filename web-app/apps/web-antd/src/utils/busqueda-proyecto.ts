import { normalizarTexto } from '#/utils/formato';

/**
 * Buscador de proyectos del jurado (FEXCOIN: hasta 234 por categoría). Separa
 * el texto en palabras y exige que estén todas, en cualquier orden y sin
 * importar tildes ni mayúsculas, en el título, la institución, la carrera, la
 * facultad, el stand o el número de orden: «leish cobija» encuentra
 * «Conocimiento sobre leishmaniasis… Cobija 2026».
 */
export function terminosDeBusqueda(texto: string): string[] {
  return normalizarTexto(texto).split(/\s+/).filter(Boolean);
}

export function coincideProyecto(
  p: {
    carrera?: null | string;
    facultad?: null | string;
    institucion?: null | string;
    nombre: string;
    orden?: null | number;
    stand?: null | string;
  },
  terminos: string[],
): boolean {
  if (terminos.length === 0) return true;
  const texto = normalizarTexto(
    [p.nombre, p.institucion, p.carrera, p.facultad, p.stand, p.orden].filter((v) => v != null).join(' '),
  );
  return terminos.every((t) => texto.includes(t));
}
