import { Pool } from "pg";

import { DeckBuilder } from "./deck.js";
import { cellFromDb } from "./candidateSql.js";
import { buildShards, type CellLoad } from "./geo.js";
import { InMemoryRedis, type RedisLike } from "./mutualLike.js";
import {
  PgCandidateSource,
  PgUserDirectory,
  type ImpressionLookup,
  type Queryable,
} from "./pgSource.js";
import type { Deps } from "./server.js";
import { ValkeyClient, connectValkey, valkeyImpressions } from "./valkey.js";

/**
 * Wiring cho bản chạy thật.
 *
 * ĐÂY LÀ FILE DUY NHẤT import `pg`. Mọi module khác nói chuyện qua `Queryable`,
 * nên đổi driver (hoặc bơm object giả trong test) không lan ra chỗ nào.
 */

/**
 * Nạp bảng tải ô S2 để dựng shard.
 *
 * Phải đọc từ dữ liệu THẬT chứ không dựng shard theo lưới đều: bất biến số 3
 * trong CLAUDE.md nói ngưỡng chia shard phải THÍCH NGHI, và nó chỉ thích nghi
 * được nếu biết ô nào đang nóng. Hà Nội và TP.HCM ở level 8 sẽ nuốt trọn ngân
 * sách nếu dựng mù.
 */
export async function loadCellLoads(db: Queryable): Promise<CellLoad[]> {
  const { rows } = await db.query<{ cell: string; load: string }>(
    `SELECT p.s2_cell_l8::text AS cell, count(*)::text AS load
       FROM profiles p
       JOIN users u ON u.user_id = p.user_id
      WHERE u.status = 0 AND u.deleted_at IS NULL
      GROUP BY p.s2_cell_l8`,
    [],
  );
  // Đọc ngược: cột là BIGINT có dấu, ô S2 là không dấu. Xem cellFromDb.
  return rows.map((r) => ({ cell: cellFromDb(r.cell), load: Number(r.load) }));
}

export interface PgDepsOptions {
  connectionString: string;
  /**
   * URL Valkey. THIẾU LÀ CHẤP NHẬN MẤT MÁT, không phải cấu hình tuỳ chọn:
   * trạng thái "đã like" rơi về RAM tiến trình ⇒ restart là mất, và chạy nhiều
   * instance thì mỗi cái giữ một nửa. Service nói thẳng ra khi rơi vào đó.
   */
  valkeyUrl?: string;
  /** Số shard mong muốn. Xem `buildShards` và bất biến số 3. */
  targetShards?: number;
  pushNudge: Deps["pushNudge"];
}

/**
 * Dựng `Deps` chạy trên Postgres.
 *
 * Ném lỗi nếu bảng `profiles` rỗng: một deck không bao giờ trả thẻ nào là triệu
 * chứng rất khó truy, mà nguyên nhân thường chỉ là chưa chạy migration hoặc
 * trỏ nhầm database. Chết lúc khởi động kèm câu giải thích thì hơn là im lặng
 * phục vụ deck rỗng mãi mãi.
 */
export async function pgDeps(
  opts: PgDepsOptions,
): Promise<{ deps: Deps; close: () => Promise<void> }> {
  const pool = new Pool({ connectionString: opts.connectionString });
  const db: Queryable = {
    query: (text, values) => pool.query(text, values as unknown[]) as never,
  };

  const cells = await loadCellLoads(db);
  if (cells.length === 0) {
    await pool.end();
    throw new Error(
      "profiles rỗng — chưa chạy db/migrations/0001_init.sql, hoặc DATABASE_URL trỏ nhầm database",
    );
  }

  let redis: RedisLike = new InMemoryRedis();
  let impressions: ImpressionLookup | undefined;
  let closeValkey: () => Promise<void> = async () => {};

  if (opts.valkeyUrl) {
    const valkey = await connectValkey(opts.valkeyUrl);
    redis = new ValkeyClient(valkey);
    impressions = valkeyImpressions(valkey);
    closeValkey = async () => {
      await valkey.quit();
    };
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[match] VALKEY_URL trống — trạng thái 'đã like' nằm trong RAM tiến trình. " +
        "Khởi động lại là mất like đang chờ, và chạy nhiều instance thì mỗi cái giữ một nửa.",
    );
  }

  const shards = buildShards(cells, opts.targetShards ?? 16);
  const deck = new DeckBuilder(shards, new PgCandidateSource(db, shards, impressions));

  return {
    deps: {
      redis,
      deck,
      users: new PgUserDirectory(db),
      pushNudge: opts.pushNudge,
    },
    close: async () => {
      await closeValkey();
      await pool.end();
    },
  };
}
