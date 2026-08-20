/**
 * 30 hồ sơ mẫu — DỮ LIỆU TỔNG HỢP, không có người thật nào.
 *
 * ─── Vì sao nén bằng bảng chỉ số ──────────────────────────────────────────
 * 30 hồ sơ × 4 sở thích trung bình = 120 lần lặp chuỗi, cộng nghề, khu vực,
 * lối sống, ý định, câu hỏi. Viết thẳng ra JSON là vài chục KB chuỗi trùng.
 * Ở đây mỗi chuỗi lưu ĐÚNG MỘT LẦN trong bảng, hồ sơ chỉ giữ chỉ số.
 *
 * Có test canh: mọi chỉ số phải trong khoảng, và không mục nào trong bảng bị bỏ
 * không — dữ liệu chết là dấu hiệu bảng và hàng đã trôi khỏi nhau.
 *
 * ─── Ảnh ─────────────────────────────────────────────────────────────────
 * Avatar sinh từ DiceBear theo seed — TẤT ĐỊNH (cùng seed cho cùng ảnh, đã kiểm
 * bằng md5) và hoàn toàn tổng hợp. KHÔNG dùng ảnh người thật: đây là hồ sơ hẹn
 * hò giả, và mượn mặt một người có thật cho việc đó là chuyện khác hẳn với dùng
 * một tấm ảnh minh hoạ.
 *
 * ─── Sinh lại ────────────────────────────────────────────────────────────
 * Các hàng do một LCG seed cố định 20260820 sinh ra, nên bộ dữ liệu tái lập
 * được: bug nào thấy ở hồ sơ thứ 17 thì lần chạy sau vẫn ở hồ sơ thứ 17.
 */

/* Bảng chuỗi — mỗi giá trị xuất hiện đúng một lần trong toàn bộ file. */
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Ngô"];
const DEM_NU = ["Thị", "Ngọc", "Thu", "Minh", "Khánh", "Hải", "Quỳnh", "Phương"];
const DEM_NAM = ["Văn", "Đức", "Minh", "Quang", "Hữu", "Bảo", "Anh", "Tuấn"];
const TEN_NU = ["Linh", "Trang", "Ngọc", "Hà", "Mai", "Thu", "Vy", "Anh", "Quỳnh", "Hương", "Chi", "Nhung", "Thảo", "Yến", "Diệp"];
const TEN_NAM = ["Nam", "Minh", "Khoa", "Tuấn", "Duy", "Sơn", "Hải", "Long", "Phong", "Bình", "Kiên", "Dũng", "Hưng", "Trung", "Quân"];
export const NGHE = ["Kỹ sư phần mềm", "Nhà thiết kế", "Giáo viên", "Bác sĩ", "Kiến trúc sư", "Nhiếp ảnh gia", "Biên tập viên", "Dược sĩ", "Kế toán", "Đầu bếp", "Hướng dẫn viên", "Nhạc công", "Chuyên viên nhân sự", "Kỹ sư xây dựng", "Nhà nghiên cứu"];
export const KHU = ["Cầu Giấy", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Thanh Xuân", "Tây Hồ", "Long Biên", "Hoàng Mai"];
export const SO_THICH = ["Cầu lông", "Du lịch", "Vẽ tranh", "Đọc sách", "Chạy bộ", "Cà phê", "Nấu ăn", "Yoga", "Leo núi", "Chụp ảnh", "Xem phim", "Đạp xe", "Bơi lội", "Nghe nhạc", "Làm vườn", "Cờ vua"];
export const LOI_SONG = ["Dậy sớm", "Thức khuya", "Không hút thuốc", "Thỉnh thoảng uống", "Nuôi thú cưng", "Ăn chay", "Tập gym đều", "Thích ở nhà"];
export const Y_DINH = ["Hẹn hò nghiêm túc", "Tìm hiểu từ từ", "Kết bạn trước"];
export const CAU_HOI = ["Một ngày lý tưởng của mình là…", "Điều nhỏ bé làm mình vui…", "Mình có thể nói hàng giờ về…", "Cuối tuần thường tìm mình ở…", "Một điều mình đánh giá cao ở người khác…", "Cách nhanh nhất để rủ mình đi chơi…"];
export const TRA_LOI = ["Dậy muộn một chút, ăn sáng chậm rãi rồi đi đâu đó không cần kế hoạch.", "Một ly cà phê ngon, trời mát và không phải nhìn đồng hồ.", "Cách người ta chọn nhạc cho một chuyến đi dài.", "Quán mới mở, đường chạy ven hồ, hoặc trong bếp thử món chưa từng nấu.", "Người biết lắng nghe hết câu trước khi trả lời.", "Đề xuất một nơi cụ thể, đừng nhắn 'đi đâu cũng được'.", "Buổi tối yên tĩnh với một cuốn sách và không ai nhắn tin.", "Khi ai đó nhớ một chi tiết nhỏ mình kể từ lâu.", "Lịch sử của những con phố mình đi qua mỗi ngày.", "Ở phòng tập, hoặc ngủ bù cho cả tuần.", "Sự thẳng thắn, kể cả khi khó nghe.", "Rủ mình đi ăn món gì đó mình chưa thử bao giờ."];
const BIO = ["Thích những cuộc trò chuyện đi xa hơn câu chào.", "Đang học cách chậm lại. Chưa giỏi lắm.", "Cuối tuần thường ở ngoài trời nhiều hơn trong nhà.", "Tin rằng món ăn ngon giải quyết được kha khá vấn đề.", "Ít nói lúc đầu, nói nhiều khi đã quen.", "Đi bộ nhiều, chụp ảnh nhiều, ngủ ít.", "Tìm người cùng thử những quán mới.", "Thích kế hoạch, nhưng không phiền nếu đổi.", "Đang đọc dở ba cuốn sách cùng lúc.", "Nghĩ rằng im lặng chung cũng là một kiểu hợp nhau."];

/**
 * Một hàng = một hồ sơ, toàn chỉ số.
 * [nữ, họ, đệm, tên, tuổi, nghề, khu, km, bio, sởThích[], lốiSống[], ýĐịnh,
 *  prompt[[hỏi, trảLời]], đãXácMinh, ngàyKểTừHoạtĐộng, breakdown[3]]
 */
type Row = [
  0 | 1, number, number, number, number, number, number, number, number,
  number[], number[], number, Array<[number, number]>, 0 | 1, number, number[],
];

const ROWS: Row[] = [
  [1, 9, 2, 8, 29, 5, 6, 4, 4, [1, 6, 8, 10, 11], [2, 4, 5], 2, [[3, 2], [4, 11]], 1, 3, [70, 56, 65]],
  [0, 5, 6, 6, 29, 9, 2, 12, 4, [5, 12, 14, 15], [0, 3], 0, [[1, 8], [2, 1]], 0, 3, [93, 69, 46]],
  [1, 7, 4, 5, 24, 7, 0, 12, 2, [2, 4, 13], [0, 1, 6], 2, [[1, 10], [4, 7]], 0, 13, [82, 92, 89]],
  [0, 7, 2, 4, 32, 0, 6, 10, 6, [1, 6, 8, 10, 11], [2, 4, 5], 2, [[4, 10], [5, 3]], 1, 1, [74, 75, 58]],
  [1, 9, 6, 7, 27, 8, 2, 8, 8, [5, 12, 14, 15], [0, 3], 0, [[4, 4], [5, 5]], 0, 3, [97, 45, 70]],
  [0, 5, 4, 5, 29, 14, 0, 10, 4, [0, 2, 3, 4, 13], [4, 6, 7], 1, [[0, 0], [1, 1]], 1, 5, [47, 76, 57]],
  [1, 1, 0, 2, 34, 8, 4, 4, 4, [1, 4, 6, 7, 8], [0, 2, 3], 0, [[2, 4], [5, 1]], 0, 3, [47, 74, 78]],
  [0, 9, 4, 8, 27, 3, 0, 4, 0, [5, 8, 10, 11, 12], [4, 6, 7], 2, [[0, 0], [5, 9]], 1, 9, [70, 87, 56]],
  [1, 1, 0, 3, 30, 6, 4, 12, 6, [0, 9, 14], [2, 4, 5], 0, [[2, 2], [3, 11]], 0, 5, [87, 73, 54]],
  [0, 3, 6, 13, 35, 12, 2, 10, 4, [2, 4, 6, 7, 13], [0, 1, 6], 1, [[1, 6], [2, 11]], 1, 3, [52, 47, 50]],
  [1, 3, 2, 12, 35, 4, 6, 12, 4, [1, 8, 10, 11], [4, 7], 2, [[2, 0], [5, 9]], 1, 13, [51, 72, 78]],
  [0, 7, 0, 14, 27, 1, 4, 12, 6, [0, 9, 14], [2, 4, 5], 1, [[2, 2], [5, 11]], 0, 13, [96, 74, 63]],
  [1, 9, 6, 13, 33, 5, 2, 8, 4, [4, 6, 7], [0, 2, 3], 0, [[3, 8], [4, 9]], 1, 7, [58, 83, 50]],
  [0, 1, 4, 9, 28, 10, 0, 6, 0, [5, 8, 10, 11, 12], [4, 6, 7], 1, [[4, 4], [5, 9]], 1, 7, [52, 62, 77]],
  [1, 5, 0, 10, 23, 2, 4, 10, 8, [0, 9, 14, 15], [2, 5], 2, [[0, 2], [5, 11]], 1, 7, [77, 53, 69]],
  [0, 5, 6, 8, 33, 8, 2, 8, 0, [2, 4, 6, 7, 13], [0, 1, 6], 1, [[3, 2], [4, 3]], 1, 1, [93, 68, 70]],
  [1, 5, 2, 10, 22, 3, 6, 2, 4, [8, 10, 11], [4, 6, 7], 1, [[3, 4], [4, 1]], 0, 3, [74, 62, 63]],
  [0, 5, 0, 9, 23, 1, 4, 10, 0, [0, 9, 12, 14, 15], [0, 2, 3], 1, [[0, 8], [3, 9]], 1, 5, [66, 55, 99]],
  [1, 5, 4, 2, 25, 13, 0, 6, 4, [2, 3, 4, 13], [1, 6], 2, [[0, 6], [1, 3]], 0, 7, [50, 48, 55]],
  [0, 3, 2, 8, 28, 4, 6, 12, 6, [1, 8, 10, 11], [4, 7], 0, [[3, 8], [4, 5]], 1, 13, [85, 91, 70]],
  [1, 5, 0, 8, 35, 5, 4, 10, 2, [0, 9, 14, 15], [2, 5], 1, [[2, 10], [3, 7]], 1, 9, [47, 66, 85]],
  [0, 7, 6, 11, 36, 3, 2, 4, 8, [2, 4, 6, 7, 13], [0, 1, 6], 1, [[1, 2], [4, 7]], 1, 13, [61, 58, 79]],
  [1, 3, 2, 10, 36, 7, 6, 8, 6, [1, 8, 10, 11], [4, 7], 0, [[0, 4], [5, 9]], 1, 1, [84, 67, 68]],
  [0, 7, 0, 14, 28, 14, 4, 4, 2, [0, 9, 12, 14, 15], [0, 2, 3], 1, [[2, 0], [3, 1]], 0, 3, [64, 99, 75]],
  [1, 1, 4, 14, 26, 6, 0, 4, 6, [2, 4, 13], [0, 1, 6], 0, [[2, 10], [5, 11]], 1, 5, [84, 83, 74]],
  [0, 9, 2, 3, 22, 8, 6, 6, 8, [8, 10, 11], [4, 6, 7], 0, [[1, 8], [4, 9]], 0, 1, [49, 54, 50]],
  [1, 7, 0, 10, 31, 12, 4, 10, 2, [0, 9, 14], [2, 4, 5], 1, [[0, 10], [5, 11]], 1, 3, [73, 80, 58]],
  [0, 1, 6, 6, 32, 5, 2, 8, 8, [4, 6, 7, 13], [0, 3], 0, [[2, 0], [5, 5]], 1, 7, [60, 54, 79]],
  [1, 5, 4, 3, 27, 12, 0, 4, 2, [5, 8, 10, 11, 12], [4, 6, 7], 1, [[2, 4], [5, 1]], 0, 7, [79, 95, 77]],
  [0, 3, 0, 11, 24, 3, 4, 10, 6, [0, 9, 14], [2, 4, 5], 2, [[2, 2], [5, 11]], 1, 9, [53, 83, 77]],
];

export interface Prompt {
  question: string;
  answer: string;
}

export interface Profile {
  userId: string;
  name: string;
  age: number;
  /** 1 nữ, 0 nam — khớp `profiles.gender` trong 0001_init.sql. */
  gender: 0 | 1;
  jobTitle: string;
  /** Nhãn khu vực ĐÃ LÀM MỜ kèm khoảng cách làm tròn. Không bao giờ là toạ độ. */
  community: string;
  bio: string;
  interests: string[];
  lifestyle: string[];
  intent: string;
  prompts: Prompt[];
  verified: boolean;
  daysSinceActive: number;
  photoUrl: string;
  breakdown: { interest: number; personality: number; location: number };
}

/** Avatar tổng hợp, tất định theo seed. Không có người thật. */
export function avatarUrl(seed: string): string {
  const bg = "b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf";
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

function expand(row: Row, i: number): Profile {
  const [nu, ho, dem, ten, tuoi, nghe, khu, km, bio, st, ls, yd, pr, xm, ngay, bd] = row;
  const name = `${HO[ho]} ${(nu ? DEM_NU : DEM_NAM)[dem]} ${(nu ? TEN_NU : TEN_NAM)[ten]}`;
  const userId = String(2001 + i);
  return {
    userId,
    name,
    age: tuoi,
    gender: nu,
    jobTitle: NGHE[nghe]!,
    community: `${KHU[khu]} · cách ${km} km`,
    bio: BIO[bio]!,
    interests: st.map((k) => SO_THICH[k]!),
    lifestyle: ls.map((k) => LOI_SONG[k]!),
    intent: Y_DINH[yd]!,
    prompts: pr.map(([q, a]) => ({ question: CAU_HOI[q]!, answer: TRA_LOI[a]! })),
    verified: xm === 1,
    daysSinceActive: ngay,
    photoUrl: avatarUrl(`${name}-${userId}`),
    breakdown: { interest: bd[0]!, personality: bd[1]!, location: bd[2]! },
  };
}

/** Ba mươi hồ sơ đã bung. Tính một lần — bung lại mỗi lần gọi là phí. */
export const PROFILES: Profile[] = ROWS.map(expand);

export const ROW_COUNT = ROWS.length;
export const RAW_ROWS: readonly Row[] = ROWS;
