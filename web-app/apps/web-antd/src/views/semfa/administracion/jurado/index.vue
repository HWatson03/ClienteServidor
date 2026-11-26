<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { CategoriaActividad } from '#/api/categorias-actividad';
import type { Inscripcion } from '#/api/inscripciones';
import type { JuradoAsignacion } from '#/api/jurado-asignaciones';
import type { Jurado, JuradoForm } from '#/api/jurados';
import type { Usuario } from '#/api/usuarios';
import type { Credenciales } from '#/utils/credenciales';

import { computed, onMounted, ref, shallowRef } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Modal, Table, Tooltip } from 'ant-design-vue';

import { listarCategoriasActividad } from '#/api/categorias-actividad';
import { listarInscripciones } from '#/api/inscripciones';
import {
  asignacionCubre,
  asignarPorFacultad,
  crearJuradoAsignacion,
  eliminarJuradoAsignacion,
  listarJuradoAsignaciones,
  quitarPorFacultad,
} from '#/api/jurado-asignaciones';
import {
  actualizarJurado,
  crearJurado,
  eliminarJurado,
  listarJurados,
} from '#/api/jurados';
import { listarUsuarios } from '#/api/usuarios';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import SemfaBarraCrud from '#/components/semfa/semfa-barra-crud.vue';
import SemfaCredenciales from '#/components/semfa/semfa-credenciales.vue';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, confirmar, sinAvisosDeError } from '#/composables/useAvisos';
import { useCrud } from '#/composables/useCrud';
import { useTablaLocal } from '#/composables/useTablaLocal';
import { inicialesDeNombre, nombrePropio } from '#/utils/formato';

import CoberturaModal from './cobertura-modal.vue';
import JuradoFormModal from './form-modal.vue';
import ProyectosModal from './proyectos-modal.vue';

defineOptions({ name: 'SemfaJurado' });

const modalAbierto = ref(false);
const modalRef = ref<InstanceType<typeof JuradoFormModal>>();
const juradoSeleccionado = ref<Jurado | null>(null);

/** Cuentas de usuario: la columna «Usuario» y el aviso de cuenta existente. */
const usuarios = shallowRef<Usuario[]>([]);

/** Acceso del último alta, para entregarlo al jurado. */
const credenciales = ref<Credenciales | null>(null);
const credencialesAbiertas = ref(false);

const { deLaActividad, idActividad, nombreActividad } = useActividadTrabajo();

/** Categorías de la actividad de trabajo: los chips para asignar o quitar. */
const categoriasTodas = shallowRef<CategoriaActividad[]>([]);
const categorias = computed(() =>
  deLaActividad(categoriasTodas.value, (c) => c.idActividad)
    .map((c) => ({ id: c.idCategoriaActividad, nombre: nombrePropio(c.nombre) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
);

/** Asignaciones: qué jurados son de la actividad de trabajo y en qué categorías. */
const asignaciones = shallowRef<JuradoAsignacion[]>([]);

/** Inscripciones activas: para limitar una asignación a proyectos y ver la cobertura. */
const inscripcionesTodas = shallowRef<Inscripcion[]>([]);
const inscripciones = computed(() => deLaActividad(inscripcionesTodas.value, (i) => i.idActividad));

/** idCategoria → sus inscripciones activas. */
const proyectosPorCategoria = computed(() => {
  const mapa = new Map<number, Inscripcion[]>();
  for (const i of inscripciones.value) {
    mapa.set(i.idCategoriaActividad, [...(mapa.get(i.idCategoriaActividad) ?? []), i]);
  }
  return mapa;
});

/** Facultades con proyectos en la actividad (FEXCOIN): chips «por facultad». */
const facultades = computed(() => {
  const mapa = new Map<number, { id: number; nombre: string; proyectos: number; sigla: string }>();
  for (const i of inscripciones.value) {
    if (i.idFacultad == null) continue;
    const f = mapa.get(i.idFacultad);
    if (f) f.proyectos++;
    else
      mapa.set(i.idFacultad, {
        id: i.idFacultad,
        nombre: i.facultad ?? '',
        proyectos: 1,
        sigla: i.siglaFacultad || i.facultad || `#${i.idFacultad}`,
      });
  }
  return [...mapa.values()].sort((a, b) => a.sigla.localeCompare(b.sigla, 'es'));
});

/** Asignaciones a las categorías de la actividad de trabajo. */
const asignacionesActividad = computed(() => {
  const ids = new Set(categorias.value.map((c) => c.id));
  return asignaciones.value.filter((a) => a.idCategoriaActividad !== null && ids.has(a.idCategoriaActividad));
});

/** Proyectos que ninguna asignación incluye (el aviso del botón «Cobertura»). */
const sinJurado = computed(
  () =>
    inscripciones.value.filter(
      (i) =>
        !asignacionesActividad.value.some(
          (a) => a.idCategoriaActividad === i.idCategoriaActividad && asignacionCubre(a, i),
        ),
    ).length,
);

type FormJurado = JuradoForm & { categorias?: number[] };

/** Resultado de asignar al jurado recién creado, para avisarlo tras el guardado. */
let asignadas: null | { fallidas: number; hechas: number } = null;

const crud = useCrud<Jurado, FormJurado>({
  guardar: async ({ categorias = [], ...payload }) => {
    if (payload.idJurado !== undefined) {
      return actualizarJurado(payload.idJurado, payload);
    }
    // Se mira antes del alta: si ya tenía cuenta, el backend la reutiliza.
    const cuentaPrevia = usuarios.value.find(
      (u) => u.idPersona === payload.idPersona,
    );
    const creado = await crearJurado(payload);
    // Lo deja asignado a las categorías elegidas de la actividad de trabajo.
    asignadas = null;
    if (categorias.length > 0 && idActividad.value !== undefined) {
      const resultados = await sinAvisosDeError(() =>
        Promise.allSettled(
          categorias.map((idCategoriaActividad) =>
            crearJuradoAsignacion({ idActividad: idActividad.value, idCategoriaActividad, idJurado: creado.idJurado }),
          ),
        ),
      );
      const hechas = resultados.filter((r) => r.status === 'fulfilled').length;
      asignadas = { fallidas: resultados.length - hechas, hechas };
    }
    credenciales.value = {
      contrasena: cuentaPrevia ? null : (payload.contrasena ?? null),
      nombre: creado.nombreCompleto ?? '—',
      usuario: creado.usuario ?? cuentaPrevia?.usuario ?? '—',
    };
    return creado;
  },
  idKey: 'idJurado',
  listar: async () => {
    const [jurados, cuentas, asig, cats, insc] = await Promise.all([
      listarJurados(),
      // Sin cuentas la tabla sigue sirviendo: solo falta la columna «Usuario».
      listarUsuarios().catch(() => [] as Usuario[]),
      listarJuradoAsignaciones().catch(() => [] as JuradoAsignacion[]),
      listarCategoriasActividad().catch(() => [] as CategoriaActividad[]),
      listarInscripciones().catch(() => [] as Inscripcion[]),
    ]);
    inscripcionesTodas.value = insc ?? [];
    usuarios.value = cuentas ?? [];
    asignaciones.value = asig ?? [];
    categoriasTodas.value = cats ?? [];
    return jurados;
  },
  nombre: 'Jurado',
  remover: eliminarJurado,
});

/** Filas con el usuario de cada jurado, para mostrarlo y poder buscarlo. */
/**
 * Los jurados son globales y se ligan a una actividad por sus asignaciones: se
 * muestran los de la actividad de trabajo (con sus categorías) y los que aún no
 * tienen ninguna; «Otras actividades» muestra el resto.
 */
const verOtras = ref(false);

const todasLasFilas = computed(() => {
  const cuentas = new Map(usuarios.value.map((u) => [u.idPersona, u.usuario]));
  return crud.items.value.map((j) => {
    const suyas = asignaciones.value.filter((a) => a.idJurado === j.idJurado);
    const enEsta = suyas.filter((a) => a.idActividad === idActividad.value);
    return {
      ...j,
      /** idCategoria → idJuradoAsignacion en la actividad de trabajo. */
      asignadaEn: new Map(
        enEsta.filter((a) => a.idCategoriaActividad !== null).map((a) => [a.idCategoriaActividad!, a.idJuradoAsignacion]),
      ),
      /** idCategoria → la asignación, para limitarla a proyectos. */
      asignacionDe: new Map(
        enEsta.filter((a) => a.idCategoriaActividad !== null).map((a) => [a.idCategoriaActividad!, a]),
      ),
      /** Facultades que evalúa (asignación por facultad) en la actividad de trabajo. */
      facultadesAsignadas: new Set(enEsta.flatMap((a) => a.idsFacultad ?? [])),
      categorias: enEsta.map((a) => (a.categoriaActividad ? nombrePropio(a.categoriaActividad) : 'Toda la actividad')),
      todaLaActividad: enEsta.some((a) => a.idCategoriaActividad === null),
      deOtraActividad: enEsta.length === 0 && suyas.length > 0,
      usuario: j.idPersona === null ? null : (cuentas.get(j.idPersona) ?? null),
    };
  });
});

const filas = computed(() =>
  verOtras.value ? todasLasFilas.value : todasLasFilas.value.filter((f) => !f.deOtraActividad),
);

const deOtras = computed(() => todasLasFilas.value.filter((f) => f.deOtraActividad).length);

const { alCambiarTabla, busqueda, filtrados, numeroFila, paginacion } =
  useTablaLocal(filas, { camposBusqueda: ['ci', 'nombreCompleto', 'usuario'] });

function comparar(a: null | string | undefined, b: null | string | undefined) {
  return (a ?? '').localeCompare(b ?? '', 'es', { numeric: true });
}

/** Columnas de `tabla.html` (#, CI, Nombre Completo) más su usuario. */
type Fila = (typeof filas.value)[number];

const columnas: ColumnsType<Fila> = [
  { align: 'center', key: '#', title: '#', width: 64 },
  {
    dataIndex: 'ci',
    key: 'ci',
    sorter: (a, b) => comparar(a.ci, b.ci),
    title: 'CI',
    width: 140,
  },
  {
    dataIndex: 'nombreCompleto',
    key: 'nombreCompleto',
    sorter: (a, b) => comparar(a.nombreCompleto, b.nombreCompleto),
    title: 'Jurado',
  },
  {
    dataIndex: 'usuario',
    key: 'usuario',
    sorter: (a, b) => comparar(a.usuario, b.usuario),
    title: 'Usuario',
    width: 200,
  },
  { key: 'categorias', title: 'Evalúa en (clic para asignar o quitar)', width: 480 },
  { align: 'center', key: 'opciones', title: 'Opciones', width: 220 },
];

// ---------------------------------------------------------------- asignar con un clic

/** Asignación en curso (`idJurado-idCategoria`), para bloquear ese chip. */
const asignando = ref<null | string>(null);

async function recargarAsignaciones() {
  asignaciones.value = (await listarJuradoAsignaciones().catch(() => null)) ?? asignaciones.value;
}

/**
 * Asigna o quita al jurado de una categoría. Quitar solo da de baja la
 * asignación: lo que ya calificó se conserva, pero deja de ver la categoría.
 */
async function alternarCategoria(fila: Fila, categoria: { id: number; nombre: string }) {
  const idAsignacion = fila.asignadaEn.get(categoria.id);
  const nombre = fila.nombreCompleto ?? 'El jurado';
  if (idAsignacion !== undefined) {
    const ok = await confirmar({
      mensaje: `${nombre} dejará de ver «${categoria.nombre}» en su app. Lo que ya calificó se conserva.`,
      textoAceptar: 'Quitar',
      titulo: 'Quitar de la categoría',
    });
    if (!ok) return;
  }
  asignando.value = `${fila.idJurado}-${categoria.id}`;
  try {
    if (idAsignacion === undefined) {
      await crearJuradoAsignacion({ idActividad: idActividad.value, idCategoriaActividad: categoria.id, idJurado: fila.idJurado });
    } else {
      await eliminarJuradoAsignacion(idAsignacion);
    }
    avisar({
      mensaje: idAsignacion === undefined ? `Ya ve «${categoria.nombre}» en su app.` : `Ya no evalúa «${categoria.nombre}».`,
      tipo: 'exito',
      titulo: nombre,
    });
    await recargarAsignaciones();
  } catch {
    // El interceptor ya avisó.
  } finally {
    asignando.value = null;
  }
}

/**
 * Asigna o quita al jurado una facultad: evalúa sus proyectos en todas las
 * categorías que los tienen (los que se inscriban después entran solos).
 */
async function alternarFacultad(fila: Fila, facultad: { id: number; sigla: string }) {
  if (idActividad.value === undefined) return;
  const asignada = fila.facultadesAsignadas.has(facultad.id);
  const nombre = fila.nombreCompleto ?? 'El jurado';
  if (asignada) {
    const ok = await confirmar({
      mensaje: `${nombre} dejará de ver los proyectos de ${facultad.sigla} en su app. Lo que ya calificó se conserva.`,
      textoAceptar: 'Quitar',
      titulo: 'Quitar facultad',
    });
    if (!ok) return;
  }
  asignando.value = `${fila.idJurado}-f${facultad.id}`;
  try {
    if (asignada) {
      await quitarPorFacultad(idActividad.value, fila.idJurado, facultad.id);
      avisar({ mensaje: `Ya no evalúa ${facultad.sigla}.`, tipo: 'exito', titulo: nombre });
    } else {
      await asignarPorFacultad(idActividad.value, fila.idJurado, facultad.id);
      avisar({ mensaje: `Ya ve los proyectos de ${facultad.sigla} en su app.`, tipo: 'exito', titulo: nombre });
    }
    await recargarAsignaciones();
  } catch {
    // El interceptor ya avisó.
  } finally {
    asignando.value = null;
  }
}

/** Lo asigna a todas las categorías de la actividad que le faltan. */
async function asignarTodas(fila: Fila) {
  const faltan = categorias.value.filter((c) => !fila.asignadaEn.has(c.id));
  if (faltan.length === 0) return;
  asignando.value = `${fila.idJurado}-todas`;
  try {
    const resultados = await sinAvisosDeError(() =>
      Promise.allSettled(
        faltan.map((c) =>
          crearJuradoAsignacion({ idActividad: idActividad.value, idCategoriaActividad: c.id, idJurado: fila.idJurado }),
        ),
      ),
    );
    const hechas = resultados.filter((r) => r.status === 'fulfilled').length;
    avisar({
      mensaje: `Asignado a ${hechas} de ${faltan.length} categoría(s).`,
      tipo: hechas === faltan.length ? 'exito' : 'advertencia',
      titulo: fila.nombreCompleto ?? 'Jurado',
    });
    await recargarAsignaciones();
  } finally {
    asignando.value = null;
  }
}

// ---------------------------------------------------------------- proyectos por asignación

const proyectosAbierto = ref(false);
const asignacionProyectos = ref<JuradoAsignacion | null>(null);

const categoriaProyectos = computed(() =>
  categorias.value.find((c) => c.id === asignacionProyectos.value?.idCategoriaActividad),
);

/** ¿La asignación está limitada (a proyectos o a facultades)? */
function limitada(a: JuradoAsignacion | undefined) {
  return !!a && ((a.idsInscripcion ?? []).length > 0 || (a.idsFacultad ?? []).length > 0);
}

/** «Todos (n)» o «k de n»: cuántos proyectos de la categoría evalúa. */
function textoCobertura(a: JuradoAsignacion | undefined) {
  if (!a || a.idCategoriaActividad === null) return '';
  const proyectos = proyectosPorCategoria.value.get(a.idCategoriaActividad) ?? [];
  if (!limitada(a)) return `Todos (${proyectos.length})`;
  const k = proyectos.filter((i) => asignacionCubre(a, i)).length;
  const siglas = facultades.value.filter((f) => (a.idsFacultad ?? []).includes(f.id)).map((f) => f.sigla);
  return `${siglas.length > 0 ? `${siglas.join(', ')} · ` : ''}${k} de ${proyectos.length}`;
}

/**
 * Proyectos que ofrece «Elegir proyectos»: los de la categoría, y si la
 * asignación es por facultad, solo los de esas facultades.
 */
const inscripcionesProyectos = computed(() => {
  const a = asignacionProyectos.value;
  const lista = proyectosPorCategoria.value.get(a?.idCategoriaActividad ?? -1) ?? [];
  if (!a || (a.idsFacultad ?? []).length === 0) return lista;
  return lista.filter((i) => asignacionCubre({ idsFacultad: a.idsFacultad, idsInscripcion: [] }, i));
});

function abrirProyectos(a: JuradoAsignacion | undefined) {
  if (!a) return;
  asignacionProyectos.value = a;
  proyectosAbierto.value = true;
}

function alGuardarProyectos(actualizada: JuradoAsignacion) {
  asignaciones.value = asignaciones.value.map((a) =>
    a.idJuradoAsignacion === actualizada.idJuradoAsignacion ? actualizada : a,
  );
}

const coberturaAbierta = ref(false);

function abrirRegistro() {
  juradoSeleccionado.value = null;
  modalAbierto.value = true;
}

function abrirEdicion(jurado: Jurado) {
  juradoSeleccionado.value = jurado;
  modalAbierto.value = true;
}

/**
 * Solo actúa si el backend confirmó el guardado. En un alta, el acceso creado
 * se muestra dentro del formulario («Guardar y nuevo») o en un aviso aparte.
 */
async function alGuardar(payload: FormJurado, continuar: boolean) {
  const esAlta = payload.idJurado === undefined;
  credenciales.value = null;
  if (!(await crud.guardar(payload))) {
    return;
  }
  if (asignadas) {
    const { fallidas, hechas } = asignadas;
    avisar({
      mensaje:
        `Quedó asignado a ${hechas} categoría(s) de ${nombreActividad.value}.` +
        (fallidas > 0 ? ` ${fallidas} no se pudieron asignar: revíselas en «Asignación de jurados».` : ''),
      tipo: fallidas > 0 ? 'advertencia' : 'exito',
      titulo: fallidas > 0 ? 'Asignación incompleta' : 'Jurado asignado',
    });
    asignadas = null;
  }
  if (continuar) {
    modalRef.value?.reiniciar();
    return;
  }
  modalAbierto.value = false;
  if (esAlta && credenciales.value) {
    credencialesAbiertas.value = true;
  }
}

onMounted(crud.recargar);
</script>

<template>
  <SemfaPagina description="Jurados de la actividad y las categorías que evalúa cada uno" title="Jurados">
    <Card :body-style="{ padding: 0 }" class="overflow-hidden rounded-xl">
      <template #title>
        <div class="flex items-center gap-2">
          <IconifyIcon class="size-5 text-primary" icon="lucide:gavel" />
          Jurados
          <span v-if="nombreActividad" class="text-sm font-normal text-muted-foreground">· {{ nombreActividad }}</span>
        </div>
      </template>

      <template #extra>
        <SemfaBarraCrud
          v-model:busqueda="busqueda"
          :cargando="crud.cargando.value"
          icono-agregar="lucide:user-plus"
          placeholder="Buscar por CI, nombre o usuario…"
          texto-agregar="Agregar Jurado"
          @agregar="abrirRegistro"
          @recargar="crud.recargar"
        >
          <template #filtros>
            <button
              class="semfa-chip shrink-0 whitespace-nowrap"
              title="Cuántos jurados evaluarán cada proyecto, por categoría"
              type="button"
              @click="coberturaAbierta = true"
            >
              <IconifyIcon class="size-3.5" icon="lucide:shield-check" />
              Cobertura
              <span
                v-if="sinJurado > 0"
                class="rounded-full bg-red-500 px-1.5 text-[11px] font-semibold tabular-nums text-white"
                :title="`${sinJurado} proyecto(s) sin jurado`"
              >
                {{ sinJurado }}
              </span>
            </button>
            <button
              v-if="deOtras > 0"
              :class="{ 'is-activo': verOtras }"
              class="semfa-chip hidden shrink-0 whitespace-nowrap lg:inline-flex"
              title="Jurados asignados solo en otras actividades"
              type="button"
              @click="verOtras = !verOtras"
            >
              Otras actividades
              <span class="tabular-nums opacity-75">{{ deOtras }}</span>
            </button>
          </template>
        </SemfaBarraCrud>
      </template>

      <Table
        :columns="columnas"
        :data-source="filtrados"
        :loading="crud.cargando.value"
        :pagination="paginacion"
        :scroll="{ x: 1180 }"
        class="semfa-tabla"
        row-key="idJurado"
        size="middle"
        @change="alCambiarTabla"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === '#'">
            <span class="tabular-nums text-muted-foreground">
              {{ numeroFila(index) }}
            </span>
          </template>

          <template v-else-if="column.key === 'categorias'">
            <!-- Por facultad: evalúa los proyectos de esa facultad en todas sus categorías -->
            <div v-if="facultades.length > 0" class="mb-1 flex flex-wrap items-center gap-1">
              <span class="text-[11px] uppercase tracking-wide text-muted-foreground">Facultad</span>
              <Tooltip
                v-for="f in facultades"
                :key="f.id"
                :title="`${f.nombre} · ${f.proyectos} proyecto(s). ${record.facultadesAsignadas.has(f.id) ? 'Clic para quitar' : 'Clic para asignar'}`"
              >
                <button
                  :class="
                    record.facultadesAsignadas.has(f.id)
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-dashed border-border text-muted-foreground hover:border-emerald-600 hover:text-emerald-700'
                  "
                  :disabled="asignando !== null"
                  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition disabled:opacity-60"
                  type="button"
                  @click="alternarFacultad(record as Fila, f)"
                >
                  <IconifyIcon
                    :icon="
                      asignando === `${record.idJurado}-f${f.id}`
                        ? 'lucide:loader-circle'
                        : record.facultadesAsignadas.has(f.id) ? 'lucide:check' : 'lucide:building-2'
                    "
                    :class="{ 'animate-spin': asignando === `${record.idJurado}-f${f.id}` }"
                    class="size-3"
                  />
                  {{ f.sigla }}
                  <span class="tabular-nums opacity-75">{{ f.proyectos }}</span>
                </button>
              </Tooltip>
            </div>
            <div v-if="categorias.length > 0" class="flex flex-wrap items-center gap-1">
              <span
                v-if="record.todaLaActividad"
                class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                title="Asignación antigua a toda la actividad"
              >
                Toda la actividad
              </span>
              <span v-for="c in categorias" :key="c.id" class="inline-flex items-center">
                <button
                  :class="[
                    record.asignadaEn.has(c.id)
                      ? 'rounded-l-full border-primary bg-primary text-primary-foreground'
                      : 'rounded-full border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary',
                  ]"
                  :disabled="asignando !== null"
                  :title="record.asignadaEn.has(c.id) ? 'Asignado: clic para quitar' : 'Clic para asignar'"
                  class="inline-flex items-center gap-1 border px-2 py-0.5 text-xs transition disabled:opacity-60"
                  type="button"
                  @click="alternarCategoria(record as Fila, c)"
                >
                  <IconifyIcon
                    :icon="
                      asignando === `${record.idJurado}-${c.id}`
                        ? 'lucide:loader-circle'
                        : record.asignadaEn.has(c.id) ? 'lucide:check' : 'lucide:plus'
                    "
                    :class="{ 'animate-spin': asignando === `${record.idJurado}-${c.id}` }"
                    class="size-3"
                  />
                  {{ c.nombre }}
                </button>
                <!-- Proyectos que evalúa en esa categoría: «Todos (n)» o «k de n» -->
                <Tooltip v-if="record.asignadaEn.has(c.id)" :title="`Elegir qué proyectos de «${c.nombre}» evalúa`">
                  <button
                    :class="
                      limitada(record.asignacionDe.get(c.id))
                        ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    "
                    class="inline-flex items-center gap-1 rounded-r-full border border-l-0 border-primary px-2 py-0.5 text-xs tabular-nums transition"
                    type="button"
                    @click="abrirProyectos(record.asignacionDe.get(c.id))"
                  >
                    <IconifyIcon class="size-3" icon="lucide:list-checks" />
                    {{ textoCobertura(record.asignacionDe.get(c.id)) }}
                  </button>
                </Tooltip>
              </span>
              <Tooltip v-if="categorias.length > 1 && record.asignadaEn.size < categorias.length" title="Asignar a todas las categorías">
                <button
                  :disabled="asignando !== null"
                  class="rounded-full px-1.5 py-0.5 text-xs text-primary hover:underline disabled:opacity-60"
                  type="button"
                  @click="asignarTodas(record as Fila)"
                >
                  Todas
                </button>
              </Tooltip>
            </div>
            <span v-else class="text-xs text-muted-foreground">La actividad aún no tiene categorías</span>
          </template>

          <template v-else-if="column.key === 'ci'">
            <span class="font-medium tabular-nums">{{ record.ci ?? '—' }}</span>
          </template>

          <template v-else-if="column.key === 'nombreCompleto'">
            <div class="flex items-center gap-2">
              <SemfaAvatar :texto="inicialesDeNombre(record.nombreCompleto)" />
              <span class="truncate">{{ record.nombreCompleto ?? '—' }}</span>
            </div>
          </template>

          <template v-else-if="column.key === 'usuario'">
            <span v-if="record.usuario" class="font-mono text-sm">
              {{ record.usuario }}
            </span>
            <span v-else class="text-muted-foreground">Sin cuenta</span>
          </template>

          <template v-else-if="column.key === 'opciones'">
            <div class="flex justify-center gap-2">
              <Button
                class="semfa-btn semfa-btn--suave-primario"
                size="small"
                @click="abrirEdicion(record as Jurado)"
              >
                <IconifyIcon class="size-3.5" icon="lucide:pencil" />
                Editar
              </Button>
              <Button
                class="semfa-btn semfa-btn--suave-peligro"
                size="small"
                @click="
                  crud.eliminar(
                    record as Jurado,
                    record.nombreCompleto ?? 'el registro',
                  )
                "
              >
                <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
                Eliminar
              </Button>
            </div>
          </template>
        </template>

        <template #emptyText>
          <div class="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <IconifyIcon class="size-10 opacity-60" icon="lucide:search-x" />
            <span v-if="busqueda.trim()">
              No se encontraron jurados para «{{ busqueda.trim() }}»
            </span>
            <span v-else>Aún no hay jurados registrados</span>
          </div>
        </template>
      </Table>
    </Card>

    <JuradoFormModal
      ref="modalRef"
      v-model:open="modalAbierto"
      :guardando="crud.guardando.value"
      :jurado="juradoSeleccionado"
      :jurados="crud.items.value"
      :ultimas-credenciales="credenciales"
      :usuarios="usuarios"
      @guardar="alGuardar"
      @persona-actualizada="crud.recargar"
    />

    <ProyectosModal
      v-model:open="proyectosAbierto"
      :asignacion="asignacionProyectos"
      :demas="
        asignacionesActividad.filter(
          (a) =>
            a.idCategoriaActividad === asignacionProyectos?.idCategoriaActividad &&
            a.idJuradoAsignacion !== asignacionProyectos?.idJuradoAsignacion,
        )
      "
      :inscripciones="inscripcionesProyectos"
      :nombre-categoria="categoriaProyectos?.nombre ?? asignacionProyectos?.categoriaActividad ?? ''"
      :nombre-jurado="asignacionProyectos?.jurado ?? 'El jurado'"
      @guardado="alGuardarProyectos"
    />

    <CoberturaModal
      v-model:open="coberturaAbierta"
      :asignaciones="asignacionesActividad"
      :categorias="categorias"
      :inscripciones="inscripciones"
      @repartir="abrirProyectos"
    />

    <!-- Tras un alta con «Guardar»: el acceso para entregar al jurado -->
    <Modal
      v-model:open="credencialesAbiertas"
      :closable="false"
      :mask-closable="false"
      :width="560"
      centered
      title="Jurado registrado"
    >
      <SemfaCredenciales v-if="credenciales" :credenciales="credenciales" />
      <template #footer>
        <Button
          class="semfa-btn semfa-btn--primario"
          size="large"
          @click="credencialesAbiertas = false"
        >
          Listo
        </Button>
      </template>
    </Modal>
  </SemfaPagina>
</template>
