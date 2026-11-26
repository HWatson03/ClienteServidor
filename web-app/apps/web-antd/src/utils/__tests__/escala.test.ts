import { describe, expect, it } from 'vitest';

import {
  aFormulario,
  cambiarDesde,
  cambiarHasta,
  claseNivelPorPosicion,
  errorEscala,
  erroresRangos,
  escalaDesde,
  leerFilaWord,
  nivelesDeFilaWord,
  nivelesPorRango,
  quitarNivelRango,
  resumenEscala,
  valoresDeRango,
} from '#/utils/escala';
import type { EscalaEdicion } from '#/utils/escala';

const rangos = (maximo: number): EscalaEdicion => ({
  maximo,
  minimo: 0,
  modo: 'rangos',
  // «Repartir» crea los niveles sin descripción (es obligatoria): el ayudante las completa.
  niveles: nivelesPorRango(maximo).map((n) => ({ ...n, descripcion: `Descripción de ${n.nombre}` })),
  paso: 1,
  soloNiveles: false,
});

const rango = (n: { desde?: number; puntos?: number }[]) => n.map((x) => [x.desde, x.puntos]);

describe('nivelesPorRango', () => {
  it('reparte 20 como la rúbrica de la FEXCOIN', () => {
    const n = nivelesPorRango(20);
    expect(rango(n)).toEqual([[0, 4], [5, 8], [9, 12], [13, 16], [17, 20]]);
    expect(n.map((x) => x.nombre)).toEqual(['Deficiente', 'Regular', 'Bueno', 'Muy Bueno', 'Excelente']);
  });

  it('reparte 10', () => {
    expect(rango(nivelesPorRango(10))).toEqual([[0, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
  });

  it('cubre 0..max sin huecos para cualquier máximo', () => {
    for (let max = 4; max <= 100; max++) {
      const n = nivelesPorRango(max);
      expect(n[0]!.desde).toBe(0);
      expect(n.at(-1)!.puntos).toBe(max);
      n.slice(1).forEach((x, i) => expect(x.desde).toBe(n[i]!.puntos! + 1));
    }
  });
});

describe('edición de rangos', () => {
  it('al cambiar un «hasta» el «desde» siguiente se ajusta solo', () => {
    const n = nivelesPorRango(20);
    const cambiado = cambiarHasta(n, n[0]!.clave, 6);
    expect(rango(cambiado).slice(0, 2)).toEqual([[0, 6], [7, 8]]);
  });

  it('al cambiar un «desde» el «hasta» anterior se ajusta solo', () => {
    const n = nivelesPorRango(20);
    const cambiado = cambiarDesde(n, n[2]!.clave, 10);
    expect(rango(cambiado).slice(1, 3)).toEqual([[5, 9], [10, 12]]);
  });

  it('al quitar un nivel cierra el hueco', () => {
    const n = nivelesPorRango(20);
    const sin = quitarNivelRango(n, n[1]!.clave);
    // El siguiente (9–12) empieza donde terminaba el anterior + 1; su «hasta» no cambia.
    expect(rango(sin)).toEqual([[0, 4], [5, 12], [13, 16], [17, 20]]);
  });
});

describe('errores de rangos', () => {
  it('no hay error con el reparto por defecto', () => {
    expect(errorEscala(rangos(20))).toBe('');
  });

  it('avisa de huecos y solapes', () => {
    const e = rangos(20);
    const hueco = { ...e, niveles: e.niveles.map((n, i) => (i === 2 ? { ...n, desde: 10 } : n)) };
    expect(errorEscala(hueco)).toMatch(/Hueco/);
    const solape = { ...e, niveles: e.niveles.map((n, i) => (i === 2 ? { ...n, desde: 8 } : n)) };
    expect(errorEscala(solape)).toMatch(/solapa/);
  });

  it('exige la descripción de cada nivel (el reparto por defecto la deja vacía)', () => {
    const e = rangos(20);
    expect(errorEscala(e)).toBe('');
    e.niveles[2]!.descripcion = '   ';
    expect(erroresRangos(e.niveles).get(e.niveles[2]!.clave)).toBe('Falta la descripción del nivel «Bueno».');
    expect(errorEscala(e)).toMatch(/Falta la descripción/);
    // «Repartir» / cambiar a rangos genera niveles sin descripción: el error en vivo lo indica.
    const recienRepartido: EscalaEdicion = { ...e, niveles: nivelesPorRango(20) };
    expect(errorEscala(recienRepartido)).toMatch(/Falta la descripción del nivel «Deficiente»/);
    expect(erroresRangos(recienRepartido.niveles).size).toBe(5);
  });

  it('exige nombre, no repetido', () => {
    const e = rangos(20);
    e.niveles[1]!.nombre = '';
    expect(errorEscala(e)).toMatch(/nombre/);
    e.niveles[1]!.nombre = 'deficiente';
    expect(erroresRangos(e.niveles).get(e.niveles[1]!.clave)).toMatch(/dos niveles/i);
  });

  it('rechaza decimales y desde mayor que hasta', () => {
    const e = rangos(20);
    e.niveles[0]!.puntos = 4.5;
    expect(errorEscala(e)).toMatch(/enteros/);
    const f = rangos(20);
    f.niveles[1]!.desde = 9;
    expect(errorEscala(f)).toMatch(/no puede pasar/);
  });
});

describe('formulario y resumen', () => {
  it('manda mínimo, máximo, paso 1 y niveles con nombre y desde', () => {
    const f = aFormulario(rangos(20));
    expect(f.puntajeMinimo).toBe(0);
    expect(f.porcentaje).toBe(20);
    expect(f.paso).toBe(1);
    expect(f.soloNiveles).toBe(false);
    expect(f.niveles[3]).toMatchObject({ desde: 13, nombre: 'Muy Bueno', puntos: 16 });
  });

  it('resume «5 niveles por rango (0–20)» y vuelve a leerlo para editar', () => {
    const f = aFormulario(rangos(20));
    const texto = resumenEscala({ maximo: f.porcentaje, minimo: f.puntajeMinimo, niveles: f.niveles, paso: f.paso, soloNiveles: false });
    expect(texto).toBe('5 niveles por rango (0–20)');
    const e = escalaDesde(
      { heredada: false, maximo: 20, minimo: 0, niveles: f.niveles, paso: 1, soloNiveles: false },
      20,
    );
    expect(e.modo).toBe('rangos');
    expect(e.niveles[4]).toMatchObject({ desde: 17, nombre: 'Excelente', puntos: 20 });
  });

  it('los niveles de punto siguen siendo «niveles»', () => {
    const e = escalaDesde(
      { heredada: false, maximo: 25, minimo: 5, niveles: [{ descripcion: 'a', puntos: 5 }, { descripcion: 'b', puntos: 25 }], paso: 1, soloNiveles: true },
      25,
    );
    expect(e.modo).toBe('niveles');
  });
});

describe('colores y valores', () => {
  it('va de deficiente a excelente', () => {
    expect([0, 1, 2, 3, 4].map((i) => claseNivelPorPosicion(i, 5))).toEqual([
      'semfa-nivel--deficiente',
      'semfa-nivel--regular',
      'semfa-nivel--bueno',
      'semfa-nivel--muy-bueno',
      'semfa-nivel--excelente',
    ]);
    expect(claseNivelPorPosicion(0, 3)).toBe('semfa-nivel--deficiente');
    expect(claseNivelPorPosicion(2, 3)).toBe('semfa-nivel--excelente');
  });

  it('lista los enteros del rango', () => {
    expect(valoresDeRango(13, 16)).toEqual([13, 14, 15, 16]);
    expect(valoresDeRango(5, 4)).toEqual([]);
  });
});

describe('leerFilaWord', () => {
  const T = '\t';
  const fila20 = [
    '1. Pertinencia y claridad del problema (Bloque 01: Problema y Pregunta) (Máx. 20 pts)',
    '0 – 4 ptsPresentan errores en el problema o no lo plantean.',
    '5 – 8 ptsPlantean el problema, pero la pregunta es poco clara.',
    '9 – 12 ptsExplican correctamente el problema y la pregunta del Bloque 01, pero sustentan de forma general la necesidad.',
    '13 – 16 ptsExplican bien el problema y sustentan la necesidad.',
    '17 – 20 ptsPlantean con claridad y evidencia el problema.',
  ].join(T);

  it('llena los 5 niveles con su rango y descripción (el rango va pegado)', () => {
    const f = leerFilaWord(fila20)!;
    expect(f.niveles).toHaveLength(5);
    expect(f.niveles.map((n) => [n.desde, n.hasta])).toEqual([[0, 4], [5, 8], [9, 12], [13, 16], [17, 20]]);
    expect(f.niveles[0]!.descripcion).toBe('Presentan errores en el problema o no lo plantean.');
    expect(f.niveles[2]!.descripcion).toBe(
      'Explican correctamente el problema y la pregunta del Bloque 01, pero sustentan de forma general la necesidad.',
    );
  });

  it('propone nombre, bloque y máximo del criterio', () => {
    const f = leerFilaWord(fila20)!;
    expect(f.criterio).toEqual({
      descripcion: 'Bloque 01: Problema y Pregunta',
      maximo: 20,
      nombre: 'Pertinencia y claridad del problema',
    });
  });

  it('acepta guion corto, «pt» y criterio de 10', () => {
    const f = leerFilaWord(
      ['2. Aporte (Máx. 10 pts)', '0-2 ptMuy poco.', '3-4 ptPoco.', '5-6 ptRegular.', '7-8 ptBien.', '9-10 ptExcelente.'].join(T),
    )!;
    expect(f.criterio.maximo).toBe(10);
    expect(f.niveles.map((n) => [n.desde, n.hasta])).toEqual([[0, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    expect(f.niveles[0]!.descripcion).toBe('Muy poco.');
  });

  it('no se come la S mayúscula de la descripción', () => {
    const f = leerFilaWord(['Criterio uno', '0 – 4 ptsSolo menciona.', '5 – 8 ptsSolo parte.'].join(T))!;
    expect(f.niveles[0]!.descripcion).toBe('Solo menciona.');
  });

  it('ignora la fila del encabezado y lee la fila de datos que sigue', () => {
    expect(leerFilaWord(['Criterio', 'Deficiente', 'Regular', 'Bueno', 'Muy Bueno', 'Excelente'].join(T))).toBeNull();
    const f = leerFilaWord(`Criterio${T}Deficiente${T}Regular${T}Bueno${T}Muy Bueno${T}Excelente\n${fila20}`);
    expect(f?.niveles).toHaveLength(5);
  });

  it('aguanta celdas con saltos de línea', () => {
    const f = leerFilaWord('1. Tema (Máx. 10 pts)\n0 – 2 pts\nPoco claro.\n3 – 10 pts\nClaro.')!;
    expect(f.niveles.map((n) => n.descripcion)).toEqual(['Poco claro.', 'Claro.']);
  });

  it('devuelve null si no hay rangos', () => {
    expect(leerFilaWord('texto cualquiera')).toBeNull();
    expect(leerFilaWord('0 – 4 pts solo uno')).toBeNull();
  });

  it('nivelesDeFilaWord pone los nombres por defecto en orden', () => {
    const n = nivelesDeFilaWord(leerFilaWord(fila20)!);
    expect(n.map((x) => x.nombre)).toEqual(['Deficiente', 'Regular', 'Bueno', 'Muy Bueno', 'Excelente']);
    expect(n[3]).toMatchObject({ desde: 13, puntos: 16 });
  });
});
