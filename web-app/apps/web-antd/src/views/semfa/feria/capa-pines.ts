import * as L from 'leaflet';

import { metrosPorPixel } from '#/components/semfa/mapa-stands';

export interface PinStand {
  id: number;
  lat: number;
  lng: number;
  /** Lado menor del stand en metros: si en pantalla mide ≥ `MIN_RECT_PX`, ya se ve el rectángulo. */
  lado: number;
  color: string;
  texto: string;
  seleccionado: boolean;
  oculto: boolean;
}

/** Desde este tamaño en pantalla el rectángulo y su número se leen solos (sin pin). */
const MIN_RECT_PX = 16;
/** Con más pines visibles que esto se amontonan: se dibujan puntos. */
const MAX_PINES = 140;
const RADIO = 11;
const ALTO_PIN = 30;

/**
 * Pines numerados (color sólido, borde blanco fino y sombra suave) para los stands que a ese zoom quedan demasiado pequeños, dibujados
 * en un único canvas (sin un marcador del DOM por stand) al terminar cada movimiento. No recibe
 * eventos: la vista pregunta con `buscar()` qué pin hay bajo un toque.
 */
export class CapaPines extends L.Layer {
  private lienzo?: HTMLCanvasElement;
  private items: PinStand[] = [];
  private cuadro = 0;
  private modo: 'nada' | 'pines' | 'puntos' = 'nada';

  override onAdd(mapa: L.Map): this {
    if (!mapa.getPane('fxPines')) {
      const panel = mapa.createPane('fxPines');
      panel.style.zIndex = '460';
      panel.style.pointerEvents = 'none';
    }
    this.lienzo = L.DomUtil.create('canvas', 'fx-pines', mapa.getPane('fxPines'));
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

  fijar(items: PinStand[]) {
    this.items = items;
    this.programar();
  }

  programar() {
    if (this.cuadro || !this.lienzo || (this._map as L.Map & { _animatingZoom?: boolean })?._animatingZoom) return;
    this.cuadro = requestAnimationFrame(() => { this.cuadro = 0; this.dibujar(); });
  }

  /** Stand cuyo pin (o punto) está bajo ese punto del contenedor del mapa, o `null`. */
  buscar(punto: L.Point): null | number {
    const mapa = this._map;
    if (!mapa || this.modo === 'nada') return null;
    let mejor: null | number = null;
    let distancia = this.modo === 'pines' ? RADIO + 6 : 12;
    for (const it of this.visibles()) {
      const p = mapa.latLngToContainerPoint([it.lat, it.lng]);
      const cy = this.modo === 'pines' ? p.y - ALTO_PIN + RADIO : p.y;
      const d = Math.hypot(p.x - punto.x, cy - punto.y);
      if (d < distancia) { distancia = d; mejor = it.id; }
    }
    return mejor;
  }

  private visibles() {
    const mapa = this._map;
    const mpp = metrosPorPixel(mapa.getCenter().lat, mapa.getZoom());
    const marco = mapa.getBounds().pad(0.3);
    return this.items.filter((it) => !it.oculto && it.lado / mpp < MIN_RECT_PX && marco.contains([it.lat, it.lng]));
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
    const lista = this.visibles();
    this.modo = lista.length === 0 ? 'nada' : lista.length > MAX_PINES ? 'puntos' : 'pines';
    // El seleccionado al final: queda encima de los demás.
    lista.sort((a, b) => Number(a.seleccionado) - Number(b.seleccionado) || b.lat - a.lat);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of lista) {
      const p = mapa.latLngToContainerPoint([it.lat, it.lng]);
      const x = p.x + mx;
      const y = p.y + my;
      // Sombra oscura y corta (no halo de color): se despega del mapa sin «brillar».
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowOffsetY = 1;
      if (this.modo === 'puntos') {
        ctx.shadowBlur = 2;
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(x, y, it.seleccionado ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const r = it.seleccionado ? RADIO + 3 : RADIO;
      const cy = y - ALTO_PIN + RADIO;
      // Gota: círculo con punta hacia el stand.
      ctx.shadowBlur = 4;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - r * 0.62, cy + r * 0.78);
      ctx.arc(x, cy, r, Math.PI * 0.72, Math.PI * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      const texto = it.texto.length > 4 ? it.texto.slice(-4) : it.texto;
      ctx.font = `800 ${texto.length > 2 ? 8.5 : 11}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
      ctx.fillText(texto, x, cy + 0.5);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}
