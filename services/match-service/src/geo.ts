/**
 * Geosharding — phiên bản rút gọn của mô hình Tinder công bố.
 *
 * Tinder chọn S2 thay vì geohash vì ô S2 có diện tích thực tế đồng đều hơn
 * nhiều (geohash méo nặng về phía cực) và vì đường cong Hilbert đảm bảo các ô
 * gần nhau về cell-ID thì cũng gần nhau về địa lý — điều kiện tiên quyết để
 * gom ô liền kề thành shard.
 *
 * Ở đây dùng một xấp xỉ quadtree-trên-mặt-phẳng (đủ đúng cho scaffold và test).
 * PRODUCTION: thay `cellId()` bằng thư viện S2 thật (`s2-geometry`, `nodes2`)
 * ở level 7–8, giữ nguyên phần water-filling bên dưới.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Số ô mỗi cạnh ở một level (xấp xỉ quadtree). */
function gridSize(level: number): number {
  return 2 ** level;
}

/**
 * Ánh xạ toạ độ → cell ID, kèm interleave bit (đường cong Z) để ô gần nhau về
 * ID thì gần nhau về không gian. S2 thật dùng Hilbert (tốt hơn Z một chút);
 * tính chất locality mà thuật toán shard cần thì cả hai đều có.
 */
export function cellId(p: LatLng, level = 8): bigint {
  if (p.lat < -90 || p.lat > 90) throw new Error(`lat ngoài khoảng: ${p.lat}`);
  if (p.lng < -180 || p.lng > 180) throw new Error(`lng ngoài khoảng: ${p.lng}`);
  const n = gridSize(level);
  const x = Math.min(n - 1, Math.floor(((p.lng + 180) / 360) * n));
  const y = Math.min(n - 1, Math.floor(((p.lat + 90) / 180) * n));
  let id = 0n;
  for (let b = 0; b < level; b++) {
    const bx = BigInt((x >> b) & 1);
    const by = BigInt((y >> b) & 1);
    id |= (bx << BigInt(2 * b)) | (by << BigInt(2 * b + 1));
  }
  return id | (BigInt(level) << 60n); // nhúng level để tránh nhầm giữa các level
}

/** Khoảng cách haversine (km). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface CellLoad {
  cell: bigint;
  /** Điểm tải = f(user duy nhất, user hoạt động, QPS theo giờ). */
  load: number;
}

export interface Shard {
  shardId: number;
  cells: bigint[];
  load: number;
}

/**
 * Water-filling: duyệt ô theo thứ tự locality, cộng dồn tải, đóng shard khi
 * vượt ngưỡng. Đây chính là thuật toán Tinder mô tả.
 *
 * Chất lượng shard được đo bằng ĐỘ LỆCH CHUẨN của tải — xem `shardImbalance`.
 * Với Tinder, 40–100 shard toàn cầu cho P50/P90/P99 tốt (production ~55).
 * Với thị trường Việt Nam, ước tính 12–20 shard: PHẢI dựng bảng tải thực tế
 * trước, không chọn số shard theo cảm tính.
 */
export function buildShards(cells: CellLoad[], targetShards: number): Shard[] {
  if (targetShards < 1) throw new Error("targetShards phải >= 1");
  if (cells.length === 0) return [];

  // Sắp theo cell ID = theo locality không gian (tính chất của đường cong).
  const sorted = [...cells].sort((a, b) => (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0));
  let remainingLoad = sorted.reduce((s, c) => s + c.load, 0);
  let remainingShards = Math.min(targetShards, sorted.length);
  let remainingCells = sorted.length;

  const shards: Shard[] = [];
  let cur: Shard = { shardId: 0, cells: [], load: 0 };

  for (const c of sorted) {
    cur.cells.push(c.cell);
    cur.load += c.load;
    remainingLoad -= c.load;
    remainingCells--;

    if (remainingShards <= 1) continue; // shard cuối gom hết phần còn lại

    // NGƯỠNG THÍCH NGHI: tính lại sau mỗi shard đóng. Nếu dùng ngưỡng cố định
    // total/targetShards, một ô "nóng" (đô thị lớn) sẽ nuốt trọn ngân sách và
    // ta kết thúc với ÍT shard hơn mục tiêu — bug kinh điển của water-filling.
    const threshold = remainingShards > 0 ? (cur.load + remainingLoad) / remainingShards : Infinity;

    // Phải chừa đủ ô cho các shard còn lại (mỗi shard cần ít nhất 1 ô).
    const mustCloseToLeaveCells = remainingCells <= remainingShards - 1;

    if (cur.load >= threshold || mustCloseToLeaveCells) {
      shards.push(cur);
      remainingShards--;
      cur = { shardId: shards.length, cells: [], load: 0 };
    }
  }
  if (cur.cells.length > 0) shards.push(cur);
  return shards;
}

/**
 * Ô "nóng" không thể chia nhỏ là giới hạn cứng của water-filling: nếu một ô
 * đơn lẻ mang tải lớn hơn ngưỡng shard, không thuật toán nào cân bằng được.
 * Cách chữa DUY NHẤT là tăng level S2 ở khu vực đó (ô nhỏ hơn) — đúng lý do
 * cần dùng level 9–10 cho Hà Nội / TP.HCM và level 7–8 cho vùng thưa.
 *
 * Trả về các ô cần được chia nhỏ trước khi sharding.
 */
export function findHotCells(cells: CellLoad[], targetShards: number): CellLoad[] {
  const total = cells.reduce((s, c) => s + c.load, 0);
  const threshold = total / targetShards;
  return cells.filter((c) => c.load > threshold);
}

/** Hệ số mất cân bằng = độ lệch chuẩn / trung bình. Càng nhỏ càng tốt. */
export function shardImbalance(shards: Shard[]): number {
  if (shards.length === 0) return 0;
  const loads = shards.map((s) => s.load);
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
  if (mean === 0) return 0;
  const variance = loads.reduce((a, l) => a + (l - mean) ** 2, 0) / loads.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Với một vị trí và bán kính, trả về danh sách shard cần truy vấn.
 * Tinder: bán kính 100 dặm chỉ chạm 3/55 shard.
 */
export function shardsForRadius(
  shards: Shard[],
  center: LatLng,
  radiusKm: number,
  level = 8,
): number[] {
  const n = gridSize(level);
  const latStep = 180 / n;
  const lngStep = 360 / n;
  // Số ô cần phủ theo mỗi trục (thêm 1 ô đệm cho an toàn).
  const dLat = Math.ceil(radiusKm / 111 / latStep) + 1;
  const cosLat = Math.max(0.01, Math.cos((center.lat * Math.PI) / 180));
  const dLng = Math.ceil(radiusKm / (111 * cosLat) / lngStep) + 1;

  const needed = new Set<bigint>();
  for (let i = -dLat; i <= dLat; i++) {
    for (let j = -dLng; j <= dLng; j++) {
      const lat = center.lat + i * latStep;
      const lng = center.lng + j * lngStep;
      if (lat < -90 || lat > 90) continue;
      const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
      needed.add(cellId({ lat, lng: wrapped }, level));
    }
  }
  const out: number[] = [];
  for (const s of shards) {
    if (s.cells.some((c) => needed.has(c))) out.push(s.shardId);
  }
  return out;
}
