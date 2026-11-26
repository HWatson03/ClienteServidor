<script lang="ts" setup>
import type { PdfResultados, Resultados } from '#/api/resultados';

import { computed, provide, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Segmented, Switch, Tooltip, message } from 'ant-design-vue';

import { obtenerPdfResultados, obtenerResultados } from '#/api/resultados';
import SemfaEstadoEvaluacion from '#/components/semfa/semfa-estado-evaluacion.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { useDashboardSse } from '#/composables/useDashboardSse';

import type { FiltroJornada } from './compartido';

import { CONTEXTO_PDF, hayJornadas } from './compartido';
import RankingCarrera from './ranking-carrera.vue';
import RankingGlobal from './ranking-global.vue';
import TabActas from './tab-actas.vue';
import TabJurados from './tab-jurados.vue';
import TabProyecto from './tab-proyecto.vue';
import TabRanking from './tab-ranking.vue';

defineOptions({ name: 'SemfaReportes' });

/**
 * Resultados y reportes de la actividad de trabajo: ranking por categoría,
 * detalle por proyecto (rúbricas, criterios y jurados), cuadro consolidado y
 * planillas por jurado, cada uno con su PDF. Se actualiza en vivo cuando un
 * jurado guarda. La «Pantalla TV» abre la vista de transmisión, que solo
 * muestra el puntaje final.
 */

const router = useRouter();
const { actividad: actividadTrabajo, cargada, idActividad, nombreActividad, store } = useActividadTrabajo();

const datos = shallowRef<null | Resultados>(null);
const cargando = ref(false);
const actualizado = ref<Date>();

type Pestana = 'actas' | 'carrera' | 'jurados' | 'proyecto' | 'ranking';
const pestana = ref<Pestana>('proyecto');

/** Ranking por categoría (oficial) o cruzando categorías por porcentaje. */
type ModoRanking = 'carrera' | 'categoria' | 'facultad' | 'general';
const modoRanking = ref<ModoRanking>('categoria');
const jornada = ref<FiltroJornada>(0);
const idCategoria = ref<number>();

/** Con el membrete UAP de fondo; sin él, para imprimir en hoja membretada. */
const conMembrete = ref(true);

async function cargar(enVivo = false) {
  const id = idActividad.value;
  if (id === undefined) return;
  if (!enVivo) cargando.value = true;
  try {
    const nuevo = await obtenerResultados(id);
    if (id !== idActividad.value) return;
    const primera = datos.value === null;
    datos.value = nuevo;
    actualizado.value = new Date();
    // FEXCOIN: con carreras, los resultados se leen por carrera → categoría.
    if (primera) {
      const hayCarreras = nuevo.categorias.some((c) => c.proyectos.some((p) => p.carrera));
      if (hayCarreras) pestana.value = 'carrera';
      else if (pestana.value === 'carrera') pestana.value = 'proyecto';
    }
    if (!nuevo.categorias.some((c) => c.idCategoria === idCategoria.value)) {
      idCategoria.value = nuevo.categorias[0]?.idCategoria;
    }
  } catch {
    // El interceptor ya avisó.
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
    cargar();
  },
  { immediate: true },
);

const { conectado } = useDashboardSse(idActividad, () => cargar(true));

const categorias = computed(() => datos.value?.categorias ?? []);
const categoria = computed(() => categorias.value.find((c) => c.idCategoria === idCategoria.value));
const conJornadas = computed(() => hayJornadas(categorias.value));
const conCarreras = computed(() => categorias.value.some((c) => c.proyectos.some((p) => p.carrera)));
watch(conJornadas, (hay) => {
  if (!hay) jornada.value = 0;
});
/** Las pestañas que trabajan sobre una sola categoría muestran los chips de categoría. */
const porCategoria = computed(() => pestana.value === 'proyecto' || pestana.value === 'jurados'
  || (pestana.value === 'ranking' && modoRanking.value === 'categoria'));

// ------------------------------------------------------------------ PDF

const generando = ref<string>();

async function pedirPdf(clave: string, pdf: PdfResultados, nombre: string, abrir: boolean) {
  if (idActividad.value === undefined || generando.value) return;
  generando.value = clave;
  try {
    await obtenerPdfResultados(idActividad.value, pdf, { abrir, membrete: conMembrete.value, nombre });
  } catch {
    // El interceptor ya avisó.
  } finally {
    generando.value = undefined;
  }
}

provide(CONTEXTO_PDF, { generando, pedir: pedirPdf });

function abrirTv(modo?: 'ganadores') {
  const { href } = router.resolve({
    name: 'SemfaResultadosTv',
    query: modo ? { actividad: idActividad.value, modo } : { actividad: idActividad.value, categoria: idCategoria.value },
  });
  window.open(href, '_blank');
}

async function copiarEnlaceTv() {
  const { href } = router.resolve({
    name: 'SemfaResultadosTv',
    query: { actividad: idActividad.value, categoria: idCategoria.value },
  });
  await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
  message.success('Enlace público de TV copiado');
}
</script>

<template>
  <Page description="Ranking, informes por proyecto y planillas de jurados, con su PDF" title="Resultados y reportes">
    <Card :body-style="{ padding: '12px 16px' }" class="mb-3 rounded-xl">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconifyIcon class="size-5" icon="lucide:file-chart-column" />
          </span>
          <div class="min-w-0">
            <div class="text-xs text-muted-foreground">Actividad (cámbiela en la barra superior)</div>
            <div class="max-w-md truncate text-base font-semibold">{{ nombreActividad || 'Sin actividad elegida' }}</div>
          </div>
          <SemfaEstadoEvaluacion v-if="actividadTrabajo" :actividad="actividadTrabajo" />
          <Tooltip
            v-if="datos"
            :title="
              datos.oficial
                ? 'La evaluación está cerrada: los PDF salen sin la marca «PRELIMINAR».'
                : 'Mientras la evaluación no se cierre, los PDF llevan la marca «PRELIMINAR» y la TV lo indica.'
            "
          >
            <span :class="datos.oficial ? 'semfa-estado--ok' : 'semfa-estado--proceso'" class="semfa-estado">
              <IconifyIcon :icon="datos.oficial ? 'lucide:badge-check' : 'lucide:hourglass'" class="size-3.5" />
              {{ datos.oficial ? 'Resultados oficiales' : 'Resultados preliminares' }}
            </span>
          </Tooltip>
          <Tooltip :title="conectado ? 'Se actualiza cuando un jurado guarda' : 'Sin conexión en vivo: use «Actualizar»'">
            <span
              :class="conectado ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground'"
              class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              <span :class="conectado ? 'bg-emerald-500' : 'bg-slate-400'" class="size-2 rounded-full"></span>
              {{ conectado ? 'En vivo' : 'Sin conexión' }}
            </span>
          </Tooltip>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Tooltip title="Apágalo para imprimir en hoja ya membretada (deja el espacio en blanco)">
            <label class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch v-model:checked="conMembrete" size="small" />
              Membrete UAP
            </label>
          </Tooltip>
          <Button :disabled="idActividad === undefined" :loading="cargando" class="semfa-btn semfa-btn--neutro" @click="cargar()">
            <IconifyIcon v-if="!cargando" class="size-4" icon="lucide:refresh-cw" />
            Actualizar
          </Button>
          <Tooltip title="Pantalla fija por participante o ranking final por categoría">
            <Button :disabled="!datos" class="semfa-btn semfa-btn--primario" @click="abrirTv()">
              <IconifyIcon class="size-4" icon="lucide:tv" />
              Pantalla TV
            </Button>
          </Tooltip>
          <Tooltip title="Pantalla TV de ganadores: 1.º, 2.º y 3.º lugar de cada carrera y categoría, uno tras otro">
            <Button :disabled="!datos" class="semfa-btn semfa-btn--suave-primario" @click="abrirTv('ganadores')">
              <IconifyIcon class="size-4" icon="lucide:trophy" />
              TV ganadores
            </Button>
          </Tooltip>
          <Button :disabled="!datos" class="semfa-btn semfa-btn--neutro" @click="copiarEnlaceTv">
            <IconifyIcon class="size-4" icon="lucide:link" />
            Copiar enlace TV
          </Button>
        </div>
      </div>
      <div v-if="actualizado" class="mt-1 text-right text-[11px] text-muted-foreground">
        Actualizado {{ actualizado.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
      </div>
    </Card>

    <div
      v-if="cargada && store.actividades.length === 0"
      class="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"
    >
      <IconifyIcon class="size-10 opacity-60" icon="lucide:calendar-x" />
      No hay actividades registradas.
    </div>
    <div v-else-if="!datos && cargando" class="flex flex-col items-center gap-2 py-16 text-muted-foreground">
      <IconifyIcon class="size-8 animate-spin opacity-60" icon="lucide:loader-circle" />
      Calculando resultados…
    </div>
    <div v-else-if="datos && categorias.length === 0" class="flex flex-col items-center gap-2 py-16 text-muted-foreground">
      <IconifyIcon class="size-10 opacity-60" icon="lucide:tags" />
      Esta actividad no tiene categorías todavía.
    </div>

    <Card v-else-if="datos" :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <div class="flex flex-col gap-2.5 border-b border-border px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <Segmented
            v-model:value="pestana"
            :options="[
              ...(conCarreras ? [{ label: 'Por carrera', value: 'carrera' }] : []),
              { label: 'Ranking', value: 'ranking' },
              { label: 'Control de actas', value: 'actas' },
              { label: 'Por proyecto', value: 'proyecto' },
              { label: 'Jurados', value: 'jurados' },
            ]"
          />
          <Segmented
            v-if="pestana === 'ranking'"
            v-model:value="modoRanking"
            :options="[
              { label: 'Por categoría', value: 'categoria' },
              { label: 'General', value: 'general' },
              { label: 'Por facultad', value: 'facultad' },
              { label: 'Por carrera', value: 'carrera' },
            ]"
            size="small"
          />
          <Segmented
            v-if="conJornadas && (pestana === 'ranking' || pestana === 'actas' || pestana === 'carrera')"
            v-model:value="jornada"
            :options="[
              { label: 'Todas las jornadas', value: 0 },
              { label: 'Día 1', value: 1 },
              { label: 'Día 2', value: 2 },
            ]"
            size="small"
          />
        </div>
        <div v-if="porCategoria" class="flex flex-wrap gap-1.5">
          <button
            v-for="c in categorias"
            :key="c.idCategoria"
            :class="{ 'is-activo': c.idCategoria === idCategoria }"
            class="semfa-chip text-xs"
            type="button"
            @click="idCategoria = c.idCategoria"
          >
            <span
              :class="c.proyectos.length === 0 ? 'bg-slate-300' : c.completos === c.proyectos.length ? 'bg-emerald-500' : 'bg-amber-500'"
              class="size-2 shrink-0 rounded-full"
            ></span>
            {{ c.nombre }}
            <span class="tabular-nums opacity-70">{{ c.completos }}/{{ c.proyectos.length }}</span>
          </button>
        </div>
      </div>

      <RankingCarrera v-if="pestana === 'carrera'" @recargar="cargar(true)" :actividad="datos.actividad.nombre" :categorias="categorias" :jornada="jornada" />
      <TabActas v-else-if="pestana === 'actas'" :categorias="categorias" :jornada="jornada" />
      <RankingGlobal
        v-else-if="pestana === 'ranking' && modoRanking !== 'categoria'"
        :actividad="datos.actividad.nombre"
        :categorias="categorias"
        :jornada="jornada"
        :modo="modoRanking"
      />
      <template v-else-if="categoria">
        <TabRanking v-if="pestana === 'ranking'" @recargar="cargar(true)" :actividad="datos.actividad.nombre" :categoria="categoria" :jornada="jornada" />
        <TabProyecto v-else-if="pestana === 'proyecto'" :actividad-id="datos.actividad.idActividad" :categoria="categoria" />
        <TabJurados v-else :categoria="categoria" :jurados="datos.jurados" />
      </template>
    </Card>
  </Page>
</template>
