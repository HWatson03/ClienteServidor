<script lang="ts" setup>
import { ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import { Avatar, Card, Space, TabPane, Tabs, Tag } from 'ant-design-vue';

import ProfileBase from './base-setting.vue';
import ProfileNotificationSetting from './notification-setting.vue';
import ProfilePasswordSetting from './password-setting.vue';

const userStore = useUserStore();
const activeTab = ref('info');

const user = userStore.userInfo;
const roles = user?.roles ?? [];
</script>

<template>
  <Page auto-content-height>
    <div class="flex flex-col gap-4">
      <!-- Header -->
      <Card :bordered="false" class="profile-header">
        <div class="flex items-center gap-6">
          <Avatar :size="72" class="flex-shrink-0 bg-primary">
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
          <TabPane key="notifications" tab="Notificaciones">
            <ProfileNotificationSetting />
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
