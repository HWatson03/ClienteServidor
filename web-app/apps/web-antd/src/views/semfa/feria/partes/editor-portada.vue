<script setup lang="ts">
/**
 * Pestaña «Portada» del editor del mapa: todo lo que se ve en la página pública `/fexcoin-vivo`,
 * sección por sección y en el mismo orden que la página. Cada sección se puede ocultar, tiene sus
 * textos (con ayudas y ejemplos) y «Restablecer esta sección». Si la actividad aún no tiene
 * portada, arranca con los valores por defecto (los del afiche y la invitación oficial).
 *
 * Tiene su propio borrador y su propio «Guardar portada» (`PUT …/portada`), que no toca el mapa,
 * los stands ni la publicación. Se guarda en formato 2 (`portadaParaGuardar`); una portada guardada
 * con el formato anterior se lee bien (`normalizarPortada`).
 *
 * Fotos y videos se suben al elegirlos, pero los archivos que se QUITAN de la lista solo se borran
 * del servidor después de guardar; si se descarta, se borran los recién subidos.
 */
import type { FeriaAdmin, FotoPortada, MedioPortada } from '#/api/feria';
import type { TextosPortada } from '#/api/feria-publico';
import type { CampoTexto, ClaveSeccion, PortadaCompleta } from '../portada';

import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Checkbox, Input, RadioButton, RadioGroup, Select, Switch, Textarea } from 'ant-design-vue';

import { borrarFotoFeria, guardarPortadaFeria, resolverUrlApi, subirFotoFeria, subirVideoFeria } from '#/api/feria';
import { avisar, confirmar, sinAvisosDeError } from '#/composables/useAvisos';

import { cargarDiccionario, fraseTraducida, NOMBRE_IDIOMA } from '../i18n';
import { analizarEnlace, camposTexto, CATEGORIAS_AFICHE, leerRuta, normalizarPortada, PORTADA_DEFECTO, portadaParaGuardar, rangoDias, seccionDefecto } from '../portada';
import EditorSeccion from './editor-seccion.vue';
import EditorTraduccion from './editor-traduccion.vue';

const props = defineProps<{ datos: FeriaAdmin | null; idActividad: number | undefined }>();
const emit = defineEmits<{ guardado: [datos: FeriaAdmin]; sucio: [sucio: boolean] }>();

const MB = 1024 * 1024;
const MAX_FOTO = 15 * MB;
const MAX_VIDEO = 80 * MB;

const router = useRouter();
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const borrador = ref<PortadaCompleta>(copia(PORTADA_DEFECTO));
let original = '';
const guardando = ref(false);
/** Subida en curso: qué se sube y cuánto va. */
const subida = ref<null | { porcentaje: number; texto: string }>(null);
/** Archivos subidos en esta edición y aún no guardados (se borran si se descarta). */
const subidos = ref<string[]>([]);
const abiertas = ref(new Set<string>(['hero']));
const elegido = ref<number>();
const enlaceNuevo = ref('');
const entradaFotos = ref<HTMLInputElement>();
const entradaVideo = ref<HTMLInputElement>();
const entradaPortada = ref<HTMLInputElement>();
/** Medio al que se le está eligiendo portada. */
let portadaPara = -1;

const sinPortada = computed(() => !props.datos?.mapa.portada);
/** Cambios sin guardar (para el aviso al salir). */
const cambiado = computed(() => JSON.stringify(borrador.value) !== original);
/** «Guardar» también se habilita si aún no hay portada guardada (para guardar los valores por defecto). */
const sucio = computed(() => cambiado.value || sinPortada.value);
watch(cambiado, (v) => emit('sucio', v), { immediate: true });

// ------------------------------------------------------------------ idiomas

/**
 * Idioma que se edita: en Español, todo como siempre; en English/Português solo los textos de cada
 * sección (con el español de referencia), que se guardan en `traducciones.{en,pt}` del mismo JSON.
 */
const idiomaEdicion = ref<'en' | 'es' | 'pt'>('es');
const OPCIONES_IDIOMA = [{ label: 'Español (principal)', value: 'es' }, { label: NOMBRE_IDIOMA.en, value: 'en' }, { label: NOMBRE_IDIOMA.pt, value: 'pt' }] as const;
/** Diccionarios con las traducciones sugeridas (chunks de la página pública). */
const diccionariosListos = ref(false);
onMounted(() => {
  Promise.all([cargarDiccionario('en'), cargarDiccionario('pt')]).then(() => { diccionariosListos.value = true; }).catch(() => { /* sin sugerencias */ });
});
const campos = computed(() => camposTexto(borrador.value));
const camposDe = (clave: ClaveSeccion) => campos.value.filter((c) => c.seccion === clave);
const propio = (c: CampoTexto, i: 'en' | 'pt') => Boolean(leerRuta(borrador.value.traducciones[i], c.ruta)?.trim());
const sugerido = (c: CampoTexto, i: 'en' | 'pt') => !propio(c, i) && Boolean(diccionariosListos.value && fraseTraducida(c.es, i));
/** «English: 12 de 18 textos» (cuenta también los que usan la traducción sugerida, y dice cuántos son). */
const avance = computed(() => (['en', 'pt'] as const).map((i) => ({
  hechos: campos.value.filter((c) => propio(c, i) || sugerido(c, i)).length, idioma: i,
  sugeridos: campos.value.filter((c) => sugerido(c, i)).length, total: campos.value.length,
})));
const EN_ESPANOL = { en: 'inglés', pt: 'portugués' } as const;
function fijarTraduccion(c: CampoTexto, valor: string) {
  const i = idiomaEdicion.value;
  if (i === 'es') return;
  const t = (borrador.value.traducciones[i] ??= {});
  escribirRuta(t as Record<string, unknown>, c.ruta, valor);
}
/** Escribe (o borra, con vacío) un valor en `traducciones.{en,pt}` creando lo que falte. */
function escribirRuta(raiz: Record<string, unknown>, ruta: string[], valor: string) {
  let o: Record<string, unknown> = raiz;
  ruta.slice(0, -1).forEach((k, n) => {
    const siguiente = ruta[n + 1]!;
    if (!o[k] || typeof o[k] !== 'object') o[k] = /^\d+$/.test(siguiente) ? [] : {};
    o = o[k] as Record<string, unknown>;
  });
  o[ruta.at(-1)!] = valor;
}

/** Borra las traducciones (de un idioma o de ambos) de una sección o de todas. */
function borrarTraducciones(idiomas: ('en' | 'pt')[], clave?: ClaveSeccion) {
  for (const i of idiomas) {
    const t = borrador.value.traducciones[i];
    if (!t) continue;
    if (!clave) { delete borrador.value.traducciones[i]; continue; }
    for (const c of camposDe(clave)) if (leerRuta(t, c.ruta) !== undefined) escribirRuta(t as Record<string, unknown>, c.ruta, '');
  }
}

const consultaVista = computed(() => ({
  ...(props.idActividad ? { actividad: String(props.idActividad) } : {}),
  ...(idiomaEdicion.value === 'es' ? {} : { lang: idiomaEdicion.value }),
}));
const urlMapaPrevia = computed(() => router.resolve({ path: '/fexcoin-vivo/mapa', query: { previa: '1', ...consultaVista.value } }).href);
const urlVistaPrevia = computed(() => router.resolve({ path: '/fexcoin-vivo', query: consultaVista.value }).href);
const hayTvu = computed(() => Boolean(props.datos?.mapa.urlTransmision));
const hayFacebook = computed(() => Boolean(props.datos?.mapa.urlFacebook));
const enlaceDetectado = computed(() => (enlaceNuevo.value.trim() ? analizarEnlace(enlaceNuevo.value) : null));
const categoriasTexto = computed({
  get: () => borrador.value.proyectos.categorias.join('\n'),
  set: (t: string) => { borrador.value.proyectos.categorias = t.split('\n').map((x) => x.trim()).filter(Boolean); },
});

function cargar() {
  borrador.value = copia(normalizarPortada(props.datos?.mapa.portada));
  original = JSON.stringify(borrador.value);
  subidos.value = [];
}
// Se recarga al cambiar de actividad, o si llega otra portada y aquí no hay cambios pendientes
// (guardar el mapa también devuelve los datos: no debe pisar lo que se está editando).
watch(() => [props.datos?.idActividad, JSON.stringify(props.datos?.mapa.portada ?? null)] as const, (nuevo, viejo) => {
  if (guardando.value) return;
  if (!viejo || nuevo[0] !== viejo[0] || !cambiado.value) cargar();
}, { immediate: true });

function alternar(clave: string) {
  const s = new Set(abiertas.value);
  if (s.has(clave)) s.delete(clave);
  else s.add(clave);
  abiertas.value = s;
}

async function restablecer(clave: ClaveSeccion, nombre: string) {
  const i = idiomaEdicion.value;
  if (i !== 'es') {
    const ok = await confirmar({ mensaje: `Se borran las traducciones al ${EN_ESPANOL[i]} de «${nombre}»: se verán las sugeridas (o el español). Revise y guarde.`, textoAceptar: 'Borrar traducciones', titulo: '¿Volver a las traducciones sugeridas?' });
    if (ok) borrarTraducciones([i], clave);
    return;
  }
  const ok = await confirmar({ mensaje: `«${nombre}» vuelve a los textos por defecto${clave === 'galeria' ? ' (las fotos y videos se mantienen)' : ''} y sus traducciones a las sugeridas. Revise y guarde.`, textoAceptar: 'Restablecer', titulo: '¿Restablecer esta sección?' });
  if (!ok) return;
  borrarTraducciones(['en', 'pt'], clave);
  borrador.value = seccionDefecto(borrador.value, clave);
}

// ------------------------------------------------------------------ proyectos destacados

const opcionesStands = computed(() => (props.datos?.stands ?? [])
  .filter((s) => !borrador.value.destacados.includes(s.idInscripcion))
  .map((s) => ({ label: `${s.stand ? `${s.stand} · ` : ''}${s.proyecto ?? 'Proyecto'}`, value: s.idInscripcion })));
const nombreStand = (id: number) => {
  const s = props.datos?.stands.find((x) => x.idInscripcion === id);
  return s ? `${s.stand ? `${s.stand} · ` : ''}${s.proyecto ?? ''}` : `#${id} (ya no está inscrito)`;
};
function agregarDestacado() {
  if (elegido.value === undefined) return;
  borrador.value.destacados.push(elegido.value);
  elegido.value = undefined;
}

function mover<T>(lista: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j]!, lista[i]!];
}

// ------------------------------------------------------------------ agenda

function agregarDia() {
  const ultimo = borrador.value.dias.at(-1)?.fecha;
  let fecha = '';
  if (ultimo) {
    const [a, m, d] = ultimo.split('-').map(Number);
    const f = new Date(a!, m! - 1, d! + 1);
    fecha = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }
  borrador.value.dias.push({ descripcion: '', destacado: false, fecha, items: [], nota: '', titulo: '' });
}
const itemsTexto = (items: string[]) => items.join('\n');
function fijarItems(i: number, texto: string) {
  borrador.value.dias[i]!.items = texto.split('\n').map((x) => x.trim()).filter(Boolean);
}

// ------------------------------------------------------------------ galería

const mensajeError = (error: unknown) => (error as { response?: { data?: { mensaje?: string } } })?.response?.data?.mensaje ?? (error as Error)?.message ?? 'error';
const tamano = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`);

function fotoDe(f: { alto: number; ancho: number; nombre: string; url: string; urlPequena: string }): FotoPortada {
  return { alto: f.alto, ancho: f.ancho, nombre: f.nombre, texto: '', url: f.url, urlPequena: f.urlPequena };
}

async function subirFotos(archivos: File[]) {
  const id = props.idActividad;
  if (id === undefined || archivos.length === 0) return;
  const fallos: string[] = [];
  await sinAvisosDeError(async () => {
    for (const [n, archivo] of archivos.entries()) {
      const texto = archivos.length > 1 ? `Subiendo foto ${n + 1} de ${archivos.length}…` : 'Subiendo foto…';
      subida.value = { porcentaje: 0, texto };
      try {
        if (!/^image\/(jpeg|png)$/.test(archivo.type)) throw new Error('solo JPG o PNG');
        if (archivo.size > MAX_FOTO) throw new Error(`pesa ${tamano(archivo.size)} (máximo 15 MB)`);
        const f = await subirFotoFeria(id, archivo, (p) => { subida.value = { porcentaje: p, texto }; });
        borrador.value.medios.push({ ...fotoDe(f), tipo: 'foto' });
        subidos.value.push(f.nombre);
      } catch (error) {
        fallos.push(`${archivo.name}: ${mensajeError(error)}`);
      }
    }
  });
  subida.value = null;
  if (fallos.length > 0) avisar({ detalles: fallos, tipo: 'error', titulo: 'Algunas fotos no se subieron' });
}

async function subirVideo(archivo: File) {
  const id = props.idActividad;
  if (id === undefined) return;
  if (!/^video\/(mp4|webm)$/.test(archivo.type)) { avisar({ mensaje: 'Suba un video MP4 (o WebM).', tipo: 'advertencia', titulo: 'Formato no soportado' }); return; }
  if (archivo.size > MAX_VIDEO) {
    avisar({ mensaje: `Pesa ${tamano(archivo.size)} y el máximo es 80 MB. Comprímalo a 720p o súbalo a Facebook y pegue aquí el enlace.`, tipo: 'advertencia', titulo: 'Video demasiado pesado' });
    return;
  }
  const texto = `Subiendo video (${tamano(archivo.size)})…`;
  subida.value = { porcentaje: 0, texto };
  try {
    const v = await sinAvisosDeError(() => subirVideoFeria(id, archivo, (p) => { subida.value = { porcentaje: p, texto }; }));
    borrador.value.medios.push({ nombre: v.nombre, portada: null, texto: '', tipo: 'video', url: v.url, vertical: false });
    subidos.value.push(v.nombre);
    avisar({ mensaje: 'Puede ponerle una foto de portada para que no se vea vacío antes de reproducirlo.', tipo: 'exito', titulo: 'Video subido' });
  } catch (error) {
    avisar({ mensaje: mensajeError(error), tipo: 'error', titulo: 'No se subió el video' });
  } finally {
    subida.value = null;
  }
}

function agregarEnlace() {
  const url = enlaceNuevo.value.trim();
  const e = analizarEnlace(url);
  if (!e) return;
  borrador.value.medios.push({ portada: null, texto: '', tipo: 'enlace', url, vertical: e.vertical });
  enlaceNuevo.value = '';
}

async function subirPortada(i: number, archivo: File) {
  const id = props.idActividad;
  const m = borrador.value.medios[i];
  if (id === undefined || !m) return;
  if (!/^image\/(jpeg|png)$/.test(archivo.type) || archivo.size > MAX_FOTO) {
    avisar({ mensaje: 'La portada debe ser JPG o PNG de hasta 15 MB.', tipo: 'advertencia', titulo: 'Foto no válida' });
    return;
  }
  subida.value = { porcentaje: 0, texto: 'Subiendo portada…' };
  try {
    const f = await sinAvisosDeError(() => subirFotoFeria(id, archivo, (p) => { subida.value = { porcentaje: p, texto: 'Subiendo portada…' }; }));
    m.portada = fotoDe(f);
    subidos.value.push(f.nombre);
  } catch (error) {
    avisar({ mensaje: mensajeError(error), tipo: 'error', titulo: 'No se subió la portada' });
  } finally {
    subida.value = null;
  }
}

function elegirArchivo(e: Event): File[] {
  const entrada = e.target as HTMLInputElement;
  const archivos = [...(entrada.files ?? [])];
  entrada.value = '';
  return archivos;
}
function alElegirFotos(e: Event) { void subirFotos(elegirArchivo(e)); }
function alElegirVideo(e: Event) { const [a] = elegirArchivo(e); if (a) void subirVideo(a); }
function alElegirPortada(e: Event) { const [a] = elegirArchivo(e); if (a && portadaPara >= 0) void subirPortada(portadaPara, a); }
function pedirPortada(i: number) {
  portadaPara = i;
  entradaPortada.value?.click();
}

const TIPO: Record<string, string> = { enlace: 'Enlace', foto: 'Foto', video: 'Video MP4' };
function etiquetaMedio(m: MedioPortada) {
  if (m.tipo !== 'enlace') return TIPO[m.tipo];
  const e = analizarEnlace(m.url);
  return e ? `${e.plataforma === 'facebook' ? 'Facebook' : 'YouTube'}${e.vertical ? ' · reel' : ''}` : 'Enlace';
}
const miniatura = (m: MedioPortada) => {
  const f = m.tipo === 'foto' ? m : m.portada;
  return f ? resolverUrlApi(f.urlPequena || f.url) : '';
};

/** Nombres de archivo del servidor (`/api/feria/publico/{fotos|videos}/{id}/{nombre}.ext`) que usa la portada. */
function archivosDe(p: PortadaCompleta): Set<string> {
  const nombres = new Set<string>();
  const anotar = (f: FotoPortada | null | undefined) => {
    if (!f?.url?.startsWith('/api/feria/publico/')) return;
    const n = f.nombre || /\/([a-z0-9-]+?)(?:-p)?\.(?:jpg|mp4|webm)$/.exec(f.url)?.[1];
    if (n) nombres.add(n);
  };
  for (const m of p.medios) { anotar(m); anotar(m.portada); }
  return nombres;
}

async function borrarArchivos(nombres: string[]) {
  const id = props.idActividad;
  if (id === undefined || nombres.length === 0) return;
  await sinAvisosDeError(async () => {
    for (const n of nombres) await borrarFotoFeria(id, n).catch(() => { /* ya no estaba */ });
  });
}

// ------------------------------------------------------------------ guardar

/** Solo textos (y listas de textos) dentro de `traducciones`; sin vacíos. */
function soloTextos(v: unknown, nivel = 0): unknown {
  if (typeof v === 'string') return v.trim() || undefined;
  if (nivel > 4) return undefined;
  if (Array.isArray(v)) {
    const lista = v.map((x) => (typeof x === 'string' ? x.trim() : ''));
    while (lista.length && !lista.at(-1)) lista.pop();
    return lista.length ? lista : undefined;
  }
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const r: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) {
    const limpio = soloTextos(x, nivel + 1);
    if (limpio !== undefined) r[k] = limpio;
  }
  return Object.keys(r).length ? r : undefined;
}
function traduccionesLimpias(v: unknown): PortadaCompleta['traducciones'] {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const r: PortadaCompleta['traducciones'] = {};
  for (const i of ['en', 'pt'] as const) {
    const x = soloTextos(o[i]);
    if (x) r[i] = x as TextosPortada;
  }
  return r;
}


async function guardar() {
  const id = props.idActividad;
  if (id === undefined || guardando.value) return;
  const p = borrador.value;
  if (p.dias.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || !d.titulo.trim())) {
    abiertas.value = new Set([...abiertas.value, 'agenda']);
    avisar({ mensaje: 'Cada día de la agenda necesita fecha y título.', tipo: 'advertencia', titulo: 'Revise la agenda' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.inicio)) {
    abiertas.value = new Set([...abiertas.value, 'general']);
    avisar({ mensaje: 'Indique la fecha y hora de inicio de la feria.', tipo: 'advertencia', titulo: 'Falta el inicio' });
    return;
  }
  guardando.value = true;
  const antes = archivosDe(normalizarPortada(props.datos?.mapa.portada));
  try {
    // Sin traducciones vacías ni basura; sin la clave si no hay ninguna (portadas sin traducir quedan igual que antes).
    const limpias = traduccionesLimpias(p.traducciones);
    const cuerpo = portadaParaGuardar({ ...p, traducciones: limpias });
    if (Object.keys(limpias).length === 0) delete cuerpo.traducciones;
    const r = await guardarPortadaFeria(id, cuerpo);
    const ahora = archivosDe(p);
    await borrarArchivos([...antes].filter((n) => !ahora.has(n)));
    subidos.value = [];
    borrador.value = copia(normalizarPortada(cuerpo));
    original = JSON.stringify(borrador.value);
    emit('guardado', r);
    avisar({ mensaje: 'Ya se ve en la página pública (/fexcoin-vivo).', tipo: 'exito', titulo: 'Portada guardada' });
  } catch { /* el interceptor avisó */ } finally {
    guardando.value = false;
  }
}

async function descartar() {
  const ok = await confirmar({ mensaje: 'Se perderán los cambios de la portada sin guardar.', peligro: true, textoAceptar: 'Descartar', titulo: '¿Descartar cambios?' });
  if (!ok) return;
  await borrarArchivos(subidos.value);
  cargar();
}

async function restablecerTodo() {
  const ok = await confirmar({ mensaje: 'Todas las secciones vuelven a los textos del afiche y la invitación oficial, y las traducciones a las sugeridas (las fotos y videos se mantienen). Revise y guarde.', textoAceptar: 'Restablecer todo', titulo: '¿Restablecer toda la portada?' });
  if (ok) borrador.value = { ...copia(PORTADA_DEFECTO), medios: borrador.value.medios };
}
</script>

<template>
  <div class="ep">
    <div class="ep__cabecera">
      <div>
        <strong>Portada pública</strong>
        <small>Lo que ve el visitante en <code>/fexcoin-vivo</code>, en el mismo orden.</small>
      </div>
      <a class="ep__previa" :href="urlVistaPrevia" target="_blank" rel="noopener" title="Abre la página en otra pestaña. Muestra lo GUARDADO: guarde antes para ver sus cambios.">
        Vista previa{{ idiomaEdicion === 'es' ? '' : ` (${idiomaEdicion.toUpperCase()})` }} ↗
      </a>
    </div>
    <div class="ep__idioma">
      <span>Idioma que está editando</span>
      <RadioGroup v-model:value="idiomaEdicion" button-style="solid" size="small">
        <RadioButton v-for="o in OPCIONES_IDIOMA" :key="o.value" :value="o.value">{{ o.label }}</RadioButton>
      </RadioGroup>
      <small class="ep__avance">
        <span v-for="a in avance" :key="a.idioma" :class="{ 'is-completo': a.hechos === a.total }">{{ NOMBRE_IDIOMA[a.idioma] }}: {{ a.hechos }} de {{ a.total }} textos{{ a.sugeridos ? ` (${a.sugeridos} con la sugerida)` : '' }}</span>
      </small>
    </div>
    <p v-if="sinPortada" class="ep__aviso">Esta actividad aún no tiene portada: abajo están los textos por defecto (del afiche y la invitación). Revíselos y pulse «Guardar portada».</p>
    <p v-else-if="cambiado" class="ep__aviso ep__aviso--cambios">Hay cambios sin guardar. «Vista previa» muestra lo guardado.</p>

    <div class="ep__secciones">
      <!-- 0 · Datos generales -->
      <EditorSeccion fija titulo="Datos de la feria" ayuda="Fecha de inicio, horario, lugar y quién organiza" :abierta="abiertas.has('general')"
        :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('general')" @restablecer="restablecer('general', 'Datos de la feria')">
        <template v-if="idiomaEdicion === 'es'">
          <label class="ep__campo">
            <span>Inicio de la feria</span>
            <input v-model="borrador.inicio" class="ep__nativo" type="datetime-local" />
            <small>Desde aquí cuenta la cuenta regresiva; a esa hora la página pasa a «● EN VIVO».</small>
          </label>
          <label class="ep__campo">
            <span>Horario</span>
            <Input v-model:value="borrador.horario" placeholder="15:00 a 23:00 · ambos días" :maxlength="60" />
            <small>La segunda hora marca el cierre de cada día («Finalizada» después del último). El afiche decía 17:00: confírmelo.</small>
          </label>
          <label class="ep__campo">
            <span>Lugar</span>
            <Input v-model:value="borrador.lugar" placeholder="Av. Tcnl. Enrique Fernández Cornejo · Cobija" :maxlength="120" />
          </label>
          <label class="ep__campo">
            <span>Organiza</span>
            <Textarea v-model:value="borrador.organiza" :auto-size="{ minRows: 1, maxRows: 3 }" :maxlength="200" placeholder="Universidad Amazónica de Pando con…" />
            <small>Se muestra en el Día de los barrios y en el pie de página.</small>
          </label>
          <p class="ep__nota">En la página se lee: <b>{{ rangoDias(borrador, 'es') }} · {{ borrador.horario.split('·')[0] }}</b> — {{ borrador.lugar }}</p>
        </template>
        <EditorTraduccion v-else :campos="camposDe('general')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>

      <!-- 1 · Hero -->
      <EditorSeccion v-model:mostrar="borrador.hero.mostrar" :numero="1" titulo="Portada principal" ayuda="El título grande, el lema y la fecha"
        :abierta="abiertas.has('hero')" :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('hero')" @restablecer="restablecer('hero', 'Portada principal')">
        <template v-if="idiomaEdicion === 'es'">
          <div class="ep__dos">
            <label class="ep__campo">
              <span>Título · línea blanca</span>
              <Input v-model:value="borrador.hero.titulo" placeholder="¡La feria de innovación" :maxlength="60" />
            </label>
            <label class="ep__campo">
              <span>Título · línea roja</span>
              <Input v-model:value="borrador.hero.tituloRojo" placeholder="más grande de Pando!" :maxlength="60" />
            </label>
          </div>
          <div class="ep__muestra" aria-hidden="true"><span>{{ borrador.hero.titulo || PORTADA_DEFECTO.hero.titulo }}</span><em>{{ borrador.hero.tituloRojo }}</em></div>
          <label class="ep__campo">
            <span>Lema</span>
            <Input v-model:value="borrador.hero.lema" placeholder="Nosotros: investigamos, innovamos y transformamos" :maxlength="120" />
            <small>Va entre comillas, en mayúsculas. Vacío = no se muestra.</small>
          </label>
          <label class="ep__campo">
            <span>Frase</span>
            <Input v-model:value="borrador.hero.frase" placeholder="Una historia de excelencia académica, sin fronteras" :maxlength="120" />
          </label>
          <label class="ep__campo">
            <span>Descripción</span>
            <Textarea v-model:value="borrador.hero.descripcion" :auto-size="{ minRows: 2, maxRows: 4 }" :maxlength="300" placeholder="Feria Institucional de Ciencia, Tecnología, Innovación…" />
            <small>Texto chico debajo de la galería (el nombre oficial de la feria). Vacío = no se muestra.</small>
          </label>
          <label class="ep__interruptor">
            <Switch v-model:checked="borrador.hero.contador" size="small" />
            <span>Cuenta regresiva sobre la galería <small>(durante la feria muestra proyectos evaluados y visitantes)</small></span>
          </label>
        </template>
        <EditorTraduccion v-else :campos="camposDe('hero')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>

      <!-- 2 · Galería -->
      <EditorSeccion v-model:mostrar="borrador.galeria.mostrar" :numero="2" titulo="Fotos y videos" :ayuda="borrador.medios.length ? `${borrador.medios.length} en la galería` : 'Sin medios: se muestra el afiche y el reel oficial'"
        :abierta="abiertas.has('galeria')" :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('galeria')" @restablecer="restablecer('galeria', 'Fotos y videos')">
        <template v-if="idiomaEdicion === 'es'">
          <p class="ep__nota">
            La primera es la que se ve al abrir la página. <b>Fotos</b>: JPG o PNG hasta 15 MB, mientras más grande mejor (se optimizan solas).
            <b>Videos</b>: MP4 hasta 80 MB, mejor en 720p y cortos; para videos largos súbalos a Facebook y pegue el enlace.
            Los videos solo se descargan cuando el visitante toca ▶.
          </p>
          <ol v-if="borrador.medios.length" class="ep__medios">
            <li v-for="(m, i) in borrador.medios" :key="`${i}:${m.url}`">
              <div class="ep__mini" :class="`ep__mini--${m.tipo}`">
                <img v-if="miniatura(m)" :src="miniatura(m)" alt="" width="104" height="68" loading="lazy" />
                <span v-else aria-hidden="true">▶</span>
                <b>{{ i + 1 }}</b>
              </div>
              <div class="ep__medio">
                <span class="ep__tipo" :class="`ep__tipo--${m.tipo}`">{{ etiquetaMedio(m) }}</span>
                <Input v-model:value="m.texto" size="small" placeholder="Pie de foto (opcional), p. ej. Inauguración 2025" :maxlength="120" />
                <a v-if="m.tipo === 'enlace'" class="ep__url" :href="m.url" target="_blank" rel="noopener noreferrer">{{ m.url }}</a>
                <div v-if="m.tipo !== 'foto'" class="ep__fila">
                  <Button size="small" :disabled="Boolean(subida)" @click="pedirPortada(i)">{{ m.portada ? 'Cambiar portada' : '+ Foto de portada' }}</Button>
                  <Button v-if="m.portada" size="small" type="text" @click="m.portada = null">Quitar portada</Button>
                  <Checkbox v-model:checked="m.vertical" class="ep__nowrap">Vertical 9:16</Checkbox>
                </div>
              </div>
              <span class="ep__orden">
                <button type="button" aria-label="Mover antes" title="Mover antes" :disabled="i === 0" @click="mover(borrador.medios, i, -1)">↑</button>
                <button type="button" aria-label="Mover después" title="Mover después" :disabled="i === borrador.medios.length - 1" @click="mover(borrador.medios, i, 1)">↓</button>
                <button type="button" aria-label="Quitar de la galería" title="Quitar" @click="borrador.medios.splice(i, 1)">✕</button>
              </span>
            </li>
          </ol>
          <div v-if="subida" class="ep__subida" role="status">
            <span>{{ subida.texto }} {{ subida.porcentaje }} %</span>
            <span class="ep__barra"><span :style="{ transform: `scaleX(${subida.porcentaje / 100})` }"></span></span>
          </div>
          <input ref="entradaFotos" type="file" accept="image/jpeg,image/png" multiple hidden @change="alElegirFotos" />
          <input ref="entradaVideo" type="file" accept="video/mp4,video/webm" hidden @change="alElegirVideo" />
          <input ref="entradaPortada" type="file" accept="image/jpeg,image/png" hidden @change="alElegirPortada" />
          <div class="ep__fila ep__fila--envuelve">
            <Button :disabled="idActividad === undefined || Boolean(subida)" @click="entradaFotos?.click()">+ Subir fotos</Button>
            <Button :disabled="idActividad === undefined || Boolean(subida)" @click="entradaVideo?.click()">+ Subir video MP4</Button>
          </div>
          <div class="ep__campo">
            <span>Agregar enlace de Facebook o YouTube</span>
            <div class="ep__fila">
              <Input v-model:value="enlaceNuevo" placeholder="https://www.facebook.com/reel/1637254991180398" allow-clear @press-enter="agregarEnlace" />
              <Button :disabled="!enlaceDetectado" @click="agregarEnlace">Agregar</Button>
            </div>
            <small v-if="enlaceNuevo.trim() && enlaceDetectado" class="ep__ok">✓ {{ enlaceDetectado.plataforma === 'facebook' ? 'Video de Facebook' : 'Video de YouTube' }}{{ enlaceDetectado.vertical ? ' (vertical, tipo reel)' : '' }}</small>
            <small v-else-if="enlaceNuevo.trim()" class="ep__error">No parece un video de Facebook (reel, watch, videos) ni de YouTube. Copie el enlace desde «Compartir → Copiar enlace».</small>
            <small v-else>Reels o videos públicos de Facebook, o videos de YouTube.</small>
          </div>
        </template>
        <EditorTraduccion v-else :campos="camposDe('galeria')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>

      <!-- 3 · Botones -->
      <EditorSeccion v-model:mostrar="borrador.acciones.mostrar" :numero="3" titulo="Botones y mapa"
        :ayuda="borrador.mapa.publicar ? 'Mapa habilitado · TVU · Facebook' : 'Mapa BLOQUEADO (muestra «muy pronto») · TVU · Facebook'"
        :abierta="abiertas.has('acciones')" :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('acciones')" @restablecer="restablecer('acciones', 'Botones de acción')">
        <template v-if="idiomaEdicion === 'es'">
          <label class="ep__campo">
            <span>Título (opcional)</span>
            <Input v-model:value="borrador.acciones.titulo" placeholder="Vive la feria" :maxlength="60" />
          </label>
          <label class="ep__campo">
            <span>Descripción (opcional)</span>
            <Textarea v-model:value="borrador.acciones.descripcion" :auto-size="{ minRows: 1, maxRows: 3 }" :maxlength="200" placeholder="Encuentre cada stand en el mapa en vivo o mire la transmisión." />
          </label>
          <label class="ep__interruptor ep__interruptor--grande" :class="{ 'is-on': borrador.mapa.publicar }">
            <Switch v-model:checked="borrador.mapa.publicar" />
            <span>
              <b>Mostrar el mapa al público</b>
              <small>{{ borrador.mapa.publicar
                ? 'Encendido: el botón «Ver el mapa» y «Ver ubicación» de cada proyecto abren el mapa.'
                : 'Apagado: la portada muestra «Mapa · muy pronto» y quien entre a /fexcoin-vivo/mapa ve el aviso de abajo. Enciéndalo cuando los stands estén ubicados.' }}</small>
            </span>
          </label>
          <fieldset class="ep__grupo" :class="{ 'is-inactivo': borrador.mapa.publicar }">
            <legend>Aviso mientras el mapa está bloqueado</legend>
            <label class="ep__campo">
              <span>Título del aviso</span>
              <Input v-model:value="borrador.mapa.titulo" placeholder="El mapa de la feria está en camino" :maxlength="80" />
            </label>
            <label class="ep__campo">
              <span>Texto del aviso</span>
              <Textarea v-model:value="borrador.mapa.texto" :auto-size="{ minRows: 2, maxRows: 4 }" :maxlength="300" />
            </label>
            <a class="ep__previa" :href="urlMapaPrevia" target="_blank" rel="noopener" title="Abre el mapa aunque esté bloqueado, para revisarlo antes de habilitarlo">
              Revisar el mapa (aunque esté bloqueado) ↗
            </a>
          </fieldset>
          <p class="ep__nota">
            Los enlaces de TVU y Facebook se configuran en la pestaña «Configuración»:
            TVU <b :class="hayTvu ? 'ep__ok' : 'ep__error'">{{ hayTvu ? 'configurado' : 'sin enlace (no se muestra)' }}</b>,
            Facebook <b :class="hayFacebook ? 'ep__ok' : 'ep__error'">{{ hayFacebook ? 'configurado' : 'sin enlace (no se muestra)' }}</b>.
          </p>
        </template>
        <EditorTraduccion v-else :campos="camposDe('acciones')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>

      <!-- 4 · Agenda -->
      <EditorSeccion v-model:mostrar="borrador.agenda.mostrar" :numero="4" titulo="Agenda" :ayuda="`${borrador.dias.length} día(s) · el destacado tiene su propio bloque`"
        :abierta="abiertas.has('agenda')" :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('agenda')" @restablecer="restablecer('agenda', 'Agenda')">
        <template v-if="idiomaEdicion === 'es'">
          <label class="ep__campo">
            <span>Título</span>
            <Input v-model:value="borrador.agenda.titulo" placeholder="Agenda" :maxlength="60" />
          </label>
          <label class="ep__campo">
            <span>Descripción (opcional)</span>
            <Textarea v-model:value="borrador.agenda.descripcion" :auto-size="{ minRows: 1, maxRows: 3 }" :maxlength="200" />
          </label>
          <article v-for="(d, i) in borrador.dias" :key="i" class="ep__caja" :class="{ 'is-destacado': d.destacado }">
            <div class="ep__fila">
              <input v-model="d.fecha" class="ep__nativo" type="date" aria-label="Fecha del día" />
              <Checkbox v-model:checked="d.destacado">Destacado</Checkbox>
              <span class="ep__orden">
                <button type="button" aria-label="Subir" @click="mover(borrador.dias, i, -1)">↑</button>
                <button type="button" aria-label="Bajar" @click="mover(borrador.dias, i, 1)">↓</button>
                <button type="button" aria-label="Quitar día" @click="borrador.dias.splice(i, 1)">✕</button>
              </span>
            </div>
            <Input v-model:value="d.titulo" placeholder="Título, p. ej. ¡Día de los barrios!" :maxlength="80" />
            <Textarea v-model:value="d.descripcion" placeholder="Descripción, p. ej. ¡Vecinos de Cobija, la Universidad los espera!" :auto-size="{ minRows: 1, maxRows: 3 }" :maxlength="300" />
            <Textarea :value="itemsTexto(d.items)" placeholder="Actividades, una por línea (p. ej. Recorridos guiados por la Feria)" :auto-size="{ minRows: 2, maxRows: 6 }" @change="fijarItems(i, ($event.target as HTMLTextAreaElement).value)" />
            <Input v-model:value="d.nota" placeholder="Nota, p. ej. Coordine su asistencia con su junta vecinal" :maxlength="200" />
          </article>
          <div class="ep__fila"><Button size="small" @click="agregarDia">+ Agregar día</Button></div>
          <small class="ep__ayuda">«Destacado» le da su propio bloque de color (como el Día de los barrios) con sus actividades y nota.</small>
        </template>
        <EditorTraduccion v-else :campos="camposDe('agenda')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>

      <!-- 5 · Proyectos -->
      <EditorSeccion v-model:mostrar="borrador.proyectos.mostrar" :numero="5" titulo="Proyectos"
        :ayuda="borrador.proyectos.publicar ? 'Visibles al público con «Ver ubicación»' : 'Ocultos: se muestra «se están preparando»'"
        :abierta="abiertas.has('proyectos')" :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('proyectos')" @restablecer="restablecer('proyectos', 'Proyectos')">
        <template v-if="idiomaEdicion === 'es'">
          <label class="ep__campo">
            <span>Título de la sección</span>
            <Input v-model:value="borrador.proyectos.titulo" placeholder="Proyectos" :maxlength="60" />
          </label>
          <label class="ep__campo">
            <span>Descripción (opcional)</span>
            <Textarea v-model:value="borrador.proyectos.descripcion" :auto-size="{ minRows: 1, maxRows: 3 }" :maxlength="200" />
          </label>
          <label class="ep__interruptor ep__interruptor--grande" :class="{ 'is-on': borrador.proyectos.publicar }">
            <Switch v-model:checked="borrador.proyectos.publicar" />
            <span>
              <b>Mostrar proyectos al público</b>
              <small>{{ borrador.proyectos.publicar
                ? 'Encendido: se ven los destacados y la lista con buscador; cada uno con «Ver ubicación» al mapa.'
                : 'Apagado: se muestra el mensaje «se están preparando» con las categorías. Enciéndalo cuando los proyectos estén listos.' }}</small>
            </span>
          </label>

          <fieldset class="ep__grupo" :class="{ 'is-inactivo': borrador.proyectos.publicar }">
            <legend>Mientras están ocultos {{ borrador.proyectos.publicar ? '(no se ve ahora)' : '(se ve ahora)' }}</legend>
            <label class="ep__campo">
              <span>Título del aviso</span>
              <Input v-model:value="borrador.proyectos.preparandoTitulo" placeholder="Estamos preparando los proyectos" :maxlength="80" />
            </label>
            <label class="ep__campo">
              <span>Texto del aviso</span>
              <Textarea v-model:value="borrador.proyectos.preparandoTexto" :auto-size="{ minRows: 2, maxRows: 5 }" :maxlength="400" />
            </label>
            <label class="ep__campo">
              <span>Cifra de proyectos</span>
              <Input v-model:value="borrador.proyectos.cifra" placeholder="400" :maxlength="6" style="max-width: 140px" />
              <small>Se anuncia como «+400 proyectos». Vacío = no se muestra.</small>
            </label>
            <div class="ep__campo">
              <span>Categorías que se anuncian <small>({{ borrador.proyectos.categorias.length }})</small></span>
              <Textarea v-model:value="categoriasTexto" :auto-size="{ minRows: 3, maxRows: 10 }" placeholder="Una por línea" />
              <small>Una por línea; cada una lleva su ícono. <button type="button" class="ep__enlace" @click="borrador.proyectos.categorias = [...CATEGORIAS_AFICHE]">Usar las 10 del afiche</button></small>
            </div>
          </fieldset>

          <fieldset class="ep__grupo" :class="{ 'is-inactivo': !borrador.proyectos.publicar }">
            <legend>Cuando se muestren {{ borrador.proyectos.publicar ? '(se ve ahora)' : '(no se ve ahora)' }}</legend>
            <div class="ep__dos">
              <label class="ep__campo">
                <span>Título de destacados</span>
                <Input v-model:value="borrador.proyectos.destacadosTitulo" placeholder="Proyectos destacados" :maxlength="60" />
              </label>
              <label class="ep__campo">
                <span>Título de la lista</span>
                <Input v-model:value="borrador.proyectos.todosTitulo" placeholder="Todos los proyectos" :maxlength="60" />
              </label>
            </div>
            <span class="ep__subtitulo">Proyectos destacados <small>{{ borrador.destacados.length ? `${borrador.destacados.length} elegidos` : 'automático: los primeros stands ubicados' }}</small></span>
            <ol class="ep__destacados">
              <li v-for="(id, i) in borrador.destacados" :key="id">
                <span>{{ nombreStand(id) }}</span>
                <span class="ep__orden">
                  <button type="button" aria-label="Subir" @click="mover(borrador.destacados, i, -1)">↑</button>
                  <button type="button" aria-label="Bajar" @click="mover(borrador.destacados, i, 1)">↓</button>
                  <button type="button" aria-label="Quitar" @click="borrador.destacados.splice(i, 1)">✕</button>
                </span>
              </li>
            </ol>
            <div class="ep__fila">
              <Select v-model:value="elegido" show-search option-filter-prop="label" :options="opcionesStands" placeholder="Buscar proyecto…" style="flex: 1; min-width: 0" />
              <Button :disabled="elegido === undefined" @click="agregarDestacado">Agregar</Button>
            </div>
          </fieldset>
        </template>
        <EditorTraduccion v-else :campos="camposDe('proyectos')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>

      <!-- 6 · Pie -->
      <EditorSeccion v-model:mostrar="borrador.pie.mostrar" :numero="6" titulo="Pie de página" ayuda="Cierre con organiza, lugar, enlaces y visitantes"
        :abierta="abiertas.has('pie')" :solo-texto="idiomaEdicion !== 'es'" @alternar="alternar('pie')" @restablecer="restablecer('pie', 'Pie de página')">
        <template v-if="idiomaEdicion === 'es'">
          <label class="ep__campo">
            <span>Título</span>
            <Input v-model:value="borrador.pie.titulo" placeholder="FEXCOIN ECUANA V5 · UAP 2026" :maxlength="80" />
          </label>
          <label class="ep__campo">
            <span>Mensaje (opcional)</span>
            <Textarea v-model:value="borrador.pie.descripcion" :auto-size="{ minRows: 1, maxRows: 3 }" :maxlength="200" placeholder="¡Te esperamos en la feria!" />
          </label>
        </template>
        <EditorTraduccion v-else :campos="camposDe('pie')" :idioma="idiomaEdicion" :listo="diccionariosListos"
          :traducciones="borrador.traducciones[idiomaEdicion]" @fijar="fijarTraduccion" />
      </EditorSeccion>
    </div>

    <div class="ep__acciones">
      <Button class="semfa-btn semfa-btn--primario" :loading="guardando" :disabled="!sucio || idActividad === undefined || Boolean(subida)" @click="guardar">Guardar portada</Button>
      <Button class="semfa-btn semfa-btn--suave-peligro" :disabled="!cambiado" @click="descartar">Descartar</Button>
      <Button class="semfa-btn semfa-btn--neutro" @click="restablecerTodo">Restablecer todo</Button>
    </div>
  </div>
</template>

<style scoped>
.ep { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; padding: 10px 10px 0; }
.ep__cabecera { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.ep__cabecera > div { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.ep__cabecera strong { font-size: 15px; }
.ep__cabecera small { color: hsl(var(--muted-foreground)); font-size: 12px; }
.ep__previa { flex: none; border: 1px solid hsl(var(--primary) / 50%); border-radius: 8px; padding: 5px 11px; color: hsl(var(--primary)); font-size: 13px; font-weight: 700; }
.ep__previa:hover { background: hsl(var(--primary) / 8%); }
.ep__idioma { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 10px; border: 1px solid hsl(var(--border)); border-radius: 10px; background: hsl(var(--muted) / 50%); padding: 8px 10px; }
.ep__idioma > span { font-size: 12.5px; font-weight: 700; }
.ep__avance { display: flex; flex-wrap: wrap; gap: 4px 12px; width: 100%; color: hsl(var(--muted-foreground)); font-size: 12px; }
.ep__avance .is-completo { color: #15803d; }
.ep__aviso { margin: 0 0 10px; border-radius: 8px; background: rgb(250 204 21 / 15%); padding: 8px 10px; color: #a16207; font-size: 12.5px; }
.ep__aviso--cambios { background: hsl(var(--primary) / 10%); color: hsl(var(--primary)); }
.ep__secciones { display: flex; flex-direction: column; gap: 8px; }
.ep__campo { display: flex; flex-direction: column; gap: 4px; }
.ep__campo > span { font-size: 12.5px; font-weight: 700; }
.ep__campo > span small { color: hsl(var(--muted-foreground)); font-weight: 500; }
.ep__campo > small, .ep__ayuda { color: hsl(var(--muted-foreground)); font-size: 12px; line-height: 1.4; }
.ep__dos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ep__nota { margin: 0; border-radius: 8px; background: hsl(var(--muted)); padding: 8px 10px; color: hsl(var(--muted-foreground)); font-size: 12.5px; line-height: 1.45; }
.ep__nota b { color: hsl(var(--foreground)); }
.ep__muestra { display: flex; flex-direction: column; border-radius: 8px; background: #0b1736; padding: 10px 12px; color: #fff; font-size: 17px; font-weight: 900; line-height: 1.1; text-align: center; text-transform: uppercase; }
.ep__muestra em { color: #e11d2a; font-style: normal; }
.ep__nativo { width: fit-content; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--card)); padding: 4px 8px; color: inherit; color-scheme: light dark; }
.ep__interruptor { display: flex; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; }
.ep__interruptor small { color: hsl(var(--muted-foreground)); }
.ep__interruptor--grande { align-items: flex-start; border: 1px solid hsl(var(--border)); border-radius: 10px; background: hsl(var(--muted) / 50%); padding: 10px 12px; }
.ep__interruptor--grande.is-on { border-color: rgb(22 163 74 / 50%); background: rgb(22 163 74 / 8%); }
.ep__interruptor--grande > span { display: flex; flex-direction: column; gap: 2px; }
.ep__interruptor--grande b { font-size: 14px; }
.ep__grupo { display: flex; flex-direction: column; gap: 10px; margin: 0; border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 8px 12px 12px; }
.ep__grupo legend { padding: 0 6px; font-size: 12.5px; font-weight: 800; }
.ep__grupo.is-inactivo { opacity: .7; }
.ep__subtitulo { font-size: 12.5px; font-weight: 700; }
.ep__subtitulo small { color: hsl(var(--muted-foreground)); font-weight: 500; }
.ep__caja { display: flex; flex-direction: column; gap: 6px; border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 8px; }
.ep__caja.is-destacado { border-color: #c8102e; }
.ep__fila { display: flex; align-items: center; gap: 8px; }
.ep__fila--envuelve { flex-wrap: wrap; }
.ep__nowrap { white-space: nowrap; }
.ep__orden { display: inline-flex; flex: none; gap: 2px; margin-left: auto; }
.ep__orden button { width: 26px; height: 26px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--muted)); color: inherit; cursor: pointer; }
.ep__orden button:disabled { opacity: .4; cursor: default; }
.ep__medios, .ep__destacados { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.ep__medios li { display: flex; align-items: flex-start; gap: 10px; border: 1px solid hsl(var(--border)); border-radius: 10px; padding: 8px; }
.ep__mini { position: relative; display: grid; width: 104px; height: 68px; flex: none; place-items: center; overflow: hidden; border-radius: 7px; background: #0b1736; color: #b9c6e4; font-size: 22px; }
.ep__mini img { width: 100%; height: 100%; object-fit: cover; }
.ep__mini b { position: absolute; top: 3px; left: 3px; display: grid; min-width: 18px; height: 18px; place-items: center; border-radius: 5px; background: rgb(0 0 0 / 60%); color: #fff; font-size: 11px; }
.ep__mini--video::after, .ep__mini--enlace::after { position: absolute; right: 4px; bottom: 3px; color: #fff; font-size: 13px; text-shadow: 0 1px 3px #000; content: '▶'; }
.ep__medio { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; }
.ep__tipo { align-self: flex-start; border-radius: 5px; padding: 1px 7px; font-size: 11px; font-weight: 800; }
.ep__tipo--foto { background: hsl(var(--muted)); }
.ep__tipo--video { background: rgb(200 16 46 / 12%); color: #b3142b; }
.ep__tipo--enlace { background: rgb(37 99 235 / 12%); color: #1d4ed8; }
.ep__url { overflow: hidden; color: hsl(var(--muted-foreground)); font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
.ep__subida { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; }
.ep__barra { position: relative; height: 6px; overflow: hidden; border-radius: 999px; background: hsl(var(--muted)); }
.ep__barra span { position: absolute; inset: 0; background: hsl(var(--primary)); transform-origin: left; transition: transform .2s; }
.ep__ok { color: #15803d !important; }
.ep__error { color: #b91c1c !important; }
.ep__enlace { border: 0; background: none; padding: 0; color: hsl(var(--primary)); font-size: 12px; font-weight: 700; text-decoration: underline; cursor: pointer; }
.ep__destacados li { display: flex; align-items: center; gap: 6px; border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 4px 6px; font-size: 13px; }
.ep__destacados li span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ep__acciones { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; border-top: 1px solid hsl(var(--border)); background: hsl(var(--card)); padding: 10px 0; }
@media (max-width: 520px) { .ep__dos { grid-template-columns: 1fr; } }
</style>
