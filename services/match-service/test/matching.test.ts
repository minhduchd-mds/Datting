import test from "node:test";
import assert from "node:assert/strict";

import { pairKey, unpairKey, otherSide } from "../src/pairKey.js";
import { InMemoryRedis, recordSwipe, LIKE_TTL_SECONDS } from "../src/mutualLike.js";
import { cellId, buildShards, shardImbalance, shardsForRadius, distanceKm, findHotCells } from "../src/geo.js";
import { scoreCandidates, diversify, pLike, explain, type UserVector } from "../src/ranking.js";
import { stableMatch, findBlockingPairs, type PreferenceList } from "../src/galeShapley.js";
import { SeenFilter } from "../src/seen.js";
import { DeckBuilder, InMemoryCandidateSource } from "../src/deck.js";

// ===========================================================================
// pairKey — biểu diễn chuẩn của một cặp
// ===========================================================================
test("pairKey đối xứng: pairKey(a,b) === pairKey(b,a)", () => {
  assert.equal(pairKey(7, 3), pairKey(3, 7));
  assert.equal(pairKey(7, 3), "3:7");
});

test("pairKey từ chối ghép một người với chính họ", () => {
  assert.throws(() => pairKey(5, 5), /chính họ/);
});

test("unpairKey và otherSide đảo ngược đúng", () => {
  const k = pairKey(100n, 42n);
  assert.deepEqual(unpairKey(k), [42n, 100n]);
  assert.equal(otherSide(k, 42), 100n);
  assert.equal(otherSide(k, 100), 42n);
  assert.throws(() => otherSide(k, 999), /không thuộc cặp/);
});

// ===========================================================================
// mutual-like nguyên tử — lỗi kinh điển nhất của dating app
// ===========================================================================
test("like một chiều KHÔNG tạo match", async () => {
  const r = new InMemoryRedis();
  const out = await recordSwipe(r, 1, 2, "like");
  assert.equal(out.matched, false);
  assert.equal(out.pairKey, "1:2");
});

test("like hai chiều tạo ĐÚNG MỘT match, ở lượt swipe thứ hai", async () => {
  const r = new InMemoryRedis();
  const first = await recordSwipe(r, 1, 2, "like");
  const second = await recordSwipe(r, 2, 1, "like");
  assert.equal(first.createdMatch, false);
  assert.equal(second.createdMatch, true, "chỉ lượt thứ hai được phép tạo match");
});

test("pass không bao giờ tạo match và không tốn round-trip Redis", async () => {
  const r = new InMemoryRedis();
  await recordSwipe(r, 1, 2, "like");
  const before = r.evalCount;
  const out = await recordSwipe(r, 2, 1, "pass");
  assert.equal(out.matched, false);
  assert.equal(r.evalCount, before, "pass không được gọi eval");
});

test("mỗi lượt swipe chỉ tốn ĐÚNG 1 round-trip Redis", async () => {
  const r = new InMemoryRedis();
  await recordSwipe(r, 10, 20, "like");
  await recordSwipe(r, 20, 10, "like");
  assert.equal(r.evalCount, 2);
});

test("cả hai chiều ghi vào CÙNG một khoá (điều kiện của tính nguyên tử)", async () => {
  const r = new InMemoryRedis();
  await recordSwipe(r, 8, 3, "like");
  await recordSwipe(r, 3, 8, "superlike");
  assert.deepEqual(r.dump("like:3:8"), { "3": "1", "8": "1" });
  assert.equal(r.ttlOf("like:3:8"), LIKE_TTL_SECONDS);
});

test("swipe lặp lại (double-tap) không tạo match giả", async () => {
  const r = new InMemoryRedis();
  const a = await recordSwipe(r, 1, 2, "like");
  const b = await recordSwipe(r, 1, 2, "like"); // cùng người, bấm 2 lần
  assert.equal(a.matched, false);
  assert.equal(b.matched, false, "tự mình like 2 lần không được thành match");
});

test("100 cặp swipe đồng thời: đúng 100 match, không thừa không thiếu", async () => {
  const r = new InMemoryRedis();
  const ops: Promise<{ createdMatch: boolean }>[] = [];
  for (let i = 0; i < 100; i++) {
    const a = 1000 + i * 2;
    const b = 1001 + i * 2;
    // cố ý xen kẽ thứ tự để mô phỏng race
    ops.push(recordSwipe(r, a, b, "like"));
    ops.push(recordSwipe(r, b, a, "like"));
  }
  const results = await Promise.all(ops);
  const matches = results.filter((x) => x.createdMatch).length;
  assert.equal(matches, 100, `mong đợi đúng 100 match, nhận ${matches}`);
});

// ===========================================================================
// geosharding
// ===========================================================================
test("cellId ổn định và phân biệt được vị trí xa nhau", () => {
  const hanoi = { lat: 21.028, lng: 105.834 };
  const hcm = { lat: 10.823, lng: 106.629 };
  assert.equal(cellId(hanoi), cellId({ ...hanoi }));
  assert.notEqual(cellId(hanoi), cellId(hcm));
});

test("cellId từ chối toạ độ ngoài khoảng", () => {
  assert.throws(() => cellId({ lat: 95, lng: 0 }), /lat ngoài khoảng/);
  assert.throws(() => cellId({ lat: 0, lng: 200 }), /lng ngoài khoảng/);
});

test("haversine: Hà Nội → TP.HCM khoảng 1.140 km", () => {
  const d = distanceKm({ lat: 21.028, lng: 105.834 }, { lat: 10.823, lng: 106.629 });
  assert.ok(d > 1100 && d < 1200, `nhận ${d.toFixed(0)} km`);
});

test("water-filling tạo đúng số shard và cân bằng (độ lệch chuẩn/trung bình < 0,35)", () => {
  // Mô phỏng mật độ lệch thực tế: ô đô thị tải cao gấp 10 lần vùng thưa.
  const cells = Array.from({ length: 400 }, (_, i) => ({
    cell: BigInt(i),
    load: i % 40 === 0 ? 50 : 5,
  }));
  const shards = buildShards(cells, 16);
  assert.equal(shards.length, 16, "ngưỡng thích nghi phải tạo ĐÚNG số shard mục tiêu");
  const imb = shardImbalance(shards);
  assert.ok(imb < 0.35, `mất cân bằng quá cao: ${imb.toFixed(3)}`);
  // Không được mất ô nào
  const total = shards.reduce((s, x) => s + x.cells.length, 0);
  assert.equal(total, 400);
});

test("water-filling không tạo shard rỗng kể cả khi số ô sát số shard", () => {
  const cells = Array.from({ length: 20 }, (_, i) => ({ cell: BigInt(i), load: 1 }));
  const shards = buildShards(cells, 20);
  assert.equal(shards.length, 20);
  assert.ok(shards.every((s) => s.cells.length === 1));
});

test("findHotCells phát hiện ô nóng không thể chia — phải tăng level S2", () => {
  const cells = [
    { cell: 1n, load: 10_000 }, // "Hà Nội" ở level 8: một ô nuốt trọn ngân sách
    ...Array.from({ length: 100 }, (_, i) => ({ cell: BigInt(i + 2), load: 5 })),
  ];
  const hot = findHotCells(cells, 16);
  assert.equal(hot.length, 1);
  assert.equal(hot[0]!.cell, 1n);
  // Với ô nóng, water-filling vẫn phải trả đủ shard (không crash, không rỗng)
  const shards = buildShards(cells, 16);
  assert.equal(shards.length, 16);
  assert.ok(shards.every((s) => s.cells.length > 0));
});

test("shardsForRadius chỉ chạm một phần nhỏ tổng số shard", () => {
  const cells: { cell: bigint; load: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    for (let j = 0; j < 60; j++) {
      const c = cellId({ lat: -60 + i * 2, lng: -170 + j * 5.5 });
      if (!seen.has(c.toString())) {
        seen.add(c.toString());
        cells.push({ cell: c, load: 1 });
      }
    }
  }
  const shards = buildShards(cells, 55);
  const hit = shardsForRadius(shards, { lat: 21.0, lng: 105.8 }, 160);
  assert.ok(hit.length >= 1, "phải chạm ít nhất 1 shard");
  assert.ok(hit.length < shards.length / 3, `chạm quá nhiều shard: ${hit.length}/${shards.length}`);
});

// ===========================================================================
// ranking — P(Match) = tích, không phải tổng
// ===========================================================================
function mkUser(id: number, over: Partial<UserVector> = {}): UserVector {
  return {
    userId: BigInt(id),
    embedding: [1, 0, 0, 0],
    interests: ["Chạy bộ", "Cà phê"],
    lifestyle: ["Dậy sớm"],
    intent: ["Hẹn hò nghiêm túc"],
    community: "Cầu Giấy",
    loc: { lat: 21.0, lng: 105.8 },
    daysSinceActive: 0,
    impressionsToday: 0,
    isNewUser: false,
    ...over,
  };
}

test("P(Match) là TÍCH của hai chiều, luôn ≤ mỗi chiều", () => {
  const viewer = mkUser(1);
  const cand = mkUser(2, { embedding: [0.6, 0.8, 0, 0] });
  const [s] = scoreCandidates(viewer, [cand]);
  assert.ok(s);
  assert.ok(Math.abs(s.pMatch - s.pLikeForward * s.pLikeReverse) < 1e-12);
  assert.ok(s.pMatch <= s.pLikeForward && s.pMatch <= s.pLikeReverse);
});

test("người ở xa bị chấm điểm thấp hơn người ở gần (mọi thứ khác như nhau)", () => {
  const viewer = mkUser(1);
  const near = mkUser(2);
  const far = mkUser(3, { loc: { lat: 21.4, lng: 106.2 } });
  const scored = scoreCandidates(viewer, [far, near]);
  assert.equal(scored[0]!.userId, 2n, "người gần phải đứng trước");
});

test("người lâu không hoạt động bị chấm điểm thấp hơn", () => {
  const viewer = mkUser(1);
  const active = mkUser(2, { daysSinceActive: 0 });
  const stale = mkUser(3, { daysSinceActive: 30 });
  const scored = scoreCandidates(viewer, [stale, active]);
  assert.equal(scored[0]!.userId, 2n);
});

test("không bao giờ tự chấm điểm chính mình", () => {
  const viewer = mkUser(1);
  const scored = scoreCandidates(viewer, [mkUser(1), mkUser(2)]);
  assert.equal(scored.length, 1);
  assert.equal(scored[0]!.userId, 2n);
});

test("explain sinh đúng 3 chỉ số 0–100 và các điểm chung (như màn Figma)", () => {
  const viewer = mkUser(1, { interests: ["Chạy bộ", "Cà phê"], lifestyle: ["Dậy sớm", "Ăn chay"] });
  // community cố ý trùng mặc định của mkUser ⇒ sameCommunity phải là true.
  const cand = mkUser(2, { interests: ["Chạy bộ", "Yoga"], lifestyle: ["Dậy sớm"], community: "Cầu Giấy" });
  const e = explain(viewer, cand);
  for (const v of [e.interestScore, e.personalityScore, e.locationScore]) {
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `giá trị không hợp lệ: ${v}`);
  }
  assert.deepEqual(e.sharedInterests, ["Chạy bộ"]);
  assert.deepEqual(e.sharedLifestyle, ["Dậy sớm"]);
  assert.equal(e.sameCommunity, true);
});

test("pLike nằm trong (0,1)", () => {
  const p = pLike(mkUser(1), mkUser(2));
  assert.ok(p > 0 && p < 1);
});

test("đa dạng hoá: không quá 2 người liên tiếp cùng khu vực", () => {
  const viewer = mkUser(1, { community: "Tây Hồ" });
  const cands = Array.from({ length: 40 }, (_, i) =>
    mkUser(100 + i, { community: i < 30 ? "Cầu Giấy" : "Ba Đình", embedding: [1, 0, 0, 0] }),
  );
  const scored = scoreCandidates(viewer, cands);
  const pool = new Map(cands.map((c) => [c.userId.toString(), c]));
  const deck = diversify(scored, pool);

  let streak = 1;
  for (let i = 1; i < deck.length; i++) {
    const a = pool.get(deck[i - 1]!.userId.toString())!.community;
    const b = pool.get(deck[i]!.userId.toString())!.community;
    streak = a === b ? streak + 1 : 1;
    assert.ok(streak <= 2, `có ${streak} người liên tiếp cùng khu vực ${b}`);
  }
});

test("đa dạng hoá: loại người đã vượt trần hiển thị/ngày (chống 'vua sắc đẹp')", () => {
  const viewer = mkUser(1);
  const hot = mkUser(2, { impressionsToday: 100000 });
  const normal = mkUser(3, { impressionsToday: 1 });
  const scored = scoreCandidates(viewer, [hot, normal]);
  const pool = new Map([hot, normal].map((c) => [c.userId.toString(), c]));
  const deck = diversify(scored, pool);
  assert.ok(!deck.some((d) => d.userId === 2n), "người vượt trần phải bị loại");
});

test("đa dạng hoá: user mới được dành hạn ngạch trong deck", () => {
  const viewer = mkUser(1);
  // user mới cố tình có embedding kém phù hợp → nếu không có hạn ngạch sẽ bị loại hết
  const cands = [
    ...Array.from({ length: 60 }, (_, i) => mkUser(200 + i, { embedding: [1, 0, 0, 0] })),
    ...Array.from({ length: 5 }, (_, i) =>
      mkUser(900 + i, { isNewUser: true, embedding: [-1, 0, 0, 0], community: "Long Biên" }),
    ),
  ];
  const scored = scoreCandidates(viewer, cands);
  const pool = new Map(cands.map((c) => [c.userId.toString(), c]));
  const deck = diversify(scored, pool);
  const newCount = deck.filter((d) => pool.get(d.userId.toString())?.isNewUser).length;
  assert.ok(newCount > 0, "user mới phải xuất hiện trong deck (cold-start fairness)");
});

// ===========================================================================
// Gale–Shapley
// ===========================================================================
test("Gale-Shapley trả về stable matching (không có cặp chặn)", () => {
  const proposers: PreferenceList[] = [
    { id: "a", ranking: ["x", "y", "z"] },
    { id: "b", ranking: ["y", "x", "z"] },
    { id: "c", ranking: ["x", "y", "z"] },
  ];
  const receivers: PreferenceList[] = [
    { id: "x", ranking: ["b", "a", "c"] },
    { id: "y", ranking: ["a", "b", "c"] },
    { id: "z", ranking: ["a", "b", "c"] },
  ];
  const result = stableMatch(proposers, receivers);
  assert.equal(result.length, 3, "mọi người phải được ghép");
  assert.deepEqual(findBlockingPairs(proposers, receivers, result), []);
});

test("Gale-Shapley: mỗi người xuất hiện đúng một lần", () => {
  const n = 40;
  const ids = (p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  const proposers: PreferenceList[] = ids("p").map((id, i) => ({
    id,
    ranking: ids("r").sort((a, b) => ((a.length + i) % 3) - ((b.length + i) % 3)),
  }));
  const receivers: PreferenceList[] = ids("r").map((id, i) => ({
    id,
    ranking: ids("p").slice().reverse().map((x, j) => (j % 2 === i % 2 ? x : x)),
  }));
  const result = stableMatch(proposers, receivers);
  assert.equal(new Set(result.map((r) => r.proposer)).size, result.length);
  assert.equal(new Set(result.map((r) => r.receiver)).size, result.length);
  assert.deepEqual(findBlockingPairs(proposers, receivers, result), []);
});

test("Gale-Shapley xử lý được danh sách không đầy đủ (có người không ghép được)", () => {
  const proposers: PreferenceList[] = [
    { id: "a", ranking: ["x"] },
    { id: "b", ranking: ["x"] },
  ];
  const receivers: PreferenceList[] = [{ id: "x", ranking: ["a", "b"] }];
  const result = stableMatch(proposers, receivers);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.proposer, "a", "x thích a hơn b");
});

// ===========================================================================
// Bloom filter "đã swipe"
// ===========================================================================
test("Bloom filter KHÔNG BAO GIỜ có false negative (yêu cầu bất di bất dịch)", () => {
  const f = new SeenFilter(5000, 0.01);
  const added: bigint[] = [];
  for (let i = 0; i < 5000; i++) {
    const id = BigInt(i * 7919 + 1);
    f.add(id);
    added.push(id);
  }
  for (const id of added) {
    assert.equal(f.mayHaveSeen(id), true, `false negative với id ${id} — không được phép`);
  }
});

test("Bloom filter giữ tỉ lệ dương tính giả gần mức cấu hình", () => {
  const f = new SeenFilter(5000, 0.01);
  for (let i = 0; i < 5000; i++) f.add(BigInt(i * 7919 + 1));
  let fp = 0;
  const trials = 20000;
  for (let i = 0; i < trials; i++) {
    const id = BigInt(-(i + 1) * 104729);
    if (f.mayHaveSeen(id)) fp++;
  }
  const rate = fp / trials;
  assert.ok(rate < 0.05, `tỉ lệ dương tính giả quá cao: ${(rate * 100).toFixed(2)}%`);
});

test("Bloom filter cho 10.000 lượt swipe chỉ tốn ~12KB", () => {
  const f = new SeenFilter(10_000, 0.01);
  assert.ok(f.sizeBytes < 16_000, `${f.sizeBytes} byte`);
  assert.ok(f.hashCount >= 3);
});

// ===========================================================================
// Pipeline deck 3 tầng
// ===========================================================================
test("deck: không bao giờ trả về người đã swipe", async () => {
  const users = Array.from({ length: 120 }, (_, i) =>
    mkUser(i + 1, { loc: { lat: 21.0 + (i % 10) * 0.005, lng: 105.8 + (i % 9) * 0.005 } }),
  );
  const cells = [...new Set(users.map((u) => cellId(u.loc).toString()))].map((c) => ({
    cell: BigInt(c),
    load: 1,
  }));
  const shards = buildShards(cells, 3);
  const builder = new DeckBuilder(shards, new InMemoryCandidateSource(users, shards));

  const viewer = users[0]!;
  const first = await builder.build({ viewer, deckSize: 10 });
  assert.ok(first.cards.length > 0);

  for (const c of first.cards) builder.markSwiped(viewer.userId, c.userId);
  const second = await builder.build({ viewer, deckSize: 10 });

  const firstIds = new Set(first.cards.map((c) => c.userId.toString()));
  for (const c of second.cards) {
    assert.ok(!firstIds.has(c.userId.toString()), `hiện lại người đã swipe: ${c.userId}`);
  }
});

test("deck: không bao giờ chứa chính viewer, và tôn trọng deckSize", async () => {
  const users = Array.from({ length: 80 }, (_, i) => mkUser(i + 1));
  const cells = [{ cell: cellId(users[0]!.loc), load: 1 }];
  const shards = buildShards(cells, 1);
  const builder = new DeckBuilder(shards, new InMemoryCandidateSource(users, shards));
  const out = await builder.build({ viewer: users[0]!, deckSize: 7 });
  assert.ok(out.cards.length <= 7);
  assert.ok(!out.cards.some((c) => c.userId === users[0]!.userId));
  assert.ok(out.shardsQueried >= 1);
});
