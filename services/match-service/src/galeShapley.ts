/**
 * Gale–Shapley (deferred acceptance) — job batch hằng đêm sinh gợi ý cặp đôi.
 *
 * Đây chính là màn `PairCard "Giới thiệu ngày 10/07/2026"` trong Figma, và là
 * mô hình Hinge dùng cho "Most Compatible": xếp hạng thành viên theo sở thích
 * do ML suy ra, ghép mỗi người với người họ ưu tiên nhất về lý thuyết, rồi
 * HIỂN THỊ CHO CẢ HAI BÊN CÙNG LÚC và hết hạn sau 24 giờ.
 *
 * Vì đây là bài toán gán ghép hai phía TOÀN CỤC, nó phải chạy theo lô — không
 * thể realtime. Trong production, chạy trong TỪNG GEOSHARD, không giải toàn cầu
 * (độ phức tạp O(n²) và không có ý nghĩa sản phẩm khi cách nhau 2000 km).
 *
 * Tính chất đảm bảo: kết quả là một STABLE MATCHING — không tồn tại cặp (a,b)
 * mà cả hai đều thích nhau hơn người mình đang được ghép. Đó là thứ khiến
 * người dùng không cảm thấy "hệ thống ghép sai".
 */

export interface PreferenceList {
  id: string;
  /** Danh sách id phía bên kia, xếp từ thích nhất → ít thích nhất. */
  ranking: string[];
}

export interface Pairing {
  proposer: string;
  receiver: string;
}

/**
 * Chạy deferred acceptance. `proposers` chủ động ngỏ lời, `receivers` chấp
 * nhận/từ chối. Kết quả tối ưu cho phía proposer (tính chất đã biết của thuật
 * toán) — nên trong sản phẩm hãy LUÂN PHIÊN vai trò giữa các ngày để công bằng.
 */
export function stableMatch(
  proposers: PreferenceList[],
  receivers: PreferenceList[],
): Pairing[] {
  const recRank = new Map<string, Map<string, number>>();
  for (const r of receivers) {
    const m = new Map<string, number>();
    r.ranking.forEach((id, i) => m.set(id, i));
    recRank.set(r.id, m);
  }

  const nextProposal = new Map<string, number>(proposers.map((p) => [p.id, 0]));
  const prefById = new Map(proposers.map((p) => [p.id, p.ranking]));
  const engagedTo = new Map<string, string>(); // receiver -> proposer
  const free: string[] = proposers.map((p) => p.id);

  while (free.length > 0) {
    const p = free[0]!;
    const list = prefById.get(p) ?? [];
    const idx = nextProposal.get(p) ?? 0;
    if (idx >= list.length) {
      free.shift(); // đã ngỏ lời hết danh sách mà vẫn tự do
      continue;
    }
    nextProposal.set(p, idx + 1);
    const r = list[idx]!;
    const rank = recRank.get(r);
    if (!rank || !rank.has(p)) continue; // receiver không chấp nhận p

    const current = engagedTo.get(r);
    if (current === undefined) {
      engagedTo.set(r, p);
      free.shift();
    } else if (rank.get(p)! < rank.get(current)!) {
      engagedTo.set(r, p); // receiver thích p hơn → đổi
      free.shift();
      free.push(current);
    }
    // ngược lại: bị từ chối, p vẫn tự do, vòng lặp sau ngỏ lời người tiếp theo
  }

  return [...engagedTo.entries()].map(([receiver, proposer]) => ({ proposer, receiver }));
}

/**
 * Kiểm tra tính ỔN ĐỊNH của kết quả. Dùng làm invariant trong test và trong
 * job production (chạy trên mẫu ngẫu nhiên để phát hiện lỗi hồi quy).
 *
 * Trả về danh sách "cặp chặn" — nếu rỗng thì kết quả là stable matching.
 */
export function findBlockingPairs(
  proposers: PreferenceList[],
  receivers: PreferenceList[],
  result: Pairing[],
): Array<[string, string]> {
  const partnerOfProposer = new Map(result.map((p) => [p.proposer, p.receiver]));
  const partnerOfReceiver = new Map(result.map((p) => [p.receiver, p.proposer]));
  const rankOf = (list: string[], id: string) => {
    const i = list.indexOf(id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  const recById = new Map(receivers.map((r) => [r.id, r]));

  const blocking: Array<[string, string]> = [];
  for (const p of proposers) {
    const cur = partnerOfProposer.get(p.id);
    const curRank = cur === undefined ? Number.POSITIVE_INFINITY : rankOf(p.ranking, cur);
    for (const rId of p.ranking) {
      if (rankOf(p.ranking, rId) >= curRank) break; // không thích hơn người hiện tại
      const r = recById.get(rId);
      if (!r) continue;
      const rCur = partnerOfReceiver.get(rId);
      const rCurRank = rCur === undefined ? Number.POSITIVE_INFINITY : rankOf(r.ranking, rCur);
      if (rankOf(r.ranking, p.id) < rCurRank) blocking.push([p.id, rId]);
    }
  }
  return blocking;
}
