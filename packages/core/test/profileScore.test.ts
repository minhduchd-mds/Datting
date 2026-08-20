import { strict as assert } from "node:assert";
import test from "node:test";

import { PROFILE_SCORE_BASE, profileScore, type ProfileScoreInput } from "../src/profileScore.js";

/**
 * Test cho công thức điểm hồ sơ.
 *
 * Lý do tồn tại: công thức này trước đây có HAI bản chép tay ở hai app, và sắp
 * có bản thứ ba ở server. Gộp về một chỗ chỉ có giá trị nếu có gì canh cho nó
 * không trôi — nếu không thì chỉ là đổi chỗ chép tay.
 */

const RONG: ProfileScoreInput = {
  photos: 0,
  interests: [],
  bio: "",
  intent: "",
  prompts: 0,
  verified: false,
};

test("hồ sơ trống vẫn có điểm nền, không phải 0", () => {
  // 0% cho người vừa đăng ký là một lời nói dối có hại: họ ĐÃ làm một việc
  // (tạo tài khoản, nhập tên), và một thanh trống trơn khiến phần việc còn lại
  // trông vô vọng hơn thực tế.
  assert.equal(profileScore(RONG).score, PROFILE_SCORE_BASE);
});

test("hồ sơ đầy đủ chạm đúng 100, không vượt", () => {
  // Tổng lý thuyết là 105 nên phải có trần, nếu không thanh tiến độ tràn.
  const day: ProfileScoreInput = {
    photos: 6,
    interests: ["a", "b", "c", "d", "e"],
    bio: "có gì đó",
    intent: "Hẹn hò nghiêm túc",
    prompts: 3,
    verified: true,
  };
  assert.equal(profileScore(day).score, 100);
});

test("điểm KHÔNG BAO GIỜ giảm khi thêm dữ liệu", () => {
  // Tính đơn điệu là thứ người dùng ngầm tin: làm thêm một việc thì điểm không
  // được tụt. Một công thức có trọng số âm hay chuẩn hoá sai sẽ phá điều đó, và
  // không ai phát hiện cho tới khi có người phàn nàn.
  let truoc = profileScore(RONG).score;
  const buoc: ProfileScoreInput[] = [
    { ...RONG, photos: 1 },
    { ...RONG, photos: 2 },
    { ...RONG, photos: 3, bio: "x" },
    { ...RONG, photos: 3, bio: "x", intent: "y" },
    { ...RONG, photos: 3, bio: "x", intent: "y", interests: ["a", "b", "c"] },
    { ...RONG, photos: 3, bio: "x", intent: "y", interests: ["a", "b", "c"], prompts: 2 },
    { ...RONG, photos: 3, bio: "x", intent: "y", interests: ["a", "b", "c"], prompts: 2, verified: true },
  ];
  for (const b of buoc) {
    const sau = profileScore(b).score;
    assert.ok(sau >= truoc, `điểm tụt từ ${truoc} xuống ${sau}`);
    truoc = sau;
  }
});

test("bio chỉ có khoảng trắng KHÔNG được tính là đã điền", () => {
  assert.equal(profileScore({ ...RONG, bio: "   \n\t " }).score, PROFILE_SCORE_BASE);
  assert.equal(profileScore({ ...RONG, bio: "x" }).score, PROFILE_SCORE_BASE + 10);
});

test("số âm hoặc vượt ngưỡng không làm vỡ điểm", () => {
  // Dữ liệu bẩn từ CSDL không được biến thành điểm âm hay điểm > 100.
  const am = profileScore({ ...RONG, photos: -5, prompts: -3 });
  assert.equal(am.score, PROFILE_SCORE_BASE);
  assert.ok(am.items.every((i) => i.points >= 0), "điểm còn lấy được không được âm");
});

test("tổng điểm CÒN LẤY ĐƯỢC cộng điểm hiện tại phải chạm ít nhất 100", () => {
  // Đây là ràng buộc giữa hai thứ màn hình hiện cùng lúc: con số lớn và danh
  // sách việc cần làm. Nếu làm hết mọi việc trong danh sách mà vẫn không tới
  // 100 thì danh sách đó nói dối.
  const r = profileScore(RONG);
  const conLay = r.items.reduce((s, i) => s + i.points, 0);
  assert.ok(r.score + conLay >= 100, `${r.score} + ${conLay} chưa tới 100`);
});

test("hạng mục đã đạt thì điểm còn lấy được bằng 0", () => {
  const r = profileScore({ ...RONG, bio: "xong", verified: true });
  const bio = r.items.find((i) => i.key === "bio");
  const xm = r.items.find((i) => i.key === "verified");
  assert.equal(bio?.done, true);
  assert.equal(bio?.points, 0);
  assert.equal(xm?.done, true);
  assert.equal(xm?.points, 0);
});

test("have/need phản ánh SỐ THẬT, không bị kẹp như phần tính điểm", () => {
  // Điểm kẹp ở 3 ảnh, nhưng màn hình không được hiện "3/3" khi người ta có 5.
  // Kẹp chỉ áp cho phần cộng điểm; phần hiển thị phải là số thật.
  const r = profileScore({ ...RONG, photos: 5 });
  const anh = r.items.find((i) => i.key === "photos");
  assert.equal(anh?.have, 5);
  assert.equal(anh?.need, 3);
  assert.equal(anh?.done, true);
});
