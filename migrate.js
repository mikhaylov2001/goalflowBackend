require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        category TEXT DEFAULT 'work',
        priority TEXT DEFAULT 'medium',
        deadline TEXT DEFAULT '',
        reward TEXT DEFAULT '',
        done BOOLEAN DEFAULT false,
        notif_enabled BOOLEAN DEFAULT false,
        notif_freq TEXT DEFAULT 'daily',
        notif_time TEXT DEFAULT '09:00',
        notif_day TEXT DEFAULT 'mon',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done BOOLEAN DEFAULT false,
        priority TEXT DEFAULT 'medium',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS microtasks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done BOOLEAN DEFAULT false,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS habits (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        emoji TEXT DEFAULT '',
        color TEXT DEFAULT '#6366F1',
        streak INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS habit_logs (
        id SERIAL PRIMARY KEY,
        habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        log_date TEXT NOT NULL,
        UNIQUE(habit_id, log_date)
      );

      CREATE TABLE IF NOT EXISTS wishes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        note TEXT DEFAULT '',
        emoji TEXT DEFAULT '',
        done BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
