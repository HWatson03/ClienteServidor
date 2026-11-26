<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';

import { useUserStore } from '@vben/stores';
import { obtenerPerfilApi, type UsuarioActual } from '#/api/core/auth';
import { message, Spin } from 'ant-design-vue';

import {
  Alert,
  Card,
  Descriptions,
  DescriptionsItem,
  Tag,
} from 'ant-design-vue';

const userStore = useUserStore();
const perfil = ref<UsuarioActual | null>(null);
const cargando = ref(false);

const userInfo = computed(() => userStore.userInfo ?? null);
const rol = computed(() => perfil.value?.rol ?? userInfo.value?.roles?.[0] ?? '—');
onMounted(async () => {
  cargando.value = true;
  try { perfil.value = await obtenerPerfilApi(); }
  catch { message.error('No se pudieron cargar los datos del perfil.'); }
  finally { cargando.value = false; }
});
</script>

<template>
  <Card title="Información de la cuenta">
    <Spin :spinning="cargando">
    <Descriptions bordered :column="1">
      <DescriptionsItem label="ID de usuario">
        {{ perfil?.idUsuario ?? userInfo?.userId ?? '—' }}
      </DescriptionsItem>
      <DescriptionsItem label="Usuario">
        {{ perfil?.nombreUsuario ?? userInfo?.username ?? '—' }}
      </DescriptionsItem>
      <DescriptionsItem label="Nombre completo">
        {{ [perfil?.nombres, perfil?.apellidoPaterno, perfil?.apellidoMaterno].filter(Boolean).join(' ') || userInfo?.realName || '—' }}
      </DescriptionsItem>
      <DescriptionsItem label="Cédula de identidad">{{ perfil?.ci || '—' }}</DescriptionsItem>
      <DescriptionsItem label="Correo electrónico">{{ perfil?.correo || '—' }}</DescriptionsItem>
      <DescriptionsItem label="Teléfono">{{ perfil?.telefono || '—' }}</DescriptionsItem>
      <DescriptionsItem label="Rol">
        <Tag color="green">{{ rol }}</Tag>
      </DescriptionsItem>
      <DescriptionsItem label="Ruta de inicio">
        {{ userInfo?.homePath ?? '—' }}
      </DescriptionsItem>
    </Descriptions>
    </Spin>
  </Card>
</template>
