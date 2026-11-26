<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Carrera, CarreraForm, Facultad } from '#/api/estructura';

import { computed, onMounted, ref, shallowRef, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarCarrera,
  crearCarrera,
  eliminarCarrera,
  listarCarreras,
  listarFacultades,
} from '#/api/estructura';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { nombrePropio } from '#/utils/formato';

import FacultadesModal from './facultades-modal.vue';
import CarreraFormModal from './form-modal.vue';
import ImportarModal from './importar-modal.vue';

defineOptions({ name: 'SemfaCarrera' });

/**
 * Estructura académica de la actividad de trabajo: sus carreras, cada una en su
 * facultad (catálogo global). Cada proyecto se afilia a una carrera al
 * registrarlo, y de ahí salen los rankings por carrera y por facultad.
 */
const { idActividad, nombreActividad } = useActividadTrabajo();

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof CarreraFormModal>>();
const carreraSeleccionada = ref<Carrera | null>(null);
const facultadesAbierto = ref(false);
const importarAbierto = ref(false);

const facultades = shallowRef<Facultad[]>([]);

const crud = useCrud<Carrera, CarreraForm>({
  etiqueta: (c) => nombrePropio(c.nombre),
  guardar: (payload) => {
    const { idCarrera, ...data } = payload;
    return idCarrera === undefined ? crearCarrera(data) : actualizarCarrera(idCarrera, data);
  },
  idKey: 'idCarrera',
  listar: async () => {
    const id = idActividad.value;
    const [lista, f] = await Promise.all([
      id === undefined ? Promise.resolve([] as Carrera[]) : listarCarreras(id),
      listarFacultades().catch(() => [] as Facultad[]),
    ]);
    facultades.value = f ?? [];
    return lista;
  },
  nombre: 'Carrera',
  remover: eliminarCarrera,
});

// ---------------------------------------------------------------- filas y filtro por facultad

const filas = computed(() =>
  crud.items.value.map((c) => ({
    ...c,
    facultadBonita: nombrePropio(c.facultad),
    nombreBonito: nombrePropio(c.nombre),
  })),
);

type Fila = (typeof filas.value)[number];

/** `-1` = sin facultad. */
const filtroFacultad = ref<number>();

const SIN_FACULTAD = -1;

const chipsFacultad = computed(() => {
  const conteo = new Map<number, { carreras: number; nombre: string; proyectos: number; sigla: string }>();
  for (const c of crud.items.value) {
    const id = c.idFacultad ?? SIN_FACULTAD;
    const actual = conteo.get(id) ?? {
      carreras: 0,
      nombre: c.facultad ? nombrePropio(c.facultad) : 'Sin facultad',
      proyectos: 0,
      sigla: c.siglaFacultad ?? '',
    };
    actual.carreras += 1;
    actual.proyectos += c.proyectos;
    conteo.set(id, actual);
  }
  return [...conteo.entries()]
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => Number(a.id === SIN_FACULTAD) - Number(b.id === SIN_FACULTAD) || a.nombre.localeCompare(b.nombre, 'es'));
});

/** Carreras de esta actividad por facultad: el modal de facultades no deja borrar las que tienen. */
const carrerasPorFacultad = computed(
  () => new Map(chipsFacultad.value.filter((c) => c.id !== SIN_FACULTAD).map((c) => [c.id, c.carreras])),
);

function alternarFacultad(id: number) {
  filtroFacultad.value = filtroFacultad.value === id ? undefined : id;
}

const filasFiltradas = computed(() =>
  filtroFacultad.value === undefined
    ? filas.value
    : filas.value.filter((f) => (f.idFacultad ?? SIN_FACULTAD) === filtroFacultad.value),
);

const totalProyectos = computed(() => crud.items.value.reduce((s, c) => s + c.proyectos, 0));

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } = useTablaLocal(filasFiltradas, {
  camposBusqueda: ['nombre', 'facultad', 'siglaFacultad'],
});

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 56 },
  {
    dataIndex: 'nombreBonito',
    defaultSortOrder: 'ascend',
    ellipsis: true,
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombre, b.nombre),
    title: 'Carrera',
  },
  {
    dataIndex: 'facultadBonita',
    ellipsis: true,
    key: 'facultad',
    sorter: (a, b) => comparar(a.facultad, b.facultad),
    title: 'Facultad',
    width: 320,
  },
  {
    align: 'center',
    dataIndex: 'proyectos',
    key: 'proyectos',
    sorter: (a, b) => a.proyectos - b.proyectos,
    title: 'Proyectos',
    width: 105,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 200 },
];

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  carreraSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(c: Carrera) {
  carreraSeleccionada.value = c;
  modalAbierto.value = true;
}

async function alGuardar(payload: CarreraForm, continuar: boolean) {
  if (!(await crud.guardar(payload))) {
    return;
  }
  if (continuar) {
    modalRef.value?.reiniciar();
  } else {
    modalAbierto.value = false;
  }
}

/** El backend rechaza (409) borrar una carrera con proyectos: se explica antes. */
function motivoNoEliminar(f: Fila) {
  return f.proyectos > 0 ? `Tiene ${f.proyectos} proyecto(s): cámbielos de carrera primero` : '';
}

onMounted(crud.recargar);
watch(idActividad, () => {
  filtroFacultad.value = undefined;
  crud.recargar();
});
</script>

<template>
  <SemfaPagina description="Facultades y carreras de la actividad (rankings por facultad y carrera)" title="Carreras">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:graduation-cap" />
          Carreras
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:plus"
          placeholder="Buscar carrera o facultad…"
          texto-agregar="Agregar carrera"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template #filtros>
            <Tooltip title="Pegar carreras desde Excel">
              <Button
                :disabled="idActividad === undefined"
                class="semfa-btn semfa-btn--suave-primario"
                @click="importarAbierto = true"
              >
                <IconifyIcon class="size-4" icon="lucide:file-spreadsheet" />
                <span class="hidden md:inline">Importar</span>
              </Button>
            </Tooltip>
            <Tooltip title="Catálogo de facultades">
              <Button class="semfa-btn semfa-btn--neutro" @click="facultadesAbierto = true">
                <IconifyIcon class="size-4" icon="lucide:landmark" />
                <span class="hidden md:inline">Facultades</span>
              </Button>
            </Tooltip>
          </template>
        </SemfaBarraCrud>
      </template>

      <!-- Una chip por facultad: filtra la tabla -->
      <div
        v-if="chipsFacultad.length > 0"
        class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5"
      >
        <button
          :class="{ 'is-activo': filtroFacultad === undefined }"
          class="semfa-chip"
          type="button"
          @click="filtroFacultad = undefined"
        >
          Todas
          <span class="semfa-chip__total">{{ crud.items.value.length }}</span>
        </button>
        <Tooltip
          v-for="c in chipsFacultad"
          :key="c.id"
          :title="`${c.nombre}: ${c.carreras} carrera(s), ${c.proyectos} proyecto(s)`"
        >
          <button
            :class="[{ 'is-activo': filtroFacultad === c.id }, c.id === SIN_FACULTAD ? 'text-amber-600' : '']"
            class="semfa-chip"
            type="button"
            @click="alternarFacultad(c.id)"
          >
            <IconifyIcon
              :icon="c.id === SIN_FACULTAD ? 'lucide:circle-help' : 'lucide:landmark'"
              class="size-3.5"
            />
            {{ c.sigla || c.nombre }}
            <span class="semfa-chip__total">{{ c.carreras }}</span>
          </button>
        </Tooltip>
        <span class="ml-auto text-xs text-muted-foreground">
          {{ totalProyectos }} proyecto(s) afiliados
        </span>
      </div>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 860 }"
        class="semfa-tabla"
        row-key="idCarrera"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">{{ numeroFila(index) }}</span>
          </template>

          <template v-else-if="column.key === 'nombre'">
            <div class="flex min-w-0 items-center gap-2">
              <span class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <IconifyIcon class="size-3.5" icon="lucide:graduation-cap" />
              </span>
              <Tooltip :title="record.nombre" placement="topLeft">
                <span class="truncate font-medium">{{ record.nombreBonito }}</span>
              </Tooltip>
            </div>
          </template>

          <template v-else-if="column.key === 'facultad'">
            <div v-if="record.facultad" class="flex min-w-0 items-center gap-1.5">
              <span
                v-if="record.siglaFacultad"
                class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {{ record.siglaFacultad }}
              </span>
              <Tooltip :title="record.facultadBonita" placement="topLeft">
                <span class="truncate text-muted-foreground">{{ record.facultadBonita }}</span>
              </Tooltip>
            </div>
            <span v-else class="text-amber-600">Sin facultad</span>
          </template>

          <template v-else-if="column.key === 'proyectos'">
            <span :class="record.proyectos === 0 ? 'text-amber-600' : ''" class="tabular-nums">
              {{ record.proyectos }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Carrera)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Tooltip :title="motivoNoEliminar(record as Fila)">
                <Button
                  :disabled="!!motivoNoEliminar(record as Fila)"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="crud.eliminar(record as Fila, record.nombreBonito)"
                >
                  <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
                  Eliminar
                </Button>
              </Tooltip>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            <span v-if="idActividad === undefined">Elija una actividad en la barra superior</span>
            <span v-else-if="busqueda.trim() || filtroFacultad !== undefined">No hay carreras con ese filtro</span>
            <template v-else>
              <span>{{ nombreActividad }} aún no tiene carreras</span>
              <span class="text-xs">
                Opcional: sin carreras, cada proyecto lleva su institución en texto. Para cargarlas rápido use
                «Importar».
              </span>
            </template>
          </div>
        </template>
      </Table>
    </Card>

    <CarreraFormModal
      ref="modalRef"
      v-model:facultades="facultades"
      v-model:open="modalAbierto"
      :carrera="carreraSeleccionada"
      :carreras="crud.items.value"
      :guardando="crud.guardando.value"
      :id-actividad="idActividad"
      :nombre-actividad="nombreActividad"
      @guardar="alGuardar"
    />

    <FacultadesModal
      v-model:facultades="facultades"
      v-model:open="facultadesAbierto"
      :carreras-por-facultad="carrerasPorFacultad"
      @cambiado="crud.recargar"
    />

    <ImportarModal
      v-model:open="importarAbierto"
      :carreras="crud.items.value"
      :facultades="facultades"
      :id-actividad="idActividad"
      :nombre-actividad="nombreActividad"
      @importado="crud.recargar"
    />
  </SemfaPagina>
</template>
