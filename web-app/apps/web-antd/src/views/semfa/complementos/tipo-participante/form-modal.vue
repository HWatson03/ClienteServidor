<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type {
  TipoParticipante,
  TipoParticipanteForm,
} from '#/api/tipos-participante';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'TipoParticipanteFormModal' });

const props = defineProps<{
  guardando: boolean;
  /** Proyectos que usan el tipo en edición: el cambio de nombre se verá en todos. */
  proyectosQueLoUsan: number;
  tipoParticipante: null | TipoParticipante;
  /** Tipos activos, para avisar de un nombre repetido. */
  tipos: TipoParticipante[];
}>();

const emit = defineEmits<{
  guardar: [form: TipoParticipanteForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.tipoParticipante !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const form = reactive<TipoParticipanteForm>({ descripcion: '', nombre: '' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 80;
const LIMITE_DESCRIPCION = 255;

function normalizado(): TipoParticipanteForm {
  return {
    descripcion: limpiarEspacios(form.descripcion),
    idTipoParticipante: form.idTipoParticipante,
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
        const repetido = props.tipos.find(
          (t) =>
            t.idTipoParticipante !== props.tipoParticipante?.idTipoParticipante &&
            normalizarTexto(limpiarEspacios(t.nombre)) === normalizarTexto(nombre),
        );
        if (repetido) {
          throw new Error(`Ya existe el tipo «${repetido.nombre}».`);
        }
      },
    },
  ],
};

function cargar(t: null | TipoParticipante) {
  form.idTipoParticipante = t?.idTipoParticipante;
  form.nombre = t?.nombre ?? '';
  form.descripcion = t?.descripcion ?? '';
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
  cargar(props.tipoParticipante);
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
    :icono="esEdicion ? 'lucide:tag' : 'lucide:tags'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el nombre o la descripción del tipo.'
        : 'Clasifica a los participantes (p. ej. proyectos, grupos de danza, bandas).'
    "
    :texto-contador="['tipo registrado', 'tipos registrados']"
    :titulo="esEdicion ? 'Modificar tipo de participante' : 'Registrar tipo de participante'"
    :width="640"
    @guardar="guardar"
  >
    <!-- Vista previa: así aparecerá en el formulario de Participante -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:tag" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre) || 'Nombre del tipo' }}
          </div>
          <div class="truncate text-sm text-muted-foreground">
            {{ limpiarEspacios(form.descripcion) || 'Sin descripción' }}
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="esEdicion && proyectosQueLoUsan > 0"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        Lo usan <b class="text-foreground">{{ proyectosQueLoUsan }}</b>
        {{ proyectosQueLoUsan === 1 ? 'proyecto' : 'proyectos' }}: el cambio se verá
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
          placeholder="Ej. PROYECTOS"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:tag" />
          </template>
        </Input>
      </FormItem>

      <FormItem extra="Opcional." label="Descripción" name="descripcion">
        <Input.TextArea
          v-model:value="form.descripcion"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="LIMITE_DESCRIPCION"
          placeholder="Ej. Temas presentados por equipos de estudiantes y docentes."
          show-count
        />
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
