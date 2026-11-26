<script lang="ts" setup>
import type { EscalaEdicion } from '#/utils/escala';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Checkbox, Input, InputNumber } from 'ant-design-vue';

import SemfaNivelesRango from '#/components/semfa/semfa-niveles-rango.vue';
import { avisar } from '#/composables/useAvisos';
import {
  agregarNivelRango,
  cambiarDesde,
  cambiarHasta,
  errorEscala,
  erroresRangos,
  formatearPuntos,
  leerFilaWord,
  leerNivelesPegados,
  maximoDe,
  nivelesDeFilaWord,
  nivelesPorRango,
  nuevaClave,
  PASOS,
  quitarNivelRango,
} from '#/utils/escala';

defineOptions({ name: 'SemfaEscalaCriterio' });

/**
 * Cómo califica el jurado un criterio:
 *  - Números: de un mínimo a un máximo, en enteros o con decimales (paso 0,5 / 0,1).
 *  - Niveles: niveles con su descripción, como en las rúbricas de una
 *    convocatoria (5 «Mínima innovación», …, 25 «Disruptivo»). El jurado toca un
 *    nivel y, si se permite, lo afina con decimales.
 *  - Niveles por rango (FEXCOIN): 5 niveles con nombre, rango (0–4, 5–8, …) y
 *    descripción; el jurado toca un nivel y elige un entero de su rango. Se puede
 *    pegar la fila del criterio desde el documento Word de las rúbricas.
 */
const props = withDefaults(
  defineProps<{
    deshabilitado?: boolean;
    /** `false` cuando el máximo se edita fuera (p. ej. en la fila del criterio). */
    mostrarMaximo?: boolean;
  }>(),
  { deshabilitado: false, mostrarMaximo: true },
);

const escala = defineModel<EscalaEdicion>({ required: true });

const emit = defineEmits<{
  /** Lo que se pudo leer del criterio al pegar una fila del Word (nombre, bloque, máximo). */
  proponer: [datos: { descripcion?: string; maximo?: number; nombre?: string }];
}>();

const error = computed(() => errorEscala(escala.value));
const maximo = computed(() => maximoDe(escala.value));

function cambiar<K extends keyof EscalaEdicion>(campo: K, valor: EscalaEdicion[K]) {
  escala.value = { ...escala.value, [campo]: valor };
}

function elegirModo(modo: EscalaEdicion['modo']) {
  if (modo === escala.value.modo) return;
  if (modo === 'rangos') {
    const max = (escala.value.modo === 'niveles' ? maximoDe(escala.value) : Number(escala.value.maximo)) || 20;
    const niveles = nivelesPorRango(max);
    escala.value = { ...escala.value, maximo: max, minimo: 0, modo, niveles, paso: 1, soloNiveles: false };
    return;
  }
  if (escala.value.modo === 'rangos') {
    // Al salir de los rangos: el máximo y el mínimo siguen siendo los de la escala.
    const f = maximoDe(escala.value);
    const minimo = escala.value.niveles[0]?.desde ?? 1;
    escala.value = { ...escala.value, maximo: f, minimo, modo: 'numeros', niveles: [], paso: 1 };
    if (modo === 'numeros') return;
  }
  if (modo === 'niveles' && escala.value.niveles.length === 0) {
    // Propone niveles a partir del máximo actual (p. ej. 20 → 5, 10, 15, 20).
    const max = Number(escala.value.maximo) || 20;
    const salto = max / 4;
    const niveles = [1, 2, 3, 4].map((i) => ({
      clave: nuevaClave(),
      descripcion: '',
      puntos: Math.round(salto * i * 10) / 10,
    }));
    escala.value = { ...escala.value, modo, niveles, soloNiveles: true };
    return;
  }
  cambiar('modo', modo);
}

function cambiarNivel(clave: number, campo: 'descripcion' | 'puntos', valor: number | string | undefined) {
  cambiar(
    'niveles',
    escala.value.niveles.map((n) => (n.clave === clave ? { ...n, [campo]: valor } : n)),
  );
}

function agregarNivel() {
  const ultimo = escala.value.niveles.at(-1)?.puntos;
  cambiar('niveles', [
    ...escala.value.niveles,
    { clave: nuevaClave(), descripcion: '', puntos: ultimo === undefined ? undefined : ultimo + 5 },
  ]);
}

function quitarNivel(clave: number) {
  cambiar(
    'niveles',
    escala.value.niveles.filter((n) => n.clave !== clave),
  );
}

// ---------------------------------------------------------------- niveles por rango

const erroresDeRango = computed(() => erroresRangos(escala.value.niveles));

/** El «máximo» de la escala sigue al «hasta» del último nivel. */
function conMaximo(niveles: EscalaEdicion['niveles']): EscalaEdicion {
  const ultimo = niveles.at(-1)?.puntos;
  return { ...escala.value, maximo: ultimo ?? escala.value.maximo, niveles };
}

function cambiarNombreRango(clave: number, valor: string) {
  cambiar(
    'niveles',
    escala.value.niveles.map((n) => (n.clave === clave ? { ...n, nombre: valor } : n)),
  );
}

function cambiarHastaRango(clave: number, valor: null | number | string) {
  escala.value = conMaximo(cambiarHasta(escala.value.niveles, clave, valor === null || valor === '' ? undefined : Number(valor)));
}

function cambiarDesdeRango(clave: number, valor: null | number | string) {
  escala.value = conMaximo(cambiarDesde(escala.value.niveles, clave, valor === null || valor === '' ? undefined : Number(valor)));
}

function agregarRango() {
  escala.value = conMaximo(agregarNivelRango(escala.value.niveles));
}

function quitarRango(clave: number) {
  escala.value = conMaximo(quitarNivelRango(escala.value.niveles, clave));
}

/** «Repartir»: vuelve a generar los 5 niveles hasta el máximo indicado. */
function repartir() {
  const max = Number(escala.value.maximo);
  if (!max || max < 1 || max > 100) return;
  escala.value = { ...escala.value, minimo: 0, niveles: nivelesPorRango(max) };
}

/** Vista previa: el jurado lo ve igual que en su hoja. */
const nivelesVista = computed(() =>
  escala.value.modo === 'rangos' && !errorEscala(escala.value)
    ? [...escala.value.niveles]
        .sort((a, b) => Number(a.desde) - Number(b.desde))
        .map((n) => ({
          desde: Number(n.desde),
          descripcion: n.descripcion.trim() || null,
          nombre: (n.nombre ?? '').trim(),
          puntos: Number(n.puntos),
        }))
    : [],
);
const valorPrueba = ref<number>();
watch(nivelesVista, () => {
  valorPrueba.value = undefined;
});

const pegando = ref(false);
const textoPegado = ref('');
const pegandoWord = ref(false);
const textoWord = ref('');

function pegarFilaWord() {
  const fila = leerFilaWord(textoWord.value);
  if (!fila) {
    avisar({
      mensaje: 'No encontré los rangos («0 – 4 pts», «5 – 8 pts»…). Copie la fila completa del criterio desde la tabla del documento.',
      tipo: 'advertencia',
      titulo: 'No se pudo leer la fila',
    });
    return;
  }
  const niveles = nivelesDeFilaWord(fila);
  escala.value = { ...conMaximo(niveles), minimo: fila.niveles[0]!.desde, modo: 'rangos', paso: 1, soloNiveles: false };
  emit('proponer', fila.criterio);
  textoWord.value = '';
  pegandoWord.value = false;
  avisar({
    mensaje: `Se cargaron ${niveles.length} niveles${fila.criterio.nombre ? ` de «${fila.criterio.nombre}»` : ''}. Revise los nombres y las descripciones.`,
    tipo: 'exito',
    titulo: 'Fila pegada',
  });
}

function pegarNiveles() {
  const leidos = leerNivelesPegados(textoPegado.value);
  if (leidos.length === 0) return;
  cambiar('niveles', leidos);
  textoPegado.value = '';
  pegando.value = false;
}

/** Ejemplo de lo que verá el jurado. */
const ejemplo = computed(() => {
  const e = escala.value;
  if (e.modo === 'rangos') {
    return `Toca un nivel (${e.niveles.map((n) => n.nombre || '…').join(' · ')}) y elige un entero de su rango`;
  }
  if (e.modo === 'niveles') {
    const n = e.niveles.filter((x) => x.puntos !== undefined).map((x) => formatearPuntos(x.puntos));
    return e.soloNiveles
      ? `Elige uno: ${n.join(' · ')}`
      : `Toca un nivel (${n.join(' · ')}) y afina de ${formatearPuntos(e.paso)} en ${formatearPuntos(e.paso)}`;
  }
  const min = Number(e.minimo);
  const max = Number(e.maximo);
  if (!max) return '';
  return e.paso === 1
    ? `Elige un entero de ${formatearPuntos(min)} a ${formatearPuntos(max)}`
    : `De ${formatearPuntos(min)} a ${formatearPuntos(max)}, de ${formatearPuntos(e.paso)} en ${formatearPuntos(e.paso)} (p. ej. ${formatearPuntos(Math.min(max, min + e.paso * 3))})`;
});
</script>

<template>
  <div class="semfa-escala flex flex-col gap-2 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-medium text-muted-foreground">Escala:</span>
      <button
        :class="{ 'is-activo': escala.modo === 'numeros' }"
        :disabled="props.deshabilitado"
        class="semfa-chip !py-0.5 !text-xs"
        type="button"
        @click="elegirModo('numeros')"
      >
        <IconifyIcon class="size-3.5" icon="lucide:hash" />
        Números
      </button>
      <button
        :class="{ 'is-activo': escala.modo === 'niveles' }"
        :disabled="props.deshabilitado"
        class="semfa-chip !py-0.5 !text-xs"
        type="button"
        @click="elegirModo('niveles')"
      >
        <IconifyIcon class="size-3.5" icon="lucide:list-ordered" />
        Niveles con descripción
      </button>
      <button
        :class="{ 'is-activo': escala.modo === 'rangos' }"
        :disabled="props.deshabilitado"
        class="semfa-chip !py-0.5 !text-xs"
        type="button"
        @click="elegirModo('rangos')"
      >
        <IconifyIcon class="size-3.5" icon="lucide:align-horizontal-distribute-center" />
        Niveles por rango
      </button>
      <span class="ml-auto text-xs text-muted-foreground">Máx. <b class="text-foreground">{{ formatearPuntos(maximo) }}</b> pts</span>
    </div>

    <!-- Números: mínimo, máximo y paso -->
    <div v-if="escala.modo === 'numeros'" class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted-foreground">De</span>
      <InputNumber
        :disabled="props.deshabilitado"
        :max="99"
        :min="0"
        :value="escala.minimo"
        class="w-20"
        size="small"
        @update:value="(v) => cambiar('minimo', v === null ? undefined : Number(v))"
      />
      <template v-if="props.mostrarMaximo">
        <span class="text-xs text-muted-foreground">a</span>
        <InputNumber
          :disabled="props.deshabilitado"
          :max="100"
          :min="1"
          :value="escala.maximo"
          class="w-20"
          size="small"
          @update:value="(v) => cambiar('maximo', v === null ? undefined : Number(v))"
        />
      </template>
      <span class="ml-2 text-xs text-muted-foreground">Paso:</span>
      <button
        v-for="p in PASOS"
        :key="p.valor"
        :class="{ 'is-activo': escala.paso === p.valor }"
        :disabled="props.deshabilitado"
        class="semfa-chip !px-2 !py-0 !text-xs"
        type="button"
        @click="cambiar('paso', p.valor)"
      >
        {{ p.etiqueta }}
      </button>
    </div>

    <!-- Niveles por rango: nombre, desde, hasta y descripción -->
    <template v-else-if="escala.modo === 'rangos'">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">Repartir 5 niveles de 0 a</span>
        <InputNumber
          :disabled="props.deshabilitado"
          :max="100"
          :min="1"
          :value="escala.maximo"
          class="w-20"
          size="small"
          @update:value="(v) => cambiar('maximo', v === null ? undefined : Number(v))"
        />
        <Button :disabled="props.deshabilitado" size="small" @click="repartir">
          <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:split" />
          Repartir
        </Button>
        <Button :disabled="props.deshabilitado" size="small" type="link" @click="pegandoWord = !pegandoWord">
          <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:clipboard-paste" />
          Pegar fila del Word
        </Button>
      </div>
      <div v-if="pegandoWord" class="rounded-lg border border-dashed border-primary/40 p-2">
        <Input.TextArea
          v-model:value="textoWord"
          :auto-size="{ minRows: 3, maxRows: 7 }"
          placeholder="Copie la fila del criterio desde la tabla del documento y péguela aquí. Ej.&#10;1. Pertinencia y claridad del problema (Máx. 20 pts)   0 – 4 ptsPresentan errores…   5 – 8 ptsExplican…"
        />
        <div class="mt-1.5 flex justify-end gap-2">
          <Button size="small" @click="pegandoWord = false">Cancelar</Button>
          <Button :disabled="!textoWord.trim()" class="semfa-btn semfa-btn--primario" size="small" @click="pegarFilaWord">
            Usar esta fila
          </Button>
        </div>
      </div>
      <div v-for="n in escala.niveles" :key="n.clave" class="flex flex-col gap-0.5">
        <div class="flex flex-wrap items-start gap-2">
          <Input
            :disabled="props.deshabilitado"
            :maxlength="60"
            :status="erroresDeRango.get(n.clave) ? 'error' : ''"
            :value="n.nombre"
            class="!w-32 shrink-0"
            placeholder="Ej. Bueno"
            size="small"
            @update:value="(v) => cambiarNombreRango(n.clave, String(v ?? ''))"
          />
          <InputNumber
            :disabled="props.deshabilitado"
            :max="100"
            :min="0"
            :precision="0"
            :status="erroresDeRango.get(n.clave) ? 'error' : ''"
            :value="n.desde"
            class="w-20 shrink-0"
            size="small"
            title="Desde"
            @update:value="(v) => cambiarDesdeRango(n.clave, v)"
          />
          <span class="mt-1 text-xs text-muted-foreground">–</span>
          <InputNumber
            :disabled="props.deshabilitado"
            :max="100"
            :min="0"
            :precision="0"
            :status="erroresDeRango.get(n.clave) ? 'error' : ''"
            :value="n.puntos"
            addon-after="pts"
            class="w-28 shrink-0"
            size="small"
            title="Hasta"
            @update:value="(v) => cambiarHastaRango(n.clave, v)"
          />
          <Input.TextArea
            :auto-size="{ minRows: 1, maxRows: 3 }"
            :disabled="props.deshabilitado"
            :maxlength="255"
            :value="n.descripcion"
            class="min-w-48 flex-1"
            placeholder="Qué significa este nivel. Ej. Explican correctamente el problema, pero lo sustentan de forma general."
            size="small"
            @update:value="(v) => cambiarNivel(n.clave, 'descripcion', String(v ?? ''))"
          />
          <Button :disabled="props.deshabilitado" size="small" title="Quitar nivel" type="text" @click="quitarRango(n.clave)">
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:x" />
          </Button>
        </div>
        <div v-if="erroresDeRango.get(n.clave)" class="text-xs text-red-600">{{ erroresDeRango.get(n.clave) }}</div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button :disabled="props.deshabilitado || escala.niveles.length >= 10" size="small" @click="agregarRango">
          <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:plus" />
          Nivel
        </Button>
        <span class="text-xs text-muted-foreground">El «desde» de cada nivel sigue al «hasta» del anterior.</span>
      </div>
      <!-- Vista previa: lo que verá el jurado -->
      <div v-if="nivelesVista.length > 0" class="rounded-lg border border-border bg-background p-2">
        <div class="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <IconifyIcon class="size-3.5" icon="lucide:smartphone" />
          Así lo verá el jurado
        </div>
        <div class="mx-auto max-w-md">
          <SemfaNivelesRango :niveles="nivelesVista" :valor="valorPrueba" @elegir="(v) => (valorPrueba = v)" />
        </div>
      </div>
    </template>

    <!-- Niveles: puntos + descripción -->
    <template v-else>
      <div
        v-for="n in escala.niveles"
        :key="n.clave"
        class="flex items-center gap-2"
      >
        <InputNumber
          :disabled="props.deshabilitado"
          :max="100"
          :min="0"
          :value="n.puntos"
          addon-after="pts"
          class="w-28 shrink-0"
          size="small"
          @update:value="(v) => cambiarNivel(n.clave, 'puntos', v === null ? undefined : Number(v))"
        />
        <Input
          :disabled="props.deshabilitado"
          :maxlength="255"
          :value="n.descripcion"
          placeholder="Qué significa este nivel. Ej. Innovación moderada, mejora significativa"
          size="small"
          @update:value="(v) => cambiarNivel(n.clave, 'descripcion', String(v ?? ''))"
          @keydown.enter.stop.prevent="agregarNivel"
        />
        <Button :disabled="props.deshabilitado" size="small" title="Quitar nivel" type="text" @click="quitarNivel(n.clave)">
          <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:x" />
        </Button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button :disabled="props.deshabilitado || escala.niveles.length >= 10" size="small" @click="agregarNivel">
          <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:plus" />
          Nivel
        </Button>
        <Button :disabled="props.deshabilitado" size="small" type="link" @click="pegando = !pegando">
          <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:clipboard-paste" />
          Pegar niveles
        </Button>
        <Checkbox
          :checked="!escala.soloNiveles"
          :disabled="props.deshabilitado"
          class="ml-auto text-xs"
          @update:checked="(v) => cambiar('soloNiveles', !v)"
        >
          Permitir valores intermedios
        </Checkbox>
        <template v-if="!escala.soloNiveles">
          <button
            v-for="p in PASOS"
            :key="p.valor"
            :class="{ 'is-activo': escala.paso === p.valor }"
            :disabled="props.deshabilitado"
            class="semfa-chip !px-2 !py-0 !text-xs"
            type="button"
            @click="cambiar('paso', p.valor)"
          >
            {{ p.etiqueta }}
          </button>
        </template>
      </div>
      <div v-if="pegando" class="rounded-lg border border-dashed border-primary/40 p-2">
        <Input.TextArea
          v-model:value="textoPegado"
          :auto-size="{ minRows: 3, maxRows: 7 }"
          placeholder="Una línea por nivel, con los puntos al inicio o al final:&#10;Mínima o ninguna innovación.  5&#10;Poca innovación, cambios menores.  10&#10;15 | Innovación moderada"
        />
        <div class="mt-1.5 flex justify-end gap-2">
          <Button size="small" @click="pegando = false">Cancelar</Button>
          <Button :disabled="!textoPegado.trim()" class="semfa-btn semfa-btn--primario" size="small" @click="pegarNiveles">
            Usar estos niveles
          </Button>
        </div>
      </div>
    </template>

    <div :class="error ? 'text-red-600' : 'text-muted-foreground'" class="text-xs">
      <IconifyIcon :icon="error ? 'lucide:circle-alert' : 'lucide:eye'" class="mr-1 inline size-3.5" />
      {{ error || `El jurado: ${ejemplo}` }}
    </div>
  </div>
</template>
