/**
 * Credenciales de acceso: generador de contraseñas y usuario sugerido con las
 * mismas reglas que el backend (`CredencialHelper`, `UsuarioServiceImpl`). Lo
 * usan las altas que crean cuentas (Jurado, Usuarios).
 */

/** Acceso recién creado, para mostrarlo y copiarlo una sola vez. */
export interface Credenciales {
  /** `null` cuando se reutilizó una cuenta existente. */
  contrasena: null | string;
  /** Persona dueña de la cuenta. */
  nombre: string;
  usuario: string;
}

/** Caracteres sin ambigüedad (sin 0/O, 1/l/I), los mismos que `CredencialHelper`. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Contraseña aleatoria legible para dictar o copiar. */
export function generarContrasena(largo = 10): string {
  const azar = new Uint32Array(largo);
  crypto.getRandomValues(azar);
  return [...azar].map((n) => ALFABETO[n % ALFABETO.length]).join('');
}

/** Usuario que sugiere el backend si se deja vacío (`CredencialHelper.sugerirUsuario`). */
export function usuarioSugerido(persona: {
  ci: null | string;
  email: null | string;
  idPersona: number;
}): string {
  const ci = (persona.ci ?? '').replaceAll(/[^0-9A-Za-z]/g, '').toLowerCase();
  if (ci) {
    return ci;
  }
  if (persona.email?.trim()) {
    return persona.email.split('@')[0]!.toLowerCase();
  }
  return `u${persona.idPersona}`;
}

/** Igual que el backend: si el usuario existe, prueba `base2`, `base3`… */
export function usuarioDisponible(base: string, ocupados: Set<string>): string {
  let usuario = base;
  let sufijo = 1;
  while (ocupados.has(usuario)) {
    sufijo += 1;
    usuario = `${base}${sufijo}`;
  }
  return usuario;
}

export const MINIMO_CONTRASENA = 6;

/** Nombre de acceso: minúsculas, números, punto, guion y guion bajo. */
export const FORMATO_USUARIO = /^[a-z0-9._-]{3,30}$/;

/** Nivel de una contraseña para la barra de fortaleza (1 a 3). */
export function fortalezaContrasena(c: string) {
  const variedad = [/[a-z]/, /[A-Z]/, /\d/, /[^a-z\d]/i].filter((r) => r.test(c)).length;
  if (c.length < MINIMO_CONTRASENA) {
    return { color: 'bg-red-500', nivel: 1, texto: 'Muy corta' };
  }
  if (c.length >= 10 && variedad >= 3) {
    return { color: 'bg-green-600', nivel: 3, texto: 'Fuerte' };
  }
  return c.length >= 8 && variedad >= 2
    ? { color: 'bg-amber-500', nivel: 2, texto: 'Aceptable' }
    : { color: 'bg-red-500', nivel: 1, texto: 'Débil' };
}
