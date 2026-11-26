<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { Actividad, ActividadForm } from '#/api/actividades';
import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { JuradoAsignacion } from '#/api/jurado-asignaciones';

import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import {
  actualizarActividad,
  crearActividad,
  eliminarActividad,
  listarActividades,
} from '#/api/actividades';
import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarJuradoAsignaciones } from '#/api/jurado-asignaciones';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaEstadoEvaluacion from '#/components/semfa/semfa-estado-evaluacion.vue';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { useActividadTrabajoStore } from '#/store';
import { diasHasta, fechaRelativa, formatearFecha, normalizarTexto } from '#/utils/formato';
import { rangoFechas } from '#/utils/jornadas';

import ActividadFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaActividad' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof ActividadFormModal>>();
const actividadSeleccionada = ref<Actividad | null>(null);

/** Para contar lo que depende de cada actividad (columnas y aviso al eliminar). */
const categorias = shallowRef<CategoriaActividad[]>([]);
const asignaciones = shallowRef<JuradoAsignacion[]>([]);

/** El selector de la barra superior sigue esta lista (altas, cambios y bajas). */
const trabajo = useActividadTrabajoStore();
const router = useRouter();

/** La deja como actividad de trabajo y abre su configuración (Mi actividad). */
function configurar(id: number) {
  trabajo.elegir(id);
  router.push('/semfa/actividad');
}

const crud = useCrud<Actividad, ActividadForm>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    // El id decide alta o edición y, en la edición, viaja en la URL del PUT.
    const { idActividad, ...data } = payload;
    return idActividad === undefined
      ? crearActividad(data)
      : actualizarActividad(idActividad, data);
  },
  idKey: 'idActividad',
  listar: async () => {
    const [lista, cats, asigs] = await Promise.all([
      listarActividades(),
      // Sin estos conteos la tabla sigue sirviendo.
      listarCategoriasActividad().catch(() => [] as CategoriaActividad[]),
      listarJuradoAsignaciones().catch(() => [] as JuradoAsignacion[]),
    ]);
    categorias.value = cats ?? [];
    asignaciones.value = asigs ?? [];
    return lista;
  },
  nombre: 'Actividad',
  remover: eliminarActividad,
});

watch(crud.items, (lista) => trabajo.sincronizar(lista));

/** Filas con sus conteos, para mostrarlos y ordenarlos. */
const filas = computed(() =>
  crud.items.value.map((a) => ({
    ...a,
    categorias: categorias.value.filter((c) => c.idActividad === a.idActividad).length,
    jurados: new Set(
      asignaciones.value
        .filter((j) => j.idActividad === a.idActividad)
        .map((j) => j.idJurado),
    ).size,
  })),
);

type Fila = (typeof filas.value)[number];

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filas, { camposBusqueda: ['nombre', 'tipo', 'descripcion'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Próxima, hoy o realizada, con el color correspondiente. */
function estadoFecha(fecha: null | string) {
  const dias = diasHasta(fecha);
  if (dias === null) {
    return { clase: 'text-muted-foreground', texto: 'Sin fecha' };
  }
  if (dias === 0) {
    return { clase: 'text-primary font-medium', texto: 'Hoy' };
  }
  return dias > 0
    ? { clase: 'text-green-600', texto: fechaRelativa(fecha) }
    : { clase: 'text-muted-foreground', texto: 'Realizada' };
}

/** Columnas de `tabla.html` (Nombre, Tipo, Descripción, Fecha) más lo que depende de ella. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombre',
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombre, b.nombre),
    title: 'Actividad',
  },
  {
    dataIndex: 'tipo',
    key: 'tipo',
    sorter: (a, b) => comparar(a.tipo, b.tipo),
    title: 'Tipo',
    width: 130,
  },
  {
    dataIndex: 'fecha',
    defaultSortOrder: 'descend',
    key: 'fecha',
    sorter: (a, b) => comparar(a.fecha, b.fecha),
    title: 'Fecha',
    width: 230,
  },
  {
    align: 'center',
    dataIndex: 'estadoEvaluacion',
    key: 'estadoEvaluacion',
    sorter: (a, b) => comparar(a.estadoEvaluacion, b.estadoEvaluacion),
    title: 'Evaluación',
    width: 160,
  },
  {
    align: 'center',
    dataIndex: 'categorias',
    key: 'categorias',
    sorter: (a, b) => a.categorias - b.categorias,
    title: 'Categorías',
    width: 110,
  },
  {
    align: 'center',
    dataIndex: 'jurados',
    key: 'jurados',
    sorter: (a, b) => a.jurados - b.jurados,
    title: 'Jurados',
    width: 100,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 360 },
];

/** El estado de evaluación cambió desde la tabla: sin recargar todo. */
function alCambiarEstado(nueva: Actividad) {
  crud.items.value = crud.items.value.map((a) => (a.idActividad === nueva.idActividad ? nueva : a));
}

function abrirRegistro() {
  actividadSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(actividad: Actividad) {
  actividadSeleccionada.value = actividad;
  modalAbierto.value = true;
}

async function alGuardar(payload: ActividadForm, continuar: boolean) {
  const esAlta = payload.idActividad === undefined;
  if (!(await crud.guardar(payload))) {
    return;
  }
  // Una actividad nueva pasa a ser la de trabajo: lo siguiente es configurarla.
  const nueva = esAlta
    ? crud.items.value.find((a) => normalizarTexto(a.nombre) === normalizarTexto(payload.nombre))
    : undefined;
  if (nueva) trabajo.elegir(nueva.idActividad);
  if (continuar) {
    modalRef.value?.reiniciar();
  } else {
    modalAbierto.value = false;
    if (nueva) configurar(nueva.idActividad);
  }
}

/** Avisa de lo que quedará huérfano: el backend solo marca la actividad. */
function eliminar(fila: Fila) {
  const partes = [
    fila.categorias > 0 &&
      `${fila.categorias} categoría${fila.categorias === 1 ? '' : 's'}`,
    fila.jurados > 0 && `${fila.jurados} jurado${fila.jurados === 1 ? '' : 's'} asignado${fila.jurados === 1 ? '' : 's'}`,
  ].filter(Boolean);
  crud.eliminar(
    fila,
    fila.nombre,
    partes.length > 0
      ? `Tiene ${partes.join(' y ')}, que dejarán de mostrarse con ella.`
      : undefined,
  );
}

onMounted(crud.recargar);
</script>

<template>
  <Page description="Concursos, ferias y festivales. «Configurar» abre todo lo de una actividad en Mi actividad." title="Actividades">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:trophy" />
          Concursos y ferias
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:calendar-plus"
          placeholder="Buscar por nombre, tipo o descripción…"
          texto-agregar="Agregar actividad"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 1180 }"
        class="semfa-tabla"
        row-key="idActividad"
        size="small"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'nombre'">
            <div class="flex items-center gap-2">
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              >
                <IconifyIcon class="size-3.5" icon="lucide:trophy" />
              </span>
              <Tooltip :title="record.descripcion" placement="topLeft">
                <span class="truncate font-medium">{{ record.nombre }}</span>
              </Tooltip>
              <span
                v-if="record.idActividad === trabajo.idActividad"
                class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                title="Es la actividad de trabajo (barra superior)"
              >
                En uso
              </span>
            </div>
          </template>

          <template v-else-if="column.key === 'tipo'">
            <span
              v-if="record.tipo"
              class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
            >
              {{ record.tipo }}
            </span>
            <span v-else class="text-muted-foreground">—</span>
          </template>

          <template v-else-if="column.key === 'fecha'">
            <div class="flex items-center gap-2">
              <Tooltip v-if="record.jornadas > 1" :title="`Del ${formatearFecha(record.fecha)} al ${formatearFecha(record.fechaFin)}`">
                <span class="whitespace-nowrap tabular-nums">
                  {{ rangoFechas(record.fecha, record.fechaFin) }} · {{ record.jornadas }} jornadas
                </span>
              </Tooltip>
              <span v-else class="tabular-nums">{{ formatearFecha(record.fecha) || '—' }}</span>
              <span :class="estadoFecha(record.fecha).clase" class="text-xs">
                {{ estadoFecha(record.fecha).texto }}
              </span>
            </div>
          </template>

          <template v-else-if="column.key === 'estadoEvaluacion'">
            <SemfaEstadoEvaluacion :actividad="record as Actividad" @cambiado="alCambiarEstado" />
          </template>

          <template v-else-if="column.key === 'categorias' || column.key === 'jurados'">
            <span
              :class="record[column.key] === 0 ? 'text-amber-600' : ''"
              class="tabular-nums"
            >
              {{ record[column.key] }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--primario"
                size="small"
                title="Categorías, participantes, rúbricas, jurados y orden"
                @click="configurar(record.idActividad)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:settings-2" />
                Configurar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Actividad)"
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
            <span v-if="busqueda.trim()">
              No se encontraron actividades para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay actividades registradas</span>
          </div>
        </template>
      </Table>
    </Card>

    <ActividadFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :actividad="actividadSeleccionada"
      :actividades="crud.items.value"
      :guardando="crud.guardando.value"
      @guardar="alGuardar"
    />
  </Page>
</template>
