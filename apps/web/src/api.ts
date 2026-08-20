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

/**
 * Trạng thái một tin nhắn. Sao ĐÚNG hợp đồng đã có ở
 * `apps/mobile/src/screens/SocialScreens.tsx` — không định nghĩa lại.
 */
export type MessageStatus = "sending" | "sent" | "failed" | "read";

export interface Message {
  id: string;
  body: string;
  fromMe: boolean;
  /** Mili-giây kể từ epoch. */
  at: number;
  status: MessageStatus;
}

export interface Api {
  fetchDeck(limit: number): Promise<DeckCard[]>;
  swipe(toUserId: string, action: SwipeAction): Promise<SwipeResult>;
  /**
   * Hai phương thức dưới đây khớp `GET|POST /v1/matches/:pairKey/messages` —
   * endpoint đã được khai trong `apps/mobile/src/api.ts` từ trước, và
   * `NudgeMessage` ở `services/ws-gateway` đã trù tính cho chúng. Bảng
   * `messages` được thêm ở `db/migrations/0002_messages.sql`.
   */
  fetchMessages(pairKey: string): Promise<Message[]>;
  sendMessage(pairKey: string, body: string): Promise<Message>;

  /**
   * An toàn. Ba chữ ký khớp `apps/mobile/src/api.ts` — bản mobile đã có từ
   * trước, bản web thì chưa có gì cho tới nay.
   */
  report(userId: string, code: number, detail: string): Promise<void>;
  block(userId: string): Promise<void>;
  unmatch(pairKey: string): Promise<void>;

  /**
   * Đồng ý theo NĐ13.
   *
   * `purpose` là chuỗi rời chứ không phải một cờ chung, vì nghị định đòi mỗi
   * mục đích một đồng ý RIÊNG: vị trí và xu hướng tính dục là hai loại dữ liệu
   * nhạy cảm khác nhau. Một ô tích "Tôi đồng ý với điều khoản" là không hợp lệ.
   * Khớp cột `consents.purpose`.
   */
  setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void>;
  /** Xoá mềm. Purge cứng sau 30 ngày — do phía máy chủ hẹn giờ. */
  deleteAccount(): Promise<void>;
}

/** KHỚP giá trị cột `consents.purpose` trong `0001_init.sql`. */
export type ConsentPurpose = "location" | "orientation" | "photo_processing" | "marketing";

/**
 * Id của người đang đăng nhập.
 *
 * Là hằng số vì bản web chưa có đăng nhập — không SĐT+OTP, không cổng tuổi,
 * không onboarding. Đặt tên rõ ở MỘT chỗ để khi có phiên thật thì chỉ phải sửa
 * đúng đây, thay vì đi tìm chuỗi "1" rải khắp nơi.
 */
export const ME_ID = "1";

/**
 * Phiên bản chính sách mà người dùng đang đồng ý.
 *
 * Hiện là hằng số ở client, và đó là TẠM: nguồn sự thật phải là server, vì
 * `consents.policy_version` tồn tại chính để chứng minh người dùng đã đồng ý
 * với BẢN NÀO. Client tự khai phiên bản thì chứng cứ đó tự nó mâu thuẫn ngay
 * khi còn client cũ đang chạy. Để lộ ra ở đây để không ai tưởng nó đã đúng.
 */
export const POLICY_VERSION = "2026-08-01";

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
      body: JSON.stringify({ from: ME_ID, to: toUserId, action }),
    });
    return { matched: r.matched, pairKey: r.pair_key };
  }

  async fetchMessages(pairKey: string): Promise<Message[]> {
    const r = await this.call<{ messages: MessageDto[] }>(
      `/v1/matches/${encodeURIComponent(pairKey)}/messages`,
    );
    return r.messages.map(toMessage);
  }

  async sendMessage(pairKey: string, body: string): Promise<Message> {
    const r = await this.call<MessageDto>(
      `/v1/matches/${encodeURIComponent(pairKey)}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
    return toMessage(r);
  }

  async report(userId: string, code: number, detail: string): Promise<void> {
    await this.call(`/v1/users/${encodeURIComponent(userId)}/report`, {
      method: "POST",
      body: JSON.stringify({ reason: code, detail }),
    });
  }

  async block(userId: string): Promise<void> {
    await this.call(`/v1/users/${encodeURIComponent(userId)}/block`, { method: "POST" });
  }

  async unmatch(pairKey: string): Promise<void> {
    await this.call(`/v1/matches/${encodeURIComponent(pairKey)}`, { method: "DELETE" });
  }

  async setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void> {
    await this.call("/v1/me/consents", {
      method: "POST",
      body: JSON.stringify({ purpose, granted }),
    });
  }

  async deleteAccount(): Promise<void> {
    await this.call("/v1/me", { method: "DELETE" });
  }
}

interface MessageDto {
  message_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at?: string | null;
}

function toMessage(d: MessageDto): Message {
  return {
    id: d.message_id,
    body: d.body,
    fromMe: d.sender_id === ME_ID,
    at: Date.parse(d.created_at),
    // Tin của người kia không có trạng thái gửi — dùng "read" để không hiện
    // nhãn nào, vì bong bóng chỉ hiện nhãn cho tin CỦA MÌNH chưa gửi xong.
    status: d.sender_id === ME_ID ? (d.read_at ? "read" : "sent") : "read",
  };
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
    return { matched, pairKey: pairKeyOf(ME_ID, toUserId) };
  }

  /**
   * Hội thoại demo giữ TRONG BỘ NHỚ, khoá theo `pairKey`.
   *
   * Nhờ vậy tin nhắn gửi ở màn này còn nguyên khi đóng lớp phủ rồi mở lại —
   * thứ mà một mảng cục bộ trong component không làm được. Mất khi tải lại
   * trang, và đúng như vậy: đây là demo, không phải bộ nhớ bền.
   */
  private threads = new Map<string, Message[]>();
  private nextId = 1;

  async fetchMessages(pairKey: string): Promise<Message[]> {
    await new Promise((r) => setTimeout(r, 180));
    return this.threads.get(pairKey) ?? [];
  }

  async sendMessage(pairKey: string, body: string): Promise<Message> {
    await new Promise((r) => setTimeout(r, 240));
    const msg: Message = {
      id: `d${this.nextId++}`,
      body,
      fromMe: true,
      at: Date.now(),
      status: "sent",
    };
    this.threads.set(pairKey, [...(this.threads.get(pairKey) ?? []), msg]);
    return msg;
  }

  // Bản demo CHỈ trễ rồi trả về. Không giả vờ thất bại ngẫu nhiên: một demo
  // thỉnh thoảng hỏng khiến người xem không phân biệt được lỗi thật với kịch
  // bản dựng sẵn.
  async report(): Promise<void> {
    await new Promise((r) => setTimeout(r, 320));
  }

  async block(): Promise<void> {
    await new Promise((r) => setTimeout(r, 320));
  }

  async unmatch(): Promise<void> {
    await new Promise((r) => setTimeout(r, 320));
  }

  async setConsent(): Promise<void> {
    await new Promise((r) => setTimeout(r, 220));
  }

  async deleteAccount(): Promise<void> {
    await new Promise((r) => setTimeout(r, 400));
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
