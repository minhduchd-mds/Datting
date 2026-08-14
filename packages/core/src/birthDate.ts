/**
 * Kiểm tra ngày sinh cho cổng tuổi (Age Gate).
 *
 * Tách thành module THUẦN TUÝ (không import react-native) vì đây là logic PHÁP
 * LÝ, không phải logic hiển thị — nó phải được test độc lập với UI, và phải
 * giống hệt nhau ở mọi nơi dùng lại (web, admin, backend validation).
 *
 * Ba cạm bẫy đã được xử lý:
 *   1. Năm nhuận: 29/02/2004 hợp lệ, 29/02/2005 thì không.
 *   2. Chưa tới sinh nhật trong năm: sinh 31/12/2008 vào ngày 01/01/2026 là
 *      17 tuổi, KHÔNG phải 18. Sai chỗ này = cho trẻ vị thành niên vào app.
 *   3. Múi giờ: dùng UTC nhất quán, không dùng giờ local — nếu không, cùng một
 *      người sẽ đủ tuổi ở Hà Nội mà chưa đủ tuổi ở London.
 */

export type BirthDateResult =
  | { ok: true; iso: string; age: number }
  | { ok: false; reason: string };

export const MIN_AGE = 18;
export const MAX_AGE = 120;

export function validateBirthDate(
  day: string | number,
  month: string | number,
  year: string | number,
  today: Date = new Date(),
): BirthDateResult {
  const dd = Number(day);
  const mm = Number(month);
  const yyyy = Number(year);

  if (day === "" || month === "" || year === "" || !Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) {
    return { ok: false, reason: "Vui lòng nhập đầy đủ ngày sinh." };
  }
  if (mm < 1 || mm > 12) return { ok: false, reason: "Tháng không hợp lệ." };

  // Ngày 0 của tháng kế tiếp = ngày cuối của tháng hiện tại (xử lý năm nhuận đúng).
  const daysInMonth = new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
  if (dd < 1 || dd > daysInMonth) return { ok: false, reason: "Ngày không hợp lệ." };

  const thisYear = today.getUTCFullYear();
  if (yyyy < thisYear - MAX_AGE || yyyy > thisYear) {
    return { ok: false, reason: "Năm sinh không hợp lệ." };
  }

  const age = computeAge(yyyy, mm, dd, today);
  if (age < MIN_AGE) {
    return { ok: false, reason: `Rất tiếc, nền tảng chỉ dành cho người từ ${MIN_AGE} tuổi.` };
  }
  if (age > MAX_AGE) return { ok: false, reason: "Ngày sinh không hợp lệ." };

  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return { ok: true, iso, age };
}

/** Tuổi tính theo UTC, có xét đã qua sinh nhật trong năm hay chưa. */
export function computeAge(year: number, month: number, day: number, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - year;
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  if (m < month || (m === month && d < day)) age--;
  return age;
}
