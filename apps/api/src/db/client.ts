import { MongoClient } from 'mongodb';

/** Opens the one MongoDB connection the API uses. Repositories get the Db from the mongo plugin. */
const connectMongo = async (url: string): Promise<MongoClient> => {
  const client = new MongoClient(url);
  await client.connect();

  return client;
};

export { connectMongo };
