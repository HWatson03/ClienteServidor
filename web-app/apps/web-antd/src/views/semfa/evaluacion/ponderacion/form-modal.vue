<script lang="ts" setup>
import type { Ponderacion, PonderacionForm } from '#/api/ponderaciones';
import type { Pregunta } from '#/api/preguntas';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItem, InputNumber, Select } from 'ant-design-vue';

import { listarPreguntas } from '#/api/preguntas';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'PonderacionFormModal' });

const props = defineProps<{
  guardando: boolean;
  ponderacion: null | Ponderacion;
  /** Ponderaciones activas: un número no se repite en la misma pregunta. */
  ponderaciones: Ponderacion[];
}>();

const emit = defineEmits<{
  guardar: [form: PonderacionForm & { idPonderacion?: number }, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.ponderacion !== null);

const preguntaRef = ref<{ focus: () => void }>();

const cargando = ref(false);
const preguntas = ref<Pregunta[]>([]);

const idPregunta = ref<number>();
/**
 * En alta, varios valores (el legacy recibía un texto separado por comas y creaba
 * un registro por cada uno); en edición, siempre uno.
 */
const numeros = ref<number[]>([]);
const otroValor = ref<number>();

const intentoGuardar = ref(false);
const original = ref('');
const registradas = ref(0);

const GRILLA = Array.from({ length: 11 }, (_, i) => i);
const ATAJOS = [
  { desde: 1, etiqueta: '1 a 5', hasta: 5 },
  { desde: 1, etiqueta: '1 a 10', hasta: 10 },
  { desde: 0, etiqueta: '0 a 10', hasta: 10 },
];

function instantanea() {
  return JSON.stringify([idPregunta.value, [...numeros.value].sort((a, b) => a - b)]);
}

const hayCambios = computed(() => instantanea() !== original.value);

// ---------------------------------------------------------------- pregunta

/** Preguntas agrupadas por su categoría de criterio. */
const opcionesPregunta = computed(() => {
  const grupos = new Map<string, Pregunta[]>();
  for (const p of preguntas.value) {
    const grupo = `${p.categoriaCriterio ?? 'Sin categoría'} · ${p.tipoProyecto ?? ''}`;
    grupos.set(grupo, [...(grupos.get(grupo) ?? []), p]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([grupo, lista]) => ({
      label: grupo,
      options: lista.map((p) => ({
        busqueda: `${p.nombre ?? ''} ${grupo}`,
        label: limpiarEspacios(p.nombre) || '—',
        value: p.idPregunta,
      })),
    }));
});

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

const preguntaElegida = computed(() =>
  preguntas.value.find((p) => p.idPregunta === idPregunta.value),
);

/** Números que la pregunta ya tiene (sin contar la ponderación que se edita). */
const existentes = computed(
  () =>
    new Set(
      props.ponderaciones
        .filter(
          (p) =>
            p.idPregunta === idPregunta.value &&
            p.idPonderacion !== props.ponderacion?.idPonderacion,
        )
        .map((p) => p.numero ?? -1),
    ),
);

watch(idPregunta, () => {
  // Al cambiar de pregunta se quitan los valores que ella ya tiene.
  numeros.value = numeros.value.filter((n) => !existentes.value.has(n));
});

// ---------------------------------------------------------------- valores

function alternar(n: number) {
  if (existentes.value.has(n)) return;
  if (esEdicion.value) {
    numeros.value = [n];
    return;
  }
  numeros.value = numeros.value.includes(n)
    ? numeros.value.filter((x) => x !== n)
    : [...numeros.value, n].sort((a, b) => a - b);
}

function aplicarAtajo(desde: number, hasta: number) {
  numeros.value = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).filter(
    (n) => !existentes.value.has(n),
  );
}

/** Valores fuera de la grilla (p. ej. 15, 20). */
function agregarOtro() {
  const n = otroValor.value;
  if (n === undefined || n === null || !Number.isInteger(n) || n < 0) return;
  alternar(n);
  otroValor.value = undefined;
}

const extras = computed(() => numeros.value.filter((n) => n > 10));

const errores = computed(() => ({
  numeros: numeros.value.length > 0 ? '' : 'Elija al menos un valor.',
  pregunta: idPregunta.value ? '' : 'Elija la pregunta.',
}));

// ---------------------------------------------------------------- ciclo del modal

async function cargarPreguntas() {
  cargando.value = true;
  try {
    preguntas.value = (await listarPreguntas()) ?? [];
  } finally {
    cargando.value = false;
  }
}

function cargar(p: null | Ponderacion) {
  idPregunta.value = p?.idPregunta ?? undefined;
  numeros.value = p?.numero === null || p?.numero === undefined ? [] : [p.numero];
  otroValor.value = undefined;
  intentoGuardar.value = false;
  original.value = instantanea();
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar(props.ponderacion);
  cargarPreguntas();
  setTimeout(() => preguntaRef.value?.focus(), 120);
});

function reiniciar(creadas: number) {
  registradas.value += creadas;
  cargar(null);
  setTimeout(() => preguntaRef.value?.focus(), 120);
}

defineExpose({ reiniciar });

function guardar(continuar: boolean) {
  intentoGuardar.value = true;
  if (Object.values(errores.value).some(Boolean)) {
    return;
  }
  emit(
    'guardar',
    {
      idPonderacion: props.ponderacion?.idPonderacion,
      idPregunta: idPregunta.value,
      numeros: esEdicion.value ? numeros.value.slice(0, 1) : numeros.value,
    },
    continuar,
  );
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el valor de esta ponderación.'
        : 'Valores con los que el jurado responde la pregunta; puede marcar varios.'
    "
    :texto-contador="['ponderación registrada', 'ponderaciones registradas']"
    :titulo="esEdicion ? 'Modificar ponderación' : 'Registrar ponderaciones'"
    :width="760"
    icono="lucide:scale"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="min-w-0">
        <div
          :class="{ 'text-muted-foreground': !preguntaElegida }"
          class="line-clamp-2 text-base font-medium leading-snug"
        >
          {{ limpiarEspacios(preguntaElegida?.nombre) || 'Pregunta sin elegir' }}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-1">
          <span class="text-sm text-muted-foreground">
            {{ numeros.length === 0 ? 'Sin valores' : 'Valores:' }}
          </span>
          <span
            v-for="n in numeros"
            :key="n"
            class="rounded bg-primary/10 px-1.5 text-sm font-medium text-primary tabular-nums"
          >
            {{ n }}
          </span>
        </div>
      </div>
    </template>

    <Form :disabled="guardando" layout="vertical">
      <FormItem
        :help="intentoGuardar ? errores.pregunta : undefined"
        :validate-status="intentoGuardar && errores.pregunta ? 'error' : ''"
        extra="Agrupadas por categoría de criterio; escriba para buscar."
        label="Pregunta"
        required
      >
        <Select
          ref="preguntaRef"
          v-model:value="idPregunta"
          :filter-option="filtrar"
          :loading="cargando"
          :not-found-content="cargando ? undefined : 'No hay preguntas: regístrelas en «Pregunta»'"
          :options="opcionesPregunta"
          placeholder="Buscar pregunta…"
          show-search
          size="large"
        />
      </FormItem>

      <FormItem
        :help="intentoGuardar ? errores.numeros : undefined"
        :validate-status="intentoGuardar && errores.numeros ? 'error' : ''"
        :label="esEdicion ? 'Valor' : 'Valores'"
        required
      >
        <div class="flex flex-col gap-2">
          <div v-if="!esEdicion" class="flex flex-wrap items-center gap-1.5 text-xs">
            <span class="text-muted-foreground">Atajos:</span>
            <Button
              v-for="a in ATAJOS"
              :key="a.etiqueta"
              :disabled="guardando || !idPregunta"
              class="semfa-btn semfa-btn--suave-primario"
              size="small"
              @click="aplicarAtajo(a.desde, a.hasta)"
            >
              {{ a.etiqueta }}
            </Button>
            <Button
              v-if="numeros.length > 0"
              :disabled="guardando"
              class="semfa-btn semfa-btn--neutro"
              size="small"
              @click="numeros = []"
            >
              Limpiar
            </Button>
          </div>

          <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
            <button
              v-for="n in GRILLA"
              :key="n"
              :class="{ 'is-activo': numeros.includes(n) }"
              :disabled="guardando || existentes.has(n)"
              :title="existentes.has(n) ? 'La pregunta ya tiene este valor' : ''"
              class="semfa-chip justify-center tabular-nums"
              type="button"
              @click="alternar(n)"
            >
              {{ n }}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted-foreground">Otro valor:</span>
            <InputNumber
              v-model:value="otroValor"
              :disabled="guardando"
              :min="0"
              :precision="0"
              class="w-24"
              @press-enter="agregarOtro"
            />
            <Button
              :disabled="guardando || otroValor === undefined || otroValor === null"
              class="semfa-btn semfa-btn--neutro"
              size="small"
              @click="agregarOtro"
            >
              <IconifyIcon class="size-3.5" icon="lucide:plus" />
              Agregar
            </Button>
            <span v-for="n in extras" :key="n" class="rounded bg-primary/10 px-1.5 text-primary tabular-nums">
              {{ n }}
            </span>
          </div>

          <p v-if="existentes.size > 0" class="mb-0 text-xs text-muted-foreground">
            Los valores desactivados ya existen en esta pregunta.
          </p>
        </div>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
