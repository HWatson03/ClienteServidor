import * as L from 'leaflet';

/**
 * Teselas del mapa público servidas por SEMFA (`/api/feria/publico/teselas/{z}/{x}/{y}.png`):
 * el backend las baja una vez de OSM, las guarda en disco y las sirve con caché de 7 días, así
 * cientos de celulares en la feria no dependen de OSM ni gastan la red saturada dos veces.
 *
 * - 404 = fuera del área del mapa: la tesela queda vacía (no se pide a OSM).
 * - 502 o sin red con el servidor: se pide esa tesela a OSM directo, como respaldo.
 * `fetch` (y no `<img>`) para distinguir el 404; el navegador igual aplica su caché HTTP.
 */
export class CapaTeselasFeria extends L.GridLayer {
  constructor(private readonly base: string, opciones?: L.GridLayerOptions) {
    super(opciones);
  }

  override createTile(coords: L.Coords, listo: L.DoneCallback): HTMLElement {
    const img = document.createElement('img');
    img.alt = '';
    img.setAttribute('role', 'presentation');
    img.decoding = 'async';
    const { x, y, z } = coords;
    const respaldo = () => {
      img.onload = () => listo(undefined, img);
      img.onerror = () => listo(new Error('Sin cartografía'), img);
      img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    };
    fetch(`${this.base}/${z}/${x}/${y}.png`, { credentials: 'omit' })
      .then(async (r) => {
        if (r.status === 404) { listo(undefined, img); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const url = URL.createObjectURL(await r.blob());
        img.onload = () => { URL.revokeObjectURL(url); listo(undefined, img); };
        img.onerror = () => { URL.revokeObjectURL(url); respaldo(); };
        img.src = url;
      })
      .catch(respaldo);
    return img;
  }
}
