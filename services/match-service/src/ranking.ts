import { distanceKm, type LatLng } from "./geo.js";

/**
 * Tầng xếp hạng — P(Match) = P(A→B) × P(B→A).
 *
 * Đây là điểm khác biệt cốt lõi giữa dating app và mọi hệ recsys khác:
 * match là sự kiện ĐỒNG THUẬN HAI CHIỀU, nên hàm mục tiêu là TÍCH của hai
 * xác suất, không phải tổng hay trung bình.
 *
 * Tinder đã đo được rằng tối ưu "lượt thích" và tối ưu "match" là hai bài toán
 * khác nhau: mô hình two-tower P(Like) cho +3,8% Swipe Right Rate, còn mô hình
 * two-tower P(Match) cho +6,5% match rate. Chọn sai hàm mục tiêu = sai sản phẩm.
 *
 * KHÔNG dùng Elo. Tinder đã công khai bỏ Elo từ 2019 ("an outdated measure").
 * Elo tạo vòng lặp phản hồi khuếch đại bất bình đẳng hiển thị.
 */

export interface UserVector {
  userId: bigint;
  /** Embedding từ tháp user của mô hình two-tower (đã chuẩn hoá L2). */
  embedding: number[];
  interests: string[];
  /** Lối sống: "Dậy sớm", "Không hút thuốc", "Nuôi thú cưng"... */
  lifestyle: string[];
  /** Ý định hẹn hò: "Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước". */
  intent: string[];
  /**
   * Nhóm địa lý/xã hội thô (quận, trường, khu vực) — dùng DUY NHẤT làm trục đa
   * dạng hoá deck, KHÔNG phải tín hiệu xếp hạng. Xếp hạng theo "cùng nhóm" là
   * cách nhanh nhất để tạo buồng vang và, ở Việt Nam, để vô tình phân tầng theo
   * quận. Nó không xuất hiện trong `pLike`, và đó là chủ ý.
   */
  community: string;
  loc: LatLng;
  /** Số ngày kể từ lần hoạt động gần nhất. */
  daysSinceActive: number;
  /** Số lần đã được hiển thị hôm nay — dùng để chặn "vua sắc đẹp". */
  impressionsToday: number;
  isNewUser: boolean;
}

/** Lời giải thích hiển thị trên màn "It's a Match" (90% / 80% / 85% trong Figma). */
export interface MatchExplanation {
  interestScore: number;
  personalityScore: number;
  locationScore: number;
  sharedInterests: string[];
  sharedLifestyle: string[];
  sameCommunity: boolean;
  sharedIntent: string[];
}

export interface ScoredCandidate {
  userId: bigint;
  pMatch: number;
  pLikeForward: number;
  pLikeReverse: number;
  explanation: MatchExplanation;
}

export function dot(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("embedding khác chiều");
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const jaccard = (a: string[], b: string[]) => {
  if (a.length === 0 && b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};
const intersect = (a: string[], b: string[]) => {
  const B = new Set(b);
  return a.filter((x) => B.has(x));
};

/**
 * Xác suất một chiều: viewer thích candidate.
 *
 * PRODUCTION: thay hàm này bằng inference thật (ONNX/Triton). Công thức dưới
 * đây là mô hình cơ sở (baseline) có thể giải thích được, dùng cho Giai đoạn 1
 * và làm nhóm đối chứng cho A/B khi mô hình ML lên.
 */
export function pLike(viewer: UserVector, candidate: UserVector, maxDistanceKm = 50): number {
  const sim = dot(viewer.embedding, candidate.embedding); // đã chuẩn hoá ⇒ [-1,1]
  const interest = jaccard(viewer.interests, candidate.interests);
  const lifestyle = jaccard(viewer.lifestyle, candidate.lifestyle);
  const intent = jaccard(viewer.intent, candidate.intent);
  const km = distanceKm(viewer.loc, candidate.loc);
  const proximity = Math.max(0, 1 - km / Math.max(1, maxDistanceKm));
  // Tinder nêu rõ: ưu tiên người ĐANG hoạt động. Đây là tín hiệu mạnh, rẻ.
  const recency = Math.exp(-candidate.daysSinceActive / 7);

  const z =
    2.2 * sim + 1.6 * interest + 0.9 * lifestyle + 0.7 * intent + 1.3 * proximity + 1.1 * recency - 3.4;
  return sigmoid(z);
}

export function explain(viewer: UserVector, candidate: UserVector, maxDistanceKm = 50): MatchExplanation {
  const sharedInterests = intersect(viewer.interests, candidate.interests);
  const sharedLifestyle = intersect(viewer.lifestyle, candidate.lifestyle);
  const sharedIntent = intersect(viewer.intent, candidate.intent);
  const km = distanceKm(viewer.loc, candidate.loc);
  const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);
  return {
    interestScore: pct(jaccard(viewer.interests, candidate.interests)),
    // "Tính cách" trong Figma ánh xạ sang độ tương đồng embedding (đã học từ
    // hành vi), đưa từ [-1,1] về [0,1].
    personalityScore: pct((dot(viewer.embedding, candidate.embedding) + 1) / 2),
    locationScore: pct(Math.max(0, 1 - km / Math.max(1, maxDistanceKm))),
    sharedInterests,
    sharedLifestyle,
    sameCommunity: viewer.community === candidate.community && viewer.community !== "",
    sharedIntent,
  };
}

/** Tầng 2: chấm điểm P(Match) cho toàn bộ ứng viên đã truy hồi. */
export function scoreCandidates(
  viewer: UserVector,
  candidates: UserVector[],
  maxDistanceKm = 50,
): ScoredCandidate[] {
  return candidates
    .filter((c) => c.userId !== viewer.userId)
    .map((c) => {
      const fwd = pLike(viewer, c, maxDistanceKm);
      const rev = pLike(c, viewer, maxDistanceKm);
      return {
        userId: c.userId,
        pLikeForward: fwd,
        pLikeReverse: rev,
        pMatch: fwd * rev, // TÍCH, không phải tổng
        explanation: explain(viewer, c, maxDistanceKm),
      };
    })
    .sort((a, b) => b.pMatch - a.pMatch);
}

export interface DiversityOptions {
  deckSize: number;
  /** Không quá N người liên tiếp cùng một nhóm (quận/khu vực). */
  maxConsecutiveSameCommunity: number;
  /** Tỉ lệ slot dành cho user mới (cold-start fairness). */
  newUserQuota: number;
  /** Trần số lần hiển thị mỗi người mỗi ngày — chặn "vua sắc đẹp". */
  maxImpressionsPerDay: number;
}

export const DEFAULT_DIVERSITY: DiversityOptions = {
  deckSize: 30,
  maxConsecutiveSameCommunity: 2,
  newUserQuota: 0.12,
  maxImpressionsPerDay: 400,
};

/**
 * Tầng 3: đa dạng hoá + luật kinh doanh.
 *
 * Xếp hạng thuần tuý theo điểm sẽ tạo ra vòng lặp phản hồi: một nhóm nhỏ hút
 * hết lượt hiển thị, user mới không bao giờ được thấy. Ba cơ chế chống lại:
 * trần hiển thị/ngày, hạn ngạch user mới, và chống lặp cùng một nhóm.
 */
export function diversify(
  scored: ScoredCandidate[],
  pool: Map<string, UserVector>,
  opts: DiversityOptions = DEFAULT_DIVERSITY,
): ScoredCandidate[] {
  const eligible = scored.filter((s) => {
    const u = pool.get(s.userId.toString());
    return !u || u.impressionsToday < opts.maxImpressionsPerDay;
  });

  const newOnes = eligible.filter((s) => pool.get(s.userId.toString())?.isNewUser);
  const rest = eligible.filter((s) => !pool.get(s.userId.toString())?.isNewUser);
  const newQuota = Math.floor(opts.deckSize * opts.newUserQuota);

  const queue = [...newOnes.slice(0, newQuota), ...rest, ...newOnes.slice(newQuota)].sort(
    (a, b) => b.pMatch - a.pMatch,
  );
  // Giữ nguyên hạn ngạch user mới ở đầu deck sau khi sort lại
  const guaranteed = newOnes.slice(0, newQuota).map((s) => s.userId.toString());
  const guaranteedSet = new Set(guaranteed);

  const out: ScoredCandidate[] = [];
  let lastCommunity = "";
  let streak = 0;
  const deferred: ScoredCandidate[] = [];

  const tryPush = (s: ScoredCandidate): boolean => {
    const community = pool.get(s.userId.toString())?.community ?? "";
    if (community !== "" && community === lastCommunity && streak >= opts.maxConsecutiveSameCommunity) return false;
    out.push(s);
    if (community === lastCommunity) streak++;
    else {
      lastCommunity = community;
      streak = 1;
    }
    return true;
  };

  for (const s of queue) {
    if (out.length >= opts.deckSize) break;
    if (!tryPush(s)) deferred.push(s);
  }
  for (const s of deferred) {
    if (out.length >= opts.deckSize) break;
    tryPush(s);
  }
  // Bảo đảm user mới trong hạn ngạch không bị đẩy văng hoàn toàn
  for (const s of queue) {
    if (out.length >= opts.deckSize) break;
    if (guaranteedSet.has(s.userId.toString()) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, opts.deckSize);
}
