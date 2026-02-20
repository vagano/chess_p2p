import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[DB] DATABASE_URL not set, running without persistence');
    return null;
  }

  try {
    pool = new Pool({ connectionString: url, max: 10 });
    console.log('[DB] PostgreSQL pool created');
    return pool;
  } catch (err) {
    console.error('[DB] Failed to create pool:', err);
    return null;
  }
}

export async function saveSnapshot(
  gameId: string,
  snapshot: Uint8Array,
  stateVector: Uint8Array,
): Promise<void> {
  const p = getPool();
  if (!p) return;

  await p.query(
    `INSERT INTO yjs_snapshots (game_id, snapshot, state_vector, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (game_id) DO UPDATE
       SET snapshot = $2, state_vector = $3, updated_at = NOW()`,
    [gameId, Buffer.from(snapshot), Buffer.from(stateVector)],
  );
}

export async function loadSnapshot(
  gameId: string,
): Promise<{ snapshot: Uint8Array; stateVector: Uint8Array } | null> {
  const p = getPool();
  if (!p) return null;

  const result = await p.query(
    `SELECT snapshot, state_vector FROM yjs_snapshots WHERE game_id = $1`,
    [gameId],
  );

  if (result.rows.length === 0) return null;

  return {
    snapshot: new Uint8Array(result.rows[0].snapshot),
    stateVector: new Uint8Array(result.rows[0].state_vector),
  };
}

export async function updateGameState(
  gameId: string,
  fen: string,
  pgn: string,
  status: string,
  result: string,
): Promise<void> {
  const p = getPool();
  if (!p) return;

  await p.query(
    `UPDATE games SET fen = $2, pgn = $3, status = $4, result = $5, updated_at = NOW()
     WHERE id = $1::uuid`,
    [gameId, fen, pgn, status, result],
  ).catch(() => {
    // Game may not exist yet or gameId is not a UUID
  });
}
