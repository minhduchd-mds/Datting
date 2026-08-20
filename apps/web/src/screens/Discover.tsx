import { useCallback, useEffect, useRef, useState } from "react";
import { canUndo, UNDO_WINDOW_MS, type UndoCandidate } from "@datting/core";
import { useHotkeys } from "@datting/ui-web/hooks";
import { Button } from "@datting/ui-web/primitives";

import { PROFILES } from "../data/profiles.js";
import { ProfileDetail } from "./ProfileDetail.js";

import { api, type DeckCard, type SwipeAction } from "../api.js";
import { SwipeCard } from "../SwipeCard.js";

const PAGE = 20;

/**
 * Màn Đề xuất.
 *
 * ─── Bàn phím là giao diện, không phải phím tắt ──────────────────────────
 * Bản web KHÔNG có cử chỉ vuốt, nên phím thay hoàn toàn. Thiết kế VTF-6 ghi
 * thẳng dưới thẻ: `← Bỏ qua · → Kết nối · ↓ Xem chi tiết · Enter Mở hồ sơ`,
 * và có hẳn hai màn tên "Hiệu ứng next trên bàn phím".
 *
 * ─── Vì sao gửi LẠC QUAN ─────────────────────────────────────────────────
 * Thẻ đổi ngay khi bấm phím, request chạy nền. Chờ mạng cho mỗi lượt sẽ phá
 * nhịp duyệt — cùng lý do khiến `apps/admin` ẩn mục khỏi hàng đợi trước khi
 * gửi. Đổi lại phải có đường lùi, nên có `Z` hoàn tác.
 *
 * ─── Cửa sổ hoàn tác dùng LẠI logic của core ─────────────────────────────
 * `canUndo()` và `UNDO_WINDOW_MS` nằm ở `packages/core`, đã có test, và bản
 * mobile cũng dùng chúng. Viết bản thứ hai cho web là bảo đảm hai bản sẽ lệch.
 */
export function Discover() {
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState("");

  /** Lượt vuốt gần nhất, để `Z` lùi lại. Shape khớp `UndoCandidate` của core. */
  const last = useRef<UndoCandidate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await api.fetchDeck(PAGE));
      setIndex(0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const top = cards[index];

  const decide = useCallback(
    (action: SwipeAction) => {
      if (!top) return;
      const at = Date.now();
      last.current = { action, atMs: at, sent: false, createdMatch: false };
      setIndex((i) => i + 1);
      setDetail(false);
      setToast(action === "like" ? "Đã gửi lượt kết nối" : "Đã bỏ qua");

      void api
        .swipe(top.userId, action)
        .then((r) => {
          if (last.current && last.current.atMs === at) {
            last.current.sent = true;
            last.current.createdMatch = r.matched;
          }
          if (r.matched) setToast("Hai bạn đã kết nối!");
        })
        .catch(() => setToast("Không gửi được — sẽ thử lại"));
    },
    [top],
  );

  const undo = useCallback(() => {
    const l = last.current;
    if (!l) return;
    // `canUndo` là nguồn sự thật DUY NHẤT của quy tắc hoàn tác: hết cửa sổ thì
    // không lùi, và lượt đã tạo match thì KHÔNG BAO GIỜ lùi được — huỷ một match
    // sau lưng người kia là chuyện khác hẳn với sửa một cú bấm nhầm.
    const verdict = canUndo(l, Date.now());
    if (!verdict.ok) {
      setToast(
        verdict.reason === "expired"
          ? `Quá ${UNDO_WINDOW_MS / 1000} giây, không hoàn tác được`
          : verdict.reason === "matched"
            ? "Đã kết nối rồi, không hoàn tác được"
            : "Không có gì để hoàn tác",
      );
      return;
    }
    last.current = null;
    setIndex((i) => Math.max(0, i - 1));
    setToast("Đã hoàn tác");
  }, []);

  useHotkeys(
    {
      arrowleft: () => decide("pass"),
      arrowright: () => decide("like"),
      arrowdown: () => setDetail((d) => !d),
      enter: () => setProfileOpen(true),
      z: undo,
      escape: () => setProfileOpen(false),
    },
    !loading && !failed,
  );

  if (failed) {
    return (
      <div className="empty">
        <h1 className="empty__title">Không tải được gợi ý</h1>
        <Button tone="accent" onClick={() => void load()}>Thử lại</Button>
      </div>
    );
  }

  return (
    <>
      <header className="disc__head">
        <div>
          <h1 className="disc__title">Đề xuất</h1>
          <p className="disc__sub">Ưu tiên điểm chung và nhịp sống, không phải thứ tự đăng ký.</p>
        </div>
      </header>

      <div className="disc__stage">
        {loading ? (
          <div className="card" aria-busy="true" />
        ) : !top ? (
          <div className="empty">
            <h2 className="empty__title">Hết gợi ý quanh đây</h2>
            <Button tone="accent" onClick={() => void load()}>Tải thêm</Button>
          </div>
        ) : (
          <>
            <SwipeCard
              card={top}
              behind={cards[index + 1]}
              onDecide={decide}
              onOpenProfile={() => setProfileOpen(true)}
            />

            {detail && (
              <div className="detail">
                {([
                  ["Sở thích", top.breakdown.interest],
                  ["Tính cách", top.breakdown.personality],
                  ["Khoảng cách", top.breakdown.location],
                ] as const).map(([label, v]) => (
                  <div key={label} className="detail__row">
                    <span className="detail__label">{label}</span>
                    <span className="detail__bar">
                      <span className="detail__fill" style={{ width: `${v}%` }} />
                    </span>
                    <span className="detail__val">{v}%</span>
                  </div>
                ))}
              </div>
            )}

          </>
        )}

        <p className="disc__toast" role="status">{toast}</p>

        <p className="disc__keys">
          <span><kbd>←</kbd>Bỏ qua</span>
          <span><kbd>→</kbd>Kết nối</span>
          <span><kbd>↓</kbd>Chi tiết</span>
          <span><kbd>↵</kbd>Mở hồ sơ</span>
          <span><kbd>Z</kbd>Hoàn tác</span>
        </p>
      </div>

      {profileOpen && top && (() => {
        const full = PROFILES.find((p) => p.userId === top.userId);
        return full ? (
          <ProfileDetail
            profile={full}
            onClose={() => setProfileOpen(false)}
            onDecide={(a) => { setProfileOpen(false); decide(a); }}
          />
        ) : null;
      })()}
    </>
  );
}
