import Database from 'better-sqlite3';
import NodeCache from 'node-cache';
import path from 'path';

// In the container the compiled file lives at dist/backend/src, so the
// __dirname-relative path resolves wrong; DB_PATH (set in docker-compose) wins
// there and points at the mounted volume. Local ts-node-dev keeps the fallback.
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../vacation.db');

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    name TEXT,
    destination TEXT,
    start_date TEXT,
    end_date TEXT,
    budget_usd REAL,
    trip_type TEXT,
    itinerary_json TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    cache_key TEXT PRIMARY KEY,
    data_json TEXT,
    scraped_at INTEGER,
    source TEXT
  );
`);

export const cache = new NodeCache({ stdTTL: 10800, checkperiod: 600 });
