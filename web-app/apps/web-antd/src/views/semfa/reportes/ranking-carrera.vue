<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { ResultadosCategoria, ResultadosProyecto } from '#/api/resultados';

import type { FiltroJornada } from './compartido';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Table, Tooltip } from 'ant-design-vue';

import { normalizarTexto } from '#/utils/formato';

import { PDF_RESULTADOS } from '#/api/resultados';

import BotonExclusion from './boton-exclusion.vue';
import BotonPdf from './boton-pdf.vue';
import { archivo, calificacionDe, descargarCsv, fmt, r2, textoJornada } from './compartido';

defineOptions({ name: 'SemfaRankingCarrera' });

/**
 * Resultados por Carrera → Categoría (FEXCOIN): cada carrera tuvo sus propios
 * jurados, así que el puesto (calculado en el backend) es dentro de la carrera y
 * la categoría. Cada bloque muestra solo los jurados que evaluaron ahí, la nota
 * de cada uno y el promedio. Los proyectos que nadie evaluó van al final.
 */
const props = defineProps<{
  actividad: string;
  categorias: ResultadosCategoria[];
  jornada: FiltroJornada;
}>();
const emit = defineEmits<{ recargar: [] }>();

interface JuradoBloque {
  idJurado: number;
  nombre: string;
  /** Proyectos de este bloque que calificó. */
  proyectos: number;
}

interface Bloque {
  categoria: ResultadosCategoria;
  evaluados: number;
  jurados: JuradoBloque[];
  proyectos: ResultadosProyecto[];
  unJurado: number;
}

interface Carrera {
  bloques: Bloque[];
  clave: string;
  evaluados: number;
  /** Jurados de la carrera con los proyectos que calificaron en ella (afiliado = 2 o más). */
  jurados: JuradoBloque[];
  nombre: string;
  sigla: null | string;
  total: number;
  unJurado: number;
}

const evaluado = (p: ResultadosProyecto) => p.calificaciones.some((c) => c.completa);
const juradosQueCalificaron = (p: ResultadosProyecto) => p.calificaciones.filter((c) => c.completa).length;

function juradosDe(cat: ResultadosCategoria, proyectos: ResultadosProyecto[]): JuradoBloque[] {
  const cuenta = new Map<number, number>();
  for (const p of proyectos) {
    for (const c of p.calificaciones) {
      if (c.completa) cuenta.set(c.idJurado, (cuenta.get(c.idJurado) ?? 0) + 1);
    }
  }
  return [...cuenta.entries()]
    .map(([idJurado, n]) => ({
      idJurado,
      nombre: cat.jurados.find((j) => j.idJurado === idJurado)?.nombre ?? `Jurado ${idJurado}`,
      proyectos: n,
    }))
    .sort((a, b) => b.proyectos - a.proyectos || a.nombre.localeCompare(b.nombre, 'es'));
}

const carreras = computed<Carrera[]>(() => {
  const mapa = new Map<string, Carrera>();
  for (const cat of props.categorias) {
    const porCarrera = new Map<string, ResultadosProyecto[]>();
    for (const p of cat.proyectos) {
      if (props.jornada && p.jornada !== props.jornada) continue;
      const nombre = p.carrera ?? 'Sin carrera';
      const lista = porCarrera.get(nombre) ?? [];
      lista.push(p);
      porCarrera.set(nombre, lista);
      if (!mapa.has(nombre)) {
        mapa.set(nombre, {
          bloques: [], clave: normalizarTexto(nombre), evaluados: 0, jurados: [], nombre,
          sigla: p.siglaFacultad, total: 0, unJurado: 0,
        });
      }
    }
    for (const [nombre, proyectos] of porCarrera) {
      const carrera = mapa.get(nombre)!;
      const bloque: Bloque = {
        categoria: cat,
        evaluados: proyectos.filter(evaluado).length,
        jurados: juradosDe(cat, proyectos),
        proyectos,
        unJurado: proyectos.filter((p) => juradosQueCalificaron(p) === 1).length,
      };
      carrera.bloques.push(bloque);
      carrera.total += proyectos.length;
      carrera.evaluados += bloque.evaluados;
      carrera.unJurado += bloque.unJurado;
    }
  }
  for (const c of mapa.values()) {
    const cuenta = new Map<number, JuradoBloque>();
    for (const b of c.bloques) {
      for (const j of b.jurados) {
        const actual = cuenta.get(j.idJurado);
        if (actual) actual.proyectos += j.proyectos;
        else cuenta.set(j.idJurado, { ...j });
      }
    }
    c.jurados = [...cuenta.values()].sort((a, b) => b.proyectos - a.proyectos || a.nombre.localeCompare(b.nombre, 'es'));
    c.bloques.sort((a, b) => b.proyectos.length - a.proyectos.length
      || a.categoria.nombre.localeCompare(b.categoria.nombre, 'es'));
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});

// ------------------------------------------------------------------ filtros

const elegida = ref<string>();
watch(carreras, (lista) => {
  if (elegida.value && !lista.some((c) => c.clave === elegida.value)) elegida.value = undefined;
});
const busqueda = ref('');
/** Nombre de la carrera elegida (para los PDF), o `undefined` = todas. */
const nombreElegida = computed(() => carreras.value.find((c) => c.clave === elegida.value)?.nombre);
const soloEvaluados = ref(false);

function coincide(p: ResultadosProyecto) {
  const q = normalizarTexto(busqueda.value).trim();
  return (!soloEvaluados.value || evaluado(p)) && (!q || normalizarTexto(p.nombre ?? '').includes(q));
}

const visibles = computed(() => carreras.value
  .filter((c) => !elegida.value || c.clave === elegida.value)
  .map((c) => ({
    ...c,
    bloques: c.bloques
      .map((b) => ({ ...b, proyectos: b.proyectos.filter(coincide) }))
      .filter((b) => b.proyectos.length > 0),
  }))
  .filter((c) => c.bloques.length > 0));

const totales = computed(() => ({
  evaluados: carreras.value.reduce((s, c) => s + c.evaluados, 0),
  proyectos: carreras.value.reduce((s, c) => s + c.total, 0),
  unJurado: carreras.value.reduce((s, c) => s + c.unJurado, 0),
}));

// ------------------------------------------------------------------ tabla

function columnas(b: Bloque): ColumnsType<ResultadosProyecto> {
  return [
    { align: 'center', key: 'puesto', title: 'Puesto', width: 70 },
    { ellipsis: true, key: 'nombre', title: 'Proyecto / participante' },
    ...b.jurados.map((j, i) => ({
      align: 'center' as const, key: `nota-${j.idJurado}`, title: `J${i + 1}`, width: 76,
    })),
    { align: 'right', key: 'puntaje', title: 'Promedio', width: 96 },
    { align: 'center', key: 'jurados', title: 'Jurados', width: 84 },
    { align: 'center', key: 'acciones', title: '', width: 52 },
  ];
}

const MEDALLAS: Record<number, string> = {
  1: 'bg-amber-400 text-white',
  2: 'bg-slate-400 text-white',
  3: 'bg-orange-700/80 text-white',
};

const PAGINACION = { hideOnSinglePage: true, pageSize: 10, showSizeChanger: false, size: 'small' as const };

function notaDe(p: ResultadosProyecto, idJurado: number) {
  const cal = calificacionDe(p, idJurado);
  return cal?.completa ? cal.total : undefined;
}

function exportar() {
  const filas: (null | number | string | undefined)[][] = [];
  for (const c of visibles.value) {
    for (const b of c.bloques) {
      for (const p of b.proyectos) {
        const notas = b.jurados.map((j) => notaDe(p, j.idJurado));
        filas.push([
          c.nombre, b.categoria.nombre, p.puesto || null, p.nombre, textoJornada(p.jornada), p.stand,
          r2(p.puntaje), b.categoria.puntajeMaximo, juradosQueCalificaron(p),
          b.jurados.map((j, i) => `${j.nombre}: ${notas[i] === undefined ? '—' : r2(notas[i])}`)
            .filter((_, i) => notas[i] !== undefined).join(' | '),
          evaluado(p) ? 'Evaluado' : 'Sin evaluar',
        ]);
      }
    }
  }
  descargarCsv(
    `resultados-por-carrera${elegida.value ? `-${elegida.value}` : ''}`,
    ['Carrera', 'Categoría', 'Puesto', 'Proyecto', 'Jornada', 'Stand', 'Promedio', 'Puntaje máximo', 'N° jurados', 'Notas por jurado', 'Estado'],
    filas,
  );
}
</script>

<template>
  <div class="flex flex-col gap-3 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="text-xs text-muted-foreground">
        Promedio = media de las notas de los jurados que evaluaron el proyecto. El puesto se cuenta dentro de cada
        carrera y categoría. {{ totales.evaluados }} de {{ totales.proyectos }} proyectos evaluados<template
          v-if="totales.unJurado"
        >; <span class="text-amber-600">{{ totales.unJurado }} con un solo jurado</span></template>.
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input v-model="soloEvaluados" class="accent-primary" type="checkbox" />
          Ocultar sin evaluar
        </label>
        <Input v-model:value="busqueda" allow-clear placeholder="Buscar proyecto…" size="small" style="width: 220px">
          <template #prefix><IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" /></template>
        </Input>
        <BotonPdf
          :clave="`por-carrera-${elegida ?? 'todas'}-${soloEvaluados}`"
          :nombre="archivo('resultados-por-carrera', nombreElegida ?? actividad)"
          :pdf="PDF_RESULTADOS.porCarrera(nombreElegida, !soloEvaluados)"
          etiqueta="PDF por carrera y categoría"
          :tooltip="`${nombreElegida ?? 'Todas las carreras'}: una tabla por categoría con la nota de cada jurado, promedio y puesto`"
        />
        <BotonPdf
          :clave="`puntajes-carrera-${elegida ?? 'todas'}-${soloEvaluados}`"
          :nombre="archivo('puntajes-por-carrera', nombreElegida ?? actividad)"
          :pdf="PDF_RESULTADOS.puntajesCarrera(nombreElegida, !soloEvaluados)"
          etiqueta="PDF puntajes (sin jurados)"
          :tooltip="`${nombreElegida ?? 'Todas las carreras'}: puntaje final de cada proyecto y 1.º, 2.º y 3.º lugar resaltados, sin nombrar jurados`"
        />
        <BotonPdf
          :clave="`ganadores-${elegida ?? 'todas'}`"
          :nombre="archivo('cuadro-de-ganadores', nombreElegida ?? actividad)"
          :pdf="PDF_RESULTADOS.ganadores(nombreElegida)"
          etiqueta="PDF ganadores"
          :tooltip="`${nombreElegida ?? 'Todas las carreras'}: primer, segundo y tercer lugar de cada carrera y categoría`"
        />
        <BotonPdf
          :clave="`ranking-carrera-${elegida ?? 'todas'}-${soloEvaluados}`"
          :nombre="archivo('ranking-por-carrera', nombreElegida ?? actividad)"
          :pdf="PDF_RESULTADOS.rankingCarrera(nombreElegida, !soloEvaluados)"
          etiqueta="PDF ranking por carrera"
          :tooltip="`${nombreElegida ?? 'Todas las carreras'}: un solo ranking por carrera, sin importar la categoría`"
        />
        <Tooltip title="Exportar lo que se ve a Excel (CSV)">
          <Button class="semfa-btn semfa-btn--neutro" size="small" @click="exportar">
            <IconifyIcon class="size-3.5" icon="lucide:sheet" />
            CSV
          </Button>
        </Tooltip>
      </div>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button :class="{ 'is-activo': !elegida }" class="semfa-chip text-xs" type="button" @click="elegida = undefined">
        Todas las carreras
        <span class="tabular-nums opacity-70">{{ carreras.length }}</span>
      </button>
      <button
        v-for="c in carreras"
        :key="c.clave"
        :class="{ 'is-activo': c.clave === elegida }"
        class="semfa-chip text-xs"
        type="button"
        @click="elegida = c.clave === elegida ? undefined : c.clave"
      >
        <span
          :class="c.evaluados === 0 ? 'bg-red-400' : c.evaluados === c.total ? 'bg-emerald-500' : 'bg-amber-500'"
          class="size-2 shrink-0 rounded-full"
        ></span>
        {{ c.nombre }}
        <span class="tabular-nums opacity-70">{{ c.evaluados }}/{{ c.total }}</span>
      </button>
    </div>

    <div v-if="visibles.length === 0" class="flex flex-col items-center gap-2 py-12 text-muted-foreground">
      <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
      No hay proyectos con ese filtro
    </div>

    <section v-for="c in visibles" :key="c.clave" class="overflow-hidden rounded-xl border border-border">
      <header class="flex flex-wrap items-start justify-between gap-2 bg-muted/40 px-4 py-2.5">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <IconifyIcon class="size-4 text-primary" icon="lucide:graduation-cap" />
            {{ c.nombre }}
            <span v-if="c.sigla" class="text-xs font-normal text-muted-foreground">· {{ c.sigla }}</span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ c.evaluados }} de {{ c.total }} evaluados
            <template v-if="c.unJurado"> · <span class="text-amber-600">{{ c.unJurado }} con un solo jurado</span></template>
          </div>
        </div>
        <div class="flex max-w-full flex-wrap justify-end gap-1">
          <span v-if="c.jurados.length === 0" class="text-xs text-red-600">Ningún jurado evaluó esta carrera</span>
          <Tooltip
            v-for="j in c.jurados"
            :key="j.idJurado"
            :title="j.proyectos >= 2 ? `Afiliado a la carrera: evaluó ${j.proyectos} proyectos` : 'Evaluó un solo proyecto de esta carrera'"
          >
            <span
              :class="j.proyectos >= 2 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            >
              <IconifyIcon class="size-3" icon="lucide:user-check" />
              {{ j.nombre }}
              <span class="tabular-nums opacity-70">{{ j.proyectos }}</span>
            </span>
          </Tooltip>
        </div>
      </header>

      <div v-for="b in c.bloques" :key="b.categoria.idCategoria" class="border-t border-border">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-2.5">
          <div class="text-[13px] font-medium">
            {{ b.categoria.nombre }}
            <span class="text-xs font-normal text-muted-foreground">
              · {{ b.evaluados }}/{{ b.proyectos.length }} evaluados · máx. {{ b.categoria.puntajeMaximo }} pts
            </span>
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span v-for="(j, i) in b.jurados" :key="j.idJurado">
              <b class="text-foreground">J{{ i + 1 }}</b> {{ j.nombre }}
            </span>
          </div>
        </div>
        <Table
          :columns="columnas(b)"
          :data-source="b.proyectos"
          :pagination="PAGINACION"
          class="semfa-tabla"
          row-key="idInscripcion"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'puesto'">
              <span
                v-if="record.puesto > 0"
                :class="MEDALLAS[record.puesto] ?? 'bg-muted text-muted-foreground'"
                class="inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
              >
                {{ record.puesto }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'nombre'">
              <Tooltip :title="record.nombre" placement="topLeft">
                <span :class="{ 'font-semibold': record.puesto > 0 && record.puesto <= 3, 'text-muted-foreground': !evaluado(record as ResultadosProyecto) }">
                  {{ record.nombre || '—' }}
                </span>
              </Tooltip>
              <Tooltip v-if="record.exclusion" :title="record.exclusion.motivo">
                <span class="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Excluido del ranking</span>
              </Tooltip>
            </template>
            <template v-else-if="String(column.key).startsWith('nota-')">
              <span class="tabular-nums">
                {{ notaDe(record as ResultadosProyecto, Number(String(column.key).slice(5))) === undefined
                  ? '—' : fmt(notaDe(record as ResultadosProyecto, Number(String(column.key).slice(5)))) }}
              </span>
            </template>
            <template v-else-if="column.key === 'puntaje'">
              <span :class="record.puesto > 0 ? 'font-semibold' : 'text-muted-foreground'" class="tabular-nums">
                {{ fmt(record.puntaje) }}
              </span>
            </template>
            <template v-else-if="column.key === 'jurados'">
              <span v-if="!evaluado(record as ResultadosProyecto)" class="semfa-estado semfa-estado--error">Sin evaluar</span>
              <Tooltip v-else-if="juradosQueCalificaron(record as ResultadosProyecto) === 1" title="Lo evaluó un solo jurado">
                <span class="semfa-estado semfa-estado--proceso">1 jurado</span>
              </Tooltip>
              <span v-else class="tabular-nums text-muted-foreground">{{ juradosQueCalificaron(record as ResultadosProyecto) }}</span>
            </template>
            <template v-else-if="column.key === 'acciones'">
              <BotonExclusion :proyecto="record as ResultadosProyecto" @cambio="emit('recargar')" />
            </template>
          </template>
        </Table>
      </div>
    </section>
  </div>
</template>
