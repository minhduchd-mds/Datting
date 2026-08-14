/**
 * Lớp dữ liệu của console kiểm duyệt.
 *
 * TRẠNG THÁI HIỆN TẠI: backend kiểm duyệt CHƯA tồn tại. match-service chỉ có
 * /v1/swipe và /v1/deck. Vì vậy file này khai báo HỢP ĐỒNG HTTP trước, rồi cho
 * hai bản cài đặt:
 *
 *   - `HttpModerationApi`  — bản thật, dùng khi có VITE_API_BASE.
 *   - `DemoModerationApi`  — dữ liệu giả trong bộ nhớ, chạy được ngay hôm nay.
 *
 * Viết interface trước không phải là nghi thức. Nó bắt phải chốt hợp đồng khi
 * còn rẻ, và giữ cho toàn bộ phần UI không biết gì về việc dữ liệu từ đâu ra —
 * đổi sang backend thật là đổi MỘT biến môi trường, không phải sửa component.
 */

import {
  REPORT_REASON,
  REPORT_STATUS,
  photosNeedingHuman,
  orderReportQueue,
  forecastCapacity,
  DEFAULT_CAPACITY,
  type PhotoItem,
  type ReportItem,
  type ReportReason,
  type CapacityForecast,
} from "@datting/core";

/* ===========================================================================
 * Hợp đồng
 * =========================================================================== */

/** Quyết định của người kiểm duyệt với một ảnh. */
export type PhotoDecision = "approve" | "blur" | "block";

/** Kết luận của người kiểm duyệt với một báo cáo. */
export type ReportResolution =
  | "warn" // nhắc nhở, không hạn chế
  | "suspend" // tạm khoá tài khoản bị tố
  | "ban" // khoá vĩnh viễn
  | "dismiss"; // không vi phạm

export interface QueueSnapshot {
  photos: PhotoItem[];
  reports: ReportItem[];
  /** Tổng số ảnh chờ, KỂ CẢ phần ML sẽ tự xử lý. Dùng để so với phần cần người. */
  totalPhotosPending: number;
  totalReportsOpen: number;
}

export interface ModerationApi {
  fetchQueues(): Promise<QueueSnapshot>;
  decidePhoto(photoId: string, decision: PhotoDecision): Promise<void>;
  resolveReport(reportId: string, resolution: ReportResolution): Promise<void>;
}

/**
 * Các endpoint mà backend cần cung cấp. Để ở đây thành hằng số để khi ai đó
 * viết service kiểm duyệt thì có sẵn danh sách, không phải đoán từ code UI.
 */
export const ENDPOINTS = {
  queues: "/v1/admin/moderation/queues",
  photoDecision: (id: string) => `/v1/admin/moderation/photos/${id}/decision`,
  reportResolution: (id: string) => `/v1/admin/moderation/reports/${id}/resolve`,
} as const;

/* ===========================================================================
 * Bản thật
 * =========================================================================== */

export class HttpModerationApi implements ModerationApi {
  constructor(private readonly baseUrl: string) {}

  private async send<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      // Phiên đăng nhập của người kiểm duyệt đi bằng cookie HttpOnly, KHÔNG
      // bằng token trong localStorage — console này hiển thị ảnh do người lạ
      // tải lên, tức là bề mặt XSS có thật.
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  fetchQueues(): Promise<QueueSnapshot> {
    return this.send<QueueSnapshot>(ENDPOINTS.queues);
  }

  decidePhoto(photoId: string, decision: PhotoDecision): Promise<void> {
    return this.send<void>(ENDPOINTS.photoDecision(photoId), {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  }

  resolveReport(
    reportId: string,
    resolution: ReportResolution,
  ): Promise<void> {
    return this.send<void>(ENDPOINTS.reportResolution(reportId), {
      method: "POST",
      body: JSON.stringify({ resolution }),
    });
  }
}

/* ===========================================================================
 * Bản demo
 * =========================================================================== */

/** Sinh số giả tất định — cùng seed cho cùng dữ liệu, để demo lặp lại được. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_REASONS: ReportReason[] = [
  REPORT_REASON.SPAM,
  REPORT_REASON.HARASSMENT,
  REPORT_REASON.IMPERSONATION,
  REPORT_REASON.BAD_CONTENT,
  REPORT_REASON.OTHER,
];

export class DemoModerationApi implements ModerationApi {
  private photos: PhotoItem[];
  private reports: ReportItem[];

  constructor(nowMs: number, seed = 42) {
    const rnd = mulberry32(seed);
    const HOUR = 3_600_000;

    // 140 ảnh chờ. Phân bố điểm ML cố ý lệch về hai đầu: đó là hình dạng thật
    // của một bộ phân loại đã huấn luyện tử tế — phần lớn ảnh nó rất chắc chắn,
    // chỉ một dải hẹp ở giữa là không dám quyết.
    this.photos = Array.from({ length: 140 }, (_, i) => {
      const r = rnd();
      const score =
        r < 0.82
          ? 0.985 + rnd() * 0.015 // rõ ràng an toàn
          : r < 0.88
            ? rnd() * 0.019 // rõ ràng vi phạm
            : 0.02 + rnd() * 0.96; // dải không chắc chắn → tới tay người
      return {
        photoId: `ph_${1000 + i}`,
        userId: `u_${200 + (i % 47)}`,
        position: i % 6,
        cdnKey: `demo/${1000 + i}.jpg`,
        createdAtMs: nowMs - Math.floor(rnd() * 30 * HOUR),
        mlSafeScore: score,
        // Rất hiếm, và không bao giờ tới tay người — có mặt ở đây chỉ để chứng
        // minh nhánh lọc hoạt động.
        csamFlag: rnd() < 0.004,
      } satisfies PhotoItem;
    });

    // 23 báo cáo mở. Vài người bị nhiều người khác nhau tố — đó là nhóm phải
    // nổi lên đầu hàng đợi.
    const hotTargets = new Map<string, number>([
      ["u_205", 6],
      ["u_231", 3],
    ]);
    this.reports = Array.from({ length: 23 }, (_, i) => {
      const target =
        i % 5 === 0 ? "u_205" : i % 7 === 0 ? "u_231" : `u_${300 + i}`;
      return {
        reportId: `rp_${500 + i}`,
        reporterId: `u_${400 + i}`,
        reportedUserId: target,
        reason: DEMO_REASONS[Math.floor(rnd() * DEMO_REASONS.length)]!,
        detail: undefined,
        status: REPORT_STATUS.NEW,
        createdAtMs: nowMs - Math.floor(rnd() * 72 * HOUR),
        distinctReportersAgainstTarget: hotTargets.get(target) ?? 1,
      } satisfies ReportItem;
    });
  }

  async fetchQueues(): Promise<QueueSnapshot> {
    return {
      photos: this.photos,
      reports: this.reports,
      totalPhotosPending: this.photos.length,
      totalReportsOpen: this.reports.length,
    };
  }

  async decidePhoto(photoId: string): Promise<void> {
    this.photos = this.photos.filter((p) => p.photoId !== photoId);
  }

  async resolveReport(reportId: string): Promise<void> {
    this.reports = this.reports.filter((r) => r.reportId !== reportId);
  }
}

/* ===========================================================================
 * Chọn bản cài đặt + dẫn xuất trạng thái hiển thị
 * =========================================================================== */

export const API_BASE: string | undefined = import.meta.env["VITE_API_BASE"];
export const IS_DEMO = !API_BASE;

export function createApi(nowMs: number): ModerationApi {
  return API_BASE ? new HttpModerationApi(API_BASE) : new DemoModerationApi(nowMs);
}

export interface DerivedQueues {
  /** Chỉ những ảnh THỰC SỰ cần mắt người, đã sắp vào trước ra trước. */
  photoQueue: PhotoItem[];
  /** Báo cáo đã sắp theo mức nghiêm trọng, KHÔNG phải FIFO. */
  reportQueue: ReportItem[];
  forecast: CapacityForecast;
  /** Bao nhiêu phần trăm ảnh chờ được ML gánh giúp. */
  mlAbsorbedRatio: number;
}

/**
 * Biến snapshot thô thành thứ hiển thị được.
 *
 * Toàn bộ phần "sắp thế nào" là gọi sang @datting/core, không tự làm ở đây —
 * nếu UI sắp một kiểu và truy vấn backend sắp kiểu khác thì người kiểm duyệt
 * sẽ thấy một hàng đợi mà thao tác "lấy việc tiếp theo" trả về việc khác.
 */
export function deriveQueues(
  snap: QueueSnapshot,
  nowMs: number,
): DerivedQueues {
  const photoQueue = photosNeedingHuman(snap.photos);
  const reportQueue = orderReportQueue(snap.reports, nowMs);

  return {
    photoQueue,
    reportQueue,
    forecast: forecastCapacity({
      ...DEFAULT_CAPACITY,
      photosAwaitingHuman: photoQueue.length,
      reportsOpen: reportQueue.length,
    }),
    mlAbsorbedRatio:
      snap.photos.length === 0
        ? 0
        : 1 - photoQueue.length / snap.photos.length,
  };
}
