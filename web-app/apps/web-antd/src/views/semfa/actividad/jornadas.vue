<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { PasoActividad } from '#/api/actividades';
import type { Inscripcion } from '#/api/inscripciones';
import type { Participante } from '#/api/participantes';

import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import { cambiarJornadaEnCurso } from '#/api/actividades';
import { asignarJornadaEnBloque, listarInscripciones } from '#/api/inscripciones';
import { listarParticipantes } from '#/api/participantes';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, confirmar } from '#/composables/useAvisos';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios, nombrePropio } from '#/utils/formato';
import {
  contarPorJornada,
  etiquetaJornada,
  fechaCortaJornada,
  SIN_DIA,
  textoJornadaEnCurso,
} from '#/utils/jornadas';

defineOptions({ name: 'SemfaActividadJornadas' });

/**
 * Paso «Jornadas» del centro de la actividad (ferias de varios días, p. ej. FEXCOIN):
 * reparte los proyectos por día y fija qué día evalúa el jurado ahora. Mientras hay
 * un día en curso, la app del jurado solo trae los proyectos de ese día; los
 * resultados siguen contando todos.
 */
const emit = defineEmits<{ cambiado: []; ir: [paso: PasoActividad] }>();

const router = useRouter();
const { actividad, deLaActividad, nombreActividad, store } = useActividadTrabajo();

const jornadas = computed(() => actividad.value?.jornadas ?? 1);
const enCurso = computed(() => actividad.value?.jornadaEnCurso ?? null);

// ---------------------------------------------------------------- datos

const todas = shallowRef<Inscripcion[]>([]);
const participantes = shallowRef<Participante[]>([]);
const cargando = ref(false);

async function cargar() {
  cargando.value = true;
  try {
    const [lista, proyectos] = await Promise.all([
      listarInscripciones(),
      listarParticipantes().catch(() => [] as Participante[]),
    ]);
    todas.value = lista ?? [];
    participantes.value = proyectos ?? [];
  } finally {
    cargando.value = false;
  }
}

const datosDe = computed(() => new Map(participantes.value.map((p) => [p.idParticipante, p])));

/** Inscripciones de la actividad de trabajo, por categoría y orden de presentación. */
const filas = computed(() =>
  deLaActividad(todas.value, (i) => i.idActividad)
    .map((i) => {
      const p = datosDe.value.get(i.idParticipante);
      return {
        ...i,
        carreraBonita: nombrePropio(i.carrera ?? p?.carrera),
        categoria: nombrePropio(i.nombreCategoriaActividad),
        docente: nombrePropio(p?.docenteGuia),
        facultadBonita: nombrePropio(i.facultad ?? p?.facultad),
        /** `-1` = sin facultad (para el filtro). */
        idFacultad: p?.idFacultad ?? -1,
        proyecto: limpiarEspacios(i.nombreParticipante),
        siglaFacultad: p?.siglaFacultad ?? '',
      };
    })
    .sort(
      (a, b) =>
        a.categoria.localeCompare(b.categoria, 'es') ||
        (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER) ||
        a.proyecto.localeCompare(b.proyecto, 'es'),
    ),
);

type Fila = (typeof filas.value)[number];

const conteo = computed(() => contarPorJornada(filas.value, jornadas.value));

// ---------------------------------------------------------------- jornada en curso

const cambiandoDia = ref(false);

const opcionesDia = computed(() => [
  {
    detalle: 'Los jurados ven todos los proyectos',
    icono: 'lucide:layers',
    texto: 'Todos',
    valor: null as null | number,
  },
  ...Array.from({ length: jornadas.value }, (_, i) => ({
    detalle: `${conteo.value.porDia[i] ?? 0} proyecto(s)`,
    icono: 'lucide:calendar-check',
    texto: `Día ${i + 1}${fechaCortaJornada(actividad.value?.fecha, i + 1) ? ` (${fechaCortaJornada(actividad.value?.fecha, i + 1)})` : ''}`,
    valor: i + 1 as null | number,
  })),
]);

async function elegirDia(valor: null | number) {
  const a = actividad.value;
  if (!a || valor === enCurso.value || cambiandoDia.value) return;
  const destino = valor === null ? 'todos los proyectos' : etiquetaJornada(a.fecha, valor);
  const ok = await confirmar({
    mensaje:
      valor === null
        ? 'Los jurados verán en su app todos los proyectos de la actividad.'
        : `Los jurados solo verán en su app los proyectos del ${destino}` +
          (conteo.value.sinDia > 0 ? `; los ${conteo.value.sinDia} proyecto(s) sin día no aparecerán. ` : '. ') +
          'Lo que ya tengan evaluado o guardado sin señal se sigue aceptando aunque sea de otro día.',
    textoAceptar: 'Cambiar',
    titulo: `¿El jurado evalúa ${destino}?`,
  });
  if (!ok) return;
  cambiandoDia.value = true;
  try {
    const nueva = await cambiarJornadaEnCurso(a.idActividad, valor);
    store.reemplazar(nueva);
    avisar({
      mensaje:
        valor === null
          ? 'Los jurados ven todos los proyectos de la actividad.'
          : `Los jurados ven solo los proyectos del ${destino}.`,
      tipo: 'exito',
      titulo: 'Jornada en curso',
    });
    emit('cambiado');
  } catch {
    // El interceptor ya avisó.
  } finally {
    cambiandoDia.value = false;
  }
}

// ---------------------------------------------------------------- contadores y filtros

/** `0` = sin día. */
const filtroDia = ref<number>();
const filtroFacultad = ref<number>();
const filtroCarrera = ref<string>();
const filtroCategoria = ref<number>();

const chipsDia = computed(() => [
  ...conteo.value.porDia.map((total, i) => ({
    titulo: etiquetaJornada(actividad.value?.fecha, i + 1),
    texto: `Día ${i + 1}`,
    total,
    valor: i + 1,
  })),
  { titulo: 'Aún sin día asignado', texto: 'Sin día', total: conteo.value.sinDia, valor: SIN_DIA },
]);

function alternarDia(valor: number) {
  filtroDia.value = filtroDia.value === valor ? undefined : valor;
}

function alternarCarrera(nombre: string) {
  filtroCarrera.value = filtroCarrera.value === nombre ? undefined : nombre;
}

function alternarCategoria(id: number) {
  filtroCategoria.value = filtroCategoria.value === id ? undefined : id;
}

const chipsFacultad = computed(() => {
  const conteoFacultad = new Map<number, { nombre: string; sigla: string; total: number }>();
  for (const f of filas.value) {
    const actual = conteoFacultad.get(f.idFacultad) ?? {
      nombre: f.idFacultad === -1 ? 'Sin facultad' : f.facultadBonita,
      sigla: f.siglaFacultad,
      total: 0,
    };
    actual.total += 1;
    conteoFacultad.set(f.idFacultad, actual);
  }
  // Sin estructura académica (ningún proyecto con facultad) no hay qué filtrar.
  if (conteoFacultad.size === 0 || (conteoFacultad.size === 1 && conteoFacultad.has(-1))) return [];
  return [...conteoFacultad.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => Number(a.id === -1) - Number(b.id === -1) || a.nombre.localeCompare(b.nombre, 'es'));
});

function alternarFacultad(id: number) {
  filtroFacultad.value = filtroFacultad.value === id ? undefined : id;
  filtroCarrera.value = undefined;
}

/** Carreras de la facultad elegida (o todas). */
const chipsCarrera = computed(() => {
  const conteoCarrera = new Map<string, number>();
  for (const f of filas.value) {
    if (!f.carreraBonita || (filtroFacultad.value !== undefined && f.idFacultad !== filtroFacultad.value)) continue;
    conteoCarrera.set(f.carreraBonita, (conteoCarrera.get(f.carreraBonita) ?? 0) + 1);
  }
  return [...conteoCarrera.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([nombre, total]) => ({ nombre, total }));
});

const chipsCategoria = computed(() => {
  const conteoCategoria = new Map<number, { nombre: string; total: number }>();
  for (const f of filas.value) {
    conteoCategoria.set(f.idCategoriaActividad, {
      nombre: f.categoria,
      total: (conteoCategoria.get(f.idCategoriaActividad)?.total ?? 0) + 1,
    });
  }
  return [...conteoCategoria.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});

const filasFiltradas = computed(() =>
  filas.value.filter(
    (f) =>
      (filtroDia.value === undefined || (f.jornada && f.jornada <= jornadas.value ? f.jornada : SIN_DIA) === filtroDia.value) &&
      (filtroFacultad.value === undefined || f.idFacultad === filtroFacultad.value) &&
      (filtroCarrera.value === undefined || f.carreraBonita === filtroCarrera.value) &&
      (filtroCategoria.value === undefined || f.idCategoriaActividad === filtroCategoria.value),
  ),
);

const { alCambiarTabla, busqueda, filtrados, paginacion } = useTablaLocal(filasFiltradas, {
  camposBusqueda: ['proyecto', 'carreraBonita', 'facultadBonita', 'categoria', 'docente'],
});

// ---------------------------------------------------------------- selección y reparto en bloque

const seleccion = ref<number[]>([]);
const asignando = ref(false);

// Una selección de otro filtro quedaría oculta: cada cambio de filtro la limpia.
watch([filtroDia, filtroFacultad, filtroCarrera, filtroCategoria, busqueda], () => {
  seleccion.value = [];
});

const seleccionFilas = computed(() => ({
  onChange: (claves: (number | string)[]) => {
    seleccion.value = claves.map(Number);
  },
  preserveSelectedRowKeys: true,
  selectedRowKeys: seleccion.value,
}));

/** Marca todo lo filtrado, no solo la página visible. */
function seleccionarFiltradas() {
  seleccion.value = filtrados.value.map((f) => f.idInscripcion);
}

/** Pasa lo marcado a un día (`null` = quitarlo): un solo `PUT` y un único aviso. */
async function asignar(jornada: null | number) {
  const marcadas = filas.value.filter((f) => seleccion.value.includes(f.idInscripcion));
  if (marcadas.length === 0 || asignando.value) return;
  const destino = jornada === null ? 'sin día' : etiquetaJornada(actividad.value?.fecha, jornada);
  const dia = enCurso.value;
  // Los que entran o salen del día que ven hoy los jurados cambian lo que tienen en su app.
  const afectaAlJurado = dia !== null && marcadas.some((f) => (f.jornada === dia) !== (jornada === dia));
  if (afectaAlJurado) {
    const ok = await confirmar({
      mensaje: `Hoy los jurados ven solo el Día ${dia}. Al pasar ${marcadas.length} proyecto(s) a «${destino}», los que salen de ese día desaparecen de su tablero y los que entran aparecen.`,
      textoAceptar: 'Pasar',
      titulo: '¿Cambiar lo que ven los jurados?',
    });
    if (!ok) return;
  }
  asignando.value = true;
  try {
    const cambiadas = await asignarJornadaEnBloque(
      marcadas.map((f) => f.idInscripcion),
      jornada,
    );
    avisar({
      mensaje:
        jornada === null
          ? `${cambiadas} proyecto(s) quedaron sin día.`
          : `${cambiadas} proyecto(s) se presentan el ${destino}.`,
      tipo: 'exito',
      titulo: 'Jornada asignada',
    });
    seleccion.value = [];
    await cargar();
    emit('cambiado');
  } catch {
    // El interceptor ya avisó.
  } finally {
    asignando.value = false;
  }
}

// ---------------------------------------------------------------- tabla

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const columnas = computed<ColumnsType<Fila>>(() => [
  {
    align: 'center',
    dataIndex: 'orden',
    key: 'orden',
    sorter: (a, b) => (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER),
    title: 'Orden',
    width: 76,
  },
  {
    dataIndex: 'proyecto',
    ellipsis: true,
    key: 'proyecto',
    sorter: (a, b) => comparar(a.proyecto, b.proyecto),
    title: 'Proyecto',
    width: 260,
  },
  {
    dataIndex: 'carreraBonita',
    ellipsis: true,
    key: 'carrera',
    sorter: (a, b) => comparar(a.carreraBonita, b.carreraBonita),
    title: 'Carrera',
    width: 190,
  },
  {
    dataIndex: 'facultadBonita',
    ellipsis: true,
    key: 'facultad',
    sorter: (a, b) => comparar(a.facultadBonita, b.facultadBonita),
    title: 'Facultad',
    width: 170,
  },
  {
    dataIndex: 'categoria',
    ellipsis: true,
    key: 'categoria',
    sorter: (a, b) => comparar(a.categoria, b.categoria),
    title: 'Categoría',
    width: 170,
  },
  {
    dataIndex: 'docente',
    ellipsis: true,
    key: 'docente',
    sorter: (a, b) => comparar(a.docente, b.docente),
    title: 'Docente guía',
    width: 180,
  },
  {
    align: 'center',
    dataIndex: 'jornada',
    key: 'jornada',
    sorter: (a, b) => (a.jornada ?? 99) - (b.jornada ?? 99),
    title: 'Día',
    width: 90,
  },
]);

onMounted(cargar);
</script>

<template>
  <SemfaPagina description="Qué día se presenta cada proyecto y qué día evalúa el jurado ahora" title="Jornadas">
    <!-- Actividad de un solo día: no hay nada que repartir -->
    <Card v-if="actividad && jornadas <= 1" class="rounded-xl">
      <div class="flex flex-col items-center gap-3 py-10 text-center">
        <IconifyIcon class="size-12 text-primary" icon="lucide:calendar-range" />
        <div class="text-lg font-semibold">Esta actividad dura un solo día</div>
        <p class="m-0 max-w-md text-muted-foreground">
          Para repartir los proyectos por día y decidir qué día evalúa el jurado, ponga la fecha de fin de la
          actividad (p. ej. 13 y 14 de noviembre). Mientras tanto, los jurados ven todos los proyectos.
        </p>
        <Button class="semfa-btn semfa-btn--primario" @click="router.push('/semfa/actividades')">
          <IconifyIcon class="size-4" icon="lucide:calendar-days" />
          Ir a Actividades
        </Button>
      </div>
    </Card>

    <div v-else-if="actividad" class="flex flex-col gap-3">
      <!-- Qué día evalúa el jurado ahora -->
      <Card :body-style="{ padding: '16px' }" class="rounded-xl">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-5 text-primary" icon="lucide:gavel" />
            ¿Qué día evalúa el jurado ahora?
            <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
          </div>
        </template>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="o in opcionesDia"
            :key="o.valor ?? 'todos'"
            :class="enCurso === o.valor ? 'semfa-btn--primario' : 'semfa-btn--neutro'"
            :disabled="cambiandoDia"
            class="semfa-btn h-auto min-w-40 flex-col items-start gap-0 px-4 py-2 text-left"
            @click="elegirDia(o.valor)"
          >
            <span class="flex items-center gap-1.5 text-base font-semibold leading-tight">
              <IconifyIcon :icon="enCurso === o.valor ? 'lucide:circle-check' : o.icono" class="size-4" />
              {{ o.texto }}
            </span>
            <span class="text-xs font-normal opacity-80">{{ o.detalle }}</span>
          </Button>
        </div>
        <p class="m-0 mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
          <IconifyIcon class="mt-0.5 size-4 shrink-0" icon="lucide:info" />
          <span>
            Ahora: <b>{{ textoJornadaEnCurso(actividad.fecha, enCurso) }}</b>.
            Con un día elegido, la app del jurado solo muestra y deja abrir los proyectos nuevos de ese día; los que
            no tienen día no aparecen. Lo que el jurado ya evaluó se puede reenviar y guardar siempre. Los resultados y
            el panel de evaluación siguen contando todos los proyectos.
          </span>
        </p>
      </Card>

      <!-- Reparto de proyectos por día -->
      <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-5 text-primary" icon="lucide:calendar-range" />
            Proyectos por día
          </div>
        </template>

        <template #extra>
          <SemfaBarraCrud
            v-model:busqueda="busqueda"
            :cargando="cargando"
            icono-agregar="lucide:users"
            placeholder="Buscar proyecto, carrera, categoría o docente…"
            texto-agregar="Participantes"
            @agregar="emit('ir', 'participantes')"
            @recargar="cargar"
          />
        </template>

        <!-- Contadores por día: cada uno filtra -->
        <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:calendar-range" />
          <Tooltip v-for="d in chipsDia" :key="d.valor" :title="d.titulo">
            <button
              :class="[{ 'is-activo': filtroDia === d.valor }, d.valor === SIN_DIA && d.total > 0 ? 'text-amber-600' : '']"
              class="semfa-chip"
              type="button"
              @click="alternarDia(d.valor)"
            >
              {{ d.texto }}
              <span class="semfa-chip__total">{{ d.total }}</span>
            </button>
          </Tooltip>
        </div>

        <!-- Facultad, carrera y categoría -->
        <div
          v-if="chipsFacultad.length > 0 || chipsCarrera.length > 0 || chipsCategoria.length > 1"
          class="flex max-h-40 flex-col gap-2 overflow-y-auto border-b border-border px-4 py-2"
        >
          <div v-if="chipsFacultad.length > 0" class="flex flex-wrap items-center gap-2">
            <Tooltip title="Facultad">
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:landmark" />
            </Tooltip>
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
          </div>
          <div v-if="chipsCarrera.length > 0" class="flex flex-wrap items-center gap-2">
            <Tooltip title="Carrera">
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:graduation-cap" />
            </Tooltip>
            <button
              v-for="c in chipsCarrera"
              :key="c.nombre"
              :class="{ 'is-activo': filtroCarrera === c.nombre }"
              class="semfa-chip"
              type="button"
              @click="alternarCarrera(c.nombre)"
            >
              {{ c.nombre }}
              <span class="semfa-chip__total">{{ c.total }}</span>
            </button>
          </div>
          <div v-if="chipsCategoria.length > 1" class="flex flex-wrap items-center gap-2">
            <Tooltip title="Categoría">
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:layers" />
            </Tooltip>
            <button
              v-for="c in chipsCategoria"
              :key="c.id"
              :class="{ 'is-activo': filtroCategoria === c.id }"
              class="semfa-chip"
              type="button"
              @click="alternarCategoria(c.id)"
            >
              {{ c.nombre }}
              <span class="semfa-chip__total">{{ c.total }}</span>
            </button>
          </div>
        </div>

        <!-- Acciones en bloque sobre lo marcado -->
        <div
          v-if="seleccion.length > 0"
          class="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-sm"
        >
          <IconifyIcon class="size-4 text-primary" icon="lucide:list-checks" />
          <b>{{ seleccion.length }}</b> seleccionado(s)
          <Button v-if="filtrados.length > seleccion.length" size="small" type="link" @click="seleccionarFiltradas">
            Marcar los {{ filtrados.length }} filtrados
          </Button>
          <Button
            v-for="d in chipsDia.filter((c) => c.valor !== SIN_DIA)"
            :key="d.valor"
            :loading="asignando"
            class="semfa-btn semfa-btn--suave-primario"
            size="small"
            @click="asignar(d.valor)"
          >
            <IconifyIcon class="size-3.5" icon="lucide:calendar-check" />
            Pasar a Día {{ d.valor }}
          </Button>
          <Button :loading="asignando" class="semfa-btn semfa-btn--suave-peligro" size="small" @click="asignar(null)">
            <IconifyIcon class="size-3.5" icon="lucide:calendar-x" />
            Quitar día
          </Button>
          <Button class="ml-auto" size="small" type="link" @click="seleccion = []">Quitar selección</Button>
        </div>

        <Table
          :columns="columnas"
          :data-source="filtrados"
          :loading="cargando"
          :pagination="paginacion"
          :row-selection="seleccionFilas"
          :scroll="{ x: 1100 }"
          class="semfa-tabla"
          row-key="idInscripcion"
          size="small"
          @change="alCambiarTabla"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'orden'">
              <span v-if="record.orden !== null" class="tabular-nums font-medium">{{ record.orden }}</span>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'jornada'">
              <Tooltip v-if="record.jornada" :title="etiquetaJornada(actividad?.fecha, record.jornada)">
                <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Día {{ record.jornada }}
                </span>
              </Tooltip>
              <span v-else class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                Sin día
              </span>
            </template>
          </template>
        </Table>
      </Card>
    </div>
  </SemfaPagina>
</template>
