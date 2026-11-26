<script lang="ts" setup>
import type {
  ActividadJurado,
  CategoriaJurado,
  InscripcionPendiente,
  RubricaJurado,
} from '#/api/jurado';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Button, Card, Empty, InputNumber, message, Modal, Select, Tag } from 'ant-design-vue';

import {
  categoriasDeActividad,
  evaluarParticipante,
  inscripcionesPendientes,
  listarActividadesJurado,
  rubricaDeActividad,
} from '#/api/jurado';

defineOptions({ name: 'SemfaJuradoPanel' });

const actividades = ref<ActividadJurado[]>([]);
const actividadId = ref<number | undefined>(undefined);
const categorias = ref<CategoriaJurado[]>([]);
const categoriaFiltro = ref<number | undefined>(undefined);
const pendientes = ref<InscripcionPendiente[]>([]);
const rubrica = ref<null | RubricaJurado>(null);
const cargando = ref(false);

const evaluando = ref<InscripcionPendiente | null>(null);
const puntajes = ref<Record<number, number>>({});
const guardando = ref(false);
const modalAbierto = ref(false);

const actividadActual = computed(
  () => actividades.value.find((a) => a.id === actividadId.value) ?? null,
);

/**
 * El backend considera la rúbrica "de escala" si algún criterio tiene
 * `maxPuntos`: en ese caso acepta exactamente UN detalle (el puntaje directo).
 * En caso contrario suma porcentajes y cada criterio va de 0 a 100.
 */
const esEscala = computed(
  () => (escalaCriterios.value.length > 0
    ? true
    : (rubrica.value?.criterios ?? []).length === 1),
);

const escalaCriterios = computed(
  () => (rubrica.value?.criterios ?? []).filter((c) => c.maxPuntos != null),
);

const pendientesFiltradas = computed(() =>
  categoriaFiltro.value == null
    ? pendientes.value
    : pendientes.value.filter((p) => p.categoriaId === categoriaFiltro.value),
);

async function cargarActividades() {
  cargando.value = true;
  try {
    actividades.value = await listarActividadesJurado();
    const primera = actividades.value[0];
    if (primera) {
      await elegirActividad(primera.id);
    }
  } finally {
    cargando.value = false;
  }
}

async function elegirActividad(id: number) {
  actividadId.value = id;
  categoriaFiltro.value = undefined;
  const [cats, pend, rub] = await Promise.all([
    categoriasDeActividad(id),
    inscripcionesPendientes(id),
    rubricaDeActividad(id),
  ]);
  categorias.value = cats;
  pendientes.value = pend;
  rubrica.value = rub;
}

async function recargarPendientes() {
  if (actividadId.value == null) {
    return;
  }
  pendientes.value = await inscripcionesPendientes(
    actividadId.value,
    categoriaFiltro.value ?? undefined,
  );
}

function abrirEvaluacion(inscripcion: InscripcionPendiente) {
  evaluando.value = inscripcion;
  const valores: Record<number, number> = {};
  for (const criterio of rubrica.value?.criterios ?? []) {
    valores[criterio.id] = 0;
  }
  puntajes.value = valores;
  modalAbierto.value = true;
}

function puntajeCriterio(criterioId: number): number {
  return puntajes.value[criterioId] ?? 0;
}

function pesoCriterio(valor: number, porcentaje: null | number): number {
  return valor * ((porcentaje ?? 100) / 100);
}

const totalEsperado = computed(() => {
  if (!esEscala.value) {
    return (rubrica.value?.criterios ?? []).reduce(
      (acc, c) => acc + pesoCriterio(puntajeCriterio(c.id), c.porcentaje),
      0,
    );
  }
  return escalaCriterios.value.reduce(
    (acc, c) => acc + puntajeCriterio(c.id),
    0,
  );
});

async function guardarEvaluacion() {
  if (!evaluando.value || !actividadId.value || !rubrica.value) {
    return;
  }

  let detalles: { criterioId: number; puntaje: number }[];
  if (esEscala.value) {
    // Escala: exactamente un criterio con puntaje > 0.
    const elegidos = rubrica.value.criterios
      .map((c) => ({ criterioId: c.id, puntaje: puntajeCriterio(c.id) }))
      .filter((d) => d.puntaje > 0);
    if (elegidos.length !== 1) {
      message.warning('La rúbrica de escala requiere seleccionar un único criterio.');
      return;
    }
    detalles = elegidos;
  } else {
    const criteriosVacios = rubrica.value.criterios.filter(
      (c) => puntajeCriterio(c.id) < 0 || puntajeCriterio(c.id) > 100,
    );
    if (criteriosVacios.length > 0) {
      message.warning('Cada criterio debe tener un puntaje entre 0 y 100.');
      return;
    }
    detalles = rubrica.value.criterios.map((c) => ({
      criterioId: c.id,
      puntaje: puntajeCriterio(c.id),
    }));
  }

  guardando.value = true;
  try {
    await evaluarParticipante({
      actividadId: actividadId.value,
      detalles,
      inscripcionId: evaluando.value.id,
      rubricaId: rubrica.value.id,
    });
    message.success('Evaluación guardada correctamente.');
    evaluando.value = null;
    modalAbierto.value = false;
    await recargarPendientes();
  } finally {
    guardando.value = false;
  }
}

onMounted(cargarActividades);
</script>

<template>
  <Page description="Evalúa los proyectos pendientes de esta actividad." title="Evaluación por actividad">
    <div class="flex flex-col gap-4">
      <Card>
        <div class="flex flex-wrap items-center gap-4">
          <div class="text-sm opacity-70">Actividad</div>
          <Select
            v-model:value="actividadId"
            class="min-w-56"
            :options="actividades.map((a) => ({ label: a.nombre, value: a.id }))"
            placeholder="Selecciona una actividad"
            @change="(valor: unknown) => elegirActividad(Number(valor))"
          />
        </div>
      </Card>

      <div v-if="actividadActual" class="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card class="lg:col-span-1">
          <template #title>Filtro por categoría</template>
          <div class="flex flex-wrap gap-2">
            <Tag
              class="cursor-pointer"
              :color="categoriaFiltro === undefined ? 'blue' : 'default'"
              @click="categoriaFiltro = undefined"
            >
              Todas
            </Tag>
            <Tag
              v-for="categoria in categorias"
              :key="categoria.id"
              class="cursor-pointer"
              :color="categoriaFiltro === categoria.id ? 'blue' : 'default'"
              @click="categoriaFiltro = categoria.id"
            >
              {{ categoria.nombre }}
            </Tag>
          </div>
        </Card>

        <Card class="lg:col-span-3">
          <template #title>
            Pendientes ({{ pendientesFiltradas.length }})
          </template>
          <Empty v-if="pendientesFiltradas.length === 0" description="Sin proyectos pendientes" />
          <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card
              v-for="inscripcion in pendientesFiltradas"
              :key="inscripcion.id"
              hoverable
              size="small"
            >
              <div class="flex flex-col gap-2">
                <div class="font-medium">{{ inscripcion.participanteNombre }}</div>
                <div class="text-sm opacity-70">{{ inscripcion.institucion }}</div>
                <Tag v-if="inscripcion.categoriaNombre" color="geekblue">
                  {{ inscripcion.categoriaNombre }}
                </Tag>
                <Button type="primary" @click="abrirEvaluacion(inscripcion)">
                  Evaluar
                </Button>
              </div>
            </Card>
          </div>
        </Card>
      </div>

      <Empty v-else-if="!cargando" description="No tienes actividades asignadas" />
    </div>

    <Modal
      v-model:open="modalAbierto"
      :title="`Evaluar: ${evaluando?.participanteNombre ?? ''}`"
      :footer="null"
      width="640"
    >
      <template v-if="rubrica && evaluando">
        <div class="mb-3">
          <span class="text-sm opacity-70">Rúbrica:</span>
          <span class="ml-1 font-medium">{{ rubrica.nombre }}</span>
        </div>

        <div v-for="criterio in rubrica.criterios" :key="criterio.id" class="mb-4">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-medium">{{ criterio.nombre }}</span>
            <span v-if="criterio.porcentaje != null" class="text-xs opacity-60">
              {{ criterio.porcentaje }}%
            </span>
          </div>
          <p v-if="criterio.descripcion" class="text-xs opacity-60">
            {{ criterio.descripcion }}
          </p>
          <InputNumber
            v-model:value="puntajes[criterio.id]"
            :max="criterio.maxPuntos ?? 100"
            :min="0"
            class="mt-2 w-full"
            :precision="2"
          />
        </div>

        <div class="mb-4 flex items-center justify-between rounded bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
          <span class="text-sm">Total ponderado</span>
          <span class="text-lg font-semibold">
            {{ totalEsperado.toFixed(2) }}
          </span>
        </div>

        <div class="flex justify-end gap-2">
          <Button @click="evaluando = null; modalAbierto = false">
            Cancelar
          </Button>
          <Button type="primary" :loading="guardando" @click="guardarEvaluacion">
            Guardar evaluación
          </Button>
        </div>
      </template>
    </Modal>
  </Page>
</template>