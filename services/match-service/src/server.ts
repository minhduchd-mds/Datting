import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  InMemoryRedis,
  recordSwipe,
  undoSwipe,
  type RedisLike,
  type SwipeAction,
} from "./mutualLike.js";
import { DeckBuilder, InMemoryCandidateSource } from "./deck.js";
import { buildShards, cellId, type CellLoad } from "./geo.js";
import { effectiveMaxDistanceKm } from "./candidateSql.js";
import { InMemoryUserDirectory, type UserDirectory } from "./pgSource.js";
import type { UserVector } from "./ranking.js";

/**
 * match-service — HTTP API tối thiểu, không phụ thuộc framework.
 *
 * PRODUCTION: thay bằng gRPC sau API Gateway (mô hình TAG của Tinder:
 * xác thực session tập trung tại gateway, service nội bộ tin vào header đã ký).
 * Ở đây dùng node:http để scaffold chạy được với 0 dependency runtime.
 */

export interface Deps {
  redis: RedisLike;
  deck: DeckBuilder;
  /**
   * BẤT ĐỒNG BỘ. Trước đây là `Map<string, UserVector>` tra đồng bộ — thứ
   * không tồn tại được khi nguồn là Postgres. Đổi ở interface chứ không nhét
   * cache đồng bộ vào giữa: cache đó sẽ phải trả lời "cũ bao lâu thì được",
   * và chưa ai hỏi câu đó.
   */
  users: UserDirectory;
  /**
   * Truy vấn hồ sơ theo lô. `undefined` ở bản demo — route trả 501 thay vì
   * giả vờ thành công, vì một danh sách rỗng trông y hệt "không ai quanh đây".
   */
  profiles?: (userIds: string[]) => Promise<unknown[]>;
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

      // ---- POST /v1/swipe/undo --------------------------------------------
      // KHÔNG lùi được `deck.markSwiped`: SeenFilter là Bloom filter, xoá bit
      // là xoá cả những id khác cùng băm vào đó — false negative, tức hiện lại
      // người đã bỏ qua, đúng thứ bộ lọc sinh ra để chặn. Nên người vừa được
      // hoàn tác sẽ không quay lại ở các lô deck SAU; thẻ hiện tại vẫn nằm ở
      // client nên hoàn tác trong phiên vẫn đúng.
      if (req.method === "POST" && url.pathname === "/v1/swipe/undo") {
        const body = await readJson<{ from: string; to: string }>(req);
        const r = await undoSwipe(deps.redis, BigInt(body.from), BigInt(body.to));
        return json(res, r.undone ? 200 : 409, {
          undone: r.undone,
          ...(r.reason ? { reason: r.reason } : {}),
        });
      }

      // ---- POST /v1/profiles -----------------------------------------------
      // Tách khỏi /v1/deck là ĐÚNG CHỨC NĂNG: match-service xếp hạng, không
      // phải kho hồ sơ. Và cổng chặn "ảnh chưa duyệt không hiển thị công khai"
      // phải nằm ở MỘT chỗ — gộp vào deck là nhân đôi chỗ có thể sai.
      if (req.method === "POST" && url.pathname === "/v1/profiles") {
        if (!deps.profiles) {
          return json(res, 501, { error: "chưa nối kho hồ sơ" });
        }
        const body = await readJson<{ user_ids: string[] }>(req);
        const profiles = await deps.profiles(body.user_ids ?? []);
        return json(res, 200, { profiles });
      }

      // ---- GET /v1/deck?uid=...&limit=30 -----------------------------------
      if (req.method === "GET" && url.pathname === "/v1/deck") {
        const uid = url.searchParams.get("uid");
        if (!uid) return json(res, 400, { error: "thiếu uid" });
        const viewer = await deps.users.get(uid);
        if (!viewer) return json(res, 404, { error: "không tìm thấy user" });

        const limit = Number(url.searchParams.get("limit") ?? 30);
        const askedKm = url.searchParams.get("max_km");
        const t0 = performance.now();

        // Giới tính mong muốn và khoảng tuổi đến TỪ DATABASE, không từ URL.
        // `want_genders` suy ra được xu hướng tính dục (NĐ13) — cho client đặt
        // trường này là mở đường liệt kê người dùng theo xu hướng: cứ thử từng
        // giá trị rồi đọc deck trả về. Bán kính thì client thu hẹp được (thanh
        // trượt ở màn lọc) nhưng không nới rộng quá cài đặt đã lưu.
        const out = await deps.deck.build({
          viewer: viewer.vector,
          wantGenders: viewer.prefs.wantGenders,
          ageMin: viewer.prefs.ageMin,
          ageMax: viewer.prefs.ageMax,
          maxDistanceKm: effectiveMaxDistanceKm(
            viewer.prefs.maxDistanceKm,
            askedKm === null ? undefined : Number(askedKm),
          ),
          deckSize: limit,
        });
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
    users: new InMemoryUserDirectory(users),
    pushNudge: async (ids, kind, cursor) => {
      // eslint-disable-next-line no-console
      console.log(`[nudge] ${kind} → ${ids.join(",")} cursor=${cursor}`);
    },
  };
}
