import { describe, expect, it } from 'vitest';

import { diasHasta, fechaLocal, fechaRelativa, formatearFecha } from '#/utils/formato';

const HOY = new Date(2026, 8, 29, 18, 30); // 29/09/2026, por la tarde

describe('fechas yyyy-MM-dd', () => {
  it('lee la fecha como día local, sin desplazarla por zona horaria', () => {
    const fecha = fechaLocal('2026-10-15');
    expect(fecha?.getDate()).toBe(15);
    expect(fecha?.getMonth()).toBe(9);
    expect(fechaLocal('15/10/2026')).toBeNull();
    expect(fechaLocal(null)).toBeNull();
  });

  it('cuenta días enteros aunque la hora actual no sea medianoche', () => {
    expect(diasHasta('2026-09-29', HOY)).toBe(0);
    expect(diasHasta('2026-09-30', HOY)).toBe(1);
    expect(diasHasta('2026-10-15', HOY)).toBe(16);
    expect(diasHasta('2026-09-01', HOY)).toBe(-28);
  });

  it('describe la distancia en texto', () => {
    expect(fechaRelativa('2026-09-29', HOY)).toBe('Hoy');
    expect(fechaRelativa('2026-09-30', HOY)).toBe('Mañana');
    expect(fechaRelativa('2026-10-15', HOY)).toBe('En 16 días');
    expect(fechaRelativa('2026-06-01', HOY)).toBe('Hace 4 meses');
    expect(fechaRelativa('', HOY)).toBe('');
  });

  it('formatea para mostrar', () => {
    expect(formatearFecha('2026-10-15')).toMatch(/15.*oct.*2026/);
    expect(formatearFecha(null)).toBe('');
  });
});
