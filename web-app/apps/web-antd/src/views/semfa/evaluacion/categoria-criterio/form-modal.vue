<script lang="ts" setup>
import type { FormInstance, Rule } from 'ant-design-vue/es/form';

import type {
  CategoriaCriterio,
  CategoriaCriterioForm,
  TipoProyecto,
} from '#/api/categorias-criterio';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import { listarTiposProyecto } from '#/api/categorias-criterio';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'CategoriaCriterioFormModal' });

const props = defineProps<{
  categoria: CategoriaCriterio | null;
  /** Categorías activas: nombre repetido (el backend lo rechaza). */
  categorias: CategoriaCriterio[];
  guardando: boolean;
}>();

const emit = defineEmits<{
  guardar: [form: CategoriaCriterioForm & { idCategoriaCriterio?: number }, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.categoria !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const cargandoTipos = ref(false);
const tiposProyecto = ref<TipoProyecto[]>([]);

const form = reactive<CategoriaCriterioForm & { idCategoriaCriterio?: number }>({
  nombre: '',
});
const original = ref('');
const registradas = ref(0);

/** El backend guarda el nombre en mayúsculas, igual que el legacy. */
function normalizado() {
  return {
    idCategoriaCriterio: form.idCategoriaCriterio,
    idTipoProyecto: form.idTipoProyecto,
    nombre: limpiarEspacios(form.nombre).toUpperCase(),
  };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

const tipoElegido = computed(() =>
  tiposProyecto.value.find((t) => t.idTipoProyecto === form.idTipoProyecto),
);

const rules: Record<string, Rule[]> = {
  idTipoProyecto: [
    { message: 'Elija el tipo de proyecto.', required: true, trigger: 'change' },
  ],
  nombre: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        const nombre = limpiarEspacios(valor);
        if (!nombre) {
          throw new Error('Defina el nombre de la categoría.');
        }
        const repetida = props.categorias.find(
          (c) =>
            c.idCategoriaCriterio !== props.categoria?.idCategoriaCriterio &&
            normalizarTexto(c.nombre) === normalizarTexto(nombre),
        );
        if (repetida) {
          throw new Error('Ya existe una categoría con ese nombre.');
        }
      },
    },
  ],
};

async function cargarTipos() {
  cargandoTipos.value = true;
  try {
    tiposProyecto.value = (await listarTiposProyecto()) ?? [];
    if (!form.idTipoProyecto && tiposProyecto.value.length === 1) {
      form.idTipoProyecto = tiposProyecto.value[0]!.idTipoProyecto;
      original.value = JSON.stringify(normalizado());
    }
  } finally {
    cargandoTipos.value = false;
  }
}

function cargar(c: CategoriaCriterio | null, idTipo?: number) {
  form.idCategoriaCriterio = c?.idCategoriaCriterio;
  form.idTipoProyecto = c?.idTipoProyecto ?? idTipo;
  form.nombre = c?.nombre ?? '';
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
  cargarTipos();
  enfocarNombre();
});

/** Tras «Guardar y nuevo» se conserva el tipo de proyecto. */
function reiniciar() {
  registradas.value += 1;
  cargar(null, form.idTipoProyecto);
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
        ? 'Cambie el nombre o el tipo de proyecto.'
        : 'Agrupa preguntas de evaluación de un tipo de proyecto.'
    "
    :texto-contador="['categoría registrada', 'categorías registradas']"
    :titulo="esEdicion ? 'Modificar categoría de criterio' : 'Registrar categoría de criterio'"
    :width="680"
    icono="lucide:folder-tree"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:folder-tree" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre).toUpperCase() || 'NOMBRE DE LA CATEGORÍA' }}
          </div>
          <div class="text-sm text-muted-foreground">
            {{ tipoElegido?.nombre ?? 'Sin tipo de proyecto' }}
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
      <FormItem label="Tipo de proyecto" name="idTipoProyecto" required>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in tiposProyecto"
            :key="t.idTipoProyecto"
            :class="{ 'is-activo': form.idTipoProyecto === t.idTipoProyecto }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="form.idTipoProyecto = t.idTipoProyecto"
          >
            <IconifyIcon class="size-3.5" icon="lucide:shapes" />
            {{ t.nombre }}
          </button>
          <span
            v-if="!cargandoTipos && tiposProyecto.length === 0"
            class="flex items-center gap-1 text-sm text-amber-600"
          >
            <IconifyIcon class="size-4" icon="lucide:triangle-alert" />
            No hay tipos de proyecto: regístrelos primero en «Tipos de proyecto».
          </span>
        </div>
      </FormItem>

      <FormItem extra="Se guarda en mayúsculas." label="Nombre" name="nombre" required>
        <Input
          ref="nombreRef"
          v-model:value="form.nombre"
          :maxlength="120"
          autocomplete="off"
          class="uppercase"
          placeholder="Ej. INNOVACIÓN"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:folder-tree" />
          </template>
        </Input>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
