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
 * ─── Bàn phím đi SONG SONG với kéo, không thay thế ───────────────────────
 * Thiết kế VTF-6 có cả hai: hai màn `Kéo phải`/`Kéo trái` (thẻ nghiêng, thẻ sau
 * lưng, tem sao) VÀ dòng gợi ý phím dưới thẻ
 * `← Bỏ qua · → Kết nối · ↓ Xem chi tiết · Enter Mở hồ sơ`. Kéo là tương tác
 * chính; phím là đường tương đương đầy đủ cho người không dùng chuột.
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
  /**
   * Thông báo cho `role="status"`.
   *
   * Giữ kèm bộ đếm chứ không chỉ chuỗi: bỏ qua hai thẻ liên tiếp đều sinh ra
   * đúng chữ "Đã bỏ qua", nội dung text-node không đổi nên trình đọc màn hình
   * không phát hiện thay đổi DOM và IM LẶNG — dù vừa có một quyết định mới
   * thật. Hậu tố zero-width dưới đây ép DOM đổi mà mắt và tai đều không thấy.
   */
  const [toast, setToast] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const say = useCallback((text: string) => {
    setToast((t) => ({ text, n: t.n + 1 }));
  }, []);

  /** Lượt vuốt gần nhất, để `Z` lùi lại. Shape khớp `UndoCandidate` của core. */
  const last = useRef<UndoCandidate | null>(null);

  const load = useCallback(async (cancelled: () => boolean = () => false) => {
    setLoading(true);
    try {
      const deck = await api.fetchDeck(PAGE);
      if (cancelled()) return;
      setCards(deck);
      setIndex(0);
      setFailed(false);
    } catch {
      if (cancelled()) return;
      setFailed(true);
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Cờ huỷ, không phải trang trí: `<StrictMode>` cố ý gọi effect HAI LẦN lúc
    // mount. `DemoApi` đọc-rồi-cộng một bộ đếm dùng chung SAU `await`, nên hai
    // lệnh gọi chồng nhau đua nhau trên bộ đếm đó và lệnh về sau ghi đè — 20 hồ
    // sơ đầu biến mất ngay lần mở đầu tiên trong dev.
    let ignore = false;
    void load(() => ignore);
    return () => {
      ignore = true;
    };
  }, [load]);

  const top = cards[index];

  const decide = useCallback(
    (action: SwipeAction) => {
      if (!top) return;
      const at = Date.now();
      last.current = { action, atMs: at, sent: false, createdMatch: false };
      setIndex((i) => i + 1);
      setDetail(false);
      say(action === "like" ? "Đã gửi lượt kết nối" : "Đã bỏ qua");

      void api
        .swipe(top.userId, action)
        .then((r) => {
          if (last.current && last.current.atMs === at) {
            last.current.sent = true;
            last.current.createdMatch = r.matched;
          }
          if (r.matched) say("Hai bạn đã kết nối!");
        })
        .catch(() => say("Không gửi được — sẽ thử lại"));
    },
    [top, say],
  );

  const undo = useCallback(() => {
    const l = last.current;
    if (!l) return;
    // `canUndo` là nguồn sự thật DUY NHẤT của quy tắc hoàn tác: hết cửa sổ thì
    // không lùi, và lượt đã tạo match thì KHÔNG BAO GIỜ lùi được — huỷ một match
    // sau lưng người kia là chuyện khác hẳn với sửa một cú bấm nhầm.
    const verdict = canUndo(l, Date.now());
    if (!verdict.ok) {
      say(
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
    say("Đã hoàn tác");
  }, [say]);

  // Ổn định danh tính: `ProfileDetail` phụ thuộc chúng trong effect, closure mới
  // mỗi render là gỡ/gắn lại listener vô ích ở mỗi lần cha re-render.
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const decideFromProfile = useCallback(
    (a: SwipeAction) => {
      setProfileOpen(false);
      decide(a);
    },
    [decide],
  );

  useHotkeys(
    {
      arrowleft: () => decide("pass"),
      arrowright: () => decide("like"),
      arrowdown: () => setDetail((d) => !d),
      enter: () => setProfileOpen(true),
      z: undo,
      escape: () => setProfileOpen(false),
    },
    // `!profileOpen` KHÔNG phải chi tiết nhỏ. Base UI đặt `inert` lên phần nền
    // khi lớp phủ mở, nhưng `inert` chặn tiêu điểm và con trỏ — nó KHÔNG chặn
    // một listener `keydown` gắn ở `document`. Thiếu điều kiện này thì đang đọc
    // hồ sơ đầy đủ của một người mà bấm `→` theo phản xạ là gửi luôn một lượt
    // kết nối thật cho chính người đó, rồi tấm hồ sơ lặng lẽ đổi sang người kế.
    !loading && !failed && !profileOpen,
  );

  if (failed) {
    return (
      <div className="empty" role="alert">
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
              // `key` bắt buộc: đổi thẻ bằng bàn phím hoặc bằng nút trong hồ sơ
              // đầy đủ KHÔNG đi qua `finish()` — nơi duy nhất reset trạng thái
              // kéo. Không có key thì cùng một instance nhận thẻ mới trong khi
              // `dx`/`drag.current` của thẻ cũ còn nguyên.
              key={top.userId}
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

        <p className="disc__toast" role="status">{toast.text}{"\u200B".repeat(toast.n % 2)}</p>

        <p className="disc__keys" id="disc-keys">
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
          <ProfileDetail profile={full} onClose={closeProfile} onDecide={decideFromProfile} />
        ) : null;
      })()}
    </>
  );
}
