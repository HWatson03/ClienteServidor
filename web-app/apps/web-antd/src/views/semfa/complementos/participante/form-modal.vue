<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { DatosFeriaEditados, InscripcionNueva } from './tipos';

import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { CategoriaParticipante } from '#/api/categorias-participante';
import type { Carrera } from '#/api/estructura';
import type { Inscripcion } from '#/api/inscripciones';
import type { EquipoForm, Participante, ParticipanteForm, PersonaEquipo } from '#/api/participantes';
import type { Persona } from '#/api/personas';
import type { TipoParticipante } from '#/api/tipos-participante';
import type { EtiquetaPersona } from '#/components/semfa/tipos';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { AutoComplete, Button, Form, FormItem, Input, Select } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { crearCategoriaParticipante, listarCategoriasParticipante } from '#/api/categorias-participante';
import { listarCarreras } from '#/api/estructura';
import { listarInscripciones } from '#/api/inscripciones';
import { obtenerEquipoParticipante } from '#/api/participantes';
import { listarPersonas } from '#/api/personas';
import { crearTipoParticipante, listarTiposParticipante } from '#/api/tipos-participante';
import SemfaModalForm from '#/components/semfa/semfa-modal-form.vue';
import SemfaSelectorPersona from '#/components/semfa/semfa-selector-persona.vue';
import { avisar } from '#/composables/useAvisos';
import { useActividadTrabajoStore } from '#/store';
import { limpiarEspacios, nombrePropio, normalizarTexto } from '#/utils/formato';
import { opcionesJornada } from '#/utils/jornadas';

defineOptions({ name: 'ParticipanteFormModal' });

/**
 * Alta o edición de un participante, en tres pasos:
 *  1. Quién es: nombre e institución (con buscador; si no existe se registra
 *     tal como se escribe).
 *  2. Clasificación: tipo y categoría de participante. Se proponen los que ya
 *     usan los demás inscritos de la actividad de trabajo; se pueden cambiar o
 *     crear aquí mismo.
 *  3. Dónde compite: categoría de la actividad de trabajo (la actividad no se
 *     elige: es la de la barra superior).
 */
const props = defineProps<{
  guardando: boolean;
  /** Inscripciones del participante en edición (solo se muestran). */
  inscripciones: Inscripcion[];
  /** Desde «Mi actividad» / Participantes: sin categoría no se puede guardar un alta. */
  inscripcionObligatoria?: boolean;
  participante: null | Participante;
  /** Participantes activos: nombre repetido e instituciones ya usadas. */
  participantes: Participante[];
}>();

const emit = defineEmits<{
  guardar: [
    form: ParticipanteForm,
    inscripcion: InscripcionNueva | null,
    continuar: boolean,
    /** Docente guía e integrantes si cambiaron; `null` si no. */
    equipo: EquipoForm | null,
    /** Edición: jornada y stand de su inscripción en la actividad de trabajo, si cambiaron. */
    feria?: DatosFeriaEditados | null,
  ];
}>();

const visible = defineModel<boolean>('open', { required: true });

const esEdicion = computed(() => props.participante !== null);

const formRef = ref<FormInstance>();
const nombreRef = ref<{ focus: () => void }>();

const cargandoOpciones = ref(false);
const tipos = ref<TipoParticipante[]>([]);
const categoriasParticipante = ref<CategoriaParticipante[]>([]);
const categoriasActividad = ref<CategoriaActividad[]>([]);
const inscripcionesTodas = ref<Inscripcion[]>([]);
const trabajo = useActividadTrabajoStore();
const nombreActividad = computed(() => limpiarEspacios(trabajo.actividad?.nombre));

/**
 * `form` plano a propósito: Ant Design no parte el `name` por los puntos, así que
 * `name="participante.nombre"` haría que la regla leyera siempre `undefined`.
 * (`idCategoriaParticiapnte` arrastra la errata del backend.)
 */
const form = reactive<ParticipanteForm>({ idCarrera: null, institucion: '', nombre: '' });

/** Inscripción del alta, siempre en la actividad de trabajo. */
const inscripcion = reactive<{ idActividad?: number; idCategoriaActividad?: number }>({});
const errorInscripcion = ref('');

const original = ref('');
const registradas = ref(0);

const LIMITE_NOMBRE = 255;
const LIMITE_INSTITUCION = 120;

function normalizado(): ParticipanteForm {
  return {
    idCarrera: form.idCarrera ?? null,
    idCategoriaParticiapnte: form.idCategoriaParticiapnte,
    idParticipante: form.idParticipante,
    idTipoParticipante: form.idTipoParticipante,
    institucion: limpiarEspacios(form.institucion).toUpperCase(),
    nombre: limpiarEspacios(form.nombre),
  };
}

function instantanea() {
  return JSON.stringify([normalizado(), inscripcion.idActividad, inscripcion.idCategoriaActividad, feriaNormalizada()]);
}

// ---------------------------------------------------------------- jornada y stand (feria de varios días)

/** Jornada y stand de la inscripción: en el alta, la nueva; en la edición, la de la actividad de trabajo. */
const feria = reactive<{ jornada: null | number; stand: string }>({ jornada: null, stand: '' });
const LIMITE_STAND = 30;

const jornadasActividad = computed(() => trabajo.actividad?.jornadas ?? 1);
const opcionesJornadaActividad = computed(() => opcionesJornada(trabajo.actividad));

/** Edición: su inscripción en la actividad de trabajo (jornada y stand se editan aquí). */
const inscripcionDeTrabajo = computed(() =>
  props.participante ? props.inscripciones.find((i) => i.idActividad === trabajo.idActividad) : undefined,
);

function feriaNormalizada() {
  return {
    jornada: feria.jornada ?? null,
    stand: limpiarEspacios(feria.stand).toUpperCase() || null,
  };
}

const feriaOriginal = ref('');

const hayCambios = computed(() => instantanea() !== original.value || equipoCambio.value);

// ---------------------------------------------------------------- equipo (docente guía e integrantes)

const personas = ref<Persona[]>([]);
const cargandoPersonas = ref(false);
const equipoAbierto = ref(false);
const docenteGuia = ref<number | undefined>();
const integrantes = ref<PersonaEquipo[]>([]);
const aAgregar = ref<number | undefined>();
const equipoOriginal = ref('');

function firmaEquipo() {
  return JSON.stringify([docenteGuia.value ?? null, integrantes.value.map((i) => i.idPersona).sort((a, b) => a - b)]);
}

const equipoCambio = computed(() => firmaEquipo() !== equipoOriginal.value);

/** Al elegir una persona en «Agregar integrante» pasa a la lista. */
watch(aAgregar, (id) => {
  if (id === undefined) return;
  const p = personas.value.find((x) => x.idPersona === id);
  if (p && !integrantes.value.some((i) => i.idPersona === id) && id !== docenteGuia.value) {
    integrantes.value = [...integrantes.value, { ci: p.ci, idPersona: p.idPersona, nombre: p.nombreCompleto }];
  }
  nextTick(() => (aAgregar.value = undefined));
});

function quitarIntegrante(id: number) {
  integrantes.value = integrantes.value.filter((i) => i.idPersona !== id);
}

function etiquetasIntegrante(p: Persona): EtiquetaPersona[] {
  if (integrantes.value.some((i) => i.idPersona === p.idPersona)) return [{ texto: 'Ya está', tipo: 'bloqueo' }];
  if (p.idPersona === docenteGuia.value) return [{ texto: 'Docente guía', tipo: 'bloqueo' }];
  return [];
}

function etiquetasDocente(p: Persona): EtiquetaPersona[] {
  return integrantes.value.some((i) => i.idPersona === p.idPersona) ? [{ texto: 'Es integrante', tipo: 'bloqueo' }] : [];
}

async function cargarEquipo(p: null | Partial<Participante>) {
  docenteGuia.value = p?.idDocenteGuia ?? undefined;
  integrantes.value = [];
  equipoOriginal.value = firmaEquipo();
  equipoAbierto.value = false;
  cargandoPersonas.value = true;
  try {
    const [lista, equipo] = await Promise.all([
      listarPersonas().catch(() => [] as Persona[]),
      p?.idParticipante ? obtenerEquipoParticipante(p.idParticipante).catch(() => null) : Promise.resolve(null),
    ]);
    personas.value = lista ?? [];
    if (equipo) {
      docenteGuia.value = equipo.docenteGuia?.idPersona ?? undefined;
      integrantes.value = equipo.integrantes;
      equipoOriginal.value = firmaEquipo();
      equipoAbierto.value = !!equipo.docenteGuia || equipo.integrantes.length > 0;
    }
  } finally {
    cargandoPersonas.value = false;
  }
}

// ---------------------------------------------------------------- nombre

/** Sin saltos de línea: los nombres pegados desde otro documento los traían. */
function alEscribirNombre(evento: Event) {
  const area = evento.target as HTMLTextAreaElement;
  const limpio = area.value.replaceAll(/[\r\n]+/g, ' ');
  form.nombre = limpio;
  if (area.value !== limpio) {
    area.value = limpio;
  }
}

// ---------------------------------------------------------------- lo que ya hay en la actividad

/** Participantes inscritos en la actividad de trabajo (para proponer institución y clasificación). */
const deLaActividad = computed(() => {
  const ids = new Set(
    inscripcionesTodas.value.filter((i) => i.idActividad === trabajo.idActividad).map((i) => i.idParticipante),
  );
  return props.participantes.filter(
    (p) => ids.has(p.idParticipante) && p.idParticipante !== props.participante?.idParticipante,
  );
});

/** El valor más repetido (o `undefined` si no hay ninguno). */
function masUsado<T>(valores: (null | T | undefined)[]): T | undefined {
  const conteo = new Map<T, number>();
  for (const v of valores) if (v !== null && v !== undefined) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  return [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

// ---------------------------------------------------------------- institución

const mayus = (t: null | string | undefined) => limpiarEspacios(t).toUpperCase();

/** Instituciones de esta actividad, las más usadas primero. */
const institucionesActividad = computed(() => {
  const conteo = new Map<string, number>();
  for (const p of deLaActividad.value) {
    const i = mayus(p.institucion);
    if (i) conteo.set(i, (conteo.get(i) ?? 0) + 1);
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([i]) => i);
});

/** Todas las instituciones registradas (de cualquier actividad). */
const institucionesTodas = computed(() =>
  [...new Set(props.participantes.map((p) => mayus(p.institucion)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  ),
);

const institucionEscrita = computed(() => mayus(form.institucion));
const institucionExiste = computed(() => institucionesTodas.value.includes(institucionEscrita.value));

/** Opciones del buscador: coincidencias de esta actividad, luego las demás, y «nueva» si no existe. */
const opcionesInstitucion = computed(() => {
  const texto = normalizarTexto(institucionEscrita.value);
  const coincide = (i: string) => !texto || normalizarTexto(i).includes(texto);
  const enEsta = institucionesActividad.value.filter(coincide);
  const otras = institucionesTodas.value.filter((i) => !enEsta.includes(i) && coincide(i)).slice(0, 30);
  const grupos: { label: string; options: { label: string; value: string }[] }[] = [];
  if (enEsta.length > 0) grupos.push({ label: 'En esta actividad', options: enEsta.map((i) => ({ label: i, value: i })) });
  if (otras.length > 0) grupos.push({ label: 'Otras ya registradas', options: otras.map((i) => ({ label: i, value: i })) });
  // «Registrar» va al final: si hay coincidencias, lo normal es elegir una.
  if (institucionEscrita.value && !institucionExiste.value) {
    grupos.push({
      label: 'Nueva',
      options: [{ label: `＋ Registrar «${institucionEscrita.value}» como nueva`, value: institucionEscrita.value }],
    });
  }
  return grupos;
});

/** El `AutoComplete` borra el texto con Escape; aquí Escape solo cierra la lista. */
let conEscape = false;

function alPulsarTeclaInstitucion(evento: KeyboardEvent) {
  conEscape = evento.key === 'Escape';
}

function alEscribirInstitucion(valor: unknown) {
  const texto = String(valor ?? '');
  if (conEscape && !texto) {
    conEscape = false;
    return;
  }
  conEscape = false;
  form.institucion = texto.slice(0, LIMITE_INSTITUCION);
}

function elegirInstitucion(valor: string) {
  form.institucion = valor;
  formRef.value?.validateFields(['institucion']).catch(() => {});
}

// ---------------------------------------------------------------- carrera (actividades con estructura académica)

/**
 * Carreras de la actividad de trabajo (paso «Carreras»). Si tiene, el proyecto se
 * afilia a una y la institución deja de escribirse: el backend la rellena con el
 * nombre de la carrera. Sin carreras, todo queda como antes (institución en texto).
 */
const carreras = ref<Carrera[]>([]);
const filtroFacultadCarrera = ref<number>();

/**
 * Se usa el selector si la actividad tiene carreras, salvo al editar un proyecto
 * afiliado a una carrera de otra actividad (se conserva tal cual).
 */
const usaCarreras = computed(
  () =>
    carreras.value.length > 0 &&
    (!props.participante?.idCarrera || carreras.value.some((c) => c.idCarrera === props.participante?.idCarrera)),
);

const carreraElegida = computed(() => carreras.value.find((c) => c.idCarrera === form.idCarrera));

/** Facultades presentes en las carreras, para filtrar con un clic. */
const facultadesCarrera = computed(() => {
  const mapa = new Map<number, { nombre: string; sigla: string; total: number }>();
  for (const c of carreras.value) {
    if (c.idFacultad === null) continue;
    const actual = mapa.get(c.idFacultad) ?? { nombre: nombrePropio(c.facultad), sigla: c.siglaFacultad ?? '', total: 0 };
    actual.total += 1;
    mapa.set(c.idFacultad, actual);
  }
  return [...mapa.entries()].map(([id, d]) => ({ id, ...d })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});

const opcionesCarrera = computed(() =>
  carreras.value
    .filter((c) => filtroFacultadCarrera.value === undefined || c.idFacultad === filtroFacultadCarrera.value)
    .map((c) => ({
      busqueda: `${c.nombre} ${c.facultad ?? ''} ${c.siglaFacultad ?? ''}`,
      facultad: nombrePropio(c.facultad),
      label: nombrePropio(c.nombre),
      sigla: c.siglaFacultad ?? '',
      value: c.idCarrera,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es')),
);

function filtrarCarrera(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

function alternarFacultadCarrera(id: number) {
  filtroFacultadCarrera.value = filtroFacultadCarrera.value === id ? undefined : id;
}

/** La institución sigue a la carrera: así las categorías «CARRERA - NIVEL» se sugieren igual. */
function elegirCarrera(id: unknown) {
  form.idCarrera = typeof id === 'number' ? id : null;
  form.institucion = carreraElegida.value?.nombre ?? '';
  formRef.value?.validateFields(['idCarrera']).catch(() => {});
}

// ---------------------------------------------------------------- clasificación

const tipoSugerido = computed(() => masUsado(deLaActividad.value.map((p) => p.idTipoParticipante)));
const categoriaSugerida = computed(() => masUsado(deLaActividad.value.map((p) => p.idCategoriaParticiapnte)));

const nombreTipo = computed(() =>
  nombrePropio(tipos.value.find((t) => t.idTipoParticipante === form.idTipoParticipante)?.nombre),
);
const nombreCategoriaParticipante = computed(() =>
  nombrePropio(
    categoriasParticipante.value.find((c) => c.idCategoriaParticiapnte === form.idCategoriaParticiapnte)?.nombre,
  ),
);

/** Si la clasificación vino de la actividad, se muestra resumida; «Cambiar» la abre. */
const clasificacionAbierta = ref(true);
const comoLosDemas = computed(
  () =>
    !!form.idTipoParticipante &&
    !!form.idCategoriaParticiapnte &&
    form.idTipoParticipante === tipoSugerido.value &&
    form.idCategoriaParticiapnte === categoriaSugerida.value,
);

/** Crear un tipo o una categoría de participante sin salir del formulario. */
const nuevoTipo = ref<null | string>(null);
const nuevaCategoria = ref<null | string>(null);
const creando = ref(false);

async function crearTipo() {
  const nombre = mayus(nuevoTipo.value);
  if (!nombre) return;
  const existente = tipos.value.find((t) => normalizarTexto(t.nombre) === normalizarTexto(nombre));
  if (existente) {
    form.idTipoParticipante = existente.idTipoParticipante;
    nuevoTipo.value = null;
    return;
  }
  creando.value = true;
  try {
    const t = await crearTipoParticipante({ descripcion: '', nombre });
    tipos.value = [...tipos.value, t];
    form.idTipoParticipante = t.idTipoParticipante;
    nuevoTipo.value = null;
    avisar({ mensaje: `«${nombrePropio(nombre)}» ya está en el catálogo.`, tipo: 'exito', titulo: 'Tipo creado' });
  } catch {
    // El interceptor ya avisó.
  } finally {
    creando.value = false;
  }
}

async function crearCategoria() {
  const nombre = mayus(nuevaCategoria.value);
  if (!nombre) return;
  const existente = categoriasParticipante.value.find((c) => normalizarTexto(c.nombre) === normalizarTexto(nombre));
  if (existente) {
    form.idCategoriaParticiapnte = existente.idCategoriaParticiapnte;
    nuevaCategoria.value = null;
    return;
  }
  creando.value = true;
  try {
    const c = await crearCategoriaParticipante({ descripcion: '', nombre });
    categoriasParticipante.value = [...categoriasParticipante.value, c];
    form.idCategoriaParticiapnte = c.idCategoriaParticiapnte;
    nuevaCategoria.value = null;
    avisar({ mensaje: `«${nombrePropio(nombre)}» ya está en el catálogo.`, tipo: 'exito', titulo: 'Categoría creada' });
  } catch {
    // El interceptor ya avisó.
  } finally {
    creando.value = false;
  }
}

// ---------------------------------------------------------------- dónde compite

const categoriasDeActividad = computed(() => {
  const institucion = normalizarTexto(institucionEscrita.value);
  return categoriasActividad.value
    .filter((c) => c.idActividad === trabajo.idActividad)
    .map((c) => ({
      etiqueta: nombrePropio(c.nombre),
      inscritos: inscripcionesTodas.value.filter((i) => i.idCategoriaActividad === c.idCategoriaActividad).length,
      // En EXPOINNOVA las categorías se llaman «CARRERA - NIVEL»: las de su carrera, primero.
      sugerida: !!institucion && normalizarTexto(c.nombre).startsWith(institucion),
      valor: c.idCategoriaActividad,
    }))
    .sort((a, b) => Number(b.sugerida) - Number(a.sugerida) || a.etiqueta.localeCompare(b.etiqueta, 'es'));
});

const haySugeridas = computed(() => categoriasDeActividad.value.some((c) => c.sugerida));

function elegirCategoria(id: number) {
  inscripcion.idCategoriaActividad = inscripcion.idCategoriaActividad === id ? undefined : id;
  errorInscripcion.value = '';
}

const categoriaElegida = computed(() =>
  categoriasDeActividad.value.find((c) => c.valor === inscripcion.idCategoriaActividad),
);

// ---------------------------------------------------------------- reglas

const obligatorio = (mensaje: string): Rule => ({
  message: mensaje,
  required: true,
  trigger: 'change',
});

const rules: Record<string, Rule[]> = {
  idCategoriaParticiapnte: [obligatorio('Elija la categoría de participante.')],
  idCarrera: [obligatorio('Elija la carrera del proyecto.')],
  idTipoParticipante: [obligatorio('Elija el tipo de participante.')],
  institucion: [
    {
      trigger: ['blur', 'change'],
      validator: async (_rule, valor: string) => {
        if (!limpiarEspacios(valor)) {
          throw new Error('Indique la institución (colegio, carrera, unidad educativa…).');
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
          throw new Error('El nombre del participante es obligatorio.');
        }
        if (nombre.length < 5) {
          throw new Error('Debe tener al menos 5 caracteres.');
        }
        const repetido = props.participantes.find(
          (p) =>
            p.idParticipante !== props.participante?.idParticipante &&
            normalizarTexto(limpiarEspacios(p.nombre)) === normalizarTexto(nombre),
        );
        if (repetido) {
          throw new Error('Ya existe un participante con ese nombre.');
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- ciclo del modal

/**
 * Completa lo que se puede deducir: la clasificación de los demás inscritos de la
 * actividad (o la única opción del catálogo) y, si la actividad tiene una sola
 * categoría, esa.
 */
function autoElegir() {
  if (!esEdicion.value) {
    form.idTipoParticipante ??=
      tipoSugerido.value ?? (tipos.value.length === 1 ? tipos.value[0]!.idTipoParticipante : undefined);
    form.idCategoriaParticiapnte ??=
      categoriaSugerida.value ??
      (categoriasParticipante.value.length === 1 ? categoriasParticipante.value[0]!.idCategoriaParticiapnte : undefined);
    inscripcion.idActividad = trabajo.idActividad;
    if (!inscripcion.idCategoriaActividad && categoriasDeActividad.value.length === 1) {
      inscripcion.idCategoriaActividad = categoriasDeActividad.value[0]!.valor;
    }
  }
  clasificacionAbierta.value = esEdicion.value || !comoLosDemas.value;
}

async function cargarOpciones() {
  cargandoOpciones.value = true;
  try {
    const [t, c, ca, ins, car] = await Promise.all([
      listarTiposParticipante(),
      listarCategoriasParticipante(),
      listarCategoriasActividad(),
      listarInscripciones().catch(() => [] as Inscripcion[]),
      trabajo.idActividad === undefined
        ? Promise.resolve([] as Carrera[])
        : listarCarreras(trabajo.idActividad).catch(() => [] as Carrera[]),
    ]);
    carreras.value = car ?? [];
    tipos.value = t ?? [];
    categoriasParticipante.value = c ?? [];
    categoriasActividad.value = ca ?? [];
    inscripcionesTodas.value = ins ?? [];
    const sinCambios = !hayCambios.value;
    autoElegir();
    if (sinCambios) {
      original.value = instantanea();
    }
  } finally {
    cargandoOpciones.value = false;
  }
}

function cargar(p: null | Partial<Participante>, conservar = false) {
  form.idParticipante = p?.idParticipante;
  form.nombre = p?.nombre ?? '';
  // Tras «Guardar y nuevo» se conserva la jornada (se cargan seguidos los de un día); el stand es de cada uno.
  feria.stand = p ? (inscripcionDeTrabajo.value?.stand ?? '') : '';
  if (!conservar) {
    feria.jornada = p ? (inscripcionDeTrabajo.value?.jornada ?? null) : null;
    form.idCarrera = p?.idCarrera ?? null;
    form.institucion = p?.institucion ?? '';
    form.idTipoParticipante = p?.idTipoParticipante ?? undefined;
    form.idCategoriaParticiapnte = p?.idCategoriaParticiapnte ?? undefined;
    inscripcion.idActividad = undefined;
    inscripcion.idCategoriaActividad = undefined;
  }
  nuevoTipo.value = null;
  nuevaCategoria.value = null;
  errorInscripcion.value = '';
  autoElegir();
  original.value = instantanea();
  feriaOriginal.value = JSON.stringify(feriaNormalizada());
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
  cargar(props.participante);
  cargarOpciones();
  cargarEquipo(props.participante);
  enfocarNombre();
});

/**
 * Tras «Guardar y nuevo» se conservan institución, clasificación y categoría: lo
 * habitual es cargar seguidos los participantes de una misma categoría.
 */
function reiniciar() {
  registradas.value += 1;
  cargar(null, true);
  // El equipo es de cada participante: no se conserva.
  docenteGuia.value = undefined;
  integrantes.value = [];
  equipoOriginal.value = firmaEquipo();
  enfocarNombre();
}

defineExpose({ reiniciar });

async function guardar(continuar: boolean) {
  let valido = true;
  try {
    await formRef.value?.validate();
  } catch {
    valido = false;
  }
  if (
    !esEdicion.value &&
    props.inscripcionObligatoria &&
    categoriasDeActividad.value.length > 0 &&
    !inscripcion.idCategoriaActividad
  ) {
    errorInscripcion.value = 'Elija en qué categoría compite.';
    valido = false;
  }
  if (!valido) return;
  const datosFeria = feriaNormalizada();
  const inscribir =
    !esEdicion.value && inscripcion.idActividad && inscripcion.idCategoriaActividad
      ? {
          idActividad: inscripcion.idActividad,
          idCategoriaActividad: inscripcion.idCategoriaActividad,
          jornada: datosFeria.jornada,
          stand: datosFeria.stand,
        }
      : null;
  const feriaEditada =
    esEdicion.value && inscripcionDeTrabajo.value && JSON.stringify(datosFeria) !== feriaOriginal.value
      ? { idInscripcion: inscripcionDeTrabajo.value.idInscripcion, ...datosFeria }
      : null;
  const equipo = equipoCambio.value
    ? { idDocenteGuia: docenteGuia.value ?? null, integrantes: integrantes.value.map((i) => i.idPersona) }
    : null;
  emit('guardar', normalizado(), inscribir, continuar, equipo, feriaEditada);
}
</script>

<template>
  <SemfaModalForm
    v-model:open="visible"
    :es-edicion="esEdicion"
    :guardando="guardando"
    :hay-cambios="hayCambios"
    :icono="esEdicion ? 'lucide:user-pen' : 'lucide:user-plus'"
    :registradas="registradas"
    :subtitulo="
      esEdicion
        ? 'Actualice los datos del participante.'
        : nombreActividad
          ? `Se registra e inscribe en «${nombreActividad}».`
          : 'Regístrelo; para inscribirlo elija una actividad en la barra superior.'
    "
    :texto-contador="['participante registrado', 'participantes registrados']"
    :titulo="esEdicion ? 'Modificar participante' : 'Nuevo participante'"
    :width="820"
    @guardar="guardar"
  >
    <!-- Vista previa -->
    <template #vista-previa>
      <div class="flex items-center gap-4">
        <span class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconifyIcon class="size-6" icon="lucide:users" />
        </span>
        <div class="min-w-0">
          <div
            :class="{ 'text-muted-foreground': !limpiarEspacios(form.nombre) }"
            class="line-clamp-2 text-base font-medium leading-snug"
          >
            {{ limpiarEspacios(form.nombre) || 'Nombre del participante' }}
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span v-if="carreraElegida?.siglaFacultad" class="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {{ carreraElegida.siglaFacultad }}
            </span>
            <span v-if="institucionEscrita" class="rounded-full bg-muted px-2 py-0.5">
              {{ nombrePropio(institucionEscrita) }}
            </span>
            <span v-if="nombreTipo" class="rounded-full bg-muted px-2 py-0.5">{{ nombreTipo }}</span>
            <template v-if="!esEdicion">
              <span v-if="categoriaElegida" class="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                Compite en {{ categoriaElegida.etiqueta }}
              </span>
              <span v-else class="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600">Sin categoría</span>
            </template>
          </div>
        </div>
      </div>
    </template>

    <Form ref="formRef" :disabled="guardando" :model="form" :rules="rules" layout="vertical">
      <!-- 1 · Quién es -->
      <div class="semfa-paso-form">
        <span class="semfa-paso-form__num">1</span>
        Participante
      </div>
      <FormItem
        extra="Tal como aparecerá en la app del jurado, rankings y reportes."
        label="Nombre"
        name="nombre"
        required
      >
        <Input.TextArea
          ref="nombreRef"
          :auto-size="{ minRows: 1, maxRows: 3 }"
          :maxlength="LIMITE_NOMBRE"
          :value="form.nombre"
          placeholder="Ej. BALLET FOLKLÓRICO SEMILLITAS · BANDA DE GUERRA 24 DE SEPTIEMBRE · título del proyecto"
          show-count
          size="large"
          @input="alEscribirNombre"
          @keydown.enter.prevent
        />
      </FormItem>

      <FormItem
        v-if="usaCarreras"
        extra="Su institución será el nombre de la carrera; cuenta para los rankings por carrera y facultad."
        label="Carrera"
        name="idCarrera"
        required
      >
        <div v-if="facultadesCarrera.length > 1" class="mb-2 flex flex-wrap gap-1.5">
          <button
            v-for="f in facultadesCarrera"
            :key="f.id"
            :class="{ 'is-activo': filtroFacultadCarrera === f.id }"
            :disabled="guardando"
            :title="f.nombre"
            class="semfa-chip"
            type="button"
            @click="alternarFacultadCarrera(f.id)"
          >
            <IconifyIcon class="size-3.5" icon="lucide:landmark" />
            {{ f.sigla || f.nombre }}
            <span class="semfa-chip__total">{{ f.total }}</span>
          </button>
        </div>
        <Select
          :filter-option="filtrarCarrera"
          :options="opcionesCarrera"
          :value="form.idCarrera ?? undefined"
          placeholder="Buscar carrera por nombre o facultad…"
          show-search
          size="large"
          @change="elegirCarrera"
        >
          <template #option="{ label, facultad, sigla }">
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate">{{ label }}</span>
              <span
                v-if="sigla || facultad"
                :title="facultad"
                class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {{ sigla || facultad }}
              </span>
            </div>
          </template>
        </Select>
      </FormItem>

      <FormItem v-else label="Institución" name="institucion" required>
        <AutoComplete
          :filter-option="false"
          :options="opcionesInstitucion"
          :value="form.institucion"
          placeholder="Escriba para buscar: colegio, unidad educativa, carrera…"
          size="large"
          @change="alEscribirInstitucion"
          @keydown.capture="alPulsarTeclaInstitucion"
          @select="(v: unknown) => elegirInstitucion(String(v))"
        />
        <template #extra>
          <div class="mt-1 text-xs">
            <span v-if="institucionEscrita && !institucionExiste" class="text-primary">
              <IconifyIcon class="inline size-3.5" icon="lucide:sparkles" />
              Nueva: se registrará como «{{ institucionEscrita }}».
            </span>
            <span v-else>Escriba para buscar entre las registradas; si no existe, se crea tal como la escriba.</span>
          </div>
          <div v-if="institucionesActividad.length > 0" class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-muted-foreground">En esta actividad:</span>
            <button
              v-for="i in institucionesActividad.slice(0, 8)"
              :key="i"
              :class="{ 'is-activo': institucionEscrita === i }"
              :disabled="guardando"
              class="semfa-chip"
              type="button"
              @click="elegirInstitucion(i)"
            >
              {{ nombrePropio(i) }}
            </button>
          </div>
        </template>
      </FormItem>

      <!-- 2 · Clasificación -->
      <div class="semfa-paso-form">
        <span class="semfa-paso-form__num">2</span>
        Clasificación
        <span class="text-xs font-normal text-muted-foreground">(para filtros y reportes)</span>
      </div>

      <div
        v-if="!clasificacionAbierta"
        class="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
      >
        <IconifyIcon class="size-4 text-green-600" icon="lucide:circle-check" />
        <b>{{ nombreTipo }}</b> · <b>{{ nombreCategoriaParticipante }}</b>
        <span class="text-muted-foreground">— igual que los demás de esta actividad</span>
        <Button class="ml-auto" size="small" type="link" @click="clasificacionAbierta = true">Cambiar</Button>
      </div>

      <div v-else class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <FormItem
          extra="Qué es: banda, conjunto de danza, proyecto…"
          label="Tipo de participante"
          name="idTipoParticipante"
          required
        >
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="t in tipos"
              :key="t.idTipoParticipante"
              :class="{ 'is-activo': form.idTipoParticipante === t.idTipoParticipante }"
              :disabled="guardando"
              :title="t.descripcion ?? ''"
              class="semfa-chip"
              type="button"
              @click="form.idTipoParticipante = t.idTipoParticipante"
            >
              {{ nombrePropio(t.nombre) }}
            </button>
            <button
              v-if="nuevoTipo === null"
              :disabled="guardando"
              class="semfa-chip border-dashed text-primary"
              type="button"
              @click="nuevoTipo = ''"
            >
              <IconifyIcon class="size-3.5" icon="lucide:plus" />
              Nuevo
            </button>
          </div>
          <div v-if="nuevoTipo !== null" class="mt-2 flex gap-2">
            <Input
              v-model:value="nuevoTipo"
              :maxlength="60"
              placeholder="Ej. CONJUNTO DE DANZA"
              @keydown.enter.stop.prevent="crearTipo"
            />
            <Button :loading="creando" class="semfa-btn semfa-btn--primario" @click="crearTipo">Crear</Button>
            <Button class="semfa-btn semfa-btn--neutro" @click="nuevoTipo = null">✕</Button>
          </div>
        </FormItem>

        <FormItem
          extra="Cómo se agrupa: unidad educativa, universidad, barrio…"
          label="Categoría de participante"
          name="idCategoriaParticiapnte"
          required
        >
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in categoriasParticipante"
              :key="c.idCategoriaParticiapnte"
              :class="{ 'is-activo': form.idCategoriaParticiapnte === c.idCategoriaParticiapnte }"
              :disabled="guardando"
              :title="c.descripcion ?? ''"
              class="semfa-chip"
              type="button"
              @click="form.idCategoriaParticiapnte = c.idCategoriaParticiapnte"
            >
              {{ nombrePropio(c.nombre) }}
            </button>
            <button
              v-if="nuevaCategoria === null"
              :disabled="guardando"
              class="semfa-chip border-dashed text-primary"
              type="button"
              @click="nuevaCategoria = ''"
            >
              <IconifyIcon class="size-3.5" icon="lucide:plus" />
              Nueva
            </button>
          </div>
          <div v-if="nuevaCategoria !== null" class="mt-2 flex gap-2">
            <Input
              v-model:value="nuevaCategoria"
              :maxlength="60"
              placeholder="Ej. UNIDAD EDUCATIVA"
              @keydown.enter.stop.prevent="crearCategoria"
            />
            <Button :loading="creando" class="semfa-btn semfa-btn--primario" @click="crearCategoria">Crear</Button>
            <Button class="semfa-btn semfa-btn--neutro" @click="nuevaCategoria = null">✕</Button>
          </div>
        </FormItem>
      </div>
    </Form>

    <!-- 3 · Dónde compite -->
    <div class="semfa-paso-form">
      <span class="semfa-paso-form__num">3</span>
      {{ esEdicion ? 'Inscripciones' : 'Dónde compite' }}
      <span v-if="!esEdicion && nombreActividad" class="truncate text-xs font-normal text-muted-foreground">
        · {{ nombreActividad }}
      </span>
    </div>

    <!-- Edición: solo se muestra; la categoría se cambia con «Trasladar» -->
    <template v-if="esEdicion">
      <div v-if="inscripciones.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="i in inscripciones"
          :key="i.idInscripcion"
          class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
        >
          {{ nombrePropio(i.nombreCategoriaActividad) }} · {{ limpiarEspacios(i.nombreActividad) }}
        </span>
      </div>
      <span v-else class="text-sm text-amber-600">No está inscrito en ninguna actividad.</span>
      <p class="mb-0 mt-2 text-xs text-muted-foreground">
        Para cambiar de categoría, use «Trasladar» en la lista de participantes.
      </p>
      <template v-if="inscripcionDeTrabajo">
      <div class="mt-3 grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <div v-if="jornadasActividad > 1">
          <div class="mb-1 text-sm">Jornada</div>
          <Select
            :value="feria.jornada ?? undefined"
            @update:value="(v: unknown) => (feria.jornada = typeof v === 'number' ? v : null)"
            :disabled="guardando"
            :options="opcionesJornadaActividad"
            allow-clear
            class="w-full"
            placeholder="Sin asignar"
            size="large"
          />
          <p class="mb-0 mt-1 text-xs text-muted-foreground">Día en que se presenta ({{ jornadasActividad }} jornadas).</p>
        </div>
        <div>
          <div class="mb-1 text-sm">Stand</div>
          <Input
            v-model:value="feria.stand"
            :disabled="guardando"
            :maxlength="LIMITE_STAND"
            autocomplete="off"
            placeholder="Ej. A-12"
            size="large"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:map-pin" />
            </template>
          </Input>
          <p class="mb-0 mt-1 text-xs text-muted-foreground">Opcional: dónde expone en la feria.</p>
        </div>
      </div>
      </template>
    </template>

    <template v-else-if="!trabajo.idActividad">
      <p class="m-0 text-sm text-amber-600">
        Elija una actividad en la barra superior para inscribirlo; si no, solo se registra.
      </p>
    </template>

    <template v-else>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in categoriasDeActividad"
          :key="c.valor"
          :class="{ 'is-activo': inscripcion.idCategoriaActividad === c.valor }"
          :disabled="guardando"
          :title="c.sugerida ? 'Coincide con la institución' : ''"
          class="semfa-chip"
          type="button"
          @click="elegirCategoria(c.valor)"
        >
          <IconifyIcon v-if="c.sugerida" class="size-3.5 text-amber-500" icon="lucide:star" />
          {{ c.etiqueta }}
          <span class="semfa-chip__total" title="Inscritos">{{ c.inscritos }}</span>
        </button>
        <span v-if="categoriasDeActividad.length === 0" class="text-sm text-amber-600">
          La actividad aún no tiene categorías: créelas en el paso «Categorías».
        </span>
      </div>
      <p v-if="errorInscripcion" class="mb-0 mt-1 text-sm text-red-600">{{ errorInscripcion }}</p>
      <p v-else class="mb-0 mt-2 text-xs text-muted-foreground">
        {{
          inscripcionObligatoria
            ? 'Elija la categoría en la que compite (el número es cuántos inscritos tiene).'
            : 'Opcional: sin categoría queda registrado, pero ningún jurado lo evalúa.'
        }}
        <template v-if="haySugeridas">
          <IconifyIcon class="inline size-3.5 text-amber-500" icon="lucide:star" /> = coincide con la institución.
        </template>
      </p>
      <div class="mt-3 grid grid-cols-1 gap-x-5 md:grid-cols-2">
        <div v-if="jornadasActividad > 1">
          <div class="mb-1 text-sm">Jornada</div>
          <Select
            :value="feria.jornada ?? undefined"
            @update:value="(v: unknown) => (feria.jornada = typeof v === 'number' ? v : null)"
            :disabled="guardando"
            :options="opcionesJornadaActividad"
            allow-clear
            class="w-full"
            placeholder="Sin asignar"
            size="large"
          />
          <p class="mb-0 mt-1 text-xs text-muted-foreground">Día en que se presenta ({{ jornadasActividad }} jornadas).</p>
        </div>
        <div>
          <div class="mb-1 text-sm">Stand</div>
          <Input
            v-model:value="feria.stand"
            :disabled="guardando"
            :maxlength="LIMITE_STAND"
            autocomplete="off"
            placeholder="Ej. A-12"
            size="large"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:map-pin" />
            </template>
          </Input>
          <p class="mb-0 mt-1 text-xs text-muted-foreground">Opcional: dónde expone en la feria.</p>
        </div>
      </div>
    </template>
    <!-- 4 · Equipo (opcional): docente guía e integrantes -->
    <button class="semfa-paso-form w-full text-left" type="button" @click="equipoAbierto = !equipoAbierto">
      <span class="semfa-paso-form__num">4</span>
      Equipo
      <span class="text-xs font-normal text-muted-foreground">
        (opcional · docente guía e integrantes{{ integrantes.length || docenteGuia ? ` · ${integrantes.length} integrante(s)` : '' }})
      </span>
      <IconifyIcon :icon="equipoAbierto ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="ml-auto size-4 text-muted-foreground" />
    </button>
    <div v-if="equipoAbierto" class="flex flex-col gap-3">
      <div>
        <div class="mb-1 text-sm">Docente guía o asesor</div>
        <SemfaSelectorPersona
          v-model:personas="personas"
          v-model:value="docenteGuia"
          :cargando="cargandoPersonas"
          :disabled="guardando"
          :etiquetas="etiquetasDocente"
        />
        <p class="mb-0 mt-1 text-xs text-muted-foreground">Búsquelo por nombre o CI; si no existe, «Nueva».</p>
      </div>
      <div>
        <div class="mb-1 text-sm">Integrantes</div>
        <SemfaSelectorPersona
          v-model:personas="personas"
          v-model:value="aAgregar"
          :cargando="cargandoPersonas"
          :disabled="guardando"
          :etiquetas="etiquetasIntegrante"
        />
        <div v-if="integrantes.length > 0" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="i in integrantes"
            :key="i.idPersona"
            class="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-primary"
          >
            {{ i.nombre }}
            <button class="rounded-full px-1 hover:bg-primary/20" title="Quitar" type="button" @click="quitarIntegrante(i.idPersona)">✕</button>
          </span>
        </div>
        <p v-else class="mb-0 mt-1 text-xs text-muted-foreground">Elija cada estudiante: se agrega a la lista.</p>
      </div>
    </div>
  </SemfaModalForm>
</template>

<style scoped>
.semfa-paso-form {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 18px 0 10px;
  font-weight: 600;
}

.semfa-paso-form:first-child {
  margin-top: 4px;
}

.semfa-paso-form__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 12%);
  border-radius: 9999px;
}
</style>
