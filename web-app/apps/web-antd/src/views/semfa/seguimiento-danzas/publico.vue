<script setup lang="ts">
import type { AvisoAcompanante, SeguimientoPublico, PuntoGps } from '#/api/seguimiento-danzas';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAccessStore } from '@vben/stores';

import { ATRIBUCION_OSM, CapaCartografia } from '#/components/semfa/capa-cartografia';
import { enviarAvisoDanza, listarAvisosDanza, listarPosiciones, obtenerSeguimientoPublico } from '#/api/seguimiento-danzas';
import { dibujarReferencia } from './referencias';

const INICIO: L.LatLngTuple = [-11.034046, -68.760840];
const META: L.LatLngTuple = [-11.018768, -68.753103];
const route = useRoute();
const router = useRouter();
const acceso = useAccessStore();
const puedeEnviar = computed(() => Boolean(acceso.accessToken && acceso.accessCodes?.includes('ADMIN')));
const idActividad = computed(() => {
  const id = Number(route.query.actividad);
  return Number.isInteger(id) && id > 0 ? id : null;
});
const limitarZoom = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(12, Math.min(18, Math.round(numero))) : 15;
};
const zoom = ref(limitarZoom(route.query.zoom));
const datos = ref<SeguimientoPublico | null>(null);
const cargando = ref(true);
const error = ref(false);
const mapaElemento = ref<HTMLDivElement>();
const marcadores = new Map<number, L.Marker>();
let marcadorEnlace: L.Marker | undefined;
let firmaEnlace = '';
const estados = new Map<number, boolean>();
const numeros = new Map<number, number>();
const firmas = new Map<number, string>();
const animaciones = new Map<number, number>();
const ultimaFecha = new Map<number, number>();
const seleccionId = ref<null | number>(null);
const asignaciones = ref<Record<number, number>>({});
const avisos = ref<AvisoAcompanante[]>([]);
const enviandoAviso = ref(false);
const errorAviso = ref('');
let mapa: L.Map | undefined;
let capaRuta: L.LayerGroup | undefined;
let capaReferencias: L.LayerGroup | undefined;
let temporizador: ReturnType<typeof setInterval> | undefined;
let observador: ResizeObserver | undefined;
let version = 0;
let encuadrado = false;
let consultando = false;
let recargarPendiente = false;
let saltarAnimacion = false;
let ultimoExito = 0;
const enVivo = computed(() => datos.value?.danzas.filter((danza) => danza.enVivo).length ?? 0);
const sinSenal = computed(() => (datos.value?.danzas.length ?? 0) - enVivo.value);
const seleccionada = computed(() => datos.value?.danzas.find((danza) => danza.participanteId === seleccionId.value));
const avisoSeleccionado = computed(() => avisos.value.find((aviso) => aviso.idAsignacion === asignaciones.value[seleccionId.value ?? -1]));

function antiguedad(ultima: string) {
  const segundos = Math.max(0, Math.floor((Date.parse(datos.value?.actualizado ?? '') - Date.parse(ultima)) / 1000));
  return segundos < 60 ? `${segundos} s` : `${Math.floor(segundos / 60)} min`;
}

function tamanoIcono() {
  return Math.max(12, Math.min(32, (datos.value?.tamanoMarcadorPx ?? 22) + ((mapa?.getZoom() ?? 16) - 16) * 2));
}

function icono(numero: number, activo: boolean, color: string) {
  const tamano = tamanoIcono();
  return L.divIcon({
    className: `semfa-publico-pin ${activo ? '' : 'semfa-publico-pin--sin-senal'}`,
    html: `<span style="background:${color};border-radius:50%;width:100%;height:100%;display:grid;place-items:center">${numero}</span>`,
    iconSize: [tamano, tamano], iconAnchor: [tamano / 2, tamano / 2],
  });
}

function moverMarcador(id: number, marcador: L.Marker, destino: L.LatLngTuple, animar: boolean) {
  const anterior = marcador.getLatLng();
  const final = L.latLng(destino);
  const pendiente = animaciones.get(id);
  if (pendiente !== undefined) cancelAnimationFrame(pendiente);
  animaciones.delete(id);
  if (anterior.distanceTo(final) < 1) return;
  if (!animar || anterior.distanceTo(final) > 25) { marcador.setLatLng(final); return; }
  const comienzo = performance.now();
  const paso = (tiempo: number) => {
    const t = Math.min(1, (tiempo - comienzo) / 1200);
    const suave = t * t * (3 - 2 * t);
    marcador.setLatLng([
      anterior.lat + (final.lat - anterior.lat) * suave,
      anterior.lng + (final.lng - anterior.lng) * suave,
    ]);
    if (t < 1) animaciones.set(id, requestAnimationFrame(paso));
    else animaciones.delete(id);
  };
  animaciones.set(id, requestAnimationFrame(paso));
}

function puntosRuta(): L.LatLngTuple[] {
  const ruta = datos.value?.recorrido ?? [];
  return ruta.length >= 2 ? ruta.map((p: PuntoGps) => [p.latitud, p.longitud]) : [INICIO, META];
}

function dibujarRuta() {
  if (!capaRuta) return;
  capaRuta.clearLayers();
  const puntos = puntosRuta();
  L.polyline(puntos, { color: '#2563eb', weight: 25, opacity: 0.17, interactive: false }).addTo(capaRuta);
  L.polyline(puntos, { color: '#1d4ed8', weight: 5, opacity: 0.9, interactive: false }).addTo(capaRuta);
  L.circleMarker(puntos[0]!, { radius: 8, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 })
    .bindTooltip('Inicio', { permanent: true, direction: 'top' }).addTo(capaRuta);
  L.circleMarker(puntos.at(-1)!, { radius: 8, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 })
    .bindTooltip('Meta', { permanent: true, direction: 'top' }).addTo(capaRuta);
  if (!encuadrado && mapa) {
    mapa.setView(L.latLngBounds(puntos).getCenter(), zoom.value);
    encuadrado = true;
  }
}

function dibujarReferencias() {
  if (!capaReferencias) return;
  capaReferencias.clearLayers();
  (datos.value?.referencias ?? []).forEach((r) => dibujarReferencia(r, capaReferencias!));
}

function dibujarDanzas() {
  if (!mapa) return;
  const visibles = new Set<number>();
  for (const danza of datos.value?.danzas ?? []) {
    visibles.add(danza.participanteId);
    const punto: L.LatLngTuple = [danza.latitud, danza.longitud];
    const firma = `${danza.orden}/${danza.enVivo}/${danza.colorMarcador}/${tamanoIcono()}`;
    let marcador = marcadores.get(danza.participanteId);
    if (!marcador) {
      marcador = L.marker(punto, {
        icon: icono(danza.orden, danza.enVivo, danza.colorMarcador),
      }).addTo(mapa);
      marcador.bindPopup('');
      marcador.on('click', () => { seleccionId.value = danza.participanteId; });
      marcadores.set(danza.participanteId, marcador);
      estados.set(danza.participanteId, danza.enVivo);
      numeros.set(danza.participanteId, danza.orden);
      firmas.set(danza.participanteId, firma);
    } else {
      const fecha = Date.parse(danza.ultimaUbicacion);
      const diferencia = fecha - (ultimaFecha.get(danza.participanteId) ?? fecha);
      moverMarcador(danza.participanteId, marcador, punto,
        !saltarAnimacion && document.visibilityState === 'visible' && diferencia <= 8_000);
      if (firmas.get(danza.participanteId) !== firma) {
        marcador.setIcon(icono(danza.orden, danza.enVivo, danza.colorMarcador));
        estados.set(danza.participanteId, danza.enVivo);
        numeros.set(danza.participanteId, danza.orden);
        firmas.set(danza.participanteId, firma);
      }
    }
    ultimaFecha.set(danza.participanteId, Date.parse(danza.ultimaUbicacion));
    const contenido = document.createElement('strong');
    contenido.textContent = `${danza.danza} · Resp.: ${danza.responsable} · ${danza.enVivo ? 'En vivo' : `Sin señal hace ${antiguedad(danza.ultimaUbicacion)}`}`;
    marcador.setPopupContent(contenido);
  }
  for (const [id, marcador] of marcadores) {
    if (!visibles.has(id)) {
      const pendiente = animaciones.get(id);
      if (pendiente !== undefined) cancelAnimationFrame(pendiente);
      animaciones.delete(id);
      marcador.remove(); marcadores.delete(id); estados.delete(id); numeros.delete(id); firmas.delete(id); ultimaFecha.delete(id);
    }
  }
  const enlace = datos.value?.enlace;
  if (!enlace) { marcadorEnlace?.remove(); marcadorEnlace = undefined; firmaEnlace = ''; }
  else {
    const punto: L.LatLngTuple = [enlace.latitud, enlace.longitud];
    const tamano = tamanoIcono();
    const iconoEnlace = L.divIcon({ className: `semfa-publico-pin semfa-publico-pin--enlace ${enlace.enVivo ? '' : 'semfa-publico-pin--sin-senal'}`,
      html: 'E', iconSize: [tamano, tamano], iconAnchor: [tamano / 2, tamano / 2] });
    const firma = `${tamano}/${enlace.enVivo}`;
    if (!marcadorEnlace) { marcadorEnlace = L.marker(punto, { icon: iconoEnlace }).addTo(mapa); firmaEnlace = firma; }
    else { marcadorEnlace.setLatLng(punto); if (firmaEnlace !== firma) { marcadorEnlace.setIcon(iconoEnlace); firmaEnlace = firma; } }
    const contenido = document.createElement('strong');
    contenido.textContent = `Enlace · ${enlace.responsable} · ${enlace.enVivo ? 'En vivo' : 'Sin señal'}`;
    marcadorEnlace.bindPopup(contenido);
  }
}

async function cargar() {
  if (consultando) { recargarPendiente = true; return; }
  const id = idActividad.value;
  if (id === null) { datos.value = null; cargando.value = false; return; }
  consultando = true;
  const actual = ++version;
  try {
    const nuevo = await obtenerSeguimientoPublico(id);
    if (actual !== version) return;
    const rutaCambio = JSON.stringify(datos.value?.recorrido) !== JSON.stringify(nuevo.recorrido);
    const referenciasCambio = JSON.stringify(datos.value?.referencias) !== JSON.stringify(nuevo.referencias);
    datos.value = nuevo;
    ultimoExito = Date.now();
    error.value = false;
    if (rutaCambio) dibujarRuta();
    if (referenciasCambio) dibujarReferencias();
    dibujarDanzas();
    saltarAnimacion = false;
    if (puedeEnviar.value) {
      const [posiciones, recientes] = await Promise.allSettled([listarPosiciones(id), listarAvisosDanza(id)]);
      if (actual === version && posiciones.status === 'fulfilled') {
        asignaciones.value = Object.fromEntries(posiciones.value.map((p) => [p.participanteId, p.id]));
      }
      if (actual === version && recientes.status === 'fulfilled') avisos.value = recientes.value;
    }
  } catch {
    if (actual !== version) return;
    error.value = true;
    if (Date.now() - ultimoExito > 60_000) {
      datos.value = null;
      dibujarDanzas();
      dibujarReferencias();
    }
  } finally {
    consultando = false;
    if (actual === version) cargando.value = false;
    if (recargarPendiente) { recargarPendiente = false; void cargar(); }
  }
}

async function enviar(tipo: AvisoAcompanante['tipo']) {
  const id = asignaciones.value[seleccionId.value ?? -1];
  if (!id || enviandoAviso.value) return;
  enviandoAviso.value = true;
  errorAviso.value = '';
  try {
    const aviso = await enviarAvisoDanza(id, tipo);
    avisos.value = [aviso, ...avisos.value];
  } catch {
    errorAviso.value = 'No se pudo enviar. Compruebe si ya existe un aviso pendiente.';
  } finally { enviandoAviso.value = false; }
}

function verRecorrido() {
  mapa?.fitBounds(L.latLngBounds(puntosRuta()), { padding: [60, 60] });
}
function acercarDanza(id: number) {
  const marcador = marcadores.get(id);
  if (!marcador || !mapa) return;
  mapa.setView(marcador.getLatLng(), Math.max(mapa.getZoom(), 16));
  marcador.openPopup();
  seleccionId.value = id;
}

function alCambiarVisibilidad() {
  if (document.visibilityState !== 'visible') return;
  saltarAnimacion = true;
  void cargar();
}

onMounted(() => {
  if (!mapaElemento.value) return;
  mapa = L.map(mapaElemento.value, {
    zoomControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false,
  }).setView(L.latLngBounds(INICIO, META).getCenter(), zoom.value);
  new CapaCartografia({ maxZoom: 19, attribution: ATRIBUCION_OSM }).addTo(mapa);
  capaRuta = L.layerGroup().addTo(mapa);
  capaReferencias = L.layerGroup().addTo(mapa);
  dibujarRuta();
  mapa.on('zoomend', () => {
    zoom.value = mapa!.getZoom();
    dibujarDanzas();
    void router.replace({ query: { ...route.query, zoom: zoom.value } });
  });
  observador = new ResizeObserver(() => mapa?.invalidateSize({ pan: false }));
  observador.observe(mapaElemento.value);
  requestAnimationFrame(() => mapa?.invalidateSize({ pan: false }));
  void cargar();
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('pageshow', alCambiarVisibilidad);
  temporizador = setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, 3_000);
});
watch(idActividad, () => { version++; encuadrado = false; cargando.value = true; void cargar(); });
watch(puedeEnviar, () => { void cargar(); });
onUnmounted(() => {
  if (temporizador) clearInterval(temporizador);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  window.removeEventListener('pageshow', alCambiarVisibilidad);
  observador?.disconnect();
  version++;
  for (const pendiente of animaciones.values()) cancelAnimationFrame(pendiente);
  mapa?.remove();
});
</script>

<template>
  <main class="seguimiento-publico">
    <header class="seguimiento-publico__cabecera">
      <div>
        <span class="seguimiento-publico__marca">SEMFA · UAP</span>
        <h1>Seguimiento de danzas</h1>
        <p>{{ datos?.actividad ?? (cargando ? 'Cargando actividad…' : 'Actividad no disponible') }}</p>
      </div>
      <div class="seguimiento-publico__estado" :class="error ? 'seguimiento-publico__estado--error' : ''">
        {{ error ? 'Sin conexión' : `${enVivo} en vivo${sinSenal ? ` · ${sinSenal} sin señal` : ''}` }}
      </div>
    </header>
    <div class="seguimiento-publico__contenido">
      <section class="seguimiento-publico__mapa-contenedor">
        <div class="seguimiento-publico__controles">
          <button type="button" @click="verRecorrido">Ver todo el recorrido</button>
          <span>Zoom {{ zoom }}</span>
        </div>
        <div ref="mapaElemento" class="seguimiento-publico__mapa" aria-label="Mapa público del recorrido y danzas en vivo"></div>
      </section>
      <aside class="seguimiento-publico__lista">
        <h2>Danzas en vivo</h2>
        <p v-if="idActividad === null">Abra el enlace de una actividad para ver su recorrido.</p>
        <p v-else-if="error">No se pudo actualizar el mapa. Se reintentará automáticamente.</p>
        <p v-else-if="!datos?.danzas.length">Aún no hay acompañantes compartiendo una posición reciente.</p>
        <button v-for="danza in datos?.danzas ?? []" :key="danza.participanteId"
          type="button" class="seguimiento-publico__danza" @click="acercarDanza(danza.participanteId)">
          <b :class="!danza.enVivo ? 'seguimiento-publico__numero--sin-senal' : ''">{{ danza.orden }}</b>
          <span>{{ danza.danza }}<small class="seguimiento-publico__responsable">Resp.: {{ danza.responsable }}</small></span><small :class="!danza.enVivo ? 'seguimiento-publico__senal--antigua' : ''">
            {{ danza.enVivo ? 'En vivo' : `Sin señal · ${antiguedad(danza.ultimaUbicacion)}` }}
          </small>
        </button>
        <section v-if="seleccionada" class="seguimiento-publico__detalle">
          <h3>{{ seleccionada.danza }}</h3>
          <p>Responsable: <strong>{{ seleccionada.responsable }}</strong></p>
          <p>Ubicación: {{ seleccionada.enVivo ? 'En vivo' : `Sin señal hace ${antiguedad(seleccionada.ultimaUbicacion)}` }} · precisión ±{{ Math.round(seleccionada.precisionMetros) }} m</p>
          <template v-if="puedeEnviar">
            <p v-if="avisoSeleccionado" class="seguimiento-publico__aviso">
              {{ avisoSeleccionado.mensaje }} · {{ avisoSeleccionado.canceladoEn ? 'Cancelado al cambiar responsable' : avisoSeleccionado.leidoEn ? 'Leído y confirmado' : 'Pendiente de lectura' }}
            </p>
            <p v-if="errorAviso" class="seguimiento-publico__error">{{ errorAviso }}</p>
            <div class="seguimiento-publico__acciones">
              <button type="button" :disabled="enviandoAviso || Boolean(avisoSeleccionado && !avisoSeleccionado.leidoEn && !avisoSeleccionado.canceladoEn)" @click="enviar('DETENERSE')">Detenerse</button>
              <button type="button" :disabled="enviandoAviso || Boolean(avisoSeleccionado && !avisoSeleccionado.leidoEn && !avisoSeleccionado.canceladoEn)" @click="enviar('MAS_LENTO')">Más lento</button>
              <button type="button" :disabled="enviandoAviso || Boolean(avisoSeleccionado && !avisoSeleccionado.leidoEn && !avisoSeleccionado.canceladoEn)" @click="enviar('APRESURARSE')">Apresurarse</button>
            </div>
            <small>Solo un administrador con sesión iniciada puede enviar instrucciones.</small>
          </template>
        </section>
        <small class="seguimiento-publico__nota">El mapa se actualiza cada 3 segundos. Una señal de más de 30 segundos aparece en ámbar; se retira tras 60 segundos sin datos (por ejemplo, si cierran la aplicación) o cuando el acompañante la detiene.</small>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.seguimiento-publico { display: flex; flex-direction: column; min-height: 100dvh; background: #111827; color: white; }
.seguimiento-publico__cabecera { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 16px 24px; }
.seguimiento-publico__cabecera h1 { margin: 2px 0; color: white; font-size: clamp(22px, 2.2vw, 34px); font-weight: 800; }
.seguimiento-publico__cabecera p { margin: 0; color: #cbd5e1; }
.seguimiento-publico__marca { color: #60a5fa; font-size: 12px; font-weight: 800; letter-spacing: .12em; }
.seguimiento-publico__estado { border-radius: 999px; padding: 8px 14px; background: #065f46; white-space: nowrap; font-weight: 700; }
.seguimiento-publico__estado--error { background: #991b1b; }
.seguimiento-publico__contenido { display: flex; flex: 1; min-height: 0; gap: 14px; padding: 0 14px 14px; }
.seguimiento-publico__mapa-contenedor { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 8px; }
.seguimiento-publico__controles { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 10px; }
.seguimiento-publico__controles button { border-radius: 8px; background: #2563eb; padding: 7px 12px; color: white; font-weight: 700; }
.seguimiento-publico__mapa { position: relative; isolation: isolate; flex: 1; min-height: 520px; overflow: hidden; border-radius: 12px; background: #e5e7eb; }
.seguimiento-publico__lista { width: min(330px, 28vw); border-radius: 12px; background: #1f2937; padding: 18px; }
.seguimiento-publico__lista h2 { margin: 0 0 16px; color: white; font-size: 18px; font-weight: 800; }
.seguimiento-publico__lista p { color: #cbd5e1; }
.seguimiento-publico__danza { display: flex; width: 100%; align-items: center; gap: 10px; border-radius: 10px; padding: 10px; text-align: left; }
.seguimiento-publico__danza:hover { background: #334155; }
.seguimiento-publico__danza b { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border-radius: 50%; background: #059669; }
.seguimiento-publico__danza b.seguimiento-publico__numero--sin-senal { background: #d97706; }
.seguimiento-publico__danza span { flex: 1; }
.seguimiento-publico__danza small { color: #86efac; }
.seguimiento-publico__responsable { display: block; color: #cbd5e1 !important; }
.seguimiento-publico__danza small.seguimiento-publico__senal--antigua { color: #fbbf24; }
.seguimiento-publico__detalle { margin-top: 14px; border-top: 1px solid #475569; padding-top: 14px; }
.seguimiento-publico__detalle h3 { margin: 0 0 8px; color: white; font-size: 17px; }
.seguimiento-publico__detalle p { margin: 6px 0; color: #e2e8f0; }
.seguimiento-publico__aviso { color: #fbbf24 !important; }
.seguimiento-publico__error { color: #fca5a5 !important; }
.seguimiento-publico__acciones { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 10px 0; }
.seguimiento-publico__acciones button { border-radius: 7px; background: #2563eb; padding: 8px 4px; color: white; font-weight: 700; }
.seguimiento-publico__acciones button:disabled { cursor: not-allowed; opacity: .45; }
.seguimiento-publico__nota { display: block; margin-top: 22px; color: #94a3b8; }
.seguimiento-publico__mapa :deep(.semfa-publico-pin) { display: grid; place-items: center; border: 3px solid white; border-radius: 50%; background: #059669; box-shadow: 0 3px 12px #0007; color: white; font-weight: 800; }
.seguimiento-publico__mapa :deep(.semfa-publico-pin--sin-senal) { opacity: 0.65; }
.seguimiento-publico__mapa :deep(.semfa-publico-pin--enlace) { background: #2563eb; }
.seguimiento-publico__mapa :deep(.semfa-publico-pin--enlace.semfa-publico-pin--sin-senal) { background: #d97706; }
@media (max-width: 760px) {
  .seguimiento-publico__cabecera { padding: 12px; }
  .seguimiento-publico__contenido { flex-direction: column; }
  .seguimiento-publico__mapa { min-height: 58dvh; }
  .seguimiento-publico__lista { width: 100%; }
}
</style>
