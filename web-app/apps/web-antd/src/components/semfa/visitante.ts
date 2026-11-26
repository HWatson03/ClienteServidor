/**
 * Identificador anónimo y al azar de este navegador para contar visitantes únicos de las
 * pantallas públicas (`/en-vivo`, `/feria`). No es un dato personal: se crea una vez y se guarda
 * en `localStorage`, así recargar o volver otro día no cuenta de nuevo. En modo incógnito o con el
 * almacenamiento bloqueado dura lo que la pestaña (`sessionStorage`).
 */
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function nuevoUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** `clave` distinta por pantalla (cada una lleva su propio contador). */
export function idVisitante(clave: string): string {
  for (const almacen of [() => localStorage, () => sessionStorage]) {
    try {
      const guardado = almacen().getItem(clave);
      if (guardado && FORMATO_UUID.test(guardado)) return guardado;
      const nuevo = nuevoUuid();
      almacen().setItem(clave, nuevo);
      return nuevo;
    } catch { /* almacenamiento bloqueado: se prueba el siguiente */ }
  }
  return nuevoUuid();
}
