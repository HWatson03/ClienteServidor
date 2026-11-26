<script lang="ts" setup>
import type { Paso } from './pasos';

import type { PasoActividad, ResumenActividad } from '#/api/actividades';

import { computed, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Tooltip } from 'ant-design-vue';

import { obtenerResumenActividad } from '#/api/actividades';
import SemfaEstadoEvaluacion from '#/components/semfa/semfa-estado-evaluacion.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { sinAvisosDeError } from '#/composables/useAvisos';
import { SEMFA_EMBEBIDO } from '#/composables/useEmbebido';
import { fechaRelativa, formatearFecha, limpiarEspacios } from '#/utils/formato';

import { PASOS } from './pasos';

defineOptions({ name: 'SemfaMiActividad' });

/**
 * Centro de la actividad: todo lo que se configura de una actividad en un solo
 * lugar, por pasos (Resumen → Categorías → Participantes → Rúbricas → Jurados →
 * Orden). La actividad es la elegida en la barra superior; el paso va en
 * `?paso=` para poder enlazarlo y volver con el navegador.
 */
provide(SEMFA_EMBEBIDO, true);

const route = useRoute();
const router = useRouter();
const { actividad, cargada, idActividad, store } = useActividadTrabajo();

/** «Jornadas» solo existe en actividades de varios días. */
const pasosVisibles = computed(() =>
  PASOS.filter((p) => !p.soloVariosDias || (actividad.value?.jornadas ?? 1) > 1),
);

const paso = computed<Paso>(() => {
  const q = String(route.query.paso ?? '');
  return pasosVisibles.value.some((p) => p.clave === q) ? (q as Paso) : 'resumen';
});
const pasoActual = computed(() => pasosVisibles.value.find((p) => p.clave === paso.value)!);

function ir(destino: Paso) {
  router.replace({ query: { ...route.query, paso: destino === 'resumen' ? undefined : destino } });
}

// ---------------------------------------------------------------- resumen

const resumen = ref<null | ResumenActividad>(null);
const cargandoResumen = ref(false);

/** Se relee al cambiar de actividad o de paso: así el avance de cada paso está al día. */
async function cargarResumen() {
  const id = idActividad.value;
  if (id === undefined) {
    resumen.value = null;
    return;
  }
  cargandoResumen.value = true;
  try {
    const r = await sinAvisosDeError(() => obtenerResumenActividad(id));
    if (id === idActividad.value) resumen.value = r;
  } catch {
    resumen.value = null;
  } finally {
    cargandoResumen.value = false;
  }
}

watch([idActividad, paso], cargarResumen, { immediate: true });

/** Insignia de cada paso: ✓, o cuántos pendientes (rojo) o avisos (ámbar) tiene. */
function marca(clave: Paso) {
  if (!resumen.value || clave === 'resumen' || clave === 'ubicacion') return null;
  // Sin categorías, los demás pasos aún no tienen nada que revisar.
  if (resumen.value.totales.categorias === 0 && clave !== 'categorias') return null;
  const suyos = resumen.value.avisos.filter((a) => a.paso === (clave as PasoActividad) && a.nivel !== 'INFO');
  const errores = suyos.filter((a) => a.nivel === 'ERROR').length;
  if (errores > 0) return { clase: 'bg-red-500 text-white', texto: String(errores), titulo: `${errores} pendiente(s)` };
  if (suyos.length > 0) return { clase: 'bg-amber-500 text-white', texto: String(suyos.length), titulo: `${suyos.length} aviso(s)` };
  return { clase: 'bg-emerald-500 text-white', texto: '✓', titulo: 'Listo' };
}

const datosActividad = computed(() => {
  const a = actividad.value;
  if (!a) return '';
  return [limpiarEspacios(a.tipo), a.fecha ? `${formatearFecha(a.fecha)} · ${fechaRelativa(a.fecha)}` : '']
    .filter(Boolean)
    .join(' · ');
});
</script>

<template>
  <Page>
    <!-- Sin actividades: el primer paso es crear una -->
    <Card v-if="cargada && store.actividades.length === 0" class="rounded-xl">
      <div class="flex flex-col items-center gap-3 py-10 text-center">
        <IconifyIcon class="size-12 text-primary" icon="lucide:trophy" />
        <div class="text-lg font-semibold">Aún no hay actividades</div>
        <p class="m-0 max-w-md text-muted-foreground">
          Cree un concurso, feria o festival. Después configure aquí sus categorías, participantes, rúbricas y jurados.
        </p>
        <Button class="semfa-btn semfa-btn--primario" @click="router.push('/semfa/actividades')">
          <IconifyIcon class="size-4" icon="lucide:calendar-plus" />
          Crear actividad
        </Button>
      </div>
    </Card>

    <template v-else>
      <!-- Cabecera: la actividad, su estado y los pasos -->
      <Card :body-style="{ padding: '14px 16px 0' }" class="mb-3 overflow-hidden rounded-xl">
        <div class="flex flex-wrap items-center gap-3">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconifyIcon class="size-6" icon="lucide:trophy" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-xs text-muted-foreground">Actividad (cámbiela en la barra superior)</div>
            <div class="truncate text-lg font-semibold leading-tight">
              {{ limpiarEspacios(actividad?.nombre) || 'Elija una actividad en la barra superior' }}
            </div>
            <div v-if="datosActividad" class="text-xs text-muted-foreground">{{ datosActividad }}</div>
          </div>
          <SemfaEstadoEvaluacion
            v-if="actividad"
            :actividad="actividad"
            :problemas="resumen?.avisos.filter((a) => a.nivel === 'ERROR').length ?? 0"
            grande
            @cambiado="cargarResumen"
          />
          <Button class="semfa-btn semfa-btn--neutro" @click="ir('ubicacion')">
            <IconifyIcon class="size-4" icon="lucide:map-pinned" />
            Acompañantes
          </Button>
          <Tooltip title="Avance en vivo de los jurados y reportes">
            <Button class="semfa-btn semfa-btn--neutro" @click="router.push('/semfa/admin')">
              <IconifyIcon class="size-4" icon="lucide:gauge" />
              Panel
            </Button>
          </Tooltip>
          <Tooltip title="Todas las actividades: crear, editar o cambiar de actividad">
            <Button class="semfa-btn semfa-btn--neutro" @click="router.push('/semfa/actividades')">
              <IconifyIcon class="size-4" icon="lucide:calendar-days" />
              Actividades
            </Button>
          </Tooltip>
        </div>

        <!-- Pasos -->
        <nav class="semfa-pasos -mx-4 mt-3 flex overflow-x-auto border-t border-border px-2">
          <button
            v-for="(p, n) in pasosVisibles"
            :key="p.clave"
            :class="paso === p.clave ? 'is-activo' : ''"
            :title="p.ayuda"
            class="semfa-pasos__item"
            type="button"
            @click="ir(p.clave)"
          >
            <span class="semfa-pasos__num">{{ n === 0 ? '' : n }}</span>
            <IconifyIcon :icon="p.icono" class="size-4" />
            <span>{{ p.titulo }}</span>
            <span
              v-if="marca(p.clave)"
              :class="marca(p.clave)!.clase"
              :title="marca(p.clave)!.titulo"
              class="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none"
            >
              {{ marca(p.clave)!.texto }}
            </span>
          </button>
        </nav>
      </Card>

      <p class="mb-3 mt-0 flex items-center gap-1.5 text-sm text-muted-foreground">
        <IconifyIcon :icon="pasoActual.icono" class="size-4" />
        {{ pasoActual.ayuda }}
      </p>

      <component
        :is="pasoActual.componente"
        :key="`${idActividad}-${paso}`"
        v-bind="paso === 'resumen' ? { cargando: cargandoResumen, resumen } : {}"
        @cambiado="cargarResumen"
        @ir="ir"
      />
    </template>
  </Page>
</template>

<style scoped>
.semfa-pasos__item {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  padding: 10px 14px 11px;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: color 0.15s;
}

.semfa-pasos__item:hover {
  color: hsl(var(--foreground));
}

.semfa-pasos__item.is-activo {
  font-weight: 600;
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}

.semfa-pasos__num {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.semfa-pasos__num:empty {
  display: none;
}
</style>
