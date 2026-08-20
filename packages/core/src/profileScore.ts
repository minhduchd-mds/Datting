/**
 * Điểm chất lượng hồ sơ.
 *
 * ─── Vì sao ở đây chứ không ở màn hình ────────────────────────────────────
 * Công thức này ĐANG tồn tại hai bản chép tay: `apps/web/src/screens/Me.tsx` và
 * `apps/mobile/app/(tabs)/profile.tsx`. Hôm nay chúng còn giống nhau, nhưng đó
 * là may chứ không phải bảo đảm — không có gì canh cho hai đoạn mã ở hai file
 * khớp nhau. Và ngay khi server cần ghi lại điểm theo thời gian thì sẽ có bản
 * thứ ba.
 *
 * Đó đúng là lý do `packages/core` tồn tại: logic thuần thì client và server
 * dùng CHUNG một bản, và có test canh.
 *
 * ─── Công thức LỘ RA, không giấu ──────────────────────────────────────────
 * Người dùng cần biết làm gì thì điểm tăng, chứ không phải nhìn một con số bí
 * ẩn. Vì vậy hàm trả về CẢ danh sách hạng mục kèm điểm còn lấy được của từng
 * cái — màn hình không phải tự đoán lại cách cộng.
 *
 * ─── Trần 100 nằm ở cuối, có chủ ý ────────────────────────────────────────
 * Tổng lý thuyết là 105. Ai làm đủ mọi thứ vẫn thấy 100%, và người còn thiếu
 * một hạng mục khó vẫn có đường lên 100 bằng các hạng mục khác — thay vì bị
 * chặn ở 95 vĩnh viễn.
 */

export interface ProfileScoreInput {
  /** Số ảnh ĐÃ DUYỆT. Ảnh chờ duyệt chưa hiển thị công khai nên chưa tính. */
  photos: number;
  interests: string[];
  bio: string;
  intent: string;
  /** Số câu hỏi mở đã trả lời. */
  prompts: number;
  verified: boolean;
}

export interface ScoreItem {
  key: "photos" | "interests" | "bio" | "intent" | "prompts" | "verified";
  done: boolean;
  /** Điểm CÒN LẤY ĐƯỢC nếu làm nốt; 0 khi đã đạt. */
  points: number;
  /** Đã có bao nhiêu trên tổng cần — để màn hình hiện "2/3" mà không tự đếm. */
  have: number;
  need: number;
}

export interface ProfileScore {
  /** 0–100. */
  score: number;
  items: ScoreItem[];
}

/** Điểm khởi đầu cho việc đã tạo tài khoản và có tên. */
export const PROFILE_SCORE_BASE = 25;

export function profileScore(p: ProfileScoreInput): ProfileScore {
  const photos = Math.max(0, Math.min(p.photos, 3));
  const interests = Math.max(0, Math.min(p.interests.length, 3));
  const prompts = Math.max(0, Math.min(p.prompts, 2));
  const hasBio = p.bio.trim() !== "";
  const hasIntent = p.intent.trim() !== "";

  const raw =
    PROFILE_SCORE_BASE +
    photos * 10 +
    interests * 5 +
    (hasBio ? 10 : 0) +
    (hasIntent ? 10 : 0) +
    prompts * 5 +
    (p.verified ? 5 : 0);

  const items: ScoreItem[] = [
    { key: "photos", done: photos >= 3, points: (3 - photos) * 10, have: Math.max(0, p.photos), need: 3 },
    { key: "interests", done: interests >= 3, points: (3 - interests) * 5, have: p.interests.length, need: 3 },
    { key: "bio", done: hasBio, points: hasBio ? 0 : 10, have: hasBio ? 1 : 0, need: 1 },
    { key: "intent", done: hasIntent, points: hasIntent ? 0 : 10, have: hasIntent ? 1 : 0, need: 1 },
    { key: "prompts", done: prompts >= 2, points: (2 - prompts) * 5, have: Math.max(0, p.prompts), need: 2 },
    { key: "verified", done: p.verified, points: p.verified ? 0 : 5, have: p.verified ? 1 : 0, need: 1 },
  ];

  return { score: Math.min(100, raw), items };
}
