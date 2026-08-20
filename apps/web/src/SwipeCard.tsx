import { useCallback, useRef, useState } from "react";
import type * as React from "react";
import { cardRotation, flingDuration, stampOpacity } from "@datting/core";

import { Icon } from "./icons.js";
import { displayPercent, type DeckCard, type SwipeAction } from "./api.js";

/**
 * Ngưỡng quyết định là 28% BỀ RỘNG THẬT của thẻ, không phải một số px cố định.
 *
 * Thẻ co giãn theo màn (clamp trong styles.css), nên hằng số 468px cũ khiến
 * cùng một quãng kéo là "đủ" ở màn 2560 và "chưa đủ" ở 1366. Đo bằng
 * `getBoundingClientRect()` lúc bắt đầu kéo là cách duy nhất đúng ở mọi cỡ.
 */
const THRESHOLD_RATIO = 0.28;
/** Vận tốc đủ mạnh thì tính là quyết định dù chưa qua ngưỡng. */
const FLING_VELOCITY = 800;
/** Bề rộng dự phòng khi chưa đo được (lần render đầu, hoặc thẻ đang ẩn). */
const FALLBACK_W = 468;

/**
 * Thẻ vuốt.
 *
 * ─── Kéo LÀ tương tác chính, bàn phím đi song song ────────────────────────
 * Thiết kế VTF-6 có hai màn `Kéo phải` và `Kéo trái` với thẻ nghiêng, thẻ sau
 * lưng và tem sao — kéo không phải phần thêm. Dòng gợi ý phím dưới thẻ là đường
 * SONG SONG cho người dùng bàn phím, không phải đường duy nhất.
 *
 * ─── Toán chuyển động dùng lại của core ───────────────────────────────────
 * `cardRotation`, `stampOpacity`, `flingDuration` nằm ở `packages/core`, đã có
 * test, và bản mobile dùng đúng ba hàm đó. Viết bản thứ hai cho web là bảo đảm
 * hai nền tảng sẽ cho cảm giác khác nhau.
 *
 * ─── Pointer Events chứ không phải mouse/touch riêng ──────────────────────
 * Một bộ handler chạy cho chuột, cảm ứng và bút. `setPointerCapture` giữ được
 * chuỗi sự kiện khi con trỏ rời khỏi thẻ giữa chừng — không có nó, kéo nhanh ra
 * ngoài là thẻ kẹt lại giữa màn.
 */
export interface SwipeCardProps {
  card: DeckCard;
  behind?: DeckCard | undefined;
  onDecide: (action: SwipeAction) => void;
  onOpenProfile: () => void;
}

export function SwipeCard({ card, behind, onDecide, onOpenProfile }: SwipeCardProps) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState(false);
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; w: number } | null>(null);
  /** Bề rộng đo ở lần kéo gần nhất — nút bấm không có sự kiện con trỏ nên cần nó. */
  const widthRef = useRef(FALLBACK_W);

  const finish = useCallback(
    (action: SwipeAction, velocity: number) => {
      const target = (action === "like" ? 1 : -1) * widthRef.current * 2;
      setFlying(true);
      setDx(target);
      // Vuốt càng mạnh bay càng nhanh — thứ khiến cử chỉ có cảm giác thật.
      window.setTimeout(() => {
        setFlying(false);
        setDx(0);
        setDy(0);
        onDecide(action);
      }, flingDuration(velocity, target));
    },
    [onDecide],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (flying) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = e.currentTarget.getBoundingClientRect().width || FALLBACK_W;
    widthRef.current = w;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), w };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setDx(e.clientX - d.x0);
    setDy((e.clientY - d.y0) * 0.35);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);

    const moved = e.clientX - d.x0;
    const ms = Math.max(1, performance.now() - d.t0);
    const velocity = (moved / ms) * 1000;
    const flung = Math.abs(velocity) > FLING_VELOCITY;
    const threshold = d.w * THRESHOLD_RATIO;

    if (moved > threshold || (flung && velocity > 0)) return finish("like", velocity);
    if (moved < -threshold || (flung && velocity < 0)) return finish("pass", velocity);

    setDx(0);
    setDy(0);
  };

  const w = drag.current?.w ?? widthRef.current;
  const rot = cardRotation(dx, w);
  const progress = Math.min(1, Math.abs(dx) / (w * THRESHOLD_RATIO));

  return (
    <div className="deck">
      {behind && (
        <article
          className="card card--behind"
          style={{ transform: `scale(${0.955 + 0.045 * progress})`, opacity: 0.72 + 0.28 * progress }}
          aria-hidden="true"
        >
          <CardFace card={behind} />
        </article>
      )}

      <article
        className={`card${dragging ? " card--dragging" : ""}${flying ? " card--flying" : ""}`}
        style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`${card.name}, ${card.age} tuổi`}
      >
        <CardFace card={card} />

        {/* Tem sao đỏ khi kéo phải, dấu x khi kéo trái — đúng thiết kế. */}
        <span className="stamp stamp--like" style={{ opacity: stampOpacity(dx, w * THRESHOLD_RATIO, 1) }} aria-hidden="true">
          <Icon name="star" size={64} />
        </span>
        <span className="stamp stamp--pass" style={{ opacity: stampOpacity(dx, w * THRESHOLD_RATIO, -1) }} aria-hidden="true">
          <Icon name="x-close" size={56} />
        </span>

        {/* Nút NẰM TRÊN thẻ, tròn, chỉ icon. `stopPropagation` để bấm nút không
            bị hiểu là bắt đầu kéo. */}
        <div className="cardacts" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="cardact cardact--pass" onClick={() => finish("pass", -900)} aria-label="Bỏ qua">
            <Icon name="x-close" size={20} />
          </button>
          <button type="button" className="cardact cardact--like" onClick={() => finish("like", 900)} aria-label="Kết nối">
            <Icon name="star" size={20} />
          </button>
        </div>
      </article>

      <button type="button" className="deck__more" onClick={onOpenProfile}>
        Xem hồ sơ đầy đủ
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}

function CardFace({ card }: { card: DeckCard }) {
  return (
    <>
      <img className="card__img" src={card.photoUrl} alt="" draggable={false} referrerPolicy="no-referrer" />
      <span className="card__scrim" />
      <span className="card__match">{displayPercent(card.breakdown)}% phù hợp</span>
      <div className="card__info">
        <h2 className="card__name">{card.name}, {card.age}</h2>
        {/* CHỈ chức danh và khu vực đã làm mờ — không có đơn vị công tác. */}
        <p className="card__job">{card.jobTitle} · {card.community}</p>
        <div className="card__topics">
          {card.topics.map((t) => (
            <span key={t} className="card__topic">{t}</span>
          ))}
        </div>
      </div>
    </>
  );
}
