<script lang="ts" setup>
/**
 * Traslado de un proyecto a otra categoría de la misma actividad.
 *
 * Las evaluaciones se dieron con la rúbrica y frente a los proyectos de la
 * categoría actual, así que no valen en la nueva: el backend las archiva y crea
 * una inscripción nueva. Si hay evaluaciones, hay que confirmarlo expresamente.
 */
import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Inscripcion } from '#/api/inscripciones';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Checkbox } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'InscripcionTrasladoModal' });

const props = defineProps<{
  /** Carrera del proyecto, para marcar las categorías de su carrera. */
  carreraDelProyecto: string;
  guardando: boolean;
  inscripcion: Inscripcion | null;
  /** Inscripciones activas, para contar proyectos por categoría. */
  inscripciones: Inscripcion[];
}>();

const emit = defineEmits<{ trasladar: [idCategoriaActividad: number] }>();

const visible = defineModel<boolean>('open', { required: true });

const categorias = ref<CategoriaActividad[]>([]);
const destino = ref<number>();
const entiendo = ref(false);
const intentoGuardar = ref(false);

const evaluaciones = computed(() => props.inscripcion?.evaluaciones ?? 0);

const opciones = computed(() => {
  const carrera = normalizarTexto(limpiarEspacios(props.carreraDelProyecto));
  return categorias.value
    .filter(
      (c) =>
        c.idActividad === props.inscripcion?.idActividad &&
        c.idCategoriaActividad !== props.inscripcion?.idCategoriaActividad,
    )
    .map((c) => ({
      etiqueta: nombrePropio(c.nombre),
      inscritos: props.inscripciones.filter(
        (i) => i.idCategoriaActividad === c.idCategoriaActividad,
      ).length,
      sugerida: !!carrera && normalizarTexto(c.nombre).startsWith(carrera),
      valor: c.idCategoriaActividad,
    }))
    .sort(
      (a, b) =>
        Number(b.sugerida) - Number(a.sugerida) || a.etiqueta.localeCompare(b.etiqueta, 'es'),
    );
});

const destinoElegido = computed(() => opciones.value.find((o) => o.valor === destino.value));

const errores = computed(() => ({
  destino: destino.value ? '' : 'Elija la categoría destino.',
  entiendo:
    evaluaciones.value > 0 && !entiendo.value
      ? 'Confirme que entiende que se archivarán las evaluaciones.'
      : '',
}));

watch(visible, async (abierto) => {
  if (!abierto) {
    return;
  }
  destino.value = undefined;
  entiendo.value = false;
  intentoGuardar.value = false;
  categorias.value = (await listarCategoriasActividad()) ?? [];
});

function guardar() {
  intentoGuardar.value = true;
  if (!Object.values(errores.value).some(Boolean)) {
    emit('trasladar', destino.value!);
  }
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="false"
    :guardando="guardando"
    :hay-cambios="destino !== undefined"
    :permitir-continuar="false"
    :width="720"
    icono="lucide:arrow-right-left"
    subtitulo="Mueve el proyecto a otra categoría de la misma actividad."
    titulo="Trasladar proyecto"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="min-w-0">
        <div class="line-clamp-2 text-base font-medium leading-snug">
          {{ limpiarEspacios(inscripcion?.nombreParticipante) }}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span class="rounded-full bg-muted px-2 py-0.5">
            {{ nombrePropio(inscripcion?.nombreCategoriaActividad) }}
          </span>
          <IconifyIcon class="size-3.5 text-muted-foreground" icon="lucide:arrow-right" />
          <span
            :class="destinoElegido ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
            class="rounded-full px-2 py-0.5"
          >
            {{ destinoElegido?.etiqueta ?? 'Categoría destino' }}
          </span>
        </div>
      </div>
    </template>

    <div class="mb-1 text-sm font-medium">Categoría destino</div>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="o in opciones"
        :key="o.valor"
        :class="{ 'is-activo': destino === o.valor }"
        :disabled="guardando"
        :title="o.sugerida ? 'De la carrera del proyecto' : ''"
        class="semfa-chip"
        type="button"
        @click="destino = o.valor"
      >
        <IconifyIcon v-if="o.sugerida" class="size-3.5 text-amber-500" icon="lucide:star" />
        {{ o.etiqueta }}
        <span class="semfa-chip__total">{{ o.inscritos }}</span>
      </button>
      <span v-if="opciones.length === 0" class="text-sm text-amber-600">
        La actividad no tiene otras categorías.
      </span>
    </div>
    <p v-if="intentoGuardar && errores.destino" class="mb-0 mt-1 text-sm text-red-600">
      {{ errores.destino }}
    </p>

    <!-- Consecuencia del traslado -->
    <div
      v-if="evaluaciones > 0"
      class="mt-4 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-500"
    >
      <div class="flex items-start gap-2">
        <IconifyIcon class="mt-0.5 size-4 shrink-0" icon="lucide:triangle-alert" />
        <span>
          Tiene <b>{{ evaluaciones }}</b> evaluación(es). Se calificaron con la rúbrica
          y frente a los proyectos de su categoría actual, así que <b>se archivarán</b>
          (quedan como historial) y el proyecto <b>deberá ser evaluado de nuevo</b> en
          la categoría destino.
        </span>
      </div>
      <Checkbox v-model:checked="entiendo" :disabled="guardando" class="ml-6 mt-2">
        Entiendo que se archivarán sus {{ evaluaciones }} evaluación(es).
      </Checkbox>
      <p v-if="intentoGuardar && errores.entiendo" class="mb-0 ml-6 mt-1 text-red-600">
        {{ errores.entiendo }}
      </p>
    </div>
    <p v-else class="mb-0 mt-4 text-sm text-muted-foreground">
      Aún no tiene evaluaciones: el traslado no pierde nada.
    </p>
  </SemfaModalForm>
</template>
