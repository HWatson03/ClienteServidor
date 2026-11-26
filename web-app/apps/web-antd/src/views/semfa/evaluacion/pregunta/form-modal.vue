<script lang="ts" setup>
import type { FormInstance, Rule } from 'ant-design-vue/es/form';

import type { CategoriaCriterio } from '#/api/categorias-criterio';
import type { Pregunta, PreguntaForm } from '#/api/preguntas';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input, Select } from 'ant-design-vue';

import { listarCategoriasCriterio } from '#/api/categorias-criterio';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'PreguntaFormModal' });

const props = defineProps<{
  guardando: boolean;
  pregunta: null | Pregunta;
  /** Preguntas activas: la misma pregunta no se repite en una categoría. */
  preguntas: Pregunta[];
}>();

const emit = defineEmits<{
  guardar: [form: PreguntaForm & { idPregunta?: number }, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.pregunta !== null);

const formRef = ref<FormInstance>();
const categoriaRef = ref<{ focus: () => void }>();
const textoRef = ref<{ focus: () => void }>();

const cargando = ref(false);
const categorias = ref<CategoriaCriterio[]>([]);

const form = reactive<PreguntaForm & { idPregunta?: number }>({ nombre: '' });
const original = ref('');
const registradas = ref(0);

function normalizado() {
  return {
    idCategoriaCriterio: form.idCategoriaCriterio,
    idPregunta: form.idPregunta,
    nombre: limpiarEspacios(form.nombre),
  };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

/** Categorías agrupadas por su tipo de proyecto. */
const opcionesCategoria = computed(() => {
  const grupos = new Map<string, CategoriaCriterio[]>();
  for (const c of categorias.value) {
    const tipo = c.tipoProyecto ?? 'Sin tipo';
    grupos.set(tipo, [...(grupos.get(tipo) ?? []), c]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([tipo, lista]) => ({
      label: tipo,
      options: lista.map((c) => ({
        busqueda: `${c.nombre ?? ''} ${tipo}`,
        label: c.nombre ?? '—',
        value: c.idCategoriaCriterio,
      })),
    }));
});

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

const categoriaElegida = computed(() =>
  categorias.value.find((c) => c.idCategoriaCriterio === form.idCategoriaCriterio),
);

const rules: Record<string, Rule[]> = {
  idCategoriaCriterio: [
    { message: 'Elija la categoría de criterio.', required: true, trigger: 'change' },
  ],
  nombre: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        const texto = limpiarEspacios(valor);
        if (!texto) {
          throw new Error('Escriba la pregunta.');
        }
        if (texto.length < 5) {
          throw new Error('Debe tener al menos 5 caracteres.');
        }
        const repetida = props.preguntas.find(
          (p) =>
            p.idPregunta !== props.pregunta?.idPregunta &&
            p.idCategoriaCriterio === form.idCategoriaCriterio &&
            normalizarTexto(limpiarEspacios(p.nombre)) === normalizarTexto(texto),
        );
        if (repetida) {
          throw new Error('Esa pregunta ya existe en la categoría elegida.');
        }
      },
    },
  ],
};

async function cargarCategorias() {
  cargando.value = true;
  try {
    categorias.value = (await listarCategoriasCriterio()) ?? [];
  } finally {
    cargando.value = false;
  }
}

function cargar(p: null | Pregunta, idCategoria?: number) {
  form.idPregunta = p?.idPregunta;
  form.idCategoriaCriterio = p?.idCategoriaCriterio ?? idCategoria;
  form.nombre = p?.nombre ?? '';
  original.value = JSON.stringify(normalizado());
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar(props.pregunta);
  cargarCategorias();
  setTimeout(() => (esEdicion.value ? textoRef : categoriaRef).value?.focus(), 120);
});

/** Tras «Guardar y nuevo» se conserva la categoría y el foco va al texto. */
function reiniciar() {
  registradas.value += 1;
  cargar(null, form.idCategoriaCriterio);
  setTimeout(() => textoRef.value?.focus(), 120);
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
    :atajo-enter="false"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Corrija el texto o la categoría de la pregunta.'
        : 'Pregunta que el jurado responde con una de sus ponderaciones.'
    "
    :texto-contador="['pregunta registrada', 'preguntas registradas']"
    :titulo="esEdicion ? 'Modificar pregunta' : 'Registrar pregunta'"
    :width="720"
    icono="lucide:message-circle-question"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:message-circle-question" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="line-clamp-2 text-base font-medium leading-snug"
          >
            {{ limpiarEspacios(form.nombre) || 'Texto de la pregunta' }}
          </div>
          <div class="text-sm text-muted-foreground">
            {{
              categoriaElegida
                ? `${categoriaElegida.nombre} · ${categoriaElegida.tipoProyecto ?? ''}`
                : 'Sin categoría elegida'
            }}
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
        extra="Agrupadas por tipo de proyecto; escriba para buscar."
        label="Categoría de criterio"
        name="idCategoriaCriterio"
        required
      >
        <Select
          ref="categoriaRef"
          v-model:value="form.idCategoriaCriterio"
          :filter-option="filtrar"
          :loading="cargando"
          :options="opcionesCategoria"
          :not-found-content="cargando ? undefined : 'No hay categorías: regístrelas en «Categoría criterio»'"
          placeholder="Buscar categoría…"
          show-search
          size="large"
        />
      </FormItem>

      <FormItem label="Pregunta" name="nombre" required>
        <Input.TextArea
          ref="textoRef"
          v-model:value="form.nombre"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="255"
          placeholder="Ej. ¿El proyecto resuelve un problema real del entorno?"
          show-count
        />
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
