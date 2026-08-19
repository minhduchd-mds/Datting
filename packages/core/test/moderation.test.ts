import test from "node:test";
import assert from "node:assert/strict";

import {
  PHOTO_MODERATION,
  REPORT_REASON,
  REPORT_STATUS,
  SEVERITY_WEIGHT,
  DEFAULT_PRIORITY,
  DEFAULT_CAPACITY,
  triagePhoto,
  photosNeedingHuman,
  reportPriority,
  orderReportQueue,
  forecastCapacity,
  type PhotoItem,
  type ReportItem,
  type ReportReason,
} from "../src/moderation.js";

const HOUR = 3_600_000;
const NOW = 1_770_000_000_000; // mốc cố định — test không được phụ thuộc Date.now()

function photo(over: Partial<PhotoItem> = {}): PhotoItem {
  return {
    photoId: "p1",
    userId: "u1",
    position: 0,
    cdnKey: "k/1.jpg",
    createdAtMs: NOW,
    mlSafeScore: 0.5,
    ...over,
  };
}

function report(over: Partial<ReportItem> = {}): ReportItem {
  return {
    reportId: "r1",
    reporterId: "u9",
    reportedUserId: "u1",
    reason: REPORT_REASON.SPAM,
    status: REPORT_STATUS.NEW,
    createdAtMs: NOW,
    distinctReportersAgainstTarget: 1,
    ...over,
  };
}

/* ===========================================================================
 * Ảnh
 * =========================================================================== */

test("mã moderation khớp cột photos.moderation trong migration", () => {
  assert.deepEqual(PHOTO_MODERATION, {
    PENDING: 0,
    APPROVED: 1,
    BLURRED: 2,
    BLOCKED: 3,
  });
});

test("CSAM chặn trước, kể cả khi ML chấm rất an toàn", () => {
  // Hai hệ thống trả lời hai câu hỏi khác nhau. Điểm 0.999 không bác bỏ được
  // một hash trùng khớp trong cơ sở dữ liệu đã biết.
  assert.equal(
    triagePhoto(photo({ csamFlag: true, mlSafeScore: 0.999 })),
    "csam_auto_block",
  );
});

test("CSAM không bao giờ lọt vào hàng đợi người", () => {
  const list = [
    photo({ photoId: "a", csamFlag: true, mlSafeScore: 0.5 }),
    photo({ photoId: "b", mlSafeScore: 0.5 }),
  ];
  const ids = photosNeedingHuman(list).map((p) => p.photoId);
  assert.deepEqual(ids, ["b"]);
});

test("ML chưa chấm thì đẩy cho người, KHÔNG mặc định là an toàn", () => {
  assert.equal(triagePhoto(photo({ mlSafeScore: undefined })), "human_review");
});

test("ngưỡng ML tách đúng ba nhóm", () => {
  assert.equal(triagePhoto(photo({ mlSafeScore: 0.99 })), "auto_approve");
  assert.equal(triagePhoto(photo({ mlSafeScore: 0.01 })), "auto_block");
  assert.equal(triagePhoto(photo({ mlSafeScore: 0.5 })), "human_review");
});

test("đúng ngưỡng thì vẫn giao cho người (so sánh chặt hai đầu)", () => {
  // Nới ngưỡng là quyết định có chủ ý, không phải hệ quả của dấu <= vô tình.
  assert.equal(triagePhoto(photo({ mlSafeScore: 0.98 })), "human_review");
  assert.equal(triagePhoto(photo({ mlSafeScore: 0.02 })), "human_review");
});

test("hàng đợi ảnh là vào trước ra trước", () => {
  const list = [
    photo({ photoId: "moi", createdAtMs: NOW }),
    photo({ photoId: "cu", createdAtMs: NOW - 5 * HOUR }),
  ];
  assert.deepEqual(
    photosNeedingHuman(list).map((p) => p.photoId),
    ["cu", "moi"],
  );
});

/* ===========================================================================
 * Báo cáo — nhóm test này tồn tại để chặn đúng một lỗi:
 * `ORDER BY reason ASC` đẩy spam lên trước quấy rối.
 * =========================================================================== */

test("giá trị số của reason KHÔNG phải thang mức nghiêm trọng", () => {
  assert.ok(REPORT_REASON.SPAM < REPORT_REASON.HARASSMENT);
  assert.ok(
    SEVERITY_WEIGHT[REPORT_REASON.SPAM] <
      SEVERITY_WEIGHT[REPORT_REASON.HARASSMENT],
    "sắp theo reason tăng dần là sắp NGƯỢC mức nghiêm trọng",
  );
});

test("mọi lý do đều có trọng số — thêm lý do mới mà quên là hỏng thứ tự", () => {
  for (const reason of Object.values(REPORT_REASON)) {
    assert.equal(
      typeof SEVERITY_WEIGHT[reason as ReportReason],
      "number",
      `thiếu trọng số cho reason=${reason}`,
    );
  }
});

test("quấy rối mới xếp trước spam cũ", () => {
  const queue = orderReportQueue(
    [
      report({
        reportId: "spam-cu",
        reason: REPORT_REASON.SPAM,
        createdAtMs: NOW - 20 * HOUR,
      }),
      report({
        reportId: "quay-roi-moi",
        reason: REPORT_REASON.HARASSMENT,
        createdAtMs: NOW,
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    queue.map((r) => r.reportId),
    ["quay-roi-moi", "spam-cu"],
  );
});

test("trần thâm niên: spam chờ bao lâu cũng không vượt được quấy rối", () => {
  const spamMotNam = report({
    reason: REPORT_REASON.SPAM,
    createdAtMs: NOW - 8760 * HOUR,
  });
  const quayRoiVuaXong = report({
    reason: REPORT_REASON.HARASSMENT,
    createdAtMs: NOW,
  });
  assert.ok(
    reportPriority(spamMotNam, NOW) < reportPriority(quayRoiVuaXong, NOW),
    "trần agingCap đã bị gỡ — an toàn người dùng không còn được ưu tiên tuyệt đối",
  );
});

test("nhưng trong cùng mức nghiêm trọng thì cũ hơn được xử lý trước", () => {
  const cu = report({ reportId: "cu", createdAtMs: NOW - 10 * HOUR });
  const moi = report({ reportId: "moi", createdAtMs: NOW });
  assert.ok(reportPriority(cu, NOW) > reportPriority(moi, NOW));
});

test("nhiều người khác nhau cùng tố thì nhảy bậc ưu tiên", () => {
  const mot = report({ distinctReportersAgainstTarget: 1 });
  const nam = report({ distinctReportersAgainstTarget: 5 });
  assert.ok(reportPriority(nam, NOW) > reportPriority(mot, NOW));
});

test("hệ số đồng thuận có trần, không tăng vô hạn", () => {
  const a = report({ distinctReportersAgainstTarget: 50 });
  const b = report({ distinctReportersAgainstTarget: 500 });
  assert.equal(reportPriority(a, NOW), reportPriority(b, NOW));
  assert.equal(
    reportPriority(a, NOW),
    SEVERITY_WEIGHT[REPORT_REASON.SPAM] * DEFAULT_PRIORITY.corroborationMax,
  );
});

test("đồng thuận NHÂN chứ không CỘNG: 5 người tố spam vẫn thua 1 người tố quấy rối", () => {
  const spamDongLoat = report({
    reason: REPORT_REASON.SPAM,
    distinctReportersAgainstTarget: 5,
  });
  const quayRoiDonLe = report({
    reason: REPORT_REASON.HARASSMENT,
    distinctReportersAgainstTarget: 1,
  });
  assert.ok(
    reportPriority(spamDongLoat, NOW) < reportPriority(quayRoiDonLe, NOW),
  );
});

test("việc đã xử lý hoặc bị bác bỏ không quay lại hàng đợi", () => {
  const queue = orderReportQueue(
    [
      report({ reportId: "xong", status: REPORT_STATUS.RESOLVED }),
      report({ reportId: "bac-bo", status: REPORT_STATUS.REJECTED }),
      report({ reportId: "moi", status: REPORT_STATUS.NEW }),
      report({ reportId: "dang-lam", status: REPORT_STATUS.IN_PROGRESS }),
    ],
    NOW,
  );
  assert.deepEqual(new Set(queue.map((r) => r.reportId)), new Set(["moi", "dang-lam"]));
});

test("điểm bằng nhau thì thứ tự vẫn tất định (cũ trước)", () => {
  const a = report({ reportId: "a", createdAtMs: NOW - 3 * HOUR });
  const b = report({ reportId: "b", createdAtMs: NOW - 3 * HOUR });
  assert.deepEqual(
    orderReportQueue([b, a], NOW).map((r) => r.reportId),
    orderReportQueue([a, b], NOW).map((r) => r.reportId),
  );
});

test("báo cáo có mốc thời gian ở tương lai không được cộng điểm âm", () => {
  const lech = report({ createdAtMs: NOW + 10 * HOUR });
  assert.equal(
    reportPriority(lech, NOW),
    SEVERITY_WEIGHT[REPORT_REASON.SPAM],
  );
});

/* ===========================================================================
 * Thông lượng
 * =========================================================================== */

test("một người, 10 giây/ảnh, 6 ảnh/hồ sơ ⇒ trần 60 hồ sơ mỗi giờ", () => {
  const f = forecastCapacity({
    ...DEFAULT_CAPACITY,
    photosAwaitingHuman: 0,
    reportsOpen: 0,
  });
  assert.equal(f.photosPerHour, 360);
  assert.equal(f.profilesPerHour, 60);
});

test("tồn đọng quy ra số giờ ngồi duyệt, không phải giờ đồng hồ", () => {
  const f = forecastCapacity({
    ...DEFAULT_CAPACITY,
    photosAwaitingHuman: 3600, // 3600 × 10s = 10 giờ
    reportsOpen: 80, // 80 × 45s = 1 giờ
  });
  assert.equal(f.hoursToDrain, 11);
  assert.equal(f.daysToDrain, 11 / DEFAULT_CAPACITY.hoursPerDay);
});

test("thêm người kiểm duyệt thì trần tăng tuyến tính", () => {
  const mot = forecastCapacity({
    ...DEFAULT_CAPACITY,
    photosAwaitingHuman: 1000,
    reportsOpen: 0,
  });
  const hai = forecastCapacity({
    ...DEFAULT_CAPACITY,
    moderators: 2,
    photosAwaitingHuman: 1000,
    reportsOpen: 0,
  });
  assert.equal(hai.profilesPerHour, mot.profilesPerHour * 2);
  assert.equal(hai.hoursToDrain, mot.hoursToDrain / 2);
});

/* ===========================================================================
 * Mã lý do báo cáo — không mã nào được rơi ra ngoài bảng trọng số.
 * =========================================================================== */

test("mọi mã lý do đều có trọng số — không mã nào cho ra NaN", () => {
  for (const code of Object.values(REPORT_REASON)) {
    const p = reportPriority(
      {
        reportId: "r1",
        reporterId: "1",
        reportedUserId: "2",
        reason: code,
        status: 0,
        createdAtMs: 0,
        distinctReportersAgainstTarget: 1,
      },
      0,
    );
    assert.ok(Number.isFinite(p), `reason=${code} cho ra ${p}`);
  }
});

test("lừa đảo xếp trên spam và trên 'khác'", () => {
  assert.ok(SEVERITY_WEIGHT[REPORT_REASON.SCAM] > SEVERITY_WEIGHT[REPORT_REASON.SPAM]);
  assert.ok(SEVERITY_WEIGHT[REPORT_REASON.SCAM] > SEVERITY_WEIGHT[REPORT_REASON.OTHER]);
});

test("spam chờ 30 ngày vẫn không vượt một báo cáo lừa đảo MỚI", () => {
  const base = {
    reportId: "r", reporterId: "1", reportedUserId: "2",
    status: 0 as const, distinctReportersAgainstTarget: 1,
  };
  const spamCu = reportPriority(
    { ...base, reason: REPORT_REASON.SPAM, createdAtMs: 0 },
    30 * 24 * 3_600_000,
  );
  const luaDaoMoi = reportPriority({ ...base, reason: REPORT_REASON.SCAM, createdAtMs: 0 }, 0);
  assert.ok(luaDaoMoi > spamCu, "trần thâm niên phải giữ được thứ tự nghiêm trọng");
});
