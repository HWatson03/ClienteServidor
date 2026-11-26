export type Locale = 'en-US' | 'zh-CN' | 'es-ES';

export const messages: Record<Locale, Record<string, string>> = {
  'en-US': {
    cancel: 'Cancel',
    collapse: 'Collapse',
    confirm: 'Confirm',
    expand: 'Expand',
    prompt: 'Prompt',
    reset: 'Reset',
    submit: 'Submit',
    confirmTitle: 'Please Confirm',
  },
  'zh-CN': {
    cancel: '取消',
    collapse: '收起',
    confirm: '确认',
    expand: '展开',
    prompt: '提示',
    reset: '重置',
    submit: '提交',
    confirmTitle: '请确认',
  },
  'es-ES': {
    cancel: 'Cancelar',
    collapse: 'Contraer',
    confirm: 'Confirmar',
    expand: 'Expandir',
    prompt: 'Aviso',
    reset: 'Restablecer',
    submit: 'Enviar',
    confirmTitle: 'Por favor confirma',
  },
};

export const getMessages = (locale: Locale) => messages[locale];
