/**
 * Hợp đồng HTTP cho bản web.
 *
 * Nguồn sự thật của các shape này là `services/match-service/src/server.ts`,
 * KHÔNG phải file này và cũng không phải `apps/mobile/src/api.ts`. Hiện có hai
 * bản mô tả cùng một hợp đồng (mobile và web) — đó là NỢ đã biết, và bước gỡ đã
 * ghi trong kế hoạch: tách `packages/api-types` rồi cả hai cùng dùng. Chưa làm ở
 * GĐ 2 vì nó đụng vào mobile, và giữ diff của GĐ 2 đọc được quan trọng hơn.
 *
 * Bản demo tất định theo seed, giống `apps/admin`: cùng seed cho cùng dữ liệu
 * nên bug tái hiện được.
 */

/** Ba chỉ số hiển thị, đúng như màn "It's a Match" trong thiết kế. */
export interface Breakdown {
  interest: number;
  personality: number;
  location: number;
}

export interface DeckCard {
  userId: string;
  name: string;
  age: number;
  /** Nhãn khu vực đã làm mờ. KHÔNG BAO GIỜ là toạ độ. */
  community: string;
  /**
   * Chức danh. CỐ Ý không có trường đơn vị công tác — xem quyết định về bản web
   * trong CLAUDE.md: chức danh thì được, nơi làm thì không.
   */
  jobTitle: string;
  photoUrl: string;
  topics: string[];
  pMatch: number;
  breakdown: Breakdown;
}

export type SwipeAction = "like" | "pass";

export interface SwipeResult {
  matched: boolean;
  pairKey: string;
}

export interface Api {
  fetchDeck(limit: number): Promise<DeckCard[]>;
  swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult>;
}

import { PROFILES, type Profile } from "./data/profiles.js";

export const API_BASE: string = import.meta.env["VITE_API_BASE"] ?? "";
export const IS_DEMO = API_BASE === "";

/** p_match dùng để xếp hạng; breakdown dùng để hiển thị. */
export function displayPercent(b: Breakdown): number {
  return Math.round((b.interest + b.personality + b.location) / 3);
}

/** `min:max` — biểu diễn duy nhất của một cặp. Xem services/match-service/src/pairKey.ts. */
export function pairKeyOf(a: string, b: string): string {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

interface DeckDto {
  cards: { user_id: string; p_match: number; breakdown: Breakdown }[];
}

interface ProfileDto {
  user_id: string;
  name: string;
  age: number;
  community: string;
  job_title?: string;
  photo_url: string;
  topics: string[];
}

class HttpApi implements Api {
  constructor(private readonly base: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      credentials: "include",
    });
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  async fetchDeck(limit: number): Promise<DeckCard[]> {
    const ranked = await this.call<DeckDto>(`/v1/deck?uid=1&limit=${limit}`);
    if (ranked.cards.length === 0) return [];

    const ids = ranked.cards.map((c) => c.user_id);
    const profiles = await this.call<{ profiles: ProfileDto[] }>("/v1/profiles", {
      method: "POST",
      body: JSON.stringify({ user_ids: ids }),
    });
    const byId = new Map(profiles.profiles.map((p) => [p.user_id, p]));

    return ranked.cards.flatMap((c) => {
      const p = byId.get(c.user_id);
      if (!p) return [];
      return [
        {
          userId: p.user_id,
          name: p.name,
          age: p.age,
          community: p.community,
          jobTitle: p.job_title ?? "",
          photoUrl: p.photo_url,
          topics: p.topics,
          pMatch: c.p_match,
          breakdown: c.breakdown,
        },
      ];
    });
  }

  async swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult> {
    const r = await this.call<{ matched: boolean; pair_key: string }>("/v1/swipe", {
      method: "POST",
      body: JSON.stringify({ from: "1", to: toUserId, action }),
    });
    return { matched: r.matched, pairKey: r.pair_key };
  }
}

/* --------------------------------------------------------------------- demo */

/**
 * Bản demo lấy từ bộ 30 hồ sơ trong `data/profiles.ts` — KHÔNG bịa tại chỗ nữa.
 *
 * Nhờ vậy cùng một người xuất hiện nhất quán ở mọi màn (deck, Chờ, Kết nối,
 * Giới thiệu, Thông báo). Trước đây mỗi màn sinh người riêng, nên "Nguyễn Khánh
 * Linh" ở màn này và ở màn kia là hai người khác nhau — thứ khiến demo trông
 * đúng trong ảnh chụp nhưng sai ngay khi bấm qua lại.
 */
class DemoApi implements Api {
  private seq = 0;

  async fetchDeck(limit: number): Promise<DeckCard[]> {
    await new Promise((r) => setTimeout(r, 260));
    const out: DeckCard[] = [];
    for (let i = 0; i < limit; i++) {
      const p = PROFILES[(this.seq + i) % PROFILES.length]!;
      out.push(toDeckCard(p));
    }
    this.seq += limit;
    return out;
  }

  async swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult> {
    await new Promise((r) => setTimeout(r, 110));
    // Tất định theo id thay vì ngẫu nhiên: cùng một người luôn cho cùng kết quả,
    // nên thử lại một kịch bản là ra đúng kịch bản đó.
    const matched = action === "like" && Number(toUserId) % 4 === 0;
    return { matched, pairKey: pairKeyOf("1", toUserId) };
  }
}

export function toDeckCard(p: Profile): DeckCard {
  return {
    userId: p.userId,
    name: p.name,
    age: p.age,
    community: p.community,
    jobTitle: p.jobTitle,
    photoUrl: p.photoUrl,
    topics: p.interests.slice(0, 4),
    pMatch: (p.breakdown.interest * p.breakdown.personality) / 10000,
    breakdown: p.breakdown,
  };
}

export const api: Api = IS_DEMO ? new DemoApi() : new HttpApi(API_BASE);
