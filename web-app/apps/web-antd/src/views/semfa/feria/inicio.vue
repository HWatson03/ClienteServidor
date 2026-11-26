<script setup lang="ts">
/**
 * Portada pública de la feria `/fexcoin-vivo` (Vista 1): el portal que «antoja» al visitante.
 * Secciones en orden, cada una configurable y ocultable desde el editor (pestaña «Portada»,
 * JSON en `mapa.portada`, ver `portada.ts`): hero con galería de fotos y videos y cuenta
 * regresiva, botones de acción, agenda, proyectos (o «se están preparando») y pie.
 * «Ver ubicación» lleva al mapa (`/fexcoin-vivo/mapa?stand=ID`, Vista 2) con el stand elegido.
 *
 * Red saturada: no carga Leaflet (el chunk del mapa se pide solo al ir al mapa o al apuntar su
 * botón), pinta al instante la última foto guardada en el teléfono (la misma que usa el mapa),
 * consulta con ETag cada 2 min solo con la pestaña visible, y la galería baja una sola imagen al
 * inicio. Sin SSE: lo que cambia minuto a minuto vive en el mapa.
 *
 * Idiomas (español, inglés, portugués): `i18n.ts`; los textos del editor pasan por `traducirPortada`.
 */
import type { FeriaPublica } from '#/api/feria-publico';

import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { obtenerFeriaPublica, registrarServiceWorkerFeria, registrarVisitaFeria } from '#/api/feria-publico';
import { idVisitante } from '#/components/semfa/visitante';

import { idioma, numero, sincronizarIdioma, t } from './i18n';
import AgendaFeria from './partes/agenda-feria.vue';
import ContadorFeria from './partes/contador-feria.vue';
import GaleriaMedios from './partes/galeria-medios.vue';
import MarcaFeria from './partes/marca-feria.vue';
import ProyectosFeria from './partes/proyectos-feria.vue';
import ProyectosPreparando from './partes/proyectos-preparando.vue';
import SelectorIdioma from './partes/selector-idioma.vue';
import VisorVideo from './partes/visor-video.vue';
import { faseFeria, horaCorta, horaInicio, mediosListos, normalizarPortada, pastillaFeria, rangoDias, traducirPortada } from './portada';
import { vRevelar } from './revelar';
import { actividadPedida, CLAVE_VISITANTE, claveFoto, guardarFoto, leerFotoGuardada, rutaMapa, textoJornada } from './publico-comun';

defineOptions({ name: 'SemfaFeriaPortada' });

const REFRESCO_MS = 120_000;
const CLAVE_SCROLL = 'semfa-feria-scroll';

const route = useRoute();
const router = useRouter();
const idPedido = actividadPedida(route.query);
const CLAVE_FOTO = claveFoto(idPedido);
const guardada = leerFotoGuardada(CLAVE_FOTO);

const foto = shallowRef<FeriaPublica | null>(guardada?.foto ?? null);
const cargando = ref(!guardada);
const sinConexion = ref(false);
const visitas = ref<null | number>(null);
const reloj = ref(Date.now());
const tvuAbierta = ref(false);
const raiz = ref<HTMLElement>();
let etag = guardada?.etag ?? null;
let cargandoFoto = false;
let fallos = 0;
let tFoto: ReturnType<typeof setTimeout> | undefined;
let tReloj: ReturnType<typeof setInterval> | undefined;

/** Portada en español (fechas, horario y fases se calculan con ella) y la que se muestra en el idioma elegido. */
const portadaEs = computed(() => normalizarPortada(foto.value?.mapa.portada));
const portada = computed(() => traducirPortada(portadaEs.value, idioma.value));
const medios = computed(() => mediosListos(portada.value));
const fase = computed(() => faseFeria(portadaEs.value, reloj.value));
const inicioMs = computed(() => new Date(portadaEs.value.inicio).getTime());
const pastilla = computed(() => pastillaFeria(portadaEs.value, reloj.value));
const fechaCorta = computed(() => `${rangoDias(portada.value)} · ${horaInicio(portada.value)}`);
const fechaGrande = computed(() => `${rangoDias(portada.value)} · ${horaCorta(portada.value)}`);
const nombre = computed(() => foto.value?.actividad.nombre || 'FEXCOIN ECUANA V5');
const urlFacebook = computed(() => foto.value?.mapa.urlFacebook || null);
const urlTvu = computed(() => foto.value?.mapa.urlTransmision || null);
/** El administrador habilita el mapa cuando los stands están ubicados («Portada» → Botones y mapa). */
const mapaListo = computed(() => portada.value.mapa.publicar);
const avisoMapa = ref(false);
let tAvisoMapa: ReturnType<typeof setTimeout> | undefined;
const categorias = computed(() => foto.value?.categorias ?? []);
const jornadas = computed(() => {
  const f = foto.value;
  if (!f) return [];
  const max = Math.max(f.actividad.jornadas || 1, ...f.stands.map((s) => s.jornada ?? 1));
  return max > 1 ? Array.from({ length: max }, (_, i) => i + 1) : [];
});
const jornada = (j: null | number | undefined) => textoJornada(foto.value?.actividad.fecha, j);
const visitasTexto = computed(() => (visitas.value === null ? '' : t('{n} visitante|{n} visitantes', { n: visitas.value }).replace(String(visitas.value), numero(visitas.value))));

async function cargarFoto() {
  if (cargandoFoto) return;
  cargandoFoto = true;
  clearTimeout(tFoto);
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 12_000);
  let siguiente = REFRESCO_MS;
  try {
    const r = await obtenerFeriaPublica(idPedido, foto.value ? etag : null, control.signal);
    sinConexion.value = false;
    fallos = 0;
    if (!r.sinCambios) {
      etag = r.etag;
      foto.value = r.datos;
      guardarFoto(CLAVE_FOTO, r.datos, etag, Date.now());
    }
  } catch {
    sinConexion.value = true;
    fallos++;
    siguiente = Math.min(5_000 * 2 ** (fallos - 1), REFRESCO_MS) * (0.75 + Math.random() * 0.5);
  } finally {
    clearTimeout(limite);
    cargandoFoto = false;
    cargando.value = false;
    if (document.visibilityState === 'visible') tFoto = setTimeout(() => void cargarFoto(), siguiente);
  }
}

function registrarVisita() {
  registrarVisitaFeria(idVisitante(CLAVE_VISITANTE), idPedido)
    .then((total) => { visitas.value = total; })
    .catch(() => { /* el contador no debe molestar */ });
}

function verMapa(stand?: number) {
  if (!mapaListo.value) {
    avisoMapa.value = true;
    clearTimeout(tAvisoMapa);
    tAvisoMapa = setTimeout(() => { avisoMapa.value = false; }, 5000);
    return;
  }
  void router.push(rutaMapa(route.query, stand));
}
/** Al apuntar o tocar el botón del mapa se adelanta la descarga de su código (Leaflet incluido). */
let mapaPedido = false;
function adelantarMapa() {
  if (mapaPedido) return;
  mapaPedido = true;
  void import('./mapa.vue').catch(() => { mapaPedido = false; });
}

function alCambiarVisibilidad() {
  if (document.visibilityState !== 'visible') { clearTimeout(tFoto); return; }
  reloj.value = Date.now();
  void cargarFoto();
}
function alVolverRed() {
  fallos = 0;
  void cargarFoto();
  if (visitas.value === null) registrarVisita();
}

/**
 * Scroll: barra de avance, cabecera compacta y «volver arriba». Un solo listener pasivo que lee
 * `scrollTop` una vez por cuadro (rAF) y escribe solo transform/clases: no traba el scroll.
 */
const compacta = ref(false);
const arriba = ref(false);
const avance = ref<HTMLElement>();
let cuadroScroll = 0;
function alHacerScroll() {
  if (cuadroScroll) return;
  cuadroScroll = requestAnimationFrame(() => {
    cuadroScroll = 0;
    const el = raiz.value;
    if (!el) return;
    const y = el.scrollTop;
    const max = el.scrollHeight - el.clientHeight;
    compacta.value = y > 40;
    arriba.value = y > el.clientHeight * 0.9;
    if (avance.value) avance.value.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
  });
}
function irArriba() {
  const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  raiz.value?.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
}

sincronizarIdioma(route, (query) => router.replace({ query }));

onMounted(() => {
  raiz.value?.addEventListener('scroll', alHacerScroll, { passive: true });
  registrarServiceWorkerFeria();
  void cargarFoto();
  registrarVisita();
  tReloj = setInterval(() => { reloj.value = Date.now(); }, 30_000);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('online', alVolverRed);
  // Al volver del mapa con «atrás», la portada queda donde estaba.
  const estado = window.history.state as null | { forward?: null | string };
  try {
    const y = Number(sessionStorage.getItem(CLAVE_SCROLL));
    if (estado?.forward && y > 0 && raiz.value) requestAnimationFrame(() => raiz.value?.scrollTo({ top: y }));
  } catch { /* almacenamiento bloqueado */ }
});
onBeforeUnmount(() => {
  try { sessionStorage.setItem(CLAVE_SCROLL, String(raiz.value?.scrollTop ?? 0)); } catch { /* bloqueado */ }
});
onUnmounted(() => {
  raiz.value?.removeEventListener('scroll', alHacerScroll);
  cancelAnimationFrame(cuadroScroll);
  clearTimeout(tFoto);
  clearInterval(tReloj);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  window.removeEventListener('online', alVolverRed);
});
</script>

<template>
  <main ref="raiz" class="fi">
    <div class="fi__franja" aria-hidden="true"></div>
    <div ref="avance" class="fi-avance" aria-hidden="true"></div>
    <header class="fi-cab" :class="{ 'is-compacta': compacta }">
      <div class="fi-cab__in">
        <MarcaFeria :nombre="nombre" class="fi-cab__marca" />
        <div class="fi-cab__der">
          <div class="fi-cab__fila">
            <SelectorIdioma />
            <span v-if="sinConexion && !foto" class="fi-pastilla fi-pastilla--off" role="status">{{ t('Sin conexión') }}</span>
            <span v-else class="fi-pastilla" role="status" :class="`fi-pastilla--${pastilla.clase}`"><i v-if="pastilla.clase === 'vivo'" aria-hidden="true"></i>{{ pastilla.texto }}</span>
            <span class="fi-cab__fecha">{{ fechaCorta }}</span>
          </div>
          <span class="fi-cab__lugar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></svg>
            {{ portada.lugar }}
          </span>
        </div>
      </div>
    </header>

    <div class="fi__contenido">
      <section v-if="portada.hero.mostrar" v-revelar.grupo class="fi-hero" aria-labelledby="fi-titulo">
        <h1 id="fi-titulo"><span>{{ portada.hero.titulo }}</span><span v-if="portada.hero.tituloRojo" class="fi-hero__rojo">{{ portada.hero.tituloRojo }}</span></h1>
        <p v-if="portada.hero.lema" class="fi-hero__lema">«{{ portada.hero.lema }}»</p>
        <p v-if="portada.hero.frase" class="fi-hero__frase">{{ portada.hero.frase }}</p>
        <p class="fi-hero__fecha">{{ fechaGrande }}</p>
        <p class="fi-hero__lugar-movil">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></svg>{{ portada.lugar }}
        </p>
      </section>

      <GaleriaMedios v-if="portada.galeria.mostrar && medios.length" v-revelar="250" class="fi-galeria" :medios="medios" :titulo="portada.galeria.titulo">
        <ContadorFeria v-if="portada.hero.contador" :fase="fase" :inicio="inicioMs" :resumen="foto?.resumen ?? null" :visitas="visitas" />
      </GaleriaMedios>
      <ContadorFeria v-else-if="portada.hero.contador" class="fi-contador-solo" :fase="fase" :inicio="inicioMs" :resumen="foto?.resumen ?? null" :visitas="visitas" />

      <p v-if="portada.hero.mostrar && portada.hero.descripcion" v-revelar class="fi-hero__desc">{{ portada.hero.descripcion }}</p>

      <section v-if="portada.acciones.mostrar" class="fi-sec fi-acciones" :aria-label="portada.acciones.titulo || t('Enlaces de la feria')">
        <h2 v-if="portada.acciones.titulo">{{ portada.acciones.titulo }}</h2>
        <p v-if="portada.acciones.descripcion" class="fi-sec__desc">{{ portada.acciones.descripcion }}</p>
        <div v-revelar.grupo class="fi-acciones__botones">
          <button v-if="mapaListo" type="button" class="fi-boton fi-boton--rojo" @pointerenter="adelantarMapa" @touchstart.passive="adelantarMapa" @focus="adelantarMapa" @click="verMapa()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>{{ t('Ver el mapa de la feria') }}
          </button>
          <button v-else type="button" class="fi-boton fi-boton--pronto" aria-describedby="fi-aviso-mapa" @click="verMapa()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>{{ t('Mapa de la feria') }} <small>{{ t('muy pronto') }}</small>
          </button>
          <button v-if="urlTvu" type="button" class="fi-boton" aria-haspopup="dialog" @click="tvuAbierta = true">
            <i class="fi-boton__vivo" aria-hidden="true"></i>{{ t('Transmisión TVU') }}
          </button>
          <a v-if="urlFacebook" class="fi-boton fi-boton--fb" :href="urlFacebook" target="_blank" rel="noopener noreferrer" :aria-label="t('UAP en Facebook (se abre aparte)')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21z" /></svg>{{ t('UAP en Facebook') }}
          </a>
        </div>
      </section>

      <section v-if="portada.agenda.mostrar" id="fi-agenda" class="fi-sec" aria-labelledby="fi-agenda-titulo">
        <h2 id="fi-agenda-titulo" v-revelar>{{ portada.agenda.titulo }}</h2>
        <p v-if="portada.agenda.descripcion" class="fi-sec__desc">{{ portada.agenda.descripcion }}</p>
        <AgendaFeria :portada="portada" :ahora="reloj" />
      </section>

      <section v-if="portada.proyectos.mostrar" id="fi-proyectos" class="fi-sec" aria-labelledby="fi-proyectos-titulo">
        <h2 id="fi-proyectos-titulo" v-revelar>{{ portada.proyectos.titulo }}</h2>
        <p v-if="portada.proyectos.descripcion" class="fi-sec__desc">{{ portada.proyectos.descripcion }}</p>
        <ProyectosFeria v-if="portada.proyectos.publicar" :stands="foto?.stands ?? []" :categorias="categorias" :destacados="portada.destacados"
          :jornadas="jornadas" :texto-jornada="jornada" :titulo-destacados="portada.proyectos.destacadosTitulo" :titulo-todos="portada.proyectos.todosTitulo"
          :version="0" @ubicar="(id) => verMapa(id)" />
        <ProyectosPreparando v-else :titulo="portada.proyectos.preparandoTitulo" :texto="portada.proyectos.preparandoTexto"
          :cifra="portada.proyectos.cifra" :categorias="portada.proyectos.categorias" :dias="portada.dias.length" />
      </section>

      <footer v-if="portada.pie.mostrar" v-revelar.grupo class="fi-pie">
        <MarcaFeria :nombre="nombre" class="fi-pie__marca" />
        <strong v-if="portada.pie.titulo">{{ portada.pie.titulo }}</strong>
        <p v-if="portada.pie.descripcion">{{ portada.pie.descripcion }}</p>
        <p>{{ t('Organiza: {x}', { x: portada.organiza }) }}</p>
        <p>{{ portada.lugar }} · {{ fechaGrande }}</p>
        <nav class="fi-pie__enlaces" :aria-label="t('Enlaces')">
          <button type="button" @pointerenter="adelantarMapa" @click="verMapa()">{{ t('Mapa de la feria') }}{{ mapaListo ? '' : ` (${t('muy pronto')})` }}</button>
          <button v-if="urlTvu" type="button" @click="tvuAbierta = true">{{ t('Transmisión TVU') }}</button>
          <a v-if="urlFacebook" :href="urlFacebook" target="_blank" rel="noopener noreferrer">Facebook</a>
        </nav>
        <p v-if="visitasTexto" class="fi-pie__visitas">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          {{ visitasTexto }}
        </p>
      </footer>
    </div>
    <div class="fi__franja" aria-hidden="true"></div>
    <Transition name="fi-arriba">
      <button v-if="arriba" type="button" class="fi-arriba" :aria-label="t('Volver arriba')" @click="irArriba">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg>
      </button>
    </Transition>

    <VisorVideo v-if="tvuAbierta && urlTvu" :titulo="t('TVU · Transmisión en vivo')" :url="urlTvu" :enlace="urlTvu" iframe vivo
      sandbox="allow-scripts allow-same-origin allow-presentation" @cerrar="tvuAbierta = false" />
    <Transition name="fi-aviso">
      <div v-if="avisoMapa" id="fi-aviso-mapa" class="fi-aviso-mapa" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
        <div><strong>{{ portada.mapa.titulo }}</strong><p>{{ portada.mapa.texto }}</p></div>
        <button type="button" :aria-label="t('Cerrar aviso')" @click="avisoMapa = false">✕</button>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.fi {
  --azul-0: #08122b; --azul-1: #0b1736; --azul-2: #0f1f45; --azul-3: #13244f; --rojo: #c8102e; --rojo-2: #e11d2a;
  --suave: #b9c6e4; --tenue: #8fa3cf; --borde: rgb(255 255 255 / 10%);
  height: 100dvh; overflow-x: hidden; overflow-y: auto; overscroll-behavior-y: contain;
  background: radial-gradient(ellipse 90% 40% at 50% 0%, #15296099 0%, transparent 70%), var(--azul-1);
  color: #fff; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color-scheme: dark;
}
.fi__franja { height: 3px; background: linear-gradient(90deg, var(--rojo) 0 50%, #1d4ed8 50%); }
.fi button:focus-visible, .fi a:focus-visible { outline: 3px solid #f5c518; outline-offset: 2px; }

/* Barra superior */
.fi-cab { position: sticky; z-index: 50; top: 0; border-bottom: 1px solid var(--borde); background: var(--azul-0); transition: box-shadow .3s; }
.fi-cab.is-compacta { box-shadow: 0 8px 24px rgb(0 0 0 / 35%); }
.fi-cab__marca { transition: transform .3s; transform-origin: left center; }
.fi-cab.is-compacta .fi-cab__marca { transform: scale(.88); }
/* Avance de lectura: una línea roja-azul arriba (solo transform: la GPU la mueve sin costo). */
.fi-avance { position: fixed; z-index: 60; top: 0; left: 0; width: 100%; height: 3px; background: linear-gradient(90deg, var(--rojo), #2563eb); transform: scaleX(0); transform-origin: left; pointer-events: none; }
.fi-arriba { position: fixed; z-index: 40; right: max(16px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); display: grid; width: 46px; height: 46px; place-items: center; border: 1px solid rgb(255 255 255 / 16%); border-radius: 50%; background: var(--azul-3); color: #fff; box-shadow: 0 8px 22px rgb(0 0 0 / 40%); cursor: pointer; }
.fi-arriba svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.fi-arriba-enter-active, .fi-arriba-leave-active { transition: opacity .25s, transform .25s; }
.fi-arriba-enter-from, .fi-arriba-leave-to { opacity: 0; transform: translateY(10px) scale(.9); }
.fi-cab__in { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1240px; margin: 0 auto; padding: 10px 20px; }
.fi-cab__marca { font-size: 30px; }
.fi-cab__der { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.fi-cab__fila { display: flex; align-items: center; gap: 8px; }
.fi-cab__fecha { border: 1px solid rgb(255 255 255 / 18%); border-radius: 8px; background: var(--azul-2); padding: 4px 11px; font-size: 14px; font-weight: 800; white-space: nowrap; }
.fi-cab__lugar { display: inline-flex; align-items: center; gap: 5px; color: var(--suave); font-size: 13px; }
.fi-cab__lugar svg, .fi-hero__lugar-movil svg { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; }
.fi-pastilla { display: inline-flex; align-items: center; gap: 7px; border-radius: 8px; background: var(--rojo); padding: 5px 11px; font-size: 13px; font-weight: 800; letter-spacing: .03em; white-space: nowrap; }
.fi-pastilla i { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: fi-latir 1.6s ease-in-out infinite; }
.fi-pastilla--pronto { border: 1px solid rgb(200 16 46 / 60%); background: rgb(200 16 46 / 18%); color: #ffd0d5; }
.fi-pastilla--fin, .fi-pastilla--off { background: #334155; }

.fi__contenido { max-width: 1240px; margin: 0 auto; padding: 0 20px 24px; }

/* Hero */
.fi-hero { padding: 34px 0 20px; text-align: center; }
.fi-hero h1 { display: flex; flex-direction: column; margin: 0; font-size: clamp(30px, 5vw, 62px); font-weight: 900; letter-spacing: -.01em; line-height: 1.02; text-transform: uppercase; }
.fi-hero__rojo { color: var(--rojo-2); }
.fi-hero__lema { margin: 14px 0 0; color: #e8edf8; font-size: clamp(13px, 1.3vw, 16px); font-weight: 800; letter-spacing: .02em; text-transform: uppercase; }
.fi-hero__frase { margin: 2px 0 0; color: var(--suave); font-size: clamp(13px, 1.2vw, 15px); }
.fi-hero__fecha { margin: 14px 0 0; font-size: clamp(22px, 2.6vw, 32px); font-weight: 800; }
.fi-hero__lugar-movil { display: none; align-items: center; justify-content: center; gap: 5px; margin: 4px 0 0; color: var(--suave); font-size: 13px; }
.fi-hero__desc { max-width: 820px; margin: 14px auto 0; color: var(--tenue); font-size: 13.5px; line-height: 1.5; text-align: center; }
.fi-galeria { margin: 4px -20px 0; }
.fi-contador-solo { width: fit-content; margin: 0 auto; }

/* Secciones */
.fi-sec { margin-top: 44px; scroll-margin-top: 80px; }
/* Secciones bajo el pliegue: el navegador no las dibuja hasta acercarse (menos trabajo al abrir en celular). */
.fi-sec { content-visibility: auto; contain-intrinsic-size: auto 600px; }
.fi-sec > h2 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: clamp(20px, 2vw, 24px); font-weight: 900; letter-spacing: .03em; text-transform: uppercase; }
.fi-sec > h2::before { width: 4px; height: 1.05em; border-radius: 2px; background: var(--rojo); content: ''; }
.fi-sec__desc { margin: 0 0 16px; color: var(--suave); font-size: 15px; line-height: 1.5; }
.fi-acciones { margin-top: 30px; text-align: center; }
.fi-acciones > h2 { justify-content: center; }
.fi-acciones__botones { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.fi-boton { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 48px; border: 1px solid rgb(255 255 255 / 18%); border-radius: 12px; background: var(--azul-2); padding: 0 20px; color: #fff; font-size: 15px; font-weight: 800; text-decoration: none; cursor: pointer; transition: background .2s; }
.fi-boton:hover { background: #1b3168; color: #fff; }
.fi-boton svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; }
.fi-boton--rojo { border-color: transparent; background: var(--rojo); box-shadow: 0 6px 16px rgb(200 16 46 / 25%); }
.fi-boton--rojo:hover { background: var(--rojo-2); }
.fi-boton--fb { border-color: transparent; background: #1f4fa8; }
.fi-boton--pronto { border-style: dashed; border-color: rgb(255 255 255 / 28%); background: transparent; color: #c9d3ea; }
.fi-boton--pronto small { border-radius: 999px; background: rgb(200 16 46 / 22%); padding: 2px 8px; color: #ffb3bd; font-size: 11.5px; font-weight: 800; letter-spacing: .02em; }
.fi-aviso-mapa { position: fixed; z-index: 50; bottom: max(16px, env(safe-area-inset-bottom)); left: 50%; display: flex; align-items: flex-start; gap: 12px; width: min(520px, calc(100% - 24px)); border: 1px solid rgb(255 255 255 / 14%); border-radius: 14px; background: #13244f; padding: 14px 14px 14px 16px; color: #e8edf8; box-shadow: 0 14px 34px rgb(0 0 0 / 45%); transform: translateX(-50%); }
.fi-aviso-mapa > svg { width: 26px; height: 26px; flex: none; margin-top: 2px; fill: none; stroke: #ff8a96; stroke-width: 1.8; stroke-linejoin: round; }
.fi-aviso-mapa strong { display: block; color: #fff; font-size: 15px; }
.fi-aviso-mapa p { margin: 3px 0 0; color: #c9d3ea; font-size: 13.5px; line-height: 1.4; }
.fi-aviso-mapa button { flex: none; border: 0; background: none; color: #c9d3ea; font-size: 16px; cursor: pointer; }
.fi-aviso-enter-active, .fi-aviso-leave-active { transition: opacity .25s, transform .25s; }
.fi-aviso-enter-from, .fi-aviso-leave-to { opacity: 0; transform: translate(-50%, 12px); }
.fi-boton--fb:hover { background: #2a5fc2; }
.fi-boton--fb svg { fill: currentColor; stroke: none; }
.fi-boton__vivo { width: 9px; height: 9px; border-radius: 50%; background: var(--rojo-2); box-shadow: 0 0 0 3px rgb(225 29 42 / 25%); }

/* Pie */
.fi-pie { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 54px; border-top: 1px solid var(--borde); padding-top: 26px; color: var(--tenue); font-size: 13.5px; text-align: center; }
.fi-pie__marca { margin-bottom: 8px; font-size: 24px; }
.fi-pie strong { color: #fff; font-size: 15px; }
.fi-pie p { margin: 0; }
.fi-pie__enlaces { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; margin: 10px 0 6px; }
.fi-pie__enlaces button, .fi-pie__enlaces a { border: 0; background: none; padding: 4px 0; color: var(--suave); font-size: 14px; font-weight: 700; text-decoration: underline; text-decoration-color: rgb(185 198 228 / 35%); text-underline-offset: 4px; cursor: pointer; }
.fi-pie__visitas { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px !important; border: 1px solid var(--borde); border-radius: 999px; padding: 4px 12px; color: var(--suave); font-weight: 700; }
.fi-pie__visitas svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
@keyframes fi-latir { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

@media (max-width: 700px) {
  .fi-cab__in { padding: 8px 14px; }
  .fi-cab__marca { font-size: 24px; }
  .fi-cab__fecha, .fi-cab__lugar { display: none; }
  .fi__contenido { padding: 0 14px 20px; }
  .fi-galeria { margin: 0 -14px; }
  .fi-hero { padding: 24px 0 16px; }
  .fi-hero__lugar-movil { display: flex; }
  .fi-sec { margin-top: 36px; }
  .fi-acciones__botones { flex-direction: column; align-items: stretch; }
}
/* Celular: con el selector de idioma, la cabecera deja «ECUANA V5» para el pie y la pastilla se recorta si no cabe. */
@media (max-width: 480px) {
  .fi-cab__in { gap: 10px; }
  .fi-cab__der { min-width: 0; }
  .fi-cab__fila { min-width: 0; }
  .fi-cab__marca :deep(.mf__resto) { display: none; }
  .fi-pastilla { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
}
@media (max-width: 360px) {
  .fi-cab__marca { font-size: 20px; }
  .fi-pastilla { padding: 4px 8px; font-size: 12px; letter-spacing: 0; }
}
@media (prefers-reduced-motion: reduce) { .fi-pastilla i { animation: none; } .fi-boton { transition: none; } }
</style>
