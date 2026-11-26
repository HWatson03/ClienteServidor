import { describe, expect, it } from 'vitest';

import {
  contarPorJornada,
  etiquetaJornada,
  fechaCortaJornada,
  opcionesJornada,
  textoJornadaEnCurso,
} from '#/utils/jornadas';

describe('jornadas', () => {
  it('cuenta los proyectos de cada día y los que no tienen', () => {
    const items = [{ jornada: 1 }, { jornada: 1 }, { jornada: 2 }, { jornada: null }, {}];
    expect(contarPorJornada(items, 2)).toEqual({ porDia: [2, 1], sinDia: 2 });
  });

  it('una jornada fuera de rango cuenta como sin día', () => {
    expect(contarPorJornada([{ jornada: 3 }, { jornada: 0 }, { jornada: 2 }], 2)).toEqual({
      porDia: [0, 1],
      sinDia: 2,
    });
  });

  it('una actividad de un día tiene una sola jornada', () => {
    expect(contarPorJornada([{ jornada: 1 }], 1)).toEqual({ porDia: [1], sinDia: 0 });
    expect(opcionesJornada({ fecha: '2026-11-13', jornadas: 1 })).toHaveLength(1);
  });

  it('etiqueta cada día con su fecha', () => {
    expect(etiquetaJornada('2026-11-13', 2)).toContain('Día 2');
    expect(etiquetaJornada('2026-11-13', 2)).toContain('14');
    expect(etiquetaJornada(null, 2)).toBe('Día 2');
  });

  it('da la fecha corta de cada día', () => {
    expect(fechaCortaJornada('2026-11-13', 1)).toBe('13/11');
    expect(fechaCortaJornada('2026-11-30', 2)).toBe('01/12');
    expect(fechaCortaJornada(null, 1)).toBe('');
  });

  it('describe la jornada en curso', () => {
    expect(textoJornadaEnCurso('2026-11-13', null)).toBe('Todos los proyectos');
    expect(textoJornadaEnCurso('2026-11-13', 1)).toContain('Día 1');
  });
});
