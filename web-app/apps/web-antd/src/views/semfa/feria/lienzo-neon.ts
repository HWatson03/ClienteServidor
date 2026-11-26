import * as L from 'leaflet';

/** Opciones de una figura con brillo (ver {@link LienzoNeon}). */
export interface OpcionesNeon extends L.PolylineOptions {
  /** Radio del brillo en píxeles; 0 o ausente = sin brillo. */
  brillo?: number;
}

/**
 * Renderer canvas de Leaflet que dibuja el borde de las figuras con brillo
 * (`shadowBlur` del canvas): un contorno «fluorescente» sin un elemento del DOM
 * ni un filtro CSS por stand, así 400 stands se mueven fluidos en un celular.
 * Solo se dibuja al terminar de mover o hacer zoom, como cualquier canvas de Leaflet.
 */
export class LienzoNeon extends L.Canvas {
  // `_fillStroke` es interno de Leaflet 1.9 (no está en los tipos): pinta relleno y borde de cada figura.
  _fillStroke(ctx: CanvasRenderingContext2D, capa: L.Path) {
    const o = capa.options as OpcionesNeon;
    const base = (L.Canvas.prototype as unknown as { _fillStroke: (c: CanvasRenderingContext2D, l: L.Path) => void })._fillStroke;
    if (!o.brillo || o.stroke === false) {
      base.call(this, ctx, capa);
      return;
    }
    // Relleno sin brillo; luego el borde dos veces: el halo difuso y la línea nítida encima.
    const borde = o.stroke;
    o.stroke = false;
    base.call(this, ctx, capa);
    o.stroke = borde;
    const relleno = o.fill;
    o.fill = false;
    ctx.save();
    ctx.shadowColor = o.color ?? '#fff';
    ctx.shadowBlur = o.brillo;
    base.call(this, ctx, capa);
    ctx.restore();
    base.call(this, ctx, capa);
    o.fill = relleno;
  }
}
