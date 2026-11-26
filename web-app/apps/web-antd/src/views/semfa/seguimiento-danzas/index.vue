<script setup lang="ts">
import type { EnlaceActividad, OpcionesDanza, PermisosComunicacion, PosicionDanza, PuntoGps, ReferenciaDanza, ReferenciaDanzaRequest } from '#/api/seguimiento-danzas';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Button, Card, Input, InputNumber, Select, Switch, Tag } from 'ant-design-vue';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import SemfaPagina from '#/components/semfa/semfa-pagina.vue';
import { ATRIBUCION_OSM, CapaCartografia } from '#/components/semfa/capa-cartografia';
import { useActividadTrabajo } from '#/composables/useActividadTrabajo';
import { avisar, confirmar, sinAvisosDeError } from '#/composables/useAvisos';
import {
  asignarDanza, cambiarResponsableDanza, guardarEnlace, guardarOrdenAcompanantes, guardarRecorrido,
  listarPosiciones, listarReferencias, crearReferencia, actualizarReferencia, eliminarReferencia,
  obtenerEnlace, obtenerOpciones, obtenerRecorrido, guardarPermisosDanza, guardarPermisosEnlace,
  quitarAsignacion, quitarEnlace, guardarTamanoMarcador, guardarColorMarcador, obtenerSeguimientoPublico,
} from '#/api/seguimiento-danzas';
import { dibujarReferencia } from './referencias';

const INICIO: PuntoGps = { latitud: -11.034046, longitud: -68.760840 };
const META: PuntoGps = { latitud: -11.018768, longitud: -68.753103 };

const { idActividad, nombreActividad } = useActividadTrabajo();
const posiciones = ref<PosicionDanza[]>([]);
const opciones = ref<OpcionesDanza>({ danzas: [], acompanantes: [] });
const enlace = ref<EnlaceActividad | null>(null);
const usuarioEnlace = ref<number>();
const guardandoEnlace = ref(false);
const guardandoPermiso = ref(false);
const recorrido = ref<PuntoGps[]>([INICIO, META]);
const borrador = ref<PuntoGps[]>([]);
const editando = ref(false);
const referencias = ref<ReferenciaDanza[]>([]);
const marcandoReferencia = ref(false);
const referenciaEditando = ref<number | null>(null);
const referenciaNombre = ref('');
const referenciaFigura = ref<ReferenciaDanza['figura']>('CIRCULO');
const referenciaTamano = ref<number>(20);
const referenciaAlto = ref<number>(20);
const referenciaUbicacion = ref<PuntoGps | null>(null);
const guardandoReferencia = ref(false);
const usuariosElegidos = ref<Record<number, number | undefined>>({});
const editandoResponsable = ref<null | number>(null);
const usuarioEdicion = ref<number>();
const guardandoResponsable = ref(false);
const seleccion = ref<null | number>(null);
const zoomPublico = ref(15);
const tamanoMarcador = ref(22);
const guardandoEstilo = ref(false);
const coloresMarcador = ['#059669', '#7c3aed', '#dc2626', '#ea580c', '#0891b2', '#be185d', '#65a30d', '#4f46e5', '#ca8a04'];
function tamanoIcono() {
  return Math.max(12, Math.min(32, tamanoMarcador.value + ((mapa?.getZoom() ?? 16) - 16) * 2));
}
async function guardarTamano() {
  if (idActividad.value === undefined || guardandoEstilo.value) return;
  guardandoEstilo.value = true;
  try {
    tamanoMarcador.value = await guardarTamanoMarcador(idActividad.value, tamanoMarcador.value);
    dibujarMarcadores();
    avisar({ tipo: 'exito', titulo: 'Tamaño guardado' });
  } finally { guardandoEstilo.value = false; }
}
async function cambiarColor(p: PosicionDanza, color: string) {
  try {
    const actualizado = await guardarColorMarcador(p.id, color);
    posiciones.value = posiciones.value.map((x) => x.id === p.id ? actualizado : x);
  } catch { /* interceptor */ }
}
const enlacePublico = computed(() => idActividad.value === undefined ? ''
  : `/semfa/seguimiento-publico?actividad=${idActividad.value}&zoom=${zoomPublico.value}`);
const ahora = ref(Date.now());
const mapaElemento = ref<HTMLDivElement>();
const mapaCargado = ref(false);
const mapaConError = ref(false);
let mapa: L.Map | undefined;
let capaRecorrido: L.LayerGroup | undefined;
let capaBorrador: L.LayerGroup | undefined;
let capaReferencias: L.LayerGroup | undefined;
let observadorTamaño: ResizeObserver | undefined;
let mosaicosEsperados = 0;
let mosaicosFallidos = 0;
const marcadores = new Map<number, L.Marker>();
let marcadorEnlace: L.Marker | undefined;
let firmaEnlace = '';
const estadosMarcadores = new Map<number, string>();
const numerosMarcadores = new Map<number, number>();
const firmasMarcadores = new Map<number, string>();
const moviendoOrden = ref(false);
let temporizador: undefined | ReturnType<typeof setInterval>;
let version = 0;
let consultando = false;

function coordenadas(p: PuntoGps): L.LatLngTuple {
  return [p.latitud, p.longitud];
}

/** Igual que `OCULTAR_SIN_SENAL_SEGUNDOS` del backend. */
function vigente(p: Pick<PosicionDanza, 'compartiendo' | 'ultimaUbicacion'>) {
  return p.compartiendo && Boolean(p.ultimaUbicacion) && ahora.value - Date.parse(p.ultimaUbicacion!) <= 60_000;
}

function estado(p: PosicionDanza) {
  if (!p.compartiendo) return 'Detenido';
  if (!p.ultimaUbicacion || ahora.value - Date.parse(p.ultimaUbicacion) > 30_000) return 'Sin señal';
  return 'En vivo';
}

function dibujarRecorrido() {
  if (!mapa || !capaRecorrido) return;
  capaRecorrido.clearLayers();
  if (recorrido.value.length < 2) return;
  const latLngs = recorrido.value.map(coordenadas);
  L.polyline(latLngs, { color: '#2563eb', weight: 28, opacity: 0.16, interactive: false }).addTo(capaRecorrido);
  L.polyline(latLngs, { color: '#1d4ed8', weight: 5, opacity: 0.9, interactive: false }).addTo(capaRecorrido);
  L.circleMarker(coordenadas(INICIO), { radius: 8, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 })
    .bindTooltip('Inicio', { permanent: true, direction: 'top' }).addTo(capaRecorrido);
  L.circleMarker(coordenadas(META), { radius: 8, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 })
    .bindTooltip('Meta', { permanent: true, direction: 'top' }).addTo(capaRecorrido);
}

function dibujarBorrador() {
  if (!capaBorrador) return;
  capaBorrador.clearLayers();
  if (!editando.value) return;
  const puntos = [...borrador.value, META];
  L.polyline(puntos.map(coordenadas), {
    color: '#f97316', weight: 5, opacity: 0.9, dashArray: '10 8', interactive: false,
  }).addTo(capaBorrador);
  borrador.value.slice(1).forEach((p) => L.circleMarker(coordenadas(p), {
    radius: 6, color: '#f97316', weight: 2, fillColor: '#fff', fillOpacity: 1,
  }).addTo(capaBorrador!));
}

function dibujarReferencias() {
  if (!capaReferencias) return;
  capaReferencias.clearLayers();
  referencias.value.forEach((r) => dibujarReferencia(r, capaReferencias!));
  if (marcandoReferencia.value && referenciaUbicacion.value && referenciaTamano.value) {
    dibujarReferencia({ nombre: referenciaNombre.value.trim() || 'Nuevo lugar', figura: referenciaFigura.value,
      tamanoMetros: referenciaTamano.value, altoMetros: referenciaFigura.value === 'RECTANGULO' ? referenciaAlto.value : null,
      ...referenciaUbicacion.value }, capaReferencias, true);
  }
}

function contenidoMarcador(p: PosicionDanza) {
  const contenido = document.createElement('div');
  const titulo = document.createElement('strong');
  titulo.textContent = p.danza;
  const responsable = document.createElement('div');
  responsable.textContent = p.responsable;
  const señal = document.createElement('div');
  señal.textContent = estado(p) + ' · precisión ' +
    (p.precisionMetros === null ? '—' : Math.round(p.precisionMetros) + ' m');
  contenido.append(titulo, responsable, señal);
  return contenido;
}

function iconoMarcador(numero: number, activo: boolean, color: string) {
  const tamano = tamanoIcono();
  return L.divIcon({
    className: 'semfa-gps-pin ' + (activo ? 'semfa-gps-pin--vivo' : 'semfa-gps-pin--antiguo'),
    html: `<span style="background:${color};border-radius:50%;width:100%;height:100%;display:grid;place-items:center">${numero}</span>`,
    iconSize: [tamano, tamano], iconAnchor: [tamano / 2, tamano / 2],
  });
}

function dibujarMarcadores() {
  if (!mapa) return;
  const ids = new Set<number>();
  posiciones.value.forEach((p) => {
    // Detenida o más de 60 s sin señal (cerraron el APK sin «Detener»): fuera del mapa, como en la
    // vista pública. La fila de la lista sigue mostrando «Sin señal» y la hora de la última lectura.
    if (p.latitud === null || p.longitud === null || !vigente(p)) return;
    ids.add(p.id);
    const punto: L.LatLngTuple = [p.latitud, p.longitud];
    const señal = estado(p);
    const firma = `${p.orden}/${señal}/${p.colorMarcador}/${tamanoIcono()}`;
    let marcador = marcadores.get(p.id);
    if (!marcador) {
      marcador = L.marker(punto, { icon: iconoMarcador(p.orden, señal === 'En vivo', p.colorMarcador) }).addTo(mapa!);
      marcador.on('click', () => { seleccion.value = p.id; });
      marcador.bindPopup(contenidoMarcador(p));
      marcadores.set(p.id, marcador);
      estadosMarcadores.set(p.id, señal);
      numerosMarcadores.set(p.id, p.orden);
      firmasMarcadores.set(p.id, firma);
    } else {
      if (marcador.getLatLng().distanceTo(L.latLng(punto)) > 0.5) marcador.setLatLng(punto);
      marcador.setPopupContent(contenidoMarcador(p));
      if (firmasMarcadores.get(p.id) !== firma) {
        marcador.setIcon(iconoMarcador(p.orden, señal === 'En vivo', p.colorMarcador));
        estadosMarcadores.set(p.id, señal);
        numerosMarcadores.set(p.id, p.orden);
        firmasMarcadores.set(p.id, firma);
      }
    }
  });
  for (const [id, marcador] of marcadores) {
    if (!ids.has(id)) { marcador.remove(); marcadores.delete(id); estadosMarcadores.delete(id); numerosMarcadores.delete(id); firmasMarcadores.delete(id); }
  }
  if (enlace.value && vigente(enlace.value) && enlace.value.latitud !== null && enlace.value.longitud !== null) {
    const punto: L.LatLngTuple = [enlace.value.latitud, enlace.value.longitud];
    const tamano = tamanoIcono();
    const icono = L.divIcon({ className: 'semfa-gps-pin semfa-gps-pin--enlace', html: '<span>E</span>',
      iconSize: [tamano, tamano], iconAnchor: [tamano / 2, tamano / 2] });
    if (!marcadorEnlace) { marcadorEnlace = L.marker(punto, { icon: icono }).addTo(mapa); firmaEnlace = String(tamano); }
    else { marcadorEnlace.setLatLng(punto); if (firmaEnlace !== String(tamano)) { marcadorEnlace.setIcon(icono); firmaEnlace = String(tamano); } }
    const contenido = document.createElement('strong');
    contenido.textContent = `Enlace · ${enlace.value.responsable}`;
    marcadorEnlace.bindPopup(contenido);
  } else { marcadorEnlace?.remove(); marcadorEnlace = undefined; firmaEnlace = ''; }
}

onMounted(() => {
  if (!mapaElemento.value) return;
  mapa = L.map(mapaElemento.value, {
    zoomControl: true,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
  }).fitBounds(
    L.latLngBounds(coordenadas(INICIO), coordenadas(META)), { padding: [50, 50] },
  );
  const mosaicos = new CapaCartografia({
    maxZoom: 19,
    attribution: ATRIBUCION_OSM,
  });
  mosaicos.on('loading', () => {
    mosaicosEsperados = 0;
    mosaicosFallidos = 0;
    mapaCargado.value = false;
    mapaConError.value = false;
  });
  mosaicos.on('tileloadstart', () => { mosaicosEsperados++; });
  mosaicos.on('tileload', () => { mapaCargado.value = true; });
  mosaicos.on('tileerror', () => {
    mosaicosFallidos++;
    if (mosaicosFallidos >= mosaicosEsperados && !mapaCargado.value) mapaConError.value = true;
  });
  mosaicos.addTo(mapa);
  mapa.on('zoomend', dibujarMarcadores);
  capaRecorrido = L.layerGroup().addTo(mapa);
  capaBorrador = L.layerGroup().addTo(mapa);
  capaReferencias = L.layerGroup().addTo(mapa);
  mapa.on('click', (evento: L.LeafletMouseEvent) => {
    const rectangulo = mapaElemento.value?.getBoundingClientRect();
    const clic = evento.originalEvent;
    if (!rectangulo || clic.clientX < rectangulo.left || clic.clientX > rectangulo.right
      || clic.clientY < rectangulo.top || clic.clientY > rectangulo.bottom) return;
    if (marcandoReferencia.value) {
      referenciaUbicacion.value = { latitud: evento.latlng.lat, longitud: evento.latlng.lng };
      return;
    }
    if (!editando.value || borrador.value.length >= 99) return;
    borrador.value.push({ latitud: evento.latlng.lat, longitud: evento.latlng.lng });
  });
  dibujarRecorrido();
  dibujarBorrador();
  dibujarReferencias();
  dibujarMarcadores();
  observadorTamaño = new ResizeObserver(() => mapa?.invalidateSize({ pan: false }));
  observadorTamaño.observe(mapaElemento.value);
  requestAnimationFrame(() => mapa?.invalidateSize({ pan: false }));
  temporizador = setInterval(refrescar, 2000);
});
onUnmounted(() => {
  if (temporizador) clearInterval(temporizador);
  observadorTamaño?.disconnect();
  version++;
  mapa?.remove();
});
watch(recorrido, dibujarRecorrido, { deep: true });
watch([borrador, editando], dibujarBorrador, { deep: true });
watch([referencias, marcandoReferencia, referenciaUbicacion, referenciaNombre, referenciaFigura, referenciaTamano, referenciaAlto],
  dibujarReferencias, { deep: true });
watch([posiciones, enlace, ahora], dibujarMarcadores);

async function cargar() {
  const id = idActividad.value;
  const actual = ++version;
  posiciones.value = [];
  opciones.value = { danzas: [], acompanantes: [] };
  enlace.value = null;
  usuarioEnlace.value = undefined;
  recorrido.value = [INICIO, META];
  referencias.value = [];
  if (id === undefined) return;
  const [lista, alternativas, ruta, enlaceActual, lugares, estilo] = await Promise.allSettled([
    sinAvisosDeError(() => listarPosiciones(id)),
    sinAvisosDeError(() => obtenerOpciones(id)),
    sinAvisosDeError(() => obtenerRecorrido(id)),
    sinAvisosDeError(() => obtenerEnlace(id)),
    sinAvisosDeError(() => listarReferencias(id)),
    sinAvisosDeError(() => obtenerSeguimientoPublico(id)),
  ]);
  if (actual !== version) return;
  if (lista.status === 'fulfilled') posiciones.value = lista.value;
  if (estilo.status === 'fulfilled') tamanoMarcador.value = estilo.value.tamanoMarcadorPx;
  if (alternativas.status === 'fulfilled') opciones.value = alternativas.value;
  if (ruta.status === 'fulfilled' && ruta.value.length >= 2) recorrido.value = ruta.value;
  if (enlaceActual.status === 'fulfilled') {
    enlace.value = enlaceActual.value;
    usuarioEnlace.value = enlaceActual.value?.usuarioId;
  }
  if (lugares.status === 'fulfilled') referencias.value = lugares.value;
  if (lista.status === 'rejected' || alternativas.status === 'rejected' || ruta.status === 'rejected')
    avisar({ tipo: 'error', titulo: 'No se pudo cargar todo el seguimiento', mensaje: 'Compruebe el servidor y pulse Actualizar.' });
}
async function refrescar() {
  const id = idActividad.value;
  if (id === undefined || !posiciones.value.length || document.visibilityState !== 'visible' || consultando) return;
  consultando = true;
  try {
    const [lista, enlaceActual] = await Promise.all([
      sinAvisosDeError(() => listarPosiciones(id)),
      sinAvisosDeError(() => obtenerEnlace(id)),
    ]);
    if (id === idActividad.value) { posiciones.value = lista; enlace.value = enlaceActual; ahora.value = Date.now(); }
  } catch { /* siguiente lectura */ }
  finally { consultando = false; }
}
async function actualizar() { await cargar(); ahora.value = Date.now(); }
watch(idActividad, (id) => {
  seleccion.value = null;
  cancelarCambio();
  editando.value = false;
  cancelarReferencia();
  try { zoomPublico.value = Number(localStorage.getItem(`semfa-zoom-publico-${id}`)) || 15; }
  catch { zoomPublico.value = 15; }
  void cargar();
}, { immediate: true });
watch(zoomPublico, (valor) => {
  if (idActividad.value === undefined) return;
  try { localStorage.setItem(`semfa-zoom-publico-${idActividad.value}`, String(valor)); }
  catch { /* el enlace funciona aunque no haya almacenamiento */ }
});

async function asignar(participanteId: number) {
  const id = idActividad.value;
  const usuarioId = usuariosElegidos.value[participanteId];
  if (id === undefined || usuarioId === undefined) return;
  try {
    await asignarDanza(id, participanteId, usuarioId);
    delete usuariosElegidos.value[participanteId];
    await cargar();
    avisar({ tipo: 'exito', titulo: 'Acompañante asignado' });
  } catch { /* interceptor */ }
}
async function asignarEnlace() {
  const id = idActividad.value;
  if (id === undefined || !usuarioEnlace.value || guardandoEnlace.value) return;
  guardandoEnlace.value = true;
  try {
    await guardarEnlace(id, usuarioEnlace.value);
    await cargar();
    avisar({ tipo: 'exito', titulo: 'Acompañante de enlace asignado' });
  } catch { /* interceptor */ }
  finally { guardandoEnlace.value = false; }
}
async function retirarEnlace() {
  const id = idActividad.value;
  if (id === undefined || !await confirmar({ titulo: 'Retirar enlace', mensaje: 'Se apagará su ubicación de esta actividad.' })) return;
  try { await quitarEnlace(id); await cargar(); avisar({ tipo: 'exito', titulo: 'Enlace retirado' }); }
  catch { /* interceptor */ }
}
async function cambiarPermiso(origen: 'danza' | 'enlace', id: number,
  campo: keyof PermisosComunicacion, valor: boolean) {
  const actual = origen === 'enlace' ? enlace.value : posiciones.value.find((p) => p.id === id);
  if (!actual || guardandoPermiso.value) return;
  const permisos: PermisosComunicacion = {
    puedeEnviarVoz: actual.puedeEnviarVoz,
    puedeAvisar: actual.puedeAvisar,
    puedeVozGlobal: actual.puedeVozGlobal,
    [campo]: valor,
  };
  if (!permisos.puedeEnviarVoz) permisos.puedeVozGlobal = false;
  guardandoPermiso.value = true;
  try {
    if (origen === 'enlace') enlace.value = await guardarPermisosEnlace(id, permisos);
    else {
      const actualizado = await guardarPermisosDanza(id, permisos);
      posiciones.value = posiciones.value.map((p) => p.id === id ? actualizado : p);
    }
    avisar({ tipo: 'exito', titulo: 'Permisos actualizados' });
  } catch { /* interceptor */ }
  finally { guardandoPermiso.value = false; }
}
function comenzarCambio(p: PosicionDanza) {
  editandoResponsable.value = p.id;
  usuarioEdicion.value = p.usuarioId;
}
function cancelarCambio() {
  editandoResponsable.value = null;
  usuarioEdicion.value = undefined;
}
function opcionesParaCambio(p: PosicionDanza) {
  return [...usuarioLibre.value, { id: p.usuarioId, nombre: p.responsable }]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((o) => ({ value: o.id, label: o.nombre }));
}
async function guardarCambio(p: PosicionDanza) {
  const nuevo = usuarioEdicion.value;
  if (nuevo === undefined || nuevo === p.usuarioId || guardandoResponsable.value) return;
  if (!await confirmar({ titulo: 'Cambiar acompañante',
    mensaje: `La ubicación anterior de ${p.danza} se borrará. El nuevo responsable deberá iniciar el GPS desde su APK.` })) return;
  guardandoResponsable.value = true;
  try {
    await cambiarResponsableDanza(p.id, nuevo);
    cancelarCambio();
    await cargar();
    avisar({ tipo: 'exito', titulo: 'Acompañante actualizado', mensaje: p.danza });
  } catch { /* interceptor */ }
  finally { guardandoResponsable.value = false; }
}
async function moverOrden(idAsignacion: number, direccion: -1 | 1) {
  const id = idActividad.value;
  if (id === undefined || moviendoOrden.value) return;
  const ids = posiciones.value.map((p) => p.id);
  const indice = ids.indexOf(idAsignacion);
  const vecino = indice + direccion;
  if (indice < 0 || vecino < 0 || vecino >= ids.length) return;
  [ids[indice], ids[vecino]] = [ids[vecino]!, ids[indice]!];
  moviendoOrden.value = true;
  try {
    posiciones.value = await guardarOrdenAcompanantes(id, ids);
    avisar({ tipo: 'exito', titulo: 'Orden de acompañantes guardado' });
  } catch { /* interceptor */ }
  finally { moviendoOrden.value = false; }
}
async function quitar(id: number) {
  if (!await confirmar({ titulo: 'Retirar asignación', mensaje: 'El acompañante dejará de compartir esta danza.', peligro: true })) return;
  try { await quitarAsignacion(id); seleccion.value = null; await cargar(); avisar({ tipo: 'exito', titulo: 'Asignación retirada' }); }
  catch { /* interceptor */ }
}
function verEnMapa(p: PosicionDanza) {
  seleccion.value = p.id;
  if (p.latitud === null || p.longitud === null) {
    avisar({ tipo: 'advertencia', titulo: 'Todavía no hay GPS', mensaje: 'El acompañante debe iniciar la ubicación desde el APK.' });
    return;
  }
  mapa?.setView([p.latitud, p.longitud], Math.max(mapa.getZoom(), 17));
  marcadores.get(p.id)?.openPopup();
}
function comenzarRecorrido() {
  cancelarReferencia();
  borrador.value = [INICIO];
  editando.value = true;
}

function nuevaReferencia() {
  editando.value = false;
  referenciaEditando.value = null;
  referenciaNombre.value = '';
  referenciaFigura.value = 'CIRCULO';
  referenciaTamano.value = 20;
  referenciaAlto.value = 20;
  referenciaUbicacion.value = null;
  marcandoReferencia.value = true;
}
function editarReferencia(r: ReferenciaDanza) {
  editando.value = false;
  referenciaEditando.value = r.id;
  referenciaNombre.value = r.nombre;
  referenciaFigura.value = r.figura;
  referenciaTamano.value = r.tamanoMetros;
  referenciaAlto.value = r.altoMetros ?? r.tamanoMetros;
  referenciaUbicacion.value = { latitud: r.latitud, longitud: r.longitud };
  marcandoReferencia.value = true;
  mapa?.setView([r.latitud, r.longitud], Math.max(mapa.getZoom(), 16));
}
function cancelarReferencia() {
  marcandoReferencia.value = false;
  referenciaEditando.value = null;
  referenciaUbicacion.value = null;
}
async function guardarReferencia() {
  const id = idActividad.value;
  if (id === undefined || !referenciaUbicacion.value || !referenciaNombre.value.trim()
    || !referenciaTamano.value || referenciaTamano.value < 2 || referenciaTamano.value > 500
    || (referenciaFigura.value === 'RECTANGULO' && (!referenciaAlto.value || referenciaAlto.value < 2 || referenciaAlto.value > 500))
    || guardandoReferencia.value) return;
  const datos: ReferenciaDanzaRequest = {
    nombre: referenciaNombre.value.trim(), figura: referenciaFigura.value,
    tamanoMetros: referenciaTamano.value,
    altoMetros: referenciaFigura.value === 'RECTANGULO' ? referenciaAlto.value : null,
    ...referenciaUbicacion.value,
  };
  guardandoReferencia.value = true;
  try {
    if (referenciaEditando.value === null) await crearReferencia(id, datos);
    else await actualizarReferencia(referenciaEditando.value, datos);
    referencias.value = await listarReferencias(id);
    cancelarReferencia();
    avisar({ tipo: 'exito', titulo: 'Lugar guardado' });
  } catch { /* interceptor */ }
  finally { guardandoReferencia.value = false; }
}
async function borrarReferencia(r: ReferenciaDanza) {
  if (!await confirmar({ titulo: 'Eliminar lugar', mensaje: `Se quitará «${r.nombre}» de los mapas.`, peligro: true })) return;
  try {
    await eliminarReferencia(r.id);
    referencias.value = referencias.value.filter((x) => x.id !== r.id);
    if (referenciaEditando.value === r.id) cancelarReferencia();
    avisar({ tipo: 'exito', titulo: 'Lugar eliminado' });
  } catch { /* interceptor */ }
}
function encuadrarRecorrido() {
  if (!mapa) return;
  mapa.invalidateSize({ pan: false });
  mapa.fitBounds(L.latLngBounds(coordenadas(INICIO), coordenadas(META)), { padding: [50, 50] });
}
async function terminarRecorrido() {
  const id = idActividad.value;
  if (id === undefined) return;
  const puntos = [...borrador.value, META];
  try {
    recorrido.value = await guardarRecorrido(id, puntos);
    editando.value = false;
    avisar({ tipo: 'exito', titulo: 'Recorrido guardado' });
  } catch { /* interceptor */ }
}

function metrosGps(a: PuntoGps, b: PuntoGps) {
  const dLat = (b.latitud - a.latitud) * Math.PI / 180;
  const dLon = (b.longitud - a.longitud) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitud * Math.PI / 180)
    * Math.cos(b.latitud * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function avance(p: PosicionDanza) {
  if (p.latitud === null || p.longitud === null || recorrido.value.length < 2) return null;
  const base = recorrido.value[0]!;
  const coseno = Math.cos(base.latitud * Math.PI / 180);
  const xy = (q: PuntoGps) => ({
    x: (q.longitud - base.longitud) * 111320 * coseno,
    y: (q.latitud - base.latitud) * 110574,
  });
  const actual = xy(p as PuntoGps);
  let total = 0; let hasta = 0; let minima = Infinity;
  for (let i = 1; i < recorrido.value.length; i++) {
    const a = xy(recorrido.value[i - 1]!);
    const b = xy(recorrido.value[i]!);
    const dx = b.x - a.x; const dy = b.y - a.y;
    const largo = Math.hypot(dx, dy);
    if (largo === 0) continue;
    const t = Math.max(0, Math.min(1, ((actual.x - a.x) * dx + (actual.y - a.y) * dy) / (largo * largo)));
    const distancia = Math.hypot(actual.x - a.x - t * dx, actual.y - a.y - t * dy);
    if (distancia < minima) { minima = distancia; hasta = total + t * largo; }
    total += largo;
  }
  if (!total || minima > Math.max(30, (p.precisionMetros ?? 0) * 2)) return null;
  return { porcentaje: Math.round(100 * hasta / total), metros: hasta, faltan: total - hasta };
}
const asignacionesPorDanza = computed(() => new Map(posiciones.value.map((p) => [p.participanteId, p])));
const filasDanzas = computed(() => [...opciones.value.danzas].sort((a, b) => {
  const primera = asignacionesPorDanza.value.get(a.id);
  const segunda = asignacionesPorDanza.value.get(b.id);
  if (primera && segunda) return primera.orden - segunda.orden;
  if (primera) return -1;
  if (segunda) return 1;
  return a.nombre.localeCompare(b.nombre, 'es');
}));
const usuarioLibre = computed(() => opciones.value.acompanantes.filter((o) =>
  !posiciones.value.some((p) => p.usuarioId === o.id) && o.id !== enlace.value?.usuarioId));
const opcionesEnlace = computed(() => [
  ...usuarioLibre.value,
  ...(enlace.value ? [{ id: enlace.value.usuarioId, nombre: enlace.value.responsable }] : []),
].map((o) => ({ value: o.id, label: o.nombre })));
const seleccionada = computed(() => posiciones.value.find((p) => p.id === seleccion.value));
const avanceSeleccionado = computed(() => seleccionada.value ? avance(seleccionada.value) : null);
const separaciones = computed(() => {
  const actual = seleccionada.value;
  if (!actual || actual.latitud === null || actual.longitud === null) return [];
  return posiciones.value.filter((p) => p.id !== actual.id && p.latitud !== null && p.longitud !== null)
    .map((p) => ({
      id: p.id, danza: p.danza,
      directa: metrosGps(actual as PuntoGps, p as PuntoGps),
      ruta: avance(actual)?.metros !== undefined && avance(p)?.metros !== undefined
        ? Math.abs(avance(actual)!.metros - avance(p)!.metros) : null,
      reciente: estado(actual) === 'En vivo' && estado(p) === 'En vivo',
    })).sort((a, b) => a.directa - b.directa);
});
</script>

<template>
  <SemfaPagina title="Acompañantes y ubicación" :description="(nombreActividad || 'Elija una actividad') + ' · GPS en vivo'">
    <Card class="mb-3 rounded-xl" title="Acompañante de enlace">
      <p class="mb-3 text-gray-600">Esta persona recorre la ruta sin ocupar una danza. Desde el APK ve el mapa y envía instrucciones o mensajes de voz a los responsables.</p>
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model:value="usuarioEnlace" class="min-w-64" show-search option-filter-prop="label" :options="opcionesEnlace" placeholder="Elegir cuenta acompañante libre" />
        <Button class="semfa-btn semfa-btn--primario" :loading="guardandoEnlace" :disabled="!usuarioEnlace || usuarioEnlace === enlace?.usuarioId" @click="asignarEnlace">Guardar enlace</Button>
        <Button v-if="enlace" @click="retirarEnlace">Retirar</Button>
        <Tag v-if="enlace" :color="enlace.compartiendo ? 'green' : 'default'">{{ enlace.compartiendo ? 'GPS activo' : 'GPS detenido' }}</Tag>
      </div>
    </Card>
    <Card class="mb-3 rounded-xl" :title="'Asignación de acompañantes · ' + asignacionesPorDanza.size + '/' + opciones.danzas.length + ' danzas'">
      <p class="mb-3 text-gray-600">Cada danza inscrita tiene una cuenta acompañante. Use las flechas para fijar su orden en el desfile; el número del mapa no cambia cuando alguien deja de enviar GPS.</p>
      <p v-if="idActividad === undefined" class="text-amber-700">Seleccione una actividad de trabajo.</p>
      <p v-else-if="!opciones.danzas.length" class="text-amber-700">No hay danzas inscritas. Regístrelas en Mi actividad → Participantes.</p>
      <p v-else-if="!opciones.acompanantes.length" class="text-amber-700">No hay cuentas con rol ACOMPAÑANTE. Créelas en Catálogos → Usuarios.</p>
      <div v-if="opciones.danzas.length" class="overflow-x-auto">
        <table class="semfa-tabla w-full text-left">
          <thead><tr><th>Orden</th><th>Danza</th><th>Responsable</th><th>Color</th><th>GPS</th><th>Acción</th></tr></thead>
          <tbody>
            <tr v-for="danza in filasDanzas" :key="danza.id">
              <td class="whitespace-nowrap">
                <template v-if="asignacionesPorDanza.get(danza.id)">
                  <strong class="mr-2">{{ asignacionesPorDanza.get(danza.id)?.orden }}</strong>
                  <Button size="small" :disabled="moviendoOrden || asignacionesPorDanza.get(danza.id)?.orden === 1" :aria-label="`Subir ${danza.nombre} en el orden`" @click="moverOrden(asignacionesPorDanza.get(danza.id)!.id, -1)">↑</Button>
                  <Button size="small" class="ml-1" :disabled="moviendoOrden || asignacionesPorDanza.get(danza.id)?.orden === posiciones.length" :aria-label="`Bajar ${danza.nombre} en el orden`" @click="moverOrden(asignacionesPorDanza.get(danza.id)!.id, 1)">↓</Button>
                </template>
                <span v-else>—</span>
              </td>
              <td class="font-semibold">{{ danza.nombre }}</td>
              <template v-if="asignacionesPorDanza.get(danza.id)">
                <td>
                  <Select v-if="editandoResponsable === asignacionesPorDanza.get(danza.id)?.id"
                    v-model:value="usuarioEdicion" class="min-w-56" show-search option-filter-prop="label"
                    :options="opcionesParaCambio(asignacionesPorDanza.get(danza.id)!)"
                    placeholder="Elegir otro acompañante" />
                  <span v-else>{{ asignacionesPorDanza.get(danza.id)?.responsable }}</span>
                </td>
                <td><Select :value="asignacionesPorDanza.get(danza.id)?.colorMarcador" class="w-28"
                  :options="coloresMarcador.map(c => ({ value: c, label: c }))"
                  @change="(c) => cambiarColor(asignacionesPorDanza.get(danza.id)!, String(c))">
                  <template #option="{ value }"><span class="inline-block h-4 w-4 rounded-full align-middle" :style="{ background: value }"></span> {{ value }}</template>
                </Select></td>
                <td><Tag :color="estado(asignacionesPorDanza.get(danza.id)!) === 'En vivo' ? 'green' : 'default'">{{ estado(asignacionesPorDanza.get(danza.id)!) }}</Tag></td>
                <td class="whitespace-nowrap">
                  <template v-if="editandoResponsable === asignacionesPorDanza.get(danza.id)?.id">
                    <Button size="small" class="semfa-btn semfa-btn--primario" :loading="guardandoResponsable"
                      :disabled="!usuarioEdicion || usuarioEdicion === asignacionesPorDanza.get(danza.id)?.usuarioId"
                      @click="guardarCambio(asignacionesPorDanza.get(danza.id)!)">Guardar</Button>
                    <Button size="small" class="ml-2" :disabled="guardandoResponsable" @click="cancelarCambio">Cancelar</Button>
                  </template>
                  <template v-else>
                    <Button size="small" @click="verEnMapa(asignacionesPorDanza.get(danza.id)!)">Ver GPS</Button>
                    <Button size="small" class="ml-2" @click="comenzarCambio(asignacionesPorDanza.get(danza.id)!)">Cambiar</Button>
                    <Button size="small" class="ml-2" @click="quitar(asignacionesPorDanza.get(danza.id)!.id)">Retirar</Button>
                  </template>
                </td>
              </template>
              <template v-else>
                <td><Select v-model:value="usuariosElegidos[danza.id]" class="min-w-56" placeholder="Elegir acompañante" :options="usuarioLibre.map(o => ({ value: o.id, label: o.nombre }))" /></td>
                <td>—</td>
                <td><Tag>Sin asignar</Tag></td>
                <td><Button size="small" class="semfa-btn semfa-btn--primario" :disabled="!usuariosElegidos[danza.id]" @click="asignar(danza.id)">Asignar</Button></td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <Card class="mb-3 rounded-xl" title="Permisos de comunicación">
      <p class="mb-3 text-gray-600">Todas las cuentas acompañantes pueden ver el mapa. El audio individual está permitido por defecto; aquí puede quitarlo. «Avisar» y «Audio global» se habilitan solo a las cuentas que usted elija. El audio global llega a todas las otras danzas y al enlace.</p>
      <div class="overflow-x-auto">
        <table class="semfa-tabla w-full text-left">
          <thead><tr><th>Cuenta</th><th>Audio individual</th><th>Avisar</th><th>Audio global</th></tr></thead>
          <tbody>
            <tr v-if="enlace">
              <td>Enlace · {{ enlace.responsable }}</td>
              <td><Switch :checked="enlace.puedeEnviarVoz" :disabled="guardandoPermiso" @change="cambiarPermiso('enlace', enlace.actividadId, 'puedeEnviarVoz', !enlace.puedeEnviarVoz)" /></td>
              <td><Switch :checked="enlace.puedeAvisar" :disabled="guardandoPermiso" @change="cambiarPermiso('enlace', enlace.actividadId, 'puedeAvisar', !enlace.puedeAvisar)" /></td>
              <td><Switch :checked="enlace.puedeVozGlobal" :disabled="guardandoPermiso || !enlace.puedeEnviarVoz" @change="cambiarPermiso('enlace', enlace.actividadId, 'puedeVozGlobal', !enlace.puedeVozGlobal)" /></td>
            </tr>
            <tr v-for="p in posiciones" :key="p.id">
              <td>{{ p.orden }}. {{ p.danza }} · {{ p.responsable }}</td>
              <td><Switch :checked="p.puedeEnviarVoz" :disabled="guardandoPermiso" @change="cambiarPermiso('danza', p.id, 'puedeEnviarVoz', !p.puedeEnviarVoz)" /></td>
              <td><Switch :checked="p.puedeAvisar" :disabled="guardandoPermiso" @change="cambiarPermiso('danza', p.id, 'puedeAvisar', !p.puedeAvisar)" /></td>
              <td><Switch :checked="p.puedeVozGlobal" :disabled="guardandoPermiso || !p.puedeEnviarVoz" @change="cambiarPermiso('danza', p.id, 'puedeVozGlobal', !p.puedeVozGlobal)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <Card class="rounded-xl" title="Mapa GPS y recorrido">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span>Tamaño de los números en los mapas (14–32 px):</span>
        <InputNumber v-model:value="tamanoMarcador" :min="14" :max="32" />
        <Button :loading="guardandoEstilo" @click="guardarTamano">Guardar tamaño</Button>
        <small>El icono se reduce al alejar el mapa. Toque un lugar o una danza para ver detalles.</small>
      </div>
      <p class="mb-2 text-gray-600">Los marcadores indican la última posición GPS recibida. Una danza sin coordenadas aparece en la tabla, pero no sobre el mapa.</p>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span>Zoom inicial de la vista pública:</span>
        <Select v-model:value="zoomPublico" class="w-24" :options="[13, 14, 15, 16, 17].map(n => ({ value: n, label: String(n) }))" />
        <a v-if="enlacePublico" :href="enlacePublico" target="_blank" rel="noopener noreferrer" class="inline-flex items-center rounded bg-blue-700 px-3 py-2 font-semibold text-white hover:bg-blue-800 hover:text-white">Abrir vista pública</a>
        <small class="text-gray-500">El enlace conserva el zoom elegido; en la vista pública también puede acercar y alejar.</small>
      </div>
      <div class="semfa-controles-mapa mb-3 flex flex-wrap gap-2">
        <Button @click="actualizar">Actualizar</Button>
        <Button @click="encuadrarRecorrido">Ver todo el recorrido</Button>
        <Tag :color="mapaConError ? 'red' : mapaCargado ? 'green' : 'default'">
          {{ mapaConError ? 'Error de cartografía' : mapaCargado ? 'Cartografía cargada' : 'Cargando cartografía' }}
        </Tag>
        <Button v-if="!editando" :disabled="marcandoReferencia" @click="comenzarRecorrido">Redibujar recorrido</Button>
        <template v-else>
          <Button :disabled="borrador.length <= 1" @click="borrador.pop()">Deshacer punto</Button>
          <Button class="semfa-btn semfa-btn--primario" @click="terminarRecorrido">Guardar recorrido</Button>
          <Button @click="editando = false">Cancelar</Button>
        </template>
        <Button v-if="!marcandoReferencia" :disabled="editando || idActividad === undefined" @click="nuevaReferencia">Añadir lugar</Button>
      </div>
      <p v-if="editando" class="mb-2 text-blue-700">Toque las curvas del recorrido en orden desde Inicio hasta Meta. El trazo azul es el recorrido guardado; el naranja muestra el nuevo.</p>
      <div v-if="marcandoReferencia" class="mb-3 rounded-lg border border-violet-300 bg-violet-50 p-3">
        <b>{{ referenciaEditando === null ? 'Nuevo lugar' : 'Editar lugar' }}</b>
        <p class="mb-3 text-sm">Toque el mapa para marcar el centro. Los tamaños se miden en metros sobre el terreno.</p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1">Nombre
            <Input v-model:value="referenciaNombre" :maxlength="80" placeholder="Ej. Puesto de control" class="w-56" />
          </label>
          <label class="flex flex-col gap-1">Figura
            <Select v-model:value="referenciaFigura" class="w-40" :options="[
              { value: 'CIRCULO', label: 'Círculo' }, { value: 'RECTANGULO', label: 'Rectángulo' },
              { value: 'TRIANGULO', label: 'Triángulo' },
            ]" />
          </label>
          <label class="flex flex-col gap-1">{{ referenciaFigura === 'CIRCULO' ? 'Diámetro (m)' : referenciaFigura === 'RECTANGULO' ? 'Ancho (m)' : 'Lado (m)' }}
            <InputNumber v-model:value="referenciaTamano" :min="2" :max="500" class="w-32" />
          </label>
          <label v-if="referenciaFigura === 'RECTANGULO'" class="flex flex-col gap-1">Alto (m)
            <InputNumber v-model:value="referenciaAlto" :min="2" :max="500" class="w-32" />
          </label>
          <span>{{ referenciaUbicacion ? `${referenciaUbicacion.latitud.toFixed(6)}, ${referenciaUbicacion.longitud.toFixed(6)}` : 'Falta marcar el centro' }}</span>
          <Button class="semfa-btn semfa-btn--primario" :loading="guardandoReferencia"
            :disabled="!referenciaNombre.trim() || !referenciaUbicacion || !referenciaTamano || referenciaTamano < 2 || referenciaTamano > 500 || (referenciaFigura === 'RECTANGULO' && (!referenciaAlto || referenciaAlto < 2 || referenciaAlto > 500))"
            @click="guardarReferencia">Guardar lugar</Button>
          <Button :disabled="guardandoReferencia" @click="cancelarReferencia">Cancelar</Button>
        </div>
      </div>
      <p v-if="mapaConError" class="mb-2 text-amber-700">No se pudo cargar la cartografía. Compruebe la conexión a Internet y vuelva a abrir esta vista; la línea dibujada permanece guardada.</p>
      <div ref="mapaElemento" class="semfa-mapa-gps h-[65vh] min-h-[460px] w-full rounded-lg border" :class="editando || marcandoReferencia ? 'cursor-crosshair' : ''" aria-label="Mapa GPS del recorrido de danzas"></div>
      <p class="mt-2 text-xs text-gray-500">Mapa © OpenStreetMap. La banda azul es el recorrido marcado por el administrador; la ubicación y precisión dependen del GPS del teléfono.</p>
      <div v-if="referencias.length" class="mt-3 flex flex-wrap items-center gap-2">
        <b class="mr-2">Lugares del mapa:</b>
        <div v-for="r in referencias" :key="r.id" class="flex items-center gap-1 rounded border px-2 py-1">
          <span>{{ r.nombre }} · {{ r.figura === 'CIRCULO' ? 'Círculo' : r.figura === 'RECTANGULO' ? 'Rectángulo' : 'Triángulo' }} · {{ r.tamanoMetros }}{{ r.figura === 'RECTANGULO' ? ` × ${r.altoMetros}` : '' }} m</span>
          <Button size="small" :disabled="editando || guardandoReferencia" @click="editarReferencia(r)">Editar</Button>
          <Button size="small" :disabled="guardandoReferencia" @click="borrarReferencia(r)">Eliminar</Button>
        </div>
      </div>
      <div v-if="seleccionada" class="mt-3 rounded-lg border bg-white p-4">
        <b>{{ seleccionada.danza }}</b> · {{ seleccionada.responsable }}
        <div>{{ estado(seleccionada) }} · precisión {{ seleccionada.precisionMetros === null ? '—' : Math.round(seleccionada.precisionMetros) + ' m' }}</div>
        <div v-if="seleccionada.latitud !== null && seleccionada.longitud !== null">
          GPS: {{ seleccionada.latitud.toFixed(6) }}, {{ seleccionada.longitud.toFixed(6) }}
        </div>
        <div v-else>Sin posición recibida. El acompañante debe iniciar la ubicación en el APK y comprobar que el servidor confirmó el envío.</div>
        <div v-if="avanceSeleccionado">Avance aproximado: {{ avanceSeleccionado.porcentaje }} % · faltan {{ Math.round(avanceSeleccionado.faltan) }} m</div>
        <div>Última señal: {{ seleccionada.ultimaUbicacion ? new Date(seleccionada.ultimaUbicacion).toLocaleString() : 'ninguna' }}</div>
        <div v-if="separaciones.length" class="mt-2 border-t pt-2">
          <b>Distancia a otras danzas</b>
          <div v-for="s in separaciones" :key="s.id" class="text-sm">{{ s.danza }}: {{ Math.round(s.directa) }} m directos<span v-if="s.ruta !== null"> · {{ Math.round(s.ruta) }} m por el recorrido</span><span v-if="!s.reciente"> · señal antigua</span></div>
        </div>
      </div>
    </Card>
  </SemfaPagina>
</template>

<style scoped>
:deep(.semfa-gps-pin) {
  display: grid;
  place-items: center;
  border: 3px solid white;
  border-radius: 50%;
  background: #d97706;
  box-shadow: 0 2px 10px #0005;
  color: white;
  font-weight: 800;
}
:deep(.semfa-gps-pin--antiguo) { opacity: 0.65; }
:deep(.semfa-gps-pin--enlace) { background: #2563eb; }
.semfa-controles-mapa { position: relative; z-index: 1; }
.semfa-mapa-gps {
  position: relative;
  z-index: 0;
  isolation: isolate;
  overflow: hidden;
  contain: paint;
  background: #e5e7eb;
}
.semfa-mapa-gps.cursor-crosshair { cursor: crosshair; }
</style>
