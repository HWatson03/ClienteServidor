<script lang="ts" setup>
import type {
  AsignacionCarreraDatos,
  CarreraSlots,
} from '#/api/jurado-carrera';
import type { Jurado } from '#/api/jurados';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Card, Empty, Input, Select, Spin, Tooltip } from 'ant-design-vue';

import {
  guardarAsignacion,
  obtenerDatosAsignacion,
} from '#/api/jurado-carrera';
import { listarJurados } from '#/api/jurados';
import SemfaAvatar from '#/components/semfa/semfa-avatar.vue';
import { avisar, confirmar } from '#/composables/useAvisos';
import {
  inicialesDeNombre,
  limpiarEspacios,
  nombrePropio,
  normalizarTexto,
} from '#/utils/formato';

import CarreraModal from './carrera-modal.vue';

defineOptions({ name: 'SemfaJuradoCarrera' });

type Nivel = 'avanzado' | 'basico';

const NIVELES: { clave: Nivel; icono: string; titulo: string }[] = [
  { clave: 'basico', icono: 'lucide:signal-low', titulo: 'Básico' },
  { clave: 'avanzado', icono: 'lucide:signal-high', titulo: 'Avanzado' },
];

const datos = ref<AsignacionCarreraDatos>({ carreras: [], jurados: [] });
/** Jurados activos: nombre completo y CI (el DTO de la pantalla solo trae los nombres de pila). */
const juradosActivos = ref<Jurado[]>([]);
const cargando = ref(false);
const guardando = ref(false);
const carreraModalAbierto = ref(false);

const carreraId = ref<null | number>(null);
const slots = ref<Record<Nivel, number[]>>({ avanzado: [], basico: [] });
const busquedaCarrera = ref('');

// ---------------------------------------------------------------- datos derivados

const carrera = computed<CarreraSlots | null>(
  () => datos.value.carreras.find((c) => c.idCarrera === carreraId.value) ?? null,
);

/** Datos de cada jurado para pintarlo; los inactivos se marcan para poder quitarlos. */
const infoJurado = computed(() => {
  const mapa = new Map<
    number,
    { activo: boolean; ci: null | string; iniciales: string; nombre: string }
  >();
  for (const j of datos.value.jurados) {
    mapa.set(j.idJurado, {
      activo: false,
      ci: null,
      iniciales: inicialesDeNombre(j.nombre),
      nombre: j.nombre ?? `Jurado #${j.idJurado}`,
    });
  }
  for (const j of juradosActivos.value) {
    mapa.set(j.idJurado, {
      activo: true,
      ci: j.ci,
      iniciales: inicialesDeNombre(j.nombreCompleto),
      nombre: j.nombreCompleto ?? `Jurado #${j.idJurado}`,
    });
  }
  return mapa;
});

/**
 * Dónde está cada jurado según lo guardado. Se calcula de los slots de todas las
 * carreras porque el DTO del backend solo informa una carrera/nivel por jurado.
 */
const lugaresPorJurado = computed(() => {
  const mapa = new Map<number, { idCarrera: number; nivel: Nivel; texto: string }[]>();
  for (const c of datos.value.carreras) {
    for (const { clave, titulo } of NIVELES) {
      for (const id of c[clave] ?? []) {
        const lista = mapa.get(id) ?? [];
        lista.push({
          idCarrera: c.idCarrera,
          nivel: clave,
          texto: `${nombrePropio(c.nombre)} · ${titulo}`,
        });
        mapa.set(id, lista);
      }
    }
  }
  return mapa;
});

/** Asignaciones del jurado en otras carreras (no bloquean: solo se avisan). */
function enOtrasCarreras(idJurado: number) {
  return (lugaresPorJurado.value.get(idJurado) ?? []).filter(
    (l) => l.idCarrera !== carreraId.value,
  );
}

function estadoCarrera(c: CarreraSlots) {
  const b = c.basico?.length ?? 0;
  const a = c.avanzado?.length ?? 0;
  if (b > 0 && a > 0) {
    return { clase: 'text-green-600', icono: 'lucide:circle-check', texto: 'Completa' };
  }
  if (b === 0 && a === 0) {
    return { clase: 'text-amber-600', icono: 'lucide:circle-dashed', texto: 'Sin jurados' };
  }
  return {
    clase: 'text-amber-600',
    icono: 'lucide:circle-alert',
    texto: b === 0 ? 'Falta Básico' : 'Falta Avanzado',
  };
}

const carrerasVisibles = computed(() => {
  const termino = normalizarTexto(busquedaCarrera.value.trim());
  return datos.value.carreras
    .filter((c) => !termino || normalizarTexto(c.nombre).includes(termino))
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
});

const resumen = computed(() => {
  const total = datos.value.carreras.length;
  const completas = datos.value.carreras.filter(
    (c) => (c.basico?.length ?? 0) > 0 && (c.avanzado?.length ?? 0) > 0,
  ).length;
  return { completas, pendientes: total - completas, total };
});

// ---------------------------------------------------------------- edición

const hayCambios = computed(() => {
  if (!carrera.value) {
    return false;
  }
  const igual = (a: number[], b: number[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return (
    !igual(slots.value.basico, carrera.value.basico ?? []) ||
    !igual(slots.value.avanzado, carrera.value.avanzado ?? [])
  );
});

function opcionesAgregar(nivel: Nivel) {
  return juradosActivos.value.map((j) => {
    const lugares = enOtrasCarreras(j.idJurado);
    return {
      busqueda: `${j.nombreCompleto ?? ''} ${j.ci ?? ''}`,
      ci: j.ci,
      disabled: slots.value[nivel].includes(j.idJurado),
      iniciales: inicialesDeNombre(j.nombreCompleto),
      label: j.nombreCompleto ?? `Jurado #${j.idJurado}`,
      lugares: lugares.map((l) => l.texto),
      value: j.idJurado,
    };
  });
}

/**
 * Valor fijo del `Select` «Agregar jurado»: tras elegir, vuelve a quedar vacío.
 * Con `undefined` antd pasaría a no controlado y mostraría el elegido; `null` lo
 * mantiene controlado y vacío, pero sus tipos no lo admiten.
 */
const SIN_SELECCION = null as unknown as number;

function filtrar(entrada: string, opcion: any) {
  return normalizarTexto(opcion?.busqueda).includes(normalizarTexto(entrada.trim()));
}

function agregar(nivel: Nivel, idJurado: number) {
  if (!slots.value[nivel].includes(idJurado)) {
    slots.value[nivel] = [...slots.value[nivel], idJurado];
  }
}

function quitar(nivel: Nivel, idJurado: number) {
  slots.value[nivel] = slots.value[nivel].filter((id) => id !== idJurado);
}

/** Suma los jurados de un nivel al otro, sin quitar los que ya había. */
function copiar(desde: Nivel, hacia: Nivel) {
  const antes = slots.value[hacia].length;
  slots.value[hacia] = [...new Set([...slots.value[hacia], ...slots.value[desde]])];
  const nuevos = slots.value[hacia].length - antes;
  avisar({
    duracion: 3000,
    mensaje: 'Recuerde guardar para aplicar el cambio.',
    tipo: 'info',
    titulo:
      nuevos === 0
        ? 'No había jurados nuevos que copiar'
        : `${nuevos} jurado${nuevos === 1 ? '' : 's'} copiado${nuevos === 1 ? '' : 's'} a ${hacia === 'basico' ? 'Básico' : 'Avanzado'}`,
  });
}

function aplicarSeleccion(id: null | number) {
  carreraId.value = id;
  const c = datos.value.carreras.find((x) => x.idCarrera === id);
  slots.value = {
    avanzado: [...(c?.avanzado ?? [])],
    basico: [...(c?.basico ?? [])],
  };
}

/** Cambiar de carrera con cambios sin guardar pide confirmación. */
async function seleccionar(id: number) {
  if (id === carreraId.value) {
    return;
  }
  if (hayCambios.value) {
    const descartar = await confirmar({
      mensaje: `Los cambios en «${nombrePropio(carrera.value?.nombre)}» no se guardarán.`,
      peligro: true,
      textoAceptar: 'Descartar',
      textoCancelar: 'Seguir editando',
      titulo: '¿Descartar los cambios?',
    });
    if (!descartar) {
      return;
    }
  }
  aplicarSeleccion(id);
}

function descartar() {
  aplicarSeleccion(carreraId.value);
}

// ---------------------------------------------------------------- carga y guardado

async function cargar(mantenerCarreraId?: null | number) {
  cargando.value = true;
  try {
    const [d, activos] = await Promise.all([
      obtenerDatosAsignacion(),
      listarJurados().catch(() => [] as Jurado[]),
    ]);
    datos.value = d ?? { carreras: [], jurados: [] };
    juradosActivos.value = activos ?? [];
    const objetivo = mantenerCarreraId ?? carreraId.value;
    const existe = datos.value.carreras.some((c) => c.idCarrera === objetivo);
    aplicarSeleccion(
      existe ? objetivo : (carrerasVisibles.value[0]?.idCarrera ?? null),
    );
  } finally {
    cargando.value = false;
  }
}

async function guardar() {
  if (!carrera.value || !hayCambios.value || guardando.value) {
    return;
  }
  const nombre = nombrePropio(carrera.value.nombre);
  guardando.value = true;
  try {
    await guardarAsignacion({
      avanzado: slots.value.avanzado,
      basico: slots.value.basico,
      idCarrera: carrera.value.idCarrera,
    });
    avisar({
      mensaje: `«${nombre}» queda con ${slots.value.basico.length} en Básico y ${slots.value.avanzado.length} en Avanzado.`,
      tipo: 'exito',
      titulo: 'Jurados guardados',
    });
    await cargar(carrera.value.idCarrera);
  } catch {
    // El interceptor de errores ya avisó; se conservan los cambios en pantalla.
  } finally {
    guardando.value = false;
  }
}

/** Ctrl/⌘+S guarda la carrera abierta. */
function alPulsarTecla(evento: KeyboardEvent) {
  if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
    evento.preventDefault();
    guardar();
  }
}

/**
 * Tras crear una carrera se muestra en el editor, salvo que la actual tenga
 * cambios sin guardar: entonces se recarga la lista y se conservan.
 */
async function alCrearCarrera(idCarrera: number) {
  if (!hayCambios.value) {
    await cargar(idCarrera);
    return;
  }
  const pendientes = { ...slots.value };
  await cargar(carreraId.value);
  slots.value = pendientes;
}

/** «Recargar» trae lo guardado: con cambios sin guardar, pregunta antes. */
async function recargar() {
  if (hayCambios.value) {
    const descartar = await confirmar({
      mensaje: `Los cambios en «${nombrePropio(carrera.value?.nombre)}» se perderán al recargar.`,
      peligro: true,
      textoAceptar: 'Recargar',
      textoCancelar: 'Seguir editando',
      titulo: '¿Descartar los cambios?',
    });
    if (!descartar) {
      return;
    }
  }
  await cargar();
}

onMounted(() => {
  cargar();
  window.addEventListener('keydown', alPulsarTecla);
});

onBeforeUnmount(() => window.removeEventListener('keydown', alPulsarTecla));
</script>

<template>
  <Page
    description="Administración / Asignar jurados por carrera"
    title="Asignar jurados por carrera"
  >
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- Carreras -->
      <Card
        :body-style="{ padding: '12px' }"
        class="overflow-hidden rounded-xl lg:col-span-4"
      >
        <template #title>
          <div class="flex items-center gap-2">
            <IconifyIcon class="size-5 text-primary" icon="lucide:graduation-cap" />
            Carreras
          </div>
        </template>
        <template #extra>
          <div class="flex items-center gap-2">
            <Tooltip title="Recargar">
              <Button
                :disabled="cargando"
                aria-label="Recargar"
                class="semfa-btn semfa-btn--neutro"
                @click="recargar"
              >
                <IconifyIcon
                  :class="{ 'animate-spin': cargando }"
                  class="size-4"
                  icon="lucide:refresh-cw"
                />
              </Button>
            </Tooltip>
            <Button
              class="semfa-btn semfa-btn--primario"
              @click="carreraModalAbierto = true"
            >
              <IconifyIcon class="size-4" icon="lucide:plus" />
              <span class="hidden sm:inline">Agregar carrera</span>
            </Button>
          </div>
        </template>

        <Spin :spinning="cargando">
          <div
            v-if="resumen.total > 0"
            class="mb-3 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span>{{ resumen.total }} carreras</span>
            <span>·</span>
            <span class="text-green-600">{{ resumen.completas }} completas</span>
            <template v-if="resumen.pendientes > 0">
              <span>·</span>
              <span class="text-amber-600">{{ resumen.pendientes }} pendientes</span>
            </template>
          </div>

          <Input
            v-if="datos.carreras.length > 6"
            v-model:value="busquedaCarrera"
            allow-clear
            class="mb-3"
            placeholder="Buscar carrera…"
          >
            <template #prefix>
              <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:search" />
            </template>
          </Input>

          <Empty
            v-if="datos.carreras.length === 0"
            description="Aún no hay carreras: agregue la primera."
          />
          <div v-else class="flex flex-col gap-2">
            <button
              v-for="c in carrerasVisibles"
              :key="c.idCarrera"
              :class="
                c.idCarrera === carreraId
                  ? 'border-primary bg-primary/5 shadow-[0_2px_0_hsl(var(--primary)/0.35)]'
                  : 'border-border bg-card hover:-translate-y-px hover:border-primary/40 hover:shadow-md'
              "
              class="flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
              type="button"
              @click="seleccionar(c.idCarrera)"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ nombrePropio(c.nombre) }}</div>
                <div
                  :class="estadoCarrera(c).clase"
                  class="flex items-center gap-1 text-xs"
                >
                  <IconifyIcon :icon="estadoCarrera(c).icono" class="size-3.5" />
                  {{ estadoCarrera(c).texto }}
                </div>
              </div>
              <div class="flex shrink-0 gap-1 text-xs">
                <span
                  :title="`${c.basico?.length ?? 0} en Básico`"
                  class="rounded-full bg-muted px-2 py-0.5 tabular-nums"
                >
                  B {{ c.basico?.length ?? 0 }}
                </span>
                <span
                  :title="`${c.avanzado?.length ?? 0} en Avanzado`"
                  class="rounded-full bg-muted px-2 py-0.5 tabular-nums"
                >
                  A {{ c.avanzado?.length ?? 0 }}
                </span>
              </div>
            </button>
          </div>
        </Spin>
      </Card>

      <!-- Editor de la carrera seleccionada -->
      <Card class="overflow-hidden rounded-xl lg:col-span-8">
        <template #title>
          <div class="flex min-w-0 items-center gap-2">
            <IconifyIcon class="size-5 shrink-0 text-primary" icon="lucide:users" />
            <span class="truncate">
              {{ carrera ? nombrePropio(carrera.nombre) : 'Elija una carrera' }}
            </span>
            <span
              v-if="hayCambios"
              class="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              Cambios sin guardar
            </span>
          </div>
        </template>
        <template #extra>
          <div class="flex items-center gap-2">
            <Button
              v-if="hayCambios"
              :disabled="guardando"
              class="semfa-btn semfa-btn--neutro"
              @click="descartar"
            >
              Descartar
            </Button>
            <Tooltip title="Ctrl + S">
              <Button
                :disabled="!hayCambios"
                :loading="guardando"
                class="semfa-btn semfa-btn--primario"
                @click="guardar"
              >
                <IconifyIcon v-if="!guardando" class="size-4" icon="lucide:save" />
                Guardar
              </Button>
            </Tooltip>
          </div>
        </template>

        <Empty v-if="!carrera" description="Elija una carrera de la izquierda." />

        <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            v-for="(nivel, i) in NIVELES"
            :key="nivel.clave"
            class="flex flex-col rounded-xl border border-border bg-muted/30 p-3"
          >
            <!-- Cabecera del nivel -->
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 font-semibold">
                <IconifyIcon :icon="nivel.icono" class="size-4 text-primary" />
                {{ nivel.titulo }}
                <span class="semfa-chip__total">{{ slots[nivel.clave].length }}</span>
              </div>
              <Tooltip
                :title="`Añadir a ${i === 0 ? 'Avanzado' : 'Básico'} los jurados de ${nivel.titulo}`"
              >
                <Button
                  :disabled="slots[nivel.clave].length === 0 || guardando"
                  class="semfa-btn semfa-btn--suave-primario"
                  size="small"
                  @click="copiar(nivel.clave, i === 0 ? 'avanzado' : 'basico')"
                >
                  <IconifyIcon class="size-3.5" icon="lucide:copy-plus" />
                  Copiar a {{ i === 0 ? 'Avanzado' : 'Básico' }}
                </Button>
              </Tooltip>
            </div>

            <!-- Jurados del nivel -->
            <div class="flex min-h-24 flex-col gap-1.5">
              <div
                v-for="id in slots[nivel.clave]"
                :key="id"
                class="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-[0_1px_0_hsl(var(--border))]"
              >
                <SemfaAvatar :texto="infoJurado.get(id)?.iniciales ?? '?'" tamano="md" />
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">
                    {{ infoJurado.get(id)?.nombre ?? `Jurado #${id}` }}
                  </div>
                  <div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span v-if="infoJurado.get(id)?.ci">CI {{ infoJurado.get(id)?.ci }}</span>
                    <span
                      v-if="infoJurado.get(id) && !infoJurado.get(id)!.activo"
                      class="rounded-full bg-red-500/10 px-1.5 text-red-600"
                    >
                      Jurado inactivo
                    </span>
                    <Tooltip
                      v-if="enOtrasCarreras(id).length > 0"
                      :title="enOtrasCarreras(id).map((l) => l.texto).join('\n')"
                    >
                      <span class="rounded-full bg-amber-500/10 px-1.5 text-amber-600">
                        También en {{ enOtrasCarreras(id).length }}
                        {{ enOtrasCarreras(id).length === 1 ? 'carrera' : 'carreras' }}
                      </span>
                    </Tooltip>
                  </div>
                </div>
                <Tooltip title="Quitar de este nivel">
                  <Button
                    :aria-label="`Quitar a ${infoJurado.get(id)?.nombre ?? 'jurado'}`"
                    :disabled="guardando"
                    size="small"
                    type="text"
                    @click="quitar(nivel.clave, id)"
                  >
                    <IconifyIcon class="size-4 text-muted-foreground" icon="lucide:x" />
                  </Button>
                </Tooltip>
              </div>

              <div
                v-if="slots[nivel.clave].length === 0"
                class="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-4 text-sm text-amber-600"
              >
                <IconifyIcon class="size-5" icon="lucide:user-round-x" />
                Sin jurados en {{ nivel.titulo }}
              </div>
            </div>

            <!-- Agregar -->
            <Select
              :disabled="guardando"
              :filter-option="filtrar"
              :options="opcionesAgregar(nivel.clave)"
              :value="SIN_SELECCION"
              class="mt-2 w-full"
              placeholder="+ Agregar jurado (nombre o CI)…"
              show-search
              @select="(v: any) => agregar(nivel.clave, v as number)"
            >
              <template #option="{ ci, iniciales: ini, label, lugares, disabled }">
                <div class="flex items-center gap-3 py-0.5">
                  <SemfaAvatar :texto="ini" tamano="md" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate">{{ label }}</div>
                    <div class="text-xs text-muted-foreground">CI {{ ci ?? '—' }}</div>
                  </div>
                  <span
                    v-if="disabled"
                    class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    Ya en {{ nivel.titulo }}
                  </span>
                  <span
                    v-else-if="lugares.length > 0"
                    :title="lugares.join('\n')"
                    class="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600"
                  >
                    {{ limpiarEspacios(lugares[0]) }}{{ lugares.length > 1 ? ` +${lugares.length - 1}` : '' }}
                  </span>
                  <span
                    v-else
                    class="shrink-0 rounded-full bg-green-600/10 px-2 py-0.5 text-xs text-green-600"
                  >
                    Libre
                  </span>
                </div>
              </template>
            </Select>
          </div>

          <p class="m-0 text-xs text-muted-foreground md:col-span-2">
            Al guardar se reemplazan los jurados de los dos niveles de esta carrera.
            Un jurado puede estar en ambos niveles; si también está en otra carrera
            se indica en ámbar.
          </p>
        </div>
      </Card>
    </div>

    <CarreraModal
      v-model:open="carreraModalAbierto"
      :carreras="datos.carreras"
      @carrera-creada="alCrearCarrera"
    />
  </Page>
</template>
