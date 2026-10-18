import { buildApp } from './app.ts';
import { loadConfig } from './config/index.ts';

const config = loadConfig();
const app = await buildApp({ config });
await app.listen({ port: config.PORT, host: config.HOST });
