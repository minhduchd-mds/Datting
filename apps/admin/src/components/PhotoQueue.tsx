import type { PhotoItem } from "@datting/core";
import type { PhotoDecision } from "../api.js";
import { formatAge } from "../labels.js";

const CDN_BASE: string | undefined = import.meta.env["VITE_CDN_BASE"];

interface Props {
  queue: PhotoItem[];
  nowMs: number;
  onDecide: (photo: PhotoItem, decision: PhotoDecision) => void;
}

/**
 * Duyệt ảnh — MỘT ảnh mỗi lần, không phải lưới.
 *
 * Lưới nhanh hơn khi phần lớn ảnh hiển nhiên hợp lệ. Nhưng ở đây ML đã nuốt hết
 * phần hiển nhiên rồi; thứ còn lại đúng bằng định nghĩa là dải KHÔNG CHẮC CHẮN.
 * Ảnh trong dải đó phải nhìn kỹ mới quyết được, mà nhìn kỹ thì ảnh phải to.
 * Lưới ở đây chỉ tạo cảm giác nhanh rồi đẩy tỉ lệ sai lên.
 */
export function PhotoQueue({ queue, nowMs, onDecide }: Props) {
  const current = queue[0];

  if (!current) {
    return (
      <div className="empty">
        <h2>Hết ảnh chờ duyệt</h2>
        <p>Không còn ảnh nào nằm trong dải không chắc chắn của ML.</p>
      </div>
    );
  }

  const score = current.mlSafeScore;

  return (
    <div className="photo">
      <div className="photo__stage">
        {CDN_BASE ? (
          <img
            className="photo__img"
            src={CDN_BASE + current.cdnKey}
            alt={`Ảnh chờ duyệt ${current.photoId}`}
            /* Ảnh do người lạ tải lên. Không để nó rò referer sang CDN. */
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="photo__placeholder">
            <code>{current.cdnKey}</code>
            <span>
              Chưa cấu hình <code>VITE_CDN_BASE</code> — không tải ảnh thật.
            </span>
          </div>
        )}
      </div>

      <aside className="photo__side">
        <dl className="meta">
          <dt>Ảnh</dt>
          <dd>
            <code>{current.photoId}</code>
          </dd>
          <dt>Người dùng</dt>
          <dd>
            <code>{current.userId}</code>
          </dd>
          <dt>Vị trí</dt>
          <dd>{current.position + 1}/6</dd>
          <dt>Chờ</dt>
          <dd>{formatAge(current.createdAtMs, nowMs)}</dd>
        </dl>

        <div className="score">
          <div className="score__head">
            <span>Điểm an toàn ML</span>
            <strong>{score === undefined ? "chưa chấm" : score.toFixed(3)}</strong>
          </div>
          {/*
            Thanh này cố ý KHÔNG tô xanh/đỏ theo điểm. Ảnh tới được đây nghĩa là
            ML đã bó tay; tô màu gợi ý sẵn một hướng chỉ làm người duyệt bị mồi.
          */}
          <div className="score__bar">
            <div
              className="score__fill"
              style={{ width: `${(score ?? 0.5) * 100}%` }}
            />
          </div>
          <p className="score__note">
            Còn <strong>{queue.length}</strong> ảnh trong hàng đợi.
          </p>
        </div>

        <div className="actions">
          <button className="btn btn--ok" onClick={() => onDecide(current, "approve")}>
            Duyệt <kbd>A</kbd>
          </button>
          <button className="btn btn--warn" onClick={() => onDecide(current, "blur")}>
            Làm mờ <kbd>S</kbd>
          </button>
          <button className="btn btn--bad" onClick={() => onDecide(current, "block")}>
            Chặn <kbd>D</kbd>
          </button>
        </div>
      </aside>
    </div>
  );
}
