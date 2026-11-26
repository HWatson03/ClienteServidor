import 'vue-router';

/** Campos propios de SEMFA en `meta` de las rutas (los aplica `bootstrap.ts`). */
declare module 'vue-router' {
  interface RouteMeta {
    /** Icono de la pestaña del navegador para esta ruta (p. ej. el escudo UAP en `/en-vivo`). */
    favicon?: string;
    /** Reemplaza «SEMFA» al final del título de la pestaña («En vivo - UAP»). */
    tituloSufijo?: string;
  }
}
