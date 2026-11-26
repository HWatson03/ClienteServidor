<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Carrera, CarreraForm, Facultad } from '#/api/estructura';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItem, Input, Select } from 'ant-design-vue';

import { crearFacultad } from '#/api/estructura';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { avisar } from '#/composables/useAvisos';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'CarreraFormModal' });

const props = defineProps<{
  carrera: Carrera | null;
  /** Carreras de la actividad: nombre repetido. */
  carreras: Carrera[];
  guardando: boolean;
  idActividad?: number;
  nombreActividad: string;
}>();

const emit = defineEmits<{
  guardar: [form: CarreraForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });
/** Catálogo global: «Nueva facultad» lo amplía sin recargar la vista. */
const facultades = defineModel<Facultad[]>('facultades', { required: true });

const esEdicion = computed(() => props.carrera !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

/** Plano a propósito (ver `categoria-actividad/form-modal.vue`). */
const form = reactive<CarreraForm>({ idFacultad: null, nombre: '' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 150;

function normalizado(): CarreraForm {
  return {
    idActividad: form.idActividad,
    idCarrera: form.idCarrera,
    idFacultad: form.idFacultad ?? null,
    nombre: limpiarEspacios(form.nombre).toUpperCase(),
  };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

const facultadElegida = computed(() => facultades.value.find((f) => f.idFacultad === form.idFacultad));

const opcionesFacultad = computed(() =>
  facultades.value.map((f) => ({
    busqueda: `${f.nombre} ${f.sigla ?? ''}`,
    label: nombrePropio(f.nombre),
    sigla: f.sigla,
    value: f.idFacultad,
  })),
);

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

// ---------------------------------------------------------------- nueva facultad (en línea)

const nuevaFacultad = ref<null | { nombre: string; sigla: string }>(null);
const creandoFacultad = ref(false);

async function crearNuevaFacultad() {
  const nombre = limpiarEspacios(nuevaFacultad.value?.nombre).toUpperCase();
  const sigla = limpiarEspacios(nuevaFacultad.value?.sigla).toUpperCase();
  if (!nombre) return;
  const existente = facultades.value.find(
    (f) => normalizarTexto(f.nombre) === normalizarTexto(nombre) || (!!f.sigla && normalizarTexto(f.sigla) === normalizarTexto(nombre)),
  );
  if (existente) {
    form.idFacultad = existente.idFacultad;
    nuevaFacultad.value = null;
    return;
  }
  creandoFacultad.value = true;
  try {
    const f = await crearFacultad({ nombre, sigla });
    facultades.value = [...facultades.value, f].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    form.idFacultad = f.idFacultad;
    nuevaFacultad.value = null;
    avisar({ mensaje: `«${nombrePropio(nombre)}» ya está en el catálogo.`, tipo: 'exito', titulo: 'Facultad creada' });
  } catch {
    // El interceptor ya avisó.
  } finally {
    creandoFacultad.value = false;
  }
}

// ---------------------------------------------------------------- reglas

const rules: Record<string, Rule[]> = {
  nombre: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        const nombre = limpiarEspacios(valor);
        if (!nombre) {
          throw new Error('El nombre de la carrera es obligatorio.');
        }
        if (nombre.length < 3) {
          throw new Error('Debe tener al menos 3 caracteres.');
        }
        const repetida = props.carreras.find(
          (c) => c.idCarrera !== props.carrera?.idCarrera && normalizarTexto(c.nombre) === normalizarTexto(nombre),
        );
        if (repetida) {
          throw new Error(`Ya existe la carrera «${nombrePropio(repetida.nombre)}» en esta actividad.`);
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- ciclo del modal

function cargar(c: Carrera | null, idFacultad?: null | number) {
  form.idCarrera = c?.idCarrera;
  form.idActividad = c?.idActividad ?? props.idActividad;
  form.idFacultad = c ? c.idFacultad : (idFacultad ?? null);
  form.nombre = c?.nombre ?? '';
  nuevaFacultad.value = null;
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
  cargar(props.carrera);
  enfocarNombre();
});

/** Tras «Guardar y nuevo» se conserva la facultad: se cargan seguidas sus carreras. */
function reiniciar() {
  registradas.value += 1;
  cargar(null, form.idFacultad);
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
    :icono="esEdicion ? 'lucide:graduation-cap' : 'lucide:school'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Al renombrarla, sus proyectos muestran el nombre nuevo como institución.'
        : `Carrera de «${nombreActividad}»: sus proyectos compiten también en el ranking por carrera y facultad.`
    "
    :texto-contador="['carrera registrada', 'carreras registradas']"
    :titulo="esEdicion ? 'Modificar carrera' : 'Registrar carrera'"
    :width="720"
    @guardar="guardar"
  >
    <!-- Vista previa -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconifyIcon class="size-6" icon="lucide:graduation-cap" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre).toUpperCase() || 'NOMBRE DE LA CARRERA' }}
          </div>
          <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span v-if="facultadElegida" class="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {{ facultadElegida.sigla ? `${facultadElegida.sigla} · ` : '' }}{{ nombrePropio(facultadElegida.nombre) }}
            </span>
            <span v-else class="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600">Sin facultad</span>
            <span v-if="carrera" class="text-muted-foreground">{{ carrera.proyectos }} proyecto(s)</span>
          </div>
        </div>
      </div>
    </template>

    <Form ref="formRef" :disabled="guardando" :model="form" :rules="rules" layout="vertical">
      <FormItem
        extra="Se guarda en mayúsculas; es la «institución» que verán rankings y reportes."
        label="Carrera"
        name="nombre"
        required
      >
        <Input
          ref="nombreRef"
          v-model:value="form.nombre"
          :maxlength="LIMITE_NOMBRE"
          autocomplete="off"
          placeholder="Ej. INGENIERÍA DE SISTEMAS"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:graduation-cap" />
          </template>
        </Input>
      </FormItem>

      <FormItem label="Facultad" name="idFacultad">
        <div class="flex gap-2">
          <Select
            :value="form.idFacultad ?? undefined"
            @update:value="(v: unknown) => (form.idFacultad = typeof v === 'number' ? v : null)"
            :filter-option="filtrar"
            :options="opcionesFacultad"
            allow-clear
            class="min-w-0 flex-1"
            placeholder="Buscar facultad por nombre o sigla…"
            show-search
            size="large"
          >
            <template #option="{ label, sigla }">
              <div class="flex items-center gap-2">
                <span
                  v-if="sigla"
                  class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {{ sigla }}
                </span>
                <span class="truncate">{{ label }}</span>
              </div>
            </template>
          </Select>
          <Button
            v-if="nuevaFacultad === null"
            :disabled="guardando"
            class="semfa-btn semfa-btn--suave-primario shrink-0"
            size="large"
            @click="nuevaFacultad = { nombre: '', sigla: '' }"
          >
            <IconifyIcon class="size-4" icon="lucide:plus" />
            Nueva facultad
          </Button>
        </div>
        <div v-if="nuevaFacultad !== null" class="mt-2 flex flex-wrap gap-2">
          <Input
            v-model:value="nuevaFacultad.nombre"
            :maxlength="200"
            class="min-w-0 flex-1"
            placeholder="Ej. FACULTAD DE CIENCIAS Y TECNOLOGÍA"
            @keydown.enter.stop.prevent="crearNuevaFacultad"
          />
          <Input
            v-model:value="nuevaFacultad.sigla"
            :maxlength="20"
            class="w-28"
            placeholder="Sigla: FCyT"
            @keydown.enter.stop.prevent="crearNuevaFacultad"
          />
          <Button :loading="creandoFacultad" class="semfa-btn semfa-btn--primario" @click="crearNuevaFacultad">
            Crear
          </Button>
          <Button class="semfa-btn semfa-btn--neutro" @click="nuevaFacultad = null">✕</Button>
        </div>
        <template #extra>
          Opcional, pero sin facultad la carrera no entra al ranking por facultad.
        </template>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
