<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { DatosFeriaEditados, InscripcionNueva } from './tipos';

import type { Estudiante } from '#/api/estudiantes';
import type { Inscripcion } from '#/api/inscripciones';
import type { Participante, ParticipanteForm } from '#/api/participantes';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Select, Table, Tooltip } from 'ant-design-vue';

import { listarEstudiantes } from '#/api/estudiantes';
import { crearInscripcion, guardarDatosFeria, listarInscripciones } from '#/api/inscripciones';
import {
  actualizarParticipante,
  crearParticipante,
  eliminarParticipante,
  listarParticipantes,
} from '#/api/participantes';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar } from '#/composables/useAvisos';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { limpiarEspacios, nombrePropio } from '#/utils/formato';

import ParticipanteFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaParticipante' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof ParticipanteFormModal>>();
const participanteSeleccionado = ref<null | Participante>(null);

/** Para mostrar la inscripción y los estudiantes de cada proyecto. */
const inscripciones = shallowRef<Inscripcion[]>([]);
const estudiantes = shallowRef<Estudiante[]>([]);

/** Inscripción que acompaña al alta en curso (se crea tras el participante). */
let inscripcionPendiente: InscripcionNueva | null = null;
/** Jornada y stand editados de su inscripción en la actividad de trabajo. */
let feriaPendiente: DatosFeriaEditados | null = null;

const { idActividad, nombreActividad } = useActividadTrabajo();

const crud = useCrud<Participante, ParticipanteForm>({
  etiqueta: (p) => p.nombre,
  guardar: async (payload) => {
    const { idParticipante, ...data } = payload;
    if (idParticipante !== undefined) {
      const actualizado = await actualizarParticipante(idParticipante, data);
      if (feriaPendiente) {
        const { idInscripcion, jornada, stand } = feriaPendiente;
        await guardarDatosFeria([{ idInscripcion, jornada, stand }], ['jornada', 'stand']);
      }
      return actualizado;
    }
    const creado = await crearParticipante(data);
    if (inscripcionPendiente) {
      try {
        await crearInscripcion({ ...inscripcionPendiente, idParticipante: creado.idParticipante });
      } catch {
        // El proyecto ya existe: no se trata como fallo del guardado (reintentar
        // daría «nombre repetido»). El interceptor avisó el motivo.
        avisar({
          mensaje: 'Inscríbalo desde el módulo Inscripción.',
          tipo: 'advertencia',
          titulo: 'El proyecto se guardó sin inscripción',
        });
      }
    }
    return creado;
  },
  idKey: 'idParticipante',
  listar: async () => {
    const [lista, ins, est] = await Promise.all([
      listarParticipantes(),
      listarInscripciones().catch(() => [] as Inscripcion[]),
      listarEstudiantes().catch(() => [] as Estudiante[]),
    ]);
    inscripciones.value = ins ?? [];
    estudiantes.value = est ?? [];
    return lista;
  },
  nombre: 'Proyecto',
  remover: eliminarParticipante,
});

// ---------------------------------------------------------------- filas y filtro

/**
 * Los participantes son globales y se ligan a una actividad por su inscripción:
 * se muestran los inscritos en la actividad de trabajo y los que aún no tienen
 * ninguna (recién creados, listos para inscribir). «Otras actividades» muestra el
 * resto.
 */
const verOtras = ref(false);

const todasLasFilas = computed(() =>
  crud.items.value.map((p) => {
    const todas = inscripciones.value.filter((i) => i.idParticipante === p.idParticipante);
    const enEsta = todas.filter((i) => i.idActividad === idActividad.value);
    const suyas = verOtras.value ? todas : enEsta;
    return {
      deOtraActividad: enEsta.length === 0 && todas.length > 0,
      ...p,
      // Con carrera afiliada (FEXCOIN) se muestra esa; si no, la institución escrita.
      carrera: limpiarEspacios(p.carrera ?? p.institucion).toUpperCase(),
      estudiantes: estudiantes.value.filter((e) => e.idParticipante === p.idParticipante)
        .length,
      inscripcion: suyas.map((i) => nombrePropio(i.nombreCategoriaActividad)).join(', '),
      inscripciones: suyas,
      nombreLimpio: limpiarEspacios(p.nombre),
    };
  }),
);

const filas = computed(() =>
  verOtras.value ? todasLasFilas.value : todasLasFilas.value.filter((f) => !f.deOtraActividad),
);

/** Participantes inscritos solo en otras actividades (ocultos por defecto). */
const deOtras = computed(() => todasLasFilas.value.filter((f) => f.deOtraActividad).length);

type Fila = (typeof filas.value)[number];

const filtroCarrera = ref<string>();

const opcionesCarrera = computed(() => {
  const conteo = new Map<string, number>();
  for (const f of filas.value) {
    conteo.set(f.carrera, (conteo.get(f.carrera) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([value, total]) => ({ label: `${nombrePropio(value) || 'Sin carrera'} (${total})`, value }));
});

const filasFiltradas = computed(() =>
  filtroCarrera.value === undefined
    ? filas.value
    : filas.value.filter((f) => f.carrera === filtroCarrera.value),
);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filasFiltradas, {
    camposBusqueda: ['nombreLimpio', 'carrera', 'inscripcion', 'nombreTipo', 'nombreCategoria'],
  });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (Nombre, institución) más inscripción y estudiantes. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombreLimpio',
    ellipsis: true,
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombreLimpio, b.nombreLimpio),
    title: 'Proyecto',
  },
  {
    dataIndex: 'carrera',
    ellipsis: true,
    key: 'carrera',
    sorter: (a, b) => comparar(a.carrera, b.carrera),
    title: 'Carrera',
    width: 230,
  },
  {
    dataIndex: 'inscripcion',
    key: 'inscripcion',
    sorter: (a, b) => comparar(a.inscripcion, b.inscripcion),
    title: 'Inscrito en',
    width: 150,
  },
  {
    align: 'center',
    dataIndex: 'estudiantes',
    key: 'estudiantes',
    sorter: (a, b) => a.estudiantes - b.estudiantes,
    title: 'Estudiantes',
    width: 110,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

/** «Turismo Sostenible - Avanzado» → «Avanzado»: la carrera ya tiene su columna. */
function nivel(categoria: null | string) {
  const partes = nombrePropio(categoria).split(' - ');
  return partes.at(-1) ?? '';
}

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  participanteSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(participante: Participante) {
  participanteSeleccionado.value = participante;
  modalAbierto.value = true;
}

const inscripcionesDelSeleccionado = computed(() =>
  inscripciones.value.filter(
    (i) => i.idParticipante === participanteSeleccionado.value?.idParticipante,
  ),
);

async function alGuardar(
  payload: ParticipanteForm,
  inscripcion: InscripcionNueva | null,
  continuar: boolean,
  _equipo?: unknown,
  feria?: DatosFeriaEditados | null,
) {
  inscripcionPendiente = inscripcion;
  feriaPendiente = feria ?? null;
  const ok = await crud.guardar(payload);
  inscripcionPendiente = null;
  feriaPendiente = null;
  if (!ok) {
    return;
  }
  if (continuar) {
    modalRef.value?.reiniciar();
  } else {
    modalAbierto.value = false;
  }
}

/** Avisa de lo que depende del proyecto: el backend no lo propaga. */
function eliminar(fila: Fila) {
  const partes = [
    fila.estudiantes > 0 &&
      `${fila.estudiantes} estudiante${fila.estudiantes === 1 ? '' : 's'}`,
    fila.inscripciones.length > 0 &&
      `${fila.inscripciones.length} inscripción${fila.inscripciones.length === 1 ? '' : 'es'}`,
  ].filter(Boolean);
  crud.eliminar(
    fila,
    fila.nombreLimpio,
    partes.length > 0 ? `Tiene ${partes.join(' y ')}, que quedarán sin su proyecto.` : undefined,
  );
}

onMounted(crud.recargar);
</script>

<template>
  <Page description="Complementos / Participante" title="Participantes">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:folder-kanban" />
          Proyectos participantes
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:folder-plus"
          placeholder="Buscar proyecto, carrera o nivel…"
          texto-agregar="Agregar proyecto"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template #filtros>
            <button
              v-if="deOtras > 0"
              :class="{ 'is-activo': verOtras }"
              class="semfa-chip hidden shrink-0 whitespace-nowrap lg:inline-flex"
              title="Participantes inscritos solo en otras actividades"
              type="button"
              @click="verOtras = !verOtras"
            >
              Otras actividades
              <span class="tabular-nums opacity-75">{{ deOtras }}</span>
            </button>
            <Select
              v-model:value="filtroCarrera"
              :options="opcionesCarrera"
              allow-clear
              class="hidden w-60 lg:block"
              placeholder="Todas las carreras"
            />
          </template>
        </SemfaBarraCrud>
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 1000 }"
        class="semfa-tabla"
        row-key="idParticipante"
        size="middle"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'nombre'">
            <Tooltip :title="record.nombreLimpio" placement="topLeft">
              <span class="font-medium">{{ record.nombreLimpio }}</span>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'carrera'">
            <Tooltip :title="record.facultad ? `${nombrePropio(record.carrera)} · ${nombrePropio(record.facultad)}` : record.carrera" placement="topLeft">
              <div class="flex min-w-0 items-center gap-1.5">
                <span
                  v-if="record.siglaFacultad"
                  class="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                >
                  {{ record.siglaFacultad }}
                </span>
                <span class="truncate text-muted-foreground">{{ nombrePropio(record.carrera) || '—' }}</span>
              </div>
            </Tooltip>
          </template>

          <template v-else-if="column.key === 'inscripcion'">
            <Tooltip
              v-if="record.inscripciones.length > 0"
              :title="
                record.inscripciones
                  .map(
                    (i: Inscripcion) =>
                      `${nombrePropio(i.nombreCategoriaActividad)} · ${limpiarEspacios(i.nombreActividad)}`,
                  )
                  .join('\n')
              "
            >
              <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {{ nivel(record.inscripciones[0].nombreCategoriaActividad) }}
                <template v-if="record.inscripciones.length > 1">
                  +{{ record.inscripciones.length - 1 }}
                </template>
              </span>
            </Tooltip>
            <span v-else class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">
              Sin inscribir
            </span>
          </template>

          <template v-else-if="column.key === 'estudiantes'">
            <span
              :class="record.estudiantes === 0 ? 'text-amber-600' : ''"
              class="tabular-nums"
            >
              {{ record.estudiantes }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Participante)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
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
            <span v-if="busqueda.trim() || filtroCarrera !== undefined">
              No hay proyectos con ese filtro
            </span>
            <span v-else>Aún no hay proyectos registrados</span>
          </div>
        </template>
      </Table>
    </Card>

    <ParticipanteFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :inscripciones="inscripcionesDelSeleccionado"
      :participante="participanteSeleccionado"
      :participantes="crud.items.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
