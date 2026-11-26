/**
 * Reglas de validación compartidas por los formularios SEMFA que capturan datos
 * de una persona (Persona, Docente…), para que un mismo campo se valide igual en
 * todas las pantallas.
 */
import type { Rule } from 'ant-design-vue/es/form';

import { limpiarEspacios } from './formato';

export const LIMITE_CI = 13;
export const LIMITE_NOMBRE = 50;
export const LIMITE_EMAIL = 80;

/** CI boliviano: 5 a 10 dígitos y, opcional, un complemento tras guion (1234567-1A). */
export const FORMATO_CI = /^\d{5,10}(?:-[0-9A-Z]{1,2})?$/;
export const MENSAJE_FORMATO_CI =
  'Use de 5 a 10 dígitos y, si tiene, el complemento: 1234567 o 1234567-1A.';

/** Letras (con tildes y ñ), espacios, apóstrofo, punto y guion. */
export const FORMATO_NOMBRE = /^[\p{L}\s'.-]+$/u;

export const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Solo dígitos, letras y guion, en mayúsculas: lo que se deja escribir en un CI. */
export function sanearCi(valor: string): string {
  return valor.replaceAll(/[^0-9a-z-]/gi, '').toUpperCase();
}

/**
 * Deja en el `<input>` el valor saneado. Si se tecleó un carácter no válido, el
 * valor del modelo no cambia y Vue no repinta, así que hay que corregirlo a mano.
 */
export function reflejarEnInput(evento: Event, limpio: string) {
  const input = evento.target as HTMLInputElement;
  if (input.value !== limpio) {
    input.value = limpio;
  }
}

/** Nombre o apellido: letras, mínimo 2, opcional u obligatorio. */
export function reglaNombre(etiqueta: string, obligatorio: boolean): Rule {
  return {
    trigger: ['blur', 'change'],
    validator: async (_rule, valor: string) => {
      const texto = limpiarEspacios(valor);
      if (!texto) {
        if (obligatorio) {
          throw new Error(`${etiqueta} es obligatorio.`);
        }
        return;
      }
      if (!FORMATO_NOMBRE.test(texto)) {
        throw new Error(`${etiqueta} solo admite letras, espacios y guiones.`);
      }
      if (texto.length < 2) {
        throw new Error(`${etiqueta} debe tener al menos 2 letras.`);
      }
    },
  };
}

/** Correo opcional con formato válido. */
export const reglaEmail: Rule = {
  trigger: ['blur', 'change'],
  validator: async (_rule, valor: string) => {
    const email = (valor ?? '').trim();
    if (email && !FORMATO_EMAIL.test(email)) {
      throw new Error('Escriba un correo válido, p. ej. nombre@uap.edu.bo.');
    }
  },
};

/** Años cumplidos a la fecha de hoy, a partir de `yyyy-MM-dd`. */
export function edadDesde(fecha: null | string | undefined): null | number {
  if (!fecha) {
    return null;
  }
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (!anio || !mes || !dia) {
    return null;
  }
  const hoy = new Date();
  let edad = hoy.getFullYear() - anio;
  const cumplio =
    hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);
  if (!cumplio) {
    edad -= 1;
  }
  return edad;
}
