<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue';

import { claseNivelPorPosicion, valoresDeRango } from '#/utils/escala';

defineOptions({ name: 'SemfaNivelesRango' });

/**
 * Cómo califica el jurado un criterio con niveles por rango (FEXCOIN): una fila de
 * niveles coloreados de rojo (deficiente) a verde (excelente), cada uno con su rango
 * («13–16»). Al tocar un nivel se despliega su descripción y los números de su rango.
 * Tocar un nivel o un número NO califica: el número queda en borrador («11 · Bueno»)
 * y solo «Aceptar» lo confirma (`elegir`), para que el jurado lea y ajuste con calma
 * antes de que la hoja pase al siguiente criterio. En pantallas bajas la descripción
 * se limita a 3 líneas y se desplaza dentro de su recuadro si es más larga.
 *
 * Lo usan la hoja del jurado (`views/semfa/jurado/evaluar.vue`) y la vista previa del
 * formulario de criterio. Sus filas llevan la clase `semfa-puntajes`: la hoja mide el
 * alto libre y lo reparte entre las filas de botones (`ajustarAlto`, `--semfa-alto`).
 */
export interface NivelRangoVista {
  desde: number;
  descripcion?: null | string;
  nombre: string;
  puntos: number;
}

const props = defineProps<{
  /** Para los lectores de pantalla. */
  etiqueta?: string;
  niveles: NivelRangoVista[];
  /** Puntaje elegido, o `undefined` si aún no hay. */
  valor?: number;
}>();

const emit = defineEmits<{
  /** Puntaje confirmado con «Aceptar». */
  elegir: [valor: number];
  /** Cambió lo desplegado (nivel abierto): la hoja vuelve a medir el alto. */
  layout: [];
}>();

/** Nivel tocado (índice) y número elegido sin confirmar todavía. */
const abierto = ref<number>();
const tentativo = ref<number>();

function nivelQueContiene(valor: number | undefined) {
  if (valor === undefined) return -1;
  let i = -1;
  props.niveles.forEach((n, k) => {
    if (n.desde <= valor + 1e-9) i = k;
  });
  return i;
}

/** Número que se ve marcado: el borrador o, si no hay, el confirmado. */
const marcado = computed(() => tentativo.value ?? props.valor);
const activo = computed(() => nivelQueContiene(marcado.value));

/** Nivel desplegado: el tocado o, si no, el que contiene el puntaje. */
const visible = computed(() => abierto.value ?? (activo.value >= 0 ? activo.value : -1));
const nivel = computed(() => (visible.value >= 0 ? props.niveles[visible.value] : undefined));
const numeros = computed(() => (nivel.value ? valoresDeRango(nivel.value.desde, nivel.value.puntos) : []));
const clase = (i: number) => claseNivelPorPosicion(i, props.niveles.length);
const nombreMarcado = computed(() => (activo.value >= 0 ? props.niveles[activo.value]?.nombre : ''));
/** Hay un número elegido distinto del ya confirmado. */
const pendiente = computed(() => tentativo.value !== undefined && tentativo.value !== props.valor);

function abrir(i: number) {
  abierto.value = i;
  // Cambiar de nivel descarta un borrador de otro nivel (no queda un número fuera de rango).
  if (nivelQueContiene(tentativo.value) !== i) tentativo.value = undefined;
}

function marcar(v: number) {
  tentativo.value = v;
}

function aceptar() {
  const v = marcado.value;
  if (v === undefined || nivelQueContiene(v) !== visible.value) return;
  emit('elegir', v);
}

watch(
  () => props.valor,
  () => {
    abierto.value = undefined;
    tentativo.value = undefined;
  },
);
watch(visible, () => nextTick(() => emit('layout')), { flush: 'post' });
</script>

<template>
  <div class="semfa-rango">
    <div
      :aria-label="etiqueta"
      :style="{ '--semfa-cols': niveles.length }"
      class="semfa-puntajes semfa-rango__fila semfa-rango__fila--niveles"
      role="radiogroup"
    >
      <button
        v-for="(n, i) in niveles"
        :key="n.desde"
        :aria-checked="activo === i"
        :class="[clase(i), { 'is-activo': activo === i, 'is-abierto': visible === i && activo !== i }]"
        class="semfa-puntaje semfa-rango__nivel"
        role="radio"
        type="button"
        @click="abrir(i)"
      >
        <span class="semfa-rango__nombre">{{ n.nombre }}</span>
        <span class="semfa-rango__rango">{{ n.desde }}–{{ n.puntos }}</span>
      </button>
    </div>

    <p v-if="nivel" :class="clase(visible)" class="semfa-rango__descripcion" tabindex="0">
      <b class="semfa-nivel-texto">{{ nivel.nombre }} {{ nivel.desde }}–{{ nivel.puntos }}.</b>
      {{ nivel.descripcion || 'Sin descripción.' }}
    </p>
    <p v-else class="semfa-rango__descripcion semfa-rango__descripcion--ayuda">Toca un nivel y elige el puntaje.</p>

    <div
      v-if="nivel"
      :aria-label="`Puntaje de ${nivel.nombre}`"
      :style="{ '--semfa-cols': Math.min(numeros.length, 6) + 2 }"
      class="semfa-puntajes semfa-rango__fila semfa-rango__fila--numeros"
      role="radiogroup"
    >
      <button
        v-for="v in numeros"
        :key="v"
        :aria-checked="marcado === v"
        :class="[clase(visible), { 'is-activo': marcado === v }]"
        class="semfa-puntaje semfa-rango__numero"
        role="radio"
        type="button"
        @click="marcar(v)"
      >
        {{ v }}
      </button>
      <!-- Solo «Aceptar» califica y pasa al siguiente criterio (en la misma fila: no suma alto). -->
      <button
        :aria-label="marcado !== undefined && activo === visible ? `Aceptar ${marcado} · ${nombreMarcado}` : 'Aceptar'"
        :class="{ 'is-pendiente': pendiente }"
        :disabled="marcado === undefined || activo !== visible"
        class="semfa-rango__aceptar"
        type="button"
        @click="aceptar"
      >
        {{ pendiente || valor === undefined ? 'Aceptar' : 'Aceptado ✓' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.semfa-rango {
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 1dvh, 8px);
}

/* Filas de botones: alto que reparte la hoja (`--semfa-alto`), entre un mínimo y un máximo. */
.semfa-rango__fila {
  display: grid;
  flex: none;
  grid-template-columns: repeat(var(--semfa-cols), minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: clamp(3px, 1vw, 8px);
}

.semfa-rango__fila--niveles {
  --semfa-min: 40px;
  --semfa-max: 70px;

  height: clamp(var(--semfa-min), var(--semfa-alto, var(--semfa-max)), var(--semfa-max));
}

.semfa-rango__fila--numeros {
  --semfa-min: 36px;
  --semfa-max: 60px;

  height: clamp(var(--semfa-min), var(--semfa-alto, var(--semfa-max)), var(--semfa-max));
}

.semfa-rango__nivel {
  flex-direction: column;
  gap: 1px;
  min-height: 0;
  padding: 2px 1px;
  line-height: 1.15;
  text-align: center;
  border-radius: clamp(8px, 1.2dvh, 14px);
}

.semfa-rango__nivel:not(.is-activo) {
  background: hsl(var(--semfa-nivel) / 10%);
  border-color: hsl(var(--semfa-nivel) / 45%);
}

.semfa-rango__nivel.is-abierto {
  background: hsl(var(--semfa-nivel) / 22%);
  border-color: hsl(var(--semfa-nivel));
  border-width: 2px;
}

.semfa-rango__nombre {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: clamp(9.5px, min(2.9vw, 1.8dvh), 14px);
  font-weight: 700;
}

.semfa-rango__rango {
  font-size: clamp(10px, min(3vw, 1.9dvh), 14px);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.semfa-rango__numero {
  min-height: 0;
  height: 100%;
  font-size: clamp(15px, min(2.8dvh, 5vw), 24px);
  border-radius: clamp(8px, 1.2dvh, 14px);
}

.semfa-rango__descripcion {
  margin: 0;
  font-size: clamp(11.5px, min(2dvh, 3.4vw), 15px);
  line-height: 1.3;
}

.semfa-rango__descripcion--ayuda {
  color: hsl(var(--muted-foreground));
}

.semfa-rango__aceptar {
  grid-column: span 2;
  min-width: 0;
  height: 100%;
  padding: 0 6px;
  font-size: clamp(12px, min(2.3dvh, 3.8vw), 16px);
  font-weight: 700;
  color: hsl(var(--primary));
  cursor: pointer;
  background: hsl(var(--primary) / 12%);
  border: 1px solid hsl(var(--primary) / 45%);
  border-radius: clamp(8px, 1.2dvh, 14px);
  transition: background 0.15s, transform 0.1s;
}

.semfa-rango__aceptar.is-pendiente {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border-color: hsl(var(--primary));
  box-shadow: 0 3px 0 hsl(var(--primary) / 45%);
}

.semfa-rango__aceptar:active:not(:disabled) {
  transform: translateY(1px);
}

.semfa-rango__aceptar:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/*
 * Pantallas bajas: la descripción ocupa como mucho 3 líneas y, si es más larga, se
 * desplaza dentro de su propio recuadro (antes se recortaba y no se podía leer entera).
 * Su alto no cambia al desplazar, así que no altera el ajuste sin scroll de la hoja.
 */
@media (max-height: 699px) {
  .semfa-rango__descripcion {
    max-height: 3.9em; /* 3 líneas × line-height 1.3 */
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
}

@media (max-height: 599px) {
  .semfa-rango {
    gap: 3px;
  }

  .semfa-rango__fila--niveles {
    --semfa-min: 36px;
  }

  .semfa-rango__fila--numeros {
    --semfa-min: 32px;
  }
}
</style>
