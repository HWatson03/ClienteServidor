import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HOME_PATH_POR_DEFECTO,
  HOME_PATH_POR_ROL,
  homePathPorRol,
  loginApi,
  logoutApi,
  ROLES,
} from '#/api/core/auth';
import { baseRequestClient, requestClient } from '#/api/request';

vi.mock('#/api/request', () => ({
  baseRequestClient: { post: vi.fn().mockResolvedValue({}) },
  requestClient: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  },
}));

const postBase = vi.mocked(baseRequestClient.post);
const postCli = vi.mocked(requestClient.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth API — contrato con el backend SEMFA', () => {
  it('login envía las credenciales a /auth/login vía requestClient', async () => {
    postCli.mockResolvedValue({
      idUsuario: 1,
      nombreCompleto: 'Administrador',
      rol: 'ADMIN',
      token: 'jwt-123',
      tokenType: 'Bearer',
      username: 'admin1',
    } as never);

    await loginApi({ username: 'admin1', password: '123' });

    expect(postCli).toHaveBeenCalledWith('/auth/login', {
      username: 'admin1',
      password: '123',
    });
  });

  it('login traduce token→accessToken y rol→roles, sin refresh token', async () => {
    postCli.mockResolvedValue({
      idUsuario: 7,
      nombreCompleto: 'Jurado Uno',
      rol: 'JURADO',
      token: 'jwt-abc',
      tokenType: 'Bearer',
      username: 'jurado1',
    } as never);

    const resultado = await loginApi({ username: 'jurado1', password: '123' });

    expect(resultado).toEqual({
      accessToken: 'jwt-abc',
      idUsuario: 7,
      nombreCompleto: 'Jurado Uno',
      refreshToken: null,
      roles: ['JURADO'],
      username: 'jurado1',
    });
  });

  it('login devuelve roles vacío cuando el backend no envía rol', async () => {
    postCli.mockResolvedValue({
      token: 'jwt-x',
      username: 'sinrol',
    } as never);

    const resultado = await loginApi({ username: 'sinrol', password: '123' });

    expect(resultado.roles).toEqual([]);
  });

  it('logout no envía refreshToken porque el backend es stateless', async () => {
    await logoutApi();
    expect(postBase).toHaveBeenCalledWith('/auth/logout');
  });
});

describe('homePathPorRol — equivale a las redirecciones del loginController legacy', () => {
  it.each([
    [ROLES.ADMIN, '/semfa/admin'],
    [ROLES.JURADO, '/jurado'],
    [ROLES.COORDINADOR, '/semfa/coordinador'],
  ])('rol %s dirige a %s', (rol, esperado) => {
    expect(homePathPorRol(rol)).toBe(esperado);
    expect(HOME_PATH_POR_ROL[rol]).toBe(esperado);
  });

  it('rol desconocido o ausente cae en la ruta por defecto', () => {
    expect(homePathPorRol('OTRO')).toBe(HOME_PATH_POR_DEFECTO);
    expect(homePathPorRol(undefined)).toBe(HOME_PATH_POR_DEFECTO);
  });
});
