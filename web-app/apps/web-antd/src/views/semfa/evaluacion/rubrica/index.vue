<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { CriterioNuevo } from './form-modal.vue';

import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Rubrica, RubricaForm } from '#/api/rubricas';
import type { RubricaCriterio, RubricaCriterioForm } from '#/api/rubricas-criterio';

import { computed, onMounted, ref, shallowRef, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Table, Tooltip } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import {
  actualizarRubrica,
  crearRubrica,
  eliminarRubrica,
  listarRubricas,
} from '#/api/rubricas';
import {
  actualizarRubricaCriterio,
  crearRubricaCriterio,
  eliminarRubricaCriterio,
  listarRubricasCriterio,
} from '#/api/rubricas-criterio';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, describirError, sinAvisosDeError } from '#/composables/useAvisos';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { formatearPuntos, resumenEscala } from '#/utils/escala';
import { limpiarEspacios, nombrePropio } from '#/utils/formato';

import CriterioFormModal from '../rubrica-criterio/form-modal.vue';
import RubricaFormModal from './form-modal.vue';

defineOptions({ name: 'SemfaRubrica' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof RubricaFormModal>>();
const rubricaSeleccionada = ref<null | Rubrica>(null);

/**
 * Criterios de todas las rúbricas: se muestran y editan debajo de cada una (esta
 * pantalla reemplaza a «Rúbrica criterio»).
 */
const crudCriterio = useCrud<RubricaCriterio, RubricaCriterioForm>({
  etiqueta: (p) => (p.nombre.length > 60 ? `${p.nombre.slice(0, 60)}…` : p.nombre),
  guardar: (payload) => {
    // El id viaja en la URL del PUT, no en el cuerpo.
    const { idRubricaCriterio, ...datos } = payload;
    return idRubricaCriterio === undefined
      ? crearRubricaCriterio(datos)
      : actualizarRubricaCriterio(idRubricaCriterio, datos);
  },
  idKey: 'idRubricaCriterio',
  listar: listarRubricasCriterio,
  nombre: 'Criterio',
  remover: eliminarRubricaCriterio,
});
const criterios = computed(() => crudCriterio.items.value);

const { deLaActividad, idActividad, nombreActividad } = useActividadTrabajo();

const crud = useCrud<Rubrica, RubricaForm>({
  etiqueta: (p) => p.nombre,
  guardar: (payload) => {
    // El id viaja en la URL del PUT, no en el cuerpo: `RubricaRequest` no lo expone.
    const { idRubrica, ...datos } = payload;
    return idRubrica === undefined ? crearRubrica(datos) : actualizarRubrica(idRubrica, datos);
  },
  idKey: 'idRubrica',
  listar: async () => {
    const [lista, , cats] = await Promise.all([
      listarRubricas(),
      crudCriterio.recargar().catch(() => undefined),
      listarCategoriasActividad().catch(() => [] as CategoriaActividad[]),
    ]);
    categorias.value = cats ?? [];
    actividadDeCategoria.value = new Map((cats ?? []).map((c) => [c.idCategoriaActividad, c.idActividad]));
    return lista;
  },
  nombre: 'Rúbrica',
  remover: eliminarRubrica,
});

// ---------------------------------------------------------------- filas y resumen

/** Actividad de cada categoría: una rúbrica de categoría es de la actividad de esa categoría. */
const actividadDeCategoria = shallowRef(new Map<number, null | number>());
const categorias = shallowRef<CategoriaActividad[]>([]);

/** Solo las rúbricas de la actividad de trabajo (de toda ella o de sus categorías). */
const filas = computed(() =>
  deLaActividad(crud.items.value, (r) =>
    r.idActividad ?? (r.idCategoriaActividad === null ? null : actividadDeCategoria.value.get(r.idCategoriaActividad)),
  ).map((r) => {
    const suyos = criterios.value.filter((c) => c.idRubrica === r.idRubrica);
    return {
      ...r,
      criterios: suyos.length,
      nombreLimpio: limpiarEspacios(r.nombre),
      peso: suyos.reduce((s, c) => s + (c.escala?.maximo ?? (Number(c.porcentaje) || 0)), 0),
      referencia: r.idActividad
        ? limpiarEspacios(r.nombreActividad)
        : nombrePropio(r.nombreCategoriaActividad),
    };
  }),
);

type Fila = (typeof filas.value)[number];

/**
 * Puntos con que se califica cada categoría: sus rúbricas propias más las de toda
 * la actividad. Lo normal es 100 (el jurado ve la nota sobre ese total).
 */
const pesoPorCategoria = computed(() => {
  const deActividad = filas.value.filter((f) => f.idActividad !== null).reduce((s, f) => s + f.peso, 0);
  const cats = deLaActividad(categorias.value, (c) => c.idActividad);
  if (cats.length === 0) {
    return filas.value.length > 0 ? [{ nombre: nombreActividad.value, peso: deActividad }] : [];
  }
  return cats
    .map((c) => ({
      nombre: nombrePropio(c.nombre),
      peso:
        deActividad +
        filas.value
          .filter((f) => f.idCategoriaActividad === c.idCategoriaActividad)
          .reduce((s, f) => s + f.peso, 0),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});

// ---------------------------------------------------------------- criterios

/** Rúbricas desplegadas: al entrar, todas (así se ven sus criterios). */
const expandidas = ref<number[]>([]);
let primeraCarga = true;
watch(filas, (lista) => {
  if (primeraCarga && lista.length > 0) {
    expandidas.value = lista.map((r) => r.idRubrica);
    primeraCarga = false;
  }
});

function alternarExpandida(idRubrica: number) {
  expandidas.value = expandidas.value.includes(idRubrica)
    ? expandidas.value.filter((id) => id !== idRubrica)
    : [...expandidas.value, idRubrica];
}

function criteriosDe(idRubrica: number) {
  return criterios.value.filter((c) => c.idRubrica === idRubrica);
}

const criterioAbierto = ref(false);
const criterioRef = ref<InstanceType<typeof CriterioFormModal>>();
const criterioSeleccionado = ref<null | RubricaCriterio>(null);
const rubricaDelNuevo = ref<number>();

function agregarCriterio(idRubrica: number) {
  criterioSeleccionado.value = null;
  rubricaDelNuevo.value = idRubrica;
  if (!expandidas.value.includes(idRubrica)) expandidas.value = [...expandidas.value, idRubrica];
  criterioAbierto.value = true;
}

function editarCriterio(c: RubricaCriterio) {
  criterioSeleccionado.value = c;
  rubricaDelNuevo.value = undefined;
  criterioAbierto.value = true;
}

async function alGuardarCriterio(payload: RubricaCriterioForm, continuar: boolean) {
  if (!(await crudCriterio.guardar(payload))) return;
  if (continuar) {
    criterioRef.value?.reiniciar();
  } else {
    criterioAbierto.value = false;
  }
}

function eliminarCriterio(c: RubricaCriterio) {
  crudCriterio.eliminar(c, limpiarEspacios(c.nombre));
}

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filas, { camposBusqueda: ['nombreLimpio', 'referencia', 'version'] });

function comparar(a: null | string, b: null | string) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (Tipo, Referencia, Nombre, Versión) más criterios, peso y uso. */
const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'nombreLimpio',
    key: 'nombre',
    sorter: (a, b) => comparar(a.nombreLimpio, b.nombreLimpio),
    title: 'Rúbrica',
  },
  {
    dataIndex: 'referencia',
    ellipsis: true,
    key: 'referencia',
    sorter: (a, b) => comparar(a.referencia, b.referencia),
    title: 'Se aplica a',
    width: 260,
  },
  { align: 'center', dataIndex: 'version', key: 'version', title: 'Versión', width: 90 },
  {
    align: 'center',
    dataIndex: 'criterios',
    key: 'criterios',
    sorter: (a, b) => a.criterios - b.criterios,
    title: 'Criterios',
    width: 130,
  },
  {
    align: 'center',
    dataIndex: 'peso',
    key: 'peso',
    sorter: (a, b) => a.peso - b.peso,
    title: 'Puntos',
    width: 90,
  },
  {
    align: 'center',
    dataIndex: 'evaluaciones',
    key: 'evaluaciones',
    sorter: (a, b) => a.evaluaciones - b.evaluaciones,
    title: 'Evaluaciones',
    width: 125,
  },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

// ---------------------------------------------------------------- acciones

function abrirRegistro() {
  rubricaSeleccionada.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(rubrica: Rubrica) {
  rubricaSeleccionada.value = rubrica;
  modalAbierto.value = true;
}

/**
 * Alta: crea la rúbrica y después sus criterios. Edición: guarda sus datos si
 * cambiaron y agrega los criterios nuevos. Un único aviso con el resultado.
 */
async function alGuardar(
  payload: RubricaForm,
  continuar: boolean,
  nuevos: CriterioNuevo[],
  cambioDatos: boolean,
) {
  const nombre = limpiarEspacios(payload.nombre);
  let idRubrica = payload.idRubrica;
  if (idRubrica === undefined) {
    crud.guardando.value = true;
    try {
      const { idRubrica: _sinId, ...datos } = payload;
      idRubrica = (await crearRubrica(datos)).idRubrica;
    } catch {
      crud.guardando.value = false;
      return; // El interceptor ya avisó.
    }
  } else if (cambioDatos && !(await crud.guardar(payload))) {
    return;
  }

  crud.guardando.value = true;
  const fallidos: string[] = [];
  try {
    await sinAvisosDeError(async () => {
      for (const c of nuevos) {
        try {
          await crearRubricaCriterio({ ...c, idRubrica });
        } catch (error) {
          const { mensaje, titulo } = describirError(error);
          fallidos.push(`${c.nombre}: ${mensaje || titulo}`);
        }
      }
    });
    await crud.recargar();
  } finally {
    crud.guardando.value = false;
  }
  if (!expandidas.value.includes(idRubrica)) expandidas.value = [...expandidas.value, idRubrica];

  const hechos = nuevos.length - fallidos.length;
  if (payload.idRubrica === undefined || nuevos.length > 0) {
    avisar({
      detalles: fallidos,
      mensaje:
        nuevos.length === 0
          ? 'Aún no tiene criterios: agréguelos para que el jurado la vea.'
          : fallidos.length === 0
            ? `Con ${hechos} criterio(s).`
            : `Se guardaron ${hechos} de ${nuevos.length} criterios.`,
      tipo: fallidos.length > 0 ? 'advertencia' : nuevos.length === 0 ? 'info' : 'exito',
      titulo: payload.idRubrica === undefined ? `Rúbrica «${nombre}» registrada` : `Criterios agregados a «${nombre}»`,
    });
  }
  if (continuar) {
    modalRef.value?.reiniciar();
  } else {
    modalAbierto.value = false;
  }
}

function eliminar(fila: Fila) {
  crud.eliminar(
    fila,
    fila.nombreLimpio,
    fila.criterios > 0
      ? `Sus ${fila.criterios} criterio(s) dejarán de usarse en las evaluaciones.`
      : undefined,
  );
}

onMounted(crud.recargar);
</script>

<template>
  <SemfaPagina description="Cada rúbrica con sus criterios: lo que califica el jurado" title="Rúbricas y criterios">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:clipboard-list" />
          Rúbricas de evaluación
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:clipboard-plus"
          placeholder="Buscar rúbrica o actividad…"
          texto-agregar="Agregar rúbrica"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        />
      </template>

      <!-- Puntos por categoría: la nota del jurado sale sobre este total -->
      <div
        v-if="pesoPorCategoria.length > 0"
        class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-sm"
      >
        <span class="text-muted-foreground">Se califica sobre:</span>
        <Tooltip
          v-for="a in pesoPorCategoria"
          :key="a.nombre"
          :title="
            a.peso === 100
              ? 'Sus rúbricas (las de la categoría y las de toda la actividad) suman 100 puntos'
              : 'Los puntos de los criterios que ve el jurado en esta categoría deberían sumar 100'
          "
        >
          <span
            :class="a.peso === 100 ? 'bg-green-600/10 text-green-600' : 'bg-amber-500/10 text-amber-600'"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
          >
            <IconifyIcon
              :icon="a.peso === 100 ? 'lucide:circle-check' : 'lucide:triangle-alert'"
              class="size-3.5"
            />
            {{ a.nombre }} · {{ a.peso }} pts
          </span>
        </Tooltip>
      </div>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 1040 }"
        class="semfa-tabla"
        v-model:expanded-row-keys="expandidas"
        row-key="idRubrica"
        size="small"
        @change="alCambiarTabla"
      >
        <!-- Criterios de la rúbrica: lo que califica el jurado, con su puntaje máximo -->
        <template #expandedRowRender="{ record }">
          <div class="semfa-criterios ml-6 overflow-hidden rounded-lg border border-border bg-card">
            <div class="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
              <IconifyIcon class="size-3.5 text-primary" icon="lucide:list-checks" />
              <span class="font-semibold uppercase tracking-wide text-muted-foreground">Criterios que califica el jurado</span>
              <span class="ml-auto text-muted-foreground">
                {{ criteriosDe(record.idRubrica).length }} criterio(s) ·
                <b class="text-foreground">{{ record.peso }} pts</b>
              </span>
            </div>

            <!-- Sin criterios: el jurado no la ve -->
            <div
              v-if="criteriosDe(record.idRubrica).length === 0"
              class="flex flex-wrap items-center gap-3 bg-amber-500/5 px-4 py-4"
            >
              <IconifyIcon class="size-6 text-amber-500" icon="lucide:list-plus" />
              <div class="min-w-0 flex-1 text-sm">
                <div class="font-medium">Aún no tiene criterios</div>
                <div class="text-xs text-muted-foreground">Los jurados no verán esta rúbrica hasta que tenga al menos uno.</div>
              </div>
              <Button class="semfa-btn semfa-btn--primario" size="small" @click="abrirEdicion(record as Rubrica)">
                <IconifyIcon class="size-3.5" icon="lucide:plus" />
                Agregar criterios
              </Button>
            </div>

            <div
              v-for="(c, n) in criteriosDe(record.idRubrica)"
              :key="c.idRubricaCriterio"
              class="group flex items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0 hover:bg-muted/40"
            >
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums text-muted-foreground">
                {{ n + 1 }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ limpiarEspacios(c.nombre) }}</div>
                <Tooltip :title="limpiarEspacios(c.descripcion)" placement="topLeft">
                  <div class="truncate text-xs text-muted-foreground">
                    {{ limpiarEspacios(c.descripcion) || 'Sin descripción (el jurado solo verá el nombre)' }}
                  </div>
                </Tooltip>
              </div>
              <span class="hidden shrink-0 text-xs text-muted-foreground lg:inline" title="Cómo lo califica el jurado">
                {{ resumenEscala(c.escala) }}
              </span>
              <span
                class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
                :title="resumenEscala(c.escala)"
              >
                {{ formatearPuntos(c.escala.maximo) }} pts
              </span>
              <span
                v-if="c.evaluaciones > 0"
                class="hidden shrink-0 text-xs text-green-600 md:inline"
                title="Ya calificado: solo se puede cambiar su texto"
              >
                <IconifyIcon class="inline size-3.5" icon="lucide:lock" /> {{ c.evaluaciones }}
              </span>
              <div class="flex shrink-0 gap-1 opacity-60 transition group-hover:opacity-100">
                <Button size="small" title="Editar criterio" type="text" @click="editarCriterio(c)">
                  <IconifyIcon class="size-4 text-primary" icon="lucide:pencil" />
                </Button>
                <Tooltip :title="c.evaluaciones > 0 ? 'Ya fue calificado: no se puede eliminar' : 'Eliminar criterio'">
                  <Button :disabled="c.evaluaciones > 0" size="small" type="text" @click="eliminarCriterio(c)">
                    <IconifyIcon class="size-4 text-red-500" icon="lucide:trash-2" />
                  </Button>
                </Tooltip>
              </div>
            </div>

            <Tooltip
              v-if="criteriosDe(record.idRubrica).length > 0"
              :title="record.evaluaciones > 0 ? 'Ya tiene evaluaciones: no admite criterios nuevos' : ''"
            >
              <button
                :disabled="record.evaluaciones > 0"
                class="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-border py-1.5 text-sm text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:text-muted-foreground"
                type="button"
                @click="agregarCriterio(record.idRubrica)"
              >
                <IconifyIcon class="size-4" icon="lucide:plus" />
                Agregar criterio
              </button>
            </Tooltip>
          </div>
        </template>

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
                <IconifyIcon class="size-3.5" icon="lucide:clipboard-list" />
              </span>
              <span class="truncate font-medium">{{ record.nombreLimpio }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'referencia'">
            <span class="inline-flex items-center gap-1.5 text-muted-foreground">
              <IconifyIcon
                :icon="record.idActividad ? 'lucide:calendar-days' : 'lucide:layers'"
                class="size-3.5 shrink-0"
              />
              <span class="truncate">
                {{ record.idActividad ? 'Toda la actividad · ' : '' }}{{ record.referencia || '—' }}
              </span>
            </span>
          </template>

          <template v-else-if="column.key === 'version'">
            <span class="font-mono text-xs">{{ limpiarEspacios(record.version) || '—' }}</span>
          </template>

          <template v-else-if="column.key === 'criterios'">
            <button
              :class="
                record.criterios === 0
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-primary/10 text-primary'
              "
              :title="expandidas.includes(record.idRubrica) ? 'Ocultar criterios' : 'Ver criterios'"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums transition hover:brightness-95"
              type="button"
              @click="alternarExpandida(record.idRubrica)"
            >
              {{ record.criterios === 0 ? 'Sin criterios' : record.criterios }}
              <IconifyIcon
                :icon="expandidas.includes(record.idRubrica) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                class="size-3.5"
              />
            </button>
          </template>

          <template v-else-if="column.key === 'peso'">
            <span class="font-medium tabular-nums">{{ record.peso }} pts</span>
          </template>

          <template v-else-if="column.key === 'evaluaciones'">
            <span
              :class="record.evaluaciones > 0 ? 'text-green-600' : 'text-muted-foreground'"
              class="tabular-nums"
            >
              {{ record.evaluaciones }}
            </span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Rubrica)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <!-- Con evaluaciones el backend no deja eliminarla (409) -->
              <Tooltip
                :title="
                  record.evaluaciones > 0
                    ? `Tiene ${record.evaluaciones} evaluaciones: sus puntajes siguen contando en los rankings`
                    : ''
                "
              >
                <Button
                  :disabled="record.evaluaciones > 0"
                  class="semfa-btn semfa-btn--suave-peligro"
                  size="small"
                  @click="eliminar(record as Fila)"
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
            <span v-else-if="busqueda.trim()">
              No se encontraron rúbricas para «{{ busqueda.trim() }}»
            </span>
            <span v-else>{{ nombreActividad }} aún no tiene rúbricas</span>
          </div>
        </template>
      </Table>
    </Card>

    <RubricaFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :criterios="crudCriterio.items.value"
      :guardando="crud.guardando.value"
      :rubrica="rubricaSeleccionada"
      :rubricas="crud.items.value"
      @guardar="alGuardar"
    />

    <CriterioFormModal
      ref="criterioRef"
      v-model:open="criterioAbierto"
      :criterio="criterioSeleccionado"
      :criterios="crudCriterio.items.value"
      :guardando="crudCriterio.guardando.value"
      :id-rubrica-inicial="rubricaDelNuevo"
      @guardar="alGuardarCriterio"
    />
  </SemfaPagina>
</template>
