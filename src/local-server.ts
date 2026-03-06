import { serve } from '@hono/node-server';
import app from './app.js';
import { localLyricCache } from '../api/localLyricCache.js';
import { initDevMode } from '../api/devMode.js';
import { startCacheAdminServer } from './cache-admin-server.js';

const port = Number(process.env.PORT) || 3000;

Promise.all([
  localLyricCache.init(),
  initDevMode(),
  startCacheAdminServer()
]).then(() => {
  console.log(`Server is running on http://localhost:${port}`);

  serve({
    fetch: app.fetch,
    port,
  });
});
