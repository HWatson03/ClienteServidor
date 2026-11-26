<script lang="ts" setup>
import type { Actividad } from '#/api/actividades';
import type { CategoriaActividad } from '#/api/categorias-actividad';
import type {
  JuradoAsignacion,
  JuradoAsignacionForm,
} from '#/api/jurado-asignaciones';
import type { Jurado } from '#/api/jurados';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Select } from 'ant-design-vue';

import { listarActividades } from '#/api/actividades';
import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarJurados } from '#/api/jurados';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { useActividadTrabajoStore } from '#/store';
import {
  inicialesDeNombre,
  limpiarEspacios,
  nombrePropio,
  normalizarTexto,
} from '#/utils/formato';

defineOptions({ name: 'JuradoAsignacionFormModal' });

const props = defineProps<{
  asignacion: JuradoAsignacion | null;
  /** Asignaciones activas: cuentan jurados por categoría y evitan duplicados. */
  asignaciones: JuradoAsignacion[];
  guardando: boolean;
}>();

const emit = defineEmits<{
  /**
   * Una asignación por pareja jurado × destino. En edición siempre es una sola.
   * `continuar`: tras guardar, el modal queda abierto para otra tanda.
   */
  guardar: [asignaciones: JuradoAsignacionForm[], continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.asignacion !== null);

/** Destino «actividad completa» (sin categoría) en los chips. */
const ACTIVIDAD_COMPLETA = 0;

const cargandoOpciones = ref(false);
const actividades = ref<Actividad[]>([]);
const categorias = ref<CategoriaActividad[]>([]);
const jurados = ref<Jurado[]>([]);

const juradosRef = ref<{ focus: () => void }>();

const trabajo = useActividadTrabajoStore();
const idActividad = ref<number>();
/** Categorías elegidas, o `[ACTIVIDAD_COMPLETA]`. En edición, como mucho una. */
const destinos = ref<number[]>([]);
const idJurados = ref<number[]>([]);

/** Mensajes de validación propios: aquí no hay un campo por regla. */
const intentoGuardar = ref(false);

/** Valores al abrir el modal, para saber si hay cambios sin guardar. */
const original = ref('');

/** Asignaciones creadas con «Guardar y nuevo» desde que se abrió el modal. */
const registradas = ref(0);

function instantanea() {
  return JSON.stringify([
    idActividad.value,
    [...destinos.value].sort(),
    [...idJurados.value].sort(),
  ]);
}

const hayCambios = computed(() => instantanea() !== original.value);

// ---------------------------------------------------------------- opciones

/** Asignaciones de otras filas (en edición se excluye la propia). */
const otras = computed(() =>
  props.asignaciones.filter(
    (a) => a.idJuradoAsignacion !== props.asignacion?.idJuradoAsignacion,
  ),
);

/** Clave de destino de una asignación: su categoría, o la actividad completa. */
function claveDestino(a: JuradoAsignacion) {
  return a.idCategoriaActividad ?? ACTIVIDAD_COMPLETA;
}

/** «jurado:destino» ya ocupados en la actividad elegida (mismas reglas que el backend). */
const ocupadas = computed(() => {
  const set = new Set<string>();
  for (const a of otras.value) {
    if (a.idActividad === idActividad.value || a.idActividad === null) {
      set.add(`${a.idJurado}:${claveDestino(a)}`);
    }
  }
  return set;
});

const categoriasDeActividad = computed(() =>
  categorias.value
    .filter((c) => c.idActividad === idActividad.value)
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es')),
);

/** Chips de destino con los jurados que ya tiene cada uno. */
const chipsDestino = computed(() => {
  const conteo = new Map<number, number>();
  for (const a of otras.value) {
    if (a.idActividad === idActividad.value) {
      conteo.set(claveDestino(a), (conteo.get(claveDestino(a)) ?? 0) + 1);
    }
  }
  return [
    {
      etiqueta: 'Toda la actividad',
      jurados: conteo.get(ACTIVIDAD_COMPLETA) ?? 0,
      valor: ACTIVIDAD_COMPLETA,
    },
    ...categoriasDeActividad.value.map((c) => ({
      etiqueta: nombrePropio(c.nombre),
      jurados: conteo.get(c.idCategoriaActividad) ?? 0,
      valor: c.idCategoriaActividad,
    })),
  ];
});

const nombreDestino = computed(
  () => new Map(chipsDestino.value.map((c) => [c.valor, c.etiqueta])),
);

const opcionesJurado = computed(() =>
  jurados.value.map((j) => {
    // Un jurado ya asignado a todos los destinos elegidos no aporta nada.
    const yaEnTodos =
      destinos.value.length > 0 &&
      destinos.value.every((d) => ocupadas.value.has(`${j.idJurado}:${d}`));
    const total = otras.value.filter((a) => a.idJurado === j.idJurado).length;
    return {
      busqueda: `${j.nombreCompleto ?? ''} ${j.ci ?? ''}`,
      ci: j.ci,
      disabled: yaEnTodos,
      iniciales: inicialesDeNombre(j.nombreCompleto),
      label: j.nombreCompleto ?? '—',
      total,
      value: j.idJurado,
      yaEnTodos,
    };
  }),
);

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

// ---------------------------------------------------------------- resultado

/** Parejas jurado × destino a crear, separando las que ya existen. */
const plan = computed(() => {
  const nuevas: { destino: number; idJurado: number }[] = [];
  const omitidas: { destino: number; idJurado: number }[] = [];
  for (const idJurado of idJurados.value) {
    for (const destino of destinos.value) {
      (ocupadas.value.has(`${idJurado}:${destino}`) ? omitidas : nuevas).push({
        destino,
        idJurado,
      });
    }
  }
  return { nuevas, omitidas };
});

const nombreJurado = computed(
  () => new Map(jurados.value.map((j) => [j.idJurado, j.nombreCompleto ?? '—'])),
);

const errores = computed(() => ({
  actividad: idActividad.value ? '' : 'Elija la actividad.',
  destinos: destinos.value.length > 0 ? '' : 'Elija al menos una categoría o «Toda la actividad».',
  jurados:
    idJurados.value.length === 0
      ? 'Elija al menos un jurado.'
      : plan.value.nuevas.length === 0
        ? 'Todas las combinaciones elegidas ya existen.'
        : '',
}));

// ---------------------------------------------------------------- interacción

function elegirActividad(id: number) {
  if (id === idActividad.value) {
    return;
  }
  idActividad.value = id;
  destinos.value = [];
}

/**
 * En un alta se pueden marcar varias categorías; «Toda la actividad» es
 * excluyente con ellas. En edición el chip funciona como opción única.
 */
function alternarDestino(valor: number) {
  if (esEdicion.value) {
    destinos.value = [valor];
    return;
  }
  if (destinos.value.includes(valor)) {
    destinos.value = destinos.value.filter((d) => d !== valor);
  } else if (valor === ACTIVIDAD_COMPLETA) {
    destinos.value = [ACTIVIDAD_COMPLETA];
  } else {
    destinos.value = [
      ...destinos.value.filter((d) => d !== ACTIVIDAD_COMPLETA),
      valor,
    ];
  }
  juradosRef.value?.focus();
}

// ---------------------------------------------------------------- ciclo del modal

/**
 * Los tres endpoints devuelven solo registros activos, cosa que el legacy no
 * garantizaba: sus desplegables venían de `listarActividades()` y
 * `listarParticipantes()`, que no filtran por estado. Se recargan en cada
 * apertura para incluir lo registrado desde otras pantallas.
 */
async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    [actividades.value, categorias.value, jurados.value] = await Promise.all([
      listarActividades(),
      listarCategoriasActividad(),
      listarJurados(),
    ]);
    // Solo la actividad de trabajo (y la propia, al editar): así queda elegida sola.
    actividades.value = actividades.value.filter(
      (a) => a.idActividad === trabajo.idActividad || a.idActividad === idActividad.value,
    );
    // Con una sola actividad no hace falta elegirla.
    if (!idActividad.value && actividades.value.length === 1) {
      idActividad.value = actividades.value[0]!.idActividad;
      original.value = instantanea();
    }
  } finally {
    cargandoOpciones.value = false;
  }
}

function cargar(actividad: number | undefined, destinosIniciales: number[], juradosIniciales: number[]) {
  idActividad.value = actividad;
  destinos.value = destinosIniciales;
  idJurados.value = juradosIniciales;
  intentoGuardar.value = false;
  original.value = instantanea();
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  const a = props.asignacion;
  cargar(
    a?.idActividad ?? undefined,
    a ? [a.idCategoriaActividad ?? ACTIVIDAD_COMPLETA] : [],
    a?.idJurado ? [a.idJurado] : [],
  );
  cargarOpciones();
});

/** Tras «Guardar y nuevo»: se conserva la actividad y se limpia el resto. */
function reiniciar(creadas: number) {
  registradas.value += creadas;
  cargar(idActividad.value, [], []);
}

defineExpose({ reiniciar });

/** `SemfaModalForm` ya filtró si se puede guardar; aquí solo se valida y se emite. */
function guardar(continuar: boolean) {
  intentoGuardar.value = true;
  if (Object.values(errores.value).some(Boolean)) {
    return;
  }
  const asignaciones = plan.value.nuevas.map(({ destino, idJurado }) => ({
    // Siempre con actividad: el panel del jurado la resuelve con un `join`
    // interno y una fila sin ella no le aparecería.
    idActividad: idActividad.value,
    idCategoriaActividad: destino === ACTIVIDAD_COMPLETA ? undefined : destino,
    idJurado,
  }));
  emit('guardar', asignaciones, continuar);
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:pencil' : 'lucide:user-round-check'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el jurado o la categoría que evalúa.'
        : 'Elija dónde evaluarán y a qué jurados asignar; puede marcar varios.'
    "
    :texto-contador="['asignación creada', 'asignaciones creadas']"
    :titulo="esEdicion ? 'Modificar asignación' : 'Asignar jurados'"
    :width="820"
    @guardar="guardar"
  >
    <!-- Vista previa: qué se va a guardar -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
        >
          {{ plan.nuevas.length }}
        </span>
        <div class="min-w-0">
          <div class="text-base font-medium">
            <template v-if="esEdicion">
              {{ nombreJurado.get(idJurados[0] ?? -1) ?? 'Jurado sin elegir' }}
            </template>
            <template v-else-if="plan.nuevas.length === 0">
              Nada que guardar todavía
            </template>
            <template v-else>
              {{ plan.nuevas.length }}
              {{ plan.nuevas.length === 1 ? 'asignación nueva' : 'asignaciones nuevas' }}
            </template>
          </div>
          <div class="truncate text-sm text-muted-foreground">
            <template v-if="destinos.length === 0">Sin categoría elegida</template>
            <template v-else>
              {{ destinos.map((d) => nombreDestino.get(d)).join(' · ') }}
            </template>
            <span v-if="plan.omitidas.length > 0" class="text-amber-600">
              · {{ plan.omitidas.length }} ya existían y se omitirán
            </span>
          </div>
        </div>
      </div>
    </template>

    <Form :disabled="guardando" layout="vertical">
      <!-- Actividad -->
      <FormItem
        :help="intentoGuardar ? errores.actividad : ''"
        :validate-status="intentoGuardar && errores.actividad ? 'error' : ''"
        label="Actividad"
        required
      >
        <div class="flex flex-wrap gap-2">
          <button
            v-for="a in actividades"
            :key="a.idActividad"
            :class="{ 'is-activo': idActividad === a.idActividad }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="elegirActividad(a.idActividad)"
          >
            <IconifyIcon class="size-3.5" icon="lucide:calendar-days" />
            {{ limpiarEspacios(a.nombre) }}
          </button>
          <span
            v-if="!cargandoOpciones && actividades.length === 0"
            class="text-sm text-amber-600"
          >
            No hay actividades activas: regístrelas primero en Actividad.
          </span>
        </div>
      </FormItem>

      <!-- Destinos: categorías de la actividad o la actividad completa -->
      <FormItem
        v-if="idActividad"
        :extra="
          esEdicion
            ? 'El número indica cuántos jurados tiene ya cada categoría.'
            : 'Puede marcar varias. El número indica cuántos jurados tiene ya cada una.'
        "
        :help="intentoGuardar ? errores.destinos : undefined"
        :validate-status="intentoGuardar && errores.destinos ? 'error' : ''"
        :label="esEdicion ? 'Categoría' : 'Categorías'"
        required
      >
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in chipsDestino"
            :key="c.valor"
            :class="{ 'is-activo': destinos.includes(c.valor) }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="alternarDestino(c.valor)"
          >
            <IconifyIcon
              v-if="!esEdicion"
              :icon="destinos.includes(c.valor) ? 'lucide:square-check' : 'lucide:square'"
              class="size-3.5"
            />
            {{ c.etiqueta }}
            <span
              :class="{ 'text-amber-600': c.jurados === 0 && !destinos.includes(c.valor) }"
              :title="c.jurados === 0 ? 'Sin jurados asignados' : ''"
              class="semfa-chip__total"
            >
              {{ c.jurados }}
            </span>
          </button>
        </div>
      </FormItem>

      <!-- Jurados -->
      <FormItem
        :extra="
          esEdicion
            ? undefined
            : 'Puede elegir varios. Los que ya están en todas las categorías marcadas aparecen desactivados.'
        "
        :help="intentoGuardar ? errores.jurados : undefined"
        :validate-status="intentoGuardar && errores.jurados ? 'error' : ''"
        :label="esEdicion ? 'Jurado' : 'Jurados'"
        required
      >
        <Select
          ref="juradosRef"
          :filter-option="filtrar"
          :loading="cargandoOpciones"
          :max-tag-count="6"
          :mode="esEdicion ? undefined : 'multiple'"
          :options="opcionesJurado"
          :value="esEdicion ? idJurados[0] : idJurados"
          placeholder="Buscar jurado por nombre o CI…"
          show-search
          size="large"
          @update:value="
            (v: any) => (idJurados = v === undefined ? [] : Array.isArray(v) ? v : [v])
          "
        >
          <template #option="{ ci, iniciales: ini, label, total, yaEnTodos }">
            <div class="flex items-center gap-3 py-0.5">
              <SemfaAvatar :texto="ini" tamano="md" />
              <div class="min-w-0 flex-1">
                <div class="truncate">{{ label }}</div>
                <div class="text-xs text-muted-foreground">CI {{ ci ?? '—' }}</div>
              </div>
              <span
                v-if="yaEnTodos"
                class="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600"
              >
                Ya asignado
              </span>
              <span
                v-else
                :class="total === 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'"
                class="shrink-0 rounded-full px-2 py-0.5 text-xs"
              >
                {{ total === 0 ? 'Sin asignar' : `${total} asignación${total === 1 ? '' : 'es'}` }}
              </span>
            </div>
          </template>
        </Select>
      </FormItem>

      <p
        v-if="!cargandoOpciones && jurados.length === 0"
        class="text-sm text-amber-600"
      >
        No hay jurados registrados: regístrelos primero en el módulo Jurado.
      </p>
    </Form>
  </SemfaModalForm>
</template>
