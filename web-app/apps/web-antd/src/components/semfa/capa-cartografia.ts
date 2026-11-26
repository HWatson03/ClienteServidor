import * as L from 'leaflet';

/** Mosaicos OSM como fondos: Firefox conserva el mapa al cambiar capas SVG. */
export class CapaCartografia extends L.GridLayer {
  override createTile(coords: L.Coords, listo: L.DoneCallback): HTMLElement {
    const celda = document.createElement('div');
    celda.className = 'semfa-tesela';
    celda.style.backgroundPosition = 'center';
    celda.style.backgroundRepeat = 'no-repeat';
    celda.style.backgroundSize = '100% 100%';
    const url = `https://tile.openstreetmap.org/${coords.z}/${coords.x}/${coords.y}.png`;
    const imagen = new Image();
    imagen.onload = () => {
      celda.style.backgroundImage = `url("${url}")`;
      listo(undefined, celda);
    };
    imagen.onerror = () => listo(new Error('No se pudo cargar la cartografía'), celda);
    imagen.src = url;
    return celda;
  }
}

export const ATRIBUCION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
