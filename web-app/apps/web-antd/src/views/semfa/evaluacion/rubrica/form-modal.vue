<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { Actividad } from '#/api/actividades';
import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Rubrica, RubricaForm } from '#/api/rubricas';
import type { EscalaForm, RubricaCriterio } from '#/api/rubricas-criterio';
import type { EscalaEdicion } from '#/utils/escala';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Form, FormItem, Input, InputNumber, Tooltip } from 'ant-design-vue';

import { listarActividades } from '#/api/actividades';
import { listarCategoriasActividad } from '#/api/categorias-actividad';
import SemfaEscalaCriterio from '#/components/semfa/semfa-escala-criterio.vue';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import { useActividadTrabajoStore } from '#/store';
import { aFormulario, copiarEscala, errorEscala, escalaPorDefecto, resumenEdicion, resumenEscala } from '#/utils/escala';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'RubricaFormModal' });

const props = defineProps<{
  /** Criterios activos: los de la rúbrica en edición se muestran. */
  criterios: RubricaCriterio[];
  guardando: boolean;
  rubrica: null | Rubrica;
  /** Rúbricas activas: nombre + versión repetidos en la misma referencia. */
  rubricas: Rubrica[];
}>();

const emit = defineEmits<{
  /** `cambioDatos`: si cambió nombre, versión o referencia (si no, solo se agregan criterios). */
  guardar: [form: RubricaForm, continuar: boolean, criterios: CriterioNuevo[], cambioDatos: boolean];
}>();

/** Criterio que se crea junto con la rúbrica (o que se agrega al editarla), con su escala. */
export interface CriterioNuevo extends EscalaForm {
  descripcion: string;
  nombre: string;
  porcentaje: number;
}

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.rubrica !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const cargandoOpciones = ref(false);
const trabajo = useActividadTrabajoStore();
const actividades = ref<Actividad[]>([]);
const categorias = ref<CategoriaActividad[]>([]);

/**
 * La rúbrica cuelga de una Actividad **o** de una Categoría (el backend exige
 * exactamente una). `alcance` elige cuál; la actividad se usa en ambos casos
 * para filtrar sus categorías.
 */
const alcance = ref<'actividad' | 'categoria'>('actividad');
const idActividadElegida = ref<number>();

const form = reactive<RubricaForm>({ nombre: '', version: '1' });
const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 120;
const LIMITE_VERSION = 20;

function normalizado(): RubricaForm {
  return {
    idActividad: alcance.value === 'actividad' ? idActividadElegida.value : undefined,
    idCategoriaActividad: alcance.value === 'categoria' ? form.idCategoriaActividad : undefined,
    idRubrica: form.idRubrica,
    nombre: limpiarEspacios(form.nombre),
    version: limpiarEspacios(form.version),
  };
}

const cambioDatos = computed(() => JSON.stringify(normalizado()) !== original.value);
const hayCambios = computed(() => cambioDatos.value || criteriosListos.value.length > 0);

/** Con evaluaciones no puede cambiar de referencia (el backend responde 409). */
const referenciaFija = computed(() => (props.rubrica?.evaluaciones ?? 0) > 0);

const categoriasDeActividad = computed(() =>
  categorias.value
    .filter((c) => c.idActividad === idActividadElegida.value)
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es')),
);

function elegirActividad(id: number) {
  if (referenciaFija.value) return;
  idActividadElegida.value = id;
  form.idCategoriaActividad = undefined;
}

function elegirAlcance(valor: 'actividad' | 'categoria') {
  if (referenciaFija.value) return;
  alcance.value = valor;
  form.idCategoriaActividad = undefined;
}

const referenciaTexto = computed(() => {
  const act = actividades.value.find((a) => a.idActividad === idActividadElegida.value);
  if (alcance.value === 'actividad') {
    return act ? `Toda la actividad ${limpiarEspacios(act.nombre)}` : '';
  }
  const cat = categorias.value.find((c) => c.idCategoriaActividad === form.idCategoriaActividad);
  return cat ? `Categoría ${nombrePropio(cat.nombre)}` : '';
});

// ---------------------------------------------------------------- criterios

interface FilaCriterio {
  /** Escala desplegada para editarla. */
  abierta: boolean;
  clave: number;
  descripcion: string;
  escala: EscalaEdicion;
  nombre: string;
}

let siguienteClave = 1;
const filas = ref<FilaCriterio[]>([]);
const intentoGuardar = ref(false);

/** Fila nueva con la escala de la anterior: los criterios de una rúbrica suelen compartirla. */
function filaVacia(base?: EscalaEdicion): FilaCriterio {
  return {
    abierta: false,
    clave: siguienteClave++,
    descripcion: '',
    escala: base ? copiarEscala(base) : escalaPorDefecto(),
    nombre: '',
  };
}

/** Criterios que ya tiene la rúbrica en edición. */
const existentes = computed(() =>
  props.rubrica ? props.criterios.filter((c) => c.idRubrica === props.rubrica!.idRubrica) : [],
);

/** Una rúbrica ya evaluada no admite criterios nuevos (el backend responde 409). */
const admiteNuevos = computed(() => (props.rubrica?.evaluaciones ?? 0) === 0);

const llenas = computed(() => filas.value.filter((f) => limpiarEspacios(f.nombre)));

const criteriosListos = computed<CriterioNuevo[]>(() =>
  llenas.value.map((f) => ({
    ...aFormulario(f.escala),
    descripcion: limpiarEspacios(f.descripcion),
    nombre: limpiarEspacios(f.nombre),
  })),
);

const totalPuntos = computed(
  () =>
    existentes.value.reduce((s, c) => s + (c.escala?.maximo ?? (Number(c.porcentaje) || 0)), 0) +
    criteriosListos.value.reduce((s, c) => s + c.porcentaje, 0),
);

/** Error de cada fila (por clave): texto corto, repetido o escala inválida. */
const erroresFila = computed(() => {
  const mapa = new Map<number, string>();
  const vistos = new Set(existentes.value.map((c) => normalizarTexto(limpiarEspacios(c.nombre))));
  for (const f of filas.value) {
    const nombre = limpiarEspacios(f.nombre);
    if (!nombre) continue;
    const clave = normalizarTexto(nombre);
    const escala = errorEscala(f.escala);
    if (nombre.length < 5) mapa.set(f.clave, 'Al menos 5 caracteres.');
    else if (vistos.has(clave)) mapa.set(f.clave, 'Repetido en esta rúbrica.');
    else if (escala) mapa.set(f.clave, escala);
    vistos.add(clave);
  }
  return mapa;
});

function agregarFila() {
  const ultima = filas.value.at(-1);
  filas.value = [...filas.value, filaVacia(ultima?.escala)];
  nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('.semfa-criterio-nuevo__nombre input');
    inputs[inputs.length - 1]?.focus();
  });
}

/**
 * Enter en un criterio agrega el siguiente y no llega al atajo «Guardar» del
 * modal (antes guardaba la rúbrica con la fila a medio llenar). Ctrl+Enter
 * sigue siendo «Guardar y nuevo».
 */
function enterEnCriterio(evento: KeyboardEvent) {
  if (evento.ctrlKey || evento.metaKey) return;
  evento.preventDefault();
  evento.stopPropagation();
  agregarFila();
}

function quitarFila(clave: number) {
  filas.value = filas.value.filter((f) => f.clave !== clave);
  if (filas.value.length === 0 && !esEdicion.value) filas.value = [filaVacia()];
}

/** Mismo máximo para todos los criterios con escala numérica. */
function mismoPuntaje(puntos: number) {
  filas.value = filas.value.map((f) =>
    f.escala.modo === 'numeros' ? { ...f, escala: { ...f.escala, maximo: puntos } } : f,
  );
}

/** Al pegar una fila del Word: nombre y bloque del criterio, solo si la fila no los tiene. */
function proponerFila(f: FilaCriterio, datos: { descripcion?: string; maximo?: number; nombre?: string }) {
  if (datos.nombre && !limpiarEspacios(f.nombre)) f.nombre = datos.nombre.slice(0, 255);
  if (datos.descripcion && !limpiarEspacios(f.descripcion)) f.descripcion = datos.descripcion.slice(0, 255);
}

function maximoFila(f: FilaCriterio, valor: null | number | string) {
  f.escala = { ...f.escala, maximo: valor === null ? undefined : Number(valor) };
}

/**
 * «Pegar varios»: una línea por criterio, con las columnas separadas por
 * tabulador (al copiar una tabla) o «|»: nombre, puntos y descripción. Se
 * ignoran encabezados y separadores de tablas Markdown.
 */
const pegando = ref(false);
const textoPegado = ref('');

function procesarPegado() {
  const nuevas: FilaCriterio[] = [];
  const base = filas.value.at(-1)?.escala;
  for (const linea of textoPegado.value.split(/\r?\n/)) {
    const celdas = linea
      .split(/\t|\|/)
      .map((c) => limpiarEspacios(c.replaceAll('`', '')))
      .filter(Boolean);
    if (celdas.length === 0 || /^[-:\s]+$/.test(celdas.join(''))) continue;
    const puntos = Number.parseInt(celdas[1] ?? '', 10);
    if (celdas.length > 1 && Number.isNaN(puntos) && /criterio|nombre/i.test(celdas[0]!)) continue;
    const fila = filaVacia(base);
    fila.nombre = celdas[0]!;
    fila.descripcion = celdas.slice(Number.isNaN(puntos) ? 1 : 2).join(' ');
    if (!Number.isNaN(puntos)) fila.escala = { ...escalaPorDefecto(puntos), minimo: fila.escala.minimo, paso: fila.escala.paso };
    nuevas.push(fila);
  }
  if (nuevas.length === 0) return;
  filas.value = [...filas.value.filter((f) => limpiarEspacios(f.nombre)), ...nuevas];
  textoPegado.value = '';
  pegando.value = false;
}

// ---------------------------------------------------------------- reglas

const errorReferencia = ref('');

function validarReferencia() {
  errorReferencia.value = !idActividadElegida.value
    ? 'Elija la actividad.'
    : alcance.value === 'categoria' && !form.idCategoriaActividad
      ? 'Elija la categoría.'
      : '';
  return !errorReferencia.value;
}

/** Mismo criterio que el backend: misma referencia + mismo nombre + misma versión. */
function repetida() {
  const n = normalizado();
  return props.rubricas.find(
    (r) =>
      r.idRubrica !== props.rubrica?.idRubrica &&
      (n.idActividad
        ? r.idActividad === n.idActividad
        : r.idCategoriaActividad === n.idCategoriaActividad) &&
      normalizarTexto(limpiarEspacios(r.nombre)) === normalizarTexto(n.nombre) &&
      normalizarTexto(limpiarEspacios(r.version)) === normalizarTexto(n.version),
  );
}

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
        if (repetida()) {
          throw new Error('Ya existe una rúbrica con ese nombre y versión aquí.');
        }
      },
    },
  ],
  version: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        if (!limpiarEspacios(valor)) {
          throw new Error('La versión es obligatoria.');
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- ciclo del modal

async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    const [a, c] = await Promise.all([listarActividades(), listarCategoriasActividad()]);
    // Solo la actividad de trabajo (y la propia, al editar): así queda elegida sola.
    actividades.value = (a ?? []).filter(
      (x) => x.idActividad === trabajo.idActividad || x.idActividad === idActividadElegida.value,
    );
    categorias.value = c ?? [];
    // La actividad de una rúbrica de categoría sale de su categoría.
    if (!idActividadElegida.value && form.idCategoriaActividad) {
      idActividadElegida.value = categorias.value.find(
        (x) => x.idCategoriaActividad === form.idCategoriaActividad,
      )?.idActividad ?? undefined;
    }
    if (!idActividadElegida.value && actividades.value.length === 1) {
      idActividadElegida.value = actividades.value[0]!.idActividad;
    }
    original.value = JSON.stringify(normalizado());
  } finally {
    cargandoOpciones.value = false;
  }
}

function cargar(r: null | Rubrica, conservarReferencia = false) {
  form.idRubrica = r?.idRubrica;
  form.nombre = r?.nombre ?? '';
  form.version = r?.version ?? '1';
  if (!conservarReferencia) {
    alcance.value = r?.idCategoriaActividad ? 'categoria' : 'actividad';
    form.idCategoriaActividad = r?.idCategoriaActividad ?? undefined;
    idActividadElegida.value = r?.idActividad ?? undefined;
  }
  errorReferencia.value = '';
  intentoGuardar.value = false;
  pegando.value = false;
  textoPegado.value = '';
  filas.value = r ? [] : [filaVacia(conservarReferencia ? filas.value.at(-1)?.escala : undefined)];
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
  cargar(props.rubrica);
  cargarOpciones();
  enfocarNombre();
});

/** Tras «Guardar y nuevo» se conserva la referencia: se cargan seguidas las de una actividad. */
function reiniciar() {
  registradas.value += 1;
  cargar(null, true);
  enfocarNombre();
}

defineExpose({ reiniciar });

async function guardar(continuar: boolean) {
  intentoGuardar.value = true;
  const referenciaOk = validarReferencia();
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (referenciaOk && erroresFila.value.size === 0) {
    emit('guardar', normalizado(), continuar, criteriosListos.value, cambioDatos.value);
  }
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:clipboard-pen-line' : 'lucide:clipboard-list'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Cambie el nombre o la versión de la rúbrica.'
        : 'Un componente de la nota (p. ej. Coreografía, Vestimenta) con los criterios que califica el jurado.'
    "
    :texto-contador="['rúbrica registrada', 'rúbricas registradas']"
    :titulo="esEdicion ? 'Modificar rúbrica' : 'Registrar rúbrica'"
    :width="860"
    @guardar="guardar"
  >
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <IconifyIcon class="size-6" icon="lucide:clipboard-list" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="truncate text-base font-medium"
          >
            {{ limpiarEspacios(form.nombre) || 'Nombre de la rúbrica' }}
            <span v-if="limpiarEspacios(form.version)" class="text-sm font-normal text-muted-foreground">
              · v{{ limpiarEspacios(form.version) }}
            </span>
          </div>
          <div class="truncate text-sm text-muted-foreground">
            {{ referenciaTexto || 'Sin referencia elegida' }}
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="referenciaFija"
      class="mb-4 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground"
    >
      <IconifyIcon class="mt-0.5 size-4 shrink-0 text-primary" icon="lucide:info" />
      <span>
        Tiene <b class="text-foreground">{{ rubrica?.evaluaciones }}</b> evaluaciones de
        jurados: su actividad o categoría no se puede cambiar. Para otra referencia,
        cree una rúbrica nueva.
      </span>
    </div>

    <Form
      ref="formRef"
      :disabled="guardando"
      :model="form"
      :rules="rules"
      layout="vertical"
    >
      <!-- Referencia -->
      <FormItem
        :help="errorReferencia || undefined"
        :validate-status="errorReferencia ? 'error' : ''"
        label="Se aplica a"
        required
      >
        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="a in actividades"
              :key="a.idActividad"
              :class="{ 'is-activo': idActividadElegida === a.idActividad }"
              :disabled="guardando || (referenciaFija && idActividadElegida !== a.idActividad)"
              class="semfa-chip"
              type="button"
              @click="elegirActividad(a.idActividad)"
            >
              <IconifyIcon class="size-3.5" icon="lucide:calendar-days" />
              {{ limpiarEspacios(a.nombre) }}
            </button>
          </div>
          <div v-if="idActividadElegida" class="flex flex-wrap items-center gap-2">
            <button
              :class="{ 'is-activo': alcance === 'actividad' }"
              :disabled="guardando || (referenciaFija && alcance !== 'actividad')"
              class="semfa-chip"
              type="button"
              @click="elegirAlcance('actividad')"
            >
              <IconifyIcon class="size-3.5" icon="lucide:layers" />
              Todas sus categorías
            </button>
            <button
              :class="{ 'is-activo': alcance === 'categoria' }"
              :disabled="guardando || (referenciaFija && alcance !== 'categoria')"
              class="semfa-chip"
              type="button"
              @click="elegirAlcance('categoria')"
            >
              <IconifyIcon class="size-3.5" icon="lucide:square-dot" />
              Solo una categoría
            </button>
          </div>
          <div
            v-if="idActividadElegida && alcance === 'categoria'"
            class="flex flex-wrap gap-1.5"
          >
            <button
              v-for="c in categoriasDeActividad"
              :key="c.idCategoriaActividad"
              :class="{ 'is-activo': form.idCategoriaActividad === c.idCategoriaActividad }"
              :disabled="guardando || (referenciaFija && form.idCategoriaActividad !== c.idCategoriaActividad)"
              class="semfa-chip"
              type="button"
              @click="form.idCategoriaActividad = c.idCategoriaActividad"
            >
              {{ nombrePropio(c.nombre) }}
            </button>
          </div>
        </div>
      </FormItem>

      <div class="grid grid-cols-1 gap-x-5 md:grid-cols-3">
        <FormItem class="md:col-span-2" label="Nombre" name="nombre" required>
          <Input
            ref="nombreRef"
            v-model:value="form.nombre"
            :maxlength="LIMITE_NOMBRE"
            autocomplete="off"
            placeholder="Ej. Exposición y defensa"
            size="large"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:clipboard-list" />
            </template>
          </Input>
        </FormItem>
        <FormItem
          extra="Cámbiela solo si reemplaza una rúbrica ya usada."
          label="Versión"
          name="version"
          required
        >
          <Input
            v-model:value="form.version"
            :maxlength="LIMITE_VERSION"
            autocomplete="off"
            placeholder="Ej. 1, 2026-1"
            size="large"
          />
        </FormItem>
      </div>
    </Form>

    <!-- Criterios: lo que el jurado califica con botones de 1 al puntaje -->
    <div class="rounded-xl border border-border bg-muted/20 p-3">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <IconifyIcon class="size-4 text-primary" icon="lucide:list-checks" />
        <span class="font-medium">Criterios que calificará el jurado</span>
        <span
          :class="totalPuntos > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
          class="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
        >
          {{ totalPuntos }} pts
        </span>
        <div v-if="admiteNuevos" class="ml-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <template v-if="filas.length > 1">
            Mismo puntaje para todos:
            <button
              v-for="n in [5, 8, 10]"
              :key="n"
              :disabled="guardando"
              class="semfa-chip !px-2 !py-0 !text-xs"
              type="button"
              @click="mismoPuntaje(n)"
            >
              {{ n }}
            </button>
          </template>
          <Button size="small" type="link" @click="pegando = !pegando">
            <IconifyIcon class="mr-1 inline size-3.5" icon="lucide:clipboard-paste" />
            Pegar varios
          </Button>
        </div>
      </div>

      <!-- Pegar una lista o una tabla copiada -->
      <div v-if="pegando" class="mb-3 rounded-lg border border-dashed border-primary/40 bg-card p-2">
        <Input.TextArea
          v-model:value="textoPegado"
          :auto-size="{ minRows: 3, maxRows: 8 }"
          placeholder="Pegue una tabla o una línea por criterio: Nombre | puntos | descripción&#10;Creatividad coreográfica | 10 | Figuras variadas y originales&#10;Sincronización del grupo | 10 | Todos al mismo tiempo"
        />
        <div class="mt-2 flex justify-end gap-2">
          <Button size="small" @click="pegando = false">Cancelar</Button>
          <Button :disabled="!textoPegado.trim()" class="semfa-btn semfa-btn--primario" size="small" @click="procesarPegado">
            Agregar a la lista
          </Button>
        </div>
      </div>

      <!-- Los que ya tiene (edición) -->
      <div
        v-for="(c, n) in existentes"
        :key="c.idRubricaCriterio"
        class="flex items-center gap-3 border-b border-border/60 py-1.5 text-sm last:border-b-0"
      >
        <span class="w-5 text-right text-xs tabular-nums text-muted-foreground">{{ n + 1 }}</span>
        <span class="min-w-0 flex-1 truncate">{{ limpiarEspacios(c.nombre) }}</span>
        <span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums" :title="c.escala ? resumenEscala(c.escala) : ''">
          {{ c.escala?.maximo ?? c.porcentaje }} pts
        </span>
      </div>
      <p v-if="existentes.length > 0" class="mb-2 mt-1 text-xs text-muted-foreground">
        Para cambiar o quitar uno de estos, use el lápiz junto al criterio en la tabla.
      </p>

      <p v-if="!admiteNuevos" class="m-0 text-sm text-muted-foreground">
        <IconifyIcon class="inline size-4 text-amber-500" icon="lucide:lock" />
        Ya tiene evaluaciones: no admite criterios nuevos.
      </p>

      <template v-else>
        <!-- Nuevos -->
        <div
          v-for="(f, n) in filas"
          :key="f.clave"
          class="semfa-criterio-nuevo mb-2 rounded-lg border border-border bg-card px-2.5 py-2"
        >
          <div class="flex items-start gap-2">
            <span class="mt-1.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {{ existentes.length + n + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <Input
                v-model:value="f.nombre"
                :maxlength="255"
                :status="intentoGuardar && erroresFila.get(f.clave) ? 'error' : ''"
                class="semfa-criterio-nuevo__nombre"
                placeholder="Qué se califica. Ej. Sincronización del grupo"
                @keydown.enter="enterEnCriterio"
              />
              <Input
                v-model:value="f.descripcion"
                :maxlength="255"
                class="mt-1.5"
                placeholder="Guía para el jurado (opcional). Ej. Todos ejecutan los pasos al mismo tiempo"
                size="small"
                @keydown.enter="enterEnCriterio"
              />
              <div v-if="erroresFila.get(f.clave) && (intentoGuardar || f.nombre.length >= 5)" class="mt-1 text-xs text-red-600">
                {{ erroresFila.get(f.clave) }}
              </div>
            </div>
            <InputNumber
              v-if="f.escala.modo === 'numeros'"
              :max="100"
              :min="1"
              :value="f.escala.maximo"
              addon-after="pts"
              class="w-28 shrink-0"
              title="Puntaje máximo del criterio"
              @keydown.enter="enterEnCriterio"
              @update:value="(v) => maximoFila(f, v)"
            />
            <Tooltip :title="resumenEdicion(f.escala)">
              <button
                :class="f.abierta ? 'border-primary text-primary' : 'border-border text-muted-foreground'"
                class="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-primary hover:text-primary"
                type="button"
                @click="f.abierta = !f.abierta"
              >
                <IconifyIcon :icon="f.escala.modo === 'numeros' ? 'lucide:sliders-horizontal' : 'lucide:list-ordered'" class="size-3.5" />
                {{ f.escala.modo === 'numeros' ? (f.escala.paso === 1 ? 'Escala' : `±${f.escala.paso}`) : `${f.escala.niveles.length} niveles${f.escala.modo === 'rangos' ? ' por rango' : ''}` }}
                <IconifyIcon :icon="f.abierta ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-3" />
              </button>
            </Tooltip>
            <Button :disabled="guardando" class="shrink-0" title="Quitar" type="text" @click="quitarFila(f.clave)">
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:x" />
            </Button>
          </div>
          <div v-if="f.abierta" class="ml-7 mt-2 rounded-md border border-border bg-muted/30 p-2">
            <SemfaEscalaCriterio
              v-model="f.escala"
              :deshabilitado="guardando"
              :mostrar-maximo="false"
              @proponer="(datos) => proponerFila(f, datos)"
            />
          </div>
        </div>

        <button
          :disabled="guardando"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/50 py-2 text-sm font-medium text-primary transition hover:bg-primary/5"
          type="button"
          @click="agregarFila"
        >
          <IconifyIcon class="size-4" icon="lucide:plus" />
          Agregar criterio
        </button>
        <p class="mb-0 mt-2 text-xs text-muted-foreground">
          Enter en un criterio agrega el siguiente; las filas sin nombre se ignoran. «Escala» define
          cómo califica el jurado: enteros, decimales o niveles con descripción. Lo normal es que las
          rúbricas de cada categoría sumen 100 puntos.
        </p>
      </template>
    </div>
  </SemfaModalForm>
</template>
