import { describe, expect, it } from 'vitest';

import { coincideProyecto, terminosDeBusqueda } from '../busqueda-proyecto';

const p = {
  nombre: 'Conocimiento sobre leishmaniasis, transmisión y prevención en 30 adultos, Cobija 2026',
  institucion: 'Medicina',
  carrera: 'Medicina',
  facultad: 'Área de la Salud',
  stand: 'B-12',
  orden: 7,
};

describe('buscador de proyectos del jurado', () => {
  it('sin texto muestra todo', () => {
    expect(coincideProyecto(p, terminosDeBusqueda('   '))).toBe(true);
  });
  it('palabras en cualquier orden, sin tildes ni mayúsculas', () => {
    expect(coincideProyecto(p, terminosDeBusqueda('COBIJA leish'))).toBe(true);
    expect(coincideProyecto(p, terminosDeBusqueda('transmision prevencion'))).toBe(true);
    expect(coincideProyecto(p, terminosDeBusqueda('area salud'))).toBe(true);
  });
  it('exige todas las palabras', () => {
    expect(coincideProyecto(p, terminosDeBusqueda('leish dengue'))).toBe(false);
  });
  it('busca por stand y número de orden', () => {
    expect(coincideProyecto(p, terminosDeBusqueda('b-12'))).toBe(true);
    expect(coincideProyecto(p, terminosDeBusqueda('7'))).toBe(true);
  });
});
