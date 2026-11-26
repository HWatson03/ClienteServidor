import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/usuarios',
    name: 'Usuarios',
    component: () => import('#/views/usuarios/index.vue'),
    meta: { authority: ['ADMIN'], icon: 'lucide:users-round', title: 'Usuarios' },
  },
  {
    path: '/cliente',
    name: 'Cliente',
    component: () => import('#/views/cliente/index.vue'),
    meta: { authority: ['CLIENTE'], icon: 'lucide:cloud', title: 'Mis archivos' },
  },
];

export default routes;
