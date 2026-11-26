<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Persona, PersonaForm } from '#/api/personas';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input } from 'ant-design-vue';

import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import {
  iniciales,
  nombrePropio,
  normalizarCi,
} from '#/utils/formato';
import {
  FORMATO_CI,
  LIMITE_CI,
  LIMITE_NOMBRE,
  MENSAJE_FORMATO_CI,
  reflejarEnInput,
  reglaNombre,
  sanearCi,
} from '#/utils/validacion';

defineOptions({ name: 'PersonaFormModal' });

const props = withDefaults(
  defineProps<{
    guardando: boolean;
    /** `false` oculta «Guardar y nuevo» (alta rápida desde otro formulario). */
    permitirContinuar?: boolean;
    persona: null | Persona;
    /** Lista ya cargada, para avisar de un CI repetido sin ir al backend. */
    personas: Persona[];
  }>(),
  { permitirContinuar: true },
);

const emit = defineEmits<{
  /** `continuar`: tras guardar, el modal queda abierto y vacío para otro registro. */
  guardar: [form: PersonaForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.persona !== null);

const formRef = ref<FormInstance>();
/** `Input` de antd expone `focus()` en ejecución, pero sus tipos no lo declaran. */
const ciRef = ref<{ focus: () => void }>();

/** Mismo criterio que `formulario.html`: solo CI y Nombres son obligatorios. */
const form = reactive<PersonaForm>({
  ci: '',
  materno: '',
  nombres: '',
  paterno: '',
});

/** Valores al abrir el modal, para saber si hay cambios sin guardar. */
const original = ref('');

/** Personas dadas de alta con «Guardar y nuevo» desde que se abrió el modal. */
const registradas = ref(0);


function instantanea() {
  return JSON.stringify([
    normalizarCi(form.ci),
    nombrePropio(form.nombres),
    nombrePropio(form.paterno),
    nombrePropio(form.materno),
  ]);
}

const hayCambios = computed(() => instantanea() !== original.value);

const vistaPrevia = computed(() => {
  const nombres = nombrePropio(form.nombres);
  const paterno = nombrePropio(form.paterno);
  const materno = nombrePropio(form.materno);
  return {
    ci: normalizarCi(form.ci),
    iniciales: iniciales(nombres, paterno, materno),
    nombre: [nombres, paterno, materno].filter(Boolean).join(' '),
  };
});

// ---------------------------------------------------------------- reglas

const reglaCi: Rule = {
  trigger: ['blur', 'change'],
  validator: async (_rule, valor: string) => {
    const ci = normalizarCi(valor);
    if (!ci) {
      throw new Error('El CI es obligatorio.');
    }
    // Los CI antiguos de la BD no siempre cumplen el formato: solo se exige al
    // registrar o al cambiar el CI, para no bloquear la edición de lo demás.
    const cambiado = ci !== normalizarCi(props.persona?.ci);
    if (cambiado && !FORMATO_CI.test(ci)) {
      throw new Error(
        MENSAJE_FORMATO_CI,
      );
    }
    const repetida = props.personas.find(
      (p) =>
        p.idPersona !== props.persona?.idPersona && normalizarCi(p.ci) === ci,
    );
    if (repetida) {
      throw new Error(`Este CI ya está registrado a nombre de ${repetida.nombreCompleto}.`);
    }
  },
};


const rules: Record<string, Rule[]> = {
  ci: [reglaCi],
  materno: [reglaNombre('El apellido materno', false)],
  nombres: [reglaNombre('El nombre', true)],
  paterno: [reglaNombre('El apellido paterno', false)],
};

// ---------------------------------------------------------------- formato al escribir

/** Solo dígitos, letras y guion en el CI, y siempre en mayúsculas. */
function alEscribirCi(evento: Event) {
  const limpio = sanearCi((evento.target as HTMLInputElement).value);
  form.ci = limpio;
  reflejarEnInput(evento, limpio);
}

/** Al salir del campo, el nombre queda en formato «Nombre Propio». */
function alSalirNombre(campo: 'materno' | 'nombres' | 'paterno') {
  form[campo] = nombrePropio(form[campo]);
}

// ---------------------------------------------------------------- ciclo del modal

function enfocarCi() {
  // Espera a que termine la animación de apertura del modal.
  setTimeout(() => ciRef.value?.focus(), 120);
}

function cargar(persona: null | Persona) {
  form.ci = persona?.ci ?? '';
  form.nombres = persona?.nombres ?? '';
  form.paterno = persona?.paterno ?? '';
  form.materno = persona?.materno ?? '';
  form.idPersona = persona?.idPersona;
  original.value = instantanea();
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar(props.persona);
  enfocarCi();
});

/** Tras «Guardar y nuevo»: el padre confirma el guardado y pide un formulario limpio. */
function reiniciar() {
  registradas.value += 1;
  cargar(null);
  enfocarCi();
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
  emit(
    'guardar',
    {
      ci: normalizarCi(form.ci),
      idPersona: form.idPersona,
      materno: nombrePropio(form.materno),
      nombres: nombrePropio(form.nombres),
      paterno: nombrePropio(form.paterno),
    },
    continuar,
  );
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :permitir-continuar="permitirContinuar"
    :icono="esEdicion ? 'lucide:user-pen' : 'lucide:user-plus'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Actualice los datos de identificación.'
        : 'Complete los datos de identificación de la persona.'
    "
    :texto-contador="['persona registrada', 'personas registradas']"
    :titulo="esEdicion ? 'Modificar Persona' : 'Registrar Persona'"
    @guardar="guardar"
  >
    <!-- Vista previa: así aparecerá la fila en la tabla -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <SemfaAvatar :texto="vistaPrevia.iniciales" tamano="lg" />
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !vistaPrevia.nombre }"
            class="truncate text-base font-medium"
          >
            {{ vistaPrevia.nombre || 'Nombre de la persona' }}
          </div>
          <div class="flex items-center gap-1 text-sm text-muted-foreground">
            <IconifyIcon class="size-3.5" icon="lucide:id-card" />
            CI {{ vistaPrevia.ci || '—' }}
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
      <div class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <FormItem
          extra="Solo números; agregue el complemento con guion si lo tiene."
          label="Cédula de identidad (CI)"
          name="ci"
          required
        >
          <Input
            ref="ciRef"
            :maxlength="LIMITE_CI"
            :value="form.ci"
            autocomplete="off"
            placeholder="Ej. 1234567 o 1234567-1A"
            size="large"
            @input="alEscribirCi"
          >
            <template #prefix>
              <IconifyIcon
                class="size-4 text-muted-foreground"
                icon="lucide:id-card"
              />
            </template>
          </Input>
        </FormItem>

        <FormItem
          extra="Uno o más nombres, tal como figuran en el CI."
          label="Nombres"
          name="nombres"
          required
        >
          <Input
            v-model:value="form.nombres"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Juan Carlos"
            size="large"
            @blur="alSalirNombre('nombres')"
          >
            <template #prefix>
              <IconifyIcon
                class="size-4 text-muted-foreground"
                icon="lucide:user"
              />
            </template>
          </Input>
        </FormItem>

        <FormItem
          extra="Opcional."
          label="Apellido paterno"
          name="paterno"
        >
          <Input
            v-model:value="form.paterno"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Mamani"
            size="large"
            @blur="alSalirNombre('paterno')"
          >
            <template #prefix>
              <IconifyIcon
                class="size-4 text-muted-foreground"
                icon="lucide:users"
              />
            </template>
          </Input>
        </FormItem>

        <FormItem
          extra="Opcional."
          label="Apellido materno"
          name="materno"
        >
          <Input
            v-model:value="form.materno"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Quispe"
            size="large"
            @blur="alSalirNombre('materno')"
          >
            <template #prefix>
              <IconifyIcon
                class="size-4 text-muted-foreground"
                icon="lucide:users"
              />
            </template>
          </Input>
        </FormItem>
      </div>
    </Form>
</SemfaModalForm>
</template>
