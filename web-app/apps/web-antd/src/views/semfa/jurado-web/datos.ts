import type { EvaluacionCompleta, HojaEvaluacion, ProyectoTablero, TableroJurado } from '#/api/jurado';

import { computed, reactive, shallowRef, watch } from 'vue';

import { alResponder, ErrorApi, esErrorDeRed, pedir } from './red';
import { marcarVencida, sesion } from './sesion';

/**
 * Datos de la app web ligera del jurado, pensados para la red saturada de la feria
 * (mismas reglas que la APK, `Docs/app-jurado/CONTEXTO-APK.md` §5.2):
 *
 *  - **Paquete** (`GET /api/jurado/paquete`, con ETag): tablero + la hoja de cada proyecto,
 *    guardado en el celular. Las pantallas leen SIEMPRE de aquí: abrir un proyecto es
 *    instantáneo y funciona sin señal.
 *  - **Cola**: al guardar, la evaluación se escribe primero en el celular y el proyecto se
 *    ve «Evaluado · por subir» al instante; se sube con `POST /api/jurado/evaluar-lote`
 *    (una petición para todas) en cuanto hay red, con reintentos espaciados.
 *  - **Refresco**: cada 30 s (con la pantalla visible), al volver la señal y al volver a la
 *    app se pide el tablero con ETag (304 = nada cambió, casi sin datos); solo si cambió se
 *    baja de nuevo el paquete.
 *
 * Todo se guarda por usuario: dos jurados en el mismo celular no se mezclan.
 */

export interface Paquete {
  generado: null | string;
  hojas: HojaEvaluacion[];
  tablero: TableroJurado;
}

export interface ItemCola {
  /** `categoria-participante`: una sola entrada por proyecto (la última gana). */
  clave: string;
  creado: number;
  dto: EvaluacionCompleta;
  estado: 'pendiente' | 'rechazada';
  /** Motivo del rechazo (el `mensaje` del servidor). */
  mensaje?: string;
  proyecto: string;
  status?: number;
  total: number;
}

/** Proyecto u hoja con una evaluación guardada en el celular que aún no llegó al servidor. */
export type ConPorSubir<T> = T & { porSubir?: boolean };

const claveDe = (idCategoria: number, idParticipante: number) => `${idCategoria}-${idParticipante}`;

// ------------------------------------------------------------------ estado

export const paquete = shallowRef<null | Paquete>(null);
export const cola = shallowRef<ItemCola[]>([]);
export const red = reactive({
  /** Hubo respuesta del servidor en la última petición. */
  conectado: navigator.onLine,
  /** Cuándo se recibió (o confirmó con 304) el paquete por última vez. */
  recibido: 0,
  sincronizando: false,
  subiendo: false,
});

let etagPaquete: null | string = null;
let etagTablero: null | string = null;
/** Intentos seguidos sin poder hablar con el servidor (para espaciar los reintentos). */
let fallos = 0;

alResponder((conectado) => {
  red.conectado = conectado;
});

// ------------------------------------------------------------------ almacenamiento local

const prefijo = () => `semfa.jw.${sesion.value?.usuario ?? '_'}`;

function leerJson<T>(clave: string): null | T {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? 'null') as null | T;
  } catch {
    return null;
  }
}

function escribirJson(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Lleno o bloqueado: sigue en memoria mientras la pestaña esté abierta.
  }
}

function guardarPaquete() {
  escribirJson(`${prefijo()}.paquete`, { datos: paquete.value, etag: etagPaquete, etagTablero, recibido: red.recibido });
}

function guardarCola() {
  escribirJson(`${prefijo()}.cola`, cola.value);
}

function cargarLocal() {
  const p = leerJson<{ datos: null | Paquete; etag: null | string; etagTablero?: null | string; recibido: number }>(
    `${prefijo()}.paquete`,
  );
  paquete.value = p?.datos ?? null;
  etagPaquete = p?.datos ? p.etag : null;
  etagTablero = p?.datos ? (p.etagTablero ?? null) : null;
  red.recibido = p?.recibido ?? 0;
  cola.value = leerJson<ItemCola[]>(`${prefijo()}.cola`) ?? [];
}

// La cola puede cambiar en otra pestaña del mismo celular.
window.addEventListener('storage', (e) => {
  if (sesion.value && e.key === `${prefijo()}.cola`) cola.value = leerJson<ItemCola[]>(e.key) ?? [];
});

// ------------------------------------------------------------------ vista local (paquete + cola)

/**
 * Aplica una evaluación a una copia del paquete: el proyecto pasa a EVALUADO con su total
 * y la hoja trae los puntajes. Sirve para mostrar lo que está en la cola y para consolidar
 * lo recién subido mientras llega el paquete nuevo del servidor.
 */
function aplicar(p: Paquete, item: ItemCola, porSubir: boolean): Paquete {
  const { categoriaId, participanteId } = item.dto;
  const puntajes = new Map(item.dto.rubricas.flatMap((r) => r.detalles.map((d) => [d.criterioId, d.puntaje] as const)));
  const ahora = new Date(item.creado).toISOString();

  const hojas = p.hojas.map((h) =>
    h.idCategoria === categoriaId && h.idParticipante === participanteId
      ? ({
          ...h,
          actualizado: ahora,
          estado: 'EVALUADO',
          porSubir,
          rubricas: h.rubricas.map((r) => ({
            ...r,
            criterios: r.criterios.map((c) => ({ ...c, puntaje: puntajes.get(c.idCriterio) ?? c.puntaje })),
            evaluada: true,
          })),
          // Ya enviada: una reevaluación autorizada se consume con este envío.
          reevaluacionAutorizada: false,
          total: item.total,
        } as ConPorSubir<HojaEvaluacion>)
      : h,
  );

  const resumen = { ...p.tablero.resumen };
  const categorias = p.tablero.categorias.map((c) => {
    if (c.idCategoria !== categoriaId) return c;
    let evaluados = c.evaluados;
    const proyectos = c.proyectos.map((x) => {
      if (x.idParticipante !== participanteId) return x;
      if (x.estado !== 'EVALUADO') {
        evaluados++;
        resumen.evaluados++;
        if (x.estado === 'PARCIAL') resumen.parciales--;
        else resumen.pendientes--;
      }
      return {
        ...x,
        actualizado: ahora,
        estado: 'EVALUADO',
        porSubir,
        rubricasEvaluadas: item.dto.rubricas.length,
        total: item.total,
      } as ConPorSubir<ProyectoTablero>;
    });
    return { ...c, evaluados, pendientes: proyectos.length - evaluados, proyectos };
  });

  return { ...p, hojas, tablero: { ...p.tablero, categorias, resumen } };
}

/** El paquete tal como lo ve el jurado: con lo que está en la cola ya aplicado. */
export const local = computed<null | Paquete>(() => {
  const p = paquete.value;
  if (!p) return null;
  return cola.value.filter((i) => i.estado === 'pendiente').reduce((acc, i) => aplicar(acc, i, true), p);
});

export const tablero = computed(() => local.value?.tablero ?? null);
export const pendientesDeSubir = computed(() => cola.value.filter((i) => i.estado === 'pendiente').length);
export const rechazadas = computed(() => cola.value.filter((i) => i.estado === 'rechazada'));

export function hojaLocal(idCategoria: number, idParticipante: number): ConPorSubir<HojaEvaluacion> | null {
  return local.value?.hojas.find((h) => h.idCategoria === idCategoria && h.idParticipante === idParticipante) ?? null;
}

/** La hoja desde el servidor (sin bloquear: tope corto). Actualiza el paquete guardado. */
export async function refrescarHoja(idCategoria: number, idParticipante: number) {
  const s = sesion.value;
  if (!s || s.vencida) return null;
  try {
    const { data } = await pedir<HojaEvaluacion>(
      `/jurado/categorias/${idCategoria}/participantes/${idParticipante}/evaluacion`,
      { ms: 8000, token: s.token },
    );
    if (data && paquete.value) {
      const otras = paquete.value.hojas.filter((h) => !(h.idCategoria === idCategoria && h.idParticipante === idParticipante));
      paquete.value = { ...paquete.value, hojas: [...otras, data] };
      guardarPaquete();
    }
    return data ? hojaLocal(idCategoria, idParticipante) ?? data : null;
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 401) marcarVencida();
    throw error;
  }
}

// ------------------------------------------------------------------ sincronización

/** Baja el paquete (con ETag). */
async function bajarPaquete(token: string) {
  const r = await pedir<Paquete>('/jurado/paquete', { etag: etagPaquete, ms: 30_000, token });
  if (r.data) {
    paquete.value = r.data;
    etagPaquete = r.etag;
  }
  red.recibido = Date.now();
  guardarPaquete();
}

/**
 * Pide el tablero con ETag y, si cambió (o no hay paquete), el paquete completo.
 * `forzar` pide el paquete aunque el tablero no haya cambiado (p. ej. tras subir).
 */
async function refrescar(token: string, forzar = false) {
  if (!paquete.value || forzar) {
    await bajarPaquete(token);
    return;
  }
  const r = await pedir<TableroJurado>('/jurado/tablero', { etag: etagTablero, ms: 12_000, token });
  etagTablero = r.etag;
  if (r.status === 304) {
    red.recibido = Date.now();
    guardarPaquete();
    return;
  }
  await bajarPaquete(token);
}

let subidaEnCurso: null | Promise<void> = null;

/** Sube la cola pendiente en lotes de hasta 100. Una sola subida a la vez. */
export function subirCola(): Promise<void> {
  if (subidaEnCurso) return subidaEnCurso;
  const s = sesion.value;
  if (!s || s.vencida || pendientesDeSubir.value === 0) return Promise.resolve();
  // Se suelta al terminar (con `finally` aparte: si el cuerpo no esperara nada, un
  // `finally` interno correría antes de asignar y la marca quedaría pegada para siempre).
  const subida = subirLotes(s.token);
  subidaEnCurso = subida;
  subida
    .finally(() => {
      if (subidaEnCurso === subida) subidaEnCurso = null;
    })
    .catch(() => {});
  return subida;
}

async function subirLotes(token: string) {
      red.subiendo = true;
      try {
        let subioAlgo = false;
        for (;;) {
          const lote = cola.value.filter((i) => i.estado === 'pendiente').slice(0, 100);
          if (lote.length === 0) break;
          const { data } = await pedir<{ mensaje: null | string; ok: boolean; status: number }[]>('/jurado/evaluar-lote', {
            cuerpo: lote.map((i) => i.dto),
            metodo: 'POST',
            ms: 25_000,
            token,
          });
          const resultados = data ?? [];
          let consolidado = paquete.value;
          let reintentar = false;
          /** Qué pasa con cada item enviado: `null` = subido (sale de la cola). */
          const salida = new Map<ItemCola, ItemCola | null>();
          lote.forEach((item, k) => {
            const r = resultados[k];
            if (r?.ok) {
              subioAlgo = true;
              salida.set(item, null);
              if (consolidado) consolidado = aplicar(consolidado, item, false);
            } else if (!r || r.status >= 500) {
              reintentar = true;
              salida.set(item, item);
            } else {
              salida.set(item, { ...item, estado: 'rechazada', mensaje: r.mensaje ?? `Rechazada (${r.status}).`, status: r.status });
            }
          });
          // Lo que se encoló mientras subía (otro proyecto u otra versión del mismo) queda igual.
          cola.value = cola.value.flatMap((i) => {
            if (!salida.has(i)) return [i];
            const queda = salida.get(i);
            return queda ? [queda] : [];
          });
          guardarCola();
          if (consolidado !== paquete.value) {
            paquete.value = consolidado;
            guardarPaquete();
          }
          // Error del servidor en alguna: no insistir en este ciclo (la reintenta el reloj).
          if (reintentar) {
            fallos++;
            break;
          }
        }
        if (subioAlgo) await refrescar(token, true).catch(() => {});
      } catch (error) {
        if (error instanceof ErrorApi && error.status === 401) marcarVencida();
        throw error;
      } finally {
        red.subiendo = false;
      }
}

/** Sube la cola y refresca. Nunca lanza: el estado de la red queda en `red`. */
export async function sincronizar(forzar = false) {
  const s = sesion.value;
  if (!s || s.vencida || red.sincronizando) return;
  red.sincronizando = true;
  try {
    await subirCola();
    await refrescar(s.token, forzar);
    fallos = 0;
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 401) marcarVencida();
    else if (esErrorDeRed(error)) fallos++;
  } finally {
    red.sincronizando = false;
  }
}

// ------------------------------------------------------------------ guardar una evaluación

export type ResultadoGuardar =
  | { estado: 'pendiente' }
  | { estado: 'rechazada'; mensaje: string; status: number }
  | { estado: 'subida' };

/**
 * Guarda en la cola del celular (al instante) e intenta subirla. Si el servidor no
 * contesta en `esperaMs`, devuelve «pendiente»: la subida sigue sola en segundo plano.
 */
export async function guardarEvaluacion(
  hoja: HojaEvaluacion,
  puntajes: Record<number, number>,
  total: number,
  esperaMs = 7000,
): Promise<ResultadoGuardar> {
  const clave = claveDe(hoja.idCategoria, hoja.idParticipante);
  const item: ItemCola = {
    clave,
    creado: Date.now(),
    dto: {
      categoriaId: hoja.idCategoria,
      participanteId: hoja.idParticipante,
      rubricas: hoja.rubricas.map((r) => ({
        detalles: r.criterios.map((c) => ({ criterioId: c.idCriterio, puntaje: puntajes[c.idCriterio]! })),
        rubricaId: r.idRubrica,
      })),
    },
    estado: 'pendiente',
    proyecto: hoja.proyecto,
    total,
  };
  cola.value = [...cola.value.filter((i) => i.clave !== clave), item];
  guardarCola();

  const subida = subirCola().catch(() => {});
  await Promise.race([subida, new Promise((r) => setTimeout(r, esperaMs))]);

  const quedo = cola.value.find((i) => i.clave === clave);
  if (!quedo) return { estado: 'subida' };
  if (quedo.estado === 'rechazada') return { estado: 'rechazada', mensaje: quedo.mensaje ?? 'Rechazada.', status: quedo.status ?? 400 };
  return { estado: 'pendiente' };
}

/** Vuelve a intentar una rechazada (p. ej. el admin reabrió la evaluación). */
export function reintentar(clave: string) {
  cola.value = cola.value.map((i) => (i.clave === clave ? { ...i, estado: 'pendiente', mensaje: undefined } : i));
  guardarCola();
  void sincronizar();
}

export function descartar(clave: string) {
  cola.value = cola.value.filter((i) => i.clave !== clave);
  guardarCola();
}

// ------------------------------------------------------------------ ciclo de vida

let reloj: ReturnType<typeof setTimeout> | undefined;

/** Próximo intento: cada 30 s; sin red y con cola, 5 s, 10 s, 20 s… hasta 2 min (con azar). */
function programar() {
  clearTimeout(reloj);
  const base = fallos > 0 && pendientesDeSubir.value > 0 ? Math.min(120_000, 5000 * 2 ** (fallos - 1)) : 30_000;
  reloj = setTimeout(async () => {
    if (document.visibilityState === 'visible' || pendientesDeSubir.value > 0) await sincronizar();
    programar();
  }, base * (0.8 + Math.random() * 0.4));
}

function alVolver() {
  fallos = 0;
  void sincronizar().then(programar);
}

function alCambiarVisibilidad() {
  if (document.visibilityState === 'visible') alVolver();
}

let activo = false;

function iniciar() {
  cargarLocal();
  if (activo) return;
  activo = true;
  window.addEventListener('online', alVolver);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  void sincronizar().then(programar);
}

function detener() {
  activo = false;
  clearTimeout(reloj);
  window.removeEventListener('online', alVolver);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  paquete.value = null;
  cola.value = [];
}

// Arranca con la sesión y se detiene al salir; al volver a ingresar tras vencer, sube lo pendiente.
watch(
  () => [sesion.value?.usuario, sesion.value?.token, sesion.value?.vencida] as const,
  ([usuario, , vencida], anterior) => {
    if (!usuario) {
      detener();
      return;
    }
    if (!activo || usuario !== anterior?.[0]) {
      detener();
      iniciar();
    } else if (!vencida) {
      alVolver();
    }
  },
  { immediate: true },
);
