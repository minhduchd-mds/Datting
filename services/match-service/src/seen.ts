/**
 * Bloom filter cho lịch sử "đã swipe".
 *
 * Đánh đổi CÓ CHỦ Ý: chấp nhận false positive (thi thoảng giấu nhầm một hồ sơ
 * chưa từng xem) nhưng TUYỆT ĐỐI không chấp nhận false negative (hiện lại người
 * đã bỏ qua — phá vỡ niềm tin ngay lập tức). Bloom filter cho đúng tính chất
 * đó: "chắc chắn chưa thấy" hoặc "có thể đã thấy".
 *
 * Với 10.000 lượt swipe/user và tỉ lệ dương tính giả 1%, bộ lọc chỉ tốn ~12KB.
 */
export class SeenFilter {
  private bits: Uint8Array;
  private readonly m: number;
  private readonly k: number;

  constructor(expectedItems = 10_000, falsePositiveRate = 0.01) {
    if (expectedItems <= 0) throw new Error("expectedItems phải > 0");
    if (falsePositiveRate <= 0 || falsePositiveRate >= 1)
      throw new Error("falsePositiveRate phải trong (0,1)");
    this.m = Math.ceil((-expectedItems * Math.log(falsePositiveRate)) / Math.LN2 ** 2);
    this.k = Math.max(1, Math.round((this.m / expectedItems) * Math.LN2));
    this.bits = new Uint8Array(Math.ceil(this.m / 8));
  }

  private hash(id: bigint, i: number): number {
    // FNV-1a biến thể, trộn với chỉ số hàm băm.
    let h = 2166136261 ^ (i * 0x9e3779b1);
    let v = BigInt.asUintN(64, id);
    for (let b = 0; b < 8; b++) {
      h ^= Number(v & 0xffn);
      h = Math.imul(h, 16777619) >>> 0;
      v >>= 8n;
    }
    return h % this.m;
  }

  add(id: bigint | number): void {
    const v = BigInt(id);
    for (let i = 0; i < this.k; i++) {
      const p = this.hash(v, i);
      this.bits[p >> 3]! |= 1 << (p & 7);
    }
  }

  /** false = CHẮC CHẮN chưa thấy. true = CÓ THỂ đã thấy. */
  mayHaveSeen(id: bigint | number): boolean {
    const v = BigInt(id);
    for (let i = 0; i < this.k; i++) {
      const p = this.hash(v, i);
      if ((this.bits[p >> 3]! & (1 << (p & 7))) === 0) return false;
    }
    return true;
  }

  /** Serialise để lưu vào Valkey. */
  toBytes(): Uint8Array {
    return this.bits;
  }
  get sizeBytes(): number {
    return this.bits.length;
  }
  get hashCount(): number {
    return this.k;
  }
}
