import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { InMemoryRedis, recordSwipe, type SwipeAction } from "./mutualLike.js";
import { DeckBuilder, InMemoryCandidateSource } from "./deck.js";
import { buildShards, cellId, type CellLoad } from "./geo.js";
import type { UserVector } from "./ranking.js";

/**
 * match-service — HTTP API tối thiểu, không phụ thuộc framework.
 *
 * PRODUCTION: thay bằng gRPC sau API Gateway (mô hình TAG của Tinder:
 * xác thực session tập trung tại gateway, service nội bộ tin vào header đã ký).
 * Ở đây dùng node:http để scaffold chạy được với 0 dependency runtime.
 */

export interface Deps {
  redis: InMemoryRedis;
  deck: DeckBuilder;
  users: Map<string, UserVector>;
  /** Gọi ws-gateway /push để phát nudge. */
  pushNudge: (userIds: bigint[], kind: string, cursor: string) => Promise<void>;
}

export function createApp(deps: Deps) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/healthz") {
        return json(res, 200, { ok: true });
      }

      // ---- POST /v1/swipe --------------------------------------------------
      if (req.method === "POST" && url.pathname === "/v1/swipe") {
        const body = await readJson<{ from: string; to: string; action: SwipeAction }>(req);
        const result = await recordSwipe(deps.redis, BigInt(body.from), BigInt(body.to), body.action);
        deps.deck.markSwiped(BigInt(body.from), BigInt(body.to));

        if (result.createdMatch) {
          // Đường nóng: báo CẢ HAI phía bằng nudge (không kèm payload).
          await deps.pushNudge([BigInt(body.from), BigInt(body.to)], "match", result.pairKey);
        }
        return json(res, 200, {
          matched: result.matched,
          pair_key: result.pairKey,
          // Chỉ trả cờ, KHÔNG trả hồ sơ — client tự fetch. Đây là mô hình nudge.
        });
      }

      // ---- GET /v1/deck?uid=...&limit=30 -----------------------------------
      if (req.method === "GET" && url.pathname === "/v1/deck") {
        const uid = url.searchParams.get("uid");
        if (!uid) return json(res, 400, { error: "thiếu uid" });
        const viewer = deps.users.get(uid);
        if (!viewer) return json(res, 404, { error: "không tìm thấy user" });

        const limit = Number(url.searchParams.get("limit") ?? 30);
        const maxKm = Number(url.searchParams.get("max_km") ?? 50);
        const t0 = performance.now();
        const out = await deps.deck.build({ viewer, deckSize: limit, maxDistanceKm: maxKm });
        return json(res, 200, {
          cards: out.cards.map((c) => ({
            user_id: c.userId.toString(),
            p_match: Number(c.pMatch.toFixed(4)),
            // Đúng như màn "It's a Match" trong Figma: 90% / 80% / 85%
            breakdown: {
              interest: c.explanation.interestScore,
              personality: c.explanation.personalityScore,
              location: c.explanation.locationScore,
            },
            common_points: {
              shared_interests: c.explanation.sharedInterests,
              shared_lifestyle: c.explanation.sharedLifestyle,
              same_community: c.explanation.sameCommunity,
              shared_intent: c.explanation.sharedIntent,
            },
          })),
          meta: {
            shards_queried: out.shardsQueried,
            retrieved: out.retrievedCount,
            latency_ms: Number((performance.now() - t0).toFixed(2)),
          },
        });
      }

      return json(res, 404, { error: "not found" });
    } catch (err) {
      return json(res, 500, { error: String(err) });
    }
  });
}

function json(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

/** Dữ liệu mẫu để chạy thử ngay: `npm run dev` rồi gọi /v1/deck?uid=1 */
export function demoDeps(): Deps {
  const interests = ["Chạy bộ", "Cà phê", "Đọc sách", "Nghe nhạc", "Du lịch", "Nấu ăn", "Gym", "Yoga"];
  const lifestyle = ["Dậy sớm", "Thức khuya", "Không hút thuốc", "Thỉnh thoảng uống", "Nuôi thú cưng", "Ăn chay"];
  // `community` ở đây là quận/khu vực — chỉ dùng làm TRỤC ĐA DẠNG HOÁ, không
  // phải tiêu chí xếp hạng. Xem ghi chú trong ranking.ts.
  const communities = ["Cầu Giấy", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Thanh Xuân"];
  const users = new Map<string, UserVector>();
  const list: UserVector[] = [];

  // Sinh dữ liệu tất định (không random) để test lặp lại được.
  for (let i = 1; i <= 500; i++) {
    const emb = Array.from({ length: 8 }, (_, k) => Math.sin(i * (k + 1) * 0.37));
    const norm = Math.hypot(...emb);
    const u: UserVector = {
      userId: BigInt(i),
      embedding: emb.map((v) => v / norm),
      interests: [interests[i % 8]!, interests[(i * 3) % 8]!],
      lifestyle: [lifestyle[i % 6]!, lifestyle[(i * 5) % 6]!],
      intent: ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước"].slice(0, (i % 3) + 1),
      community: communities[i % 5]!,
      loc: { lat: 21.0 + (i % 40) * 0.01, lng: 105.8 + (i % 37) * 0.01 },
      daysSinceActive: i % 14,
      impressionsToday: (i * 7) % 500,
      isNewUser: i % 11 === 0,
    };
    users.set(String(i), u);
    list.push(u);
  }

  const cells: CellLoad[] = [];
  const seenCells = new Set<string>();
  for (const u of list) {
    const c = cellId(u.loc, 8);
    if (!seenCells.has(c.toString())) {
      seenCells.add(c.toString());
      cells.push({ cell: c, load: 1 });
    }
  }
  const shards = buildShards(cells, 4);
  const deck = new DeckBuilder(shards, new InMemoryCandidateSource(list, shards));

  return {
    redis: new InMemoryRedis(),
    deck,
    users,
    pushNudge: async (ids, kind, cursor) => {
      // eslint-disable-next-line no-console
      console.log(`[nudge] ${kind} → ${ids.join(",")} cursor=${cursor}`);
    },
  };
}
