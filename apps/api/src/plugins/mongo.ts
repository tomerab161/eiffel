import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Db } from 'mongodb';

import { connectMongo } from '../db/index.ts';

declare module 'fastify' {
  interface FastifyInstance {
    mongo: { db: Db };
  }
}

/** Connects to MongoDB on startup, exposes app.mongo.db, and closes the connection on shutdown. */
const mongoPlugin = fp(
  async (app: FastifyInstance, options: { url: string }) => {
    const client = await connectMongo(options.url);
    app.decorate('mongo', { db: client.db() });
    app.addHook('onClose', () => client.close());
  },
  { name: 'mongo' },
);

export { mongoPlugin };
