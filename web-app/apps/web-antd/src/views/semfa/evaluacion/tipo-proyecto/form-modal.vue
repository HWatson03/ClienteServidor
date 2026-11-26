<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { TipoProyectoFila, TipoProyectoForm } from '#/api/tipos-proyecto';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'TipoProyectoFormModal' });

const props = defineProps<{
  guardando: boolean;
  tipo: null | TipoProyectoFila;
  /** Tipos activos, para avisar de un nombre repetido. */
  tipos: TipoProyectoFila[];
}>();

const emit = defineEmits<{
  guardar: [form: TipoProyectoForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.tipo !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const form = reactive<TipoProyectoForm>({ nombre: '' });
const original = ref('');
const registradas = ref(0);

function normalizado(): TipoProyectoForm {
  return { idTipoProyecto: form.idTipoProyecto, nombre: limpiarEspacios(form.nombre) };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

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
        const repetido = props.tipos.find(
          (t) =>
            t.idTipoProyecto !== props.tipo?.idTipoProyecto &&
            normalizarTexto(limpiarEspacios(t.nombre)) === normalizarTexto(nombre),
        );
        if (repetido) {
          throw new Error(`Ya existe el tipo «${repetido.nombre}».`);
        }
      },
    },
  ],
};

function cargar(t: null | TipoProyectoFila) {
  form.idTipoProyecto = t?.idTipoProyecto;
  form.nombre = t?.nombre ?? '';
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
  cargar(props.tipo);
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
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el nombre del tipo de proyecto.'
        : 'Agrupa las categorías de criterio del modelo de evaluación por preguntas.'
    "
    :texto-contador="['tipo registrado', 'tipos registrados']"
    :titulo="esEdicion ? 'Modificar tipo de proyecto' : 'Registrar tipo de proyecto'"
    :width="600"
    icono="lucide:shapes"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:shapes" />
        </span>
        <div
          :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
          class="truncate text-base font-medium"
        >
          {{ limpiarEspacios(form.nombre) || 'Nombre del tipo de proyecto' }}
        </div>
      </div>
    </template>

    <div
      v-if="esEdicion && (tipo?.categoriasCriterio ?? 0) > 0"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        Tiene <b class="text-foreground">{{ tipo?.categoriasCriterio }}</b> categoría(s)
        de criterio: el cambio de nombre se verá en todas.
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
          :maxlength="120"
          autocomplete="off"
          placeholder="Ej. Tecnología, Emprendimiento, Salud"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:shapes" />
          </template>
        </Input>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
