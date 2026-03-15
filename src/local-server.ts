import { serve } from '@hono/node-server';
import app from './app.js';
import { localLyricCache } from '../api/localLyricCache.js';
import { initDevMode } from '../api/devMode.js';
import { startCacheAdminServer } from './cache-admin-server.js';
import { getLogger } from '../api/utils.js';

const logger = getLogger('Server');
const port = Number(process.env.PORT) || 3000;

Promise.all([
  localLyricCache.init(),
  initDevMode(),
  startCacheAdminServer()
]).then(() => {
  logger.info(logger.msg('api.running', { url: `http://localhost:${port}` }));

  serve({
    fetch: app.fetch,
    port,
  });
});
