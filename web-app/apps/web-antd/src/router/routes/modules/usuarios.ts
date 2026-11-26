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
  {
    path: '/logs',
    name: 'LogsSistema',
    component: () => import('#/views/logs/index.vue'),
    meta: { authority: ['ADMIN'], icon: 'lucide:scroll-text', title: 'Logs del sistema' },
  },
];

export default routes;
