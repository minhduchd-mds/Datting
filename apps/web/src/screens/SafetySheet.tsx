import { useState } from "react";
import { Sheet, Button } from "@datting/ui-web/primitives";
import { REPORT_REASON, type ReportReason } from "@datting/core";

import { Icon } from "../icons.js";
import { api } from "../api.js";
import type { Profile } from "../data/profiles.js";

/**
 * Báo cáo · chặn · huỷ kết nối.
 *
 * ─── Vì sao đây là mục ưu tiên số một ─────────────────────────────────────
 * Bản web cho mở TOÀN BỘ hồ sơ một người lạ và nhắn tin cho họ, nhưng trước
 * màn này không có bất kỳ đường nào để báo cáo hay chặn. Đó là khoảng trống an
 * toàn, không phải khoảng trống tính năng — và ba lệnh API tương ứng đã có sẵn
 * ở bản mobile từ trước, nên nó cũng là việc rẻ nhất trong danh sách.
 *
 * ─── Danh sách lý do lấy TỪ core, không viết lại ──────────────────────────
 * `REPORT_REASON` là nguồn sự thật duy nhất và nó khớp cột `reports.reason`.
 * Viết bản thứ hai ở đây là bảo đảm hai bản sẽ lệch — đúng lỗi đã xảy ra một
 * lần rồi: app di động gửi mã 6 trong khi bảng chỉ biết tới 5, và hỏng im lặng
 * cho tới khi có người đọc lại.
 *
 * ─── Thứ tự trong danh sách KHÔNG phải thứ tự mã số ───────────────────────
 * Xếp theo mức độ người dùng cần tới, không theo `reason ASC`. Quấy rối là thứ
 * người ta hoảng nhất và cần bấm nhanh nhất, nên nó đứng đầu — dù mã của nó là
 * 2 chứ không phải 1.
 */
const REASONS: { code: ReportReason; label: string; hint: string }[] = [
  { code: REPORT_REASON.HARASSMENT, label: "Quấy rối hoặc doạ nạt", hint: "Tin nhắn xúc phạm, đeo bám, ép buộc." },
  { code: REPORT_REASON.BAD_CONTENT, label: "Nội dung không phù hợp", hint: "Ảnh hoặc chữ mang tính tình dục, bạo lực." },
  { code: REPORT_REASON.IMPERSONATION, label: "Giả mạo người khác", hint: "Dùng ảnh hoặc danh tính của người khác." },
  { code: REPORT_REASON.SCAM, label: "Lừa đảo hoặc xin tiền", hint: "Dụ đầu tư, vay mượn, dẫn sang app khác." },
  { code: REPORT_REASON.SPAM, label: "Spam hoặc quảng cáo", hint: "Gửi link, rao bán, tài khoản tự động." },
  { code: REPORT_REASON.OTHER, label: "Lý do khác", hint: "Mô tả giúp bên mình ở ô bên dưới." },
];

export interface SafetySheetProps {
  peer: Profile;
  /** Có chỉ khi hai người đã kết nối — quyết định việc hiện nút huỷ kết nối. */
  pairKey?: string | undefined;
  onClose: () => void;
  /** Gọi khi người dùng vừa chặn hoặc huỷ kết nối, để màn cha dọn theo. */
  onGone?: ((reason: "blocked" | "unmatched") => void) | undefined;
}

type Step = "menu" | "report" | "confirm-block" | "confirm-unmatch" | "done";

export function SafetySheet({ peer, pairKey, onClose, onGone }: SafetySheetProps) {
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneText, setDoneText] = useState("");

  const ten = peer.name.split(" ").slice(-1)[0];

  async function run(fn: () => Promise<void>, text: string, gone?: "blocked" | "unmatched") {
    setBusy(true);
    try {
      await fn();
      setDoneText(text);
      setStep("done");
      if (gone) onGone?.(gone);
    } catch {
      setDoneText("Không gửi được — kiểm tra kết nối rồi thử lại.");
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} label={`An toàn — ${peer.name}`}>
      <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">
        <Icon name="x-close" size={20} />
      </button>

      <h1 className="pf__name">An toàn</h1>
      <p className="pf__meta">Về hồ sơ của {peer.name}</p>

      {step === "menu" && (
        <div className="safe__menu">
          <MenuRow
            title="Báo cáo hồ sơ này"
            body="Đội kiểm duyệt sẽ xem. Người kia không biết bạn đã báo cáo."
            onClick={() => setStep("report")}
          />
          <MenuRow
            title={`Chặn ${ten}`}
            body="Hai bên không còn thấy nhau ở bất kỳ đâu. Có thể bỏ chặn sau."
            onClick={() => setStep("confirm-block")}
          />
          {pairKey && (
            <MenuRow
              title="Huỷ kết nối"
              body="Gỡ kết nối và ẩn cuộc trò chuyện. Không thể hoàn tác."
              tone="danger"
              onClick={() => setStep("confirm-unmatch")}
            />
          )}
        </div>
      )}

      {step === "report" && (
        <>
          <p className="safe__lead">Điều gì đang xảy ra?</p>
          <div className="safe__reasons">
            {REASONS.map((r) => (
              <label key={r.code} className={`safe__reason${reason === r.code ? " safe__reason--on" : ""}`}>
                <input
                  type="radio"
                  name="report-reason"
                  className="dw-sr-only"
                  checked={reason === r.code}
                  onChange={() => setReason(r.code)}
                />
                <span className="safe__reasonLabel">{r.label}</span>
                <span className="safe__reasonHint">{r.hint}</span>
              </label>
            ))}
          </div>

          <label className="safe__detailWrap">
            <span className="safe__detailLabel">
              Mô tả thêm {reason === REPORT_REASON.OTHER ? "(cần thiết)" : "(không bắt buộc)"}
            </span>
            <textarea
              className="safe__detail"
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Chuyện gì đã xảy ra? Càng cụ thể càng xử lý nhanh."
            />
          </label>

          {/* KHÔNG hứa thời gian xử lý. Đội kiểm duyệt là một người và hàng đợi
              xếp theo mức nghiêm trọng chứ không theo thứ tự tới — mọi con số
              cụ thể viết ở đây đều sẽ sai. */}
          <p className="safe__note">
            Báo cáo được xếp theo mức nghiêm trọng, không theo thứ tự gửi.
          </p>

          <div className="pf__actions">
            <Button onClick={() => setStep("menu")}>Quay lại</Button>
            <Button
              tone="danger"
              disabled={busy || reason === null || (reason === REPORT_REASON.OTHER && !detail.trim())}
              onClick={() =>
                void run(
                  () => api.report(peer.userId, reason!, detail.trim()),
                  "Đã gửi báo cáo. Bên mình sẽ xem.",
                )
              }
            >
              Gửi báo cáo
            </Button>
          </div>
        </>
      )}

      {step === "confirm-block" && (
        <Confirm
          title={`Chặn ${ten}?`}
          body={`${ten} sẽ không thấy hồ sơ của bạn nữa và bạn cũng không thấy họ. Nếu hai bên đang kết nối, kết nối đó bị gỡ.`}
          cta="Chặn"
          busy={busy}
          onBack={() => setStep("menu")}
          onGo={() => void run(() => api.block(peer.userId), `Đã chặn ${ten}.`, "blocked")}
        />
      )}

      {step === "confirm-unmatch" && (
        <Confirm
          title="Huỷ kết nối?"
          body={`Cuộc trò chuyện với ${ten} sẽ bị ẩn và hai bên không nhắn cho nhau được nữa. Việc này không hoàn tác được.`}
          cta="Huỷ kết nối"
          busy={busy}
          onBack={() => setStep("menu")}
          onGo={() => void run(() => api.unmatch(pairKey!), "Đã huỷ kết nối.", "unmatched")}
        />
      )}

      {step === "done" && (
        <div className="safe__done" role="status">
          <p className="safe__doneText">{doneText}</p>
          <Button tone="accent" onClick={onClose}>Xong</Button>
        </div>
      )}
    </Sheet>
  );
}

function MenuRow({
  title,
  body,
  tone,
  onClick,
}: {
  title: string;
  body: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button type="button" className={`safe__row${tone === "danger" ? " safe__row--danger" : ""}`} onClick={onClick}>
      <span className="safe__rowTitle">{title}</span>
      <span className="safe__rowBody">{body}</span>
      <Icon name="chevron-right" size={18} className="safe__rowChev" />
    </button>
  );
}

/**
 * Bước xác nhận cho hành động không hoàn tác được.
 *
 * Câu hỏi nói rõ HẬU QUẢ bằng lời, không dùng "Bạn có chắc không?" — câu đó
 * không cung cấp một thông tin nào cho người đang phải quyết định.
 */
function Confirm({
  title,
  body,
  cta,
  busy,
  onBack,
  onGo,
}: {
  title: string;
  body: string;
  cta: string;
  busy: boolean;
  onBack: () => void;
  onGo: () => void;
}) {
  return (
    <>
      <p className="safe__lead">{title}</p>
      <p className="safe__confirmBody">{body}</p>
      <div className="pf__actions">
        <Button onClick={onBack}>Quay lại</Button>
        <Button tone="danger" disabled={busy} onClick={onGo}>{cta}</Button>
      </div>
    </>
  );
}
