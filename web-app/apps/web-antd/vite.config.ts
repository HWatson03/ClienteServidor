import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { defineConfig } from '@vben/vite-config';
import { loadEnv } from 'vite';

const appDirectory = fileURLToPath(new URL('.', import.meta.url));

function parseEnvFile(contents: string): Record<string, string> {
  return Object.fromEntries(
    contents.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) return [];
      const value = match[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
      return [[match[1], value]];
    }),
  );
}

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendEnvPath = path.resolve(appDirectory, '../../../backend/.env');
  const backendEnv = parseEnvFile(readFileSync(backendEnvPath, 'utf8'));
  const serverPort = backendEnv.SERVER_PORT || '8080';
  const backendUrl = process.env.BACKEND_URL || backendEnv.BACKEND_URL || `http://localhost:${serverPort}`;

  return {
    application: {},
    vite: {
      base: command === 'build' ? '/vue/' : '/',
      plugins: [
        {
          configureServer(server) {
            server.middlewares.use((req, _res, next) => {
              const ruta = req.url?.split('?')[0] ?? '';
              if (/^\/evaluar(?:\/[^.]*)?$/.test(ruta)) req.url = '/jurado.html';
              next();
            });
          },
          name: 'jurado-web-entry',
        },
      ],
      server: {
        host: '0.0.0.0',
        port: Number(env.VITE_PORT || 5173),
        proxy: {
          '/api': {
            changeOrigin: true,
            target: backendUrl,
            ws: true,
          },
          '/ws': {
            changeOrigin: true,
            target: backendUrl,
            ws: true,
          },
        },
      },
      build: {
        emptyOutDir: true,
        rolldownOptions: {
          input: {
            feria: path.resolve(appDirectory, 'feria.html'),
            index: path.resolve(appDirectory, 'index.html'),
            jurado: path.resolve(appDirectory, 'jurado.html'),
          },
        },
        outDir: path.resolve(
          appDirectory,
          '../../../backend/src/main/resources/static/vue',
        ),
      },
    },
  };
});
