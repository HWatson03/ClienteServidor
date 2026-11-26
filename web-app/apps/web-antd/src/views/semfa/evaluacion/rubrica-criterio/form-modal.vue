<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Rubrica } from '#/api/rubricas';
import type {
  RubricaCriterio,
  RubricaCriterioForm,
} from '#/api/rubricas-criterio';
import type { EscalaEdicion } from '#/utils/escala';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Form, FormItem, Input, Tooltip } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarRubricas } from '#/api/rubricas';
import SemfaEscalaCriterio from '#/components/semfa/semfa-escala-criterio.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { actividadDeRubrica } from '#/composables/useActividadTrabajo';
import { useActividadTrabajoStore } from '#/store';
import { aFormulario, errorEscala, escalaDesde, escalaPorDefecto, maximoDe } from '#/utils/escala';
import { limpiarEspacios, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'RubricaCriterioFormModal' });

const props = defineProps<{
  criterio: null | RubricaCriterio;
  /** Criterios activos: nombre repetido en la rúbrica y puntaje que suma cada una. */
  criterios: RubricaCriterio[];
  guardando: boolean;
  /** Rúbrica ya elegida en un alta (al agregar desde la fila de la rúbrica). */
  idRubricaInicial?: number;
}>();

const emit = defineEmits<{
  guardar: [form: RubricaCriterioForm, continuar: boolean];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.criterio !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const cargandoRubricas = ref(false);
const trabajo = useActividadTrabajoStore();
const rubricas = ref<Rubrica[]>([]);

const form = reactive<RubricaCriterioForm>({ descripcion: '', nombre: '', porcentaje: 10 });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 255;
const LIMITE_DESCRIPCION = 255;
/** Cómo califica el jurado este criterio (enteros, decimales o niveles). */
const escala = ref<EscalaEdicion>(escalaPorDefecto());
const errorDeEscala = ref('');

// El puntaje máximo del criterio es el de su escala.
watch(escala, (e) => {
  form.porcentaje = maximoDe(e);
  if (errorDeEscala.value) errorDeEscala.value = errorEscala(e);
});

/**
 * Al pegar una fila del Word la escala trae también el nombre del criterio y su
 * bloque: se proponen solo si esos campos están vacíos (no pisa lo ya escrito).
 */
function proponerCriterio(datos: { descripcion?: string; maximo?: number; nombre?: string }) {
  if (datos.nombre && !limpiarEspacios(form.nombre)) {
    form.nombre = datos.nombre.slice(0, LIMITE_NOMBRE);
    nextTick(() => formRef.value?.validateFields(['nombre']).catch(() => {}));
  }
  if (datos.descripcion && !limpiarEspacios(form.descripcion)) {
    form.descripcion = datos.descripcion.slice(0, LIMITE_DESCRIPCION);
  }
}

function normalizado(): RubricaCriterioForm {
  return {
    ...aFormulario(escala.value),
    descripcion: limpiarEspacios(form.descripcion),
    idRubrica: form.idRubrica,
    idRubricaCriterio: form.idRubricaCriterio,
    nombre: limpiarEspacios(form.nombre),
  };
}

const hayCambios = computed(() => JSON.stringify(normalizado()) !== original.value);

/** Ya calificado: puntaje y rúbrica quedan fijos (el backend responde 409). */
const calificado = computed(() => (props.criterio?.evaluaciones ?? 0) > 0);

// ---------------------------------------------------------------- rúbricas

/** Puntaje que suman hoy los criterios de cada rúbrica (sin el que se edita). */
function puntosDe(idRubrica: number) {
  return props.criterios
    .filter(
      (c) =>
        c.idRubrica === idRubrica &&
        c.idRubricaCriterio !== props.criterio?.idRubricaCriterio,
    )
    .reduce((s, c) => s + (Number(c.porcentaje) || 0), 0);
}

const opcionesRubrica = computed(() =>
  rubricas.value.map((r) => {
    const propia = r.idRubrica === props.criterio?.idRubrica;
    // Una rúbrica evaluada no admite ítems nuevos; la propia sí (se edita el existente).
    const bloqueada = r.evaluaciones > 0 && !propia;
    return {
      bloqueada,
      etiqueta: limpiarEspacios(r.nombre),
      motivo: bloqueada
        ? `Tiene ${r.evaluaciones} evaluaciones: no admite criterios nuevos`
        : '',
      puntos: puntosDe(r.idRubrica),
      valor: r.idRubrica,
    };
  }),
);

function elegirRubrica(id: number, bloqueada: boolean) {
  if (bloqueada || calificado.value) return;
  form.idRubrica = id;
  formRef.value?.validateFields(['idRubrica']).catch(() => {});
}

const rubricaElegida = computed(() =>
  opcionesRubrica.value.find((o) => o.valor === form.idRubrica),
);

/** Cómo queda la rúbrica con este criterio. */
const totalRubrica = computed(() =>
  rubricaElegida.value ? rubricaElegida.value.puntos + (Number(form.porcentaje) || 0) : 0,
);

// ---------------------------------------------------------------- reglas

const rules: Record<string, Rule[]> = {
  idRubrica: [{ message: 'Elija la rúbrica.', required: true, trigger: 'change' }],
  nombre: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        const nombre = limpiarEspacios(valor);
        if (!nombre) {
          throw new Error('Describa el criterio.');
        }
        if (nombre.length < 5) {
          throw new Error('Debe tener al menos 5 caracteres.');
        }
        const repetido = props.criterios.find(
          (c) =>
            c.idRubricaCriterio !== props.criterio?.idRubricaCriterio &&
            c.idRubrica === form.idRubrica &&
            normalizarTexto(limpiarEspacios(c.nombre)) === normalizarTexto(nombre),
        );
        if (repetido) {
          throw new Error('La rúbrica ya tiene un criterio con ese texto.');
        }
      },
    },
  ],
  porcentaje: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: number) => {
        if (!valor || valor < 1 || valor > 100) {
          throw new Error('Indique un puntaje entre 1 y 100.');
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- ciclo del modal

async function cargarRubricas() {
  cargandoRubricas.value = true;
  try {
    // Solo las rúbricas de la actividad de trabajo (y la propia, al editar).
    const [rubs, cats] = await Promise.all([listarRubricas(), listarCategoriasActividad()]);
    const mapa = new Map((cats ?? []).map((c) => [c.idCategoriaActividad, c.idActividad]));
    rubricas.value = (rubs ?? []).filter(
      (r) => actividadDeRubrica(r, mapa) === trabajo.idActividad || r.idRubrica === form.idRubrica,
    );
  } finally {
    cargandoRubricas.value = false;
  }
}

function cargar(c: null | RubricaCriterio, idRubrica?: number) {
  form.idRubricaCriterio = c?.idRubricaCriterio;
  form.idRubrica = c?.idRubrica ?? idRubrica;
  form.nombre = c?.nombre ?? '';
  escala.value = c ? escalaDesde(c.escala, c.porcentaje) : escalaPorDefecto();
  form.porcentaje = maximoDe(escala.value);
  form.descripcion = c?.descripcion ?? '';
  errorDeEscala.value = '';
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
  cargar(props.criterio, props.idRubricaInicial);
  cargarRubricas();
  enfocarNombre();
});

/** Tras «Guardar y nuevo» se conserva la rúbrica: se cargan seguidos sus ítems. */
function reiniciar() {
  registradas.value += 1;
  cargar(null, form.idRubrica);
  enfocarNombre();
}

defineExpose({ reiniciar });

async function guardar(continuar: boolean) {
  errorDeEscala.value = errorEscala(escala.value);
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (errorDeEscala.value) return;
  emit('guardar', normalizado(), continuar);
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:list-checks' : 'lucide:list-plus'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Corrija el texto o la descripción del criterio.'
        : 'Un ítem que el jurado califica dentro de la rúbrica.'
    "
    :texto-contador="['criterio registrado', 'criterios registrados']"
    :titulo="esEdicion ? 'Modificar criterio' : 'Registrar criterio'"
    :width="800"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <span class="text-lg font-semibold leading-none">{{ form.porcentaje || 0 }}</span>
          <span class="text-[10px]">pts</span>
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="line-clamp-2 text-base font-medium leading-snug"
          >
            {{ limpiarEspacios(form.nombre) || 'Texto del criterio' }}
          </div>
          <div class="text-sm text-muted-foreground">
            {{ rubricaElegida?.etiqueta ?? 'Sin rúbrica elegida' }}
            <template v-if="rubricaElegida">
              · la rúbrica queda en <b class="text-foreground">{{ totalRubrica }} pts</b>
            </template>
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="calificado"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        Ya se calificó <b class="text-foreground">{{ criterio?.evaluaciones }}</b> veces:
        su puntaje y su rúbrica no se pueden cambiar, porque los proyectos quedarían
        calificados con reglas distintas. Puede corregir el texto y la descripción.
      </span>
    </div>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <FormItem
        extra="Las rúbricas que ya tienen evaluaciones no admiten criterios nuevos."
        label="Rúbrica"
        name="idRubrica"
        required
      >
        <div class="flex flex-wrap gap-2">
          <Tooltip v-for="r in opcionesRubrica" :key="r.valor" :title="r.motivo">
            <button
              :class="{ 'is-activo': form.idRubrica === r.valor }"
              :disabled="guardando || r.bloqueada || (calificado && form.idRubrica !== r.valor)"
              class="semfa-chip"
              type="button"
              @click="elegirRubrica(r.valor, r.bloqueada)"
            >
              <IconifyIcon
                :icon="r.bloqueada ? 'lucide:lock' : 'lucide:clipboard-list'"
                class="size-3.5"
              />
              {{ r.etiqueta }}
              <span class="semfa-chip__total">{{ r.puntos }} pts</span>
            </button>
          </Tooltip>
          <span
            v-if="!cargandoRubricas && rubricas.length === 0"
            class="text-sm text-amber-600"
          >
            No hay rúbricas: regístrelas primero en Rúbrica.
          </span>
        </div>
      </FormItem>

      <FormItem label="Criterio" name="nombre" required>
        <Input.TextArea
          ref="nombreRef"
          v-model:value="form.nombre"
          :auto-size="{ minRows: 2, maxRows: 4 }"
          :maxlength="LIMITE_NOMBRE"
          placeholder="Ej. Innovación: el trabajo introduce novedades o mejora algo ya existente."
          show-count
        />
      </FormItem>

      <FormItem
        :help="errorDeEscala || (calificado ? 'Ya fue calificado: su escala no se puede cambiar.' : undefined)"
        :validate-status="errorDeEscala ? 'error' : ''"
        label="Cómo lo califica el jurado"
        required
      >
        <div class="rounded-lg border border-border bg-muted/20 p-3">
          <SemfaEscalaCriterio
            v-model="escala"
            :deshabilitado="guardando || calificado"
            @proponer="proponerCriterio"
          />
        </div>
      </FormItem>

      <div>
        <FormItem extra="Opcional." label="Descripción" name="descripcion">
          <Input.TextArea
            v-model:value="form.descripcion"
            :auto-size="{ minRows: 1, maxRows: 3 }"
            :maxlength="LIMITE_DESCRIPCION"
            placeholder="Aclaración para el jurado."
          />
        </FormItem>
      </div>
    </Form>
  </SemfaModalForm>
</template>
