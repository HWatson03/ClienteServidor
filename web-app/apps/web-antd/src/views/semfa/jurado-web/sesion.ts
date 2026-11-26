import { shallowRef } from 'vue';

import { ErrorApi, pedir } from './red';

/**
 * Sesión de la app web ligera del jurado. El JWT dura 24 h y no hay refresh: cuando el
 * servidor responde 401 la sesión queda «vencida», pero el jurado SIGUE pudiendo evaluar
 * con lo descargado (sus notas quedan en la cola) hasta que vuelva a ingresar.
 *
 * La administración (vben) entrega su sesión aquí al iniciar sesión un jurado
 * (`views/semfa/jurado/ir-a-web.vue` escribe la misma clave).
 */
export interface Sesion {
  idUsuario: null | number;
  nombre: string;
  token: string;
  usuario: string;
  /** El servidor respondió 401: hay que volver a ingresar para enviar. */
  vencida?: boolean;
}

export const CLAVE_SESION = 'semfa.jw.sesion';

function leer(): null | Sesion {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null') as null | Sesion;
    return s?.token && s.usuario ? s : null;
  } catch {
    return null;
  }
}

function escribir(s: null | Sesion) {
  try {
    if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // Sin almacenamiento (modo privado estricto): la sesión dura lo que la pestaña.
  }
}

export const sesion = shallowRef<null | Sesion>(leer());

/** Otra pestaña ingresó o salió: seguirla. */
window.addEventListener('storage', (e) => {
  if (e.key === CLAVE_SESION) sesion.value = leer();
});

interface LoginData {
  idUsuario: null | number;
  nombreCompleto: null | string;
  rol: null | string;
  token: string;
  username: string;
}

export async function ingresar(usuario: string, clave: string): Promise<Sesion> {
  const { data } = await pedir<LoginData>('/auth/login', {
    cuerpo: { password: clave, username: usuario },
    metodo: 'POST',
    ms: 20_000,
  });
  if (!data?.token) throw new ErrorApi(500, 'El servidor no devolvió la sesión.');
  if (data.rol !== 'JURADO') {
    throw new ErrorApi(403, 'Esta página es solo para jurados. La administración se usa desde la página principal.');
  }
  const nueva: Sesion = {
    idUsuario: data.idUsuario ?? null,
    nombre: (data.nombreCompleto ?? '').replaceAll(/\s+/g, ' ').trim() || data.username,
    token: data.token,
    usuario: data.username,
  };
  escribir(nueva);
  sesion.value = nueva;
  return nueva;
}

export function marcarVencida() {
  const s = sesion.value;
  if (!s || s.vencida) return;
  const vencida = { ...s, vencida: true };
  escribir(vencida);
  sesion.value = vencida;
}

/**
 * Cierra la sesión de este dispositivo. También borra la sesión guardada de la
 * administración (`<namespace>-core-access`/`-core-user`): si no, al abrir la página
 * principal volvería a entrar sola y a mandar al jurado aquí.
 */
export function cerrarSesion() {
  escribir(null);
  sesion.value = null;
  try {
    for (const clave of Object.keys(localStorage)) {
      if (/-core-(access|user)$/.test(clave)) localStorage.removeItem(clave);
    }
  } catch {
    // nada
  }
}
