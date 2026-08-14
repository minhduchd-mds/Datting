import {
  buildCandidateQuery,
  rowToUserVector,
  type CandidateRow,
  type CandidateFilter,
} from "./candidateSql.js";
import type { CandidateSource, DeckRequest } from "./deck.js";
import type { Shard } from "./geo.js";
import type { UserVector } from "./ranking.js";

/**
 * Vỏ I/O của tầng Postgres. CỐ Ý MỎNG.
 *
 * Mọi quyết định — dựng SQL, đổi hàng thành UserVector, kẹp limit, đảo tuổi
 * thành ngày sinh — nằm ở `candidateSql.ts` và có test. Chỗ này chỉ còn: gọi,
 * chờ, map. Không có Postgres nào chạy lúc viết file này, nên nguyên tắc là
 * phần không kiểm chứng được phải nhỏ tới mức đọc một lượt là thấy hết.
 */

/**
 * Bề mặt tối thiểu của `pg` mà module này cần.
 *
 * Khai lại thay vì import `Pool`: nhờ vậy test bơm được một object giả, và
 * `candidateSql.ts` không bao giờ phải biết `pg` tồn tại.
 */
export interface Queryable {
  query<T>(text: string, values: unknown[]): Promise<{ rows: T[] }>;
}

/** Tra số lần một hồ sơ đã được hiển thị HÔM NAY. Nguồn thật là Valkey. */
export type ImpressionLookup = (ids: bigint[]) => Promise<Map<string, number>>;

let warnedNoImpressions = false;

/**
 * Tầng 1 (truy hồi) đọc từ PostGIS.
 *
 * ─── Vì sao đây là điểm khởi đầu hợp lệ ───────────────────────────────────
 * Production dự kiến truy hồi bằng OpenSearch geoshard + Qdrant ANN. Nhưng
 * `CandidateSource` là interface đúng để hoán đổi chuyện đó, và một truy vấn
 * PostGIS đơn giản là bản đầu tiên hợp lệ — ranh giới không đổi khi thay ruột.
 *
 * ─── shardId → ô S2 ───────────────────────────────────────────────────────
 * `DeckBuilder` nói chuyện bằng shardId, còn bảng `profiles` đánh index theo
 * `s2_cell_l8`. `Shard` đã mang sẵn `cells`, nên bước dịch là gom mảng — không
 * cần lượt đi database nào để tra bản đồ shard.
 */
export class PgCandidateSource implements CandidateSource {
  constructor(
    private readonly db: Queryable,
    private readonly shards: readonly Shard[],
    private readonly impressions?: ImpressionLookup,
  ) {}

  async retrieve(shardIds: number[], req: DeckRequest, limit: number): Promise<UserVector[]> {
    const wanted = new Set(shardIds);
    const cells: bigint[] = [];
    for (const s of this.shards) {
      if (wanted.has(s.shardId)) cells.push(...s.cells);
    }

    const filter: CandidateFilter = {
      viewerId: req.viewer.userId,
      viewerLoc: req.viewer.loc,
      ...(req.wantGenders ? { wantGenders: req.wantGenders } : {}),
      ...(req.ageMin !== undefined ? { ageMin: req.ageMin } : {}),
      ...(req.ageMax !== undefined ? { ageMax: req.ageMax } : {}),
      ...(req.maxDistanceKm !== undefined ? { maxDistanceKm: req.maxDistanceKm } : {}),
    };

    const q = buildCandidateQuery(cells, filter, limit);
    if (!q) return []; // không ô nào ⇒ không ứng viên, khỏi đi Postgres

    const { rows } = await this.db.query<CandidateRow>(q.text, q.values);
    if (rows.length === 0) return [];

    const counts = await this.impressionsFor(rows);
    return rows.map((r) => rowToUserVector(r, counts.get(r.user_id) ?? 0));
  }

  private async impressionsFor(rows: CandidateRow[]): Promise<Map<string, number>> {
    if (!this.impressions) {
      // Không có nguồn đếm ⇒ mọi người đều "chưa ai thấy hôm nay" ⇒ cơ chế chặn
      // "vua sắc đẹp" trong ranking.ts KHÔNG hoạt động. Nói ra một lần, vì một
      // bộ lọc công bằng bị tắt âm thầm là thứ không ai đi tìm.
      if (!warnedNoImpressions) {
        warnedNoImpressions = true;
        // eslint-disable-next-line no-console
        console.warn(
          "[deck] chưa nối bộ đếm hiển thị (Valkey) — impressionsToday=0 cho mọi ứng viên, " +
            "chặn 'vua sắc đẹp' đang TẮT",
        );
      }
      return new Map();
    }
    return this.impressions(rows.map((r) => BigInt(r.user_id)));
  }
}

/**
 * Bộ chọn cột cho MỘT người — người đang xem deck.
 *
 * Giống truy vấn ứng viên nhưng bỏ hết bộ lọc: người đang xem không phải vượt
 * qua bộ lọc của chính mình, và vẫn phải đọc được hồ sơ mình kể cả khi ảnh còn
 * chờ duyệt.
 */
const VIEWER_SQL = `SELECT u.user_id::text                                            AS user_id,
       p.embedding::text                                            AS embedding,
       p.interests,
       p.lifestyle,
       p.intent,
       p.community,
       ST_Y(p.geo::geometry)                                        AS lat,
       ST_X(p.geo::geometry)                                        AS lng,
       GREATEST(0, EXTRACT(DAY FROM now() - u.last_active_at))::int  AS days_since_active,
       (u.created_at > now() - INTERVAL '7 days')                    AS is_new_user
  FROM profiles p
  JOIN users u ON u.user_id = p.user_id
 WHERE u.user_id = $1::bigint
   AND u.deleted_at IS NULL
 LIMIT 1`;

/**
 * Danh bạ người dùng.
 *
 * BẤT ĐỒNG BỘ, và đó là thay đổi có chủ ý: bản trước là `Map` tra đồng bộ, thứ
 * không tồn tại được khi nguồn là một database. Đổi ở interface thay vì nhét
 * một lớp cache đồng bộ vào giữa — cache đó sẽ phải trả lời "cũ bao lâu thì
 * được", và câu đó chưa có ai hỏi.
 */
export interface UserDirectory {
  get(userId: string): Promise<UserVector | undefined>;
}

export class PgUserDirectory implements UserDirectory {
  constructor(private readonly db: Queryable) {}

  async get(userId: string): Promise<UserVector | undefined> {
    let id: bigint;
    try {
      id = BigInt(userId);
    } catch {
      return undefined; // uid không phải số ⇒ không tồn tại, không phải lỗi 500
    }
    const { rows } = await this.db.query<CandidateRow>(VIEWER_SQL, [id.toString()]);
    const row = rows[0];
    return row ? rowToUserVector(row, 0) : undefined;
  }
}

/** Bọc `Map` sẵn có lại cho khớp interface — giữ nguyên bản demo. */
export class InMemoryUserDirectory implements UserDirectory {
  constructor(private readonly users: Map<string, UserVector>) {}
  async get(userId: string): Promise<UserVector | undefined> {
    return this.users.get(userId);
  }
}
