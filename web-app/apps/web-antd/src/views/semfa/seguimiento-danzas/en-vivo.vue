<script setup lang="ts">
/**
 * Pantalla pública `/en-vivo` (semfa.uap.edu.bo/en-vivo): recorrido oficial y danzas en vivo,
 * con la estética del afiche de la Entrada Folklórica. Solo visualización: sin sesión, sin id en
 * la URL (el backend elige la actividad con la ubicación más reciente) y sin datos de responsables.
 * Tiempo real: escucha el SSE `/en-vivo/stream`, que empuja la foto apenas llega un GPS; si el
 * stream no está disponible o calla más de 15 s, consulta el GET cada 3 s hasta que vuelva.
 */
import type { SeguimientoEnVivo } from '#/api/seguimiento-danzas';

import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { ATRIBUCION_OSM, CapaCartografia } from '#/components/semfa/capa-cartografia';
import { obtenerEnVivo, registrarVisitaEnVivo, URL_EN_VIVO_STREAM } from '#/api/seguimiento-danzas';
import { dibujarReferencia } from './referencias';

defineOptions({ name: 'SemfaEnVivo' });

type Danza = SeguimientoEnVivo['danzas'][number];

const INTERVALO_MS = 3_000;
/** El servidor reenvía la foto cada 10 s aunque nadie se mueva; más silencio = stream caído. */
const SILENCIO_MAX_MS = 15_000;
/** Mismos umbrales que el backend (`EN_VIVO_SEGUNDOS`, `OCULTAR_SIN_SENAL_SEGUNDOS`). */
const EN_VIVO_MS = 30_000;
const OCULTAR_MS = 60_000;
/** Transmisión en vivo de la TV universitaria (reproductor HLS propio de la UAP). */
const URL_TVU = 'https://tvu-online.uap.edu.bo/';
/**
 * Página oficial de la UAP. Un enlace https normal: en Android e iOS, si la app de Facebook está
 * instalada, el sistema la abre en esa página; si no, se abre en el navegador.
 */
const URL_FACEBOOK_UAP = 'https://www.facebook.com/uap1993a';
/** Por debajo de este zoom los nombres se ocultan para no amontonarse; queda el número. */
const ZOOM_NOMBRES = 15;
const RUTA_INICIAL: L.LatLngTuple[] = [[-11.034046, -68.760840], [-11.018768, -68.753103]];

const datos = ref<null | SeguimientoEnVivo>(null);
const cargando = ref(true);
const sinConexion = ref(false);
const seleccionId = ref<null | number>(null);
const pantallaCompleta = ref(false);
const mapaElemento = ref<HTMLDivElement>();
const raiz = ref<HTMLElement>();
const tvuAbierta = ref(false);
/** Visitantes únicos: lo devuelve el registro al entrar y luego llega en cada foto del stream. */
const visitas = ref<null | number>(null);
const visitasTexto = computed(() => visitas.value === null ? '' : visitas.value.toLocaleString('es-BO'));
const botonTvu = ref<HTMLButtonElement>();
const cerrarTvuBoton = ref<HTMLButtonElement>();

/** Reloj de pantalla y diferencia con el reloj del servidor (el del teléfono puede estar mal). */
const reloj = ref(Date.now());
const desfase = ref(0);
/**
 * Se recalcula cada 5 s sin esperar al servidor: si cierran el APK sin «Detener», la danza se
 * atenúa a los 30 s y desaparece a los 60 s aunque no llegue otra foto.
 */
const danzas = computed(() => (datos.value?.danzas ?? []).flatMap((d) => {
  const edad = reloj.value - desfase.value - Date.parse(d.ultimaUbicacion);
  return edad > OCULTAR_MS ? [] : [{ ...d, enVivo: d.enVivo && edad <= EN_VIVO_MS }];
}));
const enVivo = computed(() => danzas.value.filter((d) => d.enVivo).length);
const horaActualizacion = computed(() => datos.value
  ? new Date(datos.value.actualizado).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : '');

let mapa: L.Map | undefined;
let capaRuta: L.LayerGroup | undefined;
let capaReferencias: L.LayerGroup | undefined;
let temporizador: ReturnType<typeof setInterval> | undefined;
let stream: EventSource | undefined;
let vencimiento: ReturnType<typeof setInterval> | undefined;
let ultimoMensaje = 0;
let observador: ResizeObserver | undefined;
let consulta: AbortController | undefined;
let firmaRuta = '';
let firmaReferencias = '';
let encuadrado = false;
/** Mientras el espectador no mueva el mapa, cada cambio de tamaño (girar el teléfono) reencuadra. */
let espectadorMovio = false;
const marcadores = new Map<number, { firma: string; marcador: L.Marker; animacion?: number }>();
const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;


function puntosRuta(): L.LatLngTuple[] {
  const ruta = datos.value?.recorrido ?? [];
  return ruta.length >= 2 ? ruta.map((p) => [p.latitud, p.longitud]) : RUTA_INICIAL;
}

/** Etiqueta tipo afiche («INICIO» / «LLEGADA»); el texto va con textContent, nunca como HTML. */
function iconoExtremo(texto: string, clase: string) {
  const caja = document.createElement('div');
  caja.className = `ev-extremo ${clase}`;
  const pin = document.createElement('span');
  pin.className = 'ev-extremo__pin';
  const etiqueta = document.createElement('span');
  etiqueta.className = 'ev-extremo__texto';
  etiqueta.textContent = texto;
  caja.append(pin, etiqueta);
  return L.divIcon({ className: 'ev-icono', html: caja, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function dibujarRuta(encuadrar = false) {
  if (!capaRuta || !mapa) return;
  capaRuta.clearLayers();
  const puntos = puntosRuta();
  L.polyline(puntos, { color: '#ffffff', weight: 13, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(capaRuta);
  L.polyline(puntos, { color: '#e11d2a', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(capaRuta);
  L.polyline(puntos, { color: '#ffffff', weight: 2, opacity: 0.9, dashArray: '2 14', lineCap: 'round', interactive: false, className: 'ev-ruta-flujo' }).addTo(capaRuta);
  L.marker(puntos[0]!, { icon: iconoExtremo('INICIO', 'ev-extremo--inicio'), interactive: false, keyboard: false }).addTo(capaRuta);
  L.marker(puntos.at(-1)!, { icon: iconoExtremo('LLEGADA', 'ev-extremo--llegada'), interactive: false, keyboard: false }).addTo(capaRuta);
  if (encuadrar) encuadrado = false;
  encuadrarSiHaceFalta();
}

/** Encuadra el recorrido una sola vez, cuando el mapa ya tiene tamaño (con 0×0 Leaflet saltaría al zoom máximo). */
function encuadrarSiHaceFalta() {
  if ((encuadrado && espectadorMovio) || !mapa || !mapaElemento.value?.clientWidth || !mapaElemento.value.clientHeight) return;
  mapa.invalidateSize({ pan: false });
  verRecorrido(false);
  encuadrado = true;
}

function iconoDanza(d: Danza, seleccionada: boolean) {
  const caja = document.createElement('div');
  caja.className = `ev-danza${d.enVivo ? '' : ' ev-danza--sin-senal'}${seleccionada ? ' ev-danza--seleccionada' : ''}`;
  caja.style.setProperty('--c', d.color);
  const onda = document.createElement('span');
  onda.className = 'ev-danza__onda';
  const punto = document.createElement('span');
  punto.className = 'ev-danza__punto';
  punto.textContent = String(d.orden);
  const nombre = document.createElement('span');
  nombre.className = 'ev-danza__nombre';
  nombre.textContent = d.danza;
  caja.append(onda, punto, nombre);
  return L.divIcon({ className: 'ev-icono', html: caja, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function mover(id: number, marcador: L.Marker, destino: L.LatLng) {
  const entrada = marcadores.get(id)!;
  if (entrada.animacion !== undefined) cancelAnimationFrame(entrada.animacion);
  entrada.animacion = undefined;
  const origen = marcador.getLatLng();
  const distancia = origen.distanceTo(destino);
  if (distancia < 0.5) return;
  if (reducirMovimiento || distancia > 40 || document.visibilityState !== 'visible') { marcador.setLatLng(destino); return; }
  const inicio = performance.now();
  const paso = (t: number) => {
    const k = Math.min(1, (t - inicio) / 1000);
    const suave = k * k * (3 - 2 * k);
    marcador.setLatLng([origen.lat + (destino.lat - origen.lat) * suave, origen.lng + (destino.lng - origen.lng) * suave]);
    entrada.animacion = k < 1 ? requestAnimationFrame(paso) : undefined;
  };
  entrada.animacion = requestAnimationFrame(paso);
}

function dibujarDanzas() {
  if (!mapa) return;
  const visibles = new Set<number>();
  for (const d of danzas.value) {
    visibles.add(d.id);
    const destino = L.latLng(d.latitud, d.longitud);
    const seleccionada = seleccionId.value === d.id;
    const firma = `${d.orden}|${d.danza}|${d.color}|${d.enVivo}|${seleccionada}`;
    const entrada = marcadores.get(d.id);
    if (!entrada) {
      const marcador = L.marker(destino, {
        icon: iconoDanza(d, seleccionada), keyboard: false, riseOnHover: true,
        zIndexOffset: seleccionada ? 1000 : 0, title: d.danza,
      }).addTo(mapa);
      marcador.on('click', () => seleccionar(d.id));
      marcadores.set(d.id, { firma, marcador });
      continue;
    }
    mover(d.id, entrada.marcador, destino);
    // Solo se reemplaza el icono cuando cambia algo visible: así el latido no se reinicia cada 3 s.
    if (entrada.firma !== firma) {
      entrada.marcador.setIcon(iconoDanza(d, seleccionada));
      entrada.marcador.setZIndexOffset(seleccionada ? 1000 : 0);
      entrada.firma = firma;
    }
  }
  for (const [id, entrada] of marcadores) {
    if (visibles.has(id)) continue;
    if (entrada.animacion !== undefined) cancelAnimationFrame(entrada.animacion);
    entrada.marcador.remove();
    marcadores.delete(id);
  }
}

/** Aplica una foto nueva (venga del stream o del GET de respaldo). */
function aplicar(nuevo: null | SeguimientoEnVivo) {
  if (nuevo && datos.value && Date.parse(nuevo.actualizado) < Date.parse(datos.value.actualizado)) return;
  datos.value = nuevo;
  if (nuevo && nuevo.visitas > (visitas.value ?? -1)) visitas.value = nuevo.visitas;
  if (nuevo) desfase.value = Date.now() - Date.parse(nuevo.actualizado);
  reloj.value = Date.now();
  sinConexion.value = false;
  cargando.value = false;
  const rutaNueva = JSON.stringify(nuevo?.recorrido ?? []);
  // La primera ruta real reencuadra; los cambios posteriores no mueven la vista del espectador.
  if (rutaNueva !== firmaRuta) { const primera = !firmaRuta; firmaRuta = rutaNueva; dibujarRuta(primera); }
  const referenciasNuevas = JSON.stringify(nuevo?.referencias ?? []);
  if (referenciasNuevas !== firmaReferencias && capaReferencias) {
    firmaReferencias = referenciasNuevas;
    capaReferencias.clearLayers();
    (nuevo?.referencias ?? []).forEach((r) => dibujarReferencia(r, capaReferencias!));
  }
  dibujarDanzas();
}

function conectarStream() {
  if (typeof EventSource === 'undefined') return;
  stream?.close();
  stream = new EventSource(URL_EN_VIVO_STREAM);
  stream.addEventListener('foto', (evento) => {
    ultimoMensaje = Date.now();
    try {
      const cuerpo = JSON.parse((evento as MessageEvent<string>).data) as { data: null | SeguimientoEnVivo; ok: boolean };
      if (cuerpo.ok) aplicar(cuerpo.data);
    } catch { /* foto malformada: la siguiente la reemplaza */ }
  });
  // EventSource reintenta solo; si el servidor lo cierra del todo (503 por tope), queda el GET.
  stream.onerror = () => { if (stream?.readyState === EventSource.CLOSED) { stream = undefined; } };
}

const streamActivo = () => Boolean(stream) && Date.now() - ultimoMensaje < SILENCIO_MAX_MS;

async function cargar() {
  consulta?.abort();
  const control = new AbortController();
  consulta = control;
  const limite = setTimeout(() => control.abort(), 8_000);
  try {
    const nuevo = await obtenerEnVivo(control.signal);
    if (consulta !== control) return;
    aplicar(nuevo);
  } catch {
    if (consulta !== control || streamActivo()) return;
    sinConexion.value = true;
    // Sin conexión el reloj sigue corriendo: las danzas sin foto nueva se ocultan solas a los 60 s.
  } finally {
    clearTimeout(limite);
    if (consulta === control) cargando.value = false;
  }
}

function verRecorrido(animar = true) {
  // Margen derecho mayor: ahí están los botones y no deben tapar el inicio ni la llegada.
  mapa?.fitBounds(L.latLngBounds(puntosRuta()), {
    paddingTopLeft: [40, 70], paddingBottomRight: [76, 50], animate: animar && !reducirMovimiento,
  });
}

/** Tocar una danza la resalta y muestra su nombre completo aunque el mapa esté alejado. */
function seleccionar(id: number) {
  seleccionId.value = seleccionId.value === id ? null : id;
  dibujarDanzas();
}

function acercar(delta: number) { espectadorMovio = true; if (mapa) mapa.setZoom(mapa.getZoom() + delta); }

async function alternarPantallaCompleta() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await raiz.value?.requestFullscreen();
  } catch { /* algunos navegadores móviles (iOS) no lo permiten */ }
}
/** El iframe solo existe con el modal abierto: al cerrarlo se detienen el video y su descarga. */
async function abrirTvu() {
  tvuAbierta.value = true;
  await nextTick();
  cerrarTvuBoton.value?.focus();
}
function cerrarTvu() {
  if (!tvuAbierta.value) return;
  tvuAbierta.value = false;
  void nextTick(() => botonTvu.value?.focus());
}
const CLAVE_VISITANTE = 'semfa-en-vivo-visitante';
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function nuevoUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
/**
 * Identificador anónimo y al azar de este navegador (no es un dato personal): se crea una vez y se
 * guarda en `localStorage`, así recargar o volver otro día no cuenta de nuevo. En modo incógnito o
 * con el almacenamiento bloqueado dura lo que la pestaña (`sessionStorage`).
 */
function idVisitante() {
  for (const almacen of [() => localStorage, () => sessionStorage]) {
    try {
      const guardado = almacen().getItem(CLAVE_VISITANTE);
      if (guardado && FORMATO_UUID.test(guardado)) return guardado;
      const nuevo = nuevoUuid();
      almacen().setItem(CLAVE_VISITANTE, nuevo);
      return nuevo;
    } catch { /* almacenamiento bloqueado: se prueba el siguiente */ }
  }
  return nuevoUuid();
}
function alPulsarTecla(evento: KeyboardEvent) { if (evento.key === 'Escape') cerrarTvu(); }
const puedePantallaCompleta = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
function alCambiarPantalla() { pantallaCompleta.value = Boolean(document.fullscreenElement); }
function alCambiarVisibilidad() {
  if (document.visibilityState !== 'visible') return;
  // Al volver de otra app el stream pudo morir en segundo plano: foto inmediata y reconexión.
  void cargar();
  if (!streamActivo()) conectarStream();
}
function actualizarNombres() {
  mapaElemento.value?.classList.toggle('ev-mapa--lejos', (mapa?.getZoom() ?? 16) < ZOOM_NOMBRES);
}

onMounted(() => {
  if (!mapaElemento.value) return;
  mapa = L.map(mapaElemento.value, {
    zoomControl: false, attributionControl: true, minZoom: 12, maxZoom: 19,
    zoomSnap: 0.5, wheelPxPerZoomLevel: 90, tapTolerance: 20,
  }).setView(L.latLngBounds(RUTA_INICIAL).getCenter(), 15);
  new CapaCartografia({ maxZoom: 19, attribution: ATRIBUCION_OSM }).addTo(mapa);
  capaReferencias = L.layerGroup().addTo(mapa);
  capaRuta = L.layerGroup().addTo(mapa);
  dibujarRuta(true);
  mapa.on('zoomend', actualizarNombres);
  mapa.on('dragstart', () => { espectadorMovio = true; });
  mapaElemento.value.addEventListener('wheel', () => { espectadorMovio = true; }, { passive: true });
  mapaElemento.value.addEventListener('touchstart', (e) => { if (e.touches.length > 1) espectadorMovio = true; }, { passive: true });
  actualizarNombres();
  observador = new ResizeObserver(() => { mapa?.invalidateSize({ pan: false }); encuadrarSiHaceFalta(); });
  observador.observe(mapaElemento.value);
  void cargar();
  conectarStream();
  // Visitantes únicos: el servidor ignora un identificador que ya contó (recargar no suma).
  registrarVisitaEnVivo(idVisitante()).then((total) => { if (total > (visitas.value ?? -1)) visitas.value = total; })
    .catch(() => { /* el contador no debe molestar a quien mira el mapa */ });
  // Respaldo: solo consulta si el stream no está entregando fotos.
  temporizador = setInterval(() => {
    if (document.visibilityState === 'visible' && !streamActivo()) void cargar();
  }, INTERVALO_MS);
  vencimiento = setInterval(() => { reloj.value = Date.now(); dibujarDanzas(); }, 5_000);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  document.addEventListener('fullscreenchange', alCambiarPantalla);
  document.addEventListener('keydown', alPulsarTecla);
});

onUnmounted(() => {
  clearInterval(temporizador);
  stream?.close();
  stream = undefined;
  clearInterval(vencimiento);
  consulta?.abort();
  consulta = undefined;
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  document.removeEventListener('fullscreenchange', alCambiarPantalla);
  document.removeEventListener('keydown', alPulsarTecla);
  observador?.disconnect();
  for (const { animacion } of marcadores.values()) if (animacion !== undefined) cancelAnimationFrame(animacion);
  mapa?.remove();
});
</script>

<template>
  <main ref="raiz" class="ev">
    <div class="ev__franja" aria-hidden="true"></div>
    <header class="ev__cabecera">
      <div class="ev__marca">
        <img src="/logo_uap_escudo.png" alt="Universidad Amazónica de Pando" class="ev__escudo" width="251" height="320" />
        <span>SEMFA<small>Universidad Amazónica de Pando</small></span>
      </div>
      <div class="ev__titulo">
        <h1>{{ datos?.actividad ?? (cargando ? 'Cargando…' : 'Entrada Folklórica') }}</h1>
        <p class="ev__guion">Recorrido en vivo</p>
      </div>
      <div class="ev__estado" role="status" aria-live="polite">
        <span v-if="sinConexion" class="ev__pastilla ev__pastilla--error">Reconectando…</span>
        <span v-else-if="datos" class="ev__pastilla"><i class="ev__latido" aria-hidden="true"></i>EN VIVO · {{ enVivo }} {{ enVivo === 1 ? 'danza' : 'danzas' }}</span>
        <small v-if="horaActualizacion">Actualizado {{ horaActualizacion }}</small>
      </div>
    </header>

    <section class="ev__cuerpo">
      <div class="ev__marco">
        <div ref="mapaElemento" class="ev__mapa" role="region" aria-label="Mapa del recorrido oficial con la posición de cada danza"></div>
        <div class="ev__controles">
          <button type="button" aria-label="Acercar" title="Acercar" @click="acercar(1)">+</button>
          <button type="button" aria-label="Alejar" title="Alejar" @click="acercar(-1)">−</button>
          <button type="button" aria-label="Ver todo el recorrido" title="Ver todo el recorrido" @click="verRecorrido()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8 17c6 0 2-9 8-10" /></svg>
          </button>
          <button v-if="puedePantallaCompleta" type="button" :aria-label="pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'"
            :title="pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'" @click="alternarPantallaCompleta">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path v-if="pantallaCompleta" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>
        <div class="ev__acciones">
          <button ref="botonTvu" type="button" class="ev__tvu" aria-haspopup="dialog" @click="abrirTvu">
            <i class="ev__latido" aria-hidden="true"></i>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M8 3l4 3 4-3M10 9.5v5l4-2.5z" /></svg>
            Transmisión TVU
          </button>
          <a class="ev__facebook" :href="URL_FACEBOOK_UAP" target="_blank" rel="noopener noreferrer"
            aria-label="UAP en Facebook (se abre en otra pestaña o en la app)" title="UAP en Facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21z" /></svg>
            <span>UAP en Facebook</span>
          </a>
        </div>
        <div v-if="!cargando && !datos" class="ev__aviso">
          <strong>Pronto en vivo</strong>
          <span>El recorrido aparecerá aquí cuando las danzas comiencen a compartir su ubicación.</span>
        </div>
      </div>

    </section>

    <div v-if="tvuAbierta" class="ev-tvu" @click.self="cerrarTvu">
      <section class="ev-tvu__ventana" role="dialog" aria-modal="true" aria-labelledby="ev-tvu-titulo">
        <header class="ev-tvu__cabecera">
          <h2 id="ev-tvu-titulo"><i class="ev__latido" aria-hidden="true"></i>TVU · Transmisión en vivo</h2>
          <a :href="URL_TVU" target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a>
          <button ref="cerrarTvuBoton" type="button" aria-label="Cerrar transmisión" title="Cerrar (Esc)" @click="cerrarTvu">✕</button>
        </header>
        <div class="ev-tvu__video">
          <!-- Sandbox: el reproductor solo necesita sus scripts y su propio origen para leer el HLS;
               no puede navegar esta página, abrir ventanas ni enviar formularios. -->
          <iframe :src="URL_TVU" title="Transmisión en vivo de TVU" allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>
        </div>
      </section>
    </div>

    <footer class="ev__pie">
      <span class="ev__ayuda">Toque una danza para ver su nombre · pellizque o use + / − para acercar</span>
      <span v-if="visitasTexto" class="ev__visitas" :aria-label="`${visitasTexto} visitas`">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        {{ visitasTexto }} {{ visitas === 1 ? 'visita' : 'visitas' }}
      </span>
    </footer>
  </main>
</template>

<style scoped>
.ev {
  --azul: #1f2fd6; --azul-oscuro: #0d1680; --rojo: #e11d2a;
  display: flex; flex-direction: column; min-height: 100dvh; height: 100dvh; overflow: hidden;
  background: radial-gradient(ellipse at 50% -10%, #4b5cff 0%, var(--azul) 38%, var(--azul-oscuro) 100%);
  color: #fff; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.ev__franja { flex: none; height: 8px; background: linear-gradient(var(--rojo) 0 45%, #fff 45% 60%, #1e3a8a 60%); }
.ev__cabecera { display: grid; flex: none; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 10px 20px 6px; }
.ev__marca { display: flex; align-items: center; gap: 10px; font-weight: 900; letter-spacing: .06em; }
.ev__marca small { display: block; font-size: 11px; font-weight: 600; letter-spacing: .02em; opacity: .8; }
.ev__escudo { width: auto; height: 66px; flex: none; filter: drop-shadow(0 2px 6px #0007); }
.ev__titulo { text-align: center; }
.ev__titulo h1 { margin: 0; color: #fff; font-size: clamp(20px, 3vw, 38px); font-weight: 900; line-height: 1.05; text-transform: uppercase; text-shadow: 0 3px 0 #0006; }
.ev__guion { display: inline-block; white-space: nowrap; margin: 4px 0 0; border: 2px solid #fff; border-radius: 12px; padding: 1px 18px; font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: clamp(18px, 2.2vw, 28px); font-style: italic; }
.ev__estado { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ev__estado small { opacity: .8; font-variant-numeric: tabular-nums; }
.ev__pastilla { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; background: var(--rojo); padding: 7px 14px; font-weight: 900; letter-spacing: .04em; white-space: nowrap; box-shadow: 0 4px 14px #0005; }
.ev__pastilla--error { background: #b45309; }
.ev__latido { width: 10px; height: 10px; border-radius: 50%; background: #fff; animation: ev-latido 1.4s ease-in-out infinite; }
.ev__cuerpo { display: flex; flex: 1; min-height: 0; gap: 14px; padding: 6px 16px 8px; }
.ev__marco { position: relative; flex: 1; min-width: 0; border: 5px solid var(--rojo); border-radius: 16px; background: #fff; box-shadow: 0 10px 30px #0007; overflow: hidden; }
.ev__mapa { position: absolute; inset: 0; isolation: isolate; background: #e8ecf5; }
.ev__controles { position: absolute; z-index: 500; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; }
.ev__controles button { display: grid; width: 44px; height: 44px; place-items: center; border: 2px solid #fff; border-radius: 12px; background: var(--azul); color: #fff; font-size: 24px; font-weight: 800; line-height: 1; box-shadow: 0 3px 10px #0005; cursor: pointer; }
.ev__controles button:hover { background: var(--azul-oscuro); }
.ev__controles button:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
.ev__controles svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.ev__aviso { position: absolute; z-index: 500; left: 50%; bottom: 18px; display: flex; flex-direction: column; gap: 2px; width: min(420px, calc(100% - 32px)); transform: translateX(-50%); border-radius: 12px; background: var(--azul-oscuro); padding: 12px 16px; text-align: center; box-shadow: 0 6px 18px #0006; }
.ev__pie { position: relative; display: flex; flex: none; align-items: center; justify-content: center; min-height: 30px; padding: 0 16px 10px; }
.ev__ayuda { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 17px; font-style: italic; opacity: .9; }
.ev__visitas { position: absolute; right: 16px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #ffffff55; border-radius: 999px; background: #0d168099; padding: 3px 12px; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ev__visitas svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; }

.ev__acciones { position: absolute; z-index: 500; top: 10px; left: 10px; display: flex; flex-wrap: wrap; gap: 8px; max-width: calc(100% - 80px); }
.ev__facebook { display: inline-flex; align-items: center; gap: 6px; border: 2px solid #fff; border-radius: 999px; background: #1877f2; padding: 9px 16px 9px 10px; color: #fff; font-weight: 900; text-decoration: none; box-shadow: 0 4px 14px #0006; }
.ev__facebook:hover { background: #0f5fcc; color: #fff; }
.ev__facebook:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
.ev__facebook svg { width: 22px; height: 22px; fill: currentColor; }
.ev__tvu { display: inline-flex; align-items: center; gap: 8px; border: 2px solid #fff; border-radius: 999px; background: var(--rojo); padding: 9px 16px; color: #fff; font-weight: 900; letter-spacing: .03em; box-shadow: 0 4px 14px #0006; cursor: pointer; }
.ev__tvu:hover { background: #b91520; }
.ev__tvu:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
.ev__tvu svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; }
.ev-tvu { position: fixed; z-index: 2000; inset: 0; display: grid; place-items: center; background: #050a3dcc; padding: 16px; backdrop-filter: blur(4px); }
.ev-tvu__ventana { display: flex; flex-direction: column; width: min(1180px, 100%, calc((100dvh - 120px) * 16 / 9)); min-width: min(320px, 100%); overflow: hidden; border: 4px solid var(--rojo); border-radius: 16px; background: var(--azul-oscuro); box-shadow: 0 20px 60px #000a; }
.ev-tvu__cabecera { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 16px; }
.ev-tvu__cabecera h2 { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 0; margin: 0; color: #fff; font-size: clamp(15px, 2vw, 19px); font-weight: 900; white-space: nowrap; }
.ev-tvu__cabecera a { color: #c7d2fe; font-size: 13px; font-weight: 700; white-space: nowrap; }
.ev-tvu__cabecera button { display: grid; width: 40px; height: 40px; flex: none; place-items: center; border: 2px solid #fff; border-radius: 10px; background: var(--rojo); color: #fff; font-size: 18px; font-weight: 900; cursor: pointer; }
.ev-tvu__cabecera button:focus-visible, .ev-tvu__cabecera a:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
.ev-tvu__video { position: relative; aspect-ratio: 16 / 9; background: #000; }
.ev-tvu__video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
@keyframes ev-latido { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.6); opacity: .5; } }

@media (max-width: 820px) {
  .ev__cabecera { padding: 8px 10px 4px; gap: 8px; }
  .ev__marca > span { display: none; }
  .ev__escudo { height: 46px; }
  .ev__cabecera { grid-template-columns: auto 1fr auto; }
  .ev__titulo { min-width: 0; text-align: left; }
  .ev__titulo h1 { display: -webkit-box; overflow: hidden; font-size: clamp(16px, 4.6vw, 22px); -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .ev__guion { padding: 0 10px; font-size: 15px; }
  .ev__cuerpo { flex-direction: column; gap: 8px; padding: 4px 8px 6px; }
  .ev__marco { border-width: 4px; border-radius: 12px; }
  .ev__pie { justify-content: flex-end; min-height: 0; padding: 0 8px 6px; }
  .ev__ayuda { display: none; }
  .ev__visitas { position: static; }
}
@media (max-width: 520px) {
  .ev__tvu { padding: 7px 12px; font-size: 13px; }
  .ev__facebook { padding: 7px; }
  .ev__facebook span { display: none; }
  .ev-tvu { padding: 8px; }
  .ev-tvu__cabecera a { display: none; }
}
@media (max-width: 380px) {
  .ev__pastilla { padding: 5px 10px; font-size: 12px; }
  .ev__estado small { display: none; }
}
@media (prefers-reduced-motion: reduce) { .ev__latido { animation: none; } }
</style>

<!-- Sin scoped: Leaflet crea los marcadores fuera del árbol del componente. Prefijo `ev-` para no chocar. -->
<style>
.ev-icono { background: none; border: 0; }
.ev-danza { position: relative; --tam: 30px; }
.ev-danza__punto, .ev-danza__onda { position: absolute; top: calc(var(--tam) / -2); left: calc(var(--tam) / -2); width: var(--tam); height: var(--tam); border-radius: 50%; }
.ev-danza__punto { z-index: 1; display: grid; place-items: center; border: 3px solid #fff; background: var(--c); color: #fff; font: 900 13px/1 system-ui, sans-serif; box-shadow: 0 3px 10px #0007; animation: ev-palpitar 1.6s ease-in-out infinite; }
.ev-danza__onda { background: var(--c); opacity: .55; animation: ev-onda 1.6s ease-out infinite; }
.ev-danza__nombre { position: absolute; bottom: calc(var(--tam) / 2 + 6px); left: 0; max-width: 180px; overflow: hidden; transform: translateX(-50%); border: 2px solid #fff; border-radius: 999px; background: var(--c); padding: 3px 10px; color: #fff; font: 800 12px/1.2 system-ui, sans-serif; text-overflow: ellipsis; white-space: nowrap; box-shadow: 0 3px 8px #0006; pointer-events: none; }
.ev-danza--seleccionada { --tam: 38px; }
.ev-danza--seleccionada .ev-danza__nombre { max-width: 260px; font-size: 14px; }
.ev-danza--sin-senal .ev-danza__punto { animation: none; filter: grayscale(.55); opacity: .8; }
.ev-danza--sin-senal .ev-danza__onda { display: none; }
.ev-danza--sin-senal .ev-danza__nombre { filter: grayscale(.55); opacity: .85; }
.ev-mapa--lejos .ev-danza:not(.ev-danza--seleccionada) .ev-danza__nombre { display: none; }
.ev-extremo { position: relative; }
.ev-extremo__pin { position: absolute; top: -9px; left: -9px; width: 18px; height: 18px; border: 4px solid #fff; border-radius: 50%; background: #e11d2a; box-shadow: 0 2px 8px #0007; }
.ev-extremo__texto { position: absolute; top: 12px; left: 0; transform: translateX(-50%); border: 2px solid #fff; border-radius: 8px; background: #1f2fd6; padding: 2px 10px; color: #fff; font: italic 900 13px/1.3 system-ui, sans-serif; letter-spacing: .06em; box-shadow: 0 3px 8px #0006; }
.ev-ruta-flujo { animation: ev-flujo 1.2s linear infinite; }
@keyframes ev-palpitar { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@keyframes ev-onda { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(2.4); opacity: 0; } }
@keyframes ev-flujo { to { stroke-dashoffset: -16; } }
@media (prefers-reduced-motion: reduce) {
  .ev-danza__punto, .ev-danza__onda, .ev-ruta-flujo { animation: none; }
}
</style>
