<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Actividad } from '#/api/actividades';
import type {
  CategoriaActividad,
  CategoriaActividadForm,
} from '#/api/categorias-actividad';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import { listarActividades } from '#/api/actividades';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { useActividadTrabajoStore } from '#/store';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'CategoriaActividadFormModal' });

const props = defineProps<{
  categoria: CategoriaActividad | null;
  /** Categorías activas: nombre repetido. */
  categorias: CategoriaActividad[];
  guardando: boolean;
  /** Uso de la categoría en edición: con uso no se puede cambiar de actividad. */
  uso: { jurados: number; proyectos: number };
}>();

const emit = defineEmits<{
  guardar: [form: CategoriaActividadForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.categoria !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const trabajo = useActividadTrabajoStore();
const cargandoActividades = ref(false);
const actividades = ref<Actividad[]>([]);

/**
 * `form` plano a propósito: Ant Design no parte el `name` por los puntos, así que
 * un `name` anidado haría que la regla leyera siempre `undefined`.
 */
const form = reactive<CategoriaActividadForm>({ descripcion: '', nombre: '' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 120;
const LIMITE_DESCRIPCION = 255;

function normalizado(): CategoriaActividadForm {
  return {
    descripcion: limpiarEspacios(form.descripcion),
    idActividad: form.idActividad,
    idCategoriaActividad: form.idCategoriaActividad,
    nombre: limpiarEspacios(form.nombre),
  };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

// ---------------------------------------------------------------- actividad bloqueada

const esDeCarrera = computed(() => !!props.categoria?.idCarrera);
const enUso = computed(() => props.uso.proyectos > 0 || props.uso.jurados > 0);

/** Mismas reglas que el backend (409): se explica en vez de dejar que falle. */
const motivoActividadFija = computed(() => {
  if (!esEdicion.value) {
    return '';
  }
  if (esDeCarrera.value) {
    return 'Es una categoría de carrera: no puede cambiar de actividad.';
  }
  if (enUso.value) {
    return 'Tiene proyectos inscritos o jurados asignados: no puede cambiar de actividad.';
  }
  return '';
});

function elegirActividad(id: number) {
  if (!motivoActividadFija.value) {
    form.idActividad = id;
    formRef.value?.validateFields(['idActividad']).catch(() => {});
  }
}

const actividadElegida = computed(() =>
  actividades.value.find((a) => a.idActividad === form.idActividad),
);

// ---------------------------------------------------------------- reglas

/**
 * La descripción era `required` en `formulario.html`, pero el backend la admite
 * vacía: aquí es opcional.
 */
const rules: Record<string, Rule[]> = {
  idActividad: [{ message: 'Elija la actividad.', required: true, trigger: 'change' }],
  nombre: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        const nombre = limpiarEspacios(valor);
        if (!nombre) {
          throw new Error('El nombre es obligatorio.');
        }
        if (nombre.length < 3) {
          throw new Error('Debe tener al menos 3 caracteres.');
        }
        const repetida = props.categorias.find(
          (c) =>
            c.idCategoriaActividad !== props.categoria?.idCategoriaActividad &&
            normalizarTexto(limpiarEspacios(c.nombre)) === normalizarTexto(nombre),
        );
        if (repetida) {
          throw new Error(`Ya existe la categoría «${nombrePropio(repetida.nombre)}».`);
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- ciclo del modal

/**
 * El legacy servía `actividadService.listarActividades()` para el `select`; aquí
 * se reutiliza `GET /api/actividades`, que ya devuelve las activas.
 */
async function cargarActividades() {
  cargandoActividades.value = true;
  try {
    // Solo la actividad de trabajo (y la propia, al editar): así queda elegida sola.
    actividades.value = ((await listarActividades()) ?? []).filter(
      (a) => a.idActividad === trabajo.idActividad || a.idActividad === form.idActividad,
    );
    // Con una sola actividad no hace falta elegirla.
    if (!form.idActividad && actividades.value.length === 1) {
      form.idActividad = actividades.value[0]!.idActividad;
      original.value = JSON.stringify(normalizado());
    }
  } finally {
    cargandoActividades.value = false;
  }
}

/**
 * Ojo: el legacy enviaba el id con `th:field="*{idActividad}"`, que en realidad
 * era el de la actividad y no el de la categoría. Aquí se usa
 * `idCategoriaActividad`, que es la pk real.
 */
function cargar(c: CategoriaActividad | null, idActividad?: number) {
  form.idCategoriaActividad = c?.idCategoriaActividad;
  form.idActividad = c?.idActividad ?? idActividad;
  form.nombre = c?.nombre ?? '';
  form.descripcion = c?.descripcion ?? '';
  original.value = JSON.stringify(normalizado());
  nextTick(() => formRef.value?.clearValidate());
}

function enfocarNombre() {
  setTimeout(() => nombreRef.value?.focus(), 120);
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar(props.categoria);
  cargarActividades();
  enfocarNombre();
});

/** Tras «Guardar y nuevo» se conserva la actividad. */
function reiniciar() {
  registradas.value += 1;
  cargar(null, form.idActividad);
  enfocarNombre();
}

defineExpose({ reiniciar });

async function guardar(continuar: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  emit('guardar', normalizado(), continuar);
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:layers' : 'lucide:layers-plus'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Actualice el nombre o la descripción de la categoría.'
        : 'Agrupa los proyectos de una actividad; los jurados se asignan por categoría.'
    "
    :texto-contador="['categoría registrada', 'categorías registradas']"
    :titulo="esEdicion ? 'Modificar categoría' : 'Registrar categoría'"
    :width="720"
    @guardar="guardar"
  >
    <!-- Vista previa -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:layers" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre) || 'Nombre de la categoría' }}
          </div>
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span v-if="actividadElegida" class="flex items-center gap-1">
              <IconifyIcon class="size-3.5" icon="lucide:calendar-days" />
              {{ limpiarEspacios(actividadElegida.nombre) }}
            </span>
            <span
              v-if="categoria?.nivel"
              class="rounded-full bg-primary/10 px-2 py-0.5 text-primary"
            >
              {{ nombrePropio(categoria.nivel) }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Categoría de carrera / en uso -->
    <div
      v-if="esDeCarrera || (esEdicion && enUso)"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        <template v-if="esDeCarrera">
          Categoría <b class="text-foreground">{{ nombrePropio(categoria?.nivel) }}</b>
          de la carrera
          <b class="text-foreground">{{ nombrePropio(categoria?.nombreCarrera) }}</b>,
          creada en «Asignar jurados por carrera»; sus jurados se gestionan allí.
        </template>
        <template v-if="enUso">
          Tiene
          <b class="text-foreground">{{ uso.proyectos }}</b>
          {{ uso.proyectos === 1 ? 'proyecto inscrito' : 'proyectos inscritos' }} y
          <b class="text-foreground">{{ uso.jurados }}</b>
          {{ uso.jurados === 1 ? 'jurado asignado' : 'jurados asignados' }}: el cambio
          de nombre se verá en todos.
        </template>
      </span>
    </div>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <FormItem
        :extra="motivoActividadFija || undefined"
        label="Actividad"
        name="idActividad"
        required
      >
        <div class="flex flex-wrap gap-2">
          <button
            v-for="a in actividades"
            :key="a.idActividad"
            :class="{ 'is-activo': form.idActividad === a.idActividad }"
            :disabled="guardando || (!!motivoActividadFija && form.idActividad !== a.idActividad)"
            class="semfa-chip"
            type="button"
            @click="elegirActividad(a.idActividad)"
          >
            <IconifyIcon class="size-3.5" icon="lucide:calendar-days" />
            {{ limpiarEspacios(a.nombre) }}
          </button>
          <span
            v-if="!cargandoActividades && actividades.length === 0"
            class="text-sm text-amber-600"
          >
            No hay actividades activas: regístrelas primero en Actividad.
          </span>
        </div>
      </FormItem>

      <FormItem label="Nombre" name="nombre" required>
        <Input
          ref="nombreRef"
          v-model:value="form.nombre"
          :maxlength="LIMITE_NOMBRE"
          autocomplete="off"
          placeholder="Ej. INGENIERÍA DE SISTEMAS - BÁSICO"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:layers" />
          </template>
        </Input>
      </FormItem>

      <FormItem extra="Opcional." label="Descripción" name="descripcion">
        <Input.TextArea
          v-model:value="form.descripcion"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="LIMITE_DESCRIPCION"
          placeholder="Ej. Proyectos de primer a tercer semestre."
          show-count
        />
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
