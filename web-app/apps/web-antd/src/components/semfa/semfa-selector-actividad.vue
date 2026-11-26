<script lang="ts" setup>
import { computed, onMounted } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Select } from 'ant-design-vue';

import { ROLES } from '#/api/core/auth';
import { useActividadTrabajoStore } from '#/store';
import { ESTADOS_EVALUACION } from '#/utils/estado-evaluacion';
import { formatearFecha, limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'SemfaSelectorActividad' });

/**
 * Selector de la actividad de trabajo en la barra superior de la administración.
 * Las pantallas de configuración (categorías, inscripciones, rúbricas, jurados…)
 * muestran y crean solo lo de la actividad elegida.
 */

const store = useActividadTrabajoStore();
const userStore = useUserStore();

const esAdmin = computed(() => userStore.userInfo?.roles?.includes(ROLES.ADMIN) ?? false);

const opciones = computed(() =>
  store.ordenadas.map((a) => ({
    estado: ESTADOS_EVALUACION[a.estadoEvaluacion] ?? ESTADOS_EVALUACION.ABIERTA,
    fecha: a.fecha ? formatearFecha(a.fecha) : '',
    label: limpiarEspacios(a.nombre),
    value: a.idActividad,
  })),
);

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.label).includes(normalizarTexto(entrada.trim()));
}

onMounted(() => {
  if (esAdmin.value) store.asegurar();
});
</script>

<template>
  <div v-if="esAdmin" class="semfa-actividad-trabajo ml-1 flex items-center gap-2">
    <span class="hidden items-center gap-1 text-xs font-medium text-muted-foreground xl:flex">
      <IconifyIcon class="size-4 text-primary" icon="lucide:calendar-check" />
      Actividad
    </span>
    <Select
      :filter-option="filtrar"
      :loading="store.cargando"
      :not-found-content="store.cargando ? undefined : 'No hay actividades: créelas en Actividad'"
      :options="opciones"
      :popup-match-select-width="false"
      :value="store.idActividad"
      class="semfa-actividad-trabajo__select w-40 sm:w-60 lg:w-72"
      placeholder="Elija la actividad"
      show-search
      @change="(v) => store.elegir(v as number)"
    >
      <template #option="{ label, fecha, estado }">
        <div class="flex min-w-60 items-center justify-between gap-3">
          <span class="flex min-w-0 items-center gap-2">
            <span :class="estado.punto" :title="`Evaluación: ${estado.texto}`" class="size-2 shrink-0 rounded-full"></span>
            <span class="truncate">{{ label }}</span>
          </span>
          <span v-if="fecha" class="shrink-0 text-xs text-muted-foreground">{{ fecha }}</span>
        </div>
      </template>
    </Select>
  </div>
</template>

<style scoped>
.semfa-actividad-trabajo__select :deep(.ant-select-selector) {
  font-weight: 500;
  background: hsl(var(--primary) / 8%) !important;
  border-color: hsl(var(--primary) / 35%) !important;
}
</style>
