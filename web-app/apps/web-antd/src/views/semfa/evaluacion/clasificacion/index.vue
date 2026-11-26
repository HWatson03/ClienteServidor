<script lang="ts" setup>
import type {
  NivelClasificacion,
  ProyectoClasificacion,
} from '#/api/clasificacion';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Empty, Input, Spin, Tooltip } from 'ant-design-vue';

import {
  guardarClasificacion,
  listarDatosClasificacion,
} from '#/api/clasificacion';
import { avisar, confirmar } from '#/composables/useAvisos';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'SemfaClasificacion' });

const NIVELES: { etiqueta: string; valor: NivelClasificacion }[] = [
  { etiqueta: 'Básico', valor: 'BASICO' },
  { etiqueta: 'Avanzado', valor: 'AVANZADO' },
];

function etiquetaNivel(nivel: NivelClasificacion | null | undefined) {
  return NIVELES.find((n) => n.valor === nivel)?.etiqueta ?? 'Sin clasificar';
}

/** Proyectos tal como los devolvió el backend (el nivel guardado). */
const proyectos = ref<ProyectoClasificacion[]>([]);
const carreras = ref<string[]>([]);

const cargando = ref(false);
const guardando = ref(false);

const filtroCarrera = ref<string>();
const busqueda = ref('');

/**
 * `participanteId` → nivel marcado en esta sesión, solo si difiere del guardado.
 *
 * El legacy mandaba *todas* las selecciones en cada guardado, así que su contador
 * de «guardados» no significaba nada. Aquí solo viajan los cambios.
 */
const cambios = ref<Record<number, NivelClasificacion>>({});

function nivelDe(p: ProyectoClasificacion) {
  return cambios.value[p.participanteId] ?? p.nivel;
}

const listaCambios = computed(() =>
  proyectos.value.filter((p) => cambios.value[p.participanteId] !== undefined),
);

/** Cambios que archivarán evaluaciones (proyectos ya evaluados). */
const cambiosEvaluados = computed(() => listaCambios.value.filter((p) => p.evaluaciones > 0));

// ---------------------------------------------------------------- resumen y filtros

const resumen = computed(() => {
  const r = { avanzado: 0, basico: 0, sinClasificar: 0 };
  for (const p of proyectos.value) {
    const nivel = nivelDe(p);
    if (nivel === 'BASICO') r.basico += 1;
    else if (nivel === 'AVANZADO') r.avanzado += 1;
    else r.sinClasificar += 1;
  }
  return r;
});

function clave(carrera: null | string | undefined) {
  return normalizarTexto(limpiarEspacios(carrera));
}

const chipsCarrera = computed(() =>
  carreras.value.map((c) => ({
    total: proyectos.value.filter((p) => clave(p.carrera) === clave(c)).length,
    valor: c,
  })),
);

interface Grupo {
  avanzado: number;
  basico: number;
  carrera: string;
  proyectos: ProyectoClasificacion[];
  sinClasificar: number;
}

/** Agrupa por carrera, como el legacy, para no repetir la carrera en cada fila. */
const grupos = computed<Grupo[]>(() => {
  const termino = normalizarTexto(busqueda.value.trim());
  const mapa = new Map<string, ProyectoClasificacion[]>();
  for (const p of proyectos.value) {
    if (filtroCarrera.value && clave(p.carrera) !== clave(filtroCarrera.value)) continue;
    if (termino && !normalizarTexto(p.nombre).includes(termino)) continue;
    const c = limpiarEspacios(p.carrera) || '—';
    mapa.set(c, [...(mapa.get(c) ?? []), p]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([carrera, lista]) => ({
      avanzado: lista.filter((p) => nivelDe(p) === 'AVANZADO').length,
      basico: lista.filter((p) => nivelDe(p) === 'BASICO').length,
      carrera,
      proyectos: lista,
      sinClasificar: lista.filter((p) => !nivelDe(p)).length,
    }));
});

// ---------------------------------------------------------------- marcar

function marcar(p: ProyectoClasificacion, nivel: NivelClasificacion) {
  const siguiente = { ...cambios.value };
  if (nivel === p.nivel) {
    delete siguiente[p.participanteId];
  } else {
    siguiente[p.participanteId] = nivel;
  }
  cambios.value = siguiente;
}

/** Clasificación inicial rápida: los sin nivel de una carrera, de una vez. */
function marcarSinClasificar(grupo: Grupo, nivel: NivelClasificacion) {
  for (const p of grupo.proyectos) {
    if (!nivelDe(p) && p.carreraValida) {
      marcar(p, nivel);
    }
  }
}

function descartar() {
  cambios.value = {};
}

// ---------------------------------------------------------------- carga y guardado

async function cargar() {
  cargando.value = true;
  try {
    const datos = (await listarDatosClasificacion()) ?? { carreras: [], proyectos: [] };
    proyectos.value = datos.proyectos ?? [];
    carreras.value = datos.carreras ?? [];
    cambios.value = {};
  } finally {
    cargando.value = false;
  }
}

/**
 * Cambiar de nivel un proyecto evaluado lo traslada: sus evaluaciones se dieron
 * con otra rúbrica y frente a otros proyectos, así que se archivan. Se pide
 * confirmación expresa antes de mandar `archivarEvaluadas`.
 */
async function guardar() {
  if (listaCambios.value.length === 0 || guardando.value) {
    return;
  }
  let archivar = false;
  if (cambiosEvaluados.value.length > 0) {
    const total = cambiosEvaluados.value.reduce((s, p) => s + p.evaluaciones, 0);
    archivar = await confirmar({
      mensaje: `${cambiosEvaluados.value.length} proyecto(s) ya evaluados cambian de nivel: se archivarán sus ${total} evaluaciones y deberán ser evaluados de nuevo en su nueva categoría.`,
      peligro: true,
      textoAceptar: 'Cambiar y archivar',
      textoCancelar: 'Revisar',
      titulo: '¿Cambiar el nivel de proyectos evaluados?',
    });
    if (!archivar) {
      return;
    }
  }

  guardando.value = true;
  try {
    const r = await guardarClasificacion({
      archivarEvaluadas: archivar,
      items: listaCambios.value.map((p) => ({
        nivel: cambios.value[p.participanteId]!,
        participanteId: p.participanteId,
      })),
    });
    const hechos = r.guardados + r.trasladados;
    const detalles = [
      r.trasladados > 0 &&
        `${r.trasladados} evaluado(s) trasladado(s): ${r.evaluacionesArchivadas} evaluación(es) archivada(s).`,
      r.omitidos > 0 && `${r.omitidos} omitido(s): sin inscripción activa o con carrera no reconocida.`,
      r.requierenConfirmacion.length > 0 &&
        `${r.requierenConfirmacion.length} evaluado(s) sin cambiar por falta de confirmación.`,
    ].filter(Boolean) as string[];
    avisar({
      detalles,
      mensaje:
        hechos === 1 ? 'Un proyecto cambió de nivel.' : `${hechos} proyectos cambiaron de nivel.`,
      tipo: hechos === listaCambios.value.length ? 'exito' : 'advertencia',
      titulo: hechos === listaCambios.value.length ? 'Clasificación guardada' : 'Clasificación parcial',
    });
    // Se recarga para leer el estado real de la BD.
    await cargar();
  } catch {
    // El interceptor de errores ya avisó; se conservan los cambios en pantalla.
  } finally {
    guardando.value = false;
  }
}

/** Ctrl/⌘+S guarda. */
function alPulsarTecla(evento: KeyboardEvent) {
  if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
    evento.preventDefault();
    guardar();
  }
}

onMounted(() => {
  cargar();
  window.addEventListener('keydown', alPulsarTecla);
});
onBeforeUnmount(() => window.removeEventListener('keydown', alPulsarTecla));
</script>

<template>
  <Page description="Evaluación / Clasificar proyectos" title="Clasificar proyectos">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:signal" />
          Nivel de cada proyecto
          <span
            v-if="listaCambios.length > 0"
            class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
          >
            {{ listaCambios.length }} sin guardar
          </span>
        </div>
      </template>

      <template #extra>
        <div class="flex items-center gap-2">
          <Input
            v-model:value="busqueda"
            allow-clear
            class="w-44 sm:w-64"
            placeholder="Buscar proyecto…"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
            </template>
          </Input>
          <Button
            v-if="listaCambios.length > 0"
            :disabled="guardando"
            class="semfa-btn semfa-btn--neutro"
            @click="descartar"
          >
            Descartar
          </Button>
          <Tooltip title="Ctrl + S">
            <Button
              :disabled="listaCambios.length === 0"
              :loading="guardando"
              class="semfa-btn semfa-btn--primario"
              @click="guardar"
            >
              <IconifyIcon v-if="!guardando" class="size-4" icon="lucide:save" />
              Guardar
              <template v-if="listaCambios.length > 0">({{ listaCambios.length }})</template>
            </Button>
          </Tooltip>
        </div>
      </template>

      <!-- Resumen y filtro por carrera -->
      <div class="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-primary"></span>
            Básico <b class="tabular-nums">{{ resumen.basico }}</b>
          </span>
          <span class="flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-violet-500"></span>
            Avanzado <b class="tabular-nums">{{ resumen.avanzado }}</b>
          </span>
          <span
            :class="resumen.sinClasificar > 0 ? 'text-amber-600' : 'text-muted-foreground'"
            class="flex items-center gap-1.5"
          >
            <span class="size-2 rounded-full bg-amber-500"></span>
            Sin clasificar <b class="tabular-nums">{{ resumen.sinClasificar }}</b>
          </span>
          <span class="text-xs text-muted-foreground">
            Básico: 1.º–5.º semestre · Avanzado: 7.º–9.º semestre
          </span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            :class="{ 'is-activo': !filtroCarrera }"
            class="semfa-chip"
            type="button"
            @click="filtroCarrera = undefined"
          >
            Todas
            <span class="semfa-chip__total">{{ proyectos.length }}</span>
          </button>
          <button
            v-for="c in chipsCarrera"
            :key="c.valor"
            :class="{ 'is-activo': filtroCarrera === c.valor }"
            class="semfa-chip"
            type="button"
            @click="filtroCarrera = c.valor"
          >
            {{ nombrePropio(c.valor) }}
            <span class="semfa-chip__total">{{ c.total }}</span>
          </button>
        </div>
      </div>

      <Spin :spinning="cargando">
        <Empty
          v-if="!cargando && grupos.length === 0"
          class="py-10"
          description="Sin proyectos para mostrar."
        />

        <section v-for="grupo in grupos" :key="grupo.carrera">
          <!-- Cabecera de carrera -->
          <div
            class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-2 backdrop-blur"
          >
            <div class="flex items-center gap-2 font-semibold">
              <IconifyIcon class="size-4 text-primary" icon="lucide:graduation-cap" />
              {{ nombrePropio(grupo.carrera) }}
              <span class="text-xs font-normal text-muted-foreground">
                {{ grupo.proyectos.length }} · {{ grupo.basico }} Básico ·
                {{ grupo.avanzado }} Avanzado
              </span>
            </div>
            <div v-if="grupo.sinClasificar > 0" class="flex items-center gap-1.5 text-xs">
              <span class="text-amber-600">{{ grupo.sinClasificar }} sin clasificar →</span>
              <Button
                v-for="n in NIVELES"
                :key="n.valor"
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="marcarSinClasificar(grupo, n.valor)"
              >
                {{ n.etiqueta }}
              </Button>
            </div>
          </div>

          <!-- Proyectos -->
          <div
            v-for="p in grupo.proyectos"
            :key="p.participanteId"
            :class="{ 'bg-primary/5': cambios[p.participanteId] }"
            class="flex items-center gap-3 border-b border-border px-4 py-2 transition-colors last:border-b-0"
          >
            <div class="min-w-0 flex-1">
              <Tooltip :title="limpiarEspacios(p.nombre)" placement="topLeft">
                <div class="truncate font-medium">{{ limpiarEspacios(p.nombre) }}</div>
              </Tooltip>
              <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span v-if="!p.carreraValida" class="rounded-full bg-red-500/10 px-1.5 text-red-600">
                  Carrera no reconocida
                </span>
                <span
                  v-if="p.evaluaciones > 0"
                  class="flex items-center gap-1"
                  title="Cambiarle el nivel archivará sus evaluaciones"
                >
                  <IconifyIcon class="size-3.5 text-green-600" icon="lucide:circle-check" />
                  {{ p.evaluaciones }} evaluaciones
                </span>
                <template v-if="cambios[p.participanteId]">
                  <span class="text-primary">
                    {{ etiquetaNivel(p.nivel) }} → {{ etiquetaNivel(cambios[p.participanteId]) }}
                  </span>
                  <span
                    v-if="p.evaluaciones > 0"
                    class="flex items-center gap-1 text-amber-600"
                  >
                    <IconifyIcon class="size-3.5" icon="lucide:triangle-alert" />
                    se archivarán al guardar
                  </span>
                </template>
              </div>
            </div>

            <div class="flex shrink-0 gap-1.5">
              <button
                v-for="n in NIVELES"
                :key="n.valor"
                :class="{ 'is-activo': nivelDe(p) === n.valor }"
                :disabled="!p.carreraValida || guardando"
                class="semfa-chip"
                type="button"
                @click="marcar(p, n.valor)"
              >
                {{ n.etiqueta }}
              </button>
            </div>
          </div>
        </section>
      </Spin>
    </Card>
  </Page>
</template>
