<script setup lang="ts">
/**
 * Mapa público de la feria `/fexcoin-vivo/mapa` (Vista 2): plano nocturno a pantalla completa con
 * los stands y su estado de evaluación. Sin sesión; `?actividad=ID` opcional (si no, el backend
 * elige el mapa publicado más reciente) y `?stand=<idInscripcion>` para abrir con ese stand
 * elegido (así llega desde «Ver ubicación» de la portada). Nunca muestra puntajes.
 *
 * Pensada para cientos de celulares con la red saturada:
 * - La última foto se guarda en `localStorage` (la misma que deja la portada) y se pinta al
 *   instante al reabrir, aun sin red.
 * - Tiempo real por SSE (`estados`, objeto mínimo); si el stream calla, GET de estados cada 15 s
 *   con ETag (304 sin cuerpo). Reintentos con espera exponencial y tope, con algo de azar para que
 *   no reconecten todos a la vez. Con la pestaña oculta se cierra el stream.
 * - Leaflet con renderer canvas (un solo lienzo para 400 stands); números y pines en otros dos
 *   canvas. Una actualización de estado solo cambia el estilo de los stands que cambiaron.
 * - Teselas desde el proxy con caché de SEMFA (zoom 15–19; el 20 solo amplía la del 19), con la
 *   cartografía oscurecida por un filtro CSS (no se bajan teselas extra).
 * - Service worker con alcance `/fexcoin-vivo` (`registrarServiceWorkerFeria`).
 *
 * Estilo sobrio (azul marino, rojo UAP en acentos, bordes finos, sin halos): stands de color sólido
 * con borde fino; el elegido lleva un anillo rojo con un arco azul. «Iniciar ruta» usa el GPS del
 * teléfono (solo al pulsarlo).
 *
 * Idiomas (español, inglés, portugués): `i18n.ts`; la elección viaja con `?lang=` entre portada y mapa.
 */
import type { EstadosFeria, EstadoStand, FeriaPublica, ResumenFeria, StandPublico, ZonaFeria } from '#/api/feria-publico';
import type { EtiquetaMapa } from '#/components/semfa/mapa-stands';

import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { obtenerEstadosFeria, obtenerFeriaPublica, registrarServiceWorkerFeria, registrarVisitaFeria, URL_TESELAS_FERIA, urlStreamFeria } from '#/api/feria-publico';
import { ATRIBUCION_OSM } from '#/components/semfa/capa-cartografia';
import { CapaEtiquetas, esquinasRect } from '#/components/semfa/mapa-stands';
import { idVisitante } from '#/components/semfa/visitante';
import { normalizarTexto } from '#/utils/formato';

import { CapaPines } from './capa-pines';
import { CapaTeselasFeria } from './capa-teselas';
import { nombreCategoria as categoriaEnIdioma, idioma, numero, sincronizarIdioma, t } from './i18n';
import { LienzoNeon, type OpcionesNeon } from './lienzo-neon';
import MarcaFeria from './partes/marca-feria.vue';
import SelectorIdioma from './partes/selector-idioma.vue';
import VisorVideo from './partes/visor-video.vue';
import { horaInicio, normalizarPortada, pastillaFeria, rangoDias, traducirPortada } from './portada';
import { actividadPedida, CLAVE_VISITANTE, claveFoto, guardarFoto, leerFotoGuardada, rutaPortada, textoJornada as jornadaDe } from './publico-comun';
import { distanciaM, textoCaminata, urlGoogleMaps } from './ruta';

defineOptions({ name: 'SemfaFeriaMapa' });

/** Respaldo por GET cuando el stream no entrega nada. */
const RESPALDO_MS = 15_000;
/** El servidor reenvía los estados cada 20 s: más silencio = stream caído. */
const SILENCIO_MAX_MS = 35_000;
const ESPERA_MAX_MS = 120_000;
/** Con la pestaña oculta tanto tiempo se cierra el stream (libera una conexión del servidor). */
const CERRAR_OCULTA_MS = 45_000;
const CENTRO_DEFECTO: L.LatLngTuple = [-11.0184, -68.7541];
/** Zoom de las teselas (el proxy solo sirve 15–19) y zoom máximo de la vista (amplía la del 19). */
const ZOOM_MIN = 15;
const ZOOM_TESELAS = 19;
const ZOOM_MAX = 20;
/** Hasta este ancho la ficha va abajo (hoja) y los controles se compactan. */
const ANCHO_CELULAR = 700;
const MAX_RESULTADOS = 8;
/** Colores sólidos por estado: azul pendiente, ámbar en evaluación, rojo UAP evaluado. */
const COLOR_ESTADO: Record<EstadoStand, string> = { E: '#c8102e', N: '#2c56c9', P: '#c98a12' };

const route = useRoute();
const router = useRouter();
const idPedido = actividadPedida(route.query);
const CLAVE_FOTO = claveFoto(idPedido);
/** Stand pedido por la URL: se elige y se vuela hasta él en cuanto haya datos. */
let standPedido: null | number = Number(route.query.stand) > 0 ? Number(route.query.stand) : null;

const foto = shallowRef<FeriaPublica | null>(null);
/** Sube cada vez que cambia algún estado (los stands se mutan en sitio). */
const version = ref(0);
const resumen = ref<null | ResumenFeria>(null);
const visitas = ref<null | number>(null);
const cargando = ref(true);
const sinConexion = ref(false);
const ultimaRed = ref<null | number>(null);
const reloj = ref(Date.now());
const seleccionId = ref<null | number>(null);
const filtroCategorias = ref<number[]>([]);
const filtroJornada = ref<null | number>(null);
const busqueda = ref('');
const buscadorAbierto = ref(false);
const tvuAbierta = ref(false);
const pantallaCompleta = ref(false);
const raiz = ref<HTMLElement>();
const mapaElemento = ref<HTMLDivElement>();
const fichaTitulo = ref<HTMLElement>();
const entradaBusqueda = ref<HTMLInputElement>();
const esCelular = ref(window.innerWidth <= ANCHO_CELULAR);
/** Ruta a pie hasta el stand elegido (textos por clave: se ven en el idioma vigente). */
const ruta = ref<{ activa: boolean; error: '' | 'No se pudo obtener su ubicación: use Google Maps.' | 'Este teléfono no da su ubicación: use Google Maps.' | 'Sin permiso de ubicación: use Google Maps.'; metros: null | number }>({ activa: false, error: '', metros: null });
const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const puedePantallaCompleta = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

let mapa: L.Map | undefined;
let lienzo: L.Canvas | undefined;
let vectorial: L.SVG | undefined;
let capaStands: L.LayerGroup | undefined;
let capaZonas: L.LayerGroup | undefined;
let capaEfectos: L.LayerGroup | undefined;
let etiquetas: CapaEtiquetas | undefined;
let pines: CapaPines | undefined;
let resaltado: L.Polygon | undefined;
let marcaElegido: L.Marker | undefined;
let miPunto: L.Marker | undefined;
let lineaRuta: L.Polyline | undefined;
let vigilancia: null | number = null;
let rutaEncuadrada = false;
const poligonos = new Map<number, L.Polygon>();
/** Ondas (marcadores DOM con animación CSS) de los stands en evaluación: siempre son pocos. */
const latidos = new Map<number, L.Marker>();
let porId = new Map<number, StandPublico>();
let firmaGeometria = '';
let vistaAplicada = false;
let espectadorMovio = false;

let etagFoto: null | string = null;
let etagEstados: null | string = null;
let stream: EventSource | undefined;
let ultimoMensaje = 0;
let fallosStream = 0;
let fallosRespaldo = 0;
let fallosFoto = 0;
let cargandoFoto = false;
let visitaRegistrada = false;
let ocultaDesde = 0;
let tStream: ReturnType<typeof setTimeout> | undefined;
let tRespaldo: ReturnType<typeof setTimeout> | undefined;
let tFoto: ReturnType<typeof setTimeout> | undefined;
let tMapa: ReturnType<typeof setTimeout> | undefined;
let tOculta: ReturnType<typeof setTimeout> | undefined;
let tGuardar: ReturnType<typeof setTimeout> | undefined;
let tReloj: ReturnType<typeof setInterval> | undefined;
let observador: ResizeObserver | undefined;

// ------------------------------------------------------------------ datos derivados

const categorias = computed(() => foto.value?.categorias ?? []);
const colorDe = computed(() => new Map(categorias.value.map((c) => [c.id, c.color])));
const nombreCategoria = computed(() => new Map(categorias.value.map((c) => [c.id, c.nombre])));
const jornadas = computed(() => {
  const f = foto.value;
  if (!f) return [];
  const max = Math.max(f.actividad.jornadas || 1, ...f.stands.map((s) => s.jornada ?? 1));
  return max > 1 ? Array.from({ length: max }, (_, i) => i + 1) : [];
});
const portadaEs = computed(() => normalizarPortada(foto.value?.mapa.portada));
const portada = computed(() => traducirPortada(portadaEs.value, idioma.value));
/**
 * Mapa aún no habilitado por el administrador («Portada» → Botones y mapa): se muestra un aviso
 * en lugar del mapa. `?previa=1` lo deja ver igual (para revisar antes de habilitarlo).
 */
const mapaBloqueado = computed(() => Boolean(foto.value) && !portadaEs.value.mapa.publicar && route.query.previa !== '1');
const pastilla = computed(() => pastillaFeria(portadaEs.value, reloj.value));
const fechaCorta = computed(() => `${rangoDias(portada.value)} · ${horaInicio(portada.value)}`);
const urlFacebook = computed(() => foto.value?.mapa.urlFacebook || null);
const urlTvu = computed(() => foto.value?.mapa.urlTransmision || null);
const nombre = computed(() => foto.value?.actividad.nombre || 'FEXCOIN ECUANA V5');
const visitasTexto = computed(() => (visitas.value === null ? '' : t('{n} visitante|{n} visitantes', { n: visitas.value }).replace(String(visitas.value), numero(visitas.value))));
const hayFiltros = computed(() => filtroCategorias.value.length > 0 || filtroJornada.value !== null);

const textoJornada = (j: null | number | undefined) => jornadaDe(foto.value?.actividad.fecha, j).replace(' · ', ' - ');
const textoSinConexion = computed(() => {
  if (!ultimaRed.value) return t('Sin conexión');
  const min = Math.round((reloj.value - ultimaRed.value) / 60_000);
  const hace = min < 1 ? t('hace un momento') : (min < 60 ? t('hace {n} min', { n: min }) : t('hace {n} h', { n: Math.round(min / 60) }));
  return t('Sin conexión · datos de {hace}', { hace });
});

function estadoDe(id: number): EstadoStand {
  return porId.get(id)?.estado ?? 'N';
}
const ficha = computed(() => {
  void version.value;
  const id = seleccionId.value;
  return id === null ? null : porId.get(id) ?? null;
});
const ESTADOS = {
  E: { clase: 'fm-estado--e', texto: 'Evaluado' },
  N: { clase: 'fm-estado--n', texto: 'Pendiente' },
  P: { clase: 'fm-estado--p', texto: 'En evaluación' },
} as const satisfies Record<EstadoStand, { clase: string; texto: string }>;
/** Categoría de un stand en el idioma que se ve. */
const categoriaDe = (id: number) => categoriaEnIdioma(nombreCategoria.value.get(id));

/** Buscador: proyecto, número de stand, carrera, categoría (en español y en el idioma que se ve), docente o integrante (sin tildes). */
const indice = computed(() => {
  void version.value;
  return (foto.value?.stands ?? []).map((s) => ({
    s, texto: normalizarTexto([s.stand, s.proyecto, s.carrera, s.siglaFacultad, nombreCategoria.value.get(s.idCategoria), categoriaDe(s.idCategoria), s.docente, ...(s.integrantes ?? [])].filter(Boolean).join(' ')),
  }));
});
const resultados = computed(() => {
  const q = normalizarTexto(busqueda.value.trim()).split(/\s+/).filter(Boolean);
  if (q.length === 0) return [];
  // Un número solo: primero el stand con ese número exacto.
  const exacto = (s: StandPublico) => (q.length === 1 && s.stand && normalizarTexto(s.stand) === q[0] ? 0 : 1);
  return indice.value.filter(({ texto }) => q.every((t) => texto.includes(t))).map(({ s }) => s)
    .sort((a, b) => exacto(a) - exacto(b)).slice(0, MAX_RESULTADOS);
});

// ------------------------------------------------------------------ dibujo

function pasaFiltro(s: StandPublico) {
  if (filtroCategorias.value.length > 0 && !filtroCategorias.value.includes(s.idCategoria)) return false;
  return filtroJornada.value === null || (s.jornada ?? 1) === filtroJornada.value;
}

/** Color sólido por estado y borde fino algo más claro; sin brillo. */
function estilo(s: StandPublico): OpcionesNeon {
  if (!pasaFiltro(s)) return { color: '#33456b', fillColor: '#18254a', fillOpacity: 0.55, opacity: 0.8, weight: 1, brillo: 0 };
  if (s.estado === 'E') return { color: '#f2a0aa', fillColor: '#b3142b', fillOpacity: 0.95, opacity: 0.85, weight: 1, brillo: 0 };
  if (s.estado === 'P') return { color: '#f6d58b', fillColor: '#b47a14', fillOpacity: 0.95, opacity: 0.85, weight: 1, brillo: 0 };
  return { color: '#a9c1ff', fillColor: '#2c56c9', fillOpacity: 0.93, opacity: 0.8, weight: 1, brillo: 0 };
}

/** Zona (escenario, ingreso, primeros auxilios…): color sólido apagado con borde fino del mismo tono. */
function estiloZona(color: string): OpcionesNeon {
  return { color: aclarar(color, 0.3), fillColor: oscurecer(color, 0.45), fillOpacity: 0.85, opacity: 0.75, weight: 1, brillo: 0 };
}

function mezclar(hex: string, con: number, t: number) {
  const m = /^#?([\da-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = Number.parseInt(m[1]!, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (con - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const aclarar = (hex: string, t: number) => mezclar(hex, 255, t);
const oscurecer = (hex: string, t: number) => mezclar(hex, 0, t);

function etiquetaDe(s: StandPublico): EtiquetaMapa {
  return {
    lat: s.lat!, lng: s.lng!, ancho: s.ancho, alto: s.alto, rotacion: s.rotacion, tipo: 'stand',
    texto: s.stand ?? '', marca: s.estado === 'E', oculta: !pasaFiltro(s), color: '#fff',
  };
}

function etiquetasZonas(): EtiquetaMapa[] {
  return zonasValidas().map((z) => ({ ...z, tipo: 'zona' as const, texto: z.nombre, color: z.tipo === 'etiqueta' ? '#b9c6e4' : '#ffffff', halo: 'rgba(8,18,43,.9)' }));
}

function zonasValidas(): ZonaFeria[] {
  const zonas = foto.value?.mapa.zonas;
  return Array.isArray(zonas)
    ? zonas.filter((z) => z && Number.isFinite(z.lat) && Number.isFinite(z.lng) && z.ancho > 0 && z.alto > 0)
    : [];
}

function refrescarEtiquetas() {
  if (!etiquetas || !foto.value) return;
  const ubicados = foto.value.stands.filter((s) => s.lat !== null && s.lng !== null);
  etiquetas.fijar([...etiquetasZonas(), ...ubicados.map((s) => etiquetaDe(s))]);
  pines?.fijar(ubicados.map((s) => ({
    color: COLOR_ESTADO[s.estado], id: s.id, lado: Math.min(s.ancho, s.alto),
    lat: s.lat!, lng: s.lng!, oculto: !pasaFiltro(s), seleccionado: seleccionId.value === s.id,
    texto: s.stand || (s.estado === 'E' ? '✓' : '•'),
  })));
}

function construirCapas() {
  if (!mapa || !capaStands || !capaZonas || !foto.value) return;
  capaStands.clearLayers();
  capaZonas.clearLayers();
  poligonos.clear();
  for (const l of latidos.values()) l.remove();
  latidos.clear();
  for (const z of zonasValidas()) {
    if (z.tipo === 'etiqueta') continue;
    L.polygon(esquinasRect(z), { ...estiloZona(z.color || '#64748b'), renderer: lienzo, interactive: false }).addTo(capaZonas);
  }
  for (const s of foto.value.stands) {
    if (s.lat === null || s.lng === null) continue;
    const p = L.polygon(esquinasRect(s as StandPublico & { lat: number; lng: number }), {
      ...estilo(s), renderer: lienzo, bubblingMouseEvents: false,
    });
    p.on('click', () => seleccionar(s.id, false));
    p.addTo(capaStands);
    poligonos.set(s.id, p);
  }
  actualizarLatidos();
  refrescarEtiquetas();
  resaltar();
}

/** Solo restyla los indicados (o todos): no se recrean capas al cambiar un estado. */
function actualizarEstilos(ids?: Iterable<number>) {
  if (!foto.value) return;
  for (const id of ids ?? poligonos.keys()) {
    const s = porId.get(id);
    const p = poligonos.get(id);
    if (s && p) p.setStyle(estilo(s));
  }
  actualizarLatidos();
  refrescarEtiquetas();
}

/** Onda centrada en el stand: un `divIcon` cuya animación CSS solo usa transform/opacity. */
function onda(s: StandPublico, clase: string) {
  return L.marker([s.lat!, s.lng!], {
    icon: L.divIcon({ className: `fm-onda ${clase}`, html: '<i></i>', iconSize: [0, 0] }),
    interactive: false, keyboard: false, pane: 'fmOndas',
  });
}

/** Latido suave de los stands en evaluación (pocos a la vez; tope por si acaso). */
function actualizarLatidos() {
  if (!capaEfectos || reducirMovimiento) return;
  const deben = new Set<number>();
  for (const id of poligonos.keys()) {
    const s = porId.get(id)!;
    if (s.estado !== 'P' || !pasaFiltro(s) || deben.size >= 80) continue;
    deben.add(id);
    if (!latidos.has(id)) latidos.set(id, onda(s, 'fm-onda--p').addTo(capaEfectos));
  }
  for (const [id, l] of latidos) {
    if (!deben.has(id)) { l.remove(); latidos.delete(id); }
  }
}

/** Destello breve cuando un stand pasa a evaluado (solo si está a la vista). */
function destello(id: number) {
  const s = porId.get(id);
  if (!s || s.lat === null || s.lng === null || !capaEfectos || !mapa || reducirMovimiento || document.visibilityState !== 'visible') return;
  if (!mapa.getBounds().pad(0.2).contains([s.lat, s.lng])) return;
  const efecto = onda(s, 'fm-onda--e').addTo(capaEfectos);
  setTimeout(() => efecto.remove(), 1_700);
}

function resaltar() {
  resaltado?.remove();
  resaltado = undefined;
  marcaElegido?.remove();
  marcaElegido = undefined;
  refrescarEtiquetas();
  const elegido = seleccionId.value === null ? undefined : porId.get(seleccionId.value);
  if (elegido && elegido.lat !== null && elegido.lng !== null && mapa) {
    marcaElegido = L.marker([elegido.lat, elegido.lng], { icon: iconoElegido(elegido), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(mapa);
  }
  const id = seleccionId.value;
  const p = id === null ? undefined : poligonos.get(id);
  if (!p || !capaEfectos) return;
  // Contorno blanco fino que late suave (solo opacidad).
  resaltado = L.polygon(p.getLatLngs() as L.LatLng[], {
    renderer: vectorial, interactive: false, className: reducirMovimiento ? 'fm-resaltado-fijo' : 'fm-resaltado',
    color: '#ffffff', weight: 2, fill: false, opacity: 0.9,
  }).addTo(capaEfectos);
}

/** Marcador del stand elegido: anillo rojo con un arco azul y «STAND n» (el texto va con textContent). */
function iconoElegido(s: StandPublico) {
  const caja = document.createElement('div');
  caja.className = `fm-sel fm-sel--${s.estado.toLowerCase()}`;
  caja.innerHTML = '<span class="fm-sel__pulso"></span><svg class="fm-sel__arco" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /></svg>';
  const anillo = document.createElement('div');
  anillo.className = 'fm-sel__anillo';
  const rotulo = document.createElement('small');
  rotulo.textContent = 'STAND';
  const numero = document.createElement('b');
  numero.textContent = s.stand || '•';
  if ((s.stand ?? '').length > 3) numero.classList.add('fm-sel__largo');
  anillo.append(rotulo, numero);
  caja.append(anillo);
  return L.divIcon({ className: 'fm-sel-icono', html: caja, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function aplicarVista(forzar = false) {
  const f = foto.value;
  if (!mapa || !f || !mapaElemento.value?.clientWidth) return;
  const m = f.mapa;
  if (m.limites) {
    const limites = L.latLngBounds([m.limites.sur, m.limites.oeste], [m.limites.norte, m.limites.este]);
    // Sin salir del área: tampoco se piden teselas fuera de ella (el proxy da 404 allí).
    mapa.setMaxBounds(limites.pad(0.1));
    // Alejar solo hasta que la pantalla quede (casi) dentro del área: fuera de ella no hay teselas.
    // Nunca por encima del zoom inicial configurado.
    const llena = Math.floor(mapa.getBoundsZoom(limites, true) * 2) / 2 - 0.5;
    mapa.setMinZoom(Math.max(ZOOM_MIN, Math.min(m.zoom, llena)));
  } else {
    mapa.setMaxBounds(undefined as unknown as L.LatLngBounds);
    mapa.setMinZoom(ZOOM_MIN);
  }
  if (forzar || !vistaAplicada || !espectadorMovio) {
    mapa.setView([m.centroLat, m.centroLng], Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, m.zoom)), { animate: false });
    vistaAplicada = true;
  }
}

function verInicio() {
  const m = foto.value?.mapa;
  if (!mapa || !m) return;
  espectadorMovio = false;
  mapa.setView([m.centroLat, m.centroLng], Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, m.zoom)), { animate: !reducirMovimiento });
}

// ------------------------------------------------------------------ datos

function indexar(f: FeriaPublica) {
  porId = new Map(f.stands.map((s) => [s.id, s]));
}

function firmaDe(f: FeriaPublica) {
  return JSON.stringify([
    f.actividad.id, f.categorias.map((c) => [c.id, c.color]), f.mapa.zonas,
    f.stands.map((s) => [s.id, s.stand, s.idCategoria, s.lat, s.lng, s.ancho, s.alto, s.rotacion]),
  ]);
}

function aplicarFoto(nueva: FeriaPublica) {
  const anterior = foto.value;
  const cambioVista = !anterior || anterior.actividad.id !== nueva.actividad.id
    || anterior.mapa.centroLat !== nueva.mapa.centroLat || anterior.mapa.centroLng !== nueva.mapa.centroLng
    || anterior.mapa.zoom !== nueva.mapa.zoom || JSON.stringify(anterior.mapa.limites) !== JSON.stringify(nueva.mapa.limites);
  const previos = new Map(anterior?.stands.map((s) => [s.id, s.estado]) ?? []);
  foto.value = nueva;
  indexar(nueva);
  resumen.value = nueva.resumen;
  version.value++;
  if (seleccionId.value !== null && !porId.has(seleccionId.value)) seleccionId.value = null;
  if (cambioVista) aplicarVista(!anterior);
  const firma = firmaDe(nueva);
  if (firma === firmaGeometria) {
    actualizarEstilos();
  } else {
    firmaGeometria = firma;
    construirCapas();
  }
  if (anterior) for (const s of nueva.stands) if (s.estado === 'E' && previos.get(s.id) && previos.get(s.id) !== 'E') destello(s.id);
  atenderStandPedido();
}

/** `?stand=ID`: en cuanto hay datos (caché o red) se elige ese stand y se vuela hasta él. */
function atenderStandPedido() {
  if (standPedido === null || !mapa) return;
  const s = porId.get(standPedido);
  if (!s) return;
  standPedido = null;
  if (!pasaFiltro(s)) limpiarFiltros();
  // Un instante para que el mapa pinte la vista inicial y el vuelo se vea.
  setTimeout(() => {
    seleccionar(s.id, true);
    void nextTick(() => fichaTitulo.value?.focus({ preventScroll: true }));
  }, reducirMovimiento ? 0 : 350);
}

function aplicarEstados(e: EstadosFeria) {
  const f = foto.value;
  if (!f) return;
  if (e.idActividad !== f.actividad.id) { void cargarFoto(); return; }
  const cambiados: number[] = [];
  for (const [clave, estado] of Object.entries(e.estados ?? {})) {
    const s = porId.get(Number(clave));
    if (!s || s.estado === estado) continue;
    const antes = s.estado;
    s.estado = estado;
    cambiados.push(s.id);
    if (estado === 'E' && antes !== 'E') destello(s.id);
  }
  resumen.value = e.resumen;
  f.resumen = e.resumen;
  if (e.visitas > (visitas.value ?? -1)) visitas.value = e.visitas;
  if (cambiados.length > 0) {
    version.value++;
    actualizarEstilos(cambiados);
    if (seleccionId.value !== null && cambiados.includes(seleccionId.value)) resaltar();
    programarGuardado();
  }
}

/** Foto en el teléfono para reabrir sin red (y para mandar su ETag). */
function leerCache() {
  const c = leerFotoGuardada(CLAVE_FOTO);
  if (!c) return;
  etagFoto = c.etag;
  ultimaRed.value = c.hora;
  aplicarFoto(c.foto);
  cargando.value = false;
}
function guardarCache() {
  clearTimeout(tGuardar);
  tGuardar = undefined;
  guardarFoto(CLAVE_FOTO, foto.value, etagFoto, ultimaRed.value ?? Date.now());
}
function programarGuardado() {
  if (!tGuardar) tGuardar = setTimeout(guardarCache, 10_000);
}

const espera = (fallos: number, base: number) =>
  Math.min(base * 2 ** Math.max(0, fallos - 1), ESPERA_MAX_MS) * (0.75 + Math.random() * 0.5);

function exitoRed() {
  sinConexion.value = false;
  ultimaRed.value = Date.now();
}
function falloRed() {
  if (!streamActivo()) sinConexion.value = true;
}

async function cargarFoto() {
  if (cargandoFoto) return;
  cargandoFoto = true;
  clearTimeout(tFoto);
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 12_000);
  try {
    const r = await obtenerFeriaPublica(idPedido, foto.value ? etagFoto : null, control.signal);
    exitoRed();
    fallosFoto = 0;
    if (!r.sinCambios) {
      etagFoto = r.etag;
      if (r.datos) {
        aplicarFoto(r.datos);
      } else {
        foto.value = null; firmaGeometria = ''; capaStands?.clearLayers(); capaZonas?.clearLayers(); capaEfectos?.clearLayers();
        latidos.clear(); poligonos.clear(); etiquetas?.fijar([]); pines?.fijar([]);
      }
      guardarCache();
    }
    // Pedido por la URL pero no está en la foto vigente: ya no se espera.
    if (standPedido !== null && !porId.has(standPedido)) standPedido = null;
  } catch {
    falloRed();
    fallosFoto++;
    tFoto = setTimeout(() => void cargarFoto(), espera(fallosFoto, 5_000));
  } finally {
    clearTimeout(limite);
    cargandoFoto = false;
    cargando.value = false;
  }
}

async function cargarEstados(): Promise<boolean> {
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 10_000);
  try {
    const r = await obtenerEstadosFeria(idPedido, etagEstados, control.signal);
    exitoRed();
    if (!r.sinCambios) {
      etagEstados = r.etag;
      if (r.datos) aplicarEstados(r.datos);
      else if (foto.value) void cargarFoto();
    }
    return true;
  } catch {
    falloRed();
    return false;
  } finally {
    clearTimeout(limite);
  }
}

const streamActivo = () => Boolean(stream) && stream!.readyState === 1 && Date.now() - ultimoMensaje < SILENCIO_MAX_MS;

function cerrarStream() {
  stream?.close();
  stream = undefined;
}

function conectarStream() {
  clearTimeout(tStream);
  if (typeof EventSource === 'undefined' || document.visibilityState !== 'visible') return;
  cerrarStream();
  const es = new EventSource(urlStreamFeria(idPedido));
  stream = es;
  es.addEventListener('open', () => { fallosStream = 0; });
  es.addEventListener('estados', (evento) => {
    ultimoMensaje = Date.now();
    exitoRed();
    try {
      const cuerpo = JSON.parse((evento as MessageEvent<string>).data) as { data: EstadosFeria | null; ok: boolean };
      if (cuerpo.ok && cuerpo.data) aplicarEstados(cuerpo.data);
    } catch { /* mensaje malformado: el siguiente lo reemplaza */ }
  });
  es.addEventListener('mapa', () => {
    ultimoMensaje = Date.now();
    // Con azar: miles de teléfonos no piden la foto en el mismo milisegundo.
    clearTimeout(tMapa);
    tMapa = setTimeout(() => void cargarFoto(), 300 + Math.random() * 2_700);
  });
  // Reintento propio (no el de EventSource, que insiste cada 3 s): espera creciente con tope.
  es.addEventListener('error', () => {
    if (stream !== es) return;
    cerrarStream();
    fallosStream++;
    falloRed();
    tStream = setTimeout(conectarStream, espera(fallosStream, 5_000));
  });
}

/** Respaldo: solo consulta si el stream calla; si falla, espera cada vez más (hasta 2 min). */
function cicloRespaldo() {
  clearTimeout(tRespaldo);
  tRespaldo = setTimeout(async () => {
    if (document.visibilityState === 'visible' && !streamActivo()) {
      fallosRespaldo = (await cargarEstados()) ? 0 : fallosRespaldo + 1;
    }
    cicloRespaldo();
  }, fallosRespaldo ? espera(fallosRespaldo + 1, RESPALDO_MS) : RESPALDO_MS);
}

function registrarVisita() {
  if (visitaRegistrada) return;
  registrarVisitaFeria(idVisitante(CLAVE_VISITANTE), idPedido)
    .then((total) => { visitaRegistrada = true; if (total > (visitas.value ?? -1)) visitas.value = total; })
    .catch(() => { /* el contador no debe molestar; se reintenta al volver la red */ });
}

// ------------------------------------------------------------------ interacción

/**
 * Lleva el mapa al stand con zoom de cerca. El stand queda en la parte del mapa que no tapa la
 * ficha: a la izquierda en escritorio (ficha a la derecha) y arriba en el celular (ficha abajo).
 */
function irAlStand(s: StandPublico) {
  if (!mapa || s.lat === null || s.lng === null) return;
  espectadorMovio = true;
  const zoom = ZOOM_MAX;
  const tam = mapa.getSize();
  const desplazamiento = esCelular.value ? L.point(0, tam.y * 0.2) : L.point(Math.min(220, tam.x * 0.18), 0);
  const destino = mapa.unproject(mapa.project([s.lat, s.lng], zoom).add(desplazamiento), zoom);
  if (reducirMovimiento) mapa.setView(destino, zoom, { animate: false });
  else mapa.flyTo(destino, zoom, { duration: 1.1 });
}

function seleccionar(id: null | number, centrar: boolean) {
  if (id !== seleccionId.value) terminarRuta();
  seleccionId.value = id;
  resaltar();
  const s = id === null ? undefined : porId.get(id);
  if (centrar && s) irAlStand(s);
  // La dirección refleja el stand elegido (se puede compartir); sin agregar pasos al historial.
  const actual = Number(route.query.stand) || null;
  if (actual !== id) void router.replace({ query: { ...route.query, stand: id === null ? undefined : String(id) } });
}

/** Elegir un resultado del buscador. */
async function ubicar(s: StandPublico) {
  busqueda.value = '';
  buscadorAbierto.value = false;
  entradaBusqueda.value?.blur();
  if (!pasaFiltro(s)) limpiarFiltros();
  seleccionar(s.id, true);
  await nextTick();
  fichaTitulo.value?.focus({ preventScroll: true });
}
function alEnviarBusqueda() {
  const primero = resultados.value[0];
  if (primero) void ubicar(primero);
}
function alSalirBuscador(e: FocusEvent) {
  const destino = e.relatedTarget as HTMLElement | null;
  if (!destino?.closest('.fm-buscar')) buscadorAbierto.value = false;
}

function volver() {
  const estado = window.history.state as null | { back?: null | string };
  if (estado?.back?.startsWith('/fexcoin-vivo') && !estado.back.startsWith('/fexcoin-vivo/mapa')) router.back();
  else void router.push(rutaPortada(route.query));
}

// ------------------------------------------------------------------ ruta a pie

const urlRuta = computed(() => {
  const s = ficha.value;
  return s && s.lat !== null && s.lng !== null ? urlGoogleMaps(s.lat, s.lng) : '';
});

/** Pide la ubicación SOLO al pulsar «Iniciar ruta» y la sigue mientras la ruta esté activa. */
function iniciarRuta() {
  const s = ficha.value;
  if (!s || s.lat === null || s.lng === null) return;
  if (!('geolocation' in navigator)) { ruta.value = { activa: false, error: 'Este teléfono no da su ubicación: use Google Maps.', metros: null }; return; }
  terminarRuta();
  ruta.value = { activa: true, error: '', metros: null };
  rutaEncuadrada = false;
  vigilancia = navigator.geolocation.watchPosition((pos) => dibujarRuta(pos.coords.latitude, pos.coords.longitude), (err) => {
    const error = err.code === err.PERMISSION_DENIED ? 'Sin permiso de ubicación: use Google Maps.' : 'No se pudo obtener su ubicación: use Google Maps.';
    terminarRuta();
    ruta.value = { activa: false, error, metros: null };
  }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
}

function dibujarRuta(lat: number, lng: number) {
  const s = ficha.value;
  if (!mapa || !s || s.lat === null || s.lng === null || !ruta.value.activa) return;
  const yo = L.latLng(lat, lng);
  const destino = L.latLng(s.lat, s.lng);
  if (miPunto) miPunto.setLatLng(yo);
  else miPunto = L.marker(yo, { icon: L.divIcon({ className: 'fm-yo', html: '<i></i>', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(mapa);
  if (lineaRuta) lineaRuta.setLatLngs([yo, destino]);
  else lineaRuta = L.polyline([yo, destino], { className: 'fm-ruta', color: '#6b9bff', dashArray: '2 9', interactive: false, lineCap: 'round', renderer: vectorial, weight: 3.5 }).addTo(mapa);
  const metros = distanciaM(lat, lng, s.lat, s.lng);
  ruta.value = { activa: true, error: '', metros };
  // Encuadra una vez (si está cerca); después el espectador mueve el mapa como quiera.
  if (!rutaEncuadrada && metros < 2_000) {
    rutaEncuadrada = true;
    // Margen extra donde está la ficha (a la derecha; abajo en el celular) para no taparlos.
    const alto = mapa.getSize().y;
    mapa.fitBounds(L.latLngBounds(yo, destino), {
      animate: !reducirMovimiento, maxZoom: ZOOM_TESELAS, paddingTopLeft: [60, 130],
      paddingBottomRight: esCelular.value ? [60, Math.round(alto * 0.5)] : [420, 90],
    });
  }
}

function terminarRuta() {
  if (vigilancia !== null) navigator.geolocation.clearWatch(vigilancia);
  vigilancia = null;
  miPunto?.remove();
  miPunto = undefined;
  lineaRuta?.remove();
  lineaRuta = undefined;
  ruta.value = { activa: false, error: '', metros: null };
}
/** «Buscando su ubicación…», «≈ 120 m · 2 min a pie», «¡Llegó!» o el error, en el idioma que se ve. */
const textoRuta = computed(() => {
  const r = ruta.value;
  if (r.error) return t(r.error);
  if (!r.activa) return '';
  if (r.metros === null) return t('Buscando su ubicación…');
  return r.metros < 15 ? t('¡Llegó! El stand está aquí.') : textoCaminata(r.metros);
});

function alternarCategoria(id: number) {
  const actual = filtroCategorias.value;
  filtroCategorias.value = actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id];
  actualizarEstilos();
}
function elegirJornada(j: null | number) {
  filtroJornada.value = filtroJornada.value === j ? null : j;
  actualizarEstilos();
}
function limpiarFiltros() {
  filtroCategorias.value = [];
  filtroJornada.value = null;
  actualizarEstilos();
}

function acercar(delta: number) {
  espectadorMovio = true;
  if (mapa) mapa.setZoom(mapa.getZoom() + delta);
}

async function alternarPantallaCompleta() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await raiz.value?.requestFullscreen();
  } catch { /* iOS y algunos navegadores no lo permiten */ }
}

function alPulsarTecla(evento: KeyboardEvent) {
  if (evento.key !== 'Escape' || tvuAbierta.value) return;
  if (busqueda.value) { busqueda.value = ''; return; }
  if (seleccionId.value !== null) seleccionar(null, false);
}
function alCambiarPantalla() { pantallaCompleta.value = Boolean(document.fullscreenElement); }
function alCambiarVisibilidad() {
  if (document.visibilityState !== 'visible') {
    ocultaDesde = Date.now();
    clearTimeout(tOculta);
    tOculta = setTimeout(cerrarStream, CERRAR_OCULTA_MS);
    guardarCache();
    return;
  }
  clearTimeout(tOculta);
  reloj.value = Date.now();
  if (ocultaDesde && Date.now() - ocultaDesde > 5 * 60_000) void cargarFoto();
  ocultaDesde = 0;
  if (!streamActivo()) { void cargarEstados(); conectarStream(); }
}
function alVolverRed() {
  fallosStream = 0;
  fallosRespaldo = 0;
  fallosFoto = 0;
  void (foto.value ? cargarEstados() : cargarFoto());
  if (!streamActivo()) conectarStream();
  cicloRespaldo();
  registrarVisita();
}
function alPerderRed() { sinConexion.value = true; }
function alRedimensionar() { esCelular.value = window.innerWidth <= ANCHO_CELULAR; }
watch(seleccionId, (id) => { if (id === null) terminarRuta(); });

sincronizarIdioma(route, (query) => router.replace({ query }));

onMounted(() => {
  registrarServiceWorkerFeria();
  if (!mapaElemento.value) return;
  lienzo = new LienzoNeon({ padding: 0.4, tolerance: 6 });
  vectorial = L.svg({ padding: 0.4 });
  mapa = L.map(mapaElemento.value, {
    zoomControl: false, attributionControl: true, minZoom: ZOOM_MIN, maxZoom: ZOOM_MAX, maxBoundsViscosity: 0.9,
    zoomSnap: 0.5, wheelPxPerZoomLevel: 90, tapTolerance: 20, renderer: lienzo,
  }).setView(CENTRO_DEFECTO, 17);
  new CapaTeselasFeria(URL_TESELAS_FERIA, {
    attribution: ATRIBUCION_OSM, className: 'fm-teselas', keepBuffer: 1,
    maxNativeZoom: ZOOM_TESELAS, maxZoom: ZOOM_MAX, minNativeZoom: ZOOM_MIN, minZoom: ZOOM_MIN,
  }).addTo(mapa);
  mapa.createPane('fmOndas').style.zIndex = '455';
  capaZonas = L.layerGroup().addTo(mapa);
  capaStands = L.layerGroup().addTo(mapa);
  capaEfectos = L.layerGroup().addTo(mapa);
  etiquetas = new CapaEtiquetas().addTo(mapa);
  pines = new CapaPines().addTo(mapa);
  mapa.on('click', (e) => {
    // Los pines están en un canvas sin eventos: se busca cuál hay bajo el toque.
    const id = pines?.buscar(e.containerPoint) ?? null;
    if (id !== null) seleccionar(id, false);
    else if (seleccionId.value !== null) seleccionar(null, false);
    buscadorAbierto.value = false;
  });
  mapa.on('dragstart', () => { espectadorMovio = true; });
  mapaElemento.value.addEventListener('wheel', () => { espectadorMovio = true; }, { passive: true });
  mapaElemento.value.addEventListener('touchstart', (e) => { if (e.touches.length > 1) espectadorMovio = true; }, { passive: true });
  observador = new ResizeObserver(() => { mapa?.invalidateSize({ pan: false }); if (!vistaAplicada) aplicarVista(); });
  observador.observe(mapaElemento.value);
  window.addEventListener('resize', alRedimensionar);

  leerCache();
  void cargarFoto();
  conectarStream();
  cicloRespaldo();
  registrarVisita();
  tReloj = setInterval(() => { reloj.value = Date.now(); }, 30_000);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  document.addEventListener('fullscreenchange', alCambiarPantalla);
  document.addEventListener('keydown', alPulsarTecla);
  window.addEventListener('online', alVolverRed);
  window.addEventListener('offline', alPerderRed);
  window.addEventListener('pagehide', guardarCache);
});

onUnmounted(() => {
  cerrarStream();
  for (const t of [tStream, tRespaldo, tFoto, tMapa, tOculta]) clearTimeout(t);
  if (tGuardar) guardarCache();
  clearInterval(tReloj);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  document.removeEventListener('fullscreenchange', alCambiarPantalla);
  document.removeEventListener('keydown', alPulsarTecla);
  window.removeEventListener('online', alVolverRed);
  window.removeEventListener('offline', alPerderRed);
  window.removeEventListener('pagehide', guardarCache);
  window.removeEventListener('resize', alRedimensionar);
  observador?.disconnect();
  terminarRuta();
  mapa?.remove();
});
</script>

<template>
  <main ref="raiz" class="fm">
    <header class="fm-cab">
      <button type="button" class="fm-cab__volver" :aria-label="t('Volver a la portada de la feria')" @click="volver">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg><span>{{ t('Volver') }}</span>
      </button>
      <MarcaFeria :nombre="nombre" class="fm-cab__marca" />
      <div class="fm-cab__estado">
        <SelectorIdioma />
        <span v-if="sinConexion" class="fm-pastilla fm-pastilla--off" role="status" aria-live="polite">{{ textoSinConexion }}</span>
        <span v-else class="fm-pastilla" role="status" aria-live="polite" :class="`fm-pastilla--${pastilla.clase}`"><i v-if="pastilla.clase === 'vivo'" aria-hidden="true"></i>{{ pastilla.texto }}</span>
        <span class="fm-cab__fecha">{{ fechaCorta }}</span>
      </div>
    </header>

    <div class="fm__marco">
      <div ref="mapaElemento" class="fm__mapa" role="region" :aria-label="t('Plano de la feria con los stands y su estado de evaluación')"></div>

      <!-- Buscador y filtros -->
      <div class="fm-buscar fm-vidrio" :class="{ 'is-oculto': esCelular && ficha }">
        <form class="fm-buscar__caja" role="search" @submit.prevent="alEnviarBusqueda">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input ref="entradaBusqueda" v-model="busqueda" type="search" :placeholder="t('Buscar proyecto, stand, carrera o integrante')"
            :aria-label="t('Buscar proyecto, número de stand, carrera o integrante')" autocomplete="off" enterkeyhint="search"
            :aria-expanded="buscadorAbierto && Boolean(busqueda.trim())" aria-controls="fm-resultados"
            @focus="buscadorAbierto = true" @input="buscadorAbierto = true" @blur="alSalirBuscador" />
          <button v-if="busqueda" type="button" class="fm-buscar__borrar" :aria-label="t('Borrar búsqueda')" @click="busqueda = ''; entradaBusqueda?.focus()">✕</button>
        </form>
        <!-- pointerdown.prevent: el toque no le quita el foco al buscador (en iOS el botón no lo recibe y la lista se cerraba antes del clic). -->
        <ul v-if="buscadorAbierto && busqueda.trim()" id="fm-resultados" class="fm-buscar__resultados" :aria-label="t('Resultados')" @pointerdown.prevent>
          <li v-for="s in resultados" :key="s.id">
            <button type="button" :disabled="s.lat === null" @click="ubicar(s)" @blur="alSalirBuscador">
              <span class="fm-buscar__num"><small>STAND</small>{{ s.stand || '—' }}</span>
              <span class="fm-buscar__texto"><strong>{{ s.proyecto }}</strong><small>{{ categoriaDe(s.idCategoria) }}<template v-if="s.carrera"> · {{ s.carrera }}</template></small></span>
              <span v-if="s.lat === null" class="fm-buscar__nota">{{ t('sin ubicar') }}</span>
            </button>
          </li>
          <li v-if="!resultados.length" class="fm-buscar__vacio">{{ t('Sin coincidencias.') }}</li>
        </ul>
        <div v-if="jornadas.length || categorias.length" class="fm-chips" role="group" :aria-label="t('Filtrar el mapa por día y categoría')">
          <button v-for="j in jornadas" :key="`j${j}`" type="button" class="fm-chip" :aria-pressed="filtroJornada === j" @click="elegirJornada(j)">
            {{ textoJornada(j) }}
          </button>
          <button v-for="c in categorias" :key="c.id" type="button" class="fm-chip" :style="{ '--c': c.color }"
            :aria-pressed="filtroCategorias.includes(c.id)" @click="alternarCategoria(c.id)">
            <i aria-hidden="true"></i>{{ categoriaEnIdioma(c.nombre) }}
          </button>
          <button v-if="hayFiltros" type="button" class="fm-chip fm-chip--limpiar" @click="limpiarFiltros">{{ t('Ver todo') }}</button>
        </div>
      </div>

      <div class="fm-controles">
        <button type="button" :aria-label="t('Acercar')" :title="t('Acercar')" @click="acercar(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" :aria-label="t('Alejar')" :title="t('Alejar')" @click="acercar(-1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" :aria-label="t('Volver a la vista inicial')" :title="t('Vista inicial')" @click="verInicio">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7M6 9.5V20h4v-5h4v5h4V9.5" /></svg>
        </button>
        <button v-if="puedePantallaCompleta" type="button" :aria-label="pantallaCompleta ? t('Salir de pantalla completa') : t('Pantalla completa')"
          :title="pantallaCompleta ? t('Salir de pantalla completa') : t('Pantalla completa')" @click="alternarPantallaCompleta">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path v-if="pantallaCompleta" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
            <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      <div v-if="cargando && !foto" class="fm-aviso fm-vidrio"><strong>{{ t('Cargando el mapa…') }}</strong></div>
      <div v-else-if="!foto" class="fm-aviso fm-vidrio">
        <strong>{{ t('Pronto en vivo') }}</strong>
        <span>{{ sinConexion ? t('Sin conexión. Reintentaremos en unos segundos.') : t('El plano de la feria se publicará aquí.') }}</span>
      </div>

      <!-- Ficha del stand -->
      <aside v-if="ficha" :key="ficha.id" class="fm-ficha fm-vidrio" role="dialog" aria-modal="false" aria-labelledby="fm-ficha-titulo"
        :style="{ '--c': colorDe.get(ficha.idCategoria) ?? '#64748b' }">
        <span class="fm-ficha__asa" aria-hidden="true"></span>
        <button type="button" class="fm-ficha__cerrar" :aria-label="t('Cerrar ficha')" :title="t('Cerrar (Esc)')" @click="seleccionar(null, false)">✕</button>
        <h2 id="fm-ficha-titulo" ref="fichaTitulo" tabindex="-1">{{ ficha.proyecto || t('Proyecto') }}</h2>
        <div class="fm-ficha__chips">
          <span class="fm-ficha__stand">STAND {{ ficha.stand || '—' }}</span>
          <span class="fm-ficha__estado" :class="ESTADOS[estadoDe(ficha.id)].clase">{{ t(ESTADOS[estadoDe(ficha.id)].texto) }}</span>
        </div>
        <p class="fm-ficha__categoria"><i aria-hidden="true"></i>{{ categoriaDe(ficha.idCategoria) }}</p>
        <dl>
          <template v-if="ficha.carrera"><dt>{{ t('Carrera') }}</dt><dd>{{ ficha.carrera }}</dd></template>
          <dt>{{ t('Jornada') }}</dt><dd>{{ textoJornada(ficha.jornada) }}</dd>
          <template v-if="ficha.docente"><dt>{{ t('Docente guía') }}</dt><dd>{{ ficha.docente }}</dd></template>
          <template v-if="ficha.integrantes?.length">
            <dt>{{ t('Integrantes') }}</dt>
            <dd><ul class="fm-ficha__equipo"><li v-for="(n, i) in ficha.integrantes" :key="i">{{ n }}</li></ul></dd>
          </template>
        </dl>
        <p v-if="ficha.lat === null" class="fm-ficha__nota">{{ t('Este stand aún no está ubicado en el plano.') }}</p>
        <template v-else>
          <p v-if="textoRuta" class="fm-ficha__ruta" :class="{ 'is-error': ruta.error }" role="status">{{ textoRuta }}</p>
          <div class="fm-ficha__acciones">
            <button v-if="!ruta.activa" type="button" class="fm-ficha__ir" @click="iniciarRuta">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>{{ t('Iniciar ruta') }}
            </button>
            <button v-else type="button" class="fm-ficha__ir fm-ficha__ir--fin" @click="terminarRuta">{{ t('Terminar ruta') }}</button>
            <a class="fm-ficha__gmaps" :href="urlRuta" target="_blank" rel="noopener noreferrer">{{ t('Abrir en Google Maps ↗') }}</a>
          </div>
        </template>
      </aside>

      <!-- Abajo: enlaces, leyenda e información -->
      <div class="fm-enlaces" :class="{ 'is-oculto': esCelular && ficha }">
        <button v-if="urlTvu" type="button" class="fm-enlace fm-enlace--tvu" aria-haspopup="dialog" :aria-label="t('Transmisión TVU')" @click="tvuAbierta = true">
          <svg class="fm-enlace__play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          <span class="fm-enlace__largo">{{ t('Transmisión TVU') }}</span><span class="fm-enlace__corto">TVU <b>● {{ t('EN VIVO') }}</b></span>
        </button>
        <a v-if="urlFacebook" class="fm-enlace fm-enlace--fb" :href="urlFacebook" target="_blank" rel="noopener noreferrer" :aria-label="t('UAP en Facebook (se abre aparte)')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21z" /></svg><span class="fm-enlace__largo">{{ t('UAP en Facebook') }}</span><span class="fm-enlace__corto">Facebook</span>
        </a>
      </div>
      <ul class="fm-leyenda fm-vidrio" :class="{ 'is-oculto': esCelular && ficha }" :aria-label="t('Leyenda del mapa')">
        <li><i class="fm-ley fm-ley--n" aria-hidden="true"></i>{{ t('Pendiente') }}</li>
        <li><i class="fm-ley fm-ley--p" aria-hidden="true"></i>{{ t('En evaluación') }}</li>
        <li><i class="fm-ley fm-ley--e" aria-hidden="true"></i>{{ t('Evaluado') }}</li>
      </ul>
      <div class="fm-info">
        <span v-if="resumen && resumen.total" class="fm-info__progreso">
          <span class="fm-info__barra" aria-hidden="true"><span :style="{ transform: `scaleX(${resumen.evaluados / resumen.total})` }"></span></span>
          {{ t('{a} de {b} evaluados', { a: numero(resumen.evaluados), b: numero(resumen.total) }) }}
        </span>
        <span class="fm-info__ayuda">{{ t('Toque un stand para ver su proyecto') }}</span>
        <span v-if="visitasTexto" class="fm-info__visitas">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>{{ visitasTexto }}
        </span>
      </div>
    </div>

    <VisorVideo v-if="tvuAbierta && urlTvu" :titulo="t('TVU · Transmisión en vivo')" :url="urlTvu" :enlace="urlTvu" iframe vivo
      sandbox="allow-scripts allow-same-origin allow-presentation" @cerrar="tvuAbierta = false" />
    <div v-if="mapaBloqueado" class="fm-pronto" role="dialog" aria-modal="true" aria-labelledby="fm-pronto-titulo">
      <div class="fm-pronto__caja">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
        <span class="fm-pronto__etiqueta">{{ t('Muy pronto') }}</span>
        <h1 id="fm-pronto-titulo">{{ portada.mapa.titulo }}</h1>
        <p>{{ portada.mapa.texto }}</p>
        <p class="fm-pronto__fecha">{{ fechaCorta }} · {{ portada.lugar }}</p>
        <button type="button" class="fm-pronto__volver" @click="volver">{{ t('Volver a la portada') }}</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.fm {
  --azul-0: #08122b; --azul-1: #0b1736; --azul-2: #0f1f45; --azul-3: #13244f; --rojo: #c8102e; --rojo-2: #e11d2a; --azul: #2563eb;
  --suave: #b9c6e4; --tenue: #8fa3cf; --borde: rgb(255 255 255 / 12%); --vidrio: rgb(11 23 54 / 90%);
  display: flex; flex-direction: column; height: 100dvh; overflow: hidden; background: var(--azul-0);
  color: #fff; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color-scheme: dark;
}
.fm button:focus-visible, .fm a:focus-visible, .fm input:focus-visible { outline: 3px solid #f5c518; outline-offset: 2px; }
.fm-vidrio { border: 1px solid var(--borde); border-radius: 12px; background: var(--vidrio); box-shadow: 0 8px 24px rgb(0 0 0 / 35%); }
@media (hover: hover) and (min-width: 701px) {
  .fm-vidrio { background: rgb(11 23 54 / 80%); backdrop-filter: blur(8px); }
}
.is-oculto { display: none !important; }

/* Barra superior */
.fm-cab { display: flex; flex: none; align-items: center; gap: 14px; height: 56px; border-bottom: 1px solid var(--borde); background: var(--azul-1); padding: 0 14px; }
/* Mapa aún no habilitado: aviso sobre todo el mapa. */
.fm-pronto { position: fixed; z-index: 2000; inset: 0; display: grid; place-items: center; background: rgb(8 16 38 / 92%); padding: 20px; }
.fm-pronto__caja { width: min(460px, 100%); border: 1px solid var(--borde); border-radius: 18px; background: var(--azul-1); padding: 30px 26px; text-align: center; box-shadow: 0 20px 50px rgb(0 0 0 / 45%); }
.fm-pronto__caja > svg { width: 46px; height: 46px; fill: none; stroke: #ff8a96; stroke-width: 1.6; stroke-linejoin: round; }
.fm-pronto__etiqueta { display: block; width: max-content; margin: 12px auto 8px; border-radius: 999px; background: rgb(200 16 46 / 22%); padding: 3px 12px; color: #ffb3bd; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.fm-pronto h1 { margin: 0 0 10px; color: #fff; font-size: clamp(20px, 4vw, 26px); font-weight: 900; line-height: 1.2; }
.fm-pronto p { margin: 0 0 10px; color: #c9d3ea; font-size: 15px; line-height: 1.5; }
.fm-pronto__fecha { font-size: 13.5px !important; color: #9fb0d6 !important; }
.fm-pronto__volver { margin-top: 10px; border: 0; border-radius: 12px; background: #c8102e; padding: 12px 22px; color: #fff; font-size: 15px; font-weight: 800; cursor: pointer; }
.fm-pronto__volver:hover { background: #e11d2a; }
.fm-cab__volver { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--borde); border-radius: 9px; background: var(--azul-2); padding: 6px 11px 6px 7px; color: #e8edf8; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.fm-cab__volver:hover { background: #1b3168; }
.fm-cab__volver svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.fm-cab__marca { font-size: 24px; }
.fm-cab__estado { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.fm-cab__fecha { border-radius: 8px; background: #1f4fa8; padding: 5px 11px; font-size: 13.5px; font-weight: 800; white-space: nowrap; }
.fm-pastilla { display: inline-flex; align-items: center; gap: 7px; border-radius: 8px; background: var(--rojo); padding: 5px 11px; font-size: 13px; font-weight: 800; letter-spacing: .03em; white-space: nowrap; }
.fm-pastilla i { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: fm-latir 1.6s ease-in-out infinite; }
.fm-pastilla--pronto { border: 1px solid rgb(200 16 46 / 60%); background: rgb(200 16 46 / 18%); color: #ffd0d5; }
.fm-pastilla--fin { background: #334155; }
.fm-pastilla--off { max-width: 260px; overflow: hidden; background: #8a4b0f; letter-spacing: 0; text-overflow: ellipsis; }

/* Mapa */
.fm__marco { position: relative; flex: 1; min-height: 0; }
.fm__mapa { position: absolute; inset: 0; isolation: isolate; background: #0e1f4d; }

/* Buscador */
.fm-buscar { position: absolute; z-index: 600; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 8px; width: min(420px, calc(100% - 84px)); padding: 8px; }
.fm-buscar__caja { display: flex; align-items: center; border: 1px solid rgb(255 255 255 / 14%); border-radius: 9px; background: rgb(8 18 43 / 70%); }
.fm-buscar__caja:focus-within { border-color: #4f74c9; }
.fm-buscar__caja svg { width: 18px; height: 18px; flex: none; margin-left: 11px; fill: none; stroke: var(--tenue); stroke-width: 2.2; stroke-linecap: round; }
.fm-buscar__caja input { width: 100%; min-width: 0; border: 0; background: transparent; padding: 10px 10px 10px 8px; color: #fff; font-size: 14.5px; outline: none; }
.fm-buscar__caja input::placeholder { color: var(--tenue); }
.fm-buscar__caja input::-webkit-search-cancel-button { display: none; }
.fm-buscar__borrar { flex: none; margin-right: 4px; border: 0; background: none; padding: 6px 8px; color: var(--tenue); font-size: 14px; cursor: pointer; }
.fm-buscar__resultados { display: flex; flex-direction: column; gap: 2px; max-height: min(360px, 50dvh); margin: 0; overflow-y: auto; padding: 0; list-style: none; }
.fm-buscar__resultados button { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-radius: 8px; background: none; padding: 7px 8px; color: inherit; text-align: left; cursor: pointer; }
.fm-buscar__resultados button:hover:not(:disabled) { background: rgb(255 255 255 / 7%); }
.fm-buscar__resultados button:disabled { opacity: .55; cursor: default; }
.fm-buscar__num { display: flex; flex: none; flex-direction: column; align-items: center; min-width: 46px; border-radius: 7px; background: var(--azul-3); padding: 2px 5px; font-size: 15px; font-weight: 800; line-height: 1.1; }
.fm-buscar__num small { color: var(--tenue); font-size: 8px; letter-spacing: .12em; }
.fm-buscar__texto { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.fm-buscar__texto strong, .fm-buscar__texto small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fm-buscar__texto strong { font-size: 13.5px; }
.fm-buscar__texto small { color: var(--tenue); font-size: 12px; }
.fm-buscar__nota { flex: none; color: var(--tenue); font-size: 11px; }
.fm-buscar__vacio { padding: 8px; color: var(--tenue); font-size: 13px; text-align: center; }
.fm-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.fm-chips::-webkit-scrollbar { display: none; }
.fm-chip { display: inline-flex; flex: none; align-items: center; gap: 6px; border: 1px solid rgb(255 255 255 / 16%); border-radius: 999px; background: rgb(19 36 79 / 85%); padding: 5px 12px; color: #e8edf8; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; }
.fm-chip i { width: 9px; height: 9px; border-radius: 2px; background: var(--c, #64748b); }
.fm-chip[aria-pressed='true'] { border-color: #e8edf8; background: #2a437f; color: #fff; }
.fm-chip--limpiar { border-color: rgb(225 29 42 / 50%); color: #ffc2c8; }

/* Controles */
.fm-controles { position: absolute; z-index: 600; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 6px; }
.fm-controles button { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid var(--borde); border-radius: 9px; background: var(--vidrio); color: #e8edf8; cursor: pointer; box-shadow: 0 4px 12px rgb(0 0 0 / 30%); }
.fm-controles button:hover { background: #1b3168; }
.fm-controles svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.fm-aviso { position: absolute; z-index: 600; left: 50%; top: 45%; display: flex; flex-direction: column; gap: 4px; width: min(340px, calc(100% - 32px)); transform: translate(-50%, -50%); padding: 16px; text-align: center; }
.fm-aviso strong { font-size: 18px; }
.fm-aviso span { color: var(--suave); }

/* Ficha */
.fm-ficha { position: absolute; z-index: 700; top: 50%; right: 64px; display: flex; flex-direction: column; width: 340px; max-height: calc(100% - 150px); overflow-y: auto; padding: 18px 18px 16px; translate: 0 -50%; animation: fm-entrar .22s ease-out; }
.fm-ficha__asa { display: none; }
.fm-ficha__cerrar { position: absolute; top: 10px; right: 10px; display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid var(--borde); border-radius: 8px; background: rgb(8 18 43 / 60%); color: #fff; font-size: 14px; cursor: pointer; }
.fm-ficha h2 { margin: 0 34px 8px 0; font-size: 20px; font-weight: 900; line-height: 1.2; text-transform: uppercase; outline: none; }
.fm-ficha__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.fm-ficha__stand { border-radius: 7px; background: var(--azul); padding: 3px 10px; font-size: 13px; font-weight: 800; letter-spacing: .03em; }
.fm-ficha__estado { border-radius: 7px; padding: 3px 10px; font-size: 13px; font-weight: 700; }
.fm-estado--n { background: rgb(148 163 184 / 22%); color: #dbe3f2; }
.fm-estado--p { background: rgb(201 138 18 / 25%); color: #f6d58b; }
.fm-estado--e { background: rgb(200 16 46 / 30%); color: #ffc2c8; }
.fm-ficha__categoria { display: flex; align-items: center; gap: 7px; margin: 10px 0 8px; color: #e8edf8; font-size: 14px; }
.fm-ficha__categoria i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.fm-ficha dl { display: grid; grid-template-columns: 1fr; gap: 0; margin: 0; font-size: 14px; }
.fm-ficha dt { margin-top: 6px; color: var(--tenue); font-size: 12.5px; }
.fm-ficha dd { margin: 0; font-weight: 700; text-transform: uppercase; }
.fm-ficha__equipo { margin: 0; padding-left: 16px; font-weight: 500; text-transform: none; }
.fm-ficha__nota { margin: 12px 0 0; border-radius: 8px; background: rgb(245 197 24 / 12%); padding: 6px 10px; color: #f6d58b; font-size: 13px; }
.fm-ficha__ruta { margin: 12px 0 0; border: 1px solid rgb(107 155 255 / 35%); border-radius: 9px; background: rgb(37 99 235 / 12%); padding: 6px 10px; color: #c7d7ff; font-size: 14px; font-weight: 700; }
.fm-ficha__ruta.is-error { border-color: rgb(245 197 24 / 40%); background: rgb(245 197 24 / 10%); color: #f6d58b; }
.fm-ficha__acciones { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.fm-ficha__ir { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 10px; background: var(--azul); padding: 12px; color: #fff; font-size: 15.5px; font-weight: 800; box-shadow: 0 6px 16px rgb(37 99 235 / 28%); cursor: pointer; }
.fm-ficha__ir:hover { background: #3474f0; }
.fm-ficha__ir svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; }
.fm-ficha__ir--fin { background: #24324f; box-shadow: none; }
.fm-ficha__gmaps { color: var(--suave); font-size: 13px; font-weight: 600; text-align: center; }

/* Abajo */
.fm-enlaces { position: absolute; z-index: 600; bottom: 22px; left: 12px; display: flex; flex-direction: column; gap: 8px; }
.fm-enlace { display: inline-flex; align-items: center; gap: 9px; border: 0; border-radius: 10px; padding: 10px 15px; color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; box-shadow: 0 6px 16px rgb(0 0 0 / 35%); cursor: pointer; }
.fm-enlace:hover { color: #fff; filter: brightness(1.08); }
.fm-enlace--tvu { background: #a70f27; }
.fm-enlace__corto { display: none; }
.fm-enlace__corto b { margin-left: 2px; border-radius: 4px; background: #fff; padding: 1px 5px; color: #a70f27; font-size: 10.5px; font-weight: 900; letter-spacing: .03em; }
.fm-enlace--fb { background: #2a4f9e; }
.fm-enlace svg { width: 17px; height: 17px; fill: currentColor; }
.fm-leyenda { position: absolute; z-index: 600; bottom: 22px; left: 50%; display: flex; gap: 16px; margin: 0; padding: 7px 14px; font-size: 13px; list-style: none; transform: translateX(-50%); white-space: nowrap; }
.fm-leyenda li { display: inline-flex; align-items: center; gap: 6px; }
.fm-ley { width: 10px; height: 10px; border-radius: 50%; }
.fm-ley--n { background: #2c56c9; }
.fm-ley--p { background: #c98a12; }
.fm-ley--e { background: #c8102e; }
.fm-info { position: absolute; z-index: 590; right: 12px; bottom: 26px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; color: #e8edf8; font-size: 13px; text-shadow: 0 1px 3px rgb(0 0 0 / 70%); pointer-events: none; }
.fm-info__progreso, .fm-info__visitas { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--borde); border-radius: 999px; background: var(--vidrio); padding: 4px 11px; text-shadow: none; }
.fm-info__barra { position: relative; width: 60px; height: 5px; overflow: hidden; border-radius: 999px; background: #24324f; }
.fm-info__barra span { position: absolute; inset: 0; background: var(--rojo-2); transform-origin: left; transition: transform .6s ease; }
.fm-info__visitas svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; }
@keyframes fm-latir { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes fm-entrar { from { opacity: 0; } to { opacity: 1; } }

@media (max-width: 1100px) {
  .fm-info__ayuda { display: none; }
  .fm-ficha { width: 310px; }
}
@media (max-width: 900px) {
  .fm-info { bottom: 70px; }
}
/* Celular: ficha como hoja inferior, enlaces solo con ícono. */
@media (max-width: 700px) {
  .fm-cab { gap: 8px; height: 50px; padding: 0 8px; }
  .fm-cab__volver span, .fm-cab__fecha { display: none; }
  .fm-cab__volver { padding: 6px; }
  .fm-cab__marca { font-size: 19px; }
  .fm-buscar { top: 8px; left: 8px; width: calc(100% - 66px); padding: 6px; gap: 6px; }
  .fm-controles { top: 8px; right: 8px; }
  .fm-controles button { width: 40px; height: 40px; }
  .fm-ficha { top: auto; right: 0; bottom: 0; left: 0; width: auto; max-height: 64%; border-radius: 16px 16px 0 0; padding: 6px 16px calc(14px + env(safe-area-inset-bottom)); translate: none; }
  .fm-ficha__asa { display: block; width: 40px; height: 4px; margin: 2px auto 8px; border-radius: 999px; background: #3a4a72; }
  .fm-ficha__cerrar { top: 12px; }
  .fm-ficha h2 { font-size: 18px; }
  .fm-enlaces { bottom: 54px; left: 8px; }
  .fm-enlace { height: 42px; gap: 6px; border-radius: 999px; padding: 0 14px 0 11px; font-size: 13px; }
  .fm-enlace svg { width: 19px; height: 19px; }
  .fm-enlace__largo { display: none; }
  .fm-enlace__corto { display: inline; }
  .fm-leyenda { bottom: 10px; gap: 12px; padding: 6px 12px; font-size: 12px; }
  .fm-info { display: none; }
}
/* Celular: con el selector de idioma, la cabecera deja «ECUANA V5» y la pastilla se recorta si no cabe. */
@media (max-width: 480px) {
  .fm-cab__marca :deep(.mf__resto) { display: none; }
  .fm-cab__estado { min-width: 0; }
  .fm-pastilla { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
}
@media (max-width: 360px) {
  .fm-cab { gap: 6px; }
  .fm-leyenda { gap: 8px; padding: 5px 9px; font-size: 11px; }
  .fm-pastilla { padding: 4px 8px; font-size: 12px; letter-spacing: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .fm-pastilla i, .fm-ficha { animation: none; }
  .fm-info__barra span { transition: none; }
}
</style>

<!-- Sin scoped: Leaflet crea teselas, ondas y capas SVG fuera del árbol del componente. Prefijo `fm-`. -->
<style>
/* Cartografía oscura con un filtro (las mismas teselas, sin bajar otras): azul marino sobrio. */
/* Algo transparente sobre el fondo azul marino del mapa: tiñe la cartografía sin bajar nada más. */
.fm-teselas { filter: invert(.92) hue-rotate(198deg) brightness(1.02) contrast(.86) saturate(.55); opacity: .8; }
.fm-teselas img { background: #e5e5e5; }
.fm__mapa .leaflet-control-attribution { background: rgb(8 18 43 / 70%); color: #7f93c2; font-size: 10px; }
.fm__mapa .leaflet-control-attribution a { color: #a9bce6; }
.fm-onda i { position: absolute; top: -14px; left: -14px; width: 28px; height: 28px; border-radius: 50%; pointer-events: none; }
.fm-onda--p i { border: 1.5px solid #e2b24f; animation: fm-onda 2s ease-out infinite; }
.fm-onda--e i { border: 2px solid #e5566a; background: rgb(200 16 46 / 20%); animation: fm-onda 1.6s ease-out 1 forwards; }
.fm-resaltado { animation: fm-resaltado 1.8s ease-in-out infinite; }
@keyframes fm-onda { 0% { transform: scale(.5); opacity: .9; } 100% { transform: scale(1.8); opacity: 0; } }
@keyframes fm-resaltado { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

/* Stand elegido: anillo rojo con un arco azul y pulso suave (solo transform/opacity). */
.fm-sel-icono { border: 0; background: none; }
.fm-sel { position: absolute; top: 0; left: 0; width: 66px; height: 66px; transform: translate(-50%, -50%); pointer-events: none; }
.fm-sel__anillo { position: absolute; inset: 9px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 3px solid #e11d2a; border-radius: 50%;
  background: rgb(11 23 54 / 88%); color: #fff; box-shadow: 0 4px 12px rgb(0 0 0 / 45%), 0 0 0 3px rgb(225 29 42 / 16%); animation: fm-sel-entra .35s ease-out; }
.fm-sel__anillo small { font: 800 7px/1 system-ui, sans-serif; letter-spacing: .06em; }
.fm-sel__anillo b { font: 900 16px/1.05 system-ui, sans-serif; }
.fm-sel__anillo b.fm-sel__largo { font-size: 10.5px; }
.fm-sel__arco { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: #3b82f6; stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 96 193; animation: fm-sel-gira 6s linear infinite; }
.fm-sel__pulso { position: absolute; inset: 9px; border: 2px solid #e11d2a; border-radius: 50%; animation: fm-sel-pulso 2.4s ease-out infinite; }
.fm-sel--p .fm-sel__anillo { border-color: #e11d2a; }
/* Mi posición (ruta) y la línea hasta el stand. */
.fm-yo i { position: absolute; top: -8px; left: -8px; width: 16px; height: 16px; border: 3px solid #fff; border-radius: 50%; background: #2563eb; box-shadow: 0 0 0 5px rgb(37 99 235 / 25%); }
@keyframes fm-sel-entra { from { transform: scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes fm-sel-gira { to { transform: rotate(360deg); } }
@keyframes fm-sel-pulso { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(1.45); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .fm-onda i, .fm-resaltado, .fm-sel__anillo, .fm-sel__arco { animation: none; }
  .fm-sel__pulso { display: none; }
}
</style>
