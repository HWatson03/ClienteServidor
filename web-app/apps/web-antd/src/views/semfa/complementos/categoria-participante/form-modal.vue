<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type {
  CategoriaParticipante,
  CategoriaParticipanteForm,
} from '#/api/categorias-participante';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'CategoriaParticipanteFormModal' });

const props = defineProps<{
  categoria: CategoriaParticipante | null;
  /** Categorías activas, para avisar de un nombre repetido. */
  categorias: CategoriaParticipante[];
  guardando: boolean;
  /** Proyectos que usan la categoría en edición: el cambio de nombre se verá en todos. */
  proyectosQueLaUsan: number;
}>();

const emit = defineEmits<{
  guardar: [form: CategoriaParticipanteForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.categoria !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const form = reactive<CategoriaParticipanteForm>({ descripcion: '', nombre: '' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 80;
const LIMITE_DESCRIPCION = 255;

function normalizado(): CategoriaParticipanteForm {
  return {
    descripcion: limpiarEspacios(form.descripcion),
    idCategoriaParticiapnte: form.idCategoriaParticiapnte,
    nombre: limpiarEspacios(form.nombre),
  };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

/**
 * Nombre obligatorio y único. La descripción era `required` en `formulario.html`,
 * pero el backend la admite vacía: aquí es opcional.
 */
const rules: Record<string, Rule[]> = {
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
            c.idCategoriaParticiapnte !== props.categoria?.idCategoriaParticiapnte &&
            normalizarTexto(limpiarEspacios(c.nombre)) === normalizarTexto(nombre),
        );
        if (repetida) {
          throw new Error(`Ya existe la categoría «${repetida.nombre}».`);
        }
      },
    },
  ],
};

/**
 * Ojo: el legacy enviaba el id con `th:field="*{idCategoriaParticipante}"`, un
 * nombre que no existe en la entidad (la pk real es `idCategoriaParticiapnte`,
 * con la errata). Aquí se usa el nombre real, que es el que devuelve la API.
 */
function cargar(c: CategoriaParticipante | null) {
  form.idCategoriaParticiapnte = c?.idCategoriaParticiapnte;
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
  enfocarNombre();
});

function reiniciar() {
  registradas.value += 1;
  cargar(null);
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
    icono="lucide:shapes"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el nombre o la descripción de la categoría.'
        : 'Agrupa a los participantes dentro de su tipo (p. ej. proyecto, grupo).'
    "
    :texto-contador="['categoría registrada', 'categorías registradas']"
    :titulo="esEdicion ? 'Modificar categoría de participante' : 'Registrar categoría de participante'"
    :width="640"
    @guardar="guardar"
  >
    <!-- Vista previa: así aparecerá en el formulario de Participante -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:shapes" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre) || 'Nombre de la categoría' }}
          </div>
          <div class="truncate text-sm text-muted-foreground">
            {{ limpiarEspacios(form.descripcion) || 'Sin descripción' }}
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="esEdicion && proyectosQueLaUsan > 0"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        La usan <b class="text-foreground">{{ proyectosQueLaUsan }}</b>
        {{ proyectosQueLaUsan === 1 ? 'proyecto' : 'proyectos' }}: el cambio se verá
        en todos.
      </span>
    </div>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <FormItem label="Nombre" name="nombre" required>
        <Input
          ref="nombreRef"
          v-model:value="form.nombre"
          :maxlength="LIMITE_NOMBRE"
          autocomplete="off"
          placeholder="Ej. PROYECTO"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:shapes" />
          </template>
        </Input>
      </FormItem>

      <FormItem extra="Opcional." label="Descripción" name="descripcion">
        <Input.TextArea
          v-model:value="form.descripcion"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="LIMITE_DESCRIPCION"
          placeholder="Ej. Grupo de proyectos."
          show-count
        />
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
