<script lang="ts" setup>
import type { Actividad } from '#/api/actividades';
import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Inscripcion, InscripcionForm } from '#/api/inscripciones';
import type { Participante } from '#/api/participantes';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItem, Input, Select } from 'ant-design-vue';

import { listarActividades } from '#/api/actividades';
import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarParticipantes } from '#/api/participantes';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { useActividadTrabajoStore } from '#/store';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';
import { opcionesJornada } from '#/utils/jornadas';

defineOptions({ name: 'InscripcionFormModal' });

const props = defineProps<{
  guardando: boolean;
  inscripcion: Inscripcion | null;
  /** Inscripciones activas: duplicados y dónde está ya cada proyecto. */
  inscripciones: Inscripcion[];
}>();

const emit = defineEmits<{
  /** Una por proyecto; en edición, siempre una. */
  guardar: [inscripciones: InscripcionForm[], continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.inscripcion !== null);

const cargandoOpciones = ref(false);
const trabajo = useActividadTrabajoStore();
const actividades = ref<Actividad[]>([]);
const categorias = ref<CategoriaActividad[]>([]);
const participantes = ref<Participante[]>([]);

const proyectosRef = ref<{ focus: () => void }>();

const idActividad = ref<number>();
const idCategoria = ref<number>();
const idProyectos = ref<number[]>([]);
/** Feria de varios días: día en que se presentan (todos los elegidos) y stand (si es uno). */
const jornada = ref<null | number>(null);
const stand = ref('');
const LIMITE_STAND = 30;

/** Mensajes propios: aquí no hay un campo por regla. */
const intentoGuardar = ref(false);
const original = ref('');
const registradas = ref(0);

function instantanea() {
  return JSON.stringify([idActividad.value, idCategoria.value, [...idProyectos.value].sort(), jornada.value, stand.value]);
}

const hayCambios = computed(() => instantanea() !== original.value);

// ---------------------------------------------------------------- opciones

const otras = computed(() =>
  props.inscripciones.filter((i) => i.idInscripcion !== props.inscripcion?.idInscripcion),
);

const categoriasDeActividad = computed(() =>
  categorias.value
    .filter((c) => c.idActividad === idActividad.value)
    .map((c) => ({
      etiqueta: nombrePropio(c.nombre),
      inscritos: otras.value.filter((i) => i.idCategoriaActividad === c.idCategoriaActividad)
        .length,
      valor: c.idCategoriaActividad,
    }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
);

const actividadElegida = computed(() => actividades.value.find((a) => a.idActividad === idActividad.value));
const jornadasActividad = computed(() => actividadElegida.value?.jornadas ?? 1);
const opcionesJornadaActividad = computed(() => opcionesJornada(actividadElegida.value));

/** El stand es de cada proyecto: solo se pide al inscribir uno. */
const pideStand = computed(() => idProyectos.value.length === 1);

const categoriaElegida = computed(() =>
  categorias.value.find((c) => c.idCategoriaActividad === idCategoria.value),
);

/** Carrera de la categoría («CARRERA - NIVEL»), para sugerir sus proyectos. */
const carreraDeCategoria = computed(() =>
  normalizarTexto(limpiarEspacios((categoriaElegida.value?.nombre ?? '').split(' - ')[0])),
);

function esDeLaCarrera(p: Participante) {
  return (
    !!carreraDeCategoria.value &&
    normalizarTexto(limpiarEspacios(p.institucion)) === carreraDeCategoria.value
  );
}

/** Dónde está inscrito ya cada proyecto. */
const inscripcionesPorProyecto = computed(() => {
  const mapa = new Map<number, Inscripcion[]>();
  for (const i of otras.value) {
    mapa.set(i.idParticipante, [...(mapa.get(i.idParticipante) ?? []), i]);
  }
  return mapa;
});

const opcionesProyecto = computed(() =>
  participantes.value
    .map((p) => {
      const suyas = inscripcionesPorProyecto.value.get(p.idParticipante) ?? [];
      // Una inscripción por proyecto y actividad (el backend responde 409).
      const enEstaActividad = suyas.find((i) => i.idActividad === idActividad.value);
      return {
        busqueda: `${p.nombre ?? ''} ${p.institucion ?? ''}`,
        carrera: nombrePropio(p.institucion),
        disabled: !!enEstaActividad,
        enEstaActividad: enEstaActividad
          ? nombrePropio(enEstaActividad.nombreCategoriaActividad)
          : '',
        enOtras: suyas.filter((i) => i.idActividad !== idActividad.value).length,
        label: limpiarEspacios(p.nombre),
        sugerido: esDeLaCarrera(p),
        value: p.idParticipante,
      };
    })
    // Los de la carrera de la categoría, primero.
    .sort(
      (a, b) =>
        Number(b.sugerido) - Number(a.sugerido) || a.label.localeCompare(b.label, 'es'),
    ),
);

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

/** Proyectos de la carrera de la categoría que aún no están inscritos en la actividad. */
const pendientesDeLaCarrera = computed(() =>
  opcionesProyecto.value.filter(
    (o) => o.sugerido && !o.enEstaActividad && !idProyectos.value.includes(o.value),
  ),
);

function agregarPendientes() {
  idProyectos.value = [...idProyectos.value, ...pendientesDeLaCarrera.value.map((o) => o.value)];
}

// ---------------------------------------------------------------- validación

const errores = computed(() => ({
  actividad: idActividad.value ? '' : 'Elija la actividad.',
  categoria: idCategoria.value ? '' : 'Elija la categoría.',
  proyectos: idProyectos.value.length > 0 ? '' : 'Elija al menos un proyecto.',
}));

// ---------------------------------------------------------------- interacción

function elegirActividad(id: number) {
  if (idActividad.value !== id) {
    idActividad.value = id;
    idCategoria.value = undefined;
  }
}

function elegirCategoria(id: number) {
  idCategoria.value = id;
  proyectosRef.value?.focus();
}

// ---------------------------------------------------------------- ciclo del modal

/**
 * Los tres `select` del legacy se armaban con `listarActividades`,
 * `listarCategoriaActividades` y `listarParticipantes`; aquí se reutilizan los
 * endpoints de los módulos ya migrados, y las categorías se filtran por la
 * actividad elegida (el backend rechaza una categoría de otra actividad).
 */
async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    const [a, c, p] = await Promise.all([
      listarActividades(),
      listarCategoriasActividad(),
      listarParticipantes(),
    ]);
    // Solo la actividad de trabajo (y la propia, al editar): así queda elegida sola.
    actividades.value = (a ?? []).filter(
      (x) => x.idActividad === trabajo.idActividad || x.idActividad === idActividad.value,
    );
    categorias.value = c ?? [];
    participantes.value = p ?? [];
    if (!idActividad.value && actividades.value.length === 1) {
      idActividad.value = actividades.value[0]!.idActividad;
      original.value = instantanea();
    }
  } finally {
    cargandoOpciones.value = false;
  }
}

function cargar(actividad?: number, categoria?: number, proyectos: number[] = []) {
  idActividad.value = actividad;
  idCategoria.value = categoria;
  idProyectos.value = proyectos;
  stand.value = '';
  intentoGuardar.value = false;
  original.value = instantanea();
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  jornada.value = props.inscripcion?.jornada ?? null;
  const i = props.inscripcion;
  cargar(i?.idActividad, i?.idCategoriaActividad, i ? [i.idParticipante] : []);
  cargarOpciones();
});

/** Tras «Guardar y nuevo» se conservan actividad, categoría y jornada. */
function reiniciar(creadas: number) {
  registradas.value += creadas;
  cargar(idActividad.value, idCategoria.value, []);
  proyectosRef.value?.focus();
}

defineExpose({ reiniciar });

function guardar(continuar: boolean) {
  intentoGuardar.value = true;
  if (Object.values(errores.value).some(Boolean)) {
    return;
  }
  emit(
    'guardar',
    idProyectos.value.map((idParticipante) => ({
      idActividad: idActividad.value,
      idCategoriaActividad: idCategoria.value,
      idInscripcion: props.inscripcion?.idInscripcion,
      idParticipante,
      jornada: jornadasActividad.value > 1 ? jornada.value : null,
      stand: pideStand.value ? limpiarEspacios(stand.value).toUpperCase() || null : null,
    })),
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
    :icono="esEdicion ? 'lucide:clipboard-pen' : 'lucide:clipboard-plus'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Aún no tiene evaluaciones: puede cambiar su proyecto o su categoría.'
        : 'Elija la categoría y los proyectos que compiten en ella; puede marcar varios.'
    "
    :texto-contador="['inscripción creada', 'inscripciones creadas']"
    :titulo="esEdicion ? 'Modificar inscripción' : 'Inscribir proyectos'"
    :width="860"
    @guardar="guardar"
  >
    <!-- Vista previa -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
        >
          {{ idProyectos.length }}
        </span>
        <div class="min-w-0">
          <div class="text-base font-medium">
            <template v-if="idProyectos.length === 0">Ningún proyecto elegido</template>
            <template v-else>
              {{ idProyectos.length }}
              {{ idProyectos.length === 1 ? 'proyecto' : 'proyectos' }}
              {{ esEdicion ? '' : 'a inscribir' }}
            </template>
          </div>
          <div class="truncate text-sm text-muted-foreground">
            {{ categoriaElegida ? nombrePropio(categoriaElegida.nombre) : 'Sin categoría elegida' }}
          </div>
        </div>
      </div>
    </template>

    <Form :disabled="guardando" layout="vertical">
      <FormItem
        :help="intentoGuardar ? errores.actividad : undefined"
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
        </div>
      </FormItem>

      <FormItem
        v-if="idActividad"
        :help="intentoGuardar ? errores.categoria : undefined"
        :validate-status="intentoGuardar && errores.categoria ? 'error' : ''"
        extra="El número indica cuántos proyectos tiene ya cada categoría."
        label="Categoría"
        required
      >
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in categoriasDeActividad"
            :key="c.valor"
            :class="{ 'is-activo': idCategoria === c.valor }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="elegirCategoria(c.valor)"
          >
            {{ c.etiqueta }}
            <span class="semfa-chip__total">{{ c.inscritos }}</span>
          </button>
          <span v-if="categoriasDeActividad.length === 0" class="text-sm text-amber-600">
            Esta actividad no tiene categorías.
          </span>
        </div>
      </FormItem>

      <FormItem
        :help="intentoGuardar ? errores.proyectos : undefined"
        :validate-status="intentoGuardar && errores.proyectos ? 'error' : ''"
        :label="esEdicion ? 'Proyecto' : 'Proyectos'"
        required
      >
        <template #extra>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>
              <IconifyIcon class="inline size-3.5 text-amber-500" icon="lucide:star" />
              primero los de la carrera de la categoría. Un proyecto ya inscrito en la
              actividad no se repite: se cambia de categoría con «Trasladar».
            </span>
            <Button
              v-if="!esEdicion && pendientesDeLaCarrera.length > 0"
              :disabled="guardando"
              class="semfa-btn semfa-btn--suave-primario"
              size="small"
              @click="agregarPendientes"
            >
              <IconifyIcon class="size-3.5" icon="lucide:list-plus" />
              Agregar los {{ pendientesDeLaCarrera.length }} sin inscribir de la carrera
            </Button>
          </div>
        </template>
        <Select
          ref="proyectosRef"
          :filter-option="filtrar"
          :loading="cargandoOpciones"
          :max-tag-count="4"
          :mode="esEdicion ? undefined : 'multiple'"
          :options="opcionesProyecto"
          :value="esEdicion ? idProyectos[0] : idProyectos"
          placeholder="Buscar proyecto por nombre o carrera…"
          show-search
          size="large"
          @update:value="
            (v: any) => (idProyectos = v === undefined ? [] : Array.isArray(v) ? v : [v])
          "
        >
          <template #option="{ label, carrera, sugerido, enEstaActividad, enOtras }">
            <div class="flex items-start gap-2 py-0.5">
              <IconifyIcon
                :class="sugerido ? 'text-amber-500' : 'text-transparent'"
                class="mt-0.5 size-3.5 shrink-0"
                icon="lucide:star"
              />
              <div class="min-w-0 flex-1">
                <div class="whitespace-normal leading-snug">{{ label }}</div>
                <div class="text-xs text-muted-foreground">{{ carrera }}</div>
              </div>
              <span
                v-if="enEstaActividad"
                class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                title="Para cambiarlo de categoría use «Trasladar» en la tabla"
              >
                Inscrito en {{ enEstaActividad }}
              </span>
              <span
                v-else-if="enOtras > 0"
                class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                En otra actividad
              </span>
              <span
                v-else
                class="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600"
              >
                Sin inscribir
              </span>
            </div>
          </template>
        </Select>
      </FormItem>

      <div v-if="jornadasActividad > 1 || pideStand" class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <FormItem
          v-if="jornadasActividad > 1"
          :extra="`Día en que se presentan ${idProyectos.length > 1 ? 'todos los elegidos' : ''}; opcional.`"
          label="Jornada"
        >
          <Select
            :value="jornada ?? undefined"
            @update:value="(v: unknown) => (jornada = typeof v === 'number' ? v : null)"
            :options="opcionesJornadaActividad"
            allow-clear
            placeholder="Sin asignar"
            size="large"
          />
        </FormItem>
        <FormItem v-if="pideStand" extra="Opcional: dónde expone en la feria." label="Stand">
          <Input v-model:value="stand" :maxlength="LIMITE_STAND" autocomplete="off" placeholder="Ej. A-12" size="large">
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:map-pin" />
            </template>
          </Input>
        </FormItem>
      </div>
    </Form>
  </SemfaModalForm>
</template>
