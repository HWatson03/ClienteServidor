<script lang="ts" setup>
import { ref } from 'vue';

import { Card, List, ListItem, ListItemMeta, Switch } from 'ant-design-vue';

const notifications = ref([
  {
    key: 'inscripcion',
    title: 'Nuevas inscripciones',
    description: 'Avisos cuando se registre una inscripción en un concurso',
    enabled: true,
  },
  {
    key: 'evaluacion',
    title: 'Evaluaciones pendientes',
    description: 'Recordatorios de rúbricas sin evaluar',
    enabled: true,
  },
  {
    key: 'cronometro',
    title: 'Inicio y fin de ronda',
    description: 'Avisos cuando arranque o termine el cronómetro de una ronda',
    enabled: false,
  },
]);

function toggle(key: string, value: boolean) {
  const item = notifications.value.find((n) => n.key === key);
  if (item) item.enabled = value;
}
</script>

<template>
  <Card title="Notificaciones">
    <List>
      <ListItem v-for="item in notifications" :key="item.key">
        <ListItemMeta>
          <template #title>
            {{ item.title }}
          </template>
          <template #description>
            {{ item.description }}
          </template>
        </ListItemMeta>
        <template #extra>
          <Switch
            :checked="item.enabled"
            @change="(v: any) => toggle(item.key, v as boolean)"
          />
        </template>
      </ListItem>
    </List>
  </Card>
</template>
