/**
 * Rol de una cuenta tal como lo resuelve el backend (`RolResolver`): primero los
 * roles asignados en `UsrRol` y, si no hay, el rol heredado en `Usuario.estado`
 * (`A` admin, `J` jurado, `C` coordinador). `X` o vacío = cuenta bloqueada.
 *
 * Las cuentas creadas antes de la tabla `rol` solo tienen el `estado`: se
 * muestran con su rol «heredado» y lo pasan a `UsrRol` al editarlas.
 */
import type { Usuario } from '#/api/usuarios';

export type RolCanonico = 'ADMIN' | 'ACOMPANANTE' | 'COORDINADOR' | 'JURADO';

const ROL_POR_ESTADO: Record<string, RolCanonico> = {
  A: 'ADMIN',
  C: 'COORDINADOR',
  J: 'JURADO',
};

/** Cómo se muestra cada rol en tablas, chips y formularios. */
export const INFO_ROL: Record<string, { etiqueta: string; icono: string }> = {
  ADMIN: { etiqueta: 'Administrador', icono: 'lucide:shield-check' },
  ACOMPANANTE: { etiqueta: 'Acompañante', icono: 'lucide:map-pin' },
  COORDINADOR: { etiqueta: 'Coordinador', icono: 'lucide:timer' },
  JURADO: { etiqueta: 'Jurado', icono: 'lucide:gavel' },
};

export function infoRol(rol: null | string | undefined) {
  const clave = (rol ?? '').trim().toUpperCase();
  return INFO_ROL[clave] ?? { etiqueta: rol || 'Sin rol', icono: 'lucide:user' };
}

export interface RolDeCuenta {
  bloqueada: boolean;
  /** `true` si sale del `estado` legacy y no de `UsrRol`. */
  heredado: boolean;
  /** `null` si no se puede saber (p. ej. cuenta legacy bloqueada). */
  rol: null | string;
}

export function rolDeCuenta(u: Pick<Usuario, 'estado' | 'rol' | 'roles'>): RolDeCuenta {
  const estado = (u.estado ?? '').trim().toUpperCase();
  const bloqueada = estado === '' || estado === 'X';
  const asignado = u.roles?.[0] ?? u.rol;
  if (asignado) {
    return { bloqueada, heredado: false, rol: asignado.trim().toUpperCase() };
  }
  return { bloqueada, heredado: true, rol: ROL_POR_ESTADO[estado] ?? null };
}
