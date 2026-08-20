import { REPORT_REASON, type ReportReason } from "@datting/core";

export const REASON_LABEL: Record<ReportReason, string> = {
  [REPORT_REASON.SPAM]: "Spam",
  [REPORT_REASON.HARASSMENT]: "Quấy rối",
  [REPORT_REASON.IMPERSONATION]: "Giả mạo",
  [REPORT_REASON.BAD_CONTENT]: "Nội dung xấu",
  [REPORT_REASON.SCAM]: "Lừa đảo",
  [REPORT_REASON.OTHER]: "Khác",
};

/** Tô màu theo MỨC NGHIÊM TRỌNG, không theo giá trị số của reason. */
export const REASON_TONE: Record<ReportReason, "high" | "mid" | "low"> = {
  [REPORT_REASON.HARASSMENT]: "high",
  [REPORT_REASON.BAD_CONTENT]: "high",
  [REPORT_REASON.SCAM]: "high",
  [REPORT_REASON.IMPERSONATION]: "mid",
  [REPORT_REASON.OTHER]: "mid",
  [REPORT_REASON.SPAM]: "low",
};

export function formatAge(fromMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - fromMs) / 60_000));
  if (mins < 60) return `${mins} phút`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

/**
 * Định dạng số giờ làm việc còn phải ngồi duyệt.
 *
 * Đây là số liệu cho NGƯỜI KIỂM DUYỆT tự liệu sức, không phải lời hứa với
 * người dùng. CLAUDE.md cấm hiển thị thời hạn duyệt cụ thể ở phía người dùng —
 * và lệnh cấm đó đúng, vì con số này dao động theo lượng đăng ký trong ngày.
 */
export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} phút`;
  return `${h.toFixed(1)} giờ`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
