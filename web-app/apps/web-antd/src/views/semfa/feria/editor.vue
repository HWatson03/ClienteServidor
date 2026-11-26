<script setup lang="ts">
/**
 * Editor del mapa de la feria (FEXCOIN): ubica cada proyecto inscrito como un stand rectangular en
 * metros sobre el plano, con su número, y configura la pantalla pública `/feria` (vista inicial,
 * límites, lema, enlaces, colores, zonas de referencia y publicación).
 *
 * - Stands y zonas: centro + ancho × alto (m) + rotación; `L.polygon` con renderer canvas (fluido
 *   con 400). Mover arrastrando, asas para redimensionar y girar, selección múltiple con Ctrl/Shift
 *   o recuadro (Shift + arrastrar en el mapa vacío), flechas para mover fino, Supr para quitar.
 * - «Colocar en cuadrícula»: varios proyectos alineados y numerados de una vez (A-1, A-2…).
 * - Los cambios quedan pendientes y se guardan en bloque (solo los stands cambiados).
 */
import type { ConfigFeriaRequest, FeriaAdmin, LimitesFeria, StandAdmin, ZonaFeria } from '#/api/feria';
import type { EtiquetaMapa, RectMetros } from '#/components/semfa/mapa-stands';

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { Button, Checkbox, Input, InputNumber, Select, Switch, Tooltip } from 'ant-design-vue';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { guardarConfigFeria, guardarStandsFeria, obtenerFeriaAdmin, precargarTeselasFeria } from '#/api/feria';
import { ATRIBUCION_OSM, CapaCartografia } from '#/components/semfa/capa-cartografia';
import { CapaEtiquetas, desplazar, diferenciaMetros, esquinasRect, normalizarAngulo, rotar } from '#/components/semfa/mapa-stands';
import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import EditorPortada from './partes/editor-portada.vue';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, confirmar } from '#/composables/useAvisos';
import { normalizarTexto } from '#/utils/formato';

defineOptions({ name: 'SemfaFeriaEditor' });

type Stand = StandAdmin;
type Item = Stand | ZonaFeria;
type Campo = 'alto' | 'ancho' | 'rotacion';
interface ConfigLocal {
  centroLat: number; centroLng: number; zoom: number; limites: LimitesFeria | null;
  lema: string; urlFacebook: string; urlTransmision: string; publicado: boolean;
}
type Operacion =
  | { clave: string; inicio: L.LatLng; items: { clave: string; lat: number; lng: number }[]; multi: boolean; tipo: 'mover' }
  | { clave: string; fija: L.LatLngTuple; tipo: 'redimensionar' }
  | { clave: string; tipo: 'rotar' }
  | { agregar: boolean; inicio: L.LatLng; marco: L.Rectangle; tipo: 'recuadro' };

const CENTRO_DEFECTO: L.LatLngTuple = [-11.0264, -68.757];
const MAX_DESHACER = 60;
const TIPOS_ZONA = [
  { nombre: 'Escenario', color: '#7c3aed', ancho: 12, alto: 8 },
  { nombre: 'Ingreso', color: '#059669', ancho: 8, alto: 4 },
  { nombre: 'Salida', color: '#0d9488', ancho: 8, alto: 4 },
  { nombre: 'Baños', color: '#0891b2', ancho: 6, alto: 4 },
  { nombre: 'Primeros auxilios', color: '#dc2626', ancho: 5, alto: 4 },
  { nombre: 'Información', color: '#1d4ed8', ancho: 5, alto: 4 },
  { nombre: 'Patio de comidas', color: '#ea580c', ancho: 14, alto: 8 },
  { nombre: 'Jurados', color: '#475569', ancho: 8, alto: 5 },
];

const { idActividad, nombreActividad, store } = useActividadTrabajo();
const router = useRouter();

const cargando = ref(false);
const guardando = ref(false);
const datos = shallowRef<FeriaAdmin | null>(null);
const stands = shallowRef<Stand[]>([]);
const zonas = shallowRef<ZonaFeria[]>([]);
const config = ref<ConfigLocal>({ centroLat: CENTRO_DEFECTO[0], centroLng: CENTRO_DEFECTO[1], zoom: 18, limites: null, lema: '', urlFacebook: '', urlTransmision: '', publicado: false });
const colores = ref<Record<string, string>>({});
/** Sube con cada cambio: los stands y zonas se mutan en sitio (no son reactivos uno por uno). */
const version = ref(0);
const seleccion = ref<string[]>([]);
const pestana = ref<'mapa' | 'portada' | 'proyectos' | 'zonas'>('proyectos');
/** La pestaña «Portada» tiene cambios sin guardar (se guarda aparte, con su propio botón). */
const portadaSucia = ref(false);
const busqueda = ref('');
const filtroCategoria = ref<null | number>(null);
const filtroJornada = ref<null | number>(null);
const soloSinUbicar = ref(false);
const colocando = ref<null | number>(null);
const defecto = ref({ alto: 3, ancho: 3, rotacion: 0 });
const grilla = ref({
  abierta: false, alto: 3, ancho: 3, angulo: 0, columnas: 10, desde: 1, fuente: 'sel',
  inicio: null as null | { lat: number; lng: number }, numerar: true, orden: 'stand' as 'categoria' | 'lista' | 'nombre' | 'stand',
  prefijo: 'A-', sepX: 0.5, sepY: 3, soloSinUbicar: true,
});
const esperandoInicio = ref(false);
const precargando = ref(false);
const puedeDeshacer = ref(false);
const mapaElemento = ref<HTMLDivElement>();

let originalStands = new Map<number, string>();
let originalConfig = '';
let standsPorId = new Map<number, Stand>();
let zonasPorId = new Map<string, ZonaFeria>();
let ancla: null | number = null;
let actividadVista: number | undefined;
let revirtiendo = false;
const pilaDeshacer: { config: string; stands: [number, string][] }[] = [];

let mapa: L.Map | undefined;
let lienzo: L.Canvas | undefined;
let vectorial: L.SVG | undefined;
let capaZonas: L.LayerGroup | undefined;
let capaStands: L.LayerGroup | undefined;
let capaAsas: L.LayerGroup | undefined;
let capaPrevia: L.LayerGroup | undefined;
let capaLimites: L.LayerGroup | undefined;
let etiquetas: CapaEtiquetas | undefined;
const poligonos = new Map<string, L.Polygon>();
let op: null | Operacion = null;
let movido = false;
let cuadroMover = 0;
let ultimoPunto: L.LatLng | null = null;
/** Tras arrastrar, el `click` que sigue al soltar no debe deseleccionar. */
let ignorarClicHasta = 0;
let shiftPulsado = false;
let observador: ResizeObserver | undefined;

// ------------------------------------------------------------------ utilidades

const claveStand = (id: number) => `s${id}`;
const claveZona = (id: string) => `z${id}`;
const esClaveZona = (clave: string) => clave.startsWith('z');
function itemDe(clave: string): Item | undefined {
  return esClaveZona(clave) ? zonasPorId.get(clave.slice(1)) : standsPorId.get(Number(clave.slice(1)));
}
const ubicado = (it: Item | undefined): it is Item & { lat: number; lng: number } =>
  Boolean(it) && it!.lat !== null && it!.lng !== null;
const redondear = (v: number, paso = 0.1) => Number((Math.round(v / paso) * paso).toFixed(2));
const recortar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const nuevoIdZona = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const colorCategoria = (id: number) => colores.value[String(id)] ?? '#64748b';
const comparadorNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function firmaStand(s: Stand) {
  return JSON.stringify([s.stand ?? null, s.lat, s.lng, s.ancho, s.alto, s.rotacion]);
}
function firmaConfig() {
  return JSON.stringify([config.value, zonas.value, colores.value]);
}
function esPendiente(s: Stand) {
  return originalStands.get(s.idInscripcion) !== firmaStand(s);
}

const cambiosStands = computed(() => {
  void version.value;
  return stands.value.filter(esPendiente);
});
const configCambiada = computed(() => {
  void version.value;
  return firmaConfig() !== originalConfig;
});
const pendientes = computed(() => cambiosStands.value.length + (configCambiada.value ? 1 : 0));
const categorias = computed(() => datos.value?.categorias ?? []);
const jornadas = computed(() => {
  const max = Math.max(datos.value?.jornadas ?? 1, ...stands.value.map((s) => s.jornada ?? 1));
  return Array.from({ length: max }, (_, i) => i + 1);
});
const resumen = computed(() => {
  void version.value;
  const total = stands.value.length;
  const ubicados = stands.value.filter((s) => s.lat !== null).length;
  const sinNumero = stands.value.filter((s) => !s.stand?.trim()).length;
  const vistos = new Map<string, number>();
  for (const s of stands.value) {
    const n = s.stand?.trim().toUpperCase();
    if (n) vistos.set(n, (vistos.get(n) ?? 0) + 1);
  }
  const repetidos = new Set([...vistos].filter(([, c]) => c > 1).map(([n]) => n));
  return { repetidos, sinNumero, total, ubicados };
});

const listaFiltrada = computed(() => {
  void version.value;
  const q = normalizarTexto(busqueda.value.trim());
  return stands.value
    .filter((s) => (filtroCategoria.value === null || s.idCategoria === filtroCategoria.value)
      && (filtroJornada.value === null || (s.jornada ?? 1) === filtroJornada.value)
      && (!soloSinUbicar.value || s.lat === null)
      && (!q || normalizarTexto(`${s.stand ?? ''} ${s.proyecto ?? ''} ${s.carrera ?? ''} ${s.categoria}`).includes(q)))
    .sort((a, b) => Number(a.lat !== null) - Number(b.lat !== null)
      || comparadorNatural.compare(a.stand ?? '~', b.stand ?? '~')
      || comparadorNatural.compare(a.proyecto ?? '', b.proyecto ?? ''));
});

const seleccionSet = computed(() => new Set(seleccion.value));
const seleccionados = computed(() => {
  void version.value;
  return seleccion.value.map(itemDe).filter((x): x is Item => Boolean(x));
});
const unico = computed(() => (seleccionados.value.length === 1 ? seleccionados.value[0]! : null));
const unicoStand = computed(() => (unico.value && 'idInscripcion' in unico.value ? unico.value : null));
const unicaZona = computed(() => (unico.value && !('idInscripcion' in unico.value) ? unico.value : null));
const standColocando = computed(() => (colocando.value === null ? null : standsPorId.get(colocando.value) ?? null));
const urlPublica = computed(() => (idActividad.value ? router.resolve({ path: '/fexcoin-vivo' }).href : ''));

// ------------------------------------------------------------------ carga y guardado

function aplicarDatos(d: FeriaAdmin, recentrar: boolean) {
  datos.value = d;
  stands.value = d.stands.map((s) => ({ ...s }));
  standsPorId = new Map(stands.value.map((s) => [s.idInscripcion, s]));
  const crudas = Array.isArray(d.mapa.zonas) ? d.mapa.zonas : [];
  zonas.value = crudas
    .filter((z) => z && Number.isFinite(z.lat) && Number.isFinite(z.lng))
    .map((z) => ({
      alto: Number(z.alto) || 4, ancho: Number(z.ancho) || 4, color: z.color || '#475569', id: String(z.id || nuevoIdZona()),
      lat: z.lat, lng: z.lng, nombre: z.nombre || 'Zona', rotacion: Number(z.rotacion) || 0, tipo: z.tipo === 'etiqueta' ? 'etiqueta' : 'rect',
    }));
  zonasPorId = new Map(zonas.value.map((z) => [z.id, z]));
  config.value = {
    centroLat: d.mapa.centroLat, centroLng: d.mapa.centroLng, zoom: d.mapa.zoom, limites: d.mapa.limites,
    lema: d.mapa.lema ?? '', urlFacebook: d.mapa.urlFacebook ?? '', urlTransmision: d.mapa.urlTransmision ?? '', publicado: d.mapa.publicado,
  };
  colores.value = Object.fromEntries(d.categorias.map((c) => [String(c.id), c.color]));
  originalStands = new Map(stands.value.map((s) => [s.idInscripcion, firmaStand(s)]));
  originalConfig = firmaConfig();
  pilaDeshacer.length = 0;
  puedeDeshacer.value = false;
  seleccion.value = seleccion.value.filter((k) => itemDe(k));
  if (colocando.value !== null && !standsPorId.has(colocando.value)) colocando.value = null;
  version.value++;
  redibujarTodo();
  if (recentrar) mapa?.setView([d.mapa.centroLat, d.mapa.centroLng], d.mapa.zoom, { animate: false });
}

async function cargar() {
  const id = idActividad.value;
  if (id === undefined) { datos.value = null; stands.value = []; zonas.value = []; redibujarTodo(); return; }
  cargando.value = true;
  try {
    const d = await obtenerFeriaAdmin(id);
    aplicarDatos(d, actividadVista !== id);
    actividadVista = id;
  } catch { /* el interceptor ya avisó */ } finally {
    cargando.value = false;
  }
}

function cuerpoConfig(): ConfigFeriaRequest {
  const c = config.value;
  return {
    centroLat: c.centroLat, centroLng: c.centroLng, colores: colores.value, lema: c.lema.trim() || null, limites: c.limites,
    publicado: c.publicado, urlFacebook: c.urlFacebook.trim() || null, urlTransmision: c.urlTransmision.trim() || null,
    zonas: zonas.value.length ? zonas.value : null, zoom: c.zoom,
  };
}

const urlInvalida = (u: string) => Boolean(u.trim()) && !/^https:\/\/\S+$/.test(u.trim());

async function guardar() {
  const id = idActividad.value;
  if (id === undefined || guardando.value || !pendientes.value) return;
  if (urlInvalida(config.value.urlFacebook) || urlInvalida(config.value.urlTransmision)) {
    pestana.value = 'mapa';
    avisar({ tipo: 'advertencia', titulo: 'Enlace no válido', mensaje: 'Los enlaces de Facebook y TVU deben empezar con https://' });
    return;
  }
  guardando.value = true;
  try {
    const lista = cambiosStands.value.map((s) => ({
      alto: s.alto, ancho: s.ancho, idInscripcion: s.idInscripcion, lat: s.lat, lng: s.lng, rotacion: s.rotacion,
      stand: s.stand?.trim() || null,
    }));
    let respuesta: FeriaAdmin | undefined;
    if (lista.length) respuesta = await guardarStandsFeria(id, lista);
    const conConfig = configCambiada.value;
    if (conConfig) respuesta = await guardarConfigFeria(id, cuerpoConfig());
    if (respuesta) aplicarDatos(respuesta, false);
    const partes = [lista.length ? `${lista.length} stand${lista.length === 1 ? '' : 's'}` : '', conConfig ? 'configuración' : ''].filter(Boolean);
    avisar({
      tipo: 'exito', titulo: 'Mapa guardado',
      mensaje: `${partes.join(' y ')}. ${config.value.publicado ? 'Visible en /feria.' : 'El mapa no está publicado.'}`,
    });
  } catch { /* el interceptor ya avisó; lo no guardado sigue pendiente */ } finally {
    guardando.value = false;
  }
}

async function descartar() {
  if (!pendientes.value) return;
  const ok = await confirmar({ mensaje: `Se perderán ${pendientes.value} cambio(s) sin guardar.`, peligro: true, textoAceptar: 'Descartar', titulo: '¿Descartar cambios?' });
  if (ok) await cargar();
}

// ------------------------------------------------------------------ deshacer

function guardarDeshacer() {
  pilaDeshacer.push({ config: JSON.stringify(zonas.value), stands: stands.value.map((s) => [s.idInscripcion, firmaStand(s)]) });
  if (pilaDeshacer.length > MAX_DESHACER) pilaDeshacer.shift();
  puedeDeshacer.value = true;
}
function deshacer() {
  const ultimo = pilaDeshacer.pop();
  puedeDeshacer.value = pilaDeshacer.length > 0;
  if (!ultimo) return;
  for (const [id, firma] of ultimo.stands) {
    const s = standsPorId.get(id);
    if (!s || firmaStand(s) === firma) continue;
    const [stand, lat, lng, ancho, alto, rotacion] = JSON.parse(firma) as [null | string, null | number, null | number, number, number, number];
    Object.assign(s, { alto, ancho, lat, lng, rotacion, stand });
  }
  zonas.value = JSON.parse(ultimo.config) as ZonaFeria[];
  zonasPorId = new Map(zonas.value.map((z) => [z.id, z]));
  seleccion.value = seleccion.value.filter((k) => itemDe(k));
  version.value++;
  redibujarTodo();
}

// ------------------------------------------------------------------ dibujo

function estiloDe(clave: string, it: Item): L.PathOptions {
  const seleccionado = seleccionSet.value.has(clave);
  if (!('idInscripcion' in it)) {
    const etiqueta = it.tipo === 'etiqueta';
    return {
      color: seleccionado ? '#facc15' : it.color, dashArray: '6 4', fillColor: it.color,
      fillOpacity: etiqueta ? 0.04 : 0.18, opacity: etiqueta && !seleccionado ? 0.5 : 1, weight: seleccionado ? 3 : 1.5,
    };
  }
  const c = colorCategoria(it.idCategoria);
  return {
    color: seleccionado ? '#facc15' : '#0f172a', dashArray: esPendiente(it) ? '3 2' : undefined,
    fillColor: c, fillOpacity: 0.7, opacity: seleccionado ? 1 : 0.55, weight: seleccionado ? 3 : 1,
  };
}

function dibujar(clave: string) {
  const it = itemDe(clave);
  let p = poligonos.get(clave);
  if (!ubicado(it)) {
    p?.remove();
    poligonos.delete(clave);
    return;
  }
  const esquinas = esquinasRect(it as RectMetros);
  if (p) {
    p.setLatLngs(esquinas);
    p.setStyle(estiloDe(clave, it));
    return;
  }
  p = L.polygon(esquinas, { ...estiloDe(clave, it), bubblingMouseEvents: false, renderer: lienzo });
  p.on('mousedown', (e) => alPresionarItem(clave, e as L.LeafletMouseEvent));
  // Sin oyente de `click`, Leaflet pasa el clic al mapa y este deseleccionaría.
  p.on('click', consumirClic);
  if (esClaveZona(clave)) { p.addTo(capaZonas!); p.bringToBack(); } else p.addTo(capaStands!);
  poligonos.set(clave, p);
}

function restilar() {
  for (const [clave, p] of poligonos) {
    const it = itemDe(clave);
    if (it) p.setStyle(estiloDe(clave, it));
  }
}

function refrescarEtiquetas() {
  if (!etiquetas) return;
  const items: EtiquetaMapa[] = [];
  for (const z of zonas.value) items.push({ ...z, color: z.tipo === 'etiqueta' ? '#1d3f9a' : '#1e293b', texto: z.nombre, tipo: 'zona' });
  for (const s of stands.value) {
    if (s.lat === null || s.lng === null) continue;
    items.push({ alto: s.alto, ancho: s.ancho, color: '#fff', lat: s.lat, lng: s.lng, rotacion: s.rotacion, texto: s.stand?.trim() || '', tipo: 'stand' });
  }
  etiquetas.fijar(items);
}

function dibujarAsas() {
  if (!capaAsas) return;
  capaAsas.clearLayers();
  if (seleccion.value.length !== 1) return;
  const clave = seleccion.value[0]!;
  const it = itemDe(clave);
  if (!ubicado(it)) return;
  const asa = { bubblingMouseEvents: false, color: '#1d3f9a', fillColor: '#fff', fillOpacity: 1, radius: 6, renderer: vectorial, weight: 2 };
  esquinasRect(it).forEach((p, i) => {
    L.circleMarker(p, { ...asa, className: `fe-asa fe-asa--${i % 2 ? 'nesw' : 'nwse'}` })
      .on('mousedown', (e) => iniciarRedimension(clave, i, e as L.LeafletMouseEvent)).on('click', consumirClic).addTo(capaAsas!);
  });
  const alto = it.alto / 2;
  const tope = rotar(0, alto, it.rotacion);
  const brazo = rotar(0, alto + Math.max(1.5, it.alto * 0.35), it.rotacion);
  const puntoTope = desplazar(it.lat, it.lng, tope.e, tope.n);
  const puntoGiro = desplazar(it.lat, it.lng, brazo.e, brazo.n);
  L.polyline([puntoTope, puntoGiro], { color: '#1d3f9a', interactive: false, renderer: vectorial, weight: 1.5 }).addTo(capaAsas);
  L.circleMarker(puntoGiro, { ...asa, className: 'fe-asa fe-asa--giro', fillColor: '#facc15', radius: 7 })
    .on('mousedown', (e) => iniciarRotacion(clave, e as L.LeafletMouseEvent)).on('click', consumirClic).addTo(capaAsas);
}

function dibujarLimites() {
  if (!capaLimites) return;
  capaLimites.clearLayers();
  const l = config.value.limites;
  if (l) {
    L.rectangle([[l.sur, l.oeste], [l.norte, l.este]], {
      color: '#e11d2a', dashArray: '10 6', fill: false, interactive: false, renderer: vectorial, weight: 2,
    }).addTo(capaLimites);
  }
}

function redibujarTodo() {
  if (!mapa) return;
  capaStands?.clearLayers();
  capaZonas?.clearLayers();
  poligonos.clear();
  for (const z of zonas.value) dibujar(claveZona(z.id));
  for (const s of stands.value) dibujar(claveStand(s.idInscripcion));
  refrescarEtiquetas();
  dibujarAsas();
  dibujarLimites();
  dibujarPrevia();
}

/** Tras cada cambio de datos: contador de pendientes, etiquetas y asas al día. */
function trasCambio(claves: Iterable<string> = seleccion.value) {
  for (const k of claves) dibujar(k);
  version.value++;
  refrescarEtiquetas();
  dibujarAsas();
}

// ------------------------------------------------------------------ interacción en el mapa

function consumirClic() { /* el clic ya se resolvió en mousedown */ }

function bloquearArrastre(e: L.LeafletMouseEvent) {
  L.DomEvent.preventDefault(e.originalEvent);
  mapa?.dragging.disable();
}

function alPresionarItem(clave: string, e: L.LeafletMouseEvent) {
  if (e.originalEvent.button !== 0 || esperandoInicio.value) return;
  const multi = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey;
  if (multi) {
    seleccion.value = seleccionSet.value.has(clave) ? seleccion.value.filter((k) => k !== clave) : [...seleccion.value, clave];
    L.DomEvent.preventDefault(e.originalEvent);
    return;
  }
  if (!seleccionSet.value.has(clave)) seleccion.value = [clave];
  if (!esClaveZona(clave)) ancla = Number(clave.slice(1));
  bloquearArrastre(e);
  guardarDeshacer();
  movido = false;
  op = {
    clave, inicio: e.latlng, multi: seleccion.value.length > 1, tipo: 'mover',
    items: seleccion.value.flatMap((k) => {
      const it = itemDe(k);
      return ubicado(it) ? [{ clave: k, lat: it.lat, lng: it.lng }] : [];
    }),
  };
}

function iniciarRedimension(clave: string, esquina: number, e: L.LeafletMouseEvent) {
  const it = itemDe(clave);
  if (!ubicado(it)) return;
  bloquearArrastre(e);
  guardarDeshacer();
  movido = false;
  op = { clave, fija: esquinasRect(it)[(esquina + 2) % 4]!, tipo: 'redimensionar' };
}

function iniciarRotacion(clave: string, e: L.LeafletMouseEvent) {
  bloquearArrastre(e);
  guardarDeshacer();
  movido = false;
  op = { clave, tipo: 'rotar' };
}

function alPresionarMapa(e: L.LeafletMouseEvent) {
  // Shift + arrastrar en vacío = recuadro de selección (Leaflet no arrastra el mapa con Shift).
  if (!e.originalEvent.shiftKey || e.originalEvent.button !== 0 || esperandoInicio.value || colocando.value !== null) return;
  L.DomEvent.preventDefault(e.originalEvent);
  mapa?.dragging.disable();
  movido = false;
  op = {
    agregar: e.originalEvent.ctrlKey || e.originalEvent.metaKey, inicio: e.latlng, tipo: 'recuadro',
    marco: L.rectangle(L.latLngBounds(e.latlng, e.latlng), { color: '#1d4ed8', dashArray: '5 4', fillOpacity: 0.08, interactive: false, renderer: vectorial, weight: 1.5 }).addTo(mapa!),
  };
}

function alMoverRaton(e: L.LeafletMouseEvent) {
  if (!op) return;
  ultimoPunto = e.latlng;
  shiftPulsado = e.originalEvent.shiftKey;
  if (cuadroMover) return;
  cuadroMover = requestAnimationFrame(() => {
    cuadroMover = 0;
    if (op && ultimoPunto) aplicarOperacion(op, ultimoPunto);
  });
}

function aplicarOperacion(o: Operacion, punto: L.LatLng) {
  movido = true;
  if (o.tipo === 'mover') {
    const d = diferenciaMetros(o.inicio.lat, o.inicio.lng, punto.lat, punto.lng);
    for (const it of o.items) {
      const item = itemDe(it.clave);
      if (!item) continue;
      const [lat, lng] = desplazar(it.lat, it.lng, d.e, d.n);
      item.lat = lat;
      item.lng = lng;
      const p = poligonos.get(it.clave);
      if (p) p.setLatLngs(esquinasRect(item as RectMetros));
    }
  } else if (o.tipo === 'redimensionar') {
    const it = itemDe(o.clave);
    if (!ubicado(it)) return;
    const [flat, flng] = o.fija;
    const v = diferenciaMetros(flat, flng, punto.lat, punto.lng);
    const l = rotar(v.e, v.n, -it.rotacion);
    const max = esClaveZona(o.clave) ? 500 : 60;
    const ancho = recortar(redondear(Math.abs(l.e)), 0.5, max);
    const alto = recortar(redondear(Math.abs(l.n)), 0.5, max);
    const c = rotar((Math.sign(l.e) || 1) * ancho / 2, (Math.sign(l.n) || 1) * alto / 2, it.rotacion);
    [it.lat, it.lng] = desplazar(flat, flng, c.e, c.n);
    it.ancho = ancho;
    it.alto = alto;
    poligonos.get(o.clave)?.setLatLngs(esquinasRect(it));
  } else if (o.tipo === 'rotar') {
    const it = itemDe(o.clave);
    if (!ubicado(it)) return;
    const v = diferenciaMetros(it.lat, it.lng, punto.lat, punto.lng);
    const grados = (Math.atan2(v.e, v.n) * 180) / Math.PI;
    it.rotacion = normalizarAngulo(shiftPulsado ? Math.round(grados / 15) * 15 : Math.round(grados));
    poligonos.get(o.clave)?.setLatLngs(esquinasRect(it));
  } else {
    o.marco.setBounds(L.latLngBounds(o.inicio, punto));
    return;
  }
  dibujarAsas();
  refrescarEtiquetas();
}

function terminarOperacion() {
  const o = op;
  if (!o) return;
  op = null;
  if (cuadroMover) { cancelAnimationFrame(cuadroMover); cuadroMover = 0; if (ultimoPunto) aplicarOperacion(o, ultimoPunto); }
  mapa?.dragging.enable();
  if (o.tipo === 'recuadro') {
    const marco = o.marco.getBounds();
    o.marco.remove();
    if (!movido) return;
    ignorarClicHasta = Date.now() + 400;
    const dentro = [...poligonos.keys()].filter((k) => {
      const it = itemDe(k);
      return ubicado(it) && marco.contains([it.lat, it.lng]);
    });
    seleccion.value = o.agregar ? [...new Set([...seleccion.value, ...dentro])] : dentro;
    return;
  }
  if (!movido) {
    pilaDeshacer.pop();
    puedeDeshacer.value = pilaDeshacer.length > 0;
    if (o.tipo === 'mover' && o.multi) seleccion.value = [o.clave];
    return;
  }
  ignorarClicHasta = Date.now() + 400;
  trasCambio(o.tipo === 'mover' ? o.items.map((i) => i.clave) : [o.clave]);
}

function alClicMapa(e: L.LeafletMouseEvent) {
  if (Date.now() < ignorarClicHasta) return;
  if (esperandoInicio.value) {
    grilla.value.inicio = { lat: e.latlng.lat, lng: e.latlng.lng };
    esperandoInicio.value = false;
    return;
  }
  if (colocando.value !== null) {
    const s = standsPorId.get(colocando.value);
    if (s) colocarStand(s, e.latlng, true);
    return;
  }
  if (!e.originalEvent.shiftKey && !e.originalEvent.ctrlKey && !e.originalEvent.metaKey) seleccion.value = [];
}

function colocarStand(s: Stand, punto: L.LatLng, encadenar: boolean) {
  guardarDeshacer();
  if (s.lat === null) {
    s.ancho = defecto.value.ancho;
    s.alto = defecto.value.alto;
    s.rotacion = defecto.value.rotacion;
  }
  s.lat = punto.lat;
  s.lng = punto.lng;
  const clave = claveStand(s.idInscripcion);
  seleccion.value = [clave];
  trasCambio([clave]);
  // Encadena: el siguiente sin ubicar de la lista queda listo para el próximo clic.
  colocando.value = encadenar ? listaFiltrada.value.find((x) => x.lat === null && x.idInscripcion !== s.idInscripcion)?.idInscripcion ?? null : null;
}

function alSoltarEnMapa(e: DragEvent) {
  e.preventDefault();
  const id = Number(e.dataTransfer?.getData('text/plain')?.replace(/^s/, ''));
  const s = standsPorId.get(id);
  if (!s || !mapa) return;
  colocarStand(s, mapa.mouseEventToLatLng(e as unknown as MouseEvent), false);
}
function alArrastrarFila(e: DragEvent, s: Stand) {
  e.dataTransfer?.setData('text/plain', claveStand(s.idInscripcion));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

// ------------------------------------------------------------------ lista

function alClicFila(s: Stand, e: MouseEvent) {
  const clave = claveStand(s.idInscripcion);
  if (e.ctrlKey || e.metaKey) {
    seleccion.value = seleccionSet.value.has(clave) ? seleccion.value.filter((k) => k !== clave) : [...seleccion.value, clave];
    ancla = s.idInscripcion;
    return;
  }
  if (e.shiftKey && ancla !== null) {
    const lista = listaFiltrada.value;
    const a = lista.findIndex((x) => x.idInscripcion === ancla);
    const b = lista.findIndex((x) => x.idInscripcion === s.idInscripcion);
    if (a >= 0 && b >= 0) {
      seleccion.value = lista.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => claveStand(x.idInscripcion));
      return;
    }
  }
  ancla = s.idInscripcion;
  seleccion.value = [clave];
  if (s.lat !== null && s.lng !== null) {
    colocando.value = null;
    if (mapa && !mapa.getBounds().contains([s.lat, s.lng])) mapa.panTo([s.lat, s.lng]);
  } else {
    colocando.value = s.idInscripcion;
  }
}

function seleccionarLista() {
  seleccion.value = listaFiltrada.value.map((s) => claveStand(s.idInscripcion));
}

// ------------------------------------------------------------------ edición de la selección

function cambiarCampo(campo: Campo, valor: unknown) {
  const n = Number(valor);
  if (valor === null || valor === '' || !Number.isFinite(n)) return;
  guardarDeshacer();
  for (const it of seleccionados.value) {
    it[campo] = campo === 'rotacion' ? normalizarAngulo(n) : recortar(redondear(n), 0.5, 'idInscripcion' in it ? 60 : 500);
  }
  trasCambio();
}

function cambiarNumero(valor: string) {
  const s = unicoStand.value;
  if (!s) return;
  const limpio = valor.replaceAll(/\s+/g, ' ').trim().toUpperCase().slice(0, 30);
  if ((s.stand ?? '') === limpio) return;
  guardarDeshacer();
  s.stand = limpio || null;
  trasCambio();
}

function cambiarZona(campo: 'color' | 'nombre' | 'tipo', valor: string) {
  const z = unicaZona.value;
  if (!z) return;
  guardarDeshacer();
  if (campo === 'tipo') z.tipo = valor === 'etiqueta' ? 'etiqueta' : 'rect';
  else if (campo === 'color') z.color = /^#[0-9a-f]{6}$/i.test(valor) ? valor : z.color;
  else z.nombre = valor.slice(0, 60);
  trasCambio();
}

function moverSeleccion(e: number, n: number) {
  const items = seleccionados.value.filter(ubicado);
  if (!items.length) return;
  guardarDeshacer();
  for (const it of items) [it.lat, it.lng] = desplazar(it.lat!, it.lng!, e, n);
  trasCambio();
}

function quitarSeleccion() {
  if (!seleccionados.value.length) return;
  guardarDeshacer();
  const claves = [...seleccion.value];
  for (const k of claves) {
    const it = itemDe(k);
    if (!it) continue;
    if ('idInscripcion' in it) { it.lat = null; it.lng = null; } else {
      zonas.value = zonas.value.filter((z) => z.id !== it.id);
      zonasPorId.delete(it.id);
    }
  }
  seleccion.value = [];
  trasCambio(claves);
}

/** Alinea los centros en fila (eje local x) o columna (eje local y), según el giro del primero. */
function alinear(eje: 'columna' | 'fila') {
  const items = seleccionados.value.filter(ubicado);
  if (items.length < 2) return;
  guardarDeshacer();
  const base = { lat: items[0]!.lat!, lng: items[0]!.lng!, rot: items[0]!.rotacion };
  const locales = items.map((it) => {
    const d = diferenciaMetros(base.lat, base.lng, it.lat!, it.lng!);
    return rotar(d.e, d.n, -base.rot);
  });
  const media = locales.reduce((t, l) => t + (eje === 'fila' ? l.n : l.e), 0) / locales.length;
  items.forEach((it, i) => {
    const l = locales[i]!;
    const w = eje === 'fila' ? rotar(l.e, media, base.rot) : rotar(media, l.n, base.rot);
    [it.lat, it.lng] = desplazar(base.lat, base.lng, w.e, w.n);
    it.rotacion = base.rot;
  });
  trasCambio();
}

/** Reparte a distancias iguales a lo largo de la fila (entre el primero y el último). */
function distribuir() {
  const items = seleccionados.value.filter(ubicado);
  if (items.length < 3) return;
  guardarDeshacer();
  const base = { lat: items[0]!.lat!, lng: items[0]!.lng!, rot: items[0]!.rotacion };
  const locales = items.map((it) => {
    const d = diferenciaMetros(base.lat, base.lng, it.lat!, it.lng!);
    return { it, l: rotar(d.e, d.n, -base.rot) };
  }).sort((a, b) => a.l.e - b.l.e);
  const min = locales[0]!.l.e;
  const paso = (locales.at(-1)!.l.e - min) / (locales.length - 1);
  locales.forEach(({ it, l }, i) => {
    const w = rotar(min + paso * i, l.n, base.rot);
    [it.lat, it.lng] = desplazar(base.lat, base.lng, w.e, w.n);
  });
  trasCambio();
}

function igualarTamano() {
  const [primero, ...resto] = seleccionados.value;
  if (!primero || !resto.length) return;
  guardarDeshacer();
  for (const it of resto) { it.ancho = primero.ancho; it.alto = primero.alto; it.rotacion = primero.rotacion; }
  trasCambio();
}

// ------------------------------------------------------------------ zonas

function agregarZona(tipo: 'etiqueta' | 'rect', nombre: string, color: string, ancho: number, alto: number) {
  const c = mapa?.getCenter() ?? L.latLng(config.value.centroLat, config.value.centroLng);
  guardarDeshacer();
  const z: ZonaFeria = { alto, ancho, color, id: nuevoIdZona(), lat: c.lat, lng: c.lng, nombre, rotacion: 0, tipo };
  zonas.value = [...zonas.value, z];
  zonasPorId.set(z.id, z);
  seleccion.value = [claveZona(z.id)];
  trasCambio([claveZona(z.id)]);
}

function irAZona(z: ZonaFeria) {
  seleccion.value = [claveZona(z.id)];
  mapa?.panTo([z.lat, z.lng]);
}

// ------------------------------------------------------------------ configuración

function usarVistaActual() {
  if (!mapa) return;
  const c = mapa.getCenter();
  config.value.centroLat = Number(c.lat.toFixed(7));
  config.value.centroLng = Number(c.lng.toFixed(7));
  config.value.zoom = recortar(Math.round(mapa.getZoom() * 2) / 2, 12, 21);
}
function fijarLimites() {
  if (!mapa) return;
  const b = mapa.getBounds();
  config.value.limites = { este: b.getEast(), norte: b.getNorth(), oeste: b.getWest(), sur: b.getSouth() };
}
/**
 * Pide al servidor que baje ahora todas las teselas del área (zoom 15–19), para que el día de la
 * feria la vista pública no dependa de OSM. Usa los límites y la vista GUARDADOS.
 */
async function precargarMapa() {
  const id = idActividad.value;
  if (id === undefined || precargando.value) return;
  if (configCambiada.value) {
    avisar({ tipo: 'advertencia', titulo: 'Guarde primero', mensaje: 'La precarga usa los límites y la vista guardados. Pulse Guardar y vuelva a intentarlo.' });
    return;
  }
  precargando.value = true;
  try {
    const p = await precargarTeselasFeria(id, 15);
    avisar({
      tipo: 'exito', titulo: 'Mapa en el servidor',
      mensaje: p.enCola === 0
        ? `Las ${p.total} teselas ya estaban en el servidor.`
        : `Descargando ${p.enCola} de ${p.total} teselas en segundo plano (~${Math.max(1, Math.round(p.enCola / 6))} s).`,
    });
  } catch { /* el interceptor ya avisó (p. ej. área demasiado grande: fije límites más chicos) */ } finally {
    precargando.value = false;
  }
}

function verVistaInicial() {
  mapa?.setView([config.value.centroLat, config.value.centroLng], config.value.zoom);
}
function cambiarColor(id: number, valor: string) {
  colores.value = { ...colores.value, [String(id)]: valor };
  restilar();
}

// ------------------------------------------------------------------ cuadrícula

const opcionesFuente = computed(() => {
  void version.value;
  const contar = (f: (s: Stand) => boolean) => stands.value.filter((s) => f(s) && (!grilla.value.soloSinUbicar || s.lat === null)).length;
  return [
    { label: `Seleccionados (${seleccionados.value.filter((x) => 'idInscripcion' in x).length})`, value: 'sel' },
    { label: `Lista filtrada (${listaFiltrada.value.length})`, value: 'lista' },
    ...categorias.value.map((c) => ({ label: `Categoría: ${c.nombre} (${contar((s) => s.idCategoria === c.id)})`, value: `cat:${c.id}` })),
    ...(jornadas.value.length > 1 ? jornadas.value.map((j) => ({ label: `Jornada ${j} (${contar((s) => (s.jornada ?? 1) === j)})`, value: `jor:${j}` })) : []),
    { label: `Todos (${contar(() => true)})`, value: 'todos' },
  ];
});

const candidatosGrilla = computed(() => {
  void version.value;
  const g = grilla.value;
  let lista: Stand[];
  if (g.fuente === 'sel') lista = seleccionados.value.filter((x): x is Stand => 'idInscripcion' in x);
  else if (g.fuente === 'lista') lista = [...listaFiltrada.value];
  else if (g.fuente.startsWith('cat:')) lista = stands.value.filter((s) => s.idCategoria === Number(g.fuente.slice(4)));
  else if (g.fuente.startsWith('jor:')) lista = stands.value.filter((s) => (s.jornada ?? 1) === Number(g.fuente.slice(4)));
  else lista = [...stands.value];
  if (g.soloSinUbicar) lista = lista.filter((s) => s.lat === null);
  if (g.orden === 'stand') lista.sort((a, b) => comparadorNatural.compare(a.stand ?? '~', b.stand ?? '~') || comparadorNatural.compare(a.proyecto ?? '', b.proyecto ?? ''));
  else if (g.orden === 'nombre') lista.sort((a, b) => comparadorNatural.compare(a.proyecto ?? '', b.proyecto ?? ''));
  else if (g.orden === 'categoria') lista.sort((a, b) => comparadorNatural.compare(a.categoria, b.categoria) || comparadorNatural.compare(a.proyecto ?? '', b.proyecto ?? ''));
  return lista;
});

function posicionesGrilla(): RectMetros[] {
  const g = grilla.value;
  if (!g.inicio) return [];
  const cols = Math.max(1, Math.round(g.columnas) || 1);
  const ancho = recortar(g.ancho || 3, 0.5, 60);
  const alto = recortar(g.alto || 3, 0.5, 60);
  return candidatosGrilla.value.map((_, k) => {
    const col = k % cols;
    const fila = Math.floor(k / cols);
    const w = rotar(col * (ancho + (g.sepX || 0)) + ancho / 2, -(fila * (alto + (g.sepY || 0)) + alto / 2), g.angulo || 0);
    const [lat, lng] = desplazar(g.inicio!.lat, g.inicio!.lng, w.e, w.n);
    return { alto, ancho, lat, lng, rotacion: normalizarAngulo(g.angulo || 0) };
  });
}

function dibujarPrevia() {
  if (!capaPrevia) return;
  capaPrevia.clearLayers();
  if (!grilla.value.abierta) return;
  const inicio = grilla.value.inicio;
  if (inicio) L.circleMarker([inicio.lat, inicio.lng], { color: '#e11d2a', fillOpacity: 1, interactive: false, radius: 5, renderer: vectorial }).addTo(capaPrevia);
  for (const r of posicionesGrilla()) {
    L.polygon(esquinasRect(r), { color: '#1d4ed8', dashArray: '4 3', fillColor: '#93c5fd', fillOpacity: 0.35, interactive: false, renderer: lienzo, weight: 1 }).addTo(capaPrevia);
  }
}
watch([grilla, candidatosGrilla], dibujarPrevia, { deep: true });

function aplicarGrilla() {
  const lista = candidatosGrilla.value;
  const posiciones = posicionesGrilla();
  if (!lista.length || !posiciones.length) return;
  guardarDeshacer();
  const g = grilla.value;
  lista.forEach((s, k) => {
    const p = posiciones[k]!;
    Object.assign(s, { alto: p.alto, ancho: p.ancho, lat: p.lat, lng: p.lng, rotacion: p.rotacion });
    if (g.numerar) s.stand = `${g.prefijo.trim().toUpperCase()}${(Math.round(g.desde) || 1) + k}`.slice(0, 30);
  });
  const claves = lista.map((s) => claveStand(s.idInscripcion));
  seleccion.value = claves;
  trasCambio(claves);
  grilla.value.inicio = null;
  if (g.numerar) grilla.value.desde = (Math.round(g.desde) || 1) + lista.length;
  avisar({ tipo: 'exito', titulo: 'Stands colocados', mensaje: `${lista.length} stand(s) en cuadrícula. Revise y pulse Guardar.` });
}

/** Siguiente número libre para un prefijo («A-» con A-1…A-10 ya usados → 11). */
function siguienteNumero(prefijo: string) {
  const p = prefijo.trim().toUpperCase();
  let max = 0;
  for (const s of stands.value) {
    const n = s.stand?.trim().toUpperCase();
    if (n?.startsWith(p) && /^\d+$/.test(n.slice(p.length))) max = Math.max(max, Number(n.slice(p.length)));
  }
  return max + 1;
}
watch(() => grilla.value.prefijo, (p) => { if (grilla.value.abierta) grilla.value.desde = siguienteNumero(p); });

function abrirGrilla() {
  grilla.value.abierta = !grilla.value.abierta;
  if (grilla.value.abierta) {
    grilla.value.desde = siguienteNumero(grilla.value.prefijo);
    grilla.value.fuente = seleccionados.value.some((x) => 'idInscripcion' in x) ? 'sel' : 'lista';
    grilla.value.ancho = defecto.value.ancho;
    grilla.value.alto = defecto.value.alto;
  } else {
    esperandoInicio.value = false;
  }
  dibujarPrevia();
}

// ------------------------------------------------------------------ teclado, salida y actividad

function esCampo(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)));
}
function alPulsarTecla(e: KeyboardEvent) {
  shiftPulsado = e.shiftKey;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void guardar(); return; }
  if (esCampo(e.target)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); deshacer(); return; }
  if (e.key === 'Escape') {
    if (esperandoInicio.value) esperandoInicio.value = false;
    else if (colocando.value !== null) colocando.value = null;
    else seleccion.value = [];
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && seleccion.value.length) { e.preventDefault(); quitarSeleccion(); return; }
  const paso = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5;
  const flechas: Record<string, [number, number]> = { ArrowDown: [0, -paso], ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso] };
  const f = flechas[e.key];
  if (f && seleccion.value.length) { e.preventDefault(); moverSeleccion(f[0], f[1]); }
}
function alSoltarTecla(e: KeyboardEvent) { shiftPulsado = e.shiftKey; }

async function puedeSalir() {
  if (!pendientes.value && !portadaSucia.value) return true;
  return confirmar({ mensaje: pendientes.value ? `Hay ${pendientes.value} cambio(s) sin guardar en el mapa. Si sale, se pierden.` : 'La portada tiene cambios sin guardar. Si sale, se pierden.', peligro: true, textoAceptar: 'Salir sin guardar', textoCancelar: 'Seguir editando', titulo: '¿Salir sin guardar?' });
}
onBeforeRouteLeave(puedeSalir);
function alSalirDeLaPagina(e: BeforeUnloadEvent) { if (pendientes.value || portadaSucia.value) e.preventDefault(); }

watch(idActividad, async (nuevo, viejo) => {
  if (revirtiendo) { revirtiendo = false; return; }
  if (viejo !== undefined && nuevo !== viejo && (pendientes.value || portadaSucia.value)) {
    const ok = await confirmar({ mensaje: 'El mapa de la actividad anterior tiene cambios sin guardar. Si cambia de actividad, se pierden.', peligro: true, textoAceptar: 'Cambiar y descartar', titulo: '¿Cambiar de actividad?' });
    if (!ok) { revirtiendo = true; store.elegir(viejo); return; }
  }
  seleccion.value = [];
  colocando.value = null;
  await cargar();
});

watch(seleccion, () => { restilar(); dibujarAsas(); });
watch(() => config.value.limites, dibujarLimites, { deep: true });

onMounted(() => {
  if (!mapaElemento.value) return;
  lienzo = L.canvas({ padding: 0.4, tolerance: 3 });
  vectorial = L.svg({ padding: 0.4 });
  mapa = L.map(mapaElemento.value, {
    boxZoom: false, doubleClickZoom: false, maxZoom: 22, minZoom: 12, renderer: lienzo, zoomSnap: 0.5, wheelPxPerZoomLevel: 90,
  }).setView(CENTRO_DEFECTO, 18);
  new CapaCartografia({ attribution: ATRIBUCION_OSM, maxNativeZoom: 19, maxZoom: 22 }).addTo(mapa);
  capaLimites = L.layerGroup().addTo(mapa);
  capaZonas = L.layerGroup().addTo(mapa);
  capaStands = L.layerGroup().addTo(mapa);
  capaPrevia = L.layerGroup().addTo(mapa);
  etiquetas = new CapaEtiquetas().addTo(mapa);
  capaAsas = L.layerGroup().addTo(mapa);
  mapa.on('mousedown', alPresionarMapa);
  mapa.on('mousemove', alMoverRaton);
  mapa.on('click', alClicMapa);
  document.addEventListener('mouseup', terminarOperacion);
  window.addEventListener('keydown', alPulsarTecla);
  window.addEventListener('keyup', alSoltarTecla);
  window.addEventListener('beforeunload', alSalirDeLaPagina);
  observador = new ResizeObserver(() => mapa?.invalidateSize({ pan: false }));
  observador.observe(mapaElemento.value);
  if (idActividad.value !== undefined) void cargar();
});

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', terminarOperacion);
  window.removeEventListener('keydown', alPulsarTecla);
  window.removeEventListener('keyup', alSoltarTecla);
  window.removeEventListener('beforeunload', alSalirDeLaPagina);
  if (cuadroMover) cancelAnimationFrame(cuadroMover);
  observador?.disconnect();
  mapa?.remove();
  mapa = undefined;
});

const num = (v: null | number | string) => (v === null || v === '' ? null : Number(v));
</script>

<template>
  <SemfaPagina auto-content-height>
    <div class="fe">
      <!-- Barra superior -->
      <div class="fe__barra">
        <div class="fe__titulo">
          <strong>Mapa de la feria</strong>
          <span>{{ nombreActividad || 'Elija una actividad de trabajo' }}</span>
        </div>
        <div class="fe__datos">
          <span :class="{ 'fe__dato--ok': resumen.total && resumen.ubicados === resumen.total }">Ubicados {{ resumen.ubicados }}/{{ resumen.total }}</span>
          <span v-if="resumen.sinNumero">Sin número {{ resumen.sinNumero }}</span>
          <Tooltip v-if="resumen.repetidos.size" :title="[...resumen.repetidos].slice(0, 30).join(', ')">
            <span class="fe__dato--alerta">Números repetidos {{ resumen.repetidos.size }}</span>
          </Tooltip>
          <span :class="config.publicado ? 'fe__dato--ok' : 'fe__dato--gris'">{{ config.publicado ? 'Publicado' : 'Sin publicar' }}</span>
          <span v-if="datos">Visitantes {{ datos.visitas.toLocaleString('es-BO') }}</span>
        </div>
        <div class="fe__botones">
          <Tooltip title="Deshacer (Ctrl+Z)"><Button class="semfa-btn semfa-btn--neutro" :disabled="!puedeDeshacer" @click="deshacer">↶ Deshacer</Button></Tooltip>
          <Button class="semfa-btn" :class="grilla.abierta ? 'semfa-btn--primario' : 'semfa-btn--suave-primario'" :disabled="!stands.length" @click="abrirGrilla">▦ Colocar en cuadrícula</Button>
          <Button class="semfa-btn semfa-btn--suave-peligro" :disabled="!pendientes || guardando" @click="descartar">Descartar</Button>
          <Tooltip title="Guardar (Ctrl+S)">
            <Button class="semfa-btn semfa-btn--primario" :loading="guardando" :disabled="!pendientes || idActividad === undefined" @click="guardar">
              Guardar<template v-if="pendientes"> ({{ pendientes }})</template>
            </Button>
          </Tooltip>
        </div>
      </div>

      <div class="fe__cuerpo" :class="{ 'fe__cuerpo--ancho': pestana === 'portada' }">
        <!-- Panel lateral -->
        <aside class="fe__panel">
          <div class="fe__pestanas" role="tablist">
            <button v-for="p in ([['proyectos', 'Proyectos'], ['zonas', 'Zonas'], ['portada', 'Portada'], ['mapa', 'Configuración']] as const)" :key="p[0]" type="button" role="tab"
              :aria-selected="pestana === p[0]" :class="{ 'is-activa': pestana === p[0] }" @click="pestana = p[0]">{{ p[1] }}</button>
          </div>

          <!-- Proyectos -->
          <template v-if="pestana === 'proyectos'">
            <div class="fe__filtros">
              <Input v-model:value="busqueda" allow-clear placeholder="Buscar proyecto, nº, carrera…" />
              <div class="fe__chips">
                <button type="button" class="semfa-chip" :class="{ 'is-activo': soloSinUbicar }" @click="soloSinUbicar = !soloSinUbicar">
                  Sin ubicar <span class="semfa-chip__total">{{ resumen.total - resumen.ubicados }}</span>
                </button>
                <button v-for="j in (jornadas.length > 1 ? jornadas : [])" :key="`j${j}`" type="button" class="semfa-chip" :class="{ 'is-activo': filtroJornada === j }"
                  @click="filtroJornada = filtroJornada === j ? null : j">Día {{ j }}</button>
                <button v-for="c in categorias" :key="c.id" type="button" class="semfa-chip" :class="{ 'is-activo': filtroCategoria === c.id }"
                  @click="filtroCategoria = filtroCategoria === c.id ? null : c.id">
                  <i class="fe__punto" :style="{ background: colorCategoria(c.id) }"></i>{{ c.nombre }}
                </button>
              </div>
              <div class="fe__defecto">
                <span>Nuevo stand</span>
                <InputNumber v-model:value="defecto.ancho" size="small" :min="0.5" :max="60" :step="0.5" addon-after="m" aria-label="Ancho por defecto" />
                <span>×</span>
                <InputNumber v-model:value="defecto.alto" size="small" :min="0.5" :max="60" :step="0.5" addon-after="m" aria-label="Alto por defecto" />
                <InputNumber v-model:value="defecto.rotacion" size="small" :min="-180" :max="180" addon-after="°" aria-label="Rotación por defecto" />
              </div>
              <div class="fe__lista-acciones">
                <small>{{ listaFiltrada.length }} proyecto(s) · arrastre al mapa o haga clic y luego clic en el mapa</small>
                <button type="button" class="fe__enlace" @click="seleccionarLista">Seleccionar todos</button>
              </div>
            </div>
            <ul class="fe__lista">
              <li v-for="s in listaFiltrada" :key="s.idInscripcion">
                <button type="button" draggable="true" class="fe__fila"
                  :class="{ 'is-sel': seleccionSet.has(`s${s.idInscripcion}`), 'is-colocando': colocando === s.idInscripcion, 'is-sin': s.lat === null }"
                  :title="s.proyecto ?? ''" @dragstart="alArrastrarFila($event, s)" @click="alClicFila(s, $event)">
                  <span class="fe__num" :style="{ background: colorCategoria(s.idCategoria) }"
                    :class="{ 'is-repetido': s.stand && resumen.repetidos.has(s.stand.trim().toUpperCase()) }">{{ s.stand || '—' }}</span>
                  <span class="fe__fila-texto">
                    <strong>{{ s.proyecto }}</strong>
                    <small>{{ s.categoria }}<template v-if="s.carrera"> · {{ s.carrera }}</template><template v-if="jornadas.length > 1"> · Día {{ s.jornada ?? 1 }}</template></small>
                  </span>
                  <span class="fe__marca" :title="s.lat === null ? 'Sin ubicar' : 'En el mapa'">{{ s.lat === null ? '○' : '●' }}</span>
                </button>
              </li>
              <li v-if="!listaFiltrada.length" class="fe__vacio">
                {{ cargando ? 'Cargando…' : stands.length ? 'Nada coincide con los filtros.' : 'Esta actividad aún no tiene proyectos inscritos.' }}
              </li>
            </ul>
          </template>

          <!-- Zonas -->
          <template v-else-if="pestana === 'zonas'">
            <div class="fe__seccion">
              <p class="fe__ayuda">Áreas de referencia para orientarse. Se agregan en el centro del mapa; luego muévalas y ajuste su tamaño.</p>
              <div class="fe__chips">
                <button v-for="t in TIPOS_ZONA" :key="t.nombre" type="button" class="semfa-chip" @click="agregarZona('rect', t.nombre, t.color, t.ancho, t.alto)">
                  <i class="fe__punto" :style="{ background: t.color }"></i>+ {{ t.nombre }}
                </button>
                <button type="button" class="semfa-chip" @click="agregarZona('rect', 'Zona', '#475569', 10, 6)">+ Otra área</button>
                <button type="button" class="semfa-chip" @click="agregarZona('etiqueta', 'Texto', '#1d3f9a', 16, 4)">+ Etiqueta de texto</button>
              </div>
            </div>
            <ul class="fe__lista">
              <li v-for="z in zonas" :key="z.id">
                <button type="button" class="fe__fila" :class="{ 'is-sel': seleccionSet.has(`z${z.id}`) }" @click="irAZona(z)">
                  <span class="fe__num" :style="{ background: z.color }">{{ z.tipo === 'etiqueta' ? 'T' : '▭' }}</span>
                  <span class="fe__fila-texto"><strong>{{ z.nombre }}</strong><small>{{ z.ancho }} × {{ z.alto }} m<template v-if="z.rotacion"> · {{ z.rotacion }}°</template></small></span>
                </button>
              </li>
              <li v-if="!zonas.length" class="fe__vacio">Sin zonas todavía.</li>
            </ul>
          </template>

          <!-- Portada de la página pública (se guarda aparte) -->
          <EditorPortada v-else-if="pestana === 'portada'" :datos="datos" :id-actividad="idActividad"
            @guardado="(d) => aplicarDatos(d, false)" @sucio="(v) => (portadaSucia = v)" />

          <!-- Configuración -->
          <div v-else class="fe__config">
            <section>
              <h3>Vista de la pantalla pública</h3>
              <p class="fe__ayuda">Centro {{ config.centroLat.toFixed(5) }}, {{ config.centroLng.toFixed(5) }} · zoom {{ config.zoom }}</p>
              <div class="fe__fila-botones">
                <Button size="small" class="semfa-btn semfa-btn--suave-primario" @click="usarVistaActual">Usar vista actual como inicial</Button>
                <Button size="small" class="semfa-btn semfa-btn--neutro" @click="verVistaInicial">Ir a la vista inicial</Button>
              </div>
              <p class="fe__ayuda">{{ config.limites ? 'Límites fijados (recuadro rojo): el público no puede salir de esa zona.' : 'Sin límites: el público puede mover el mapa libremente.' }}</p>
              <div class="fe__fila-botones">
                <Button size="small" class="semfa-btn semfa-btn--suave-primario" @click="fijarLimites">Fijar límites a la vista actual</Button>
                <Button size="small" class="semfa-btn semfa-btn--suave-peligro" :disabled="!config.limites" @click="config.limites = null">Quitar límites</Button>
              </div>
              <Button size="small" class="semfa-btn semfa-btn--suave-primario" :loading="precargando" :disabled="idActividad === undefined" @click="precargarMapa">
                Precargar mapa en el servidor
              </Button>
              <small class="fe__ayuda">Recomendado tras fijar los límites y guardar: el servidor baja una vez todas las teselas del área (zoom 15–19) y las sirve a todos los celulares sin depender de OpenStreetMap ni de su red.</small>
            </section>
            <section>
              <h3>Textos y enlaces</h3>
              <label>Lema <Input v-model:value="config.lema" :maxlength="120" placeholder="Nosotros: investigamos, innovamos y transformamos" /></label>
              <label>Facebook <Input v-model:value="config.urlFacebook" placeholder="https://www.facebook.com/uap1993a" :status="urlInvalida(config.urlFacebook) ? 'error' : undefined" /></label>
              <label>Transmisión TVU <Input v-model:value="config.urlTransmision" placeholder="https://tvu-online.uap.edu.bo/" :status="urlInvalida(config.urlTransmision) ? 'error' : undefined" /></label>
              <small class="fe__ayuda">Vacío = el botón no aparece. Solo enlaces https://</small>
            </section>
            <section>
              <h3>Color por categoría</h3>
              <small class="fe__ayuda">Evite el rojo intenso: en la vista pública el rojo sólido significa «evaluado». Los pendientes se ven en su color, claro.</small>
              <ul class="fe__colores">
                <li v-for="c in categorias" :key="c.id">
                  <input type="color" :value="colorCategoria(c.id)" :aria-label="`Color de ${c.nombre}`" @input="cambiarColor(c.id, ($event.target as HTMLInputElement).value)" />
                  <span>{{ c.nombre }}</span>
                  <small>{{ stands.filter((s) => s.idCategoria === c.id).length }}</small>
                </li>
                <li v-if="!categorias.length" class="fe__ayuda">Sin categorías con proyectos inscritos.</li>
              </ul>
            </section>
            <section>
              <h3>Publicación</h3>
              <label class="fe__publicar"><Switch v-model:checked="config.publicado" /> {{ config.publicado ? 'Publicado en /feria' : 'No publicado' }}</label>
              <small class="fe__ayuda">Se aplica al pulsar Guardar.</small>
              <a v-if="urlPublica" class="fe__enlace" :href="urlPublica" target="_blank" rel="noopener">Abrir la vista pública ↗</a>
            </section>
          </div>
        </aside>

        <!-- Mapa -->
        <div class="fe__marco">
          <div ref="mapaElemento" class="fe__mapa" :class="{ 'is-apuntando': colocando !== null || esperandoInicio }"
            @dragover.prevent @drop="alSoltarEnMapa"></div>

          <div v-if="standColocando || esperandoInicio" class="fe__aviso">
            <template v-if="esperandoInicio">Haga clic en el mapa en la <strong>esquina del primer stand</strong> de la cuadrícula.</template>
            <template v-else>Clic en el mapa para ubicar <strong>{{ standColocando?.proyecto }}</strong>.</template>
            <button type="button" @click="esperandoInicio = false; colocando = null">Cancelar (Esc)</button>
          </div>

          <!-- Propiedades de la selección -->
          <div v-if="seleccionados.length" class="fe__props">
            <header>
              <strong v-if="unicoStand">{{ unicoStand.proyecto }}</strong>
              <strong v-else-if="unicaZona">Zona</strong>
              <strong v-else>{{ seleccionados.length }} seleccionados</strong>
              <button type="button" aria-label="Quitar selección" @click="seleccion = []">✕</button>
            </header>
            <small v-if="unicoStand" class="fe__ayuda">{{ unicoStand.categoria }}<template v-if="unicoStand.carrera"> · {{ unicoStand.carrera }}</template></small>
            <label v-if="unicoStand">Nº de stand
              <Input :value="unicoStand.stand ?? ''" placeholder="A-12" :maxlength="30" @change="cambiarNumero(($event.target as HTMLInputElement).value)" @press-enter="($event.target as HTMLInputElement).blur()" />
            </label>
            <template v-if="unicaZona">
              <label>Nombre <Input :value="unicaZona.nombre" :maxlength="60" @change="cambiarZona('nombre', ($event.target as HTMLInputElement).value)" /></label>
              <div class="fe__props-fila">
                <Select :value="unicaZona.tipo" size="small" style="width: 120px" :options="[{ label: 'Área', value: 'rect' }, { label: 'Solo texto', value: 'etiqueta' }]"
                  @change="(v) => cambiarZona('tipo', String(v))" />
                <input type="color" :value="unicaZona.color" aria-label="Color de la zona" @change="cambiarZona('color', ($event.target as HTMLInputElement).value)" />
              </div>
            </template>
            <template v-if="seleccionados.some(ubicado)">
              <div class="fe__props-fila">
                <label>Ancho <InputNumber :value="seleccionados[0]!.ancho" size="small" :min="0.5" :step="0.5" addon-after="m" @change="(v) => cambiarCampo('ancho', num(v as number))" /></label>
                <label>Alto <InputNumber :value="seleccionados[0]!.alto" size="small" :min="0.5" :step="0.5" addon-after="m" @change="(v) => cambiarCampo('alto', num(v as number))" /></label>
              </div>
              <label>Rotación <InputNumber :value="seleccionados[0]!.rotacion" size="small" :min="-180" :max="180" :step="5" addon-after="°" @change="(v) => cambiarCampo('rotacion', num(v as number))" /></label>
            </template>
            <p v-else-if="unicoStand" class="fe__ayuda">Sin ubicar: haga clic en el mapa o arrástrelo desde la lista.</p>
            <div v-if="seleccionados.length > 1" class="fe__fila-botones">
              <Button size="small" @click="alinear('fila')">Alinear en fila</Button>
              <Button size="small" @click="alinear('columna')">En columna</Button>
              <Button size="small" :disabled="seleccionados.length < 3" @click="distribuir">Distribuir</Button>
              <Tooltip title="Mismo tamaño y giro que el primero"><Button size="small" @click="igualarTamano">Igualar tamaño</Button></Tooltip>
            </div>
            <Button size="small" class="semfa-btn semfa-btn--suave-peligro" @click="quitarSeleccion">
              {{ seleccionados.every((x) => 'idInscripcion' in x) ? 'Quitar del mapa' : 'Eliminar' }} (Supr)
            </Button>
            <small class="fe__ayuda">Arrastre para mover · asas para tamaño y giro (Shift: 15°) · flechas 0,5 m (Shift 5 m)</small>
          </div>

          <!-- Cuadrícula -->
          <div v-if="grilla.abierta" class="fe__grilla">
            <header><strong>Colocar en fila / cuadrícula</strong><button type="button" aria-label="Cerrar" @click="abrirGrilla">✕</button></header>
            <label>Proyectos <Select v-model:value="grilla.fuente" size="small" :options="opcionesFuente" /></label>
            <Checkbox v-model:checked="grilla.soloSinUbicar">Solo los que aún no están en el mapa</Checkbox>
            <label>Orden
              <Select v-model:value="grilla.orden" size="small" :options="[{ label: 'Por nº de stand actual', value: 'stand' }, { label: 'Por nombre del proyecto', value: 'nombre' }, { label: 'Por categoría y nombre', value: 'categoria' }, { label: 'Como están', value: 'lista' }]" />
            </label>
            <div class="fe__props-fila">
              <Button size="small" :class="esperandoInicio ? 'semfa-btn semfa-btn--primario' : ''" @click="esperandoInicio = !esperandoInicio">
                {{ grilla.inicio ? 'Cambiar punto inicial' : 'Elegir punto inicial' }}
              </Button>
              <small v-if="grilla.inicio" class="fe__ayuda">✓ fijado</small>
            </div>
            <div class="fe__props-fila">
              <label>Dirección <InputNumber v-model:value="grilla.angulo" size="small" :min="-180" :max="180" :step="5" addon-after="°" /></label>
              <label>Por fila <InputNumber v-model:value="grilla.columnas" size="small" :min="1" :max="200" /></label>
            </div>
            <div class="fe__props-fila">
              <label>Ancho <InputNumber v-model:value="grilla.ancho" size="small" :min="0.5" :max="60" :step="0.5" addon-after="m" /></label>
              <label>Alto <InputNumber v-model:value="grilla.alto" size="small" :min="0.5" :max="60" :step="0.5" addon-after="m" /></label>
            </div>
            <div class="fe__props-fila">
              <label>Separación <InputNumber v-model:value="grilla.sepX" size="small" :min="0" :max="50" :step="0.5" addon-after="m" /></label>
              <label>Entre filas <InputNumber v-model:value="grilla.sepY" size="small" :min="0" :max="50" :step="0.5" addon-after="m" /></label>
            </div>
            <Checkbox v-model:checked="grilla.numerar">Numerar los stands</Checkbox>
            <div v-if="grilla.numerar" class="fe__props-fila">
              <label>Prefijo <Input v-model:value="grilla.prefijo" size="small" :maxlength="10" placeholder="A-" /></label>
              <label>Desde <InputNumber v-model:value="grilla.desde" size="small" :min="0" :max="9999" /></label>
            </div>
            <small class="fe__ayuda">
              Dirección 0° = filas hacia el este, 90° = hacia el sur. Las filas siguientes van a la derecha de la dirección.
              <template v-if="grilla.numerar && candidatosGrilla.length"> Números {{ grilla.prefijo.toUpperCase() }}{{ grilla.desde }} a {{ grilla.prefijo.toUpperCase() }}{{ (grilla.desde || 1) + candidatosGrilla.length - 1 }}.</template>
            </small>
            <Button class="semfa-btn semfa-btn--primario" :disabled="!candidatosGrilla.length || !grilla.inicio" @click="aplicarGrilla">
              Colocar {{ candidatosGrilla.length }} stand(s)
            </Button>
          </div>
        </div>
      </div>
    </div>
  </SemfaPagina>
</template>

<style scoped>
.fe { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 520px; }
.fe__barra { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.fe__titulo { display: flex; flex-direction: column; line-height: 1.2; }
.fe__titulo strong { font-size: 17px; }
.fe__titulo span { color: hsl(var(--muted-foreground)); font-size: 13px; }
.fe__datos { display: flex; flex: 1; flex-wrap: wrap; gap: 6px; }
.fe__datos > span, .fe__datos :deep(span.fe__dato--alerta) { border-radius: 999px; background: hsl(var(--muted)); padding: 2px 10px; color: hsl(var(--foreground)); font-size: 12px; font-weight: 700; }
.fe__dato--ok { background: #dcfce7 !important; color: #166534 !important; }
.fe__dato--gris { background: hsl(var(--muted)) !important; color: hsl(var(--muted-foreground)) !important; }
.fe__dato--alerta { background: #fee2e2 !important; color: #b91c1c !important; cursor: help; }
.fe__botones { display: flex; flex-wrap: wrap; gap: 6px; }
@media (min-width: 1001px) { .fe__cuerpo.fe__cuerpo--ancho { grid-template-columns: minmax(520px, 600px) 1fr; } }
.fe__cuerpo { display: grid; flex: 1; grid-template-columns: 330px 1fr; gap: 10px; min-height: 0; }
.fe__panel { display: flex; flex-direction: column; min-height: 0; overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--card)); }
.fe__pestanas { display: flex; border-bottom: 1px solid hsl(var(--border)); }
.fe__pestanas button { flex: 1; border: 0; border-bottom: 3px solid transparent; background: none; padding: 9px 4px; color: hsl(var(--muted-foreground)); font-weight: 700; cursor: pointer; }
.fe__pestanas button.is-activa { border-bottom-color: hsl(var(--primary)); color: hsl(var(--primary)); }
.fe__pestanas button:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: -2px; }
.fe__filtros, .fe__seccion { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-bottom: 1px solid hsl(var(--border)); }
.fe__chips { display: flex; flex-wrap: wrap; gap: 5px; max-height: 96px; overflow-y: auto; }
.fe__punto { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 3px; }
.fe__defecto { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12px; }
.fe__defecto :deep(.ant-input-number-group-wrapper) { width: 82px; }
.fe__lista-acciones { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: hsl(var(--muted-foreground)); font-size: 11.5px; }
.fe__enlace { border: 0; background: none; padding: 0; color: hsl(var(--primary)); font-weight: 700; white-space: nowrap; cursor: pointer; }
.fe__lista { flex: 1; min-height: 0; margin: 0; overflow-y: auto; padding: 4px 6px 8px; list-style: none; }
.fe__fila { display: flex; width: 100%; align-items: center; gap: 8px; border: 1px solid transparent; border-radius: 8px; background: none; padding: 5px 6px; color: inherit; text-align: left; cursor: grab; user-select: none; }
.fe__fila:hover { background: hsl(var(--accent)); }
.fe__fila.is-sel { border-color: #facc15; background: rgb(250 204 21 / 14%); }
.fe__fila.is-colocando { border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px #bfdbfe; }
.fe__fila:focus-visible { outline: 2px solid hsl(var(--primary)); }
.fe__num { min-width: 44px; flex: none; border-radius: 6px; padding: 2px 5px; color: #fff; font-size: 12px; font-weight: 800; text-align: center; text-shadow: 0 1px 1px #0006; }
.fe__num.is-repetido { outline: 2px solid #e11d2a; outline-offset: 1px; }
.fe__fila-texto { display: flex; flex: 1; flex-direction: column; min-width: 0; line-height: 1.25; }
.fe__fila-texto strong, .fe__fila-texto small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fe__fila-texto strong { font-size: 13px; }
.fe__fila-texto small { color: hsl(var(--muted-foreground)); font-size: 11.5px; }
.fe__fila.is-sin .fe__fila-texto strong { color: #d97706; }
.fe__marca { color: #94a3b8; font-size: 12px; }
.fe__fila:not(.is-sin) .fe__marca { color: #16a34a; }
.fe__vacio { padding: 18px 8px; color: hsl(var(--muted-foreground)); text-align: center; }
.fe__ayuda { margin: 0; color: hsl(var(--muted-foreground)); font-size: 12px; }
.fe__config { flex: 1; overflow-y: auto; padding: 10px; }
.fe__config section { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; }
.fe__config h3 { margin: 0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: hsl(var(--primary)); }
.fe__config label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; font-weight: 700; }
.fe__config label.fe__publicar { flex-direction: row; align-items: center; gap: 8px; font-size: 14px; }
.fe__fila-botones { display: flex; flex-wrap: wrap; gap: 6px; }
.fe__colores { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.fe__colores li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.fe__colores span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fe__colores small { color: hsl(var(--muted-foreground)); }
input[type='color'] { width: 34px; height: 26px; flex: none; border: 1px solid hsl(var(--border)); border-radius: 6px; background: none; padding: 1px; cursor: pointer; }

.fe__marco { position: relative; min-height: 0; overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: 12px; }
.fe__mapa { position: absolute; inset: 0; isolation: isolate; background: #e8ecf3; }
.fe__mapa.is-apuntando { cursor: crosshair; }
.fe__mapa.is-apuntando :deep(.leaflet-interactive) { cursor: crosshair; }
.fe__aviso { position: absolute; z-index: 800; top: 10px; left: 50%; display: flex; align-items: center; gap: 10px; max-width: calc(100% - 40px); transform: translateX(-50%); border-radius: 999px; background: #1d3f9a; padding: 7px 8px 7px 16px; color: #fff; font-size: 13px; box-shadow: 0 6px 18px #0004; }
.fe__aviso button { flex: none; border: 0; border-radius: 999px; background: #fff; padding: 3px 10px; color: #1d3f9a; font-weight: 800; cursor: pointer; }
.fe__props, .fe__grilla { position: absolute; z-index: 800; top: 10px; display: flex; flex-direction: column; gap: 7px; width: 280px; max-height: calc(100% - 20px); overflow-y: auto; border-radius: 12px; background: hsl(var(--card)); padding: 10px 12px; box-shadow: 0 10px 30px #0f172a40; }
.fe__props { right: 10px; }
.fe__grilla { left: 10px; width: 300px; }
.fe__props header, .fe__grilla header { display: flex; align-items: flex-start; gap: 8px; }
.fe__props header strong, .fe__grilla header strong { flex: 1; font-size: 14px; line-height: 1.25; }
.fe__props header button, .fe__grilla header button { border: 0; border-radius: 6px; background: hsl(var(--muted)); color: inherit; padding: 1px 8px; cursor: pointer; }
.fe__props label, .fe__grilla label { display: flex; flex: 1; flex-direction: column; gap: 2px; font-size: 12px; font-weight: 700; }
.fe__props-fila { display: flex; align-items: flex-end; gap: 8px; }
.fe__grilla label.ant-checkbox-wrapper { flex: none; flex-direction: row; align-items: center; font-weight: 600; }
.fe__props :deep(.ant-input-number-group-wrapper), .fe__grilla :deep(.ant-input-number-group-wrapper) { width: 100%; }
@media (max-width: 1000px) {
  .fe__cuerpo { grid-template-columns: 1fr; grid-template-rows: 300px minmax(420px, 1fr); }
  .fe { height: auto; }
}
</style>

<!-- Sin scoped: las asas las crea Leaflet fuera del componente. -->
<style>
.fe-asa { cursor: nwse-resize; }
.fe-asa--nesw { cursor: nesw-resize; }
.fe-asa--giro { cursor: grab; }
</style>
