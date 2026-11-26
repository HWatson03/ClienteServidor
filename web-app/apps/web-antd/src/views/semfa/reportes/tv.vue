<script lang="ts" setup>
import type { ResultadosPosicion, ResultadosPublicos } from '#/api/resultados';

import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { obtenerResultadosPublicos } from '#/api/resultados';

defineOptions({ name: 'SemfaResultadosTv' });

/**
 * Pantalla de transmisión (TV) con la estética de la feria: una categoría por
 * pantalla con podio (oro, plata, bronce) y la lista del 4.º en adelante.
 * Solo puesto, proyecto, carrera / sigla de facultad y puntaje final: nunca
 * notas por jurado, rúbrica ni criterio (`GET /api/resultados/{id}/publico`
 * ni siquiera las trae), para no exponer a los jurados ante participantes y
 * barras. El ranking de una categoría aparece cuando toda ella terminó de
 * evaluarse (antes solo se ve el avance «k de n»).
 *
 * Parámetros de URL: `actividad` (obligatorio), `categoria` (empieza en ella),
 * `pagina`, `modo=participante` (pantalla fija de un participante, con
 * `participante=idInscripcion`), `modo=ganadores` (una pantalla por carrera y
 * categoría con su 1.º, 2.º y 3.º lugar, revelados del tercero al primero) y `fijo=1` (modo captura: sin rotación,
 * animaciones ni controles, para capturas de pantalla).
 * Teclas: ← → cambiar, espacio pausar, F pantalla completa, C modo captura.
 */

const route = useRoute();
const router = useRouter();
const idActividad = computed<number | undefined>(() => {
  const q = Number(route.query.actividad);
  return Number.isFinite(q) && q > 0 ? q : undefined;
});

const datos = shallowRef<null | ResultadosPublicos>(null);
const error = ref(false);

async function cargar() {
  const id = idActividad.value;
  if (id === undefined) return;
  try {
    const nuevo = await obtenerResultadosPublicos(id);
    if (id === idActividad.value) {
      datos.value = nuevo;
      error.value = false;
    }
  } catch {
    error.value = true;
  }
}

watch(idActividad, () => cargar(), { immediate: true });
// El enlace público no necesita sesión; consulta cambios cada cinco segundos.
const respaldo = setInterval(cargar, 5_000);

// ------------------------------------------------------------------ ajustes (se recuerdan en este navegador)

interface Ajustes {
  filas: number;
  segundos: number;
  top: number;
}

const AJUSTES_POR_DEFECTO: Ajustes = { filas: 8, segundos: 12, top: 0 };

function leerAjustes(): Ajustes {
  try {
    const guardado = JSON.parse(localStorage.getItem('semfa-tv') ?? '{}');
    return {
      filas: Number(guardado.filas) || AJUSTES_POR_DEFECTO.filas,
      segundos: Number(guardado.segundos) || AJUSTES_POR_DEFECTO.segundos,
      top: Number(guardado.top) || 0,
    };
  } catch {
    return { ...AJUSTES_POR_DEFECTO };
  }
}

const ajustes = ref<Ajustes>(leerAjustes());
watch(
  ajustes,
  (v) => {
    try {
      localStorage.setItem('semfa-tv', JSON.stringify(v));
    } catch {
      // Sin almacenamiento: solo no se recuerda.
    }
  },
  { deep: true },
);

// ------------------------------------------------------------------ marca de la feria

const nombreActividad = computed(() => datos.value?.actividad.nombre ?? '');
/** «FEXCOIN ECUANA V5 - 1» → «FEXCOIN ECUANA · V5.0» (sin el sufijo de edición interna). */
const esFexcoin = computed(() => /fexcoin/i.test(nombreActividad.value));
const tituloFeria = computed(() => {
  const base = nombreActividad.value.replace(/\s+-\s+\d+\s*$/, '').trim();
  if (!esFexcoin.value) return { destacado: '', resto: base || 'Resultados' };
  const resto = base
    .replace(/fexcoin/i, '')
    .replace(/\bV\s*(\d+)(?:\.(\d+))?\b/i, (_, mayor: string, menor?: string) => `· V${mayor}.${menor ?? '0'}`)
    .replaceAll(/\s+/g, ' ')
    .trim();
  return { destacado: 'FEXCOIN', resto };
});
const LEMA = 'Nosotros: investigamos, innovamos y transformamos';
const ESCUDO = `${import.meta.env.BASE_URL}logo_uap_escudo.png`;

// ------------------------------------------------------------------ diapositivas

type Modo = 'ganadores' | 'participante' | 'ranking';
const MODOS: Modo[] = ['ganadores', 'participante', 'ranking'];
const modo = ref<Modo>(MODOS.includes(route.query.modo as Modo) ? (route.query.modo as Modo) : 'ranking');
const LUGARES = ['Primer lugar', 'Segundo lugar', 'Tercer lugar'];

type CategoriaPublica = ResultadosPublicos['categorias'][number];

interface Diapositiva {
  /** Modo ganadores: la carrera del grupo (el puesto se cuenta dentro de ella). */
  carrera: null | string;
  categoria: CategoriaPublica;
  /** Identifica la pantalla entre recargas. */
  clave: string;
  /** Ranking disponible: toda la categoría terminó de evaluarse. */
  disponible: boolean;
  /** Del 4.º en adelante, la página que toca. */
  lista: ResultadosPosicion[];
  pagina: number;
  paginas: number;
  podio: ResultadosPosicion[];
}

function rankingDisponible(c: CategoriaPublica) {
  return c.inscritos > 0 && c.enEvaluacion === 0 && c.posiciones.length > 0;
}

/**
 * Modo ganadores: una pantalla por carrera y categoría (carreras en orden
 * alfabético) con quienes tienen puesto 1 a 3. El servicio solo pone puesto
 * cuando todo el grupo terminó de evaluarse, así que los grupos aún en
 * evaluación no salen.
 */
function diapositivasGanadores(): Diapositiva[] {
  const grupos: Diapositiva[] = [];
  for (const c of datos.value?.categorias ?? []) {
    const porCarrera = new Map<string, ResultadosPosicion[]>();
    for (const p of c.posiciones) {
      if (p.puesto < 1 || p.puesto > 3) continue;
      const clave = p.carrera ?? '';
      porCarrera.set(clave, [...(porCarrera.get(clave) ?? []), p]);
    }
    for (const [carrera, ganadores] of porCarrera) {
      const orden = ganadores.toSorted((a, b) => a.puesto - b.puesto);
      grupos.push({
        carrera: carrera || null,
        categoria: c,
        clave: `${c.idCategoria}-${carrera}-1`,
        disponible: true,
        lista: orden.slice(3),
        pagina: 1,
        paginas: 1,
        podio: orden.slice(0, 3),
      });
    }
  }
  return grupos.sort((a, b) => (a.carrera ?? '').localeCompare(b.carrera ?? '', 'es')
    || a.categoria.nombre.localeCompare(b.categoria.nombre, 'es'));
}

const diapositivas = computed<Diapositiva[]>(() => {
  if (modo.value === 'ganadores') return diapositivasGanadores();
  const lista: Diapositiva[] = [];
  const { filas, top } = ajustes.value;
  for (const c of datos.value?.categorias ?? []) {
    if (!rankingDisponible(c)) {
      lista.push({
        carrera: null, categoria: c, clave: `${c.idCategoria}--1`, disponible: false, lista: [], pagina: 1, paginas: 1, podio: [],
      });
      continue;
    }
    const posiciones = top > 0 ? c.posiciones.filter((p) => p.puesto <= top) : c.posiciones;
    const podio = posiciones.slice(0, 3);
    const resto = posiciones.slice(3);
    const paginas = Math.max(1, Math.ceil(resto.length / filas));
    for (let i = 0; i < paginas; i++) {
      lista.push({
        carrera: null,
        categoria: c,
        clave: `${c.idCategoria}--${i + 1}`,
        disponible: true,
        lista: resto.slice(i * filas, (i + 1) * filas),
        pagina: i + 1,
        paginas,
        podio,
      });
    }
  }
  return lista;
});

const indice = ref(0);
const captura = ref(route.query.fijo === '1' || route.query.fijo === 'true');
const pausado = ref(captura.value);
const idParticipante = ref<number | undefined>(Number(route.query.participante) || undefined);
const actual = computed(() => diapositivas.value[Math.min(indice.value, diapositivas.value.length - 1)]);
const participantes = computed(() => actual.value?.categoria.posiciones ?? []);
const participante = computed(() => participantes.value.find((p) => p.idInscripcion === idParticipante.value)
  ?? participantes.value[0]);
watch(participantes, (lista) => {
  if (lista.length > 0 && !lista.some((p) => p.idInscripcion === idParticipante.value)) {
    idParticipante.value = lista[0]?.idInscripcion;
  }
});

/** Al recargar los datos se queda en la misma categoría y página. */
watch(diapositivas, (nuevas, anteriores) => {
  const antes = anteriores?.[indice.value];
  if (!antes) {
    const inicial = Number(route.query.categoria);
    const pagina = Number(route.query.pagina) || 1;
    const exacta = nuevas.findIndex((d) => d.categoria.idCategoria === inicial && d.pagina === pagina);
    const i = exacta === -1 ? nuevas.findIndex((d) => d.categoria.idCategoria === inicial) : exacta;
    indice.value = i === -1 ? 0 : i;
    return;
  }
  const i = nuevas.findIndex((d) => d.clave === antes.clave);
  const misma = nuevas.findIndex((d) => d.categoria.idCategoria === antes.categoria.idCategoria);
  indice.value = i !== -1 ? i : misma !== -1 ? misma : 0;
});

const progreso = ref(0);
let ultimoTic = Date.now();
const tic = setInterval(() => {
  const ahora = Date.now();
  if (modo.value !== 'participante' && !pausado.value && diapositivas.value.length > 1) {
    progreso.value += (ahora - ultimoTic) / (ajustes.value.segundos * 1000);
    if (progreso.value >= 1) mover(1);
  }
  ultimoTic = ahora;
}, 100);

function mover(paso: number) {
  const n = diapositivas.value.length;
  if (n === 0) return;
  indice.value = (indice.value + paso + n) % n;
  progreso.value = 0;
}

function irA(i: number) {
  if (i >= 0 && i < diapositivas.value.length) {
    indice.value = i;
    progreso.value = 0;
  }
}

function irACategoria(idCategoria: number) {
  const i = diapositivas.value.findIndex((d) => d.categoria.idCategoria === idCategoria);
  if (i !== -1) {
    indice.value = i;
    progreso.value = 0;
  }
}

/** Proyectos con evaluación completa sobre los inscritos de la categoría. */
const evaluados = computed(() => {
  const c = actual.value?.categoria;
  return c ? { hechos: c.inscritos - c.enEvaluacion, total: c.inscritos } : { hechos: 0, total: 0 };
});
const avance = computed(() => (evaluados.value.total > 0 ? (evaluados.value.hechos * 100) / evaluados.value.total : 0));

/**
 * Si todos los proyectos de la categoría son de la misma institución (en una
 * feria de la universidad lo normal), no se repite bajo cada nombre.
 */
const mismaInstitucion = computed(() => {
  const posiciones = actual.value?.categoria.posiciones ?? [];
  return posiciones.length > 1 && new Set(posiciones.map((p) => p.institucion ?? '')).size === 1;
});

/** Debajo del nombre: carrera · sigla de facultad, o la institución. */
function detalle(p: ResultadosPosicion) {
  // En ganadores la carrera ya es el título de la pantalla.
  if (modo.value === 'ganadores') return p.carrera ? '' : (mismaInstitucion.value ? '' : (p.institucion ?? ''));
  if (p.carrera) return p.siglaFacultad ? `${p.carrera} · ${p.siglaFacultad}` : p.carrera;
  if (p.siglaFacultad) return p.siglaFacultad;
  return mismaInstitucion.value ? '' : (p.institucion ?? '');
}

/** El podio se dibuja 2.º, 1.º, 3.º. */
const podioOrdenado = computed(() => {
  const [a, b, c] = actual.value?.podio ?? [];
  return [b, a, c].map((p, i) => ({ lugar: [2, 1, 3][i]!, p })).filter((x) => x.p);
});

function medalla(puesto: number) {
  return puesto === 1 ? 'oro' : puesto === 2 ? 'plata' : puesto === 3 ? 'bronce' : '';
}

/** Tamaño de letra de la lista según cuántas filas entran. */
const fuenteLista = computed(() => {
  const f = ajustes.value.filas;
  return f <= 6 ? 2.7 : f <= 8 ? 2.35 : f <= 10 ? 2.05 : 1.75;
});

function puntaje(v: number) {
  return v.toFixed(2);
}

function maximo(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// ------------------------------------------------------------------ controles

const controles = ref(!captura.value);
let ocultar: null | ReturnType<typeof setTimeout> = null;

function mostrarControles() {
  if (captura.value) return;
  controles.value = true;
  if (ocultar) clearTimeout(ocultar);
  ocultar = setTimeout(() => (controles.value = false), 3500);
}

function alternarCaptura() {
  captura.value = !captura.value;
  pausado.value = captura.value;
  progreso.value = 0;
  if (captura.value) controles.value = false;
  else mostrarControles();
}

const raiz = ref<HTMLElement>();
const completa = ref(false);

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else raiz.value?.requestFullscreen?.();
}

function alCambiarPantalla() {
  completa.value = !!document.fullscreenElement;
}

function alTeclear(e: KeyboardEvent) {
  if (e.target instanceof HTMLSelectElement) return;
  if (e.key === 'ArrowRight') mover(1);
  else if (e.key === 'ArrowLeft') mover(-1);
  else if (e.key === ' ') {
    e.preventDefault();
    if (!captura.value) pausado.value = !pausado.value;
  } else if (e.key === 'f' || e.key === 'F') pantallaCompleta();
  else if (e.key === 'c' || e.key === 'C') alternarCaptura();
  else if (e.key === 'Escape' && captura.value) alternarCaptura();
  else return;
  mostrarControles();
}

onMounted(() => {
  window.addEventListener('keydown', alTeclear);
  document.addEventListener('fullscreenchange', alCambiarPantalla);
  mostrarControles();
});

const hora = ref(new Date());
const reloj = setInterval(() => (hora.value = new Date()), 15_000);

onUnmounted(() => {
  window.removeEventListener('keydown', alTeclear);
  document.removeEventListener('fullscreenchange', alCambiarPantalla);
  clearInterval(tic);
  clearInterval(respaldo);
  clearInterval(reloj);
  if (ocultar) clearTimeout(ocultar);
});

function salir() {
  if (window.opener) window.close();
  else router.push({ name: 'SemfaReportes' });
}
</script>

<template>
  <div
    ref="raiz"
    :class="{ 'tv--captura': captura, 'tv--sin-cursor': !controles }"
    class="tv"
    @click="mostrarControles"
    @mousemove="mostrarControles"
  >
    <!-- Franjas del afiche (decorativas) -->
    <div aria-hidden="true" class="tv__franja tv__franja--arriba"><span></span><span></span></div>
    <div aria-hidden="true" class="tv__franja tv__franja--abajo"><span></span><span></span></div>

    <!-- Cabecera -->
    <header class="tv__cabecera">
      <img :src="ESCUDO" alt="Universidad Amazónica de Pando" class="tv__escudo" height="320" width="251" />
      <div class="tv__marca">
        <div class="tv__uap">Universidad Amazónica de Pando</div>
        <div class="tv__feria">
          <span v-if="tituloFeria.destacado" class="tv__destacado">
            <svg aria-hidden="true" class="tv__foco" viewBox="0 0 24 24">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
            </svg>
            {{ tituloFeria.destacado }}
          </span>
          <span class="tv__feria-resto">{{ tituloFeria.resto }}</span>
        </div>
        <div v-if="esFexcoin" class="tv__lema">{{ LEMA }}</div>
      </div>
      <div class="tv__lado">
        <div :class="datos?.oficial ? 'tv__sello--oficial' : ''" class="tv__sello">
          <span class="tv__sello-punto"></span>
          {{ datos?.oficial ? 'Resultados oficiales' : 'Resultados preliminares' }}
        </div>
        <div class="tv__hora">{{ hora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }}</div>
      </div>
    </header>

    <!-- Diapositiva -->
    <main class="tv__cuerpo">
      <Transition :name="captura ? 'tv-fijo' : 'tv-cambio'" mode="out-in">
        <section
          v-if="actual"
          :key="`${modo}-${actual.clave}`"
          :class="{ 'tv__diapo--ganadores': modo === 'ganadores' }"
          class="tv__diapo"
        >
          <div v-if="modo === 'ganadores'" class="tv__categoria">
            <div class="min-w-0">
              <div class="tv__categoria-etiqueta">{{ actual.carrera ? 'Ganadores · Carrera' : 'Ganadores' }}</div>
              <h1 class="tv__categoria-nombre">{{ actual.carrera ?? actual.categoria.nombre }}</h1>
              <div v-if="actual.carrera" class="tv__categoria-sub">Categoría <b>{{ actual.categoria.nombre }}</b></div>
            </div>
            <div class="tv__trofeo" aria-hidden="true">
              <IconifyIcon icon="lucide:trophy" />
            </div>
          </div>
          <div v-else class="tv__categoria">
            <div class="min-w-0">
              <div class="tv__categoria-etiqueta">Categoría</div>
              <h1 class="tv__categoria-nombre">{{ actual.categoria.nombre }}</h1>
            </div>
            <div class="tv__contador">
              <div class="tv__contador-cifra">
                <b>{{ evaluados.hechos }}</b> de {{ evaluados.total }}
              </div>
              <div class="tv__contador-texto">proyectos evaluados</div>
              <div class="tv__contador-barra"><span :style="{ width: `${avance}%` }"></span></div>
            </div>
          </div>

          <!-- Un participante fijo -->
          <div v-if="modo === 'participante'" class="tv__participante">
            <template v-if="participante">
              <div class="tv__participante-etiqueta">Puntaje final del proyecto</div>
              <div class="tv__participante-nombre">{{ participante.nombre }}</div>
              <div v-if="detalle(participante)" class="tv__participante-detalle">{{ detalle(participante) }}</div>
              <div class="tv__participante-puntaje">
                {{ puntaje(participante.puntaje) }}<span> / {{ maximo(actual.categoria.puntajeMaximo) }}</span>
              </div>
              <div class="tv__participante-etiqueta">Promedio de los jurados</div>
            </template>
            <div v-else class="tv__vacio">
              <IconifyIcon class="tv__vacio-icono" icon="lucide:hourglass" />
              Esperando un proyecto con evaluación completa
            </div>
          </div>

          <!-- Ranking: podio + lista -->
          <div
            v-else-if="actual.disponible"
            :class="{ 'tv__ranking--solo-podio': actual.lista.length === 0, 'tv__ranking--ganadores': modo === 'ganadores' }"
            class="tv__ranking"
          >
            <div class="tv__podio">
              <div
                v-for="(x, i) in podioOrdenado"
                :key="x.p!.idInscripcion"
                :class="[`tv__escalon--${x.lugar}`, `tv__escalon--${medalla(x.p!.puesto)}`]"
                :style="{ '--i': i, gridColumn: { 1: 2, 2: 1, 3: 3 }[x.lugar] }"
                class="tv__escalon"
              >
                <div class="tv__escalon-tarjeta">
                  <div class="tv__medalla">{{ x.p!.puesto }}°</div>
                  <div v-if="modo === 'ganadores'" class="tv__lugar">{{ LUGARES[x.p!.puesto - 1] }}</div>
                  <div class="tv__escalon-nombre">{{ x.p!.nombre }}</div>
                  <div v-if="detalle(x.p!)" class="tv__escalon-detalle">{{ detalle(x.p!) }}</div>
                  <div class="tv__escalon-puntaje">{{ puntaje(x.p!.puntaje) }}</div>
                </div>
                <div class="tv__pedestal"><span>{{ x.p!.puesto }}</span></div>
              </div>
            </div>

            <ol v-if="actual.lista.length > 0" :style="{ '--tv-fuente': fuenteLista, '--tv-filas': ajustes.filas }" class="tv__lista">
              <li v-for="(p, i) in actual.lista" :key="p.idInscripcion" :style="{ '--i': i }" class="tv__fila">
                <span class="tv__fila-puesto">{{ p.puesto }}°</span>
                <span class="tv__fila-texto">
                  <span class="tv__fila-nombre">{{ p.nombre }}</span>
                  <span v-if="detalle(p)" class="tv__fila-detalle">{{ detalle(p) }}</span>
                </span>
                <span class="tv__fila-puntaje">{{ puntaje(p.puntaje) }}</span>
              </li>
              <li v-if="actual.paginas > 1" class="tv__pagina">Página {{ actual.pagina }} de {{ actual.paginas }}</li>
            </ol>
          </div>

          <!-- Aún en evaluación -->
          <div v-else class="tv__vacio">
            <IconifyIcon class="tv__vacio-icono" icon="lucide:hourglass" />
            <div class="tv__vacio-titulo">Evaluación en curso</div>
            <div>El ranking se publicará cuando todos los proyectos de la categoría estén evaluados.</div>
          </div>

          <div v-if="modo === 'ganadores'" class="tv__nota">
            Lugares dentro de cada carrera y categoría · puntaje final sobre {{ maximo(actual.categoria.puntajeMaximo) }}
            <template v-if="!datos?.oficial"> · resultados preliminares</template>
          </div>
          <div v-else class="tv__nota">
            Puntaje final sobre {{ maximo(actual.categoria.puntajeMaximo) }} · promedio de los jurados
            <template v-if="!datos?.oficial"> · resultados preliminares</template>
          </div>
        </section>
        <section v-else class="tv__diapo">
          <div class="tv__vacio">
            <IconifyIcon :icon="error ? 'lucide:wifi-off' : 'lucide:hourglass'" class="tv__vacio-icono" />
            {{
              idActividad === undefined
                ? 'Falta indicar la actividad (?actividad=ID)'
                : error ? 'Sin conexión con el servidor'
                  : !datos ? 'Cargando resultados…'
                    : modo === 'ganadores' ? 'Aún no hay ganadores: se mostrarán cuando cada carrera y categoría termine de evaluarse'
                      : 'Aún no hay categorías para mostrar'
            }}
          </div>
        </section>
      </Transition>
    </main>

    <!-- Pie: avance de la rotación -->
    <footer v-if="!captura" class="tv__pie">
      <div class="tv__puntos">
        <span
          v-for="(d, i) in diapositivas"
          :key="d.clave"
          :class="{ 'is-activo': i === indice }"
        ></span>
      </div>
      <div class="tv__progreso"><span :style="{ width: `${Math.min(progreso, 1) * 100}%` }"></span></div>
    </footer>

    <!-- Controles (aparecen al mover el mouse; no salen en la transmisión si no se toca) -->
    <Transition name="tv-controles">
      <div v-show="controles && !captura" class="tv__controles" @click.stop>
        <select v-model="modo" title="Vista">
          <option value="ranking">Ranking por categoría</option>
          <option value="ganadores">Ganadores por carrera</option>
          <option value="participante">Un participante</option>
        </select>
        <select v-if="modo === 'participante'" v-model.number="idParticipante" title="Mostrar participante">
          <option v-for="p in participantes" :key="p.idInscripcion" :value="p.idInscripcion">{{ p.nombre }}</option>
        </select>
        <button title="Anterior (←)" type="button" @click="mover(-1)"><IconifyIcon icon="lucide:chevron-left" /></button>
        <button :title="pausado ? 'Reanudar (espacio)' : 'Pausar (espacio)'" type="button" @click="pausado = !pausado">
          <IconifyIcon :icon="pausado ? 'lucide:play' : 'lucide:pause'" />
        </button>
        <button title="Siguiente (→)" type="button" @click="mover(1)"><IconifyIcon icon="lucide:chevron-right" /></button>
        <select
          v-if="modo === 'ganadores'"
          :value="indice"
          title="Ir a la carrera y categoría"
          @change="irA(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="(d, i) in diapositivas" :key="d.clave" :value="i">
            {{ d.carrera ? `${d.carrera} · ${d.categoria.nombre}` : d.categoria.nombre }}
          </option>
        </select>
        <select
          v-else
          :value="actual?.categoria.idCategoria"
          title="Ir a la categoría"
          @change="irACategoria(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="c in datos?.categorias ?? []" :key="c.idCategoria" :value="c.idCategoria">{{ c.nombre }}</option>
        </select>
        <select v-model.number="ajustes.segundos" title="Tiempo por pantalla">
          <option v-for="s in [8, 12, 20, 30, 60]" :key="s" :value="s">{{ s }} s</option>
        </select>
        <select v-if="modo !== 'ganadores'" v-model.number="ajustes.filas" title="Filas de la lista (del 4.º en adelante)">
          <option v-for="f in [5, 6, 8, 10, 12]" :key="f" :value="f">{{ f }} filas</option>
        </select>
        <select v-if="modo !== 'ganadores'" v-model.number="ajustes.top" title="Cuántos puestos mostrar">
          <option :value="0">Todos</option>
          <option v-for="t in [3, 5, 10]" :key="t" :value="t">Top {{ t }}</option>
        </select>
        <button title="Modo captura: fija esta pantalla, sin animaciones ni controles (C; Esc para salir)" type="button" @click="alternarCaptura">
          <IconifyIcon icon="lucide:camera" />
        </button>
        <button :title="completa ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'" type="button" @click="pantallaCompleta">
          <IconifyIcon :icon="completa ? 'lucide:minimize' : 'lucide:maximize'" />
        </button>
        <button title="Cerrar" type="button" @click="salir"><IconifyIcon icon="lucide:x" /></button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/*
 * Todo se mide en `--u`: 1 % del alto en pantallas apaisadas (1920×1080 →
 * 10.8 px), limitado por el ancho si la pantalla es más cuadrada; en vertical
 * (celular) sale del ancho y la página se desplaza.
 */
.tv {
  --u: min(1vh, 0.5625vw);
  --rojo: #e11d2a;
  --azul: #1d3f9a;
  --azul-vivo: #1d4ed8;
  --amarillo: #facc15;
  --tinta: #0f1a3a;
  --suave: #5b6478;
  --papel: #f5f3ee;
  --linea: rgb(15 26 58 / 10%);
  --oro: #c9971c;
  --oro-claro: #f6d365;
  --plata: #8a94a6;
  --plata-claro: #e2e8f0;
  --bronce: #a8612a;
  --bronce-claro: #f0b27a;
  --condensada: 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', 'Liberation Sans Narrow', Impact, sans-serif;

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100dvh;
  padding: calc(var(--u) * 2.6) calc(var(--u) * 5) calc(var(--u) * 1.8);
  overflow: hidden;
  font-family: Inter, 'Segoe UI', system-ui, sans-serif;
  color: var(--tinta);
  background:
    radial-gradient(ellipse at 30% 0%, #fff 0%, transparent 55%),
    radial-gradient(ellipse at 100% 100%, rgb(29 63 154 / 6%) 0%, transparent 50%),
    repeating-linear-gradient(0deg, rgb(15 26 58 / 1.2%) 0 1px, transparent 1px 3px),
    var(--papel);
}

.tv--sin-cursor {
  cursor: none;
}

/* ---------------------------------------------------------------- franjas */
.tv__franja {
  position: absolute;
  z-index: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 0.8);
  width: calc(var(--u) * 60);
  pointer-events: none;
}

.tv__franja span {
  display: block;
  height: calc(var(--u) * 2.2);
}

.tv__franja span:first-child {
  background: var(--rojo);
}

.tv__franja span:last-child {
  background: var(--azul);
}

.tv__franja--arriba {
  top: calc(var(--u) * -1);
  right: calc(var(--u) * -26);
  transform: rotate(35deg);
}

.tv__franja--abajo {
  bottom: calc(var(--u) * -1);
  left: calc(var(--u) * -28);
  transform: rotate(35deg);
}

.tv__franja--abajo span:first-child {
  background: var(--azul);
}

.tv__franja--abajo span:last-child {
  background: var(--rojo);
}

.tv__cabecera,
.tv__cuerpo,
.tv__pie {
  position: relative;
  z-index: 1;
}

/* ---------------------------------------------------------------- cabecera */
.tv__cabecera {
  display: flex;
  gap: calc(var(--u) * 2.2);
  align-items: center;
  padding-bottom: calc(var(--u) * 1.6);
  border-bottom: calc(var(--u) * 0.35) solid var(--azul);
  box-shadow: 0 calc(var(--u) * 0.6) 0 calc(var(--u) * -0.1) var(--rojo);
}

.tv__escudo {
  width: auto;
  height: calc(var(--u) * 10.5);
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgb(0 0 0 / 15%));
}

.tv__marca {
  flex: 1;
  min-width: 0;
}

.tv__uap {
  font-size: calc(var(--u) * 1.7);
  font-weight: 700;
  color: var(--rojo);
  text-transform: uppercase;
  letter-spacing: 0.18em;
}

.tv__feria {
  display: flex;
  flex-wrap: wrap;
  gap: 0 calc(var(--u) * 1.4);
  align-items: center;
  font-family: var(--condensada);
  font-size: calc(var(--u) * 6);
  font-weight: 800;
  font-stretch: condensed;
  line-height: 1;
  color: var(--azul);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.tv__destacado {
  position: relative;
  display: inline-flex;
  gap: calc(var(--u) * 0.4);
  align-items: center;
  padding: 0 calc(var(--u) * 0.8) 0 calc(var(--u) * 0.2);
  color: var(--tinta);
  background: linear-gradient(180deg, transparent 55%, var(--amarillo) 55% 92%, transparent 92%);
}

.tv__foco {
  width: calc(var(--u) * 5);
  height: calc(var(--u) * 5);
  fill: var(--amarillo);
  stroke: var(--tinta);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 calc(var(--u) * 1.2) rgb(250 204 21 / 85%));
}

.tv__feria-resto {
  color: var(--rojo);
}

.tv__lema {
  margin-top: calc(var(--u) * 0.6);
  font-size: calc(var(--u) * 1.9);
  font-style: italic;
  font-weight: 500;
  color: var(--suave);
}

.tv__lado {
  display: flex;
  margin-right: calc(var(--u) * 3);
  flex-direction: column;
  gap: calc(var(--u) * 0.8);
  align-items: flex-end;
}

.tv__sello {
  display: inline-flex;
  gap: calc(var(--u) * 0.8);
  align-items: center;
  padding: calc(var(--u) * 0.7) calc(var(--u) * 1.8);
  font-size: calc(var(--u) * 1.6);
  font-weight: 700;
  color: #92400e;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
}

.tv__sello-punto {
  width: calc(var(--u) * 1);
  height: calc(var(--u) * 1);
  background: #f59e0b;
  border-radius: 50%;
  animation: tv-latido 1.6s ease-in-out infinite;
}

.tv__sello--oficial {
  color: #fff;
  background: var(--azul);
  border-color: var(--azul);
}

.tv__sello--oficial .tv__sello-punto {
  background: var(--amarillo);
  animation: none;
}

.tv__hora {
  font-family: var(--condensada);
  font-size: calc(var(--u) * 3.2);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--azul);
}

/* ---------------------------------------------------------------- cuerpo */
.tv__cuerpo {
  flex: 1;
  min-height: 0;
  padding-top: calc(var(--u) * 2);
}

.tv__diapo {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 1.8);
  height: 100%;
}

.tv__categoria {
  display: flex;
  gap: calc(var(--u) * 3);
  align-items: flex-end;
  justify-content: space-between;
}

.tv__categoria-etiqueta {
  display: inline-block;
  padding: calc(var(--u) * 0.2) calc(var(--u) * 1);
  font-size: calc(var(--u) * 1.5);
  font-weight: 800;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  background: var(--rojo);
}

.tv__categoria-nombre {
  margin: calc(var(--u) * 0.4) 0 0;
  overflow: hidden;
  font-family: var(--condensada);
  font-size: calc(var(--u) * 5.6);
  font-weight: 800;
  font-stretch: condensed;
  line-height: 1.02;
  color: var(--azul);
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.tv__contador {
  flex-shrink: 0;
  min-width: calc(var(--u) * 24);
  padding: calc(var(--u) * 1) calc(var(--u) * 1.8);
  text-align: right;
  background: #fff;
  border: 1px solid var(--linea);
  border-left: calc(var(--u) * 0.6) solid var(--amarillo);
  border-radius: calc(var(--u) * 1);
  box-shadow: 0 calc(var(--u) * 0.4) calc(var(--u) * 1.6) rgb(15 26 58 / 8%);
}

.tv__contador-cifra {
  font-family: var(--condensada);
  font-size: calc(var(--u) * 2.6);
  font-weight: 700;
  line-height: 1;
  color: var(--suave);
}

.tv__contador-cifra b {
  font-size: 1.6em;
  color: var(--azul);
}

.tv__contador-texto {
  font-size: calc(var(--u) * 1.4);
  font-weight: 600;
  color: var(--suave);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tv__contador-barra {
  height: calc(var(--u) * 0.7);
  margin-top: calc(var(--u) * 0.7);
  overflow: hidden;
  background: var(--linea);
  border-radius: 999px;
}

.tv__contador-barra span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--azul-vivo), var(--rojo));
  border-radius: inherit;
  transition: width 0.6s ease;
}

/* ---------------------------------------------------------------- ranking */
.tv__ranking {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: calc(var(--u) * 4);
  min-height: 0;
}

.tv__ranking--solo-podio {
  grid-template-columns: minmax(0, 1fr);
  padding: 0 12%;
}

.tv__podio {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(var(--u) * 1.6);
  align-items: end;
  min-height: 0;
}

.tv__escalon {
  --color: var(--plata);
  --claro: var(--plata-claro);

  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 0;
  height: 100%;
  animation: tv-sube 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  animation-delay: calc((2 - var(--i)) * 0.18s + 0.1s);
}

.tv__escalon--oro {
  --color: var(--oro);
  --claro: var(--oro-claro);
}

.tv__escalon--bronce {
  --color: var(--bronce);
  --claro: var(--bronce-claro);
}

.tv__escalon--1 {
  animation-delay: 0.6s;
}

.tv__escalon-tarjeta {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 0.7);
  align-items: center;
  min-height: 0;
  padding: calc(var(--u) * 4.4) calc(var(--u) * 1.4) calc(var(--u) * 1.6);
  margin-top: calc(var(--u) * 3.6);
  text-align: center;
  background: #fff;
  border: 1px solid var(--linea);
  border-top: calc(var(--u) * 0.6) solid var(--color);
  border-radius: calc(var(--u) * 1.2) calc(var(--u) * 1.2) 0 0;
  box-shadow: 0 calc(var(--u) * 0.6) calc(var(--u) * 2.4) rgb(15 26 58 / 10%);
}

.tv__medalla {
  position: absolute;
  top: calc(var(--u) * -3.6);
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 7);
  height: calc(var(--u) * 7);
  font-family: var(--condensada);
  font-size: calc(var(--u) * 3.4);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  background: radial-gradient(circle at 35% 30%, var(--claro), var(--color) 70%);
  border: calc(var(--u) * 0.45) solid #fff;
  border-radius: 50%;
  box-shadow: 0 calc(var(--u) * 0.4) calc(var(--u) * 1.2) rgb(0 0 0 / 22%);
}

.tv__escalon--1 .tv__medalla {
  width: calc(var(--u) * 8.4);
  height: calc(var(--u) * 8.4);
  font-size: calc(var(--u) * 4.2);
  box-shadow: 0 0 0 calc(var(--u) * 0.8) rgb(250 204 21 / 35%), 0 calc(var(--u) * 0.4) calc(var(--u) * 1.6) rgb(0 0 0 / 25%);
}

.tv__escalon-nombre {
  display: -webkit-box;
  overflow: hidden;
  font-size: calc(var(--u) * 2.6);
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

.tv__escalon--1 .tv__escalon-nombre {
  font-size: calc(var(--u) * 3);
}

.tv__escalon-detalle {
  display: -webkit-box;
  overflow: hidden;
  font-size: calc(var(--u) * 1.5);
  font-weight: 600;
  line-height: 1.2;
  color: var(--suave);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tv__escalon-puntaje {
  font-family: var(--condensada);
  font-size: calc(var(--u) * 5);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--azul);
}

.tv__escalon--1 .tv__escalon-puntaje {
  font-size: calc(var(--u) * 6.2);
  color: var(--rojo);
}

.tv__pedestal {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: center;
  height: calc(var(--u) * 13);
  padding-top: calc(var(--u) * 0.8);
  background: linear-gradient(180deg, var(--claro), var(--color));
  border-radius: 0 0 calc(var(--u) * 0.6) calc(var(--u) * 0.6);
  box-shadow: inset 0 calc(var(--u) * 0.4) 0 rgb(255 255 255 / 45%);
}

.tv__pedestal span {
  font-family: var(--condensada);
  font-size: calc(var(--u) * 6);
  font-weight: 800;
  line-height: 1;
  color: rgb(255 255 255 / 85%);
  text-shadow: 0 2px 4px rgb(0 0 0 / 20%);
}

.tv__escalon--1 .tv__pedestal {
  height: calc(var(--u) * 20);
}

.tv__escalon--3 .tv__pedestal {
  height: calc(var(--u) * 8);
}

.tv__escalon--3 .tv__pedestal span {
  font-size: calc(var(--u) * 4);
}

/* ---------------------------------------------------------------- ganadores */
.tv__categoria-sub {
  margin-top: calc(var(--u) * 0.4);
  font-size: calc(var(--u) * 2.2);
  font-weight: 600;
  color: var(--suave);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.tv__categoria-sub b {
  color: var(--rojo);
}

.tv__trofeo {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: calc(var(--u) * 11);
  height: calc(var(--u) * 11);
  font-size: calc(var(--u) * 6);
  color: var(--oro);
  background: radial-gradient(circle at 35% 30%, #fff, var(--oro-claro) 80%);
  border: calc(var(--u) * 0.4) solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 calc(var(--u) * 0.6) rgb(201 151 28 / 25%), 0 calc(var(--u) * 0.6) calc(var(--u) * 2) rgb(15 26 58 / 12%);
  animation: tv-trofeo 2.4s ease-in-out infinite;
}

.tv__ranking--ganadores.tv__ranking--solo-podio {
  padding: 0 6%;
}

.tv__lugar {
  font-size: calc(var(--u) * 1.6);
  font-weight: 800;
  color: var(--color);
  text-transform: uppercase;
  letter-spacing: 0.22em;
}

/* Suspenso: aparece el tercero, luego el segundo y al final el primero. */
.tv__ranking--ganadores .tv__escalon--3 {
  animation-delay: 0.3s;
}

.tv__ranking--ganadores .tv__escalon--2 {
  animation-delay: 1.3s;
}

.tv__ranking--ganadores .tv__escalon--1 {
  animation-duration: 0.9s;
  animation-delay: 2.4s;
}

.tv__ranking--ganadores .tv__escalon--oro .tv__escalon-tarjeta {
  overflow: visible;
  animation: tv-brillo 2.2s ease-in-out 3.4s infinite;
}

.tv__ranking--ganadores .tv__escalon--oro .tv__escalon-tarjeta::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background: linear-gradient(115deg, transparent 30%, rgb(255 255 255 / 75%) 50%, transparent 70%) no-repeat;
  background-size: 250% 100%;
  border-radius: inherit;
  animation: tv-destello 3s ease-in-out 3.2s infinite;
  background-position: 150% 0;
}

@keyframes tv-trofeo {
  0%, 100% { transform: rotate(-6deg) scale(1); }
  50% { transform: rotate(6deg) scale(1.06); }
}

@keyframes tv-brillo {
  0%, 100% { box-shadow: 0 calc(var(--u) * 0.6) calc(var(--u) * 2.4) rgb(15 26 58 / 10%); }
  50% { box-shadow: 0 0 calc(var(--u) * 4) rgb(246 211 101 / 85%), 0 calc(var(--u) * 0.6) calc(var(--u) * 2.4) rgb(15 26 58 / 10%); }
}

@keyframes tv-destello {
  0% { background-position: 150% 0; }
  45%, 100% { background-position: -60% 0; }
}

/* ---------------------------------------------------------------- lista 4.º+ */
.tv__lista {
  display: flex;
  flex-direction: column;
  gap: calc(var(--u) * 0.8);
  min-height: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}

.tv__fila {
  display: grid;
  flex: 0 1 calc((100% - var(--tv-filas) * var(--u) * 0.8) / var(--tv-filas));
  grid-template-columns: calc(var(--u) * 6.5) minmax(0, 1fr) auto;
  gap: calc(var(--u) * 1.6);
  align-items: center;
  min-height: 0;
  max-height: calc(var(--u) * 10);
  padding: 0 calc(var(--u) * 1.8) 0 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--linea);
  border-radius: calc(var(--u) * 0.8);
  box-shadow: 0 calc(var(--u) * 0.2) calc(var(--u) * 0.8) rgb(15 26 58 / 6%);
  animation: tv-entra 0.45s ease both;
  animation-delay: calc(var(--i) * 0.05s + 0.3s);
}

.tv__fila-puesto {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-family: var(--condensada);
  font-size: calc(var(--u) * var(--tv-fuente) * 1.35);
  font-weight: 800;
  color: #fff;
  background: var(--azul);
}

.tv__fila:nth-child(even) .tv__fila-puesto {
  background: var(--azul-vivo);
}

.tv__fila-texto {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tv__fila-nombre {
  display: -webkit-box;
  overflow: hidden;
  font-size: calc(var(--u) * var(--tv-fuente));
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tv__fila-detalle {
  overflow: hidden;
  font-size: calc(var(--u) * var(--tv-fuente) * 0.66);
  font-weight: 600;
  color: var(--suave);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tv__fila-puntaje {
  font-family: var(--condensada);
  font-size: calc(var(--u) * var(--tv-fuente) * 1.45);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--azul);
}

.tv__pagina {
  margin-top: auto;
  font-size: calc(var(--u) * 1.4);
  font-weight: 600;
  color: var(--suave);
  text-align: right;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* ---------------------------------------------------------------- participante y vacío */
.tv__participante {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: calc(var(--u) * 1.8);
  align-items: center;
  justify-content: center;
  min-height: 0;
  text-align: center;
}

.tv__participante-etiqueta {
  font-size: calc(var(--u) * 2.2);
  font-weight: 700;
  color: var(--rojo);
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.tv__participante-nombre {
  max-width: 85%;
  font-size: calc(var(--u) * 6.4);
  font-weight: 800;
  line-height: 1.08;
}

.tv__participante-detalle {
  font-size: calc(var(--u) * 2.8);
  font-weight: 600;
  color: var(--suave);
}

.tv__participante-puntaje {
  font-family: var(--condensada);
  font-size: calc(var(--u) * 18);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--azul);
}

.tv__participante-puntaje span {
  font-size: 0.3em;
  font-weight: 600;
  color: var(--suave);
}

.tv__vacio {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: calc(var(--u) * 1.6);
  align-items: center;
  justify-content: center;
  font-size: calc(var(--u) * 2.4);
  color: var(--suave);
  text-align: center;
}

.tv__vacio-icono {
  width: calc(var(--u) * 9);
  height: calc(var(--u) * 9);
  color: var(--azul);
  opacity: 0.55;
}

.tv__vacio-titulo {
  font-family: var(--condensada);
  font-size: calc(var(--u) * 6);
  font-weight: 800;
  color: var(--azul);
  text-transform: uppercase;
}

.tv__nota {
  font-size: calc(var(--u) * 1.45);
  color: var(--suave);
  text-align: center;
}

/* ---------------------------------------------------------------- pie */
.tv__pie {
  display: flex;
  gap: calc(var(--u) * 2);
  align-items: center;
  padding-top: calc(var(--u) * 1);
}

.tv__puntos {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 0.6);
}

.tv__puntos span {
  width: calc(var(--u) * 0.9);
  height: calc(var(--u) * 0.9);
  background: var(--linea);
  border-radius: 999px;
  transition: all 0.3s;
}

.tv__puntos span.is-activo {
  width: calc(var(--u) * 2.6);
  background: var(--rojo);
}

.tv__progreso {
  flex: 1;
  height: calc(var(--u) * 0.4);
  overflow: hidden;
  background: var(--linea);
  border-radius: 999px;
}

.tv__progreso span {
  display: block;
  height: 100%;
  background: var(--azul);
}

/* ---------------------------------------------------------------- controles */
.tv__controles {
  position: absolute;
  bottom: calc(var(--u) * 4);
  left: 50%;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: center;
  max-width: calc(100vw - 24px);
  padding: 8px 10px;
  background: rgb(255 255 255 / 94%);
  border: 1px solid var(--linea);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgb(15 26 58 / 18%);
  transform: translateX(-50%);
  backdrop-filter: blur(6px);
}

.tv__controles button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 18px;
  color: var(--azul);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

.tv__controles button:hover {
  background: rgb(29 63 154 / 10%);
}

.tv__controles select {
  max-width: 220px;
  height: 32px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--tinta);
  background: #fff;
  border: 1px solid var(--linea);
  border-radius: 8px;
}

/* ---------------------------------------------------------------- animaciones */
.tv-cambio-enter-active,
.tv-cambio-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.tv-cambio-enter-from {
  opacity: 0;
  transform: translateX(calc(var(--u) * 4));
}

.tv-cambio-leave-to {
  opacity: 0;
  transform: translateX(calc(var(--u) * -4));
}

.tv-controles-enter-active,
.tv-controles-leave-active {
  transition: opacity 0.25s ease;
}

.tv-controles-enter-from,
.tv-controles-leave-to {
  opacity: 0;
}

@keyframes tv-sube {
  from {
    opacity: 0;
    transform: translateY(calc(var(--u) * 8));
  }
}

@keyframes tv-entra {
  from {
    opacity: 0;
    transform: translateX(calc(var(--u) * 3));
  }
}

@keyframes tv-latido {
  50% {
    opacity: 0.35;
  }
}

/* Modo captura: nada se mueve ni aparece encima. */
.tv--captura *,
.tv--captura *::before,
.tv--captura *::after {
  animation: none !important;
  transition: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .tv *,
  .tv *::before,
  .tv *::after {
    animation: none !important;
    transition: none !important;
  }
}

/* ---------------------------------------------------------------- vertical (celular) */
@media (orientation: portrait) {
  .tv {
    --u: 1.55vw;

    height: auto;
    min-height: 100dvh;
    padding: calc(var(--u) * 3) calc(var(--u) * 3.5) calc(var(--u) * 3);
  }

  .tv__cabecera {
    flex-wrap: wrap;
  }

  .tv__escudo {
    height: calc(var(--u) * 13);
  }

  .tv__feria {
    font-size: calc(var(--u) * 6.4);
  }

  .tv__lado {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .tv__categoria {
    flex-direction: column;
    align-items: stretch;
  }

  .tv__categoria-nombre {
    white-space: normal;
  }

  .tv__contador {
    text-align: left;
  }

  .tv__ranking,
  .tv__ranking--solo-podio {
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
  }

  .tv__podio {
    gap: calc(var(--u) * 1.2);
  }

  .tv__escalon-tarjeta {
    padding-right: calc(var(--u) * 0.8);
    padding-left: calc(var(--u) * 0.8);
  }

  .tv__escalon-nombre {
    font-size: calc(var(--u) * 2);
  }

  .tv__escalon--1 .tv__escalon-nombre {
    font-size: calc(var(--u) * 2.3);
  }

  .tv__escalon-puntaje {
    font-size: calc(var(--u) * 4);
  }

  .tv__escalon--1 .tv__escalon-puntaje {
    font-size: calc(var(--u) * 4.8);
  }

  .tv__lista {
    --tv-fuente: 3 !important;
  }

  .tv__fila {
    flex: none;
    min-height: calc(var(--u) * 8);
    max-height: none;
    padding: calc(var(--u) * 0.6) calc(var(--u) * 1.8) calc(var(--u) * 0.6) 0;
  }

  .tv__fila-puesto {
    align-self: stretch;
    height: auto;
    margin: calc(var(--u) * -0.6) 0;
  }

  .tv__franja {
    width: calc(var(--u) * 40);
  }
}
</style>
