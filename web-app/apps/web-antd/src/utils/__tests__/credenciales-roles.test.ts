import { describe, expect, it } from 'vitest';

import {
  fortalezaContrasena,
  generarContrasena,
  usuarioDisponible,
  usuarioSugerido,
} from '#/utils/credenciales';
import { rolDeCuenta } from '#/utils/roles';

describe('rolDeCuenta', () => {
  it('prefiere los roles asignados y, si no hay, el estado heredado', () => {
    expect(rolDeCuenta({ estado: 'J', rol: null, roles: ['ADMIN'] })).toEqual({
      bloqueada: false,
      heredado: false,
      rol: 'ADMIN',
    });
    expect(rolDeCuenta({ estado: 'C', rol: null, roles: [] })).toEqual({
      bloqueada: false,
      heredado: true,
      rol: 'COORDINADOR',
    });
  });

  it('marca bloqueada con X y no inventa rol en una cuenta antigua bloqueada', () => {
    expect(rolDeCuenta({ estado: 'X', rol: null, roles: null })).toEqual({
      bloqueada: true,
      heredado: true,
      rol: null,
    });
    expect(rolDeCuenta({ estado: 'X', rol: 'JURADO', roles: ['JURADO'] }).rol).toBe(
      'JURADO',
    );
  });
});

describe('credenciales', () => {
  it('sugiere el usuario como el backend: CI, correo o id', () => {
    expect(usuarioSugerido({ ci: '1234567-1A', email: null, idPersona: 5 })).toBe(
      '12345671a',
    );
    expect(usuarioSugerido({ ci: '', email: 'Ana.P@uap.edu', idPersona: 5 })).toBe('ana.p');
    expect(usuarioSugerido({ ci: null, email: null, idPersona: 9 })).toBe('u9');
  });

  it('añade un sufijo si el usuario está ocupado', () => {
    expect(usuarioDisponible('123', new Set(['123', '1232']))).toBe('1233');
    expect(usuarioDisponible('abc', new Set())).toBe('abc');
  });

  it('genera contraseñas de 10 caracteres sin ambiguos', () => {
    const c = generarContrasena();
    expect(c).toHaveLength(10);
    expect(c).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });

  it('gradúa la fortaleza', () => {
    expect(fortalezaContrasena('abc').nivel).toBe(1);
    expect(fortalezaContrasena('abcdef12').nivel).toBe(2);
    expect(fortalezaContrasena('Abcdef1234').nivel).toBe(3);
  });
});
