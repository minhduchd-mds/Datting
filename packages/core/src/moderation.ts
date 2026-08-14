/**
 * Logic kiểm duyệt — THUẦN TUÝ, không I/O, không React.
 *
 * Vì sao nằm ở @datting/core chứ không nằm trong apps/admin:
 * thứ tự hàng đợi phải GIỐNG NHAU ở hai nơi — truy vấn backend rút việc ra, và
 * console admin hiển thị việc. Viết hai bản là hai bản sẽ lệch, và lúc lệch thì
 * người kiểm duyệt tưởng mình đang xử lý việc gấp nhất trong khi không phải.
 *
 * Bối cảnh chi phối toàn bộ file này: đội kiểm duyệt là MỘT NGƯỜI.
 * Xem ghi chú ở bảng `photos` và `reports` trong db/migrations/0001_init.sql.
 */

/* ===========================================================================
 * ẢNH
 * =========================================================================== */

/** KHỚP cột `photos.moderation` trong 0001_init.sql. Đừng đổi số. */
export const PHOTO_MODERATION = {
  PENDING: 0,
  APPROVED: 1,
  BLURRED: 2,
  BLOCKED: 3,
} as const;

export type PhotoModeration =
  (typeof PHOTO_MODERATION)[keyof typeof PHOTO_MODERATION];

export interface PhotoItem {
  photoId: string;
  userId: string;
  /** 0-5, khớp CHECK (position BETWEEN 0 AND 5) */
  position: number;
  cdnKey: string;
  blurhash?: string;
  createdAtMs: number;
  /**
   * Điểm an toàn của ML, 0..1. 1 = chắc chắn an toàn.
   * `undefined` = ML chưa chấm (hàng tồn từ trước khi bật ML, hoặc ML lỗi).
   */
  mlSafeScore?: number;
  /**
   * Cờ CSAM từ PhotoDNA/Thorn Safer. Nếu true thì ảnh KHÔNG BAO GIỜ được đưa
   * cho người xem — chặn và báo cáo tự động. Không ai phải nhìn thứ đó bằng mắt.
   */
  csamFlag?: boolean;
}

/**
 * Ngưỡng ML. Mặc định lấy đúng con số đã ghi trong 0001_init.sql.
 *
 * Chỉnh hai số này là chỉnh TRỰC TIẾP khối lượng việc của người kiểm duyệt:
 * nới ra thì ít việc hơn nhưng lọt lưới nhiều hơn. Đây là đánh đổi an toàn ↔
 * thông lượng, không phải hằng số kỹ thuật.
 */
export interface MlThresholds {
  /** > ngưỡng này ⇒ tự động duyệt, không cần người. */
  autoApproveAbove: number;
  /** < ngưỡng này ⇒ tự động chặn, không cần người. */
  autoBlockBelow: number;
}

export const DEFAULT_ML_THRESHOLDS: MlThresholds = {
  autoApproveAbove: 0.98,
  autoBlockBelow: 0.02,
};

export type PhotoTriage =
  | "auto_approve"
  | "auto_block"
  | "csam_auto_block"
  | "human_review";

/**
 * Phân loại một ảnh TRƯỚC khi nó chạm vào mắt người.
 *
 * Thứ tự kiểm tra ở đây là bắt buộc, không phải tuỳ ý:
 * CSAM phải chặn TRƯỚC cả khi ML chấm điểm an toàn cao, vì hai hệ thống trả lời
 * hai câu hỏi khác nhau (một cái hỏi "có khoả thân không", cái kia đối chiếu
 * hash với cơ sở dữ liệu đã biết). Điểm an toàn 0.99 không bác bỏ được một hash
 * trùng khớp.
 */
export function triagePhoto(
  photo: PhotoItem,
  thresholds: MlThresholds = DEFAULT_ML_THRESHOLDS,
): PhotoTriage {
  if (photo.csamFlag) return "csam_auto_block";
  // ML chưa chấm ⇒ KHÔNG được đoán là an toàn. Đẩy cho người.
  if (photo.mlSafeScore === undefined) return "human_review";
  if (photo.mlSafeScore > thresholds.autoApproveAbove) return "auto_approve";
  if (photo.mlSafeScore < thresholds.autoBlockBelow) return "auto_block";
  return "human_review";
}

/** Lọc ra đúng những ảnh cần mắt người, giữ nguyên thứ tự vào trước ra trước. */
export function photosNeedingHuman(
  photos: readonly PhotoItem[],
  thresholds: MlThresholds = DEFAULT_ML_THRESHOLDS,
): PhotoItem[] {
  return photos
    .filter((p) => triagePhoto(p, thresholds) === "human_review")
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

/* ===========================================================================
 * BÁO CÁO
 * =========================================================================== */

/** KHỚP cột `reports.reason` trong 0001_init.sql. Đừng đổi số. */
export const REPORT_REASON = {
  SPAM: 1,
  HARASSMENT: 2,
  IMPERSONATION: 3,
  BAD_CONTENT: 4,
  OTHER: 5,
} as const;

export type ReportReason =
  (typeof REPORT_REASON)[keyof typeof REPORT_REASON];

/** KHỚP cột `reports.status`. */
export const REPORT_STATUS = {
  NEW: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  REJECTED: 3,
} as const;

export type ReportStatus =
  (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export interface ReportItem {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  detail?: string;
  status: ReportStatus;
  createdAtMs: number;
  /**
   * Số người KHÁC NHAU đang có báo cáo mở nhắm vào cùng `reportedUserId`.
   * Tín hiệu mạnh nhất trong toàn bộ hệ thống: một người tố có thể là thù oán
   * cá nhân, năm người khác nhau tố cùng một người thì gần như chắc chắn có thật.
   */
  distinctReportersAgainstTarget: number;
}

/**
 * Trọng số mức nghiêm trọng.
 *
 * ⚠ Chú ý: giá trị SỐ của `reason` KHÔNG phải thang đo. reason=1 là spam (nhẹ
 *   nhất) còn reason=2 là quấy rối (nặng nhất). `ORDER BY reason ASC` sẽ đẩy
 *   spam lên đầu — đó chính là lỗi mà bảng này tồn tại để chặn.
 */
export const SEVERITY_WEIGHT: Record<ReportReason, number> = {
  [REPORT_REASON.HARASSMENT]: 100,   // an toàn thân thể/tinh thần — luôn trước
  [REPORT_REASON.BAD_CONTENT]: 90,   // nội dung xấu — rủi ro pháp lý
  [REPORT_REASON.IMPERSONATION]: 60, // giả mạo — hại nạn nhân bên ngoài app
  [REPORT_REASON.OTHER]: 40,         // chưa rõ ⇒ phải có người đọc mới biết
  [REPORT_REASON.SPAM]: 10,          // phiền, không nguy hiểm; gom lô được
};

export interface PriorityOptions {
  /** Điểm cộng thêm mỗi giờ chờ. Chống bỏ đói nhóm nhẹ. */
  agingPerHour: number;
  /**
   * TRẦN của điểm cộng theo thời gian. Đây là con số quan trọng nhất file này.
   *
   * Có trần (mặc định 45): spam dù chờ bao lâu cũng KHÔNG BAO GIỜ vượt mặt
   * quấy rối (10+45=55 < 100). Đổi lại, nếu spam đổ về liên tục thì nhóm spam
   * cũ có thể nằm đó rất lâu.
   *
   * Bỏ trần (đặt Infinity): mọi thứ rồi cũng được xử lý, nhưng một báo cáo
   * quấy rối MỚI có thể phải xếp sau đống spam từ tuần trước. Với đội một
   * người, đó là đánh đổi rất tệ.
   */
  agingCap: number;
  /** Mỗi người tố thêm cộng bao nhiêu phần trăm, tối đa `corroborationMax`. */
  corroborationStep: number;
  corroborationMax: number;
}

export const DEFAULT_PRIORITY: PriorityOptions = {
  agingPerHour: 2,
  agingCap: 45,
  corroborationStep: 0.25,
  corroborationMax: 2,
};

/**
 * Điểm ưu tiên của một báo cáo. Càng cao càng phải xử lý trước.
 *
 * Công thức: (mức nghiêm trọng × hệ số đồng thuận) + thâm niên có trần.
 *
 * Nhân với đồng thuận chứ không cộng, vì đồng thuận là bộ KHUẾCH ĐẠI niềm tin
 * chứ không phải một loại nghiêm trọng riêng: 5 người cùng tố quấy rối phải
 * nhảy vọt, còn 5 người cùng tố spam thì vẫn chỉ là spam.
 */
export function reportPriority(
  report: ReportItem,
  nowMs: number,
  opts: PriorityOptions = DEFAULT_PRIORITY,
): number {
  const severity = SEVERITY_WEIGHT[report.reason];

  const extraReporters = Math.max(0, report.distinctReportersAgainstTarget - 1);
  const corroboration = Math.min(
    opts.corroborationMax,
    1 + extraReporters * opts.corroborationStep,
  );

  const ageHours = Math.max(0, (nowMs - report.createdAtMs) / 3_600_000);
  const aging = Math.min(opts.agingCap, ageHours * opts.agingPerHour);

  return severity * corroboration + aging;
}

/**
 * Sắp hàng đợi báo cáo cho người kiểm duyệt.
 *
 * Chỉ lấy status NEW và IN_PROGRESS — việc đã xử lý/bác bỏ không quay lại hàng đợi.
 *
 * Thứ tự phải là thứ tự TOÀN PHẦN, nên có ba nấc phân định: điểm → cũ trước →
 * reportId. Nấc cuối trông thừa nhưng không thừa: hai báo cáo cùng lý do, cùng
 * mili-giây có điểm bằng nhau tuyệt đối, và `Array.sort` ổn định sẽ giữ nguyên
 * thứ tự đầu vào — tức là thứ tự PostgreSQL trả về, thứ có thể đổi giữa hai lần
 * chạy cùng một truy vấn. Không có nấc thứ ba thì hàng đợi tự xáo lại khi người
 * kiểm duyệt bấm F5, và cái đang xem dở nhảy đi chỗ khác.
 */
export function orderReportQueue(
  reports: readonly ReportItem[],
  nowMs: number,
  opts: PriorityOptions = DEFAULT_PRIORITY,
): ReportItem[] {
  return reports
    .filter(
      (r) =>
        r.status === REPORT_STATUS.NEW || r.status === REPORT_STATUS.IN_PROGRESS,
    )
    .map((r) => ({ r, p: reportPriority(r, nowMs, opts) }))
    .sort(
      (x, y) =>
        y.p - x.p ||
        x.r.createdAtMs - y.r.createdAtMs ||
        (x.r.reportId < y.r.reportId ? -1 : x.r.reportId > y.r.reportId ? 1 : 0),
    )
    .map((x) => x.r);
}

/* ===========================================================================
 * THÔNG LƯỢNG
 * =========================================================================== */

export interface CapacityInput {
  /** Số ảnh đang chờ MẮT NGƯỜI (đã trừ phần ML tự xử lý). */
  photosAwaitingHuman: number;
  /** Số báo cáo đang mở. */
  reportsOpen: number;
  /** Giây trung bình để quyết một ảnh. */
  secondsPerPhoto: number;
  /** Giây trung bình để quyết một báo cáo (đọc ngữ cảnh nên lâu hơn ảnh). */
  secondsPerReport: number;
  /** Số ảnh tối đa mỗi hồ sơ — dùng để quy ra "bao nhiêu hồ sơ mỗi giờ". */
  photosPerProfile: number;
  /** Số người kiểm duyệt. Hiện tại: 1. */
  moderators: number;
  /** Số giờ thực sự ngồi duyệt mỗi ngày. */
  hoursPerDay: number;
}

export const DEFAULT_CAPACITY: Omit<
  CapacityInput,
  "photosAwaitingHuman" | "reportsOpen"
> = {
  secondsPerPhoto: 10,
  secondsPerReport: 45,
  photosPerProfile: 6,
  moderators: 1,
  hoursPerDay: 4,
};

export interface CapacityForecast {
  /** Số ảnh xử lý được mỗi giờ. */
  photosPerHour: number;
  /** Trần đăng ký: bao nhiêu hồ sơ mới mỗi giờ mà hàng đợi vẫn không phình. */
  profilesPerHour: number;
  /** Giờ làm việc cần để dọn sạch tồn đọng hiện tại. */
  hoursToDrain: number;
  /** Quy ra số ngày, theo `hoursPerDay`. */
  daysToDrain: number;
}

/**
 * Trần đăng ký của cả sản phẩm.
 *
 * Đây không phải chỉ số phù phiếm. Duyệt ảnh là CHẶN (ảnh chưa duyệt không hiển
 * thị công khai), nên `profilesPerHour` chính là tốc độ tối đa mà sản phẩm có
 * thể nhận người dùng mới. Marketing đổ về nhanh hơn con số này thì hàng đợi
 * phình vô hạn và người mới bỏ đi vì hồ sơ chưa lên.
 */
export function forecastCapacity(input: CapacityInput): CapacityForecast {
  const seatSeconds = 3600 * input.moderators;
  const photosPerHour = seatSeconds / input.secondsPerPhoto;
  const profilesPerHour = photosPerHour / input.photosPerProfile;

  const backlogSeconds =
    input.photosAwaitingHuman * input.secondsPerPhoto +
    input.reportsOpen * input.secondsPerReport;
  const hoursToDrain = backlogSeconds / seatSeconds;

  return {
    photosPerHour,
    profilesPerHour,
    hoursToDrain,
    daysToDrain: hoursToDrain / input.hoursPerDay,
  };
}
