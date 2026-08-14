import { buildShards, cellId, shardsForRadius, type LatLng, type CellLoad, type Shard } from "./geo.js";
import { diversify, scoreCandidates, DEFAULT_DIVERSITY, type ScoredCandidate, type UserVector } from "./ranking.js";
import { SeenFilter } from "./seen.js";

/**
 * Pipeline sinh deck 3 tầng.
 *
 *   TẦNG 1 truy hồi   ~50M → ~1.000   < 30ms   lọc cứng + ANN
 *   TẦNG 2 xếp hạng   ~1.000 → ~100   < 50ms   P(Match) = P(A→B)·P(B→A)
 *   TẦNG 3 đa dạng    ~100 → 30 thẻ   < 10ms   luật kinh doanh + giải thích
 *
 * Ở scaffold này Tầng 1 dùng bộ nhớ; production thay bằng truy vấn
 * OpenSearch geoshard + Qdrant ANN. Ranh giới interface giữ nguyên.
 */

export interface DeckRequest {
  viewer: UserVector;
  wantGenders?: number[];
  ageMin?: number;
  ageMax?: number;
  maxDistanceKm?: number;
  deckSize?: number;
}

export interface CandidateSource {
  /** Trả về ứng viên thô trong các shard chỉ định (Tầng 1). */
  retrieve(shardIds: number[], req: DeckRequest, limit: number): Promise<UserVector[]>;
}

export interface DeckResult {
  cards: ScoredCandidate[];
  /** Số shard thực sự bị truy vấn — chỉ số vận hành quan trọng nhất của geosharding. */
  shardsQueried: number;
  retrievedCount: number;
}

export class DeckBuilder {
  constructor(
    private readonly shards: Shard[],
    private readonly source: CandidateSource,
    private readonly seenByUser: Map<string, SeenFilter> = new Map(),
  ) {}

  static fromCellLoads(cells: CellLoad[], targetShards: number, source: CandidateSource): DeckBuilder {
    return new DeckBuilder(buildShards(cells, targetShards), source);
  }

  seenOf(userId: bigint): SeenFilter {
    const k = userId.toString();
    let f = this.seenByUser.get(k);
    if (!f) {
      f = new SeenFilter();
      this.seenByUser.set(k, f);
    }
    return f;
  }

  markSwiped(viewer: bigint, target: bigint): void {
    this.seenOf(viewer).add(target);
  }

  async build(req: DeckRequest): Promise<DeckResult> {
    const maxKm = req.maxDistanceKm ?? 50;
    const deckSize = req.deckSize ?? DEFAULT_DIVERSITY.deckSize;

    // TẦNG 1 — chặn phạm vi bằng geoshard TRƯỚC khi chạm tới ML.
    // Nguyên tắc: không bao giờ để một truy vấn quét toàn bộ user.
    const shardIds = shardsForRadius(this.shards, req.viewer.loc, maxKm);
    const raw = await this.source.retrieve(shardIds, req, deckSize * 40);

    const seen = this.seenOf(req.viewer.userId);
    const filtered = raw.filter(
      (c) => c.userId !== req.viewer.userId && !seen.mayHaveSeen(c.userId),
    );

    // TẦNG 2
    const scored = scoreCandidates(req.viewer, filtered, maxKm).slice(0, 100);

    // TẦNG 3
    const pool = new Map(filtered.map((u) => [u.userId.toString(), u]));
    const cards = diversify(scored, pool, { ...DEFAULT_DIVERSITY, deckSize });

    return { cards, shardsQueried: shardIds.length, retrievedCount: filtered.length };
  }
}

/** Nguồn ứng viên trong bộ nhớ — dùng cho test và chạy local. */
export class InMemoryCandidateSource implements CandidateSource {
  constructor(
    private readonly users: UserVector[],
    private readonly shards: Shard[],
    private readonly level = 8,
  ) {}

  async retrieve(shardIds: number[], _req: DeckRequest, limit: number): Promise<UserVector[]> {
    const wanted = new Set(shardIds);
    const cellToShard = new Map<bigint, number>();
    for (const s of this.shards) for (const c of s.cells) cellToShard.set(c, s.shardId);

    const out: UserVector[] = [];
    for (const u of this.users) {
      const sid = cellToShard.get(cellId(u.loc, this.level));
      if (sid !== undefined && wanted.has(sid)) out.push(u);
      if (out.length >= limit) break;
    }
    return out;
  }
}

export type { LatLng };
