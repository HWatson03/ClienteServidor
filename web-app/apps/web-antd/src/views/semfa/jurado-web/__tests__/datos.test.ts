import type { HojaEvaluacion, TableroJurado } from '#/api/jurado';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cola sin señal de la app web ligera del jurado (`datos.ts`): descarga del paquete,
 * guardado sin red («por enviar» al instante), subida con `evaluar-lote` y rechazo.
 */

const tablero: TableroJurado = {
  categorias: [
    {
      actividad: 'FEXCOIN',
      criterios: 2,
      evaluados: 0,
      idActividad: 1,
      idCategoria: 22,
      nombre: 'Tecnología',
      pendientes: 2,
      proyectos: [111, 112].map((id, i) => ({
        actualizado: null,
        carrera: null,
        estado: 'PENDIENTE' as const,
        facultad: null,
        idInscripcion: id + 1000,
        idParticipante: id,
        institucion: 'UAP',
        jornada: 1,
        nombre: `Proyecto ${id}`,
        orden: i + 1,
        rubricasEvaluadas: 0,
        stand: null,
        total: null,
      })),
      puntajeMaximo: 20,
      rubricas: 1,
    },
  ],
  jurado: { idJurado: 5, nombre: 'Jurado Uno' },
  resumen: { evaluados: 0, parciales: 0, pendientes: 2, proyectos: 2 },
};

const hoja = (idParticipante: number): HojaEvaluacion => ({
  actividad: 'FEXCOIN',
  actualizado: null,
  carrera: null,
  categoria: 'Tecnología',
  estado: 'PENDIENTE',
  facultad: null,
  idCategoria: 22,
  idParticipante,
  institucion: 'UAP',
  jornada: 1,
  orden: 1,
  proyecto: `Proyecto ${idParticipante}`,
  puntajeMaximo: 20,
  reevaluacionAutorizada: false,
  rubricas: [
    {
      criterios: [11, 12].map((idCriterio) => ({
        descripcion: null,
        idCriterio,
        maximo: 10,
        minimo: 1,
        niveles: [],
        nombre: `Criterio ${idCriterio}`,
        paso: 1,
        puntaje: null,
        soloNiveles: false,
      })),
      evaluada: false,
      idRubrica: 6,
      nombre: 'Rúbrica',
      version: null,
    },
  ],
  stand: null,
  total: null,
});

type Lote = (cuerpo: unknown[]) => 'sin-red' | Response;
let responderLote: Lote;
const pedidos: { metodo: string; url: string }[] = [];

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ data, mensaje: 'OK', ok: true }), {
    headers: { 'Content-Type': 'application/json', ...headers },
    status,
  });
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  pedidos.length = 0;
  localStorage.setItem(
    'semfa.jw.sesion',
    JSON.stringify({ idUsuario: 1, nombre: 'Jurado Uno', token: 'tk', usuario: 'jurado1' }),
  );
  responderLote = (cuerpo) => json(cuerpo.map(() => ({ mensaje: 'Evaluación guardada', ok: true, status: 200 })));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const metodo = init.method ?? 'GET';
      pedidos.push({ metodo, url });
      const etag = (init.headers as Record<string, string>)['If-None-Match'];
      if (url.endsWith('/jurado/paquete')) {
        if (etag === 'W/"p1"') return new Response(null, { status: 304 });
        return json({ generado: null, hojas: [hoja(111), hoja(112)], tablero }, 200, { ETag: 'W/"p1"' });
      }
      if (url.endsWith('/jurado/tablero')) return new Response(null, { status: 304 });
      if (url.endsWith('/jurado/evaluar-lote')) {
        const r = responderLote(JSON.parse(String(init.body)));
        if (r === 'sin-red') throw new TypeError('Failed to fetch');
        return r;
      }
      return new Response(null, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function cargarDatos() {
  const datos = await import('../datos');
  await vi.waitFor(() => expect(datos.paquete.value).not.toBeNull());
  await vi.waitFor(() => expect(datos.red.sincronizando).toBe(false));
  return datos;
}

describe('app web del jurado: paquete y cola sin señal', () => {
  it('al iniciar con sesión baja el paquete y lo guarda en el celular', async () => {
    const datos = await cargarDatos();
    expect(datos.tablero.value?.resumen.proyectos).toBe(2);
    expect(datos.hojaLocal(22, 111)?.proyecto).toBe('Proyecto 111');
    expect(localStorage.getItem('semfa.jw.jurado1.paquete')).toContain('Proyecto 112');
  });

  it('sin señal la evaluación queda «por enviar» y el proyecto ya se ve evaluado', async () => {
    const datos = await cargarDatos();
    responderLote = () => 'sin-red';

    const r = await datos.guardarEvaluacion(hoja(111), { 11: 8, 12: 9 }, 17, 50);

    expect(r.estado).toBe('pendiente');
    expect(datos.pendientesDeSubir.value).toBe(1);
    const p = datos.tablero.value!.categorias[0]!.proyectos[0]!;
    expect(p).toMatchObject({ estado: 'EVALUADO', porSubir: true, total: 17 });
    expect(datos.tablero.value!.resumen).toMatchObject({ evaluados: 1, pendientes: 1 });
    expect(datos.hojaLocal(22, 111)?.rubricas[0]!.criterios.map((c) => c.puntaje)).toEqual([8, 9]);
    // Persistida: sobrevive a cerrar la pestaña.
    expect(JSON.parse(localStorage.getItem('semfa.jw.jurado1.cola')!)).toHaveLength(1);

    // Vuelve la señal: se sube en un solo lote y deja de estar «por enviar».
    responderLote = (cuerpo) => json(cuerpo.map(() => ({ mensaje: 'ok', ok: true, status: 200 })));
    await datos.subirCola();
    expect(datos.pendientesDeSubir.value).toBe(0);
    expect(datos.tablero.value!.categorias[0]!.proyectos[0]).toMatchObject({ estado: 'EVALUADO', porSubir: false, total: 17 });
    const lote = pedidos.filter((x) => x.url.endsWith('/jurado/evaluar-lote'));
    expect(lote.length).toBeGreaterThanOrEqual(2);
  });

  it('con señal se envía al momento', async () => {
    const datos = await cargarDatos();
    const r = await datos.guardarEvaluacion(hoja(112), { 11: 5, 12: 5 }, 10);
    expect(r.estado).toBe('subida');
    expect(datos.cola.value).toHaveLength(0);
  });

  it('un rechazo del servidor no se reintenta solo y no marca el proyecto como evaluado', async () => {
    const datos = await cargarDatos();
    responderLote = (cuerpo) =>
      json(cuerpo.map(() => ({ mensaje: 'La evaluación ya fue enviada.', ok: false, status: 409 })));

    const r = await datos.guardarEvaluacion(hoja(112), { 11: 5, 12: 5 }, 10);

    expect(r).toEqual({ estado: 'rechazada', mensaje: 'La evaluación ya fue enviada.', status: 409 });
    expect(datos.rechazadas.value).toHaveLength(1);
    expect(datos.pendientesDeSubir.value).toBe(0);
    expect(datos.tablero.value!.categorias[0]!.proyectos[1]!.estado).toBe('PENDIENTE');

    datos.descartar(datos.rechazadas.value[0]!.clave);
    expect(datos.cola.value).toHaveLength(0);
  });

  it('un 500 deja la evaluación en la cola para reintentar', async () => {
    const datos = await cargarDatos();
    responderLote = (cuerpo) => json(cuerpo.map(() => ({ mensaje: 'Error al guardar; reintente.', ok: false, status: 500 })));

    const r = await datos.guardarEvaluacion(hoja(111), { 11: 8, 12: 9 }, 17);

    expect(r.estado).toBe('pendiente');
    expect(datos.cola.value[0]).toMatchObject({ estado: 'pendiente' });
  });
});
