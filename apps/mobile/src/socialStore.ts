import { MMKV } from "react-native-mmkv";

export type LikeTargetKind = "profile" | "photo" | "prompt";

export interface LikeContext {
  peerUserId: string;
  kind: LikeTargetKind;
  /** Nội dung rút gọn để làm ngữ cảnh mở lời; không chứa dữ liệu nhạy cảm. */
  label: string;
  at: number;
}

export interface DatePlan {
  matchId: string;
  peerName: string;
  activity: string;
  dateLabel: string;
  timeLabel: string;
  area: string;
  publicPlace: boolean;
  sharePlanWithFriend: boolean;
  createdAt: number;
  updatedAt: number;
}

const storage = new MMKV({ id: "datting-social-v2" });
const LIKE_PREFIX = "like:";
const DATE_PREFIX = "date:";

function safeParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const socialStore = {
  rememberLike(context: LikeContext): void {
    storage.set(`${LIKE_PREFIX}${context.peerUserId}`, JSON.stringify(context));
  },

  likeFor(peerUserId: string): LikeContext | null {
    return safeParse<LikeContext>(storage.getString(`${LIKE_PREFIX}${peerUserId}`));
  },

  clearLike(peerUserId: string): void {
    storage.delete(`${LIKE_PREFIX}${peerUserId}`);
  },

  saveDatePlan(plan: DatePlan): void {
    storage.set(`${DATE_PREFIX}${plan.matchId}`, JSON.stringify(plan));
  },

  datePlan(matchId: string): DatePlan | null {
    return safeParse<DatePlan>(storage.getString(`${DATE_PREFIX}${matchId}`));
  },

  clearDatePlan(matchId: string): void {
    storage.delete(`${DATE_PREFIX}${matchId}`);
  },
};
