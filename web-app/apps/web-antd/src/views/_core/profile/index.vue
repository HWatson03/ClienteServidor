<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import { Avatar, Button, Card, Space, TabPane, Tabs, Tag, message } from 'ant-design-vue';
import { obtenerFotoPerfilApi, subirFotoPerfilApi } from '#/api/core/auth';

import ProfileBase from './base-setting.vue';
import ProfilePasswordSetting from './password-setting.vue';

const userStore = useUserStore();
const activeTab = ref('info');
const FOTO_KEY = 'lestrade-foto-perfil';

const user = userStore.userInfo;
const roles = user?.roles ?? [];
const foto = ref('');
let fotoObjectUrl = '';
const subiendoFoto = ref(false);
const selectorFoto = ref<HTMLInputElement>();
const avatar = computed(() => foto.value || user?.avatar || undefined);
const urlFoto = computed(() => foto.value || avatar.value);
function guardarFotoEnSesion(blob: Blob) {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : '';
    if (!dataUrl || !userStore.userInfo) return;
    localStorage.setItem(FOTO_KEY, dataUrl);
    userStore.setUserInfo({ ...userStore.userInfo, avatar: dataUrl });
  }, { once: true });
  reader.readAsDataURL(blob);
}
async function cargarFoto() {
  try {
    const blob = await obtenerFotoPerfilApi();
    if (!(blob instanceof Blob) || blob.size === 0) return;
    guardarFotoEnSesion(blob);
    if (fotoObjectUrl) URL.revokeObjectURL(fotoObjectUrl);
    fotoObjectUrl = URL.createObjectURL(blob);
    foto.value = fotoObjectUrl;
  } catch { /* Cuenta sin foto: se conserva el avatar inicial. */ }
}
async function cambiarFoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
    message.warning('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
    return;
  }
  subiendoFoto.value = true;
  try {
    await subirFotoPerfilApi(file);
    await cargarFoto();
    message.success('Foto de perfil actualizada.');
  } catch (error: any) {
    message.error(error?.mensaje ?? error?.message ?? 'No se pudo subir la foto.');
  } finally { subiendoFoto.value = false; }
}
onMounted(() => {
  void cargarFoto();
});
onUnmounted(() => { if (fotoObjectUrl) URL.revokeObjectURL(fotoObjectUrl); });
</script>

<template>
  <Page auto-content-height>
    <div class="flex flex-col gap-4">
      <!-- Header -->
      <Card :bordered="false" class="profile-header">
        <div class="flex items-center gap-6">
          <Avatar :size="72" :src="urlFoto" class="flex-shrink-0 bg-primary">
            <template #icon>
              <span class="text-2xl font-bold text-white">
                {{
                  (user?.realName ?? user?.username ?? 'U')
                    .charAt(0)
                    .toUpperCase()
                }}
              </span>
            </template>
          </Avatar>
          <div class="flex flex-col gap-1">
            <h2 class="m-0 text-xl font-semibold">
              {{ user?.realName ?? user?.username ?? 'Usuario' }}
            </h2>
            <span class="text-sm text-gray-500">@{{ user?.username ?? '' }}</span>
            <Space class="mt-1" :size="6">
              <Tag v-for="role in roles" :key="role" color="blue">
                {{ role }}
              </Tag>
            </Space>
            <input ref="selectorFoto" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="cambiarFoto" />
            <Button class="mt-2 w-fit" size="small" :loading="subiendoFoto" @click="selectorFoto?.click()">Cambiar foto</Button>
          </div>
        </div>
      </Card>

      <!-- Tabs -->
      <Card :bordered="false">
        <Tabs v-model:active-key="activeTab" type="card">
          <TabPane key="info" tab="Información personal">
            <ProfileBase />
          </TabPane>
          <TabPane key="password" tab="Cambiar contraseña">
            <ProfilePasswordSetting />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.profile-header :deep(.ant-card-body) {
  padding: 24px 32px;
}
</style>
