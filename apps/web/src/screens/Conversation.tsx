import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import { api, ME_ID, pairKeyOf, type Message } from "../api.js";
import type { Profile } from "../data/profiles.js";

/**
 * Cuộc trò chuyện.
 *
 * ─── Hợp đồng KHÔNG do màn này định nghĩa ─────────────────────────────────
 * Kiểu `Message`, hai endpoint `GET|POST /v1/matches/:pairKey/messages`, và
 * `NudgeMessage` trong `services/ws-gateway` đều đã tồn tại từ trước, do bản
 * mobile dùng. Màn này thi hành đúng hợp đồng đó chứ không tạo hợp đồng thứ
 * hai — hai bản định nghĩa là hai bản sẽ lệch nhau.
 *
 * ─── Vì sao là lớp phủ chứ chưa phải một route ────────────────────────────
 * `routes.ts` ghi rõ điều kiện thay hash router: "khi có tham số". Điều kiện đó
 * nay đã chạm — một cuộc trò chuyện xứng đáng có URL riêng để mở lại, đánh dấu,
 * tải lại. Nhưng đổi router động tới mọi màn, nên nó là việc riêng. Ở đây dùng
 * `Sheet` để thừa hưởng bẫy tiêu điểm và khoá cuộn đã có.
 *
 * ─── Gửi lạc quan, cùng lối với deck ──────────────────────────────────────
 * Tin hiện ngay ở trạng thái `sending`, request chạy nền. Chờ mạng cho mỗi tin
 * là phá nhịp gõ. Gửi hỏng thì tin Ở LẠI với trạng thái `failed` — không biến
 * mất, vì chữ người ta vừa gõ không phải của mình mà xoá.
 */
export interface ConversationProps {
  peer: Profile;
  onClose: () => void;
  /** Mở lớp an toàn cho chính người này. */
  onSafety?: (() => void) | undefined;
}

export function Conversation({ peer, onClose, onSafety }: ConversationProps) {
  const pairKey = pairKeyOf(ME_ID, peer.userId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let ignore = false;
    void api
      .fetchMessages(pairKey)
      .then((m) => {
        if (!ignore) setMessages(m);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [pairKey]);

  // Luôn nhìn thấy tin mới nhất. Lần nạp đầu nhảy thẳng xuống (`auto`) — không
  // ai muốn ngồi xem cuộn qua ba tháng lịch sử; chỉ mượt khi có tin mới trong
  // lúc đang mở.
  const first = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [messages]);

  const send = useCallback(
    (body: string) => {
      const text = body.trim();
      if (!text) return;

      // Id tạm mang tiền tố để không bao giờ đụng id thật của máy chủ.
      const tempId = `tmp-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: tempId, body: text, fromMe: true, at: Date.now(), status: "sending" },
      ]);
      setDraft("");

      void api
        .sendMessage(pairKey, text)
        .then((saved) => {
          setMessages((m) => m.map((x) => (x.id === tempId ? saved : x)));
        })
        .catch(() => {
          setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, status: "failed" } : x)));
        });
    },
    [pairKey],
  );

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      label={`Trò chuyện với ${peer.name}`}
      // `dw-sheet--flush` tắt padding và cuộn của tấm phủ để hội thoại tự chia
      // ba tầng: đầu cố định · danh sách cuộn · ô soạn ghim đáy.
      className="dw-sheet--flush conv"
    >
      <header className="conv__head">
        <img className="conv__avatar" src={peer.photoUrl} alt="" />
        <div className="conv__who">
          <div className="conv__name">{peer.name}</div>
          <div className="conv__status">
            {peer.daysSinceActive === 0
              ? "Đang hoạt động hôm nay"
              : `Hoạt động ${peer.daysSinceActive} ngày trước`}
          </div>
        </div>
        {onSafety && (
          <button type="button" className="conv__close" onClick={onSafety} aria-label="Báo cáo hoặc chặn">
            <Icon name="filter" size={18} />
          </button>
        )}
        <button type="button" className="conv__close" onClick={onClose} aria-label="Đóng">
          <Icon name="x-close" size={20} />
        </button>
      </header>

      {/*
        `aria-live="polite"` chứ không phải `assertive`: tin nhắn tới là thông
        tin, không phải cảnh báo — ngắt lời người đang gõ để đọc nó là sai.
      */}
      <div className="conv__list" ref={listRef} aria-live="polite" aria-label="Tin nhắn">
        {loading ? (
          <p className="conv__hint">Đang tải…</p>
        ) : messages.length === 0 ? (
          <Openers peer={peer} onPick={send} />
        ) : (
          messages.map((m, i) => (
            <Bubble key={m.id} m={m} first={i === 0 || messages[i - 1]!.fromMe !== m.fromMe} />
          ))
        )}
      </div>

      <Composer value={draft} onChange={setDraft} onSend={send} peerName={peer.name} />
    </Sheet>
  );
}

/**
 * Trạng thái rỗng LÀM VIỆC thay vì xin lỗi.
 *
 * Phụ đề màn Kết nối viết "mở lời bằng một điểm chung thay vì một chữ chào" —
 * nên chỗ này phải đưa ra đúng điểm chung đó, không phải một ô trống với dòng
 * "Chưa có tin nhắn nào". Câu mở dựng từ sở thích và câu trả lời CÓ THẬT của
 * người kia, nên không có hai cuộc trò chuyện nào mở giống nhau.
 */
function Openers({ peer, onPick }: { peer: Profile; onPick: (s: string) => void }) {
  const lines: string[] = [];
  const [i0, i1] = peer.interests;
  if (i0) lines.push(`Thấy bạn thích ${i0.toLowerCase()} — bạn hay đi đâu?`);
  if (peer.prompts[0]) lines.push(`"${peer.prompts[0].answer}" — mình cũng nghĩ vậy. Kể thêm đi?`);
  if (i1) lines.push(`${i1} nữa à? Mình đang tìm người rủ đi cùng.`);

  const ten = peer.name.split(" ").slice(-1)[0];

  return (
    <div className="conv__empty">
      <p className="conv__emptyTitle">Cả hai đã chọn nhau. Giờ tới lượt câu đầu tiên.</p>
      <p className="conv__emptyWhy">
        Một chữ “chào” hiếm khi được trả lời. Ba gợi ý dưới đây dựng từ chính hồ
        sơ của {ten} — bấm để dùng, hoặc tự viết.
      </p>
      <div className="conv__openers">
        {lines.map((l) => (
          <button key={l} type="button" className="conv__opener" onClick={() => onPick(l)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ m, first }: { m: Message; first: boolean }) {
  const cls = [
    "bub",
    m.fromMe ? "bub--me" : "bub--them",
    first ? "bub--first" : "",
    m.status === "failed" ? "bub--failed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <p className="bub__body">{m.body}</p>
      {/* Trạng thái chỉ hiện khi nó CÓ NGHĨA. "Đã gửi" trên mọi bong bóng là
          nhiễu; "chưa gửi được" thì phải thấy ngay. */}
      {m.fromMe && m.status !== "sent" && m.status !== "read" && (
        <span className="bub__state">
          {m.status === "sending" ? "Đang gửi…" : "Chưa gửi được"}
        </span>
      )}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  peerName,
}: {
  value: string;
  onChange: (s: string) => void;
  onSend: (s: string) => void;
  peerName: string;
}) {
  const ta = useRef<HTMLTextAreaElement | null>(null);

  // Ô soạn cao theo nội dung, có trần. Phải đặt `height = auto` TRƯỚC khi đo
  // `scrollHeight`, nếu không ô chỉ phình ra mà không bao giờ co lại.
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  return (
    <form
      className="conv__composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSend(value);
      }}
    >
      <textarea
        ref={ta}
        className="conv__input"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Nhắn cho ${peerName.split(" ").slice(-1)[0]}…`}
        aria-label="Nội dung tin nhắn"
        onKeyDown={(e) => {
          // Enter gửi, Shift+Enter xuống dòng — quy ước của mọi ứng dụng nhắn
          // tin. `useHotkeys` không đụng tới đây vì nó đã bỏ qua TEXTAREA.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend(value);
          }
        }}
      />
      <button type="submit" className="conv__send" disabled={!value.trim()} aria-label="Gửi">
        <Icon name="send" size={18} />
      </button>
    </form>
  );
}
