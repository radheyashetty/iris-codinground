/**
 * seed.ts — Seeds the actors table with the four canonical actors.
 * Run via: npm run db:seed
 * Used by: tests/* (import seedActors and call with in-memory DB)
 */
import Database from 'better-sqlite3';
import { getDb } from './connection';

interface SeedActor {
  id: string;
  name: string;
  role: 'employee' | 'manager' | 'hr';
}

const SEED_ACTORS: SeedActor[] = [
  { id: 'emp-001', name: 'Asha', role: 'employee' },
  { id: 'emp-002', name: 'Ravi', role: 'employee' },
  { id: 'mgr-001', name: 'Meera', role: 'manager' },
  { id: 'hr-001', name: 'Kabir', role: 'hr' },
];

/**
 * Inserts seed actors into the given DB (idempotent via INSERT OR IGNORE).
 * Used by: tests to populate the in-memory DB before each test.
 */
export function seedActors(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO actors (id, name, role) VALUES (?, ?, ?)',
  );
  const insertMany = db.transaction((actors: SeedActor[]) => {
    for (const actor of actors) {
      insert.run(actor.id, actor.name, actor.role);
    }
  });
  insertMany(SEED_ACTORS);
  console.log(`Seeded ${SEED_ACTORS.length} actors.`);
}

// When run directly as a script, seed the real DB
if (require.main === module) {
  const db = getDb();
  seedActors(db);
  db.close();
  console.log('Database seeded successfully.');
}
