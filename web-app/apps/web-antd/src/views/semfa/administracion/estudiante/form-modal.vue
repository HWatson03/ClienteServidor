<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Estudiante, EstudianteForm } from '#/api/estudiantes';
import type { Participante } from '#/api/participantes';
import type { Persona } from '#/api/personas';
import type { EtiquetaPersona } from '#/components/semfa/tipos';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Select } from 'ant-design-vue';

import { listarParticipantes } from '#/api/participantes';
import { listarPersonas } from '#/api/personas';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import SemfaSelectorPersona from '#/components/semfa/semfa-selector-persona.vue';
import {
  limpiarEspacios,
  nombrePropio,
  normalizarTexto,
  resumenPersona,
} from '#/utils/formato';

defineOptions({ name: 'EstudianteFormModal' });

const props = defineProps<{
  estudiante: Estudiante | null;
  /** Lista de la tabla: marca a quién ya es estudiante y evita inscripciones repetidas. */
  estudiantes: Estudiante[];
  guardando: boolean;
}>();

const emit = defineEmits<{
  /** `continuar`: tras guardar, el modal queda abierto para otro estudiante. */
  guardar: [form: EstudianteForm, continuar: boolean];
  /** Se editaron los datos de una persona: la tabla debe recargar su nombre y CI. */
  personaActualizada: [];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.estudiante !== null);

const formRef = ref<FormInstance>();
/** `Select` de antd expone `focus()` en ejecución, pero sus tipos no lo declaran. */
const personaRef = ref<{ focus: () => void }>();
const proyectoRef = ref<{ focus: () => void }>();

const cargandoOpciones = ref(false);
const personas = ref<Persona[]>([]);
const participantes = ref<Participante[]>([]);

const form = ref<EstudianteForm>({});

/** Valores al abrir el modal, para saber si hay cambios sin guardar. */
const original = ref('');

/** Estudiantes dados de alta con «Guardar y nuevo» desde que se abrió el modal. */
const registradas = ref(0);

const hayCambios = computed(
  () =>
    JSON.stringify([form.value.idPersona, form.value.idParticipante]) !==
    original.value,
);

// ---------------------------------------------------------------- opciones

/** Estudiantes activos de otras filas (en edición se excluye la propia). */
const otrosEstudiantes = computed(() =>
  props.estudiantes.filter(
    (e) => e.idEstudiante !== props.estudiante?.idEstudiante,
  ),
);

/** idPersona → proyectos en los que ya está inscrita. */
const proyectosPorPersona = computed(() => {
  const mapa = new Map<number, string[]>();
  for (const e of otrosEstudiantes.value) {
    if (e.idPersona !== null) {
      const lista = mapa.get(e.idPersona) ?? [];
      lista.push(limpiarEspacios(e.proyecto));
      mapa.set(e.idPersona, lista);
    }
  }
  return mapa;
});

/** Etiqueta «Ya es estudiante» con los proyectos en los que ya está. */
function etiquetasPersona(persona: Persona): EtiquetaPersona[] {
  const proyectos = proyectosPorPersona.value.get(persona.idPersona);
  return proyectos
    ? [{ texto: 'Ya es estudiante', tipo: 'aviso', titulo: proyectos.join('\n') }]
    : [];
}

/** Carrera (institución) de un proyecto, como clave de filtro. */
function carreraDe(p: null | Participante | undefined) {
  return limpiarEspacios(p?.institucion) || 'Sin institución';
}

/** Chip de carrera elegido; `null` muestra todos los proyectos. */
const carreraFiltro = ref<null | string>(null);

/** Carreras con su cantidad de proyectos, para los chips de filtro. */
const carreras = computed(() => {
  const conteo = new Map<string, number>();
  for (const p of participantes.value) {
    conteo.set(carreraDe(p), (conteo.get(carreraDe(p)) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([valor, total]) => ({ etiqueta: nombrePropio(valor), total, valor }));
});

function opcionProyecto(p: Participante) {
  const nombre = limpiarEspacios(p.nombre) || '—';
  return {
    busqueda: `${nombre} ${carreraDe(p)} ${p.nombreCategoria ?? ''}`,
    categoria: limpiarEspacios(p.nombreCategoria),
    label: nombre,
    value: p.idParticipante,
  };
}

/**
 * Con una carrera elegida, lista plana solo de sus proyectos; sin filtro, todos
 * agrupados por carrera en orden alfabético.
 */
const opcionesProyecto = computed(() => {
  if (carreraFiltro.value) {
    return participantes.value
      .filter((p) => carreraDe(p) === carreraFiltro.value)
      .map((p) => opcionProyecto(p));
  }
  return carreras.value.map((c) => ({
    label: c.etiqueta,
    options: participantes.value
      .filter((p) => carreraDe(p) === c.valor)
      .map((p) => opcionProyecto(p)),
  }));
});

function elegirCarrera(valor: null | string) {
  carreraFiltro.value = valor;
  // Si el proyecto elegido no es de esa carrera, se deja vacío.
  if (valor && proyectoElegido.value && carreraDe(proyectoElegido.value) !== valor) {
    form.value.idParticipante = undefined;
  }
  proyectoRef.value?.focus();
}

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

const personaElegida = computed(() => {
  const e = props.estudiante;
  return resumenPersona(
    personas.value.find((p) => p.idPersona === form.value.idPersona),
    e && e.idPersona === form.value.idPersona
      ? { ci: e.ci, nombre: e.nombrePersona }
      : undefined,
  );
});

const proyectoElegido = computed(() =>
  participantes.value.find((p) => p.idParticipante === form.value.idParticipante),
);

/** Compañeros ya inscritos en el proyecto elegido, como ayuda al registrar en serie. */
const companeros = computed(() =>
  otrosEstudiantes.value
    .filter((e) => e.idParticipante === form.value.idParticipante)
    .map((e) => e.nombrePersona ?? '—'),
);

// ---------------------------------------------------------------- reglas

const rules: Record<string, Rule[]> = {
  idParticipante: [
    { message: 'Seleccione el proyecto.', required: true, trigger: 'change' },
  ],
  idPersona: [
    { message: 'Seleccione a la persona.', required: true, trigger: 'change' },
    {
      trigger: 'change',
      validator: async () => {
        const { idParticipante, idPersona } = form.value;
        const repetido = otrosEstudiantes.value.some(
          (e) => e.idPersona === idPersona && e.idParticipante === idParticipante,
        );
        if (idPersona && idParticipante && repetido) {
          throw new Error('Esta persona ya está registrada en este proyecto.');
        }
      },
    },
  ],
};

// Al elegir un proyecto sin filtro (o al abrir una edición, cuando llegan los
// proyectos) se marca su carrera, que se conserva con «Guardar y nuevo».
watch(proyectoElegido, (proyecto) => {
  if (proyecto && !carreraFiltro.value) {
    carreraFiltro.value = carreraDe(proyecto);
  }
});

// La regla de duplicado de persona depende también del proyecto.
watch(
  () => form.value.idParticipante,
  () => {
    if (form.value.idPersona) {
      formRef.value?.validateFields(['idPersona']).catch(() => {});
    }
  },
);

// ---------------------------------------------------------------- ciclo del modal

/**
 * Carga personas y proyectos cada vez que se abre, para incluir lo registrado
 * desde otras pantallas. Mientras tanto se siguen viendo las listas anteriores.
 *
 * El legacy pedía `personaService.listarPersona("ESTUDIANTE")`, pero esa query
 * filtra por `p.estado`, que solo guarda `A`/`X`: por eso el desplegable
 * llegaba vacío. Aquí se reutiliza `GET /api/personas`, que ya devuelve las
 * personas activas.
 */
async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    const [listaPersonas, listaParticipantes] = await Promise.all([
      listarPersonas(),
      listarParticipantes(),
    ]);
    personas.value = listaPersonas ?? [];
    participantes.value = listaParticipantes ?? [];
  } finally {
    cargandoOpciones.value = false;
  }
}

function enfocarPersona() {
  // Espera a que termine la animación de apertura del modal.
  setTimeout(() => personaRef.value?.focus(), 120);
}

function cargar(valores: EstudianteForm) {
  form.value = { ...valores };
  original.value = JSON.stringify([valores.idPersona, valores.idParticipante]);
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  carreraFiltro.value = null;
  cargar({
    idEstudiante: props.estudiante?.idEstudiante,
    idParticipante: props.estudiante?.idParticipante ?? undefined,
    idPersona: props.estudiante?.idPersona ?? undefined,
  });
  cargarOpciones();
  enfocarPersona();
});

/**
 * Tras «Guardar y nuevo»: se conserva el proyecto, porque lo habitual es
 * registrar seguidos a todos los estudiantes de un mismo proyecto.
 */
function reiniciar() {
  registradas.value += 1;
  cargar({ idParticipante: form.value.idParticipante });
  enfocarPersona();
}

defineExpose({ reiniciar });

/** `SemfaModalForm` ya filtró si se puede guardar; aquí solo se valida y se emite. */
async function guardar(continuar: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    // Los errores se muestran en línea bajo cada campo.
    return;
  }
  emit('guardar', { ...form.value }, continuar);
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :atajo-enter="false"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:user-pen' : 'lucide:graduation-cap'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie la persona o el proyecto del estudiante.'
        : 'Vincule a una persona con el proyecto en el que participa.'
    "
    :texto-contador="['estudiante registrado', 'estudiantes registrados']"
    :titulo="esEdicion ? 'Modificar Estudiante' : 'Registrar Estudiante'"
    @guardar="guardar"
  >
    <!-- Vista previa: así aparecerá la fila en la tabla -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <SemfaAvatar
          :texto="personaElegida?.iniciales ?? '?'"
          tamano="lg"
        />
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !personaElegida }"
            class="truncate text-base font-medium"
          >
            {{ personaElegida?.nombre ?? 'Estudiante sin seleccionar' }}
            <span
              v-if="personaElegida"
              class="text-sm font-normal text-muted-foreground"
            >
              · CI {{ personaElegida.ci ?? '—' }}
            </span>
          </div>
          <div class="flex items-center gap-1 text-sm text-muted-foreground">
            <IconifyIcon class="size-3.5 shrink-0" icon="lucide:folder-kanban" />
            <span class="truncate">
              {{ limpiarEspacios(proyectoElegido?.nombre) || 'Proyecto sin seleccionar' }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <FormItem
        extra="Escriba el nombre o el CI. «Editar» corrige sus datos; «Nueva» la registra si no está."
        label="Persona"
        name="idPersona"
        required
      >
        <SemfaSelectorPersona
          ref="personaRef"
          v-model:personas="personas"
          v-model:value="form.idPersona"
          :cargando="cargandoOpciones"
          :disabled="guardando"
          :etiquetas="etiquetasPersona"
          :respaldo="
            estudiante?.idPersona
              ? {
                  ci: estudiante.ci,
                  idPersona: estudiante.idPersona,
                  nombre: estudiante.nombrePersona,
                }
              : null
          "
          @persona-actualizada="$emit('personaActualizada')"
        />
      </FormItem>

      <FormItem label="Carrera">
        <div class="flex flex-wrap gap-2">
          <button
            :class="{ 'is-activo': carreraFiltro === null }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="elegirCarrera(null)"
          >
            Todas
            <span class="semfa-chip__total">{{ participantes.length }}</span>
          </button>
          <button
            v-for="c in carreras"
            :key="c.valor"
            :class="{ 'is-activo': carreraFiltro === c.valor }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="elegirCarrera(c.valor)"
          >
            {{ c.etiqueta }}
            <span class="semfa-chip__total">{{ c.total }}</span>
          </button>
        </div>
      </FormItem>

      <FormItem
        :extra="
          carreraFiltro
            ? `${opcionesProyecto.length} proyectos de ${nombrePropio(carreraFiltro)}. Escriba para buscar.`
            : 'Elija una carrera arriba para acortar la lista, o escriba para buscar.'
        "
        label="Proyecto"
        name="idParticipante"
        required
      >
        <Select
          ref="proyectoRef"
          v-model:value="form.idParticipante"
          :filter-option="filtrar"
          :loading="cargandoOpciones"
          :options="opcionesProyecto"
          placeholder="Buscar proyecto…"
          show-search
          size="large"
        >
          <template #option="{ label, categoria }">
            <div class="py-0.5">
              <div class="whitespace-normal leading-snug">{{ label }}</div>
              <div v-if="categoria" class="text-xs text-muted-foreground">
                {{ categoria }}
              </div>
            </div>
          </template>
        </Select>
      </FormItem>

      <div
        v-if="form.idParticipante"
        class="-mt-2 flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        <IconifyIcon class="mt-0.5 size-4 shrink-0" icon="lucide:users" />
        <span v-if="companeros.length === 0">
          Aún no hay estudiantes registrados en este proyecto.
        </span>
        <span v-else>
          Ya {{ companeros.length === 1 ? 'está registrado' : 'están registrados' }}:
          <span class="text-foreground">{{ companeros.join(', ') }}</span>
        </span>
      </div>
    </Form>
  </SemfaModalForm>
</template>
