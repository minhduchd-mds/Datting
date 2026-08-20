import { useCallback, useEffect, useMemo, useState } from "react";
import type { PhotoItem, ReportItem } from "@datting/core";

import {
  createApi,
  deriveQueues,
  IS_DEMO,
  type PhotoDecision,
  type QueueSnapshot,
  type ReportResolution,
} from "./api.js";
import { useHotkeys } from "@datting/ui-web/hooks";
import { useDeferredDecisions } from "./useDeferredDecisions.js";
import { BacklogStats } from "./components/BacklogStats.js";
import { PhotoQueue } from "./components/PhotoQueue.js";
import { ReportQueue } from "./components/ReportQueue.js";

type Tab = "photos" | "reports";

const PHOTO_VERB: Record<PhotoDecision, string> = {
  approve: "Duyệt",
  blur: "Làm mờ",
  block: "Chặn",
};

const REPORT_VERB: Record<ReportResolution, string> = {
  dismiss: "Bác bỏ",
  warn: "Nhắc nhở",
  suspend: "Tạm khoá",
  ban: "Khoá vĩnh viễn",
};

export default function App() {
  const api = useMemo(() => createApi(Date.now()), []);
  const [snap, setSnap] = useState<QueueSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("photos");
  const [selected, setSelected] = useState(0);

  // Đồng hồ nhích mỗi 30 giây. Không dùng Date.now() thẳng trong lúc render:
  // render phải là hàm thuần của state, nếu không thì "chờ 3 giờ" đổi thành
  // "chờ 3 giờ" ở một thời điểm ngẫu nhiên nào đó tuỳ React vẽ lại lúc nào.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(() => {
    api
      .fetchQueues()
      .then((s) => {
        setSnap(s);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [api]);

  useEffect(load, [load]);

  const deferred = useDeferredDecisions();
  const { pendingKeys, pending, submit, undo } = deferred;

  const decidePhoto = useCallback(
    (photo: PhotoItem, decision: PhotoDecision) => {
      submit({
        key: photo.photoId,
        label: `${PHOTO_VERB[decision]} ảnh ${photo.photoId}`,
        commit: () => api.decidePhoto(photo.photoId, decision),
      });
    },
    [api, submit],
  );

  const resolveReport = useCallback(
    (report: ReportItem, resolution: ReportResolution) => {
      submit({
        key: report.reportId,
        label: `${REPORT_VERB[resolution]} — ${report.reportedUserId}`,
        commit: () => api.resolveReport(report.reportId, resolution),
      });
    },
    [api, submit],
  );

  // Lọc phần đang treo ra khỏi tầm nhìn NGAY, trước khi thật sự gửi đi. Bấm
  // xong là mục biến mất; nếu chờ server trả lời rồi mới ẩn thì mỗi quyết định
  // phải trả giá một vòng mạng, và ở 10 giây/ảnh thì cái giá đó thấy rõ.
  const visible: QueueSnapshot = snap
    ? {
        ...snap,
        photos: snap.photos.filter((p) => !pendingKeys.has(p.photoId)),
        reports: snap.reports.filter((r) => !pendingKeys.has(r.reportId)),
      }
    : { photos: [], reports: [], totalPhotosPending: 0, totalReportsOpen: 0 };

  const derived = deriveQueues(visible, nowMs);
  const { photoQueue, reportQueue } = derived;

  // Xử lý xong mục cuối thì con trỏ phải lùi lại, không được trỏ ra ngoài mảng.
  const safeSelected = Math.min(selected, Math.max(0, reportQueue.length - 1));
  useEffect(() => {
    if (safeSelected !== selected) setSelected(safeSelected);
  }, [safeSelected, selected]);

  const currentReport = reportQueue[safeSelected];
  const currentPhoto = photoQueue[0];

  useHotkeys({
    "1": () => setTab("photos"),
    "2": () => setTab("reports"),
    z: () => undo(),
    g: load,
    ...(tab === "photos" && currentPhoto
      ? {
          a: () => decidePhoto(currentPhoto, "approve"),
          s: () => decidePhoto(currentPhoto, "blur"),
          d: () => decidePhoto(currentPhoto, "block"),
        }
      : {}),
    ...(tab === "reports"
      ? {
          j: () => setSelected((i) => Math.min(i + 1, reportQueue.length - 1)),
          k: () => setSelected((i) => Math.max(i - 1, 0)),
          arrowdown: () => setSelected((i) => Math.min(i + 1, reportQueue.length - 1)),
          arrowup: () => setSelected((i) => Math.max(i - 1, 0)),
          ...(currentReport
            ? {
                q: () => resolveReport(currentReport, "dismiss"),
                w: () => resolveReport(currentReport, "warn"),
                e: () => resolveReport(currentReport, "suspend"),
                r: () => resolveReport(currentReport, "ban"),
              }
            : {}),
        }
      : {}),
  });

  return (
    <div className="app">
      <header className="topbar">
        <h1>Kiểm duyệt</h1>
        <nav className="tabs">
          <button
            className={`tab${tab === "photos" ? " tab--on" : ""}`}
            onClick={() => setTab("photos")}
          >
            Ảnh <span className="badge">{photoQueue.length}</span> <kbd>1</kbd>
          </button>
          <button
            className={`tab${tab === "reports" ? " tab--on" : ""}`}
            onClick={() => setTab("reports")}
          >
            Báo cáo <span className="badge">{reportQueue.length}</span> <kbd>2</kbd>
          </button>
        </nav>
        {IS_DEMO && (
          <span className="demo" title="Chưa cấu hình VITE_API_BASE">
            DỮ LIỆU DEMO
          </span>
        )}
      </header>

      {error && (
        <div className="error" role="alert">
          Không tải được hàng đợi: {error} — <button onClick={load}>thử lại</button>
        </div>
      )}

      {snap === null && !error ? (
        <div className="empty">
          <h2>Đang tải…</h2>
        </div>
      ) : (
        <>
          <BacklogStats derived={derived} totalPhotosPending={visible.photos.length} />

          <main className="work">
            {tab === "photos" ? (
              <PhotoQueue queue={photoQueue} nowMs={nowMs} onDecide={decidePhoto} />
            ) : (
              <ReportQueue
                queue={reportQueue}
                nowMs={nowMs}
                selected={safeSelected}
                onSelect={setSelected}
                onResolve={resolveReport}
              />
            )}
          </main>
        </>
      )}

      <footer className="undobar" aria-live="polite">
        {pending.length > 0 ? (
          <>
            <span className="undobar__text">
              {pending[pending.length - 1]!.label}
              {pending.length > 1 && ` (+${pending.length - 1} nữa)`}
            </span>
            <button className="btn btn--ghost" onClick={() => undo()}>
              Hoàn tác <kbd>Z</kbd>
            </button>
          </>
        ) : (
          <span className="undobar__hint">
            <kbd>1</kbd>/<kbd>2</kbd> đổi tab · <kbd>A</kbd> duyệt · <kbd>S</kbd> làm mờ ·{" "}
            <kbd>D</kbd> chặn · <kbd>J</kbd>/<kbd>K</kbd> di chuyển · <kbd>Z</kbd> hoàn tác ·{" "}
            <kbd>G</kbd> tải lại
          </span>
        )}
      </footer>
    </div>
  );
}
