import { describe, expect, it } from 'vitest';

import { leerNota, posicionEstimada, puntajeEnCategoria } from '#/utils/nota-acta';

describe('leerNota', () => {
  it('lee las formas en que llega la nota', () => {
    expect(leerNota('8.5', 10)).toEqual({ escala: 10, ok: true, texto: '8.5/10', valor: 8.5 });
    expect(leerNota(' 8,5 ', 10)).toMatchObject({ ok: true, texto: '8.5/10' });
    expect(leerNota('95/100', null)).toMatchObject({ escala: 100, ok: true, valor: 95 });
    expect(leerNota('95 sobre 100', 10)).toMatchObject({ escala: 100, ok: true });
  });

  it('rechaza lo que no se entiende', () => {
    expect(leerNota('', 10).ok).toBe(false);
    expect(leerNota('ocho', 10).ok).toBe(false);
    expect(leerNota('8.5', null).ok).toBe(false);
    expect(leerNota('11', 10).ok).toBe(false);
    expect(leerNota('101/100', null).ok).toBe(false);
  });
});

describe('puntajeEnCategoria', () => {
  it('convierte con regla de tres', () => {
    expect(puntajeEnCategoria(8.5, 10, 100)).toBe(85);
    expect(puntajeEnCategoria(8.5, 10, 50)).toBe(42.5);
    expect(puntajeEnCategoria(8.5, 10, 0)).toBe(85);
    expect(puntajeEnCategoria(2, 3, 100)).toBe(66.67);
  });
});

describe('posicionEstimada', () => {
  const grupo = [
    { estado: 'COMPLETO', idInscripcion: 1, puntaje: 90 },
    { estado: 'COMPLETO', idInscripcion: 2, puntaje: 80 },
    { estado: 'EN_PROCESO', idInscripcion: 3, puntaje: null },
    { estado: 'SIN_JURADOS', idInscripcion: 4, puntaje: null },
    { estado: 'SIN_INICIAR', idInscripcion: 5, puntaje: null },
  ];

  it('ubica entre los evaluados y cuenta los pendientes', () => {
    expect(posicionEstimada(grupo, 5, 85)).toEqual({ pendientes: 1, puesto: 2, total: 3 });
    // Empate con el primero: comparte el 1°.
    expect(posicionEstimada(grupo, 5, 90)).toMatchObject({ puesto: 1 });
    // Se excluye a sí mismo (re-editar una nota ya puesta).
    expect(posicionEstimada(grupo, 2, 70)).toEqual({ pendientes: 2, puesto: 2, total: 2 });
  });
});
