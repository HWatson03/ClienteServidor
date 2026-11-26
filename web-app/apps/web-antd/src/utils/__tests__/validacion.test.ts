import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  edadDesde,
  FORMATO_CI,
  FORMATO_EMAIL,
  FORMATO_NOMBRE,
  sanearCi,
} from '#/utils/validacion';

describe('validacion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula la edad según si ya pasó el cumpleaños', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29)); // 29/09/2026
    expect(edadDesde('1990-09-29')).toBe(36);
    expect(edadDesde('1990-09-30')).toBe(35);
    expect(edadDesde('1990-12-01')).toBe(35);
    expect(edadDesde(undefined)).toBeNull();
    expect(edadDesde('fecha')).toBeNull();
  });

  it('deja en el CI solo dígitos, letras y guion, en mayúsculas', () => {
    expect(sanearCi(' 1234567-1a ')).toBe('1234567-1A');
    expect(sanearCi('12.345/67')).toBe('1234567');
  });

  it('acepta CI con complemento y rechaza los incompletos', () => {
    expect(FORMATO_CI.test('1234567')).toBe(true);
    expect(FORMATO_CI.test('1234567-1A')).toBe(true);
    expect(FORMATO_CI.test('123')).toBe(false);
    expect(FORMATO_CI.test('1234567-')).toBe(false);
  });

  it('valida nombres con tildes y ñ, y correos', () => {
    expect(FORMATO_NOMBRE.test("José Ñandú O'Brien")).toBe(true);
    expect(FORMATO_NOMBRE.test('Juan2')).toBe(false);
    expect(FORMATO_EMAIL.test('jmamani@uap.edu.bo')).toBe(true);
    expect(FORMATO_EMAIL.test('jmamani@uap')).toBe(false);
  });
});
