/**
 * Rectángulos en metros sobre Leaflet (stands y zonas de la feria) y una capa canvas con sus
 * etiquetas. Lo comparten el editor (`views/semfa/feria/editor.vue`) y la pantalla pública.
 *
 * Convención: un rectángulo es su centro (lat, lng), `ancho` (eje este-oeste antes de rotar),
 * `alto` (eje norte-sur) en metros y `rotacion` en grados, en sentido horario.
 * Metros → grados: 1° de latitud ≈ 111 320 m; 1° de longitud ≈ 111 320 · cos(lat) m (a la escala
 * de un campus el error es despreciable).
 */
import * as L from 'leaflet';

export const METROS_POR_GRADO = 111_320;

export interface RectMetros { lat: number; lng: number; ancho: number; alto: number; rotacion: number }
export interface Metros { e: number; n: number }

const RAD = Math.PI / 180;

/** Gira un vector local (x hacia el este, y hacia el norte) `grados` en sentido horario. */
export function rotar(x: number, y: number, grados: number): Metros {
  const t = grados * RAD;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { e: x * c + y * s, n: -x * s + y * c };
}

/** Punto a `e` metros al este y `n` al norte de (lat, lng). */
export function desplazar(lat: number, lng: number, e: number, n: number): L.LatLngTuple {
  return [lat + n / METROS_POR_GRADO, lng + e / (METROS_POR_GRADO * Math.cos(lat * RAD))];
}

/** Metros al este/norte de (lat, lng) hasta (lat2, lng2). */
export function diferenciaMetros(lat: number, lng: number, lat2: number, lng2: number): Metros {
  return { e: (lng2 - lng) * METROS_POR_GRADO * Math.cos(lat * RAD), n: (lat2 - lat) * METROS_POR_GRADO };
}

/** Esquinas (sup. izq., sup. der., inf. der., inf. izq.) del rectángulo rotado. */
export function esquinasRect(r: RectMetros): L.LatLngTuple[] {
  const a = r.ancho / 2;
  const h = r.alto / 2;
  return ([[-a, h], [a, h], [a, -h], [-a, -h]] as const).map(([x, y]) => {
    const d = rotar(x, y, r.rotacion);
    return desplazar(r.lat, r.lng, d.e, d.n);
  });
}

/** Metros que cubre un píxel de pantalla a esa latitud y zoom (Web Mercator). */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (40_075_016.686 * Math.abs(Math.cos(lat * RAD))) / 2 ** (zoom + 8);
}

/** Lleva un ángulo a (-180, 180]. */
export function normalizarAngulo(grados: number): number {
  let g = grados % 360;
  if (g > 180) g -= 360;
  if (g <= -180) g += 360;
  return Math.round(g * 10) / 10;
}

export interface EtiquetaMapa extends RectMetros {
  texto: string;
  /** `zona`: texto grande en mayúsculas con halo; `stand`: número dentro del rectángulo. */
  tipo: 'stand' | 'zona';
  color?: string;
  /** Evaluado: añade ✓ (y si el texto no cabe, queda solo el ✓). */
  marca?: boolean;
  oculta?: boolean;
  /** Contorno del texto de una zona (blanco por defecto; oscuro sobre cartografía oscura). */
  halo?: string;
}

/**
 * Etiquetas dibujadas en un único canvas (una sola capa del DOM para cientos de stands, en vez
 * de un marcador por stand). Se redibuja al terminar cada movimiento o zoom y solo para lo
 * visible; el tamaño de letra sale del tamaño real del rectángulo en pantalla, así que los números
 * aparecen solos cuando el zoom los deja leer.
 */
export class CapaEtiquetas extends L.Layer {
  private lienzo?: HTMLCanvasElement;
  private items: EtiquetaMapa[] = [];
  private cuadro = 0;

  override onAdd(mapa: L.Map): this {
    if (!mapa.getPane('semfaEtiquetas')) {
      const panel = mapa.createPane('semfaEtiquetas');
      panel.style.zIndex = '450';
      panel.style.pointerEvents = 'none';
    }
    this.lienzo = L.DomUtil.create('canvas', 'semfa-etiquetas', mapa.getPane('semfaEtiquetas'));
    this.lienzo.style.pointerEvents = 'none';
    mapa.on('moveend zoomend resize viewreset', this.programar, this);
    mapa.on('zoomstart', this.ocultar, this);
    mapa.on('zoom', this.alZoom, this);
    this.programar();
    return this;
  }

  override onRemove(mapa: L.Map): this {
    mapa.off('moveend zoomend resize viewreset', this.programar, this);
    mapa.off('zoomstart', this.ocultar, this);
    mapa.off('zoom', this.alZoom, this);
    if (this.cuadro) cancelAnimationFrame(this.cuadro);
    this.cuadro = 0;
    this.lienzo?.remove();
    this.lienzo = undefined;
    return this;
  }

  fijar(items: EtiquetaMapa[]) {
    this.items = items;
    this.programar();
  }

  /** Redibuja en el próximo cuadro (varias llamadas seguidas cuestan un solo dibujo). */
  programar() {
    if (this.cuadro || !this.lienzo || (this._map as L.Map & { _animatingZoom?: boolean })?._animatingZoom) return;
    this.cuadro = requestAnimationFrame(() => {
      this.cuadro = 0;
      this.dibujar();
    });
  }

  /**
   * Durante `flyTo` (buscar un proyecto) el mapa cambia de zoom cuadro a cuadro sin la
   * animación CSS: se redibuja en el mismo cuadro para que los números acompañen a los
   * stands en vez de quedarse quietos y saltar al final. En el zoom animado (rueda,
   * pellizco, botones) sigue oculto hasta `zoomend`.
   */
  private alZoom() {
    const mapa = this._map as L.Map & { _animatingZoom?: boolean };
    if (!mapa || mapa._animatingZoom) return;
    if (this.cuadro) { cancelAnimationFrame(this.cuadro); this.cuadro = 0; }
    this.dibujar();
  }

  private ocultar() {
    if (this.lienzo) this.lienzo.style.visibility = 'hidden';
  }

  private dibujar() {
    const mapa = this._map;
    const lienzo = this.lienzo;
    if (!mapa || !lienzo) return;
    const tam = mapa.getSize();
    // Margen: al arrastrar el mapa las etiquetas cercanas ya están dibujadas.
    const mx = Math.round(tam.x * 0.3);
    const my = Math.round(tam.y * 0.3);
    const ancho = tam.x + mx * 2;
    const alto = tam.y + my * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (lienzo.width !== Math.round(ancho * dpr) || lienzo.height !== Math.round(alto * dpr)) {
      lienzo.width = Math.round(ancho * dpr);
      lienzo.height = Math.round(alto * dpr);
      lienzo.style.width = `${ancho}px`;
      lienzo.style.height = `${alto}px`;
    }
    L.DomUtil.setPosition(lienzo, mapa.containerPointToLayerPoint([-mx, -my]));
    lienzo.style.visibility = '';
    const ctx = lienzo.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const mpp = metrosPorPixel(mapa.getCenter().lat, mapa.getZoom());
    const familia = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    for (const it of this.items) {
      if (it.oculta || !it.texto && !it.marca) continue;
      const p = mapa.latLngToContainerPoint([it.lat, it.lng]);
      const x = p.x + mx;
      const y = p.y + my;
      if (x < -60 || y < -60 || x > ancho + 60 || y > alto + 60) continue;
      const pxAncho = it.ancho / mpp;
      const pxAlto = it.alto / mpp;
      const pxMin = Math.min(pxAncho, pxAlto);
      // Ancho útil para el texto: horizontal si está casi derecho, el lado menor si está girado.
      const recto = Math.abs(Math.sin(it.rotacion * RAD)) < 0.35;
      const disponible = recto ? pxAncho : Math.max(pxMin, Math.abs(Math.sin(it.rotacion * RAD)) > 0.94 ? pxAlto : pxMin);
      if (it.tipo === 'zona') {
        let fuente = Math.min(20, Math.max(pxMin * 0.3, 0));
        const texto = it.texto.toUpperCase();
        ctx.font = `900 ${fuente}px ${familia}`;
        const medida = ctx.measureText(texto).width;
        if (medida > disponible * 0.92) fuente *= (disponible * 0.92) / medida;
        if (fuente < 8) continue;
        ctx.font = `900 ${fuente}px ${familia}`;
        ctx.lineWidth = Math.max(2, fuente / 4);
        ctx.strokeStyle = it.halo ?? 'rgba(255,255,255,.92)';
        ctx.strokeText(texto, x, y);
        ctx.fillStyle = it.color ?? '#1e293b';
        ctx.fillText(texto, x, y);
        continue;
      }
      let fuente = Math.min(15, pxMin * 0.5);
      const texto = it.marca && it.texto ? `✓${it.texto}` : it.texto;
      ctx.font = `800 ${fuente}px ${familia}`;
      const medida = texto ? ctx.measureText(texto).width : 0;
      if (medida > disponible * 0.9) fuente *= (disponible * 0.9) / medida;
      ctx.fillStyle = it.color ?? '#fff';
      ctx.strokeStyle = it.color === '#fff' || !it.color ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.75)';
      if (texto && fuente >= 7) {
        ctx.font = `800 ${fuente}px ${familia}`;
        ctx.lineWidth = Math.max(1.5, fuente / 5);
        ctx.strokeText(texto, x, y);
        ctx.fillText(texto, x, y);
      } else if (it.marca && pxMin >= 6) {
        const f = Math.min(14, pxMin * 0.8);
        ctx.font = `900 ${f}px ${familia}`;
        ctx.lineWidth = Math.max(1.5, f / 5);
        ctx.strokeText('✓', x, y);
        ctx.fillText('✓', x, y);
      }
    }
  }
}
