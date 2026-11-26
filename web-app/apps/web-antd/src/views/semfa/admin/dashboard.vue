<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  DashboardCategoria,
  DashboardEvaluacion,
  DashboardFila,
  DashboardNota,
  EstadoEvaluacion,
} from '#/api/dashboard-evaluacion';
import type { PdfResultados } from '#/api/resultados';

import { computed, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Dropdown, Input, Menu, Segmented, Table, Tooltip } from 'ant-design-vue';

import { obtenerDashboard } from '#/api/dashboard-evaluacion';
import { obtenerPdfResultados, PDF_RESULTADOS } from '#/api/resultados';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaEstadoEvaluacion from '#/components/semfa/semfa-estado-evaluacion.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { useDashboardSse } from '#/composables/useDashboardSse';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { inicialesDeNombre, limpiarEspacios, normalizarTexto, tiempoTranscurrido } from '#/utils/formato';

defineOptions({ name: 'SemfaPanelEvaluacion' });

/**
 * Panel del administrador: seguimiento en vivo de la evaluación de una actividad.
 *
 * - «Resumen»: una tarjeta por categoría con avance, lo que falta, el podio
 *   provisional y los jurados con pendientes.
 * - «Por categoría» / «General»: tabla de proyectos con puesto (oficial o
 *   provisional), nota de cada jurado (o si le falta / no le toca) y filtros de
 *   un clic por estado, día de la feria y jurado.
 *
 * El puesto oficial (`posicion`) solo existe cuando toda la categoría está
 * completa (misma regla que `ResultadosActividadService`); mientras tanto se
 * muestra `puestoProvisional`, marcado como tal.
 */

/** La actividad es la de trabajo, elegida en la barra superior. */
const {
  actividad: actividadTrabajo,
  cargada: actividadesCargadas,
  idActividad,
  nombreActividad,
  store: trabajo,
} = useActividadTrabajo();
const datos = shallowRef<DashboardEvaluacion | null>(null);
const cargando = ref(false);
const actualizado = ref<Date>();
/** Inscripciones con evaluaciones nuevas en la última actualización en vivo. */
const recientes = ref(new Set<number>());
const descargando = ref<string>();

type Vista = 'categoria' | 'general' | 'resumen';
const vista = ref<Vista>('resumen');
const idCategoria = ref<number>();
type FiltroEstado = '' | 'PENDIENTE' | EstadoEvaluacion;
const filtroEstado = ref<FiltroEstado>('');
const filtroCatParticipante = ref<string>();
/** Solo los proyectos que a este jurado le faltan. */
const filtroJurado = ref<number>();
/** Día de la feria; `0` = sin día asignado. */
const filtroJornada = ref<number>();
/** Facultad (área) del proyecto; `0` = sin facultad. */
const filtroFacultad = ref<number>();

// ------------------------------------------------------------------ carga

let quitarResaltado: null | ReturnType<typeof setTimeout> = null;

/** `enVivo`: la pide el stream; no muestra el spinner y resalta lo que cambió. */
async function cargar(enVivo = false) {
  const id = idActividad.value;
  if (id === undefined) return;
  if (!enVivo) cargando.value = true;
  try {
    const previo = datos.value;
    const nuevo = await obtenerDashboard(id);
    if (id !== idActividad.value) return;
    if (enVivo && previo?.actividad.idActividad === id) {
      const antes = new Map(
        previo.categorias.flatMap((c) => c.filas).map((f) => [f.idInscripcion, f.evaluacionesHechas]),
      );
      recientes.value = new Set(
        nuevo.categorias
          .flatMap((c) => c.filas)
          .filter((f) => antes.get(f.idInscripcion) !== f.evaluacionesHechas)
          .map((f) => f.idInscripcion),
      );
      if (quitarResaltado) clearTimeout(quitarResaltado);
      quitarResaltado = setTimeout(() => (recientes.value = new Set()), 6000);
    }
    datos.value = nuevo;
    actualizado.value = new Date();
    if (!nuevo.categorias.some((c) => c.idCategoria === idCategoria.value)) {
      idCategoria.value = nuevo.categorias[0]?.idCategoria;
    }
  } catch {
    // El interceptor ya avisó del error.
  } finally {
    cargando.value = false;
  }
}

watch(
  idActividad,
  (id) => {
    if (id === undefined) return;
    datos.value = null;
    idCategoria.value = undefined;
    filtroCatParticipante.value = undefined;
    filtroJurado.value = undefined;
    filtroJornada.value = undefined;
    filtroFacultad.value = undefined;
    cargar();
  },
  { immediate: true },
);

const { conectado } = useDashboardSse(idActividad, () => cargar(true));

// ------------------------------------------------------------------ derivados

const categorias = computed(() => datos.value?.categorias ?? []);
const categoria = computed(() => categorias.value.find((c) => c.idCategoria === idCategoria.value));
const resumen = computed(() => datos.value?.resumen);
/**
 * Terminada: todos los proyectos que tienen jurados están completos. Uno sin
 * jurados (no se presentó) nunca se evaluará y no la deja abierta (misma regla
 * que el puesto en el backend).
 */
function categoriaTerminada(c: DashboardCategoria) {
  return c.completos > 0 && c.filas.every((f) => f.estado === 'COMPLETO' || f.estado === 'SIN_JURADOS');
}
const conCarreras = (c: DashboardCategoria) => c.filas.some((f) => f.carrera);
const rankingCompleto = computed(
  () => categorias.value.some((c) => categoriaTerminada(c))
    && categorias.value.every((c) => c.completos === 0 || categoriaTerminada(c)),
);
const categoriasTerminadas = computed(() => categorias.value.filter((c) => categoriaTerminada(c)).length);

function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte * 100) / total) : 0;
}

function notaDe(fila: DashboardFila, idJurado: number): DashboardNota | undefined {
  return fila.notas.find((n) => n.idJurado === idJurado);
}

/** Al jurado le toca el proyecto y todavía no llenó todas sus rúbricas. */
function pendienteDe(fila: DashboardFila, idJurado: number) {
  // Sin rúbricas no hay nada que evaluar (el backend lo marca SIN_JURADOS).
  if (fila.evaluacionesEsperadas === 0) return false;
  return fila.juradosCubren.includes(idJurado) && !notaDe(fila, idJurado)?.completa;
}

function nombreCorto(nombre: string) {
  const partes = nombre.split(' ').filter(Boolean);
  return partes.length > 1 ? `${partes[0]} ${partes[1]![0]}.` : nombre;
}

function fmt(valor: null | number | undefined) {
  return valor === null || valor === undefined ? '—' : valor.toFixed(2);
}

// ------------------------------------------------------------------ resumen por categoría

type EstadoCategoria = 'COMPLETA' | 'EN_CURSO' | 'SIN_INICIAR' | 'VACIA';

const ESTADOS_CATEGORIA: Record<EstadoCategoria, { clase: string; icono: string; texto: string }> = {
  COMPLETA: { clase: 'semfa-estado--ok', icono: 'lucide:trophy', texto: 'Terminada' },
  EN_CURSO: { clase: 'semfa-estado--proceso', icono: 'lucide:loader', texto: 'En curso' },
  SIN_INICIAR: { clase: 'semfa-estado--pendiente', icono: 'lucide:circle-dashed', texto: 'Sin iniciar' },
  VACIA: { clase: 'semfa-estado--pendiente', icono: 'lucide:inbox', texto: 'Sin proyectos' },
};

function estadoCategoria(c: DashboardCategoria): EstadoCategoria {
  if (c.proyectos === 0) return 'VACIA';
  if (categoriaTerminada(c)) return 'COMPLETA';
  return c.evaluacionesHechas === 0 ? 'SIN_INICIAR' : 'EN_CURSO';
}

const tarjetas = computed(() =>
  categorias.value.map((c) => {
    const cuenta: Record<EstadoEvaluacion, number> = { COMPLETO: 0, EN_PROCESO: 0, SIN_INICIAR: 0, SIN_JURADOS: 0 };
    for (const f of c.filas) cuenta[f.estado]++;
    return {
      c,
      cuenta,
      estado: estadoCategoria(c),
      faltanEvaluaciones: Math.max(0, c.evaluacionesEsperadas - c.evaluacionesHechas),
      faltanProyectos: c.filas.filter((f) => f.estado !== 'COMPLETO' && f.estado !== 'SIN_JURADOS').length,
      porCarrera: conCarreras(c),
      /**
       * Con carreras el puesto es dentro de cada carrera: se muestran los 1° de
       * cada una (mejor promedio primero). Sin carreras, las filas ya vienen por promedio.
       */
      podio: conCarreras(c)
        ? c.filas.filter((f) => f.puestoProvisional === 1)
            .sort((a, b) => (b.promedio ?? 0) - (a.promedio ?? 0)).slice(0, 5)
        : c.filas.filter((f) => f.puestoProvisional > 0).slice(0, 3),
      pct: porcentaje(c.evaluacionesHechas, c.evaluacionesEsperadas),
      pendientesJurado: c.jurados
        .filter((j) => j.asignado)
        .map((j) => ({ ...j, faltan: c.filas.filter((f) => pendienteDe(f, j.idJurado)).length }))
        .filter((j) => j.faltan > 0)
        .sort((a, b) => b.faltan - a.faltan || a.nombre.localeCompare(b.nombre, 'es')),
    };
  }),
);

type FiltroResumen = '' | EstadoCategoria;
const filtroResumen = ref<FiltroResumen>('');

const conteoResumen = computed(() => {
  const conteo: Record<EstadoCategoria, number> = { COMPLETA: 0, EN_CURSO: 0, SIN_INICIAR: 0, VACIA: 0 };
  for (const t of tarjetas.value) conteo[t.estado]++;
  return conteo;
});

const tarjetasFiltradas = computed(() =>
  filtroResumen.value ? tarjetas.value.filter((t) => t.estado === filtroResumen.value) : tarjetas.value,
);

function abrirCategoria(id: number, idJurado?: number) {
  vista.value = 'categoria';
  idCategoria.value = id;
  filtroEstado.value = '';
  filtroJurado.value = idJurado;
}

// ------------------------------------------------------------------ tabla: filtros

interface FilaVista extends DashboardFila {
  categoriaNombre: string;
  idCategoria: number;
  proyectoTexto: string;
  rubricas: number;
}

const todasLasFilas = computed<FilaVista[]>(() =>
  categorias.value.flatMap((c) =>
    c.filas.map((f) => ({
      ...f,
      categoriaNombre: c.nombre,
      idCategoria: c.idCategoria,
      proyectoTexto: limpiarEspacios(f.proyecto) || '—',
      rubricas: c.rubricas,
    })),
  ),
);

/** Categorías de participante (Infantil, Juvenil…) para filtrar la vista general. */
const opcionesCatParticipante = computed(() => {
  const conteo = new Map<string, number>();
  for (const f of todasLasFilas.value) {
    const nombre = f.categoriaParticipante ?? 'Sin categoría';
    conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([nombre, total]) => ({ nombre, total }));
});

/** Filas de la vista (categoría elegida o todas), antes del filtro por facultad. */
const filasVistaSinArea = computed<FilaVista[]>(() => {
  if (vista.value === 'categoria') {
    return todasLasFilas.value.filter((f) => f.idCategoria === idCategoria.value);
  }
  return filtroCatParticipante.value
    ? todasLasFilas.value.filter((f) => (f.categoriaParticipante ?? 'Sin categoría') === filtroCatParticipante.value)
    : todasLasFilas.value;
});

/** Facultades (áreas) de los proyectos de la vista, con su avance. `0` = sin facultad. */
const opcionesFacultad = computed(() => {
  const mapa = new Map<number, { completos: number; sigla: string; total: number; valor: number }>();
  for (const f of filasVistaSinArea.value) {
    const valor = f.idFacultad ?? 0;
    const o = mapa.get(valor) ?? { completos: 0, sigla: f.facultad || 'Sin facultad', total: 0, valor };
    o.total++;
    if (f.estado === 'COMPLETO') o.completos++;
    mapa.set(valor, o);
  }
  return [...mapa.values()].sort((a, b) => a.sigla.localeCompare(b.sigla, 'es'));
});

/** Filas de la vista, filtradas por facultad si se eligió una. */
const filasVista = computed<FilaVista[]>(() =>
  filtroFacultad.value === undefined
    ? filasVistaSinArea.value
    : filasVistaSinArea.value.filter((f) => (f.idFacultad ?? 0) === filtroFacultad.value),
);

/** Días de la feria (solo si dura más de uno). */
const jornadas = computed(() => actividadTrabajo.value?.jornadas ?? 1);
const jornadaEnCurso = computed(() => actividadTrabajo.value?.jornadaEnCurso ?? null);

const opcionesJornada = computed(() => {
  if (jornadas.value <= 1) return [];
  const opciones = Array.from({ length: jornadas.value }, (_, i) => i + 1).map((dia) => {
    const filas = filasVista.value.filter((f) => f.jornada === dia);
    return {
      enCurso: jornadaEnCurso.value === dia,
      faltan: filas.filter((f) => f.estado !== 'COMPLETO').length,
      texto: `Día ${dia}`,
      total: filas.length,
      valor: dia,
    };
  });
  const sinDia = filasVista.value.filter((f) => f.jornada === null || f.jornada > jornadas.value);
  if (sinDia.length > 0) {
    opciones.push({
      enCurso: false,
      faltan: sinDia.filter((f) => f.estado !== 'COMPLETO').length,
      texto: 'Sin día',
      total: sinDia.length,
      valor: 0,
    });
  }
  return opciones;
});

const filasJornada = computed(() => {
  const dia = filtroJornada.value;
  if (dia === undefined || jornadas.value <= 1) return filasVista.value;
  return filasVista.value.filter((f) =>
    dia === 0 ? f.jornada === null || f.jornada > jornadas.value : f.jornada === dia,
  );
});

/** Base de los contadores de estado: ya filtrada por día y jurado. */
const filasBase = computed(() =>
  filtroJurado.value === undefined
    ? filasJornada.value
    : filasJornada.value.filter((f) => pendienteDe(f, filtroJurado.value!)),
);

const ESTADOS: Record<EstadoEvaluacion, { clase: string; icono: string; texto: string }> = {
  COMPLETO: { clase: 'semfa-estado--ok', icono: 'lucide:circle-check', texto: 'Completo' },
  EN_PROCESO: { clase: 'semfa-estado--proceso', icono: 'lucide:loader', texto: 'En proceso' },
  SIN_INICIAR: { clase: 'semfa-estado--pendiente', icono: 'lucide:circle-dashed', texto: 'Sin iniciar' },
  SIN_JURADOS: { clase: 'semfa-estado--error', icono: 'lucide:user-x', texto: 'Sin jurados' },
};

const conteoEstados = computed(() => {
  const conteo: Record<EstadoEvaluacion, number> = { COMPLETO: 0, EN_PROCESO: 0, SIN_INICIAR: 0, SIN_JURADOS: 0 };
  for (const f of filasBase.value) conteo[f.estado]++;
  return conteo;
});

const chipsEstado = computed(() => {
  const c = conteoEstados.value;
  const total = filasBase.value.length;
  return [
    { icono: 'lucide:list', texto: 'Todos', total, valor: '' as FiltroEstado },
    { icono: 'lucide:hourglass', texto: 'Faltan', total: total - c.COMPLETO, valor: 'PENDIENTE' as FiltroEstado },
    ...(Object.keys(ESTADOS) as EstadoEvaluacion[])
      .filter((e) => c[e] > 0 || filtroEstado.value === e)
      .map((e) => ({ icono: ESTADOS[e].icono, texto: ESTADOS[e].texto, total: c[e], valor: e as FiltroEstado })),
  ];
});

const filasFiltradas = computed(() => {
  const filtro = filtroEstado.value;
  if (!filtro) return filasBase.value;
  if (filtro === 'PENDIENTE') return filasBase.value.filter((f) => f.estado !== 'COMPLETO');
  return filasBase.value.filter((f) => f.estado === filtro);
});

const { alCambiarTabla, busqueda, filtrados, paginacion } = useTablaLocal(filasFiltradas, {
  camposBusqueda: ['proyectoTexto', 'institucion', 'categoriaNombre', 'stand'],
});

// Otro filtro u otra categoría: vuelve a la página 1 (la recarga en vivo no la mueve).
watch([vista, idCategoria, filtroEstado, filtroJornada, filtroJurado, filtroCatParticipante, filtroFacultad], () =>
  alCambiarTabla({ current: 1 }),
);

// Una facultad elegida que no está en la nueva vista dejaría la tabla vacía sin chip activo.
watch(opcionesFacultad, (opciones) => {
  if (filtroFacultad.value !== undefined && !opciones.some((o) => o.valor === filtroFacultad.value)) {
    filtroFacultad.value = undefined;
  }
});

// Un día elegido que no existe en la nueva vista dejaría la tabla vacía sin chip activo.
watch(opcionesJornada, (opciones) => {
  if (filtroJornada.value !== undefined && !opciones.some((o) => o.valor === filtroJornada.value)) {
    filtroJornada.value = undefined;
  }
});

// ------------------------------------------------------------------ tabla: columnas

const columnasJurado = computed(() => (vista.value === 'categoria' ? (categoria.value?.jurados ?? []) : []));

const columnas = computed<ColumnsType<FilaVista>>(() => [
  { align: 'center', key: 'puesto', title: 'Puesto', width: 72 },
  { dataIndex: 'proyectoTexto', ellipsis: true, key: 'proyecto', title: 'Proyecto' },
  ...(vista.value === 'general'
    ? [{ dataIndex: 'categoriaNombre', ellipsis: true, key: 'categoria', title: 'Categoría', width: 230 }]
    : []),
  ...columnasJurado.value.map((j) => ({
    align: 'center' as const,
    key: `j-${j.idJurado}`,
    title: j.nombre,
    width: 96,
  })),
  { align: 'right', key: 'promedio', title: 'Promedio', width: 92 },
  { key: 'estado', title: 'Estado', width: 150 },
  { align: 'center', key: 'acciones', title: 'Informe', width: 80 },
]);

const anchoTabla = computed(() => 808 + columnasJurado.value.length * 96 + (vista.value === 'general' ? 230 : 0));

/** Nota del jurado de la columna `j-<id>` para esa fila. */
function idJuradoDeColumna(clave: unknown) {
  return Number(String(clave).slice(2));
}

function notaCelda(fila: Record<string, any>, clave: unknown): DashboardNota | undefined {
  return notaDe(fila as FilaVista, idJuradoDeColumna(clave));
}

function leTocaCelda(fila: Record<string, any>, clave: unknown) {
  return (fila as FilaVista).juradosCubren.includes(idJuradoDeColumna(clave));
}

function textoNota(fila: FilaVista, nota: DashboardNota) {
  return nota.completa
    ? 'Todas las rúbricas llenadas'
    : `Lleva ${nota.rubricas} de ${fila.rubricas} rúbricas (no cuenta en el promedio)`;
}

function puestoDe(fila: DashboardFila) {
  return fila.posicion || fila.puestoProvisional;
}

function textoPuesto(fila: FilaVista) {
  if (fila.posicion > 0) return 'Puesto final: la categoría terminó de evaluarse';
  if (fila.exclusionRanking) return `Excluido del ranking: ${fila.exclusionRanking}`;
  if (fila.puestoProvisional === 0) return 'Sin promedio: ningún jurado terminó todas sus rúbricas';
  const parcial =
    fila.estado === 'COMPLETO'
      ? ''
      : ` Su promedio es de ${fila.juradosCompletos} de ${fila.juradosAsignados} jurado(s).`;
  return `Puesto provisional: la categoría aún tiene evaluaciones pendientes.${parcial}`;
}

function textoUbicacion(fila: DashboardFila) {
  const partes: string[] = [];
  if (jornadas.value > 1 && fila.jornada) partes.push(`D${fila.jornada}`);
  if (fila.stand) partes.push(fila.stand);
  if (fila.facultad) partes.push(fila.facultad);
  return partes.join(' · ');
}

function claseFila(fila: FilaVista) {
  return recientes.value.has(fila.idInscripcion) ? 'semfa-fila-nueva' : '';
}

// ------------------------------------------------------------------ jurados

interface AvanceJurado {
  detalle: string;
  esperadas: number;
  /** Proyectos que le faltan (le tocan y no llenó todas sus rúbricas). */
  faltan: number;
  hechas: number;
  idJurado: number;
  nombre: string;
  ultima: null | string;
}

/** Avance de cada jurado: en la categoría elegida, o en toda la actividad. */
const avanceJurados = computed<AvanceJurado[]>(() => {
  const ultima = new Map((datos.value?.jurados ?? []).map((j) => [j.idJurado, j.ultimaEvaluacion]));
  const cat = vista.value === 'categoria' ? categoria.value : undefined;
  let lista: AvanceJurado[];
  if (cat) {
    lista = cat.jurados.map((j) => {
      const suyas = j.asignado ? cat.filas.filter((f) => f.juradosCubren.includes(j.idJurado)) : cat.filas;
      const hechas = suyas.reduce(
        (suma, f) => suma + Math.min(notaDe(f, j.idJurado)?.rubricas ?? 0, cat.rubricas),
        0,
      );
      return {
        detalle: j.asignado
          ? `${suyas.length} proyecto(s) × ${cat.rubricas} rúbrica(s)`
          : 'Ya no está asignado',
        esperadas: j.asignado ? suyas.length * cat.rubricas : hechas,
        faltan: cat.filas.filter((f) => pendienteDe(f, j.idJurado)).length,
        hechas,
        idJurado: j.idJurado,
        nombre: j.nombre,
        ultima: ultima.get(j.idJurado) ?? null,
      };
    });
  } else {
    lista = (datos.value?.jurados ?? []).map((j) => ({
      detalle: j.categorias.join(' · '),
      esperadas: j.evaluacionesEsperadas,
      faltan: todasLasFilas.value.filter((f) => pendienteDe(f, j.idJurado)).length,
      hechas: j.evaluacionesHechas,
      idJurado: j.idJurado,
      nombre: j.nombre,
      ultima: j.ultimaEvaluacion,
    }));
  }
  return lista.sort((a, b) => b.faltan - a.faltan || a.nombre.localeCompare(b.nombre, 'es'));
});

const juradosAlDia = computed(
  () => (datos.value?.jurados ?? []).filter((j) => j.evaluacionesHechas >= j.evaluacionesEsperadas).length,
);

const nombreJuradoFiltro = computed(() => {
  const id = filtroJurado.value;
  if (id === undefined) return '';
  return (
    datos.value?.jurados.find((j) => j.idJurado === id)?.nombre ??
    categorias.value.flatMap((c) => c.jurados).find((j) => j.idJurado === id)?.nombre ??
    `Jurado ${id}`
  );
});

/** Clic en un jurado: muestra solo lo que le falta (otro clic lo quita). */
function verPendientesDe(idJurado: number) {
  if (filtroJurado.value === idJurado) {
    filtroJurado.value = undefined;
    return;
  }
  filtroJurado.value = idJurado;
  filtroEstado.value = '';
  if (vista.value === 'resumen') vista.value = 'general';
}

// ------------------------------------------------------------------ reportes

function archivo(...partes: (null | string | undefined)[]) {
  const base = partes
    .filter(Boolean)
    .map((p) => normalizarTexto(p).replaceAll(/[^a-z0-9]+/g, '-'))
    .join('-')
    .replaceAll(/^-+|-+$/g, '');
  return `${base.slice(0, 90) || 'reporte'}.pdf`;
}

/** Abre el PDF en otra pestaña (los mismos de «Resultados y reportes»). */
async function descargar(clave: string, pdf: PdfResultados, nombre: string) {
  if (idActividad.value === undefined || descargando.value) return;
  descargando.value = clave;
  try {
    await obtenerPdfResultados(idActividad.value, pdf, { abrir: true, membrete: true, nombre });
  } catch {
    // El interceptor ya avisó.
  } finally {
    descargando.value = undefined;
  }
}

const router = useRouter();

function alElegirReporte({ key }: { key: number | string }) {
  const actividad = datos.value?.actividad.nombre;
  if (key === 'acta') {
    descargar('acta', PDF_RESULTADOS.ranking(), archivo('acta-resultados', actividad));
  } else if (key === 'categoria' && categoria.value) {
    descargar(
      'categoria',
      PDF_RESULTADOS.consolidado(categoria.value.idCategoria),
      archivo('cuadro-consolidado', categoria.value.nombre),
    );
  } else if (key === 'reportes') {
    router.push({ name: 'SemfaReportes' });
  }
}
</script>

<template>
  <Page description="Seguimiento en vivo: qué se evaluó, quién lidera y cuánto falta" title="Panel de evaluación">
    <!-- Cabecera: actividad, estado en vivo y reportes -->
    <Card :body-style="{ padding: '12px 16px' }" class="mb-3 overflow-hidden rounded-xl">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconifyIcon class="size-5" icon="lucide:gauge" />
          </span>
          <div class="min-w-0">
            <div class="text-xs text-muted-foreground">Actividad (cámbiela en la barra superior)</div>
            <div class="max-w-md truncate text-base font-semibold">{{ nombreActividad || 'Sin actividad elegida' }}</div>
          </div>
          <SemfaEstadoEvaluacion v-if="actividadTrabajo" :actividad="actividadTrabajo" />
          <span
            v-if="jornadas > 1 && jornadaEnCurso"
            class="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
          >
            <IconifyIcon class="size-3.5" icon="lucide:calendar-check" />
            Jornada en curso: día {{ jornadaEnCurso }}
          </span>
          <Tooltip
            :title="
              conectado
                ? 'Se actualiza solo cuando un jurado guarda una evaluación'
                : 'Sin conexión en vivo: reintentando. Use «Actualizar».'
            "
          >
            <span
              :class="conectado ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'"
              class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              <span :class="conectado ? 'semfa-pulso bg-emerald-500' : 'bg-slate-400'" class="size-2 rounded-full"></span>
              {{ conectado ? 'En vivo' : 'Sin conexión' }}
            </span>
          </Tooltip>
          <span v-if="actualizado" class="text-xs text-muted-foreground">
            Actualizado {{ actualizado.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <Button
            :disabled="idActividad === undefined"
            :loading="cargando"
            class="semfa-btn semfa-btn--neutro"
            @click="cargar()"
          >
            <IconifyIcon v-if="!cargando" class="size-4" icon="lucide:refresh-cw" />
            Actualizar
          </Button>
          <Dropdown :disabled="!datos" :trigger="['click']">
            <Button :loading="descargando === 'acta' || descargando === 'categoria'" class="semfa-btn semfa-btn--primario">
              <IconifyIcon class="size-4" icon="lucide:file-down" />
              Reportes PDF
              <IconifyIcon class="size-3.5" icon="lucide:chevron-down" />
            </Button>
            <template #overlay>
              <Menu @click="alElegirReporte">
                <Menu.Item key="acta" :disabled="!rankingCompleto">
                  <span class="flex items-center gap-2">
                    <IconifyIcon class="size-4" icon="lucide:trophy" />
                    {{ rankingCompleto ? 'Acta de resultados (todas las categorías)' : 'Acta disponible al finalizar todas las categorías' }}
                  </span>
                </Menu.Item>
                <Menu.Item key="categoria" :disabled="vista !== 'categoria' || !categoria">
                  <span class="flex items-center gap-2">
                    <IconifyIcon class="size-4" icon="lucide:table-2" />
                    {{ categoria && vista === 'categoria' ? `Consolidado: ${categoria.nombre}` : 'Consolidado (elija una categoría)' }}
                  </span>
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item key="reportes">
                  <span class="flex items-center gap-2">
                    <IconifyIcon class="size-4" icon="lucide:file-chart-column" />
                    Más reportes y pantalla TV…
                  </span>
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </div>
      </div>

      <!-- Indicadores -->
      <div v-if="resumen" class="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 lg:grid-cols-5">
        <div>
          <div class="flex items-baseline justify-between text-xs text-muted-foreground">
            Proyectos evaluados por completo
            <span class="tabular-nums">{{ porcentaje(resumen.completos, resumen.proyectos) }} %</span>
          </div>
          <div class="text-xl font-semibold tabular-nums">
            {{ resumen.completos }}<span class="text-sm font-normal text-muted-foreground"> / {{ resumen.proyectos }}</span>
          </div>
          <div class="semfa-barra mt-1"><span :style="{ width: `${porcentaje(resumen.completos, resumen.proyectos)}%` }" class="bg-emerald-500"></span></div>
        </div>
        <div>
          <div class="flex items-baseline justify-between text-xs text-muted-foreground">
            Evaluaciones registradas
            <span class="tabular-nums">{{ porcentaje(resumen.evaluacionesHechas, resumen.evaluacionesEsperadas) }} %</span>
          </div>
          <div class="text-xl font-semibold tabular-nums">
            {{ resumen.evaluacionesHechas }}<span class="text-sm font-normal text-muted-foreground"> / {{ resumen.evaluacionesEsperadas }}</span>
          </div>
          <div class="semfa-barra mt-1">
            <span :style="{ width: `${porcentaje(resumen.evaluacionesHechas, resumen.evaluacionesEsperadas)}%` }" class="bg-primary"></span>
          </div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Faltan</div>
          <div class="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span><strong class="text-xl tabular-nums text-amber-600">{{ resumen.enProceso }}</strong> en proceso</span>
            <span><strong class="text-xl tabular-nums text-slate-500">{{ resumen.sinIniciar }}</strong> sin iniciar</span>
            <span v-if="resumen.sinJurados > 0">
              <strong class="text-xl tabular-nums text-red-600">{{ resumen.sinJurados }}</strong> sin jurados
            </span>
          </div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Categorías terminadas</div>
          <div class="text-xl font-semibold tabular-nums">
            {{ categoriasTerminadas }}<span class="text-sm font-normal text-muted-foreground"> / {{ categorias.length }}</span>
          </div>
          <div class="text-xs text-muted-foreground">Con puesto final y acta disponible</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground">Jurados al día</div>
          <div class="text-xl font-semibold tabular-nums">
            {{ juradosAlDia }}<span class="text-sm font-normal text-muted-foreground"> / {{ datos?.jurados.length ?? 0 }}</span>
          </div>
          <div class="text-xs text-muted-foreground">
            {{ (datos?.jurados.length ?? 0) - juradosAlDia }} con evaluaciones pendientes
          </div>
        </div>
      </div>
    </Card>

    <!-- Estados vacíos -->
    <div
      v-if="actividadesCargadas && trabajo.actividades.length === 0"
      class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
    >
      <IconifyIcon class="size-10 opacity-60" icon="lucide:calendar-x" />
      No hay actividades registradas.
      <span class="text-xs">Créelas en Administración › Actividad.</span>
    </div>
    <div v-else-if="!datos && cargando" class="flex flex-col items-center gap-2 py-16 text-muted-foreground">
      <IconifyIcon class="size-8 animate-spin opacity-60" icon="lucide:loader-circle" />
      Calculando el avance…
    </div>
    <div
      v-else-if="datos && categorias.length === 0"
      class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
    >
      <IconifyIcon class="size-10 opacity-60" icon="lucide:tags" />
      Esta actividad no tiene categorías todavía.
    </div>

    <div v-else-if="datos" class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card :body-style="{ padding: 0 }" class="min-w-0 overflow-hidden rounded-xl">
        <div class="flex flex-col gap-2.5 border-b border-border px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              v-model:value="vista"
              :options="[
                { label: 'Resumen', value: 'resumen' },
                { label: 'Por categoría', value: 'categoria' },
                { label: 'General', value: 'general' },
              ]"
            />
            <Input v-if="vista !== 'resumen'" v-model:value="busqueda" allow-clear class="w-56" placeholder="Buscar proyecto o stand…">
              <template #prefix>
                <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
              </template>
            </Input>
          </div>

          <!-- Resumen: filtro por estado de la categoría -->
          <div v-if="vista === 'resumen'" class="flex flex-wrap items-center gap-1.5">
            <button
              :class="{ 'is-activo': !filtroResumen }"
              class="semfa-chip text-xs"
              type="button"
              @click="filtroResumen = ''"
            >
              Todas <span class="tabular-nums opacity-70">{{ tarjetas.length }}</span>
            </button>
            <template v-for="e in (['EN_CURSO', 'SIN_INICIAR', 'COMPLETA', 'VACIA'] as EstadoCategoria[])" :key="e">
              <button
                v-if="conteoResumen[e] > 0 || filtroResumen === e"
                :class="{ 'is-activo': filtroResumen === e }"
                class="semfa-chip text-xs"
                type="button"
                @click="filtroResumen = filtroResumen === e ? '' : e"
              >
                <IconifyIcon class="size-3.5" :icon="ESTADOS_CATEGORIA[e].icono" />
                {{ ESTADOS_CATEGORIA[e].texto }}
                <span class="tabular-nums opacity-70">{{ conteoResumen[e] }}</span>
              </button>
            </template>
            <span class="ml-auto text-xs text-muted-foreground">
              El podio es provisional hasta que la categoría termine.
            </span>
          </div>

          <!-- Categorías (vista por categoría) -->
          <div v-else-if="vista === 'categoria'" class="flex flex-wrap gap-1.5">
            <button
              v-for="c in categorias"
              :key="c.idCategoria"
              :class="{ 'is-activo': c.idCategoria === idCategoria }"
              class="semfa-chip text-xs"
              type="button"
              @click="idCategoria = c.idCategoria"
            >
              <span
                :class="
                  c.proyectos === 0
                    ? 'bg-slate-300'
                    : c.completos === c.proyectos
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                "
                class="size-2 shrink-0 rounded-full"
              ></span>
              {{ c.nombre }}
              <span class="tabular-nums opacity-70">{{ c.completos }}/{{ c.proyectos }}</span>
            </button>
          </div>

          <!-- Categorías de participante (vista general) -->
          <div v-else-if="opcionesCatParticipante.length > 1" class="flex flex-wrap gap-1.5">
            <button
              :class="{ 'is-activo': !filtroCatParticipante }"
              class="semfa-chip text-xs"
              type="button"
              @click="filtroCatParticipante = undefined"
            >
              Todas
            </button>
            <button
              v-for="c in opcionesCatParticipante"
              :key="c.nombre"
              :class="{ 'is-activo': filtroCatParticipante === c.nombre }"
              class="semfa-chip text-xs"
              type="button"
              @click="filtroCatParticipante = c.nombre"
            >
              {{ c.nombre }} <span class="tabular-nums opacity-70">{{ c.total }}</span>
            </button>
          </div>

          <!-- Facultad / área (FEXCOIN): solo si la vista tiene más de una -->
          <div v-if="vista !== 'resumen' && opcionesFacultad.length > 1" class="flex flex-wrap items-center gap-1.5">
            <IconifyIcon class="size-3.5 text-muted-foreground" icon="lucide:building-2" />
            <button
              :class="{ 'is-activo': filtroFacultad === undefined }"
              class="semfa-chip text-xs"
              type="button"
              @click="filtroFacultad = undefined"
            >
              Todas las áreas
            </button>
            <Tooltip v-for="o in opcionesFacultad" :key="o.valor" :title="`${o.completos} de ${o.total} proyecto(s) completos`">
              <button
                :class="{ 'is-activo': filtroFacultad === o.valor }"
                class="semfa-chip text-xs"
                type="button"
                @click="filtroFacultad = filtroFacultad === o.valor ? undefined : o.valor"
              >
                <span
                  :class="o.completos === o.total ? 'bg-emerald-500' : 'bg-amber-500'"
                  class="size-2 shrink-0 rounded-full"
                ></span>
                {{ o.sigla }}
                <span class="tabular-nums opacity-70">{{ o.completos }}/{{ o.total }}</span>
              </button>
            </Tooltip>
          </div>

          <!-- Filtros de la tabla: estado, día y jurado -->
          <template v-if="vista !== 'resumen'">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="ch in chipsEstado"
                :key="ch.valor"
                :class="{ 'is-activo': filtroEstado === ch.valor }"
                class="semfa-chip text-xs"
                type="button"
                @click="filtroEstado = ch.valor"
              >
                <IconifyIcon class="size-3.5" :icon="ch.icono" />
                {{ ch.texto }}
                <span class="tabular-nums opacity-70">{{ ch.total }}</span>
              </button>

              <template v-if="opcionesJornada.length > 0">
                <span class="mx-1 h-5 w-px bg-border"></span>
                <button
                  :class="{ 'is-activo': filtroJornada === undefined }"
                  class="semfa-chip text-xs"
                  type="button"
                  @click="filtroJornada = undefined"
                >
                  Todos los días
                </button>
                <Tooltip v-for="d in opcionesJornada" :key="d.valor" :title="`${d.faltan} de ${d.total} proyecto(s) sin terminar`">
                  <button
                    :class="{ 'is-activo': filtroJornada === d.valor }"
                    class="semfa-chip text-xs"
                    type="button"
                    @click="filtroJornada = filtroJornada === d.valor ? undefined : d.valor"
                  >
                    <span v-if="d.enCurso" class="semfa-pulso size-2 rounded-full bg-emerald-500"></span>
                    {{ d.texto }}
                    <span class="tabular-nums opacity-70">{{ d.total - d.faltan }}/{{ d.total }}</span>
                  </button>
                </Tooltip>
              </template>
            </div>

            <div
              v-if="filtroJurado !== undefined"
              class="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
            >
              <IconifyIcon class="size-4" icon="lucide:user-round-search" />
              Mostrando solo lo que le falta evaluar a <strong>{{ nombreJuradoFiltro }}</strong>
              ({{ filasBase.length }} proyecto(s))
              <button class="ml-auto flex items-center gap-1 font-medium hover:underline" type="button" @click="filtroJurado = undefined">
                <IconifyIcon class="size-3.5" icon="lucide:x" />
                Quitar filtro
              </button>
            </div>

            <div
              v-if="vista === 'categoria' && categoria"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            >
              <span>{{ categoria.rubricas }} rúbrica(s) por proyecto</span>
              <span>{{ categoria.jurados.filter((j) => j.asignado).length }} jurado(s) asignado(s)</span>
              <span>
                Evaluaciones {{ categoria.evaluacionesHechas }}/{{ categoria.evaluacionesEsperadas }}
                ({{ porcentaje(categoria.evaluacionesHechas, categoria.evaluacionesEsperadas) }} %)
              </span>
              <span class="flex items-center gap-1">
                <IconifyIcon class="size-3.5 text-amber-500" icon="lucide:clock" /> le falta ·
                <span class="opacity-50">·</span> no le toca
              </span>
              <span class="ml-auto">El promedio solo cuenta a los jurados que llenaron todas las rúbricas.</span>
            </div>
          </template>
        </div>

        <!-- ============================================ Resumen por categoría -->
        <div v-if="vista === 'resumen'" class="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
          <div
            v-for="t in tarjetasFiltradas"
            :key="t.c.idCategoria"
            class="semfa-tarjeta-cat flex cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5"
            role="button"
            tabindex="0"
            @click="abrirCategoria(t.c.idCategoria)"
            @keydown.enter="abrirCategoria(t.c.idCategoria)"
            @keydown.space.prevent="abrirCategoria(t.c.idCategoria)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate font-semibold" :title="t.c.nombre">{{ t.c.nombre }}</div>
                <div class="truncate text-xs text-muted-foreground">
                  {{ [t.c.nivel, t.c.carrera].filter(Boolean).join(' · ') || `${t.c.rubricas} rúbrica(s) por proyecto` }}
                </div>
              </div>
              <span :class="ESTADOS_CATEGORIA[t.estado].clase" class="semfa-estado shrink-0">
                <IconifyIcon class="size-3.5" :icon="ESTADOS_CATEGORIA[t.estado].icono" />
                {{ ESTADOS_CATEGORIA[t.estado].texto }}
              </span>
            </div>

            <!-- Avance -->
            <div>
              <div class="flex items-baseline justify-between text-xs text-muted-foreground">
                <span>
                  <strong class="text-sm text-foreground tabular-nums">{{ t.c.completos }}/{{ t.c.proyectos }}</strong>
                  proyectos evaluados
                </span>
                <span class="tabular-nums">{{ t.pct }} %</span>
              </div>
              <div class="semfa-barra mt-1">
                <span
                  :class="t.estado === 'COMPLETA' ? 'bg-emerald-500' : 'bg-primary'"
                  :style="{ width: `${t.pct}%` }"
                ></span>
              </div>
              <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <template v-if="t.estado === 'COMPLETA'">
                  <span class="text-emerald-600">Evaluación terminada: puestos finales</span>
                  <span v-if="t.cuenta.SIN_JURADOS" class="text-muted-foreground">{{ t.cuenta.SIN_JURADOS }} sin evaluar</span>
                </template>
                <template v-else-if="t.c.proyectos > 0">
                  <span class="font-medium text-amber-600">
                    Faltan {{ t.faltanProyectos }} proyecto(s)<template v-if="t.faltanEvaluaciones > 0"> · {{ t.faltanEvaluaciones }} evaluación(es)</template>
                  </span>
                  <span v-if="t.cuenta.EN_PROCESO" class="text-muted-foreground">{{ t.cuenta.EN_PROCESO }} en proceso</span>
                  <span v-if="t.cuenta.SIN_INICIAR" class="text-muted-foreground">{{ t.cuenta.SIN_INICIAR }} sin iniciar</span>
                  <span v-if="t.cuenta.SIN_JURADOS" class="font-medium text-red-600">{{ t.cuenta.SIN_JURADOS }} sin jurados</span>
                </template>
              </div>
            </div>

            <!-- Podio -->
            <div class="flex flex-col gap-1 border-t border-border pt-2">
              <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <IconifyIcon class="size-3.5" icon="lucide:trophy" />
                <template v-if="t.porCarrera">{{ t.estado === 'COMPLETA' ? '1° de cada carrera' : 'Van liderando su carrera' }}</template>
                <template v-else>{{ t.estado === 'COMPLETA' ? 'Podio final' : 'Van liderando' }}</template>
              </div>
              <div v-if="t.podio.length === 0" class="py-1 text-xs text-muted-foreground">
                Aún no hay promedios: ningún jurado terminó un proyecto.
              </div>
              <Tooltip
                v-for="f in t.podio"
                :key="f.idInscripcion"
                :title="
                  f.estado === 'COMPLETO'
                    ? `${limpiarEspacios(f.proyecto)} · evaluado por todos sus jurados`
                    : `${limpiarEspacios(f.proyecto)} · promedio de ${f.juradosCompletos} de ${f.juradosAsignados} jurado(s)`
                "
                placement="topLeft"
              >
                <div class="flex items-center gap-2 text-sm">
                  <span
                    :class="[`semfa-puesto--${puestoDe(f)}`, { 'is-provisional': !f.posicion }]"
                    class="semfa-puesto"
                  >{{ puestoDe(f) }}°</span>
                  <span class="min-w-0 flex-1 truncate">
                    {{ limpiarEspacios(f.proyecto) || '—' }}
                    <small v-if="t.porCarrera && f.carrera" class="block truncate text-[11px] text-muted-foreground">{{ f.carrera }}</small>
                  </span>
                  <small v-if="f.estado !== 'COMPLETO'" class="shrink-0 tabular-nums text-amber-600">
                    {{ f.juradosCompletos }}/{{ f.juradosAsignados }}
                  </small>
                  <span class="shrink-0 font-semibold tabular-nums text-primary">{{ fmt(f.promedio) }}</span>
                </div>
              </Tooltip>
            </div>

            <!-- Jurados con pendientes -->
            <div v-if="t.pendientesJurado.length > 0" class="flex flex-col gap-1 border-t border-border pt-2">
              <div class="text-xs font-medium text-muted-foreground">Jurados con pendientes</div>
              <div class="flex flex-wrap gap-1">
                <Tooltip
                  v-for="j in t.pendientesJurado"
                  :key="j.idJurado"
                  :title="`${j.nombre}: le faltan ${j.faltan} proyecto(s). Clic para verlos.`"
                >
                  <button
                    class="flex items-center gap-1 rounded-full border border-border py-0.5 pl-0.5 pr-2 text-xs hover:border-amber-500 hover:text-amber-700"
                    type="button"
                    @click.stop="abrirCategoria(t.c.idCategoria, j.idJurado)"
                  >
                    <SemfaAvatar :texto="inicialesDeNombre(j.nombre)" />
                    {{ nombreCorto(j.nombre) }}
                    <strong class="tabular-nums text-amber-600">{{ j.faltan }}</strong>
                  </button>
                </Tooltip>
              </div>
            </div>
            <div v-else-if="t.c.proyectos > 0 && t.c.jurados.every((j) => !j.asignado)" class="border-t border-border pt-2 text-xs font-medium text-red-600">
              Sin jurados asignados a esta categoría.
            </div>
          </div>
          <div
            v-if="tarjetasFiltradas.length === 0"
            class="col-span-full flex flex-col items-center gap-2 py-8 text-muted-foreground"
          >
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            No hay categorías con ese estado.
          </div>
        </div>

        <!-- ============================================ Tabla de proyectos -->
        <Table
          v-else
          :columns="columnas"
          :data-source="filtrados"
          :loading="cargando"
          :pagination="paginacion"
          :row-class-name="claseFila"
          :scroll="{ x: anchoTabla }"
          class="semfa-tabla"
          row-key="idInscripcion"
          size="small"
          @change="alCambiarTabla"
        >
          <template #headerCell="{ column }">
            <template v-if="String(column.key).startsWith('j-')">
              <Tooltip :title="column.title">
                <span
                  :class="{ 'text-amber-600': filtroJurado === idJuradoDeColumna(column.key) }"
                  class="flex items-center justify-center gap-1"
                >
                  <SemfaAvatar :texto="inicialesDeNombre(String(column.title))" />
                  <span class="truncate">{{ nombreCorto(String(column.title)) }}</span>
                </span>
              </Tooltip>
            </template>
          </template>

          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'puesto'">
              <Tooltip :title="textoPuesto(record as FilaVista)">
                <span
                  v-if="puestoDe(record as FilaVista)"
                  :class="[`semfa-puesto--${puestoDe(record as FilaVista)}`, { 'is-provisional': !record.posicion }]"
                  class="semfa-puesto"
                >{{ puestoDe(record as FilaVista) }}°</span>
                <span v-else class="text-muted-foreground">—</span>
              </Tooltip>
            </template>

            <template v-else-if="column.key === 'proyecto'">
              <Tooltip :title="[record.proyectoTexto, record.institucion].filter(Boolean).join(' · ')" placement="topLeft">
                <span>
                  <span v-if="textoUbicacion(record as FilaVista)" class="semfa-ubicacion">{{ textoUbicacion(record as FilaVista) }}</span>
                  {{ record.proyectoTexto }}
                </span>
              </Tooltip>
            </template>

            <template v-else-if="column.key === 'categoria'">
              <span class="text-muted-foreground">{{ record.categoriaNombre }}</span>
            </template>

            <template v-else-if="String(column.key).startsWith('j-')">
              <Tooltip v-if="notaCelda(record, column.key)" :title="textoNota(record as FilaVista, notaCelda(record, column.key)!)">
                <span
                  :class="notaCelda(record, column.key)!.completa ? 'font-medium' : 'text-amber-600'"
                  class="tabular-nums"
                >
                  {{ notaCelda(record, column.key)!.total.toFixed(2) }}
                  <small v-if="!notaCelda(record, column.key)!.completa" class="opacity-80">
                    {{ notaCelda(record, column.key)!.rubricas }}/{{ record.rubricas }}
                  </small>
                </span>
              </Tooltip>
              <Tooltip v-else-if="leTocaCelda(record, column.key)" title="Le falta: aún no evalúa este proyecto">
                <IconifyIcon class="inline size-4 text-amber-500" icon="lucide:clock" />
              </Tooltip>
              <Tooltip v-else title="No le corresponde este proyecto">
                <span class="text-muted-foreground opacity-50">·</span>
              </Tooltip>
            </template>

            <template v-else-if="column.key === 'promedio'">
              <span
                :class="record.promedio === null ? 'text-muted-foreground' : 'font-semibold text-primary'"
                class="tabular-nums"
              >
                {{ fmt(record.promedio) }}
              </span>
            </template>

            <template v-else-if="column.key === 'estado'">
              <Tooltip
                :title="`${record.juradosCompletos} de ${record.juradosAsignados} jurado(s) completaron · ${record.evaluacionesHechas}/${record.evaluacionesEsperadas} evaluaciones`"
              >
                <span :class="ESTADOS[record.estado as EstadoEvaluacion].clase" class="semfa-estado">
                  <IconifyIcon class="size-3.5" :icon="ESTADOS[record.estado as EstadoEvaluacion].icono" />
                  {{ ESTADOS[record.estado as EstadoEvaluacion].texto }}
                  <span v-if="record.estado === 'EN_PROCESO'" class="tabular-nums opacity-80">
                    {{ record.evaluacionesHechas }}/{{ record.evaluacionesEsperadas }}
                  </span>
                </span>
              </Tooltip>
            </template>

            <template v-else-if="column.key === 'acciones'">
              <div class="flex justify-center gap-1.5">
                <Tooltip title="Informe del proyecto: rúbricas y criterios por jurado (PDF)">
                  <Button
                    :disabled="record.evaluacionesHechas === 0"
                    :loading="descargando === `p-${record.idInscripcion}`"
                    class="semfa-btn semfa-btn--suave-primario"
                    size="small"
                    @click="
                      descargar(
                        `p-${record.idInscripcion}`,
                        PDF_RESULTADOS.participante(record.idInscripcion),
                        archivo('informe', record.proyectoTexto),
                      )
                    "
                  >
                    <IconifyIcon v-if="descargando !== `p-${record.idInscripcion}`" class="size-3.5" icon="lucide:file-text" />
                  </Button>
                </Tooltip>
              </div>
            </template>
          </template>

          <template #emptyText>
            <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <IconifyIcon class="size-10 opacity-60" :icon="filtroJurado !== undefined ? 'lucide:party-popper' : 'lucide:search-x'" />
              <span v-if="filtroJurado !== undefined && !busqueda.trim()">{{ nombreJuradoFiltro }} no tiene pendientes aquí</span>
              <span v-else-if="busqueda.trim() || filtroEstado || filtroJornada !== undefined">No hay proyectos con ese filtro</span>
              <span v-else>Sin proyectos inscritos</span>
            </div>
          </template>
        </Table>
      </Card>

      <!-- Avance de jurados -->
      <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
        <div class="border-b border-border px-4 py-3">
          <div class="flex items-center gap-2 font-medium">
            <IconifyIcon class="size-4 text-primary" icon="lucide:users" />
            Avance de jurados
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ vista === 'categoria' && categoria ? categoria.nombre : 'Toda la actividad' }} · clic para ver lo que le falta
          </div>
        </div>
        <div class="flex max-h-[640px] flex-col overflow-y-auto">
          <button
            v-for="j in avanceJurados"
            :key="j.idJurado"
            :class="{ 'is-activo': filtroJurado === j.idJurado }"
            class="semfa-jurado-fila flex flex-col gap-1 border-b border-border px-4 py-2 text-left last:border-b-0"
            type="button"
            @click="verPendientesDe(j.idJurado)"
          >
            <div class="flex w-full items-center gap-2">
              <SemfaAvatar :texto="inicialesDeNombre(j.nombre)" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{{ j.nombre }}</div>
                <Tooltip :title="j.detalle" placement="left">
                  <div class="truncate text-xs text-muted-foreground">{{ j.detalle || '—' }}</div>
                </Tooltip>
              </div>
              <span
                :class="j.hechas >= j.esperadas ? 'text-emerald-600' : 'text-amber-600'"
                class="text-sm font-semibold tabular-nums"
              >
                {{ j.hechas }}/{{ j.esperadas }}
              </span>
            </div>
            <div class="semfa-barra mt-1 w-full">
              <span
                :class="j.hechas >= j.esperadas ? 'bg-emerald-500' : 'bg-amber-500'"
                :style="{ width: `${porcentaje(j.hechas, j.esperadas)}%` }"
              ></span>
            </div>
            <div class="flex w-full items-center gap-1 text-[11px] text-muted-foreground">
              <IconifyIcon class="size-3" icon="lucide:clock" />
              {{ tiempoTranscurrido(j.ultima) || 'Sin evaluaciones' }}
              <span v-if="j.faltan > 0" class="ml-auto font-medium text-amber-600">
                Le faltan {{ j.faltan }} proyecto(s)
              </span>
              <span v-else-if="j.esperadas > 0" class="ml-auto font-medium text-emerald-600">Al día</span>
            </div>
          </button>
          <div v-if="avanceJurados.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
            Sin jurados asignados.
          </div>
        </div>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.semfa-pulso {
  animation: semfa-pulso 1.6s ease-in-out infinite;
}

@keyframes semfa-pulso {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(16 185 129 / 55%);
  }

  50% {
    box-shadow: 0 0 0 5px rgb(16 185 129 / 0%);
  }
}

:deep(.semfa-fila-nueva > td) {
  animation: semfa-fila-nueva 6s ease-out;
}

@keyframes semfa-fila-nueva {
  0%,
  40% {
    background: rgb(16 185 129 / 16%);
  }

  100% {
    background: transparent;
  }
}

/* Tarjeta de categoría del resumen */
.semfa-tarjeta-cat {
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}

.semfa-tarjeta-cat:hover,
.semfa-tarjeta-cat:focus-visible {
  border-color: hsl(var(--primary) / 45%);
  outline: none;
  box-shadow: 0 6px 16px -8px hsl(var(--primary) / 40%);
  transform: translateY(-1px);
}

/* Puesto: medalla para 1°–3°; borde punteado si es provisional */
.semfa-puesto {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 22px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 9999px;
}

.semfa-puesto--1 {
  color: #7c4a03;
  background: #fde68a;
  border-color: #f59e0b;
}

.semfa-puesto--2 {
  color: #334155;
  background: #e2e8f0;
  border-color: #94a3b8;
}

.semfa-puesto--3 {
  color: #7c2d12;
  background: #fed7aa;
  border-color: #ea580c;
}

.semfa-puesto.is-provisional {
  border-style: dashed;
  opacity: 0.85;
}

.dark .semfa-puesto--1 {
  color: #fde68a;
  background: rgb(245 158 11 / 22%);
}

.dark .semfa-puesto--2 {
  color: #e2e8f0;
  background: rgb(148 163 184 / 22%);
}

.dark .semfa-puesto--3 {
  color: #fed7aa;
  background: rgb(234 88 12 / 22%);
}

/* Día y stand delante del nombre del proyecto */
.semfa-ubicacion {
  display: inline-block;
  padding: 0 6px;
  margin-right: 4px;
  font-size: 11px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-radius: 6px;
}

/* Fila de jurado clicable (filtra sus pendientes) */
.semfa-jurado-fila {
  cursor: pointer;
  background: transparent;
  transition: background 0.15s;
}

.semfa-jurado-fila:hover {
  background: hsl(var(--accent));
}

.semfa-jurado-fila.is-activo {
  background: rgb(245 158 11 / 12%);
  box-shadow: inset 3px 0 0 #f59e0b;
}
</style>
