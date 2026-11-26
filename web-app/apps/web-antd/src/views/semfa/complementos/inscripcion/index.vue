<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { DatosFeriaEditados, InscripcionNueva } from '../participante/tipos';

import type { Inscripcion, InscripcionForm } from '#/api/inscripciones';
import type { EquipoForm, Participante, ParticipanteForm } from '#/api/participantes';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Dropdown, Menu, Select, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarInscripcion,
  crearInscripcion,
  eliminarInscripcion,
  guardarDatosFeria,
  listarInscripciones,
  trasladarInscripcion,
} from '#/api/inscripciones';
import {
  actualizarParticipante,
  crearParticipante,
  guardarEquipoParticipante,
  listarParticipantes,
} from '#/api/participantes';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, describirError, sinAvisosDeError } from '#/composables/useAvisos';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios, nombrePropio } from '#/utils/formato';
import { etiquetaJornada } from '#/utils/jornadas';

import ParticipanteFormModal from '../participante/form-modal.vue';
import InscripcionFormModal from './form-modal.vue';
import { type CambioOrden, guardarOrdenes } from './orden';
import OrdenModal from './orden-modal.vue';
import TrasladoModal from './traslado-modal.vue';

defineOptions({ name: 'SemfaInscripcion' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof InscripcionFormModal>>();
/** El formulario de inscripción solo se usa para altas (en lote). */
const inscripcionSeleccionada = ref<Inscripcion | null>(null);

/** Proyectos activos: para contar los que aún no tienen inscripción. */
const participantes = shallowRef<Participante[]>([]);

const { actividad, deLaActividad, idActividad, nombreActividad } = useActividadTrabajo();

/** Feria de varios días (FEXCOIN): cada proyecto se presenta en una jornada. */
const jornadas = computed(() => actividad.value?.jornadas ?? 1);

const crud = useCrud<Inscripcion, InscripcionForm>({
  guardar: (payload) => {
    const { idInscripcion, ...data } = payload;
    return actualizarInscripcion(idInscripcion!, data);
  },
  idKey: 'idInscripcion',
  listar: async () => {
    const [lista, proyectos] = await Promise.all([
      listarInscripciones(),
      listarParticipantes().catch(() => [] as Participante[]),
    ]);
    participantes.value = proyectos ?? [];
    return lista;
  },
  nombre: 'Inscripción',
  remover: eliminarInscripcion,
});

// ---------------------------------------------------------------- filas y filtro

type Estado = 'en-evaluacion' | 'evaluada' | 'pendiente' | 'sin-jurados';

/**
 * Estado de evaluación con el progreso real: evaluaciones hechas frente a las
 * esperadas (jurados de su categoría × rúbricas), que calcula el backend.
 */
const ESTADOS: Record<Estado, { clase: string; icono: string; texto: string }> = {
  'en-evaluacion': {
    clase: 'bg-primary/10 text-primary',
    icono: 'lucide:loader-circle',
    texto: 'En evaluación',
  },
  evaluada: {
    clase: 'bg-green-600/10 text-green-600',
    icono: 'lucide:circle-check',
    texto: 'Evaluada',
  },
  pendiente: {
    clase: 'bg-amber-500/10 text-amber-600',
    icono: 'lucide:clock',
    texto: 'Pendiente',
  },
  'sin-jurados': {
    clase: 'bg-red-500/10 text-red-600',
    icono: 'lucide:user-round-x',
    texto: 'Sin jurados',
  },
};

function estadoDe(i: Inscripcion): Estado {
  if (i.evaluacionesEsperadas === 0) {
    return i.evaluaciones > 0 ? 'evaluada' : 'sin-jurados';
  }
  if (i.evaluaciones === 0) {
    return 'pendiente';
  }
  return i.evaluaciones >= i.evaluacionesEsperadas ? 'evaluada' : 'en-evaluacion';
}

/** Datos de cada participante (institución), por id. */
const datosDe = computed(() => new Map(participantes.value.map((p) => [p.idParticipante, p])));

/** Solo las inscripciones de la actividad de trabajo (barra superior). */
const filas = computed(() =>
  deLaActividad(crud.items.value, (i) => i.idActividad).map((i) => {
    const p = datosDe.value.get(i.idParticipante);
    return {
      ...i,
      carreraBonita: nombrePropio(i.carrera ?? p?.carrera),
      categoria: nombrePropio(i.nombreCategoriaActividad),
      estado: estadoDe(i),
      facultadBonita: nombrePropio(i.facultad ?? p?.facultad),
      /** `-1` = sin facultad (para el filtro). */
      idFacultad: p?.idFacultad ?? -1,
      institucion: limpiarEspacios(p?.institucion),
      proyecto: limpiarEspacios(i.nombreParticipante),
      siglaFacultad: p?.siglaFacultad ?? '',
      standTexto: i.stand ?? '',
    };
  }),
);

type Fila = (typeof filas.value)[number];

/** Proyectos activos sin ninguna inscripción activa. */
const sinInscribir = computed(() => {
  const inscritos = new Set(crud.items.value.map((i) => i.idParticipante));
  return participantes.value.filter((p) => !inscritos.has(p.idParticipante)).length;
});

const conteoEstados = computed(() => {
  const conteo: Record<Estado, number> = {
    'en-evaluacion': 0,
    evaluada: 0,
    pendiente: 0,
    'sin-jurados': 0,
  };
  for (const f of filas.value) {
    conteo[f.estado] += 1;
  }
  return conteo;
});

const filtroEstado = ref<Estado>();

function alternarEstado(estado: Estado) {
  filtroEstado.value = filtroEstado.value === estado ? undefined : estado;
}

const filtroCategoria = ref<number>();

const opcionesCategoria = computed(() => {
  const conteo = new Map<number, { nombre: string; total: number }>();
  for (const f of filas.value) {
    conteo.set(f.idCategoriaActividad, {
      nombre: f.categoria,
      total: (conteo.get(f.idCategoriaActividad)?.total ?? 0) + 1,
    });
  }
  return [...conteo.entries()]
    .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(([value, { nombre, total }]) => ({ label: `${nombre} (${total})`, value }));
});

// ---------------------------------------------------------------- jornada y facultad (feria)

/** `0` = sin jornada. */
const filtroJornada = ref<number>();

const chipsJornada = computed(() => {
  if (jornadas.value <= 1) return [];
  const conteo = new Map<number, number>();
  for (const f of filas.value) conteo.set(f.jornada ?? 0, (conteo.get(f.jornada ?? 0) ?? 0) + 1);
  const chips = Array.from({ length: jornadas.value }, (_, i) => ({
    titulo: etiquetaJornada(actividad.value?.fecha, i + 1),
    total: conteo.get(i + 1) ?? 0,
    texto: `Día ${i + 1}`,
    valor: i + 1,
  }));
  return [...chips, { texto: 'Sin jornada', titulo: 'Aún sin día asignado', total: conteo.get(0) ?? 0, valor: 0 }];
});

function alternarJornada(valor: number) {
  filtroJornada.value = filtroJornada.value === valor ? undefined : valor;
}

/** Hay estructura académica si algún inscrito tiene carrera. */
const conCarreras = computed(() => filas.value.some((f) => !!f.carreraBonita));

const filtroFacultad = ref<number>();
const filtroCarrera = ref<string>();

const chipsFacultad = computed(() => {
  if (!conCarreras.value) return [];
  const conteo = new Map<number, { nombre: string; sigla: string; total: number }>();
  for (const f of filas.value) {
    const actual = conteo.get(f.idFacultad) ?? {
      nombre: f.idFacultad === -1 ? 'Sin facultad' : f.facultadBonita,
      sigla: f.siglaFacultad,
      total: 0,
    };
    actual.total += 1;
    conteo.set(f.idFacultad, actual);
  }
  return [...conteo.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => Number(a.id === -1) - Number(b.id === -1) || a.nombre.localeCompare(b.nombre, 'es'));
});

function alternarFacultad(id: number) {
  filtroFacultad.value = filtroFacultad.value === id ? undefined : id;
  filtroCarrera.value = undefined;
}

const opcionesCarreraFiltro = computed(() => {
  const conteo = new Map<string, number>();
  for (const f of filas.value) {
    if (!f.carreraBonita || (filtroFacultad.value !== undefined && f.idFacultad !== filtroFacultad.value)) continue;
    conteo.set(f.carreraBonita, (conteo.get(f.carreraBonita) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([value, total]) => ({ label: `${value} (${total})`, value }));
});

const filasFiltradas = computed(() =>
  filas.value.filter(
    (f) =>
      (filtroCategoria.value === undefined || f.idCategoriaActividad === filtroCategoria.value) &&
      (filtroEstado.value === undefined || f.estado === filtroEstado.value) &&
      (filtroJornada.value === undefined || (f.jornada ?? 0) === filtroJornada.value) &&
      (filtroFacultad.value === undefined || f.idFacultad === filtroFacultad.value) &&
      (filtroCarrera.value === undefined || f.carreraBonita === filtroCarrera.value),
  ),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['proyecto', 'institucion', 'categoria', 'carreraBonita', 'facultadBonita', 'standTexto'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/**
 * Columnas de `tabla.html` (Actividad, Categoría, Participante) más sus
 * evaluaciones y, en ferias, stand, jornada y carrera.
 */
const columnas = computed<ColumnsType<Fila>>(() => [
  { align: 'center', key: '#', title: '#', width: 56 },
  {
    dataIndex: 'standTexto',
    key: 'stand',
    sorter: (a, b) => comparar(a.standTexto, b.standTexto),
    title: 'Stand',
    width: 80,
  },
  {
    dataIndex: 'proyecto',
    ellipsis: true,
    key: 'proyecto',
    sorter: (a, b) => comparar(a.proyecto, b.proyecto),
    title: 'Participante',
  },
  ...(conCarreras.value
    ? [
        {
          dataIndex: 'carreraBonita',
          ellipsis: true,
          key: 'carrera',
          sorter: (a: Fila, b: Fila) => comparar(a.carreraBonita, b.carreraBonita),
          title: 'Carrera',
          width: 200,
        },
      ]
    : []),
  {
    dataIndex: 'categoria',
    ellipsis: true,
    key: 'categoria',
    sorter: (a, b) => comparar(a.categoria, b.categoria),
    title: 'Categoría',
    width: conCarreras.value ? 200 : 280,
  },
  ...(jornadas.value > 1
    ? [
        {
          align: 'center' as const,
          dataIndex: 'jornada',
          key: 'jornada',
          sorter: (a: Fila, b: Fila) => (a.jornada ?? 99) - (b.jornada ?? 99),
          title: 'Jornada',
          width: 90,
        },
      ]
    : []),
  {
    align: 'center',
    dataIndex: 'orden',
    key: 'orden',
    // Por categoría y, dentro, por orden de presentación (sin número al final).
    sorter: (a, b) =>
      comparar(a.categoria, b.categoria) ||
      (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER),
    title: 'Orden',
    width: 90,
  },
  {
    align: 'center',
    dataIndex: 'evaluaciones',
    key: 'evaluaciones',
    sorter: (a, b) =>
      a.evaluaciones / (a.evaluacionesEsperadas || 1) -
      b.evaluaciones / (b.evaluacionesEsperadas || 1),
    title: 'Evaluación',
    width: 170,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 320 },
]);

// ---------------------------------------------------------------- selección y jornada en bloque

const seleccion = ref<number[]>([]);
const asignando = ref(false);

const seleccionFilas = computed(() => ({
  onChange: (claves: (number | string)[]) => {
    seleccion.value = claves.map(Number);
  },
  preserveSelectedRowKeys: true,
  selectedRowKeys: seleccion.value,
}));

/** Selecciona todas las filas filtradas (no solo la página visible). */
function seleccionarFiltradas() {
  seleccion.value = [...new Set([...seleccion.value, ...filtrados.value.map((f) => f.idInscripcion)])];
}

/** «Asignar jornada…»: `0` la quita. Un solo `PUT` y un único aviso. */
async function asignarJornada(jornada: number) {
  const ids = seleccion.value.filter((id) => filas.value.some((f) => f.idInscripcion === id));
  if (ids.length === 0) return;
  asignando.value = true;
  try {
    const cambiadas = await guardarDatosFeria(
      ids.map((idInscripcion) => ({ idInscripcion, jornada: jornada || null })),
      ['jornada'],
    );
    avisar({
      mensaje:
        jornada === 0
          ? `${cambiadas} proyecto(s) quedaron sin jornada.`
          : `${cambiadas} proyecto(s) se presentan el ${etiquetaJornada(actividad.value?.fecha, jornada)}.`,
      tipo: 'exito',
      titulo: 'Jornada asignada',
    });
    seleccion.value = [];
    await crud.recargar();
  } catch {
    // El interceptor ya avisó.
  } finally {
    asignando.value = false;
  }
}

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  inscripcionSeleccionada.value = null;
  modalAbierto.value = true;
}

/**
 * Inscribe participantes ya registrados: una petición por participante; las que
 * fallan se resumen en un único aviso. (Para cambiar la categoría de un inscrito
 * se usa «Trasladar»; sus datos, con «Editar».)
 */
async function alGuardar(inscripciones: InscripcionForm[], continuar: boolean) {
  crud.guardando.value = true;
  let creadas = 0;
  const motivos = new Map<string, number>();
  try {
    await sinAvisosDeError(async () => {
      for (const inscripcion of inscripciones) {
        try {
          await crearInscripcion(inscripcion);
          creadas += 1;
        } catch (error) {
          const { mensaje, titulo } = describirError(error);
          const motivo = mensaje || titulo;
          motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
        }
      }
    });
    await crud.recargar();
  } finally {
    crud.guardando.value = false;
  }

  const total = inscripciones.length;
  const detalles = [...motivos].map(([m, n]) => (n > 1 ? `${m} (${n})` : m));
  if (creadas === 0) {
    avisar({
      detalles,
      mensaje: total === 1 ? 'La inscripción no se pudo guardar.' : `Ninguna de las ${total} inscripciones se pudo guardar.`,
      tipo: 'error',
      titulo: 'No se guardaron las inscripciones',
    });
    return;
  }
  avisar(
    creadas === total
      ? {
          mensaje:
            creadas === 1
              ? 'El proyecto quedó inscrito.'
              : `Los ${creadas} proyectos quedaron inscritos.`,
          tipo: 'exito',
          titulo: 'Proyectos inscritos',
        }
      : {
          detalles,
          mensaje: `Se inscribieron ${creadas} de ${total}; los demás fallaron.`,
          tipo: 'advertencia',
          titulo: 'Inscripción parcial',
        },
  );
  if (continuar) {
    modalRef.value?.reiniciar(creadas);
  } else {
    modalAbierto.value = false;
  }
}

// ---------------------------------------------------------------- participante (alta e inscripción en un paso)

const participanteAbierto = ref(false);
const participanteRef = ref<InstanceType<typeof ParticipanteFormModal>>();
const participanteSeleccionado = ref<null | Participante>(null);
const guardandoParticipante = ref(false);

function abrirNuevoParticipante() {
  participanteSeleccionado.value = null;
  participanteAbierto.value = true;
}

function editarParticipante(fila: Fila) {
  participanteSeleccionado.value = datosDe.value.get(fila.idParticipante) ?? null;
  if (participanteSeleccionado.value) participanteAbierto.value = true;
}

const inscripcionesDelParticipante = computed(() =>
  crud.items.value.filter((i) => i.idParticipante === participanteSeleccionado.value?.idParticipante),
);

/**
 * Alta: crea el participante y lo inscribe en la categoría elegida. Edición: solo
 * sus datos (nombre, institución, tipo); la categoría se cambia con «Trasladar».
 */
async function alGuardarParticipante(
  payload: ParticipanteForm,
  inscripcion: InscripcionNueva | null,
  continuar: boolean,
  equipo: EquipoForm | null,
  feria?: DatosFeriaEditados | null,
) {
  const { idParticipante, ...data } = payload;
  const nombre = limpiarEspacios(payload.nombre);
  guardandoParticipante.value = true;
  let idGuardado = idParticipante;
  try {
    if (idParticipante !== undefined) {
      await actualizarParticipante(idParticipante, data);
      avisar({ mensaje: `«${nombre}» se actualizó correctamente.`, tipo: 'exito', titulo: 'Cambios guardados' });
    } else {
      const creado = await crearParticipante(data);
      idGuardado = creado.idParticipante;
      let inscrito = false;
      if (inscripcion) {
        try {
          await crearInscripcion({ ...inscripcion, idParticipante: creado.idParticipante });
          inscrito = true;
        } catch {
          // El participante ya existe: no se reintenta (daría «nombre repetido»).
        }
      }
      avisar(
        inscrito || !inscripcion
          ? {
              mensaje: inscrito ? `«${nombre}» quedó registrado e inscrito.` : `«${nombre}» quedó registrado sin inscripción.`,
              tipo: 'exito',
              titulo: 'Participante registrado',
            }
          : {
              mensaje: `«${nombre}» se registró, pero no se pudo inscribir: use «Sin inscribir».`,
              tipo: 'advertencia',
              titulo: 'Registrado sin inscripción',
            },
      );
    }
  } catch {
    guardandoParticipante.value = false;
    return; // El interceptor ya avisó.
  }
  // Jornada y stand de su inscripción en esta actividad, si cambiaron.
  if (feria) {
    try {
      const { idInscripcion, jornada, stand } = feria;
      await guardarDatosFeria([{ idInscripcion, jornada, stand }], ['jornada', 'stand']);
    } catch {
      // El interceptor ya avisó; el participante sí quedó guardado.
    }
  }
  // Docente guía e integrantes, si cambiaron.
  if (equipo && idGuardado !== undefined) {
    try {
      await guardarEquipoParticipante(idGuardado, equipo);
    } catch {
      // El interceptor ya avisó; el participante sí quedó guardado.
    }
  }
  guardandoParticipante.value = false;
  await crud.recargar();
  if (continuar) {
    participanteRef.value?.reiniciar();
  } else {
    participanteAbierto.value = false;
  }
}

// ---------------------------------------------------------------- orden de presentación

const ordenAbierto = ref(false);
const guardandoOrden = ref(false);

/** Inscripciones activas de la actividad de trabajo, para el modal. */
const inscritasDeLaActividad = computed(() => deLaActividad(crud.items.value, (i) => i.idActividad));

async function guardarOrden(cambios: CambioOrden[]) {
  guardandoOrden.value = true;
  try {
    const ok = await guardarOrdenes(cambios);
    await crud.recargar();
    if (ok) ordenAbierto.value = false;
  } finally {
    guardandoOrden.value = false;
  }
}

// ---------------------------------------------------------------- traslado

const trasladoAbierto = ref(false);
const aTrasladar = ref<Fila | null>(null);
const trasladando = ref(false);

const carreraDeATrasladar = computed(
  () =>
    participantes.value.find((p) => p.idParticipante === aTrasladar.value?.idParticipante)
      ?.institucion ?? '',
);

function abrirTraslado(fila: Fila) {
  aTrasladar.value = fila;
  trasladoAbierto.value = true;
}

async function trasladar(idCategoriaActividad: number) {
  const fila = aTrasladar.value;
  if (!fila) {
    return;
  }
  trasladando.value = true;
  try {
    const nueva = await trasladarInscripcion(fila.idInscripcion, idCategoriaActividad);
    avisar({
      mensaje:
        fila.evaluaciones > 0
          ? `Sus ${fila.evaluaciones} evaluación(es) se archivaron: deberá ser evaluado de nuevo.`
          : 'No tenía evaluaciones.',
      tipo: 'exito',
      titulo: `Trasladado a ${nombrePropio(nueva.nombreCategoriaActividad)}`,
    });
    trasladoAbierto.value = false;
    await crud.recargar();
  } catch {
    // El interceptor de errores ya avisó.
  } finally {
    trasladando.value = false;
  }
}

/** Borrar desactiva también sus evaluaciones (backend): se dice cuántas. */
function eliminar(fila: Fila) {
  crud.eliminar(
    fila,
    `${fila.proyecto} en ${fila.categoria}`,
    fila.evaluaciones > 0
      ? `También se eliminarán sus ${fila.evaluaciones} evaluación(es): los puntajes de los jurados dejarán de contar en rankings y reportes.`
      : undefined,
  );
}

onMounted(crud.recargar);
</script>

<template>
  <SemfaPagina description="Participantes de la actividad: su categoría, orden de presentación y avance de evaluación" title="Participantes">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:clipboard-check" />
          Participantes inscritos
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar participante, stand, carrera o categoría…"
          texto-agregar="Nuevo participante"
          @agregar="abrirNuevoParticipante"
          @recargar="crud.recargar"
        >
          <template #filtros>
            <Select
              v-model:value="filtroCategoria"
              :options="opcionesCategoria"
              allow-clear
              class="hidden w-72 lg:block"
              placeholder="Todas las categorías"
            />
          </template>
        </SemfaBarraCrud>
      </template>

      <!-- Resumen: quién falta inscribir y cómo va la evaluación; cada uno filtra -->
      <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          :class="sinInscribir > 0 ? 'text-amber-600' : ''"
          class="semfa-chip"
          title="Inscribir participantes ya registrados (de otras actividades o sin inscripción)"
          type="button"
          @click="abrirRegistro"
        >
          <IconifyIcon class="size-3.5" icon="lucide:folder-x" />
          Sin inscribir
          <span class="semfa-chip__total">{{ sinInscribir }}</span>
        </button>
        <span class="mx-1 h-5 w-px bg-border"></span>
        <button
          v-for="(info, clave) in ESTADOS"
          :key="clave"
          :class="{ 'is-activo': filtroEstado === clave }"
          class="semfa-chip"
          type="button"
          @click="alternarEstado(clave)"
        >
          <IconifyIcon :icon="info.icono" class="size-3.5" />
          {{ info.texto }}
          <span class="semfa-chip__total">{{ conteoEstados[clave] }}</span>
        </button>
        <Tooltip title="El orden en que se presentan: así los lista la app del jurado">
          <Button
            :disabled="filas.length === 0"
            class="semfa-btn semfa-btn--suave-primario ml-auto"
            size="small"
            @click="ordenAbierto = true"
          >
            <IconifyIcon class="size-3.5" icon="lucide:list-ordered" />
            Orden de presentación
          </Button>
        </Tooltip>
      </div>

      <!-- Feria: jornada (días) y facultad / carrera; cada chip filtra -->
      <div
        v-if="chipsJornada.length > 0 || chipsFacultad.length > 0"
        class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2"
      >
        <template v-if="chipsJornada.length > 0">
          <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:calendar-range" />
          <Tooltip v-for="j in chipsJornada" :key="j.valor" :title="j.titulo">
            <button
              :class="[{ 'is-activo': filtroJornada === j.valor }, j.valor === 0 && j.total > 0 ? 'text-amber-600' : '']"
              class="semfa-chip"
              type="button"
              @click="alternarJornada(j.valor)"
            >
              {{ j.texto }}
              <span class="semfa-chip__total">{{ j.total }}</span>
            </button>
          </Tooltip>
        </template>
        <span v-if="chipsJornada.length > 0 && chipsFacultad.length > 0" class="mx-1 h-5 w-px bg-border"></span>
        <template v-if="chipsFacultad.length > 0">
          <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:landmark" />
          <Tooltip v-for="f in chipsFacultad" :key="f.id" :title="f.nombre">
            <button
              :class="{ 'is-activo': filtroFacultad === f.id }"
              class="semfa-chip"
              type="button"
              @click="alternarFacultad(f.id)"
            >
              {{ f.sigla || f.nombre }}
              <span class="semfa-chip__total">{{ f.total }}</span>
            </button>
          </Tooltip>
          <Select
            v-model:value="filtroCarrera"
            :options="opcionesCarreraFiltro"
            allow-clear
            class="w-60"
            placeholder="Todas las carreras"
            show-search
            size="small"
          />
        </template>
      </div>

      <!-- Acciones en bloque sobre las filas marcadas -->
      <div
        v-if="seleccion.length > 0"
        class="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-sm"
      >
        <IconifyIcon class="size-4 text-primary" icon="lucide:list-checks" />
        <b>{{ seleccion.length }}</b> seleccionada(s)
        <Button
          v-if="filtrados.length > seleccion.length"
          size="small"
          type="link"
          @click="seleccionarFiltradas"
        >
          Marcar las {{ filtrados.length }} filtradas
        </Button>
        <span v-if="jornadas <= 1" class="text-xs text-muted-foreground">
          (para repartir por jornadas, ponga la fecha de fin de la actividad en Actividades)
        </span>
        <Dropdown v-else :disabled="asignando" :trigger="['click']">
          <Button :loading="asignando" class="semfa-btn semfa-btn--suave-primario" size="small">
            <IconifyIcon class="size-3.5" icon="lucide:calendar-range" />
            Asignar jornada…
            <IconifyIcon class="size-3" icon="lucide:chevron-down" />
          </Button>
          <template #overlay>
            <Menu @click="(e: any) => asignarJornada(Number(e.key))">
              <Menu.Item v-for="j in chipsJornada.filter((c) => c.valor > 0)" :key="j.valor">
                {{ j.titulo }}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item :key="0">Quitar jornada</Menu.Item>
            </Menu>
          </template>
        </Dropdown>
        <Button class="ml-auto" size="small" type="link" @click="seleccion = []">Quitar selección</Button>
      </div>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :row-selection="seleccionFilas"
        :scroll="{ x: conCarreras || jornadas > 1 ? 1300 : 1170 }"
        class="semfa-tabla"
        row-key="idInscripcion"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'proyecto'">
            <Tooltip :title="record.proyecto" placement="topLeft">
              <div class="min-w-0 leading-tight">
                <div class="truncate font-medium">{{ record.proyecto || '—' }}</div>
                <div v-if="record.institucion && !conCarreras" class="truncate text-xs text-muted-foreground">{{ record.institucion }}</div>
              </div>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'stand'">
            <span v-if="record.stand" class="font-mono text-xs font-medium">{{ record.stand }}</span>
            <span v-else class="text-muted-foreground">—</span>
          </template>

          <template v-else-if="column.key === 'carrera'">
            <Tooltip
              :title="record.facultadBonita ? `${record.carreraBonita} · ${record.facultadBonita}` : record.carreraBonita"
              placement="topLeft"
            >
              <div class="flex min-w-0 items-center gap-1.5">
                <span
                  v-if="record.siglaFacultad"
                  class="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                >
                  {{ record.siglaFacultad }}
                </span>
                <span class="truncate text-muted-foreground">{{ record.carreraBonita || '—' }}</span>
              </div>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'jornada'">
            <Tooltip v-if="record.jornada" :title="etiquetaJornada(actividad?.fecha, record.jornada)">
              <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Día {{ record.jornada }}
              </span>
            </Tooltip>
            <span v-else class="text-xs text-amber-600">—</span>
          </template>

          <template v-else-if="column.key === 'orden'">
            <span v-if="record.orden !== null" class="tabular-nums font-medium">{{ record.orden }}</span>
            <Tooltip v-else title="Sin orden de presentación: use «Orden de presentación»">
              <span class="text-muted-foreground">—</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'categoria'">
            <Tooltip :title="record.categoria" placement="topLeft">
              <span class="text-muted-foreground">{{ record.categoria || '—' }}</span>
            </Tooltip>
          </template>


          <template v-else-if="column.key === 'evaluaciones'">
            <Tooltip
              :title="
                record.estado === 'sin-jurados'
                  ? 'Su categoría no tiene jurados o rúbricas: nadie puede evaluarlo'
                  : `${record.evaluaciones} de ${record.evaluacionesEsperadas} evaluaciones (jurados de su categoría × rúbricas)`
              "
            >
              <span
                :class="ESTADOS[record.estado as Estado].clase"
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              >
                <IconifyIcon :icon="ESTADOS[record.estado as Estado].icono" class="size-3.5" />
                {{ ESTADOS[record.estado as Estado].texto }}
                <span v-if="record.evaluacionesEsperadas > 0" class="tabular-nums opacity-80">
                  {{ record.evaluaciones }}/{{ record.evaluacionesEsperadas }}
                </span>
              </span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Tooltip title="Nombre, institución, tipo, jornada y stand del participante">
                <Button
                  class="semfa-btn semfa-btn--suave-primario"
                  size="small"
                  @click="editarParticipante(record as Fila)"
                >
                  <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                  Editar
                </Button>
              </Tooltip>
              <Tooltip title="Pasarlo a otra categoría de la misma actividad">
                <Button
                  class="semfa-btn semfa-btn--neutro"
                  size="small"
                  @click="abrirTraslado(record as Fila)"
                >
                  <IconifyIcon class="size-3.5" icon="lucide:arrow-right-left" />
                  Trasladar
                </Button>
              </Tooltip>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="eliminar(record as Fila)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
                Eliminar
              </Button>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            <span v-if="idActividad === undefined">Elija una actividad en la barra superior</span>
            <span
              v-else-if="
                busqueda.trim() ||
                filtroCategoria !== undefined ||
                filtroEstado !== undefined ||
                filtroJornada !== undefined ||
                filtroFacultad !== undefined ||
                filtroCarrera !== undefined
              "
            >
              No hay inscripciones con ese filtro
            </span>
            <span v-else>{{ nombreActividad }} aún no tiene inscritos</span>
          </div>
        </template>
      </Table>
    </Card>

    <InscripcionFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :inscripcion="inscripcionSeleccionada"
      :inscripciones="crud.items.value"
      @guardar="alGuardar"
    />

    <ParticipanteFormModal
      ref="participanteRef"
      v-model:open="participanteAbierto"
      :guardando="guardandoParticipante"
      :inscripciones="inscripcionesDelParticipante"
      inscripcion-obligatoria
      :participante="participanteSeleccionado"
      :participantes="participantes"
      @guardar="alGuardarParticipante"
    />

    <OrdenModal
      v-model:open="ordenAbierto"
      :guardando="guardandoOrden"
      :inscripciones="inscritasDeLaActividad"
      @guardar="guardarOrden"
    />

    <TrasladoModal
      v-model:open="trasladoAbierto"
      :carrera-del-proyecto="carreraDeATrasladar"
      :guardando="trasladando"
      :inscripcion="aTrasladar"
      :inscripciones="crud.items.value"
      @trasladar="trasladar"
    />
  </SemfaPagina>
</template>
