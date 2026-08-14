import { reportPriority, type ReportItem } from "@datting/core";
import type { ReportResolution } from "../api.js";
import { REASON_LABEL, REASON_TONE, formatAge } from "../labels.js";

interface Props {
  queue: ReportItem[];
  nowMs: number;
  selected: number;
  onSelect: (index: number) => void;
  onResolve: (report: ReportItem, resolution: ReportResolution) => void;
}

/**
 * Hàng đợi báo cáo, xếp theo mức nghiêm trọng.
 *
 * Điểm ưu tiên được HIỆN RA chứ không giấu đi. Người kiểm duyệt cần hiểu vì sao
 * một mục nằm trên đầu; một hàng đợi sắp xếp theo luật vô hình sẽ bị nghi ngờ,
 * rồi bị bỏ qua để tự cuộn tay — và lúc đó thứ tự ưu tiên coi như không tồn tại.
 */
export function ReportQueue({ queue, nowMs, selected, onSelect, onResolve }: Props) {
  const current = queue[selected];

  if (queue.length === 0) {
    return (
      <div className="empty">
        <h2>Không có báo cáo đang mở</h2>
        <p>Mọi báo cáo đã được xử lý hoặc bác bỏ.</p>
      </div>
    );
  }

  return (
    <div className="reports">
      <ol className="reports__list">
        {queue.map((r, i) => (
          <li key={r.reportId}>
            <button
              className={`row${i === selected ? " row--on" : ""}`}
              onClick={() => onSelect(i)}
              aria-current={i === selected}
            >
              <span className={`tag tag--${REASON_TONE[r.reason]}`}>
                {REASON_LABEL[r.reason]}
              </span>
              <span className="row__target">
                <code>{r.reportedUserId}</code>
              </span>
              {r.distinctReportersAgainstTarget > 1 && (
                <span className="row__multi">
                  {r.distinctReportersAgainstTarget} người tố
                </span>
              )}
              <span className="row__age">{formatAge(r.createdAtMs, nowMs)}</span>
              <span className="row__score">
                {reportPriority(r, nowMs).toFixed(0)}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {current && (
        <aside className="reports__detail">
          <dl className="meta">
            <dt>Báo cáo</dt>
            <dd>
              <code>{current.reportId}</code>
            </dd>
            <dt>Bị tố</dt>
            <dd>
              <code>{current.reportedUserId}</code>
            </dd>
            <dt>Người tố</dt>
            <dd>
              <code>{current.reporterId}</code>
            </dd>
            <dt>Lý do</dt>
            <dd>{REASON_LABEL[current.reason]}</dd>
            <dt>Số người tố</dt>
            <dd>{current.distinctReportersAgainstTarget}</dd>
            <dt>Chờ</dt>
            <dd>{formatAge(current.createdAtMs, nowMs)}</dd>
          </dl>

          {current.detail && <blockquote className="detail">{current.detail}</blockquote>}

          <div className="actions actions--col">
            <button className="btn" onClick={() => onResolve(current, "dismiss")}>
              Bác bỏ <kbd>Q</kbd>
            </button>
            <button className="btn btn--warn" onClick={() => onResolve(current, "warn")}>
              Nhắc nhở <kbd>W</kbd>
            </button>
            <button className="btn btn--warn" onClick={() => onResolve(current, "suspend")}>
              Tạm khoá <kbd>E</kbd>
            </button>
            <button className="btn btn--bad" onClick={() => onResolve(current, "ban")}>
              Khoá vĩnh viễn <kbd>R</kbd>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
