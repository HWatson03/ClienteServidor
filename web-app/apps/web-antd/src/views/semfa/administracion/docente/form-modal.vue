<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import type { Dayjs } from 'dayjs';

import type { Docente, DocenteForm, DocentePersonaForm } from '#/api/docentes';
import type { Persona } from '#/api/personas';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, DatePicker, Form, FormItem, Input } from 'ant-design-vue';
import dayjs from 'dayjs';

import { listarPersonas } from '#/api/personas';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import {
  iniciales,
  nombrePropio,
  normalizarCi,
} from '#/utils/formato';
import {
  edadDesde,
  FORMATO_CI,
  LIMITE_CI,
  LIMITE_EMAIL,
  LIMITE_NOMBRE,
  MENSAJE_FORMATO_CI,
  reflejarEnInput,
  reglaEmail,
  reglaNombre,
  sanearCi,
} from '#/utils/validacion';

defineOptions({ name: 'DocenteFormModal' });

const props = defineProps<{
  docente: Docente | null;
  /** Docentes de la tabla: una persona que ya es docente no se puede volver a registrar. */
  docentes: Docente[];
  guardando: boolean;
}>();

const emit = defineEmits<{
  /** `continuar`: tras guardar, el modal queda abierto y vacío para otro docente. */
  guardar: [form: DocenteForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.docente !== null);

const formRef = ref<FormInstance>();
const ciRef = ref<{ focus: () => void }>();

/** Personas activas: para reconocer un CI ya registrado y ofrecer reutilizarla. */
const personas = ref<Persona[]>([]);

/**
 * El `form` es plano a propósito: Ant Design no parte el `name` por los puntos,
 * así que `name="persona.nombres"` buscaría la clave literal `"persona.nombres"`
 * y la regla `required` vería siempre `undefined`. Al emitir se arma el
 * `persona` anidado que espera `POST/PUT /docentes`.
 *
 * `idPersona` en un alta significa «hacer docente a esta persona existente».
 */
const form = reactive<
  DocentePersonaForm & { idDocente?: number; idPersona?: number }
>({ ci: '', email: '', materno: '', nombres: '', paterno: '' });

const original = ref('');
const registradas = ref(0);

const SEXOS = [
  { icono: 'lucide:mars', valor: 'Masculino' },
  { icono: 'lucide:venus', valor: 'Femenino' },
];

function normalizado(): DocentePersonaForm {
  return {
    ci: normalizarCi(form.ci),
    email: form.email.trim().toLowerCase(),
    fecNacimiento: form.fecNacimiento || undefined,
    materno: nombrePropio(form.materno),
    nombres: nombrePropio(form.nombres),
    paterno: nombrePropio(form.paterno),
    tipoSexo: form.tipoSexo || undefined,
  };
}

function instantanea() {
  return JSON.stringify([form.idPersona, normalizado()]);
}

const hayCambios = computed(() => instantanea() !== original.value);

// ---------------------------------------------------------------- persona existente

/** Persona del registro que se edita, o la existente vinculada en un alta. */
const idPersonaPropia = computed(() => form.idPersona);

/** Otra persona activa con el CI escrito. */
const personaConEseCi = computed(() => {
  const ci = normalizarCi(form.ci);
  if (!ci) {
    return undefined;
  }
  return personas.value.find(
    (p) => p.idPersona !== idPersonaPropia.value && normalizarCi(p.ci) === ci,
  );
});

const idsDocentes = computed(
  () =>
    new Set(
      props.docentes
        .filter((d) => d.idDocente !== props.docente?.idDocente)
        .map((d) => d.idPersona),
    ),
);

const yaEsDocente = computed(
  () => !!personaConEseCi.value && idsDocentes.value.has(personaConEseCi.value.idPersona),
);

/** Persona existente vinculada en un alta (no en edición). */
const personaVinculada = computed(() =>
  !esEdicion.value && form.idPersona !== undefined
    ? personas.value.find((p) => p.idPersona === form.idPersona)
    : undefined,
);

/** Rellena el formulario con los datos de la persona y la reutiliza al guardar. */
function usarPersona(p: Persona) {
  form.idPersona = p.idPersona;
  form.ci = p.ci ?? form.ci;
  form.nombres = p.nombres ?? '';
  form.paterno = p.paterno ?? '';
  form.materno = p.materno ?? '';
  form.email = p.email ?? '';
  form.fecNacimiento = p.fecNacimiento ?? undefined;
  form.tipoSexo = p.tipoSexo ?? undefined;
  nextTick(() => formRef.value?.validate().catch(() => {}));
}

function desvincular() {
  cargar({});
  enfocarCi();
}

// ---------------------------------------------------------------- vista previa

const edad = computed(() => edadDesde(form.fecNacimiento));

const vistaPrevia = computed(() => {
  const { materno, nombres, paterno } = normalizado();
  return {
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
    // Los CI antiguos no siempre cumplen el formato: solo se exige a uno nuevo.
    const ciOriginal = personaVinculada.value?.ci ?? props.docente?.ci ?? '';
    if (ci !== normalizarCi(ciOriginal) && !FORMATO_CI.test(ci)) {
      throw new Error(MENSAJE_FORMATO_CI);
    }
    const otra = personaConEseCi.value;
    if (otra) {
      throw new Error(
        yaEsDocente.value
          ? `${otra.nombreCompleto} ya es docente.`
          : esEdicion.value
            ? `Este CI ya es de ${otra.nombreCompleto}.`
            : `Este CI ya es de ${otra.nombreCompleto}: use «Usar sus datos».`,
      );
    }
  },
};

const reglaFecha: Rule = {
  trigger: 'change',
  validator: async (_rule, valor: string) => {
    const anios = edadDesde(valor);
    if (anios === null) {
      return;
    }
    if (anios < 18) {
      throw new Error('Un docente debe ser mayor de edad.');
    }
    if (anios > 100) {
      throw new Error('Revise la fecha: la edad pasa de 100 años.');
    }
  },
};

const rules: Record<string, Rule[]> = {
  ci: [reglaCi],
  email: [reglaEmail],
  fecNacimiento: [reglaFecha],
  materno: [reglaNombre('El apellido materno', false)],
  nombres: [reglaNombre('El nombre', true)],
  paterno: [reglaNombre('El apellido paterno', false)],
};

// ---------------------------------------------------------------- formato al escribir

function alEscribirCi(evento: Event) {
  const limpio = sanearCi((evento.target as HTMLInputElement).value);
  form.ci = limpio;
  reflejarEnInput(evento, limpio);
}

function alSalirNombre(campo: 'materno' | 'nombres' | 'paterno') {
  form[campo] = nombrePropio(form[campo]);
}

function alSalirEmail() {
  form.email = form.email.trim().toLowerCase();
}

function alternarSexo(valor: string) {
  form.tipoSexo = form.tipoSexo === valor ? undefined : valor;
}

/** Sin fechas futuras en el calendario. */
function fechaDeshabilitada(fecha: Dayjs) {
  return fecha.isAfter(dayjs(), 'day');
}

/** El calendario abre en una fecha razonable para un adulto, no en hoy. */
const vistaInicialFecha = dayjs().subtract(35, 'year');

// ---------------------------------------------------------------- ciclo del modal

async function cargarPersonas() {
  personas.value = (await listarPersonas().catch(() => [])) ?? [];
}

function enfocarCi() {
  setTimeout(() => ciRef.value?.focus(), 120);
}

function cargar(d: Partial<Docente>) {
  form.idDocente = d.idDocente;
  form.idPersona = d.idPersona ?? undefined;
  form.ci = d.ci ?? '';
  form.email = d.email ?? '';
  form.fecNacimiento = d.fecNacimiento ?? undefined;
  form.materno = d.materno ?? '';
  form.nombres = d.nombres ?? '';
  form.paterno = d.paterno ?? '';
  form.tipoSexo = d.tipoSexo ?? undefined;
  original.value = instantanea();
  nextTick(() => formRef.value?.clearValidate());
}

watch(visible, (abierto) => {
  if (!abierto) {
    return;
  }
  registradas.value = 0;
  cargar(props.docente ?? {});
  cargarPersonas();
  enfocarCi();
});

function reiniciar() {
  registradas.value += 1;
  cargar({});
  cargarPersonas();
  enfocarCi();
}

defineExpose({ reiniciar });

async function guardar(continuar: boolean) {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  emit(
    'guardar',
    { idDocente: form.idDocente, idPersona: form.idPersona, persona: normalizado() },
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
    :icono="esEdicion ? 'lucide:user-pen' : 'lucide:presentation'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Actualice los datos personales del docente.'
        : 'Empiece por el CI: si la persona ya existe, puede usar sus datos.'
    "
    :texto-contador="['docente registrado', 'docentes registrados']"
    :titulo="esEdicion ? 'Modificar Docente' : 'Registrar Docente'"
    :width="860"
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
            {{ vistaPrevia.nombre || 'Nombre del docente' }}
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span class="flex items-center gap-1">
              <IconifyIcon class="size-3.5" icon="lucide:id-card" />
              CI {{ normalizarCi(form.ci) || '—' }}
            </span>
            <span v-if="form.email.trim()" class="flex items-center gap-1">
              <IconifyIcon class="size-3.5" icon="lucide:mail" />
              {{ form.email.trim().toLowerCase() }}
            </span>
            <span v-if="edad !== null" class="flex items-center gap-1">
              <IconifyIcon class="size-3.5" icon="lucide:cake" />
              {{ edad }} años
            </span>
            <span
              v-if="personaVinculada"
              class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              Persona existente
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Persona ya registrada con el CI escrito -->
    <div
      v-if="!esEdicion && personaConEseCi"
      :class="
        yaEsDocente
          ? 'bg-red-500/10 text-red-600'
          : 'bg-primary/5 text-muted-foreground'
      "
      class="mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
    >
      <IconifyIcon
        :icon="yaEsDocente ? 'lucide:circle-x' : 'lucide:user-search'"
        class="size-5 shrink-0"
      />
      <span class="flex-1">
        <template v-if="yaEsDocente">
          <b>{{ personaConEseCi.nombreCompleto }}</b> ya está registrado como docente.
        </template>
        <template v-else>
          Ya existe <b class="text-foreground">{{ personaConEseCi.nombreCompleto }}</b>
          con este CI. Puede registrarlo como docente con sus datos.
        </template>
      </span>
      <Button
        v-if="!yaEsDocente"
        class="semfa-btn semfa-btn--suave-primario shrink-0"
        size="small"
        @click="usarPersona(personaConEseCi)"
      >
        <IconifyIcon class="size-3.5" icon="lucide:user-check" />
        Usar sus datos
      </Button>
    </div>

    <div
      v-if="personaVinculada"
      class="mb-4 flex items-center gap-3 rounded-lg bg-green-600/10 px-3 py-2 text-sm text-green-700 dark:text-green-500"
    >
      <IconifyIcon class="size-5 shrink-0" icon="lucide:link" />
      <span class="flex-1">
        Se registrará como docente a <b>{{ personaVinculada.nombreCompleto }}</b>,
        que ya existe. Lo que cambie aquí actualizará sus datos.
      </span>
      <Button
        class="semfa-btn semfa-btn--neutro shrink-0"
        size="small"
        @click="desvincular"
      >
        Es otra persona
      </Button>
    </div>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <!-- Identificación -->
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Identificación
      </div>
      <div class="grid grid-cols-1 gap-x-5 md:grid-cols-3">
        <FormItem label="Cédula de identidad (CI)" name="ci" required>
          <Input
            ref="ciRef"
            :maxlength="LIMITE_CI"
            :value="form.ci"
            autocomplete="off"
            placeholder="Ej. 1234567"
            size="large"
            @input="alEscribirCi"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:id-card" />
            </template>
          </Input>
        </FormItem>

        <FormItem label="Sexo" name="tipoSexo">
          <div class="flex h-10 items-center gap-2">
            <button
              v-for="s in SEXOS"
              :key="s.valor"
              :class="{ 'is-activo': form.tipoSexo === s.valor }"
              :disabled="guardando"
              class="semfa-chip"
              type="button"
              @click="alternarSexo(s.valor)"
            >
              <IconifyIcon :icon="s.icono" class="size-3.5" />
              {{ s.valor }}
            </button>
          </div>
        </FormItem>

        <FormItem
          :extra="edad !== null ? `${edad} años` : 'Opcional.'"
          label="Fecha de nacimiento"
          name="fecNacimiento"
        >
          <DatePicker
            v-model:value="form.fecNacimiento"
            :default-picker-value="vistaInicialFecha"
            :disabled-date="fechaDeshabilitada"
            class="w-full"
            format="DD/MM/YYYY"
            placeholder="dd/mm/aaaa"
            size="large"
            value-format="YYYY-MM-DD"
          />
        </FormItem>
      </div>

      <!-- Nombre -->
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Nombre
      </div>
      <div class="grid grid-cols-1 gap-x-5 md:grid-cols-3">
        <FormItem label="Nombres" name="nombres" required>
          <Input
            v-model:value="form.nombres"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Juan Carlos"
            size="large"
            @blur="alSalirNombre('nombres')"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:user" />
            </template>
          </Input>
        </FormItem>
        <FormItem extra="Opcional." label="Apellido paterno" name="paterno">
          <Input
            v-model:value="form.paterno"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Mamani"
            size="large"
            @blur="alSalirNombre('paterno')"
          />
        </FormItem>
        <FormItem extra="Opcional." label="Apellido materno" name="materno">
          <Input
            v-model:value="form.materno"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Quispe"
            size="large"
            @blur="alSalirNombre('materno')"
          />
        </FormItem>
      </div>

      <!-- Contacto -->
      <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contacto
      </div>
      <FormItem extra="Opcional." label="Correo electrónico" name="email">
        <Input
          v-model:value="form.email"
          :maxlength="LIMITE_EMAIL"
          autocomplete="off"
          placeholder="Ej. jmamani@uap.edu.bo"
          size="large"
          type="email"
          @blur="alSalirEmail"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:mail" />
          </template>
        </Input>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
