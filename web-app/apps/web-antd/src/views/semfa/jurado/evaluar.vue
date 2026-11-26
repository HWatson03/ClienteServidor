<script lang="ts" setup>
import type { CriterioHoja, HojaEvaluacion, ProyectoTablero, TableroJurado } from '#/api/jurado';

import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Button, Modal } from 'ant-design-vue';

import { evaluarCompleto, obtenerHojaEvaluacion, obtenerTableroJurado } from '#/api/jurado';
import SemfaNivelesRango from '#/components/semfa/semfa-niveles-rango.vue';
import { avisar, confirmar } from '#/composables/useAvisos';
import { formatearPuntos } from '#/utils/escala';
import { tiempoTranscurrido } from '#/utils/formato';

import { esNivelesRango, nivelDe, nivelRangoDe, ubicacionFeria } from './escala';

defineOptions({ name: 'JuradoEvaluar' });

/**
 * Hoja de evaluación del jurado como carrusel: una rúbrica por paso y un último
 * paso de resumen con «Guardar». Se avanza con los botones, deslizando el dedo o
 * con ← →; al completar la rúbrica pasa sola a la siguiente.
 *
 * Todo se guarda junto con `POST /api/jurado/evaluar-completo`. Lo marcado sin
 * guardar queda como borrador en el dispositivo por si la app se cierra.
 */

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const idCategoria = computed(() => Number(route.params.categoriaId));
const idParticipante = computed(() => Number(route.params.participanteId));

const hoja = shallowRef<HojaEvaluacion | null>(null);
const cargando = ref(false);
const guardando = ref(false);
/** idCriterio → puntaje elegido. */
const puntajes = ref<Record<number, number>>({});
const original = ref('');
const borradorRecuperado = ref(false);
const paso = ref(0);
const direccion = ref<'paso-anterior' | 'paso-siguiente'>('paso-siguiente');
const resultado = ref<null | { siguiente?: { idCategoria: number; proyecto: ProyectoTablero }; total: number }>(null);

// ------------------------------------------------------------------ borrador local

function claveBorrador() {
  const usuario = userStore.userInfo?.username ?? 'jurado';
  return `semfa.jurado.borrador.${usuario}.${idCategoria.value}.${idParticipante.value}`;
}

function firma(valores: Record<number, number>) {
  return JSON.stringify(
    Object.entries(valores)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => Number(a) - Number(b)),
  );
}

function leerBorrador(): null | Record<number, number> {
  try {
    const texto = localStorage.getItem(claveBorrador());
    return texto ? (JSON.parse(texto) as Record<number, number>) : null;
  } catch {
    return null;
  }
}

function escribirBorrador(valores: null | Record<number, number>) {
  try {
    if (valores) localStorage.setItem(claveBorrador(), JSON.stringify(valores));
    else localStorage.removeItem(claveBorrador());
  } catch {
    // Sin almacenamiento: no hay borrador, lo demás sigue igual.
  }
}

// ------------------------------------------------------------------ derivados

const rubricas = computed(() => hoja.value?.rubricas ?? []);
/** Pasos del carrusel: una rúbrica cada uno y el resumen al final. */
const totalPasos = computed(() => rubricas.value.length + 1);
const enResumen = computed(() => paso.value >= rubricas.value.length);
const rubricaActual = computed(() => (enResumen.value ? undefined : rubricas.value[paso.value]));

const criterios = computed(() => rubricas.value.flatMap((r) => r.criterios));
const faltantes = computed(() => criterios.value.filter((c) => puntajes.value[c.idCriterio] === undefined));
const total = computed(() => redondear(criterios.value.reduce((s, c) => s + (puntajes.value[c.idCriterio] ?? 0), 0)));
const hayCambios = computed(() => hoja.value !== null && firma(puntajes.value) !== original.value);
const yaGuardada = computed(() => hoja.value !== null && hoja.value.estado !== 'PENDIENTE');
const bloqueada = computed(() => yaGuardada.value && !hoja.value?.reevaluacionAutorizada);
const nivelTotal = computed(() =>
  faltantes.value.length === 0 ? nivelDe(total.value, hoja.value?.puntajeMaximo ?? 100) : null,
);

function avance(i: number) {
  const lista = rubricas.value[i]?.criterios ?? [];
  const hechos = lista.filter((c) => puntajes.value[c.idCriterio] !== undefined).length;
  return {
    completa: lista.length > 0 && hechos === lista.length,
    hechos,
    maximo: lista.reduce((s, c) => s + c.maximo, 0),
    puntos: redondear(lista.reduce((s, c) => s + (puntajes.value[c.idCriterio] ?? 0), 0)),
    total: lista.length,
  };
}

watch(
  puntajes,
  (valores) => {
    if (hoja.value) escribirBorrador(hayCambios.value ? valores : null);
  },
  { deep: true },
);

// ------------------------------------------------------------------ carga

async function cargar() {
  cargando.value = true;
  resultado.value = null;
  borradorRecuperado.value = false;
  try {
    const h = await obtenerHojaEvaluacion(idCategoria.value, idParticipante.value);
    hoja.value = h;
    const guardados: Record<number, number> = {};
    for (const c of h.rubricas.flatMap((r) => r.criterios)) {
      if (c.puntaje !== null) guardados[c.idCriterio] = c.puntaje;
    }
    original.value = firma(guardados);
    puntajes.value = { ...guardados };

    const borrador = leerBorrador();
    if (borrador) {
      const validos = Object.fromEntries(
        criterios.value
          .filter((c) => borrador[c.idCriterio] !== undefined)
          .map((c) => [c.idCriterio, Math.min(Math.max(c.minimo ?? 1, borrador[c.idCriterio]!), c.maximo)]),
      ) as Record<number, number>;
      if (Object.keys(validos).length > 0 && firma({ ...guardados, ...validos }) !== original.value) {
        puntajes.value = { ...guardados, ...validos };
        borradorRecuperado.value = true;
      } else {
        escribirBorrador(null);
      }
    }
    // Empieza en la primera rúbrica sin terminar; si está completa, en el resumen.
    const pendiente = h.rubricas.findIndex((_, i) => !avance(i).completa);
    direccion.value = 'paso-siguiente';
    paso.value = pendiente === -1 ? h.rubricas.length : pendiente;
    nextTick(ajustarAlto);
  } catch {
    hoja.value = null;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

// ------------------------------------------------------------------ ajuste al alto de la pantalla

/**
 * Reparte el alto libre entre las filas de botones para que el paso quepa sin
 * scroll: mide lo que ocupan títulos, guías, márgenes y separaciones (no depende
 * del alto de los botones) y le da el resto, por igual, a cada fila. El CSS lo
 * acota entre un mínimo y un máximo por tamaño de pantalla (`--semfa-min/max`).
 */
const scroller = ref<HTMLElement>();
const altoBotones = ref<number>();

function ajustarAlto() {
  const sc = scroller.value;
  const cont = sc?.querySelector<HTMLElement>('.semfa-hoja-paso');
  if (!sc || !cont) return;
  const filas = [...cont.querySelectorAll<HTMLElement>('.semfa-puntajes')];
  if (filas.length === 0) return;
  const estilo = getComputedStyle(cont);
  const hijos = ([...cont.children] as HTMLElement[]).filter((h) => getComputedStyle(h).display !== 'none');
  const separacion = Number.parseFloat(estilo.rowGap) || 0;
  const contenido =
    hijos.reduce((s, h) => s + h.offsetHeight, 0) +
    separacion * Math.max(0, hijos.length - 1) +
    (Number.parseFloat(estilo.paddingTop) || 0) +
    (Number.parseFloat(estilo.paddingBottom) || 0);
  const enBotones = filas.reduce((s, f) => s + f.offsetHeight, 0);
  altoBotones.value = Math.floor((sc.clientHeight - (contenido - enBotones)) / filas.length);
}

let observador: ResizeObserver | undefined;
watch(scroller, (el) => {
  observador?.disconnect();
  if (!el) return;
  observador = new ResizeObserver(() => ajustarAlto());
  observador.observe(el);
});
watch(borradorRecuperado, () => nextTick(ajustarAlto));
onBeforeUnmount(() => observador?.disconnect());
watch([idCategoria, idParticipante], () => {
  if (Number.isFinite(idCategoria.value) && Number.isFinite(idParticipante.value)) cargar();
});

// ------------------------------------------------------------------ navegación del carrusel

function irAPaso(destino: number) {
  const limite = Math.max(0, Math.min(destino, totalPasos.value - 1));
  if (limite === paso.value) return;
  direccion.value = limite > paso.value ? 'paso-siguiente' : 'paso-anterior';
  paso.value = limite;
}

let toque: null | { x: number; y: number } = null;

function alTocar(e: TouchEvent) {
  const t = e.changedTouches[0];
  toque = t ? { x: t.clientX, y: t.clientY } : null;
}

function alSoltar(e: TouchEvent) {
  const t = e.changedTouches[0];
  if (!toque || !t) return;
  const dx = t.clientX - toque.x;
  const dy = t.clientY - toque.y;
  toque = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    irAPaso(paso.value + (dx < 0 ? 1 : -1));
  }
}

// ------------------------------------------------------------------ calificar

function redondear(valor: number) {
  return Math.round(valor * 100) / 100;
}

/**
 * Cómo se califica el criterio en pantalla:
 *  - `botones`: enteros cortos (1–10, 0–10), una fila de botones como siempre.
 *  - `niveles`: lista de niveles con su descripción (rúbricas tipo convocatoria).
 *  - `nivelesRango`: niveles con nombre y rango (FEXCOIN): se toca un nivel y luego
 *    un número de su rango.
 *  - `rango`: rango largo o con decimales: − / + y deslizador.
 */
function modoDe(c: CriterioHoja): 'botones' | 'niveles' | 'nivelesRango' | 'rango' {
  if (esNivelesRango(c)) return 'nivelesRango';
  if ((c.niveles ?? []).length > 0) return 'niveles';
  const minimo = c.minimo ?? 1;
  const paso = c.paso ?? 1;
  return paso === 1 && c.maximo - minimo + 1 <= 11 ? 'botones' : 'rango';
}

function valoresDe(c: CriterioHoja) {
  const minimo = Math.ceil(c.minimo ?? 1);
  return Array.from({ length: c.maximo - minimo + 1 }, (_, i) => minimo + i);
}

/**
 * Criterios por rango de la rúbrica actual: solo el abierto muestra sus niveles; los
 * demás se pliegan a una línea («15 · Muy Bueno») para que quepan todos sin scroll.
 */
const abiertoId = ref<number>();
const criteriosRango = computed(() => rubricaActual.value?.criterios.filter((c) => modoDe(c) === 'nivelesRango') ?? []);
const criterioAbierto = computed(() => {
  const lista = criteriosRango.value;
  return (
    lista.find((c) => c.idCriterio === abiertoId.value) ??
    lista.find((c) => puntajes.value[c.idCriterio] === undefined) ??
    lista[0]
  );
});

function esPlegado(c: CriterioHoja) {
  return modoDe(c) === 'nivelesRango' && criterioAbierto.value?.idCriterio !== c.idCriterio;
}

function abrirCriterio(c: CriterioHoja) {
  if (modoDe(c) === 'nivelesRango') abiertoId.value = c.idCriterio;
}

/**
 * Puntaje confirmado con «Aceptar» en un criterio por rango: lo guarda y abre el
 * siguiente sin calificar (tocar niveles o números no avanza: ver semfa-niveles-rango).
 */
function elegirRango(c: CriterioHoja, valor: number) {
  elegir(c, valor);
  const lista = criteriosRango.value;
  const i = lista.findIndex((x) => x.idCriterio === c.idCriterio);
  const faltan = (x: CriterioHoja) => puntajes.value[x.idCriterio] === undefined && x.idCriterio !== c.idCriterio;
  const siguiente = [...lista.slice(i + 1), ...lista.slice(0, i)].find(faltan);
  if (siguiente) abiertoId.value = siguiente.idCriterio;
  nextTick(ajustarAlto);
}

function nivelesRangoDe(c: CriterioHoja) {
  return [...c.niveles]
    .sort((a, b) => a.desde! - b.desde!)
    .map((n) => ({ desde: n.desde!, descripcion: n.descripcion, nombre: n.nombre ?? '', puntos: n.puntos }));
}

/** Texto y color con que se muestra el nivel elegido de un criterio. */
function etiquetaNivel(c: CriterioHoja): null | { clase: string; texto: string } {
  const v = puntajes.value[c.idCriterio];
  if (modoDe(c) === 'nivelesRango') {
    const r = nivelRangoDe(c, v);
    return r ? { clase: r.clase, texto: r.texto } : null;
  }
  const n = nivelDe(v, c.maximo);
  return n ? { clase: n.clase, texto: n.texto } : null;
}

/** Criterios por rango de una rúbrica con su resultado («15 · Muy Bueno»), para el resumen. */
function detalleRangos(r: { criterios: CriterioHoja[] }) {
  return r.criterios
    .filter((c) => modoDe(c) === 'nivelesRango')
    .map((c) => ({ ...etiquetaNivel(c), id: c.idCriterio, nombre: c.nombre }));
}

watch(paso, () => {
  abiertoId.value = undefined;
});
watch(criterioAbierto, () => nextTick(ajustarAlto));

/** Escala clásica 1–10: muestra la leyenda Deficiente / Regular / Bueno / Excelente. */
const leyendaClasica = computed(
  () => rubricaActual.value?.criterios.every((c) => modoDe(c) === 'botones' && (c.minimo ?? 1) === 1) ?? false,
);

/** Afina con − / + (sin pasar sola al siguiente paso). */
function afinar(c: CriterioHoja, signo: -1 | 1) {
  const actual = puntajes.value[c.idCriterio];
  const minimo = c.minimo ?? 1;
  const paso = c.paso ?? 1;
  const base = actual === undefined ? (signo > 0 ? minimo - paso : minimo + paso) : actual;
  const nuevo = redondear(Math.min(c.maximo, Math.max(minimo, base + signo * paso)));
  elegir(c, nuevo, false);
}

/** Atajos de un rango largo: mínimo, cuartos y máximo (p. ej. 0 · 5 · 10 · 15 · 20). */
function atajosDe(c: CriterioHoja) {
  const minimo = c.minimo ?? 1;
  const paso = c.paso ?? 1;
  const valores = [0, 1, 2, 3, 4].map((k) => {
    const crudo = minimo + ((c.maximo - minimo) * k) / 4;
    return redondear(minimo + Math.round((crudo - minimo) / paso) * paso);
  });
  return [...new Set(valores)];
}

function alDeslizar(c: CriterioHoja, evento: Event) {
  elegir(c, redondear(Number((evento.target as HTMLInputElement).value)), false);
}

/** Nivel elegido o, entre dos, el que queda por debajo. */
function nivelActivo(c: CriterioHoja) {
  const v = puntajes.value[c.idCriterio];
  if (v === undefined) return undefined;
  return [...c.niveles].reverse().find((n) => n.puntos <= v + 1e-9);
}

function elegir(c: CriterioHoja, valor: number, avanzar = true) {
  const eraNuevo = puntajes.value[c.idCriterio] === undefined;
  const completaAntes = avance(paso.value).completa;
  puntajes.value = { ...puntajes.value, [c.idCriterio]: valor };
  // Al terminar la rúbrica (no al corregir un valor) pasa sola a la siguiente.
  if (avanzar && eraNuevo && !completaAntes && avance(paso.value).completa) {
    const actual = paso.value;
    setTimeout(() => {
      if (paso.value === actual) irAPaso(actual + 1);
    }, 380);
  }
}

function descartarBorrador() {
  puntajes.value = Object.fromEntries(JSON.parse(original.value)) as Record<number, number>;
  escribirBorrador(null);
  borradorRecuperado.value = false;
}

// ------------------------------------------------------------------ guardar

/** Próximo sin terminar: primero en esta categoría, luego en las demás. */
function proximoPendiente(t: null | TableroJurado) {
  if (!t) return undefined;
  const orden = [...t.categorias].sort((a, b) =>
    a.idCategoria === idCategoria.value ? -1 : b.idCategoria === idCategoria.value ? 1 : 0,
  );
  for (const c of orden) {
    const p = c.proyectos.find((x) => x.estado !== 'EVALUADO' && x.idParticipante !== idParticipante.value);
    if (p) return { idCategoria: c.idCategoria, proyecto: p };
  }
  return undefined;
}

async function guardar() {
  const h = hoja.value;
  if (!h || guardando.value) return;
  if (bloqueada.value) {
    avisar({ mensaje: 'Tu evaluación ya fue enviada. Solo administración puede habilitar una reevaluación.',
      tipo: 'advertencia', titulo: 'Evaluación cerrada' });
    return;
  }
  if (faltantes.value.length > 0) {
    const i = h.rubricas.findIndex((_, k) => !avance(k).completa);
    avisar({
      mensaje: `Te falta calificar ${faltantes.value.length} criterio(s).`,
      tipo: 'advertencia',
      titulo: 'Evaluación incompleta',
    });
    irAPaso(i);
    return;
  }
  if (!yaGuardada.value) {
    const ok = await confirmar({
      mensaje: 'Después de enviar esta evaluación no podrás cambiarla. Solo administración podrá habilitar una reevaluación excepcional.',
      textoAceptar: 'Enviar evaluación',
      titulo: 'Confirmar evaluación definitiva',
    });
    if (!ok) return;
  }
  if (yaGuardada.value && h.total !== null && hayCambios.value) {
    const ok = await confirmar({
      mensaje: `Ya habías calificado a «${h.proyecto}» con ${formatearPuntos(h.total)} puntos. Se guardará ${formatearPuntos(total.value)} en su lugar.`,
      textoAceptar: 'Reemplazar',
      titulo: '¿Reemplazar tu calificación?',
    });
    if (!ok) return;
  }
  guardando.value = true;
  try {
    await evaluarCompleto({
      categoriaId: h.idCategoria,
      participanteId: h.idParticipante,
      rubricas: h.rubricas.map((r) => ({
        detalles: r.criterios.map((c) => ({ criterioId: c.idCriterio, puntaje: puntajes.value[c.idCriterio]! })),
        rubricaId: r.idRubrica,
      })),
    });
    escribirBorrador(null);
    original.value = firma(puntajes.value);
    borradorRecuperado.value = false;
    const [nuevaHoja, t] = await Promise.all([
      obtenerHojaEvaluacion(h.idCategoria, h.idParticipante).catch(() => null),
      obtenerTableroJurado().catch(() => null),
    ]);
    if (nuevaHoja) hoja.value = nuevaHoja;
    resultado.value = { siguiente: proximoPendiente(t), total: total.value };
  } catch {
    // El interceptor ya avisó (p. ej. puntaje fuera de rango o rúbrica cambiada).
  } finally {
    guardando.value = false;
  }
}

function abrir(idCat: number, p: ProyectoTablero) {
  resultado.value = null;
  router.push({ name: 'JuradoEvaluar', params: { categoriaId: idCat, participanteId: p.idParticipante } });
}

function volver() {
  resultado.value = null;
  router.push({ name: 'JuradoParticipantes' });
}

// ------------------------------------------------------------------ salir sin guardar

async function puedeSalir() {
  if (!hayCambios.value) return true;
  const ok = await confirmar({
    mensaje: 'Marcaste puntajes que no se enviaron. Si sales, se descartan.',
    peligro: true,
    textoAceptar: 'Salir sin guardar',
    textoCancelar: 'Seguir evaluando',
    titulo: '¿Salir sin guardar?',
  });
  if (ok) escribirBorrador(null);
  return ok;
}

onBeforeRouteLeave(puedeSalir);
onBeforeRouteUpdate(puedeSalir);

function alSalirDeLaPagina(e: BeforeUnloadEvent) {
  if (hayCambios.value) e.preventDefault();
}

function atajo(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    guardar();
  } else if (e.key === 'ArrowRight' && !resultado.value) {
    irAPaso(paso.value + 1);
  } else if (e.key === 'ArrowLeft' && !resultado.value) {
    irAPaso(paso.value - 1);
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', alSalirDeLaPagina);
  window.addEventListener('keydown', atajo);
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', alSalirDeLaPagina);
  window.removeEventListener('keydown', atajo);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="cargando && !hoja" class="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      <IconifyIcon class="size-8 animate-spin opacity-60" icon="lucide:loader-circle" />
      Cargando…
    </div>

    <div v-else-if="!hoja" class="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <IconifyIcon class="size-10 opacity-60" icon="lucide:file-x" />
      No se pudo abrir esta evaluación.
      <Button class="semfa-btn semfa-btn--neutro" size="large" @click="volver">Volver a la lista</Button>
    </div>

    <template v-else>
      <!-- Cabecera: participante, total y pasos -->
      <div class="shrink-0 border-b border-border bg-card px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pb-3">
        <div class="mx-auto flex w-full semfa-hoja-ancho items-center gap-3">
          <button
            class="semfa-hoja-icono"
            title="Volver a la lista"
            type="button"
            @click="router.push({ name: 'JuradoParticipantes' })"
          >
            <IconifyIcon class="size-5 sm:size-6" icon="lucide:arrow-left" />
          </button>
          <div class="min-w-0 flex-1 leading-tight">
            <div class="truncate text-base font-semibold sm:text-xl">{{ hoja.proyecto }}</div>
            <div class="semfa-hoja-sub truncate text-xs text-muted-foreground sm:text-sm">{{ [ubicacionFeria(hoja), hoja.institucion || hoja.categoria].filter(Boolean).join(' · ') }}</div>
          </div>
          <div class="shrink-0 text-right leading-none">
            <span
              :class="nivelTotal ? [nivelTotal.clase, 'semfa-nivel-texto'] : ''"
              class="text-3xl font-bold tabular-nums sm:text-4xl"
            >
              {{ formatearPuntos(total) }}
            </span>
            <span class="text-xs text-muted-foreground sm:text-sm">/{{ hoja.puntajeMaximo }}</span>
          </div>
        </div>

        <div v-if="bloqueada" class="mx-auto mt-2 w-full semfa-hoja-ancho rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Evaluación enviada. No puedes cambiarla salvo que administración habilite una reevaluación.
        </div>
        <div class="mx-auto mt-2 w-full semfa-hoja-ancho">
          <div class="flex gap-1.5">
            <button
              v-for="i in totalPasos"
              :key="i"
              :class="
                i - 1 === paso
                  ? 'bg-primary'
                  : i - 1 < rubricas.length && avance(i - 1).completa
                    ? 'bg-emerald-500'
                    : 'bg-muted'
              "
              :title="i - 1 < rubricas.length ? rubricas[i - 1]!.nombre : 'Resumen'"
              class="h-2 flex-1 rounded-full transition-colors"
              type="button"
              @click="irAPaso(i - 1)"
            ></button>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2 text-xs sm:text-sm">
            <span class="truncate">
              <span class="text-muted-foreground">Paso {{ paso + 1 }} de {{ totalPasos }} · </span>
              <strong>{{ rubricaActual?.nombre ?? 'Resumen' }}</strong>
            </span>
            <span v-if="rubricaActual" class="shrink-0 tabular-nums text-muted-foreground">
              {{ formatearPuntos(avance(paso).puntos) }} / {{ avance(paso).maximo }} pts
            </span>
          </div>
        </div>
      </div>

      <!-- Paso actual: llena el alto disponible (scroll solo si no cabe ni al mínimo) -->
      <div
        ref="scroller"
        :style="{ '--semfa-alto': altoBotones ? `${altoBotones}px` : undefined }"
        :class="{ 'semfa-hoja-bloqueada': bloqueada }"
        class="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        @touchend="alSoltar"
        @touchstart.passive="alTocar"
      >
        <Transition :name="direccion" mode="out-in" @after-enter="ajustarAlto">
          <div :key="paso" class="semfa-hoja-paso mx-auto flex h-full w-full semfa-hoja-ancho flex-col">
            <div
              v-if="borradorRecuperado"
              class="flex shrink-0 items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300"
            >
              <IconifyIcon class="size-4 shrink-0" icon="lucide:history" />
              <span class="flex-1">Recuperamos puntajes sin enviar de este dispositivo.</span>
              <button class="font-medium underline-offset-2 hover:underline" type="button" @click="descartarBorrador">
                Descartar
              </button>
            </div>

            <!-- Criterios de la rúbrica -->
            <template v-if="rubricaActual">
              <div
                v-for="c in rubricaActual.criterios"
                :key="c.idCriterio"
                :class="{ 'semfa-hoja-criterio--plegado': esPlegado(c) }"
                class="semfa-hoja-criterio semfa-hoja-criterio--fluido rounded-2xl"
              >
                <div
                  :class="{ 'cursor-pointer': modoDe(c) === 'nivelesRango' && esPlegado(c) }"
                  :role="modoDe(c) === 'nivelesRango' && esPlegado(c) ? 'button' : undefined"
                  :tabindex="modoDe(c) === 'nivelesRango' && esPlegado(c) ? 0 : undefined"
                  class="flex items-center gap-2"
                  @click="abrirCriterio(c)"
                  @keydown.enter="abrirCriterio(c)"
                >
                  <IconifyIcon
                    :class="puntajes[c.idCriterio] !== undefined ? 'text-emerald-500' : 'text-muted-foreground/40'"
                    :icon="puntajes[c.idCriterio] !== undefined ? 'lucide:circle-check' : 'lucide:circle'"
                    class="size-5 shrink-0"
                  />
                  <span
                    :class="{ truncate: esPlegado(c) }"
                    class="semfa-hoja-titulo min-w-0 flex-1 font-medium leading-snug"
                  >{{ c.nombre }}</span>
                  <span
                    v-if="etiquetaNivel(c)"
                    :class="etiquetaNivel(c)!.clase"
                    class="semfa-nivel-texto shrink-0 text-right text-xs sm:text-sm"
                  >
                    {{ etiquetaNivel(c)!.texto }}
                  </span>
                  <span v-else-if="esPlegado(c)" class="shrink-0 text-xs text-muted-foreground">Sin calificar</span>
                  <IconifyIcon v-if="esPlegado(c)" class="size-4 shrink-0 text-muted-foreground" icon="lucide:chevron-down" />
                </div>
                <!-- Qué observar: siempre visible (salvo en un criterio por rango plegado). -->
                <p v-if="c.descripcion && !esPlegado(c)" class="semfa-hoja-guia mb-0 pl-7 leading-snug text-muted-foreground">
                  {{ c.descripcion }}
                </p>
                <!-- Enteros cortos: una fila de botones -->
                <div
                  v-if="modoDe(c) === 'botones'"
                  :aria-label="c.nombre"
                  :class="{ 'semfa-puntajes--muchos': valoresDe(c).length > 5 }"
                  :style="{ '--semfa-cols': valoresDe(c).length }"
                  class="semfa-puntajes"
                  role="radiogroup"
                >
                  <button
                    v-for="v in valoresDe(c)"
                    :key="v"
                    :aria-checked="puntajes[c.idCriterio] === v"
                    :class="[nivelDe(v, c.maximo)?.clase, { 'is-activo': puntajes[c.idCriterio] === v }]"
                    class="semfa-puntaje semfa-puntaje--fluido"
                    role="radio"
                    type="button"
                    @click="elegir(c, v)"
                  >
                    {{ v }}
                  </button>
                </div>

                <!-- Niveles por rango (FEXCOIN): nivel y luego un número de su rango -->
                <SemfaNivelesRango
                  v-else-if="modoDe(c) === 'nivelesRango' && !esPlegado(c)"
                  :etiqueta="c.nombre"
                  :niveles="nivelesRangoDe(c)"
                  :valor="puntajes[c.idCriterio]"
                  @elegir="(v) => elegirRango(c, v)"
                  @layout="ajustarAlto"
                />

                <!-- Niveles con descripción (rúbricas tipo convocatoria) -->
                <div v-else-if="modoDe(c) === 'niveles'" :aria-label="c.nombre" class="semfa-niveles" role="radiogroup">
                  <button
                    v-for="n in c.niveles"
                    :key="n.puntos"
                    :aria-checked="nivelActivo(c)?.puntos === n.puntos"
                    :class="[
                      nivelDe(n.puntos, c.maximo)?.clase,
                      {
                        'is-activo': puntajes[c.idCriterio] === n.puntos,
                        'is-cerca': puntajes[c.idCriterio] !== n.puntos && nivelActivo(c)?.puntos === n.puntos,
                      },
                    ]"
                    class="semfa-nivel"
                    role="radio"
                    type="button"
                    @click="elegir(c, n.puntos, c.soloNiveles)"
                  >
                    <span class="semfa-nivel__puntos">{{ formatearPuntos(n.puntos) }}</span>
                    <span class="semfa-nivel__texto">{{ n.descripcion || `Nivel de ${formatearPuntos(n.puntos)} puntos` }}</span>
                  </button>
                </div>

                <!-- Afinar (niveles con intermedios) o rango largo / decimal -->
                <div
                  v-if="modoDe(c) === 'rango' || (modoDe(c) === 'niveles' && !c.soloNiveles)"
                  class="semfa-afinar"
                >
                  <button
                    :disabled="(puntajes[c.idCriterio] ?? c.minimo) <= c.minimo"
                    class="semfa-afinar__btn"
                    type="button"
                    @click="afinar(c, -1)"
                  >
                    − {{ formatearPuntos(c.paso) }}
                  </button>
                  <div class="min-w-0 flex-1 text-center">
                    <div
                      :class="nivelDe(puntajes[c.idCriterio], c.maximo)?.clase"
                      class="semfa-nivel-texto text-3xl font-bold tabular-nums"
                    >
                      {{ formatearPuntos(puntajes[c.idCriterio]) }}
                      <span class="text-sm font-normal text-muted-foreground">/ {{ formatearPuntos(c.maximo) }}</span>
                    </div>
                    <input
                      v-if="modoDe(c) === 'rango'"
                      :aria-label="c.nombre"
                      :max="c.maximo"
                      :min="c.minimo"
                      :step="c.paso"
                      :value="puntajes[c.idCriterio] ?? c.minimo"
                      class="semfa-afinar__rango"
                      type="range"
                      @input="alDeslizar(c, $event)"
                    />
                    <div v-else class="text-[11px] text-muted-foreground">
                      Afina de {{ formatearPuntos(c.paso) }} en {{ formatearPuntos(c.paso) }}
                    </div>
                    <div v-if="modoDe(c) === 'rango'" class="mt-1 flex justify-between gap-1">
                      <button
                        v-for="v in atajosDe(c)"
                        :key="v"
                        :class="puntajes[c.idCriterio] === v ? 'bg-primary text-primary-foreground' : 'bg-muted'"
                        class="min-w-0 flex-1 rounded-lg py-1.5 text-sm font-medium tabular-nums"
                        type="button"
                        @click="elegir(c, v, false)"
                      >
                        {{ formatearPuntos(v) }}
                      </button>
                    </div>
                  </div>
                  <button
                    :disabled="(puntajes[c.idCriterio] ?? c.minimo - c.paso) >= c.maximo"
                    class="semfa-afinar__btn"
                    type="button"
                    @click="afinar(c, 1)"
                  >
                    + {{ formatearPuntos(c.paso) }}
                  </button>
                </div>
              </div>
              <p v-if="leyendaClasica" class="semfa-hoja-leyenda mb-0 shrink-0 text-center text-[11px] text-muted-foreground sm:text-xs">
                1–4 Deficiente · 5–6 Regular · 7–8 Bueno · 9–10 Excelente
              </p>
            </template>

            <!-- Resumen -->
            <template v-else>
              <div class="semfa-hoja-criterio semfa-hoja-total flex shrink-0 flex-col items-center gap-1 rounded-2xl p-4 text-center sm:p-6">
                <span class="text-sm text-muted-foreground">Total</span>
                <div>
                  <span
                    :class="nivelTotal ? [nivelTotal.clase, 'semfa-nivel-texto'] : ''"
                    class="text-6xl font-bold tabular-nums sm:text-7xl"
                  >
                    {{ formatearPuntos(total) }}
                  </span>
                  <span class="text-lg text-muted-foreground"> / {{ hoja.puntajeMaximo }}</span>
                </div>
                <span v-if="nivelTotal" :class="nivelTotal.clase" class="semfa-nivel-texto text-base">
                  {{ nivelTotal.texto }}
                </span>
                <span v-if="yaGuardada && !hayCambios" class="mt-1 text-sm text-emerald-600">
                  Guardada {{ tiempoTranscurrido(hoja.actualizado) }}
                </span>
                <span v-else-if="yaGuardada" class="mt-1 text-sm text-amber-600">
                  Tenías {{ hoja.total }} · guarda para reemplazarla
                </span>
              </div>
              <button
                v-for="(r, i) in rubricas"
                :key="r.idRubrica"
                class="semfa-hoja-criterio semfa-hoja-fila-resumen flex shrink-0 flex-wrap items-center gap-x-3 rounded-2xl px-4 py-3 text-left sm:py-4"
                type="button"
                @click="irAPaso(i)"
              >
                <span
                  :class="avance(i).completa ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'"
                  class="flex size-9 shrink-0 items-center justify-center rounded-full"
                >
                  <IconifyIcon :icon="avance(i).completa ? 'lucide:check' : 'lucide:circle-alert'" class="size-5" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base font-medium">{{ r.nombre }}</span>
                  <span v-if="!avance(i).completa" class="block text-xs text-amber-600 sm:text-sm">
                    Faltan {{ avance(i).total - avance(i).hechos }} criterio(s)
                  </span>
                </span>
                <span class="shrink-0 text-base tabular-nums">
                  <strong>{{ formatearPuntos(avance(i).puntos) }}</strong>
                  <span class="text-muted-foreground"> / {{ avance(i).maximo }}</span>
                </span>
                <!-- Criterios por rango: qué nivel y qué puntaje se eligió en cada uno -->
                <span v-if="detalleRangos(r).length > 0" class="semfa-resumen-niveles mt-1.5 flex w-full basis-full flex-col">
                  <span v-for="d in detalleRangos(r)" :key="d.id" class="flex items-baseline justify-between gap-2">
                    <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ d.nombre }}</span>
                    <span :class="d.clase" class="semfa-nivel-texto shrink-0 tabular-nums">{{ d.texto ?? '—' }}</span>
                  </span>
                </span>
              </button>
            </template>
          </div>
        </Transition>
      </div>

      <!-- Pie: navegación y guardar -->
      <div class="shrink-0 border-t border-border bg-card px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:py-3">
        <div class="mx-auto flex w-full semfa-hoja-ancho gap-2 sm:gap-3">
          <Button
            :disabled="paso === 0"
            class="semfa-btn semfa-btn--neutro semfa-hoja-accion"
            size="large"
            @click="irAPaso(paso - 1)"
          >
            <IconifyIcon class="size-5" icon="lucide:chevron-left" />
            <span class="hidden sm:inline">Anterior</span>
          </Button>
          <Button
            v-if="!enResumen"
            :class="avance(paso).completa ? 'semfa-btn--primario' : 'semfa-btn--neutro'"
            class="semfa-btn semfa-hoja-accion flex-1"
            size="large"
            @click="irAPaso(paso + 1)"
          >
            {{ paso === rubricas.length - 1 ? 'Revisar' : 'Siguiente' }}
            <IconifyIcon class="size-5" icon="lucide:chevron-right" />
          </Button>
          <Button
            v-else
            :disabled="bloqueada || (yaGuardada && !hayCambios)"
            :loading="guardando"
            class="semfa-btn semfa-btn--primario semfa-hoja-accion flex-1"
            size="large"
            @click="guardar"
          >
            <IconifyIcon
              v-if="!guardando"
              :icon="faltantes.length > 0 ? 'lucide:list-checks' : 'lucide:save'"
              class="size-5"
            />
            {{
              faltantes.length > 0
                ? `Completar (faltan ${faltantes.length})`
                : yaGuardada
                  ? hayCambios
                    ? 'Guardar cambios'
                    : 'Guardada'
                  : 'Guardar evaluación'
            }}
          </Button>
        </div>
      </div>
    </template>

    <!-- Resultado del guardado -->
    <Modal :closable="false" :footer="null" :open="resultado !== null" :width="400" centered @cancel="resultado = null">
      <div v-if="resultado && hoja" class="flex flex-col items-center gap-2 py-2 text-center">
        <span class="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <IconifyIcon class="size-8" icon="lucide:check" />
        </span>
        <div class="text-lg font-semibold">¡Evaluación guardada!</div>
        <div class="text-sm text-muted-foreground">Ya no podrás cambiarla salvo autorización de administración.</div>
        <div class="text-sm text-muted-foreground">{{ hoja.proyecto }}</div>
        <div>
          <span :class="nivelDe(resultado.total, hoja.puntajeMaximo)?.clase" class="semfa-nivel-texto text-4xl tabular-nums">
            {{ formatearPuntos(resultado.total) }}
          </span>
          <span class="text-muted-foreground"> / {{ hoja.puntajeMaximo }}</span>
        </div>
        <div class="mt-2 flex w-full flex-col gap-2">
          <Button
            v-if="resultado.siguiente"
            class="semfa-btn semfa-btn--primario w-full"
            size="large"
            @click="abrir(resultado.siguiente.idCategoria, resultado.siguiente.proyecto)"
          >
            <span class="truncate">Siguiente: {{ resultado.siguiente.proyecto.nombre }}</span>
            <IconifyIcon class="size-4 shrink-0" icon="lucide:arrow-right" />
          </Button>
          <div v-else class="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            No te quedan participantes pendientes. ¡Gracias!
          </div>
          <Button class="semfa-btn semfa-btn--neutro w-full" size="large" @click="volver">Volver a la lista</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.semfa-hoja-bloqueada { pointer-events: none; opacity: .8; }
/* Criterio por rango plegado: una línea. */
.semfa-hoja-criterio--plegado {
  padding-block: clamp(4px, 0.9dvh, 10px);
}

.semfa-resumen-niveles {
  font-size: clamp(11px, 1.8dvh, 14px);
  line-height: 1.5;
}

/* Niveles con descripción: una fila por nivel, puntos a la izquierda. */
.semfa-niveles {
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 0.9dvh, 8px);
}

.semfa-nivel {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: clamp(42px, 6.5dvh, 64px);
  padding: 6px 12px;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--background));
  border: 1.5px solid hsl(var(--border));
  border-radius: 14px;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}

.semfa-nivel:active {
  transform: scale(0.99);
}

.semfa-nivel__puntos {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  height: 36px;
  padding: 0 6px;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: hsl(var(--muted));
  border-radius: 10px;
}

.semfa-nivel__texto {
  font-size: clamp(13px, min(1.9dvh, 3.6vw), 16px);
  line-height: 1.3;
}

.semfa-nivel.is-activo {
  background: hsl(var(--semfa-nivel, var(--primary)) / 10%);
  border-color: hsl(var(--semfa-nivel, var(--primary)));
}

.semfa-nivel.is-activo .semfa-nivel__puntos {
  color: #fff;
  background: hsl(var(--semfa-nivel, var(--primary)));
}

.semfa-nivel.is-activo .semfa-nivel__puntos,
.semfa-nivel.is-activo .semfa-nivel__texto {
  font-weight: 600;
}

.semfa-nivel.is-cerca {
  border-style: dashed;
  border-color: hsl(var(--semfa-nivel, var(--primary)));
}

/* Afinar: − valor + (y deslizador en rangos largos). */
.semfa-afinar {
  display: flex;
  gap: 10px;
  align-items: center;
}

.semfa-afinar__btn {
  flex-shrink: 0;
  min-width: 76px;
  height: 52px;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
}

.semfa-afinar__btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.semfa-afinar__rango {
  width: 100%;
  accent-color: hsl(var(--primary));
}

/* Ancho del contenido (cabecera, paso y pie alineados); crece en pantallas grandes. */
.semfa-hoja-ancho {
  max-width: 768px;
}

@media (min-width: 1280px) and (min-height: 860px) {
  .semfa-hoja-ancho {
    max-width: 960px;
  }

  .semfa-puntajes {
    --semfa-max: 92px !important;
  }

  .semfa-hoja-titulo {
    font-size: 21px !important;
  }

  .semfa-hoja-guia {
    font-size: 16px !important;
  }

  .semfa-puntaje--fluido {
    font-size: 28px !important;
  }
}

/*
 * La hoja se ajusta a la pantalla: el paso tiene el alto libre exacto y centra
 * los criterios. Cada fila de botones parte de 78px y se encoge (hasta 42px) si
 * no cabe; la letra se escala con el alto (dvh) y el ancho (vw). Solo si ni al
 * mínimo cabe aparece el scroll («safe» evita que se corte arriba).
 */
.semfa-hoja-paso {
  justify-content: center;
  justify-content: safe center;
  gap: clamp(6px, 1.4dvh, 14px);
  padding: clamp(8px, 2dvh, 24px) 12px;
}

@media (min-width: 640px) {
  .semfa-hoja-paso {
    padding-inline: 24px;
  }
}

.semfa-hoja-icono {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: hsl(var(--foreground));
  cursor: pointer;
  background: hsl(var(--muted));
  border-radius: 12px;
}

@media (min-width: 640px) {
  .semfa-hoja-icono {
    width: 46px;
    height: 46px;
  }
}

.semfa-hoja-icono:hover {
  color: hsl(var(--primary));
}

.semfa-hoja-criterio {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
}

button.semfa-hoja-criterio {
  cursor: pointer;
}

button.semfa-hoja-criterio:hover {
  border-color: hsl(var(--primary) / 40%);
}

/* Criterio: mide lo que su contenido (el alto de los botones lo fija `ajustarAlto`). */
.semfa-hoja-criterio--fluido {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: clamp(6px, 1.2dvh, 12px);
  padding: clamp(8px, 1.6dvh, 18px) clamp(10px, 3vw, 22px);
}

.semfa-hoja-titulo {
  font-size: clamp(14px, min(2.2dvh, 4vw), 19px);
}

/* Guía del criterio (su descripción), siempre visible bajo el título. */
.semfa-hoja-guia {
  margin-top: -2px;
  font-size: clamp(12px, min(2dvh, 3.4vw), 15px);
}

/*
 * Botones de puntaje: una fila (o 2 de 5 en celulares angostos). Su alto es el
 * que calcula `ajustarAlto` (`--semfa-alto`), acotado entre --semfa-min y --semfa-max.
 */
.semfa-puntajes {
  --semfa-min: 42px;
  --semfa-max: 78px;

  display: grid;
  flex: none;
  grid-template-columns: repeat(var(--semfa-cols), minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: clamp(4px, 1vw, 8px);
  height: clamp(var(--semfa-min), var(--semfa-alto, var(--semfa-max)), var(--semfa-max));
}

@media (max-width: 479px) {
  .semfa-puntajes--muchos {
    --semfa-min: 76px;
    --semfa-max: 150px;

    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

/* Pantallas bajas (celular chico o en horizontal): la leyenda sobra. */
@media (max-height: 639px) {
  .semfa-hoja-leyenda {
    display: none;
  }
}

/* Muy bajas (p. ej. 320×568): márgenes mínimos para que no haga falta scroll. */
@media (max-height: 599px) {
  .semfa-hoja-paso {
    gap: 4px;
    padding-block: 4px;
  }

  .semfa-hoja-criterio--fluido {
    gap: 4px;
    padding-block: 5px;
  }

  .semfa-hoja-guia {
    font-size: 11.5px;
    line-height: 1.3;
  }

  /* El colegio se ve en la lista; aquí el alto vale más. */
  .semfa-hoja-sub {
    display: none;
  }

  .ant-btn.semfa-hoja-accion {
    height: 40px;
  }

  .semfa-puntajes--muchos {
    --semfa-min: 62px;
  }

  .semfa-hoja-total {
    padding-block: 10px;
  }

  .semfa-hoja-total .text-6xl {
    font-size: 44px;
    line-height: 1;
  }

  .semfa-hoja-fila-resumen {
    padding-block: 8px;
  }
}

.semfa-puntaje--fluido {
  min-height: 0;
  height: 100%;
  font-size: clamp(15px, min(2.8dvh, 5vw), 26px);
  border-radius: clamp(8px, 1.2dvh, 14px);
}

/* Botones del pie más altos en pantallas grandes. */
.ant-btn.semfa-hoja-accion {
  height: clamp(44px, 6.5dvh, 56px);
  padding-inline: 18px;
  font-size: clamp(15px, 2dvh, 18px);
  border-radius: 12px;
}

/* Deslizamiento entre pasos. */
.paso-siguiente-enter-active,
.paso-siguiente-leave-active,
.paso-anterior-enter-active,
.paso-anterior-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.paso-siguiente-enter-from,
.paso-anterior-leave-to {
  opacity: 0;
  transform: translateX(40px);
}

.paso-siguiente-leave-to,
.paso-anterior-enter-from {
  opacity: 0;
  transform: translateX(-40px);
}

@media (prefers-reduced-motion: reduce) {
  .paso-siguiente-enter-active,
  .paso-siguiente-leave-active,
  .paso-anterior-enter-active,
  .paso-anterior-leave-active {
    transition: none;
  }
}
</style>
