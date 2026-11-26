/**
 * Portada de la página pública FEXCOIN (`/fexcoin-vivo`): valores por defecto (los del afiche y la
 * invitación oficial) y lectura tolerante del JSON configurable (`mapa.portada`). La usan la
 * portada, el mapa y el editor.
 *
 * Formato 2 (por secciones): cada sección tiene `mostrar`, `titulo` y `descripcion` más sus campos.
 * El formato 1 (eslogan + resaltado, subtitulo, fotos) se sigue leyendo: `normalizarPortada` lo
 * convierte. Un título vacío vuelve al texto por defecto; una descripción vacía no se muestra.
 *
 * Idiomas: los textos se escriben en español y `traducciones.{en,pt}` guarda lo que el administrador
 * tradujo (misma forma; días por fecha y medios por url). `traducirPortada` elige, campo por campo:
 * la traducción del administrador > la sugerida si el español es el por defecto > el español.
 */
import type { DiaPortada, FotoPortada, MedioPortada, PortadaFeria, TextosPortada } from '#/api/feria-publico';
import type { Idioma } from './i18n';

import { resolverUrlApi } from '#/api/feria-publico';

import { fraseTraducida, hora, idioma, rangoFechas, t } from './i18n';

export interface DiaCompleto { fecha: string; titulo: string; descripcion: string; items: string[]; nota: string; destacado: boolean }
export interface SeccionCompleta { mostrar: boolean; titulo: string; descripcion: string }
export interface HeroCompleto extends SeccionCompleta { tituloRojo: string; lema: string; frase: string; contador: boolean }
export interface ProyectosCompleto extends SeccionCompleta {
  publicar: boolean;
  preparandoTitulo: string;
  preparandoTexto: string;
  cifra: string;
  categorias: string[];
  destacadosTitulo: string;
  todosTitulo: string;
}

export interface MapaPortada { publicar: boolean; titulo: string; texto: string }

export interface PortadaCompleta {
  inicio: string;
  horario: string;
  lugar: string;
  organiza: string;
  dias: DiaCompleto[];
  hero: HeroCompleto;
  galeria: SeccionCompleta;
  medios: MedioPortada[];
  acciones: SeccionCompleta;
  mapa: MapaPortada;
  agenda: SeccionCompleta;
  proyectos: ProyectosCompleto;
  destacados: number[];
  pie: SeccionCompleta;
  traducciones: Partial<Record<'en' | 'pt', TextosPortada>>;
}

export type ClaveSeccion = 'acciones' | 'agenda' | 'galeria' | 'general' | 'hero' | 'pie' | 'proyectos';

/** Las 10 categorías del afiche oficial (se anuncian mientras se preparan los proyectos). */
export const CATEGORIAS_AFICHE = [
  'Investigación', 'Ciencia', 'Tecnología', 'Innovación', 'Emprendimiento', 'Educación',
  'Amazonía y Derechos Humanos', 'Sociedad y Ambiente', 'Desarrollo Productivo', 'Posgraduación',
];

export const PORTADA_DEFECTO: PortadaCompleta = {
  inicio: '2026-11-13T15:00',
  horario: '15:00 a 23:00 · ambos días',
  lugar: 'Av. Tcnl. Enrique Fernández Cornejo · Cobija',
  organiza: 'Universidad Amazónica de Pando con la Federación de Juntas Vecinales de Cobija',
  dias: [
    {
      fecha: '2026-11-13', titulo: 'Desfile e inauguración', destacado: false, items: [], nota: '',
      descripcion: 'Desfile de las carreras y acto de inauguración. ¡Vení a conocer los proyectos de la UAP!',
    },
    {
      fecha: '2026-11-14', titulo: '¡Día de los barrios!', destacado: true,
      descripcion: '¡Vecinos de Cobija, la Universidad los espera!',
      items: ['Recorridos guiados por la Feria', 'Credencial del Conocimiento con sellos', 'Mesa UAP-Sociedad: traiga las necesidades de su barrio'],
      nota: 'Coordine su asistencia y transporte con el presidente de su junta vecinal',
    },
  ],
  hero: {
    mostrar: true,
    titulo: '¡La feria de innovación',
    tituloRojo: 'más grande de Pando!',
    lema: 'Nosotros: investigamos, innovamos y transformamos',
    frase: 'Una historia de excelencia académica, sin fronteras',
    descripcion: 'Feria Institucional de Ciencia, Tecnología, Innovación, Emprendimiento, Educación Posgradual y Desarrollo Productivo FEXCOIN UAP 2026 – ECUANA',
    contador: true,
  },
  galeria: { mostrar: true, titulo: 'Fotos y videos de la feria', descripcion: '' },
  medios: [],
  acciones: { mostrar: true, titulo: '', descripcion: '' },
  mapa: {
    // Apagado hasta que los stands estén ubicados: nadie ve un mapa vacío o a medias.
    publicar: false,
    titulo: 'El mapa de la feria está en camino',
    texto: 'Estamos ubicando cada stand en el plano. Muy pronto podrás buscar un proyecto y llegar a él desde tu celular.',
  },
  agenda: { mostrar: true, titulo: 'Agenda', descripcion: 'Dos días para conocer lo que investiga, crea y emprende la UAP.' },
  proyectos: {
    mostrar: true,
    titulo: 'Proyectos',
    descripcion: '',
    publicar: false,
    preparandoTitulo: 'Estamos preparando los proyectos',
    preparandoTexto: 'Los equipos de todas las carreras están dando los últimos toques a sus stands. De a poco iremos publicando aquí cada proyecto, su categoría y su ubicación en el mapa. ¡Vuelve pronto!',
    cifra: '400',
    categorias: [...CATEGORIAS_AFICHE],
    destacadosTitulo: 'Proyectos destacados',
    todosTitulo: 'Todos los proyectos',
  },
  destacados: [],
  pie: { mostrar: true, titulo: 'FEXCOIN ECUANA V5 · UAP 2026', descripcion: '¡Te esperamos en la feria!' },
  traducciones: {},
};

const copiar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
/** Texto no vacío o el valor por defecto. */
const texto = (v: unknown, defecto: string) => (typeof v === 'string' && v.trim() ? v.trim() : defecto);
/** Texto tal cual (puede quedar vacío a propósito); si no es texto, el valor por defecto. */
const opcional = (v: unknown, defecto: string) => (typeof v === 'string' ? v.trim() : defecto);
const booleano = (v: unknown, defecto: boolean) => (typeof v === 'boolean' ? v : defecto);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function seccion<T extends SeccionCompleta>(crudo: unknown, defecto: T): T {
  const s = objeto(crudo);
  return { ...copiar(defecto), mostrar: booleano(s.mostrar, defecto.mostrar), titulo: texto(s.titulo, defecto.titulo), descripcion: opcional(s.descripcion, defecto.descripcion) };
}

function foto(crudo: unknown): FotoPortada | null {
  const f = objeto(crudo);
  if (typeof f.url !== 'string' || !f.url) return null;
  return {
    alto: Number(f.alto) || undefined, ancho: Number(f.ancho) || undefined, nombre: typeof f.nombre === 'string' ? f.nombre : undefined,
    texto: typeof f.texto === 'string' ? f.texto : '', url: f.url, urlPequena: typeof f.urlPequena === 'string' ? f.urlPequena : undefined,
  };
}

function medio(crudo: unknown): MedioPortada | null {
  const m = objeto(crudo);
  const base = foto(m);
  if (!base) return null;
  const tipo = m.tipo === 'video' || m.tipo === 'enlace' ? m.tipo : 'foto';
  if (tipo === 'enlace' && !analizarEnlace(base.url)) return null;
  return { ...base, portada: tipo === 'foto' ? undefined : foto(m.portada), tipo, vertical: tipo === 'foto' ? undefined : Boolean(m.vertical) };
}

/** Mezcla lo configurado con los valores por defecto, descartando lo mal formado. Lee el formato 1. */
export function normalizarPortada(cruda: null | PortadaFeria | undefined): PortadaCompleta {
  const p = objeto(cruda) as PortadaFeria;
  const d = PORTADA_DEFECTO;
  const dias = Array.isArray(p.dias)
    ? p.dias.filter((x: DiaPortada) => x && FECHA.test(String(x.fecha)) && typeof x.titulo === 'string').map((x) => ({
      descripcion: typeof x.descripcion === 'string' ? x.descripcion : '',
      destacado: Boolean(x.destacado),
      fecha: x.fecha,
      items: Array.isArray(x.items) ? x.items.filter((i) => typeof i === 'string' && i.trim()) : [],
      nota: typeof x.nota === 'string' ? x.nota : '',
      titulo: x.titulo,
    }))
    : [];

  const hero = seccion(p.hero, d.hero);
  const h = objeto(p.hero);
  hero.tituloRojo = opcional(h.tituloRojo, d.hero.tituloRojo);
  hero.lema = opcional(h.lema, d.hero.lema);
  hero.frase = opcional(h.frase, d.hero.frase);
  hero.contador = booleano(h.contador, d.hero.contador);
  // Formato 1: eslogan con una parte en rojo → dos líneas (la roja empieza en la parte resaltada).
  if (!p.hero && typeof p.eslogan === 'string' && p.eslogan.trim()) {
    const e = p.eslogan.trim();
    const i = p.resaltado ? e.toUpperCase().indexOf(p.resaltado.trim().toUpperCase()) : -1;
    hero.titulo = i > 0 ? e.slice(0, i).trim() : e;
    hero.tituloRojo = i > 0 ? e.slice(i).trim() : '';
  }
  if (!p.hero && typeof p.subtitulo === 'string' && p.subtitulo.trim()) hero.descripcion = p.subtitulo.trim();

  const proyectos = seccion(p.proyectos, d.proyectos);
  const pr = objeto(p.proyectos);
  proyectos.publicar = booleano(pr.publicar, d.proyectos.publicar);
  proyectos.preparandoTitulo = texto(pr.preparandoTitulo, d.proyectos.preparandoTitulo);
  proyectos.preparandoTexto = opcional(pr.preparandoTexto, d.proyectos.preparandoTexto);
  proyectos.cifra = opcional(pr.cifra, d.proyectos.cifra);
  proyectos.categorias = Array.isArray(pr.categorias)
    ? pr.categorias.filter((c): c is string => typeof c === 'string' && Boolean(c.trim())).map((c) => c.trim())
    : [...d.proyectos.categorias];
  proyectos.destacadosTitulo = texto(pr.destacadosTitulo, d.proyectos.destacadosTitulo);
  proyectos.todosTitulo = texto(pr.todosTitulo, d.proyectos.todosTitulo);

  const m = objeto(p.mapa);
  const mapa: MapaPortada = {
    publicar: booleano(m.publicar, d.mapa.publicar),
    titulo: texto(m.titulo, d.mapa.titulo),
    texto: texto(m.texto, d.mapa.texto),
  };

  const medios = Array.isArray(p.medios)
    ? p.medios.map(medio).filter((m): m is MedioPortada => Boolean(m))
    : (Array.isArray(p.fotos) ? p.fotos.map(foto).filter((f): f is FotoPortada => Boolean(f)).map((f) => ({ ...f, tipo: 'foto' as const })) : []);

  return {
    acciones: seccion(p.acciones, d.acciones),
    agenda: seccion(p.agenda, d.agenda),
    destacados: Array.isArray(p.destacados) ? p.destacados.filter((n) => Number.isInteger(n)) : [],
    dias: dias.length ? dias : copiar(d.dias),
    galeria: seccion(p.galeria, d.galeria),
    hero,
    horario: texto(p.horario, d.horario),
    inicio: typeof p.inicio === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.inicio) ? p.inicio : d.inicio,
    lugar: texto(p.lugar, d.lugar),
    mapa,
    medios,
    organiza: texto(p.organiza, d.organiza),
    pie: seccion(p.pie, d.pie),
    proyectos,
    // Se lee tal cual: `leerRuta` solo toma textos; el editor las limpia al guardar.
    traducciones: objeto(p.traducciones) as PortadaCompleta['traducciones'],
  };
}

/** JSON que se guarda (formato 2). El editor limpia antes las traducciones (`traduccionesLimpias`). */
export function portadaParaGuardar(p: PortadaCompleta): PortadaFeria {
  const c = copiar(p);
  return { ...c, dias: [...c.dias].sort((a, b) => a.fecha.localeCompare(b.fecha)), version: 2 };
}

// ------------------------------------------------------------------ idiomas

/** Un texto traducible de la portada: dónde va en `traducciones.{en,pt}` y su español (el editor le pone nombre). */
export interface CampoTexto {
  seccion: ClaveSeccion;
  /** Camino dentro de `TextosPortada` (p. ej. `['dias', '2026-11-14', 'items', '1']`). */
  ruta: string[];
  es: string;
  largo: boolean;
  /** Escribe el texto mostrado en una copia de la portada. */
  fijar: (p: PortadaCompleta, v: string) => void;
}

type Textos = Record<string, string>;
const LARGOS = /descripcion|nota|organiza|[tT]exto/;

/** Todos los textos traducibles, en el orden del editor (los vacíos en español no cuentan). */
export function camposTexto(p: PortadaCompleta): CampoTexto[] {
  const campos: CampoTexto[] = [];
  const agregar = (seccion: ClaveSeccion, ruta: string[], es: string, fijar: CampoTexto['fijar']) => {
    if (es.trim()) campos.push({ es, fijar, largo: LARGOS.test(ruta.at(-1)!), ruta, seccion });
  };
  const grupo = (seccion: ClaveSeccion, clave: 'acciones' | 'agenda' | 'galeria' | 'hero' | 'mapa' | 'pie' | 'proyectos', claves = ['titulo', 'descripcion']) => {
    for (const k of claves) agregar(seccion, [clave, k], (p[clave] as unknown as Textos)[k] ?? '', (q, v) => { (q[clave] as unknown as Textos)[k] = v; });
  };
  agregar('general', ['horario'], p.horario, (q, v) => { q.horario = v; });
  agregar('general', ['organiza'], p.organiza, (q, v) => { q.organiza = v; });
  grupo('hero', 'hero', ['titulo', 'tituloRojo', 'lema', 'frase', 'descripcion']);
  grupo('galeria', 'galeria');
  p.medios.forEach((m, i) => agregar('galeria', ['medios', m.url], m.texto ?? '', (q, v) => { q.medios[i]!.texto = v; }));
  grupo('acciones', 'acciones');
  grupo('acciones', 'mapa', ['titulo', 'texto']);
  grupo('agenda', 'agenda');
  p.dias.forEach((d, i) => {
    const r = ['dias', d.fecha];
    agregar('agenda', [...r, 'titulo'], d.titulo, (q, v) => { q.dias[i]!.titulo = v; });
    agregar('agenda', [...r, 'descripcion'], d.descripcion, (q, v) => { q.dias[i]!.descripcion = v; });
    d.items.forEach((it, j) => agregar('agenda', [...r, 'items', String(j)], it, (q, v) => { q.dias[i]!.items[j] = v; }));
    agregar('agenda', [...r, 'nota'], d.nota, (q, v) => { q.dias[i]!.nota = v; });
  });
  grupo('proyectos', 'proyectos', ['titulo', 'descripcion', 'preparandoTitulo', 'preparandoTexto', 'destacadosTitulo', 'todosTitulo']);
  grupo('pie', 'pie');
  return campos;
}

/** Valor en `traducciones.{en,pt}` siguiendo una ruta (o `undefined`). */
export function leerRuta(raiz: unknown, ruta: string[]): string | undefined {
  let v: unknown = raiz;
  for (const k of ruta) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return typeof v === 'string' ? v : undefined;
}
/** Portada lista para mostrarse en `i` (en español la misma). */
export function traducirPortada(p: PortadaCompleta, i: Idioma): PortadaCompleta {
  if (i === 'es') return p;
  const q = copiar(p);
  const propias = p.traducciones[i];
  for (const c of camposTexto(q)) {
    const suya = leerRuta(propias, c.ruta)?.trim();
    c.fijar(q, suya || fraseTraducida(c.es, i) || c.es);
  }
  return q;
}

/** Valores por defecto de una sección (para «Restablecer esta sección»). */
export function seccionDefecto(p: PortadaCompleta, clave: ClaveSeccion): PortadaCompleta {
  const d = copiar(PORTADA_DEFECTO);
  const n = copiar(p);
  if (clave === 'general') return { ...n, dias: n.dias, horario: d.horario, inicio: d.inicio, lugar: d.lugar, organiza: d.organiza };
  if (clave === 'galeria') return { ...n, galeria: d.galeria };
  if (clave === 'agenda') return { ...n, agenda: d.agenda, dias: d.dias };
  if (clave === 'proyectos') return { ...n, proyectos: d.proyectos };
  if (clave === 'acciones') return { ...n, acciones: d.acciones, mapa: d.mapa };
  return { ...n, [clave]: d[clave] };
}

// ------------------------------------------------------------------ galería

export interface EnlaceVideo {
  plataforma: 'facebook' | 'youtube';
  vertical: boolean;
  /** URL del reproductor incrustado (solo se carga al tocar ▶). */
  incrustar: string;
}

/** Reconoce un enlace de Facebook (reel/video) o YouTube; `null` si no es ninguno. */
export function analizarEnlace(crudo: string): EnlaceVideo | null {
  let u: URL;
  try { u = new URL(crudo.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|web|mbasic)\./, '');
  if (host === 'facebook.com' || host === 'fb.watch') {
    const ruta = u.pathname;
    const esVideo = host === 'fb.watch' || /^\/(reel|watch|share\/[rv])\/?/.test(ruta) || /\/videos\//.test(ruta) || ruta === '/video.php' || Boolean(u.searchParams.get('v'));
    if (!esVideo) return null;
    const limpia = host === 'fb.watch' ? u.href : `https://www.facebook.com${ruta}${u.searchParams.get('v') ? `?v=${u.searchParams.get('v')}` : ''}`;
    const vertical = /^\/(reel|share\/r)\//.test(ruta);
    return {
      incrustar: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(limpia)}&show_text=false&autoplay=true`,
      plataforma: 'facebook', vertical,
    };
  }
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'music.youtube.com'].includes(host)) {
    let id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? '';
    const m = /^\/(shorts|embed|live)\/([\w-]{11})/.exec(u.pathname);
    if (m) id = m[2]!;
    id = id.split('/')[0] ?? '';
    if (!/^[\w-]{11}$/.test(id)) return null;
    return {
      incrustar: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`,
      plataforma: 'youtube', vertical: m?.[1] === 'shorts',
    };
  }
  return null;
}

/** Medio listo para la galería: imagen a mostrar (foto o portada del video) y qué reproducir al tocar ▶. */
export interface MedioListo {
  clave: string;
  tipo: MedioPortada['tipo'];
  /** Imagen grande y liviana; vacías = video sin portada (fondo sobrio). */
  grande: string;
  pequena: string;
  ancho: number;
  alto: number;
  texto: string;
  reproducir: null | { iframe: boolean; plataforma: 'archivo' | 'facebook' | 'youtube'; url: string; vertical: boolean };
}

const BASE = import.meta.env.BASE_URL;
/** Sin medios subidos: el recorte del afiche y el reel oficial de la feria. */
export const MEDIOS_DEFECTO: MedioPortada[] = [
  {
    alto: 660, ancho: 1000, texto: 'FEXCOIN ECUANA V5.0 · Nosotros: investigamos, innovamos y transformamos', tipo: 'foto',
    url: `${BASE}fexcoin/portada-afiche.webp`, urlPequena: `${BASE}fexcoin/portada-afiche-p.webp`,
  },
  { texto: 'FEXCOIN en video', tipo: 'enlace', url: 'https://www.facebook.com/reel/1637254991180398', vertical: true },
];

export function mediosListos(p: PortadaCompleta): MedioListo[] {
  const lista = p.medios.length ? p.medios : MEDIOS_DEFECTO;
  return lista.map((m, i) => {
    const imagen = m.tipo === 'foto' ? m : m.portada ?? null;
    let reproducir: MedioListo['reproducir'] = null;
    if (m.tipo === 'video') reproducir = { iframe: false, plataforma: 'archivo', url: resolverUrlApi(m.url), vertical: Boolean(m.vertical) };
    if (m.tipo === 'enlace') {
      const e = analizarEnlace(m.url);
      if (e) reproducir = { iframe: true, plataforma: e.plataforma, url: e.incrustar, vertical: e.vertical };
    }
    return {
      alto: imagen?.alto ?? 0, ancho: imagen?.ancho ?? 0, clave: `${i}:${m.url}`,
      grande: imagen ? resolverUrlApi(imagen.url) : '', pequena: imagen ? resolverUrlApi(imagen.urlPequena || imagen.url) : '',
      reproducir, texto: (p.medios.length ? m.texto : m.texto && fraseTraducida(m.texto)) || m.texto || '', tipo: m.tipo,
    };
  }).filter((m) => m.tipo === 'foto' ? Boolean(m.grande) : Boolean(m.reproducir));
}

// ------------------------------------------------------------------ fechas

/** Fecha local de `yyyy-MM-dd` (sin desfase de zona horaria). */
export function diaLocal(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a!, (m ?? 1) - 1, d ?? 1);
}

/** Hora de cierre de cada día, tomada del horario («15:00 a 23:00») o 23:59. */
export function horaCierre(horario: string): [number, number] {
  const horas = [...horario.matchAll(/(\d{1,2}):(\d{2})/g)];
  const fin = horas[1] ?? null;
  return fin ? [Number(fin[1]), Number(fin[2])] : [23, 59];
}

export type FaseFeria = 'antes' | 'despues' | 'durante';

/** Antes del inicio, durante (desde el inicio hasta el cierre del último día) o después. */
export function faseFeria(p: PortadaCompleta, ahora: number): FaseFeria {
  const inicio = new Date(p.inicio).getTime();
  const ultimo = p.dias.at(-1)?.fecha ?? p.inicio.slice(0, 10);
  const [h, m] = horaCierre(p.horario);
  const fin = diaLocal(ultimo);
  fin.setHours(h, m, 0, 0);
  if (Number.isFinite(inicio) && ahora < inicio) return 'antes';
  return ahora > fin.getTime() ? 'despues' : 'durante';
}

export const mismoDia = (fecha: string, ahora: number) => {
  const d = diaLocal(fecha);
  const h = new Date(ahora);
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
};

/** «13 y 14 nov» o «13 nov» (en inglés «Nov 13–14», en portugués «13 e 14 de nov.»). */
export const rangoDias = (p: PortadaCompleta, i: Idioma = idioma.value) => rangoFechas(p.dias.map((d) => diaLocal(d.fecha)), i);

/** Primera parte del horario («15:00 a 23:00»). */
export const horaCorta = (p: PortadaCompleta) => p.horario.split('·')[0]!.trim();

/** «● EN VIVO», «Faltan 3 días», «Hoy desde 15:00», «Mañana 15:00», «Finalizada» (en el idioma que se ve). */
export function pastillaFeria(p: PortadaCompleta, ahora: number): { clase: 'fin' | 'pronto' | 'vivo'; texto: string } {
  const fase = faseFeria(p, ahora);
  if (fase === 'durante') return { clase: 'vivo', texto: t('EN VIVO') };
  if (fase === 'despues') return { clase: 'fin', texto: t('Finalizada') };
  const inicio = new Date(p.inicio).getTime();
  const h = horaInicio(p);
  if (new Date(inicio).toDateString() === new Date(ahora).toDateString()) return { clase: 'pronto', texto: t('Hoy desde {hora}', { hora: h }) };
  const dias = Math.ceil((inicio - ahora) / 86_400_000);
  return { clase: 'pronto', texto: dias <= 1 ? t('Mañana {hora}', { hora: h }) : t('Falta {n} día|Faltan {n} días', { n: dias }) };
}

/** Hora de inicio («15:00»; «3:00 PM» en inglés). */
export const horaInicio = (p: PortadaCompleta) => hora(p.inicio.slice(11, 16));
