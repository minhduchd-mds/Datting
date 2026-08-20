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
   * Ba danh sách người. Hai cái đầu khớp `ENDPOINTS.matches` / `ENDPOINTS.likesYou`
   * đã khai ở `apps/mobile/src/api.ts`; `introductions` là endpoint mới — bảng
   * `introductions` có đủ cột từ `0001_init.sql`, chỉ chưa ai phục vụ nó.
   */
  fetchMatches(): Promise<MatchSummary[]>;
  fetchLikesYou(): Promise<LikeItem[]>;
  fetchIntroductions(): Promise<IntroItem[]>;

  /**
   * Thư viện ảnh và liên kết của MỘT người.
   *
   * Hai thứ đi chung một lượt gọi vì màn hồ sơ luôn cần cả hai, và cả hai đều
   * do SERVER lọc: ảnh chỉ trả tấm đã duyệt, liên kết chỉ trả khi đủ điều kiện
   * nhìn thấy. Client KHÔNG được tự lọc — lọc ở client thì dữ liệu đã rời khỏi
   * server rồi, tức là đã rò.
   */
  fetchGallery(userId: string): Promise<Gallery>;

  /** Hồ sơ của chính tôi, và cập nhật nó. */
  fetchMyProfile(): Promise<Profile>;
  updateProfile(patch: ProfileEdit): Promise<Profile>;

  /**
   * Thư viện ảnh CỦA TÔI — khác `fetchGallery` ở chỗ trả cả ảnh chưa duyệt.
   * Người ta phải thấy tấm mình vừa tải lên đang ở trạng thái nào; đường công
   * khai thì vẫn chỉ trả ảnh đã duyệt.
   */
  fetchMyPhotos(): Promise<MyPhoto[]>;
  /** Ảnh mới luôn vào trạng thái CHỜ DUYỆT — xem ghi chú ở service. */
  uploadPhoto(file: File): Promise<MyPhoto>;
  deletePhoto(position: number): Promise<void>;

  /**
   * Lịch sử điểm hồ sơ. Server chỉ ghi mốc khi điểm THAY ĐỔI, nên mảng này là
   * các bước nhảy thật chứ không phải một mẫu đều theo thời gian.
   */
  fetchScoreHistory(): Promise<ScorePoint[]>;

  fetchMyLinks(): Promise<ProfileLink[]>;
  /** Handle rỗng = XOÁ liên kết của nền tảng đó. */
  saveLink(platform: LinkPlatform, handle: string, visibility?: LinkVisibility): Promise<void>;

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
  /**
   * Xin mã OTP. `devCode` CHỈ có mặt khi service bật `OTP_DEV_ECHO=1` và
   * không phải production — máy dev không có nhà mạng để gửi SMS thật.
   */
  requestOtp(phone: string): Promise<{ resendAfterS: number; devCode?: string }>;
  /**
   * Trả `null` khi mã sai, KHÔNG ném lỗi: gõ nhầm mã là kết quả bình thường
   * của luồng này, không phải sự cố. Ném exception cho một nhánh dự kiến bắt
   * mọi lớp gọi phía trên bọc try/catch chỉ để xử lý "người dùng gõ nhầm".
   */
  verifyOtp(phone: string, code: string): Promise<{ userId: string; token: string } | null>;
  signOut(): Promise<void>;
  /**
   * Tạo hồ sơ lúc onboarding. Tách khỏi `updateProfile`: tên, ngày sinh và
   * giới tính là DANH TÍNH, chỉ đặt một lần — `updateProfile` cố ý không cho
   * sửa chúng, vì ngày sinh đổi được sau khi vào app thì cổng tuổi vô nghĩa.
   */
  createProfile(p: {
    displayName: string;
    birthDate: string;
    gender: 0 | 1;
    jobTitle: string;
    community: string;
    interests: string[];
  }): Promise<void>;
  /** `q` rỗng thì trả phòng sôi động nhất; có `q` thì tìm theo tên (trigram). */
  listRooms(q: string): Promise<RoomSummary[]>;
  createRoom(title: string, topic: string, maxMembers: number): Promise<string>;
  viewRoom(roomId: string): Promise<RoomView>;
  joinRoom(roomId: string): Promise<{ ok: boolean; reason?: string }>;
  leaveRoom(roomId: string): Promise<void>;
  postRoomMessage(roomId: string, body: string): Promise<{ ok: boolean; reason?: string }>;
  listGifts(): Promise<Gift[]>;
  sendGift(roomId: string, toUser: string, giftId: number, qty: number): Promise<GiftSendResult>;
  fetchWallet(): Promise<Wallet>;
  topUp(coins: number): Promise<Wallet>;
  subscribe(tier: string, days: number): Promise<void>;
  setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void>;
  /** Xoá mềm. Purge cứng sau 30 ngày — do phía máy chủ hẹn giờ. */
  deleteAccount(): Promise<void>;
}

/** KHỚP giá trị cột `consents.purpose` trong `0001_init.sql`. */
export type ConsentPurpose = "location" | "orientation" | "photo_processing" | "marketing";

/** KHỚP cột `profile_links.platform` (0..4) qua tên do service trả về. */
export type LinkPlatform = "instagram" | "tiktok" | "spotify" | "facebook" | "khac";
/** 0 ẩn · 1 chỉ sau khi kết nối · 2 công khai. Mặc định 1 — xem `0005_profile_links.sql`. */
export type LinkVisibility = 0 | 1 | 2;

export interface ProfileLink {
  platform: LinkPlatform;
  handle: string;
  /** Server dựng URL từ handle. Client KHÔNG tự ghép — đó là chỗ lọt link giả. */
  url: string;
  visibility: LinkVisibility;
}

/**
 * Một tấm ảnh trong thư viện của chính tôi.
 *
 * `moderation`: 0 chờ duyệt · 1 đã duyệt · 2 làm mờ · 3 chặn. Khớp cột
 * `photos.moderation`. Giao diện PHẢI hiện trạng thái này — ảnh chưa duyệt
 * không hiển thị công khai, và người dùng có quyền biết điều đó thay vì tưởng
 * ảnh đã lên.
 */
export interface MyPhoto {
  position: number;
  /** Tên cột trong CSDL là `cdn_key`; ở đây nó đã là URL đầy đủ. */
  cdn_key: string;
  moderation: 0 | 1 | 2 | 3;
}

/** Một mốc trong lịch sử điểm. `at` là epoch mili-giây. */
export interface ScorePoint {
  at: number;
  score: number;
  /** 0 khởi tạo · 1 sửa hồ sơ · 2 đổi ảnh · 3 kết quả kiểm duyệt. */
  reason: 0 | 1 | 2 | 3;
}

export interface Gallery {
  /** ĐÃ được server lọc: chỉ ảnh duyệt rồi. */
  photos: { position: number; url: string }[];
  /** ĐÃ được server lọc theo `visibility` và quan hệ kết nối. */
  links: ProfileLink[];
}

/** Những trường người dùng được tự sửa. Cố tình KHÔNG có `verified`, `age`, `gender`. */
export interface ProfileEdit {
  bio?: string;
  jobTitle?: string;
  community?: string;
  interests?: string[];
  lifestyle?: string[];
  intent?: string;
}

/** Một kết nối, kèm tin cuối và số chưa đọc — cả hai tính ở server. */
export interface MatchSummary {
  /** Chính là `pair_key` dạng `min:max`. */
  matchId: string;
  peer: Profile;
  lastMessage: string | null;
  lastAt: number;
  unread: number;
}

/** Một lượt thích đến mà tôi CHƯA quyết. */
export interface LikeItem {
  peer: Profile;
  /** Người kia thích cái gì — hồ sơ, một tấm ảnh, hay một câu trả lời. */
  likedTarget: { kind: "profile" | "photo" | "prompt"; label: string };
  likedAt: number;
}

/** Một lời giới thiệu đang chờ tôi. */
export interface IntroItem {
  peer: Profile;
  introducer: string;
  note?: string | undefined;
  at: number;
}

/**
 * DTO hồ sơ của service → `Profile` mà các màn đang dùng.
 *
 * Một chỗ chuyển đổi duy nhất. Nếu để mỗi màn tự đọc `photo_url` hay
 * `days_since_active`, thì mỗi lần server đổi tên trường sẽ phải sửa nhiều nơi
 * và chỗ nào quên sẽ hỏng lặng lẽ ở runtime chứ không đỏ lúc biên dịch.
 */
interface PeerDto {
  user_id: string;
  name: string;
  age: number;
  gender: number;
  bio: string;
  community: string;
  job_title?: string;
  photo_url: string;
  interests: string[];
  lifestyle: string[];
  intent: string;
  verified: boolean;
  days_since_active: number;
  prompts: { question: string; answer: string }[];
  breakdown: Breakdown;
}

function toProfile(d: PeerDto): Profile {
  return {
    userId: d.user_id,
    name: d.name,
    age: d.age,
    gender: (d.gender === 1 ? 1 : 0) as 0 | 1,
    jobTitle: d.job_title ?? "",
    community: d.community,
    bio: d.bio,
    interests: d.interests,
    lifestyle: d.lifestyle,
    intent: d.intent,
    prompts: d.prompts,
    verified: d.verified,
    daysSinceActive: d.days_since_active,
    photoUrl: d.photo_url,
    breakdown: d.breakdown,
  };
}

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
 * PHÁT LẠI từ `@datting/core`, không khai lại. Trước đây chỗ này khai riêng
 * `"2026-08-01"` trong khi core (và mobile) dùng `"2026-08-14"` — hai bản đã
 * lệch nhau trong im lặng. Hậu quả không phải lỗi biên dịch mà là chứng cứ
 * pháp lý mâu thuẫn: cùng một người, cùng một hành động đồng ý, ghi vào
 * `consents.policy_version` hai giá trị khác nhau tuỳ họ bấm trên web hay
 * trên điện thoại.
 *
 * Vẫn còn TẠM ở chỗ khác: nguồn sự thật đúng ra phải là server, vì client tự
 * khai phiên bản thì client cũ còn chạy là chứng cứ còn sai. Ghi ra đây để
 * không ai tưởng phần đó đã xong.
 */
export { POLICY_VERSION } from "@datting/core";
// Bản re-export ở trên không tạo binding dùng được trong file này, nên import
// thêm một lần nữa để `setConsent` gọi tới.
import { POLICY_VERSION } from "@datting/core";

import { PROFILES, type Profile } from "./data/profiles.js";
import { currentSession } from "./session.js";

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


/* --- Phong nhieu nguoi, qua tang, vi ------------------------------------ */

export interface RoomSummary {
  roomId: string;
  ownerId: string;
  title: string;
  topic: string | null;
  memberCount: number;
  maxMembers: number;
}

export interface RoomMessage {
  messageId: string;
  senderId: string;
  name: string;
  body: string;
}

export interface RoomMember {
  userId: string;
  name: string;
  /** 0 người xem · 1 điều phối · 2 chủ phòng. */
  role: number;
}

export interface RoomGiftEvent {
  id: string;
  qty: number;
  glyph: string;
  name: string;
  fromName: string;
  toName: string;
}

export interface RoomView {
  room: RoomSummary & { status: number };
  joined: boolean;
  messages: RoomMessage[];
  members: RoomMember[];
  gifts: RoomGiftEvent[];
}

export interface Gift {
  giftId: number;
  code: string;
  name: string;
  /** Giá bằng XU. Số nguyên — xem đầu `0011_wallet.sql`. */
  price: number;
  glyph: string;
}

export interface Wallet {
  balance: number;
  tier: string | null;
  tierExpiresAt: string | null;
}

export type GiftSendResult =
  | { ok: true; spent: number; earned: number; balance: number }
  /** `thieuXu` tách riêng để giao diện mở màn nạp thay vì hiện lỗi chung. */
  | { ok: false; reason: string; thieuXu: boolean };

interface RoomDto {
  room_id: string;
  owner_id: string;
  title: string;
  topic: string | null;
  member_count: number;
  max_members: number;
  status?: number;
}
interface RoomViewDto {
  room: RoomDto;
  joined: boolean;
  messages: { message_id: string; sender_id: string; body: string; name: string }[];
  members: { user_id: string; role: number; name: string }[];
  gifts: {
    gift_event_id: string;
    qty: number;
    glyph: string;
    name: string;
    from_name: string;
    to_name: string;
  }[];
}
interface GiftDto {
  gift_id: number;
  code: string;
  name: string;
  price: number;
  glyph: string;
}

function toRoom(d: RoomDto): RoomSummary {
  return {
    roomId: d.room_id,
    ownerId: d.owner_id,
    title: d.title,
    topic: d.topic,
    memberCount: d.member_count,
    maxMembers: d.max_members,
  };
}

class HttpApi implements Api {
  constructor(private readonly base: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    /*
     * Gắn token khi CÓ, và chỉ khi có.
     *
     * Gửi `Authorization: Bearer null` lúc chưa đăng nhập sẽ bị server trả 401
     * — nó phân biệt "không gửi token" với "token hỏng", và cố tình không gộp
     * hai thứ đó (xem `Caller` trong message-service/src/auth.ts). Nên chỗ này
     * phải bỏ hẳn header, không phải gửi một giá trị rỗng.
     */
    const token = currentSession().token;
    const res = await fetch(this.base + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
      credentials: "include",
    });
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  async requestOtp(phone: string): Promise<{ resendAfterS: number; devCode?: string }> {
    const r = await this.call<{ resend_after_s: number; dev_code?: string }>(
      "/v1/auth/otp/request",
      { method: "POST", body: JSON.stringify({ phone }) },
    );
    return r.dev_code === undefined
      ? { resendAfterS: r.resend_after_s }
      : { resendAfterS: r.resend_after_s, devCode: r.dev_code };
  }

  async verifyOtp(phone: string, code: string): Promise<{ userId: string; token: string } | null> {
    try {
      const r = await this.call<{ user_id: string; token: string }>("/v1/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      });
      return { userId: r.user_id, token: r.token };
    } catch {
      // `call` ném cho mọi mã lỗi. Ở đây 401 là "mã sai" — một nhánh bình
      // thường, nên nuốt và trả `null` đúng như hợp đồng ở interface.
      return null;
    }
  }

  async createProfile(p: {
    displayName: string; birthDate: string; gender: 0 | 1;
    jobTitle: string; community: string; interests: string[];
  }): Promise<void> {
    await this.call("/v1/me/profile", {
      method: "PUT",
      body: JSON.stringify({
        display_name: p.displayName,
        birth_date: p.birthDate,
        gender: p.gender,
        job_title: p.jobTitle,
        community: p.community,
        interests: p.interests,
      }),
    });
  }

  async listRooms(q: string): Promise<RoomSummary[]> {
    const r = await this.call<{ rooms: RoomDto[] }>(
      `/v1/rooms?q=${encodeURIComponent(q)}&limit=40`,
    );
    return r.rooms.map(toRoom);
  }

  async createRoom(title: string, topic: string, maxMembers: number): Promise<string> {
    const r = await this.call<{ room_id: string }>("/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ title, topic, max_members: maxMembers }),
    });
    return r.room_id;
  }

  async viewRoom(roomId: string): Promise<RoomView> {
    const r = await this.call<RoomViewDto>(`/v1/rooms/${roomId}`);
    return {
      room: { ...toRoom(r.room), status: r.room.status ?? 0 },
      joined: r.joined,
      messages: r.messages.map((m) => ({
        messageId: m.message_id,
        senderId: m.sender_id,
        name: m.name,
        body: m.body,
      })),
      members: r.members.map((m) => ({ userId: m.user_id, name: m.name, role: m.role })),
      gifts: r.gifts.map((g) => ({
        id: g.gift_event_id,
        qty: g.qty,
        glyph: g.glyph,
        name: g.name,
        fromName: g.from_name,
        toName: g.to_name,
      })),
    };
  }

  async joinRoom(roomId: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.call(`/v1/rooms/${roomId}/join`, { method: "POST" });
      return { ok: true };
    } catch {
      // 409 mang lý do thật (đầy/đóng/tạm dừng), nhưng `call` chỉ ném Error.
      // Nói chung chung còn hơn nói sai — lý do đúng hiện ra ở lần tải lại.
      return { ok: false, reason: "Không vào được phòng." };
    }
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.call(`/v1/rooms/${roomId}/leave`, { method: "POST" });
  }

  async postRoomMessage(roomId: string, body: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.call(`/v1/rooms/${roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      return { ok: true };
    } catch (e) {
      // 429 = gửi quá nhanh. Đây là nhánh BÌNH THƯỜNG của một phòng đông, không
      // phải sự cố — nên nó phải nói đúng thứ người dùng cần làm: chờ một chút.
      const s429 = e instanceof Error && e.message.endsWith("429");
      return {
        ok: false,
        reason: s429 ? "Bạn đang gửi quá nhanh. Chờ vài giây." : "Không gửi được.",
      };
    }
  }

  async listGifts(): Promise<Gift[]> {
    const r = await this.call<{ gifts: GiftDto[] }>("/v1/gifts");
    return r.gifts.map((g) => ({
      giftId: g.gift_id,
      code: g.code,
      name: g.name,
      price: g.price,
      glyph: g.glyph,
    }));
  }

  async sendGift(
    roomId: string,
    toUser: string,
    giftId: number,
    qty: number,
  ): Promise<GiftSendResult> {
    try {
      const r = await this.call<{ spent: number; earned: number; balance: number }>(
        `/v1/rooms/${roomId}/gifts`,
        { method: "POST", body: JSON.stringify({ to_user: toUser, gift_id: giftId, qty }) },
      );
      return { ok: true, spent: r.spent, earned: r.earned, balance: r.balance };
    } catch (e) {
      // Server trả 402 RIÊNG cho "không đủ xu" để client mở được màn nạp.
      const thieu = e instanceof Error && e.message.endsWith("402");
      return {
        ok: false,
        thieuXu: thieu,
        reason: thieu ? "Không đủ xu." : "Không tặng được quà.",
      };
    }
  }

  async fetchWallet(): Promise<Wallet> {
    const r = await this.call<{
      balance: number;
      tier: string | null;
      tier_expires_at: string | null;
    }>("/v1/me/wallet");
    return { balance: r.balance, tier: r.tier, tierExpiresAt: r.tier_expires_at };
  }

  async topUp(coins: number): Promise<Wallet> {
    await this.call("/v1/me/topup", { method: "POST", body: JSON.stringify({ coins }) });
    return this.fetchWallet();
  }

  async subscribe(tier: string, days: number): Promise<void> {
    await this.call("/v1/me/subscribe", { method: "POST", body: JSON.stringify({ tier, days }) });
  }

  async signOut(): Promise<void> {
    // Thu hồi ở SERVER. Client quên token là chưa đủ — bản sao token vẫn dùng
    // được cho tới khi hàng trong `auth_tokens` bị xoá.
    try {
      await this.call("/v1/auth/sign-out", { method: "POST" });
    } catch {
      // Mạng hỏng không được chặn người dùng đăng xuất khỏi máy này.
    }
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

  async fetchMatches(): Promise<MatchSummary[]> {
    const r = await this.call<{
      matches: { match_id: string; peer: PeerDto; last_message?: string; last_at: number; unread: number }[];
    }>("/v1/matches");
    return r.matches.map((m) => ({
      matchId: m.match_id,
      peer: toProfile(m.peer),
      lastMessage: m.last_message ?? null,
      lastAt: m.last_at,
      unread: m.unread,
    }));
  }

  async fetchLikesYou(): Promise<LikeItem[]> {
    const r = await this.call<{
      items: { peer: PeerDto; liked_target: LikeItem["likedTarget"]; liked_at: number }[];
    }>("/v1/me/likes-you");
    return r.items.map((i) => ({
      peer: toProfile(i.peer),
      likedTarget: i.liked_target,
      likedAt: i.liked_at,
    }));
  }

  async fetchIntroductions(): Promise<IntroItem[]> {
    const r = await this.call<{
      introductions: { peer: PeerDto; introducer: string; note?: string; at: number }[];
    }>("/v1/me/introductions");
    return r.introductions.map((i) => ({
      peer: toProfile(i.peer),
      introducer: i.introducer,
      note: i.note,
      at: i.at,
    }));
  }

  async fetchGallery(userId: string): Promise<Gallery> {
    return this.call<Gallery>(`/v1/users/${encodeURIComponent(userId)}/gallery`);
  }

  async fetchMyProfile(): Promise<Profile> {
    return toProfile(await this.call<PeerDto>("/v1/me/profile"));
  }

  async updateProfile(patch: ProfileEdit): Promise<Profile> {
    // Gửi snake_case vì đó là hình dạng của service; chuyển đổi ở ĐÂY chứ không
    // bắt màn hình biết hai cách đặt tên.
    const body: Record<string, unknown> = {};
    if (patch.bio !== undefined) body["bio"] = patch.bio;
    if (patch.jobTitle !== undefined) body["job_title"] = patch.jobTitle;
    if (patch.community !== undefined) body["community"] = patch.community;
    if (patch.interests !== undefined) body["interests"] = patch.interests;
    if (patch.lifestyle !== undefined) body["lifestyle"] = patch.lifestyle;
    if (patch.intent !== undefined) body["intent"] = patch.intent;
    return toProfile(
      await this.call<PeerDto>("/v1/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
    );
  }

  async fetchMyPhotos(): Promise<MyPhoto[]> {
    const r = await this.call<{ photos: MyPhoto[] }>("/v1/me/photos");
    return r.photos;
  }

  async uploadPhoto(file: File): Promise<MyPhoto> {
    // Gửi base64 trong JSON thay vì multipart: multipart cần một bộ phân tích
    // ở server, còn ở đây một endpoint JSON là đủ và không thêm phụ thuộc.
    // Đánh đổi đã biết: base64 phình ~33%, nên trần thân request bên service
    // phải rộng hơn trần ảnh — cả hai số đều ghi rõ ở đó.
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("không đọc được tệp"));
      r.readAsDataURL(file);
    });
    const r = await this.call<{ position: number; url: string; moderation: number }>(
      "/v1/me/photos",
      { method: "POST", body: JSON.stringify({ data }) },
    );
    return { position: r.position, cdn_key: r.url, moderation: r.moderation as 0 };
  }

  async deletePhoto(position: number): Promise<void> {
    await this.call(`/v1/me/photos/${position}`, { method: "DELETE" });
  }

  async fetchScoreHistory(): Promise<ScorePoint[]> {
    const r = await this.call<{ points: ScorePoint[] }>("/v1/me/score-history");
    return r.points;
  }

  async fetchMyLinks(): Promise<ProfileLink[]> {
    const r = await this.call<{ links: ProfileLink[] }>("/v1/me/links");
    return r.links;
  }

  async saveLink(platform: LinkPlatform, handle: string, visibility: LinkVisibility = 1): Promise<void> {
    await this.call("/v1/me/links", {
      method: "PUT",
      body: JSON.stringify({ platform, handle, visibility }),
    });
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
    // `policy_version` PHẢI gửi. Không gửi thì server trả 400 — nó cố ý không
    // tự đoán, vì đoán là bịa ra đúng cái mà cột đó sinh ra để chứng minh.
    await this.call("/v1/me/consents", {
      method: "POST",
      body: JSON.stringify({ purpose, granted, policy_version: POLICY_VERSION }),
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
  /*
   * ─── Auth ở bản demo ────────────────────────────────────────────────────
   * Bản demo KHÔNG có server, nên không có gì để xác thực. Ba hàm dưới đây
   * cho đi qua bằng một mã cố định để xem được luồng màn hình — chúng không
   * chứng minh bất cứ điều gì về bảo mật, và không dùng chung một dòng code
   * nào với `auth.ts` thật. Mã cố định là CHỦ Ý: một mã ngẫu nhiên ở đây sẽ
   * làm bản demo trông như đang xác thực thật.
   */
  async requestOtp(): Promise<{ resendAfterS: number; devCode?: string }> {
    return { resendAfterS: 60, devCode: "000000" };
  }

  async verifyOtp(_phone: string, code: string): Promise<{ userId: string; token: string } | null> {
    if (code !== "000000") return null;
    return { userId: ME_ID, token: "demo" };
  }

  async signOut(): Promise<void> {
    // Không có phiên phía server để thu hồi.
  }

  async createProfile(): Promise<void> {
    // Bản demo không có nơi lưu. Không giả vờ đã ghi.
  }

  /*
   * --- Phong va vi o ban demo -------------------------------------------
   * Bản demo KHÔNG có server, nên không có phòng nào và không có ví nào. Trả
   * về rỗng thay vì bịa một danh sách phòng: một phòng giả có người giả đang
   * nói chuyện giả là thứ trông thuyết phục nhất và sai nhất — người xem sẽ
   * tin tính năng đã chạy. Trạng thái rỗng thì tự nói ra sự thật.
   */
  async listRooms(): Promise<RoomSummary[]> {
    return [];
  }
  async createRoom(): Promise<string> {
    throw new Error("bản demo không tạo được phòng");
  }
  async viewRoom(): Promise<RoomView> {
    throw new Error("bản demo không có phòng");
  }
  async joinRoom(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: "Bản demo không có phòng." };
  }
  async leaveRoom(): Promise<void> {}
  async postRoomMessage(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: false, reason: "Bản demo không có phòng." };
  }
  async listGifts(): Promise<Gift[]> {
    return [];
  }
  async sendGift(): Promise<GiftSendResult> {
    return { ok: false, reason: "Bản demo không tặng quà được.", thieuXu: false };
  }
  async fetchWallet(): Promise<Wallet> {
    return { balance: 0, tier: null, tierExpiresAt: null };
  }
  async topUp(): Promise<Wallet> {
    throw new Error("bản demo không nạp được");
  }
  async subscribe(): Promise<void> {
    throw new Error("bản demo không mua được gói");
  }

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

  /**
   * Ba danh sách ở bản demo dùng CÙNG quy tắc chia hết với `server.ts` và
   * `seed.ts`: kết nối `% 4 == 0`, đang chờ `% 4 == 1`, giới thiệu `% 4 == 2`.
   * Nhờ vậy bật/tắt backend không làm đổi tập người trên màn hình — nếu đổi thì
   * đó là lỗi, không phải khác biệt dữ liệu mẫu.
   */
  async fetchMatches(): Promise<MatchSummary[]> {
    await new Promise((r) => setTimeout(r, 180));
    return PROFILES.filter((p) => Number(p.userId) % 4 === 0).map((peer) => {
      const thread = this.threads.get(pairKeyOf(ME_ID, peer.userId)) ?? [];
      const last = thread[thread.length - 1];
      return {
        matchId: pairKeyOf(ME_ID, peer.userId),
        peer,
        lastMessage: last?.body ?? null,
        lastAt: last?.at ?? 0,
        unread: 0,
      };
    });
  }

  async fetchLikesYou(): Promise<LikeItem[]> {
    await new Promise((r) => setTimeout(r, 180));
    const KIND = ["profile", "photo", "prompt"] as const;
    const LABEL = ["Hồ sơ của bạn", "Ảnh thứ nhất của bạn", "Câu trả lời của bạn"];
    return PROFILES.filter((p) => Number(p.userId) % 4 === 1).map((peer) => {
      const k = Number(peer.userId) % 3;
      return {
        peer,
        likedTarget: { kind: KIND[k]!, label: LABEL[k]! },
        likedAt: Date.now() - Number(peer.userId) % 7 * 86_400_000,
      };
    });
  }

  async fetchIntroductions(): Promise<IntroItem[]> {
    await new Promise((r) => setTimeout(r, 180));
    return PROFILES.filter((p) => Number(p.userId) % 4 === 2).map((peer) => ({
      peer,
      introducer: PROFILES[(Number(peer.userId) + 3) % PROFILES.length]!.name,
      note: `Hai bạn cùng thích ${peer.interests[0] ?? "đi cà phê"}.`,
      at: Date.now() - 86_400_000,
    }));
  }

  /** Hồ sơ của tôi ở bản demo — giữ trong bộ nhớ để sửa xong còn thấy kết quả. */
  private me: Profile = {
    userId: ME_ID, name: "Đỗ Minh Đức", age: 28, gender: 0,
    jobTitle: "Kỹ sư phần mềm", community: "Cầu Giấy",
    bio: "Thích những cuộc trò chuyện đi xa hơn câu chào.",
    interests: ["Cầu lông", "Chạy bộ", "Cà phê"], lifestyle: ["Dậy sớm"],
    intent: "Hẹn hò nghiêm túc", prompts: [], verified: true, daysSinceActive: 0,
    photoUrl: "", breakdown: { interest: 70, personality: 70, location: 70 },
  };
  private myLinks: ProfileLink[] = [];

  async fetchGallery(userId: string): Promise<Gallery> {
    await new Promise((r) => setTimeout(r, 150));
    const p = PROFILES.find((x) => x.userId === userId);
    if (!p) return { photos: [], links: [] };
    // Bản demo dựng 3 tấm từ cùng một seed — đủ để thấy bố cục thư viện, và
    // KHÔNG giả vờ có ảnh chờ duyệt vì chỉ server mới quyết được điều đó.
    return {
      photos: [0, 1, 2].map((i) => ({ position: i, url: i === 0 ? p.photoUrl : `${p.photoUrl}&v=${i}` })),
      links: Number(userId) % 4 === 0
        ? [{ platform: "instagram", handle: "vidu.demo", url: "https://instagram.com/vidu.demo", visibility: 1 }]
        : [],
    };
  }

  async fetchMyProfile(): Promise<Profile> {
    await new Promise((r) => setTimeout(r, 120));
    return this.me;
  }

  async updateProfile(patch: ProfileEdit): Promise<Profile> {
    await new Promise((r) => setTimeout(r, 220));
    this.me = {
      ...this.me,
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.jobTitle !== undefined ? { jobTitle: patch.jobTitle } : {}),
      ...(patch.community !== undefined ? { community: patch.community } : {}),
      ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
      ...(patch.lifestyle !== undefined ? { lifestyle: patch.lifestyle } : {}),
      ...(patch.intent !== undefined ? { intent: patch.intent } : {}),
    };
    return this.me;
  }

  /** Ảnh demo giữ trong bộ nhớ, và GIỮ NGUYÊN trạng thái chờ duyệt như bản thật. */
  private myPhotos: MyPhoto[] = [];

  async fetchMyPhotos(): Promise<MyPhoto[]> {
    await new Promise((r) => setTimeout(r, 120));
    return this.myPhotos;
  }

  async uploadPhoto(file: File): Promise<MyPhoto> {
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("không đọc được tệp"));
      r.readAsDataURL(file);
    });
    const taken = new Set(this.myPhotos.map((p) => p.position));
    let pos = -1;
    for (let i = 0; i <= 5; i++) if (!taken.has(i)) { pos = i; break; }
    if (pos < 0) throw new Error("đã đủ 6 ảnh");
    // `moderation: 0` kể cả ở bản demo. Bản demo mà đặt 1 thì nó dạy sai về
    // hàng rào chặn quan trọng nhất của sản phẩm.
    const photo: MyPhoto = { position: pos, cdn_key: data, moderation: 0 };
    this.myPhotos = [...this.myPhotos, photo].sort((a, b) => a.position - b.position);
    return photo;
  }

  async deletePhoto(position: number): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
    this.myPhotos = this.myPhotos.filter((p) => p.position !== position);
  }

  async fetchScoreHistory(): Promise<ScorePoint[]> {
    await new Promise((r) => setTimeout(r, 120));
    // Bản demo KHÔNG bịa lịch sử. Một đường giả trông rất thuyết phục và sẽ
    // khiến người xem tin rằng tính năng đã chạy — trong khi nó chỉ chạy khi có
    // server thật ghi mốc. Trả rỗng để biểu đồ nói đúng: chưa có dữ liệu.
    return [];
  }

  async fetchMyLinks(): Promise<ProfileLink[]> {
    await new Promise((r) => setTimeout(r, 120));
    return this.myLinks;
  }

  async saveLink(platform: LinkPlatform, handle: string, visibility: LinkVisibility = 1): Promise<void> {
    await new Promise((r) => setTimeout(r, 180));
    this.myLinks = this.myLinks.filter((l) => l.platform !== platform);
    if (handle.trim() !== "") {
      const base: Record<LinkPlatform, string> = {
        instagram: "https://instagram.com/", tiktok: "https://tiktok.com/@",
        spotify: "https://open.spotify.com/user/", facebook: "https://facebook.com/", khac: "",
      };
      this.myLinks.push({ platform, handle: handle.trim(), url: base[platform] + handle.trim(), visibility });
    }
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
