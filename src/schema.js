export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','employee')),
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      capacity   INTEGER NOT NULL CHECK (capacity > 0),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id     INTEGER NOT NULL REFERENCES rooms(id),
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      title       TEXT NOT NULL,
      start_ms    INTEGER NOT NULL,
      end_ms      INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      CHECK (end_ms > start_ms)
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings(room_id, start_ms, end_ms);
  `);
}
