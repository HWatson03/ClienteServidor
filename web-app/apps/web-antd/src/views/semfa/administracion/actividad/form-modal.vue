<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import type { Dayjs } from 'dayjs';

import type { Actividad, ActividadForm } from '#/api/actividades';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { DatePicker, Form, FormItem, Input, InputNumber } from 'ant-design-vue';

import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import {
  diasHasta,
  fechaLocal,
  fechaRelativa,
  formatearFecha,
  limpiarEspacios,
  normalizarTexto,
} from '#/utils/formato';
import { rangoFechas } from '#/utils/jornadas';

defineOptions({ name: 'ActividadFormModal' });

const props = defineProps<{
  actividad: Actividad | null;
  /** Actividades activas: nombre repetido y tipos ya usados como sugerencia. */
  actividades: Actividad[];
  guardando: boolean;
}>();

const emit = defineEmits<{
  guardar: [form: ActividadForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.actividad !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const form = ref<ActividadForm>({ descripcion: '', fecha: '', fechaFin: '', nombre: '', tipo: '' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 150;
const LIMITE_TIPO = 60;
const LIMITE_DESCRIPCION = 255;

function normalizado(): ActividadForm {
  return {
    descripcion: limpiarEspacios(form.value.descripcion),
    fecha: form.value.fecha || '',
    fechaFin: form.value.fechaFin || '',
    idActividad: form.value.idActividad,
    maxPorInstitucion: form.value.maxPorInstitucion ?? null,
    minPorInstitucion: form.value.minPorInstitucion ?? null,
    nombre: limpiarEspacios(form.value.nombre),
    tipo: limpiarEspacios(form.value.tipo).toUpperCase(),
  };
}

/** Mínimo mayor que el máximo: el backend lo rechaza (400). */
const errorLimites = computed(() => {
  const { maxPorInstitucion: max, minPorInstitucion: min } = form.value;
  return min && max && min > max ? 'El mínimo no puede ser mayor que el máximo.' : '';
});

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

// ---------------------------------------------------------------- tipo

/** Tipos habituales más los ya usados, para elegir con un clic. */
const TIPOS_BASE = ['FERIA', 'CONCURSO', 'FESTIVAL', 'EXPOSICIÓN'];

const tiposSugeridos = computed(() => {
  const usados = props.actividades
    .map((a) => limpiarEspacios(a.tipo).toUpperCase())
    .filter(Boolean);
  return [...new Set([...TIPOS_BASE, ...usados])];
});

function elegirTipo(tipo: string) {
  form.value.tipo = tipo;
  formRef.value?.validateFields(['tipo']).catch(() => {});
}

// ---------------------------------------------------------------- fecha

const estadoFecha = computed(() => {
  const dias = diasHasta(form.value.fecha);
  if (dias === null) {
    return null;
  }
  if (dias === 0) {
    return { clase: 'text-primary', icono: 'lucide:calendar-check', texto: 'Es hoy' };
  }
  return dias > 0
    ? { clase: 'text-green-600', icono: 'lucide:calendar-clock', texto: fechaRelativa(form.value.fecha) }
    : { clase: 'text-amber-600', icono: 'lucide:calendar-x', texto: `${fechaRelativa(form.value.fecha)} (ya pasó)` };
});

/** Días que dura: con `fechaFin` posterior, la feria se reparte en jornadas. */
const jornadas = computed(() => {
  const inicio = fechaLocal(form.value.fecha);
  const fin = fechaLocal(form.value.fechaFin);
  if (!inicio || !fin || fin < inicio) {
    return 1;
  }
  return Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1;
});

/** El selector no deja elegir días anteriores al inicio. */
function antesDelInicio(dia: Dayjs) {
  return !!form.value.fecha && dia.format('YYYY-MM-DD') < form.value.fecha;
}

// ---------------------------------------------------------------- reglas

const rules: Record<string, Rule[]> = {
  fecha: [{ message: 'Elija la fecha de la actividad.', required: true, trigger: 'change' }],
  fechaFin: [
    {
      trigger: 'change',
      validator: async (_rule, valor: string) => {
        if (valor && form.value.fecha && valor < form.value.fecha) {
          throw new Error('No puede ser anterior a la fecha de inicio.');
        }
        if (jornadas.value > 10) {
          throw new Error('Hasta 10 jornadas.');
        }
      },
    },
  ],
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
        const repetida = props.actividades.find(
          (a) =>
            a.idActividad !== props.actividad?.idActividad &&
            normalizarTexto(limpiarEspacios(a.nombre)) === normalizarTexto(nombre),
        );
        if (repetida) {
          throw new Error(`Ya existe la actividad «${repetida.nombre}».`);
        }
      },
    },
  ],
  tipo: [{ message: 'Indique el tipo de actividad.', required: true, trigger: ['blur', 'change'] }],
};

// ---------------------------------------------------------------- ciclo del modal

function cargar(a: Actividad | null) {
  form.value = {
    descripcion: a?.descripcion ?? '',
    fecha: a?.fecha ?? '',
    fechaFin: a?.fechaFin ?? '',
    idActividad: a?.idActividad,
    maxPorInstitucion: a?.maxPorInstitucion ?? null,
    minPorInstitucion: a?.minPorInstitucion ?? null,
    nombre: a?.nombre ?? '',
    tipo: a?.tipo ?? '',
  };
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
  cargar(props.actividad);
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
  if (errorLimites.value) return;
  emit('guardar', normalizado(), continuar);
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:calendar-cog' : 'lucide:calendar-plus'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Actualice los datos del concurso o feria.'
        : 'Registre un concurso o feria: después podrá crear sus categorías y asignar jurados.'
    "
    :texto-contador="['actividad registrada', 'actividades registradas']"
    :titulo="esEdicion ? 'Modificar actividad' : 'Registrar actividad'"
    :width="780"
    @guardar="guardar"
  >
    <!-- Vista previa -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:trophy" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre) || 'Nombre de la actividad' }}
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span
              v-if="limpiarEspacios(form.tipo)"
              class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {{ limpiarEspacios(form.tipo).toUpperCase() }}
            </span>
            <span v-if="form.fecha" class="flex items-center gap-1">
              <IconifyIcon class="size-3.5" icon="lucide:calendar-days" />
              <template v-if="jornadas > 1">
                {{ rangoFechas(form.fecha, form.fechaFin) }} · {{ jornadas }} jornadas
              </template>
              <template v-else>{{ formatearFecha(form.fecha) }}</template>
            </span>
            <span
              v-if="estadoFecha"
              :class="estadoFecha.clase"
              class="flex items-center gap-1"
            >
              <IconifyIcon :icon="estadoFecha.icono" class="size-3.5" />
              {{ estadoFecha.texto }}
            </span>
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
        extra="Como aparecerá en rankings, reportes y el panel del jurado."
        label="Nombre"
        name="nombre"
        required
      >
        <Input
          ref="nombreRef"
          v-model:value="form.nombre"
          :maxlength="LIMITE_NOMBRE"
          autocomplete="off"
          placeholder="Ej. EXPOINNOVA ACEF 2026"
          size="large"
        >
          <template #prefix>
            <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:trophy" />
          </template>
        </Input>
      </FormItem>

      <div class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <FormItem label="Tipo" name="tipo" required>
          <Input
            v-model:value="form.tipo"
            :maxlength="LIMITE_TIPO"
            autocomplete="off"
            placeholder="Elija abajo o escriba otro"
            size="large"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:tag" />
            </template>
          </Input>
          <template #extra>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                v-for="t in tiposSugeridos"
                :key="t"
                :class="{ 'is-activo': limpiarEspacios(form.tipo).toUpperCase() === t }"
                :disabled="guardando"
                class="semfa-chip"
                type="button"
                @click="elegirTipo(t)"
              >
                {{ t }}
              </button>
            </div>
          </template>
        </FormItem>

        <FormItem label="Fecha" name="fecha" required>
          <DatePicker
            v-model:value="form.fecha"
            class="w-full"
            format="DD/MM/YYYY"
            placeholder="dd/mm/aaaa"
            size="large"
            value-format="YYYY-MM-DD"
          />
          <template #extra>
            <span v-if="estadoFecha" :class="estadoFecha.clase" class="flex items-center gap-1">
              <IconifyIcon :icon="estadoFecha.icono" class="size-3.5" />
              {{ estadoFecha.texto }}
            </span>
            <span v-else>Día en que se realiza (o el primero, si dura varios).</span>
          </template>
        </FormItem>
      </div>

      <FormItem label="Fecha de fin (si dura varios días)" name="fechaFin">
        <DatePicker
          v-model:value="form.fechaFin"
          :default-picker-value="form.fecha || undefined"
          :disabled-date="antesDelInicio"
          allow-clear
          class="w-full md:w-1/2"
          format="DD/MM/YYYY"
          placeholder="Vacío = un solo día"
          size="large"
          value-format="YYYY-MM-DD"
          @change="formRef?.validateFields(['fechaFin']).catch(() => {})"
        />
        <template #extra>
          <span v-if="jornadas > 1" class="flex items-center gap-1 text-primary">
            <IconifyIcon class="size-3.5" icon="lucide:calendar-range" />
            {{ rangoFechas(form.fecha, form.fechaFin) }} · {{ jornadas }} jornadas: cada proyecto se asigna a un día en
            Participantes.
          </span>
          <span v-else>Opcional. Ej. FEXCOIN: del 13 al 14 de noviembre (2 jornadas).</span>
        </template>
      </FormItem>

      <FormItem extra="Opcional." label="Descripción" name="descripcion">
        <Input.TextArea
          v-model:value="form.descripcion"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="LIMITE_DESCRIPCION"
          placeholder="Ej. Feria de proyectos de estudiantes de la facultad."
          show-count
        />
      </FormItem>

      <FormItem
        :help="errorLimites || undefined"
        :validate-status="errorLimites ? 'error' : ''"
        extra="Opcional. Ej. FEXCOIN: cada carrera inscribe de 2 a 3 proyectos. Se compara la «Institución» del participante."
        label="Participantes por institución"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm text-muted-foreground">Mínimo</span>
          <InputNumber :max="99" :min="1" :value="form.minPorInstitucion ?? undefined" class="w-24" placeholder="—" @update:value="(v) => (form.minPorInstitucion = v === null || v === undefined ? null : Number(v))" />
          <span class="text-sm text-muted-foreground">Máximo</span>
          <InputNumber :max="99" :min="1" :value="form.maxPorInstitucion ?? undefined" class="w-24" placeholder="—" @update:value="(v) => (form.maxPorInstitucion = v === null || v === undefined ? null : Number(v))" />
          <span class="text-xs text-muted-foreground">El máximo bloquea al inscribir; el mínimo se avisa en el Resumen.</span>
        </div>
      </FormItem>
    </Form>
  </SemfaModalForm>
</template>
