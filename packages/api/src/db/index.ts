import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/trador';

// For query purposes
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

// Export all schema items
export * from './schema';
