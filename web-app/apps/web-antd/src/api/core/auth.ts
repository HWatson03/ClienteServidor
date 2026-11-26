import { requestClient } from '#/api/request';

export const ROLES = { ADMIN: 'ADMIN', CLIENTE: 'CLIENTE' } as const;
export type Rol = (typeof ROLES)[keyof typeof ROLES];

export interface UsuarioActual {
  idUsuario: number;
  nombreUsuario: string;
  rol: Rol;
}

interface LoginResponse { token: string }
interface LoginRequest { nombreUsuario: string; contrasena: string }

export async function loginApi(data: LoginRequest) {
  const respuesta = await requestClient.post<LoginResponse>('/auth/login', data, {
    responseReturn: 'body',
  });
  return { accessToken: respuesta.token, refreshToken: null };
}

export async function getUserInfoApi() {
  const actual = await requestClient.get<UsuarioActual>('/auth/me');
  return {
    avatar: '', desc: '', homePath: actual.rol === ROLES.ADMIN ? '/usuarios' : '/cliente',
    realName: actual.nombreUsuario, roles: [actual.rol], token: '',
    userId: String(actual.idUsuario), username: actual.nombreUsuario,
  };
}

export async function logoutApi() {
  return requestClient.post('/auth/logout');
}

export function homePathPorRol(rol: string | undefined) {
  return rol === ROLES.ADMIN ? '/usuarios' : '/cliente';
}
