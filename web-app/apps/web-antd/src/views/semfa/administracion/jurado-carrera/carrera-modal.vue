<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Actividad } from '#/api/actividades';
import type { CarreraSlots } from '#/api/jurado-carrera';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import { listarActividades } from '#/api/actividades';
import { crearCarrera } from '#/api/jurado-carrera';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { avisar } from '#/composables/useAvisos';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'JuradoCarreraModal' });

const props = defineProps<{
  /** Carreras existentes, para avisar de un nombre repetido antes de enviar. */
  carreras: CarreraSlots[];
}>();

const emit = defineEmits<{
  carreraCreada: [idCarrera: number];
}>();

const visible = defineModel<boolean>('open', { required: true });

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();
const actividades = ref<Actividad[]>([]);
const cargandoActividades = ref(false);
const guardando = ref(false);

const form = ref<{ idActividad?: number; nombre: string }>({ nombre: '' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 80;

function instantanea() {
  return JSON.stringify([form.value.idActividad, limpiarEspacios(form.value.nombre)]);
}

const hayCambios = computed(() => instantanea() !== original.value);

const nombreLimpio = computed(() => limpiarEspacios(form.value.nombre));

const rules = computed<Record<string, Rule[]>>(() => ({
  idActividad: [
    { message: 'Elija la actividad (feria).', required: true, trigger: 'change' },
  ],
  nombre: [
    {
      trigger: ['blur', 'change'],
      validator: async () => {
        const nombre = nombreLimpio.value;
        if (!nombre) {
          throw new Error('El nombre de la carrera es obligatorio.');
        }
        if (nombre.length < 3) {
          throw new Error('Debe tener al menos 3 caracteres.');
        }
        // El backend lo impide por actividad; la pantalla no sabe la actividad de
        // cada carrera, así que solo se comprueba aquí cuando hay una sola.
        const repetida = props.carreras.find(
          (c) => normalizarTexto(limpiarEspacios(c.nombre)) === normalizarTexto(nombre),
        );
        if (repetida && actividades.value.length <= 1) {
          throw new Error(`Ya existe la carrera «${nombrePropio(repetida.nombre)}».`);
        }
      },
    },
  ],
}));

async function cargarActividades() {
  cargandoActividades.value = true;
  try {
    actividades.value = (await listarActividades()) ?? [];
    // Con una sola actividad no hace falta elegirla.
    if (!form.value.idActividad && actividades.value.length === 1) {
      form.value.idActividad = actividades.value[0]!.idActividad;
      original.value = instantanea();
    }
  } finally {
    cargandoActividades.value = false;
  }
}

function enfocarNombre() {
  setTimeout(() => nombreRef.value?.focus(), 120);
}

function cargar(idActividad?: number) {
  form.value = { idActividad, nombre: '' };
  original.value = instantanea();
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar();
  cargarActividades();
  enfocarNombre();
});

async function guardar(continuar: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  guardando.value = true;
  try {
    const creada = await crearCarrera({
      idActividad: form.value.idActividad,
      nombre: nombreLimpio.value,
    });
    avisar({
      mensaje: `«${nombrePropio(creada.nombre)}» se creó con sus niveles Básico y Avanzado.`,
      tipo: 'exito',
      titulo: 'Carrera registrada',
    });
    emit('carreraCreada', creada.idCarrera);
    if (continuar) {
      registradas.value += 1;
      cargar(form.value.idActividad);
      enfocarNombre();
    } else {
      visible.value = false;
    }
  } catch {
    // El interceptor de errores ya avisó (p. ej. 409 si ya existe).
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="false"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :registradas="registradas"
    :texto-contador="['carrera registrada', 'carreras registradas']"
    :width="620"
    icono="lucide:graduation-cap"
    subtitulo="Se crea con sus dos niveles, Básico y Avanzado, listos para asignar jurados."
    titulo="Agregar carrera"
    @guardar="guardar"
  >
    <!-- Vista previa: la carrera y las dos categorías que se crearán -->
    <template #vista-previa>
      <div class="min-w-0">
        <div
          :class="{ 'text-muted-foreground': !nombreLimpio }"
          class="truncate text-base font-medium"
        >
          {{ nombreLimpio || 'Nombre de la carrera' }}
        </div>
        <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
            {{ nombreLimpio || '…' }} - Basico
          </span>
          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
            {{ nombreLimpio || '…' }} - Avanzado
          </span>
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
      <FormItem label="Actividad (feria)" name="idActividad" required>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="a in actividades"
            :key="a.idActividad"
            :class="{ 'is-activo': form.idActividad === a.idActividad }"
            :disabled="guardando"
            class="semfa-chip"
            type="button"
            @click="form.idActividad = a.idActividad"
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

      <FormItem
        extra="Tal como debe aparecer en rankings y reportes."
        label="Nombre de la carrera"
        name="nombre"
        required
      >
        <Input
          ref="nombreRef"
          v-model:value="form.nombre"
          :maxlength="LIMITE_NOMBRE"
          autocomplete="off"
          placeholder="Ej. Ingeniería de Sistemas"
          size="large"
        >
          <template #prefix>
            <IconifyIcon
              class="size-4 text-muted-foreground"
              icon="lucide:graduation-cap"
            />
          </template>
        </Input>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
