import type { ReferenciaDanza, ReferenciaDanzaRequest } from '#/api/seguimiento-danzas';

import * as L from 'leaflet';

/** Tamaño en metros: diámetro del círculo, ancho/alto del rectángulo o lado del triángulo. */
export function verticesReferencia(r: ReferenciaDanzaRequest): L.LatLngTuple[] {
  const lat = r.latitud;
  const lon = r.longitud;
  const latPorMetro = 1 / 111_320;
  const lonPorMetro = 1 / (111_320 * Math.cos(lat * Math.PI / 180));
  const mitad = r.tamanoMetros / 2;
  if (r.figura === 'RECTANGULO') {
    const medioAlto = (r.altoMetros ?? r.tamanoMetros) / 2;
    return [
      [lat + medioAlto * latPorMetro, lon - mitad * lonPorMetro],
      [lat + medioAlto * latPorMetro, lon + mitad * lonPorMetro],
      [lat - medioAlto * latPorMetro, lon + mitad * lonPorMetro],
      [lat - medioAlto * latPorMetro, lon - mitad * lonPorMetro],
    ];
  }
  const alto = r.tamanoMetros * Math.sqrt(3) / 2;
  return [
    [lat + (alto * 2 / 3) * latPorMetro, lon],
    [lat - (alto / 3) * latPorMetro, lon + mitad * lonPorMetro],
    [lat - (alto / 3) * latPorMetro, lon - mitad * lonPorMetro],
  ];
}

export function dibujarReferencia(r: ReferenciaDanza | ReferenciaDanzaRequest,
                                   capa: L.LayerGroup, borrador = false) {
  const opciones: L.PathOptions = {
    color: borrador ? '#f97316' : '#7c3aed', weight: 3,
    fillColor: borrador ? '#fb923c' : '#a78bfa', fillOpacity: 0.26,
    dashArray: borrador ? '6 5' : undefined,
    interactive: !borrador,
    bubblingMouseEvents: false,
  };
  const figura = r.figura === 'CIRCULO'
    ? L.circle([r.latitud, r.longitud], { ...opciones, radius: r.tamanoMetros / 2 })
    : L.polygon(verticesReferencia(r), opciones);
  figura.addTo(capa);
  const etiqueta = document.createElement('span');
  etiqueta.textContent = r.nombre;
  if (!borrador) figura.bindPopup(etiqueta);
  return figura;
}
