import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";
import { Button, Field } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import { api, type Gift, type RoomMember, type RoomSummary, type RoomView } from "../api.js";
import { useSession } from "../session.js";

/**
 * Phòng nhiều người: danh sách + tìm kiếm, và phòng đang mở.
 *
 * ─── Vì sao HỎI LẠI theo chu kỳ chứ không WebSocket ──────────────────────
 * `ws-gateway` đã có, và bất biến #2 của CLAUDE.md nói rõ hub KHÔNG BAO GIỜ
 * được block — nhưng nudge ở đó cố ý chỉ chở "có cái mới" + cursor, KHÔNG chở
 * nội dung. Nối phòng vào hub cho đúng kiến trúc đó là một mẩu việc riêng.
 *
 * Cho tới lúc đó, hỏi lại mỗi 3 giây. Nói thẳng đây là bước tạm: nó tiêu một
 * request mỗi 3 giây cho MỖI người đang xem, nên nó không sống nổi ở quy mô
 * thật. Điều kiện thay: khi có nhiều hơn vài chục người xem cùng lúc.
 */
const POLL_MS = 3000;

export function Rooms() {
  const [danhSach, setDanhSach] = useState<RoomSummary[]>([]);
  const [q, setQ] = useState("");
  const [dangMo, setDangMo] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [taoMoi, setTaoMoi] = useState(false);

  const tai = useCallback(async (tuKhoa: string) => {
    setDangTai(true);
    try {
      setDanhSach(await api.listRooms(tuKhoa));
    } catch {
      setDanhSach([]);
    } finally {
      setDangTai(false);
    }
  }, []);

  /*
   * Hoãn gõ 300ms.
   *
   * Không hoãn thì mỗi phím là một truy vấn trigram — "cà phê" gõ xong là sáu
   * lượt tìm, và năm lượt đầu chắc chắn bị lượt cuối ghi đè. Tốn của server, và
   * làm danh sách nhấp nháy ngay trong lúc đang gõ.
   */
  useEffect(() => {
    if (dangMo !== null) return;
    const t = window.setTimeout(() => void tai(q), 300);
    return () => window.clearTimeout(t);
  }, [q, tai, dangMo]);

  if (dangMo !== null) {
    return (
      <RoomLive
        roomId={dangMo}
        onBack={() => {
          setDangMo(null);
          void tai(q);
        }}
      />
    );
  }

  return (
    <section className="rooms">
      <header className="rooms__head">
        <div>
          <h1 className="disc__title">Phòng</h1>
          <p className="disc__sub">
            Nói chuyện nhóm. Vào phòng nào cũng được, không cần kết nối trước.
          </p>
        </div>
        <Button tone="accent" onClick={() => setTaoMoi((v) => !v)}>
          {taoMoi ? "Đóng" : "Tạo phòng"}
        </Button>
      </header>

      {taoMoi && (
        <RoomCreate
          onDone={() => {
            setTaoMoi(false);
            setQ("");
            void tai("");
          }}
        />
      )}

      <div className="rooms__search">
        <Icon name="filter" size={16} />
        <input
          className="rooms__searchIn"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm phòng theo tên…"
          aria-label="Tìm phòng"
        />
      </div>

      {dangTai && danhSach.length === 0 ? (
        <p className="me__rowNote">Đang tải…</p>
      ) : danhSach.length === 0 ? (
        <div className="empty">
          <h2 className="empty__title">
            {q === "" ? "Chưa có phòng nào" : "Không tìm thấy phòng"}
          </h2>
          <p className="empty__why">
            {q === ""
              ? "Tạo phòng đầu tiên và mời mọi người vào."
              : "Thử một từ khoá ngắn hơn, hoặc bỏ dấu."}
          </p>
        </div>
      ) : (
        <ul className="rooms__list">
          {danhSach.map((r) => (
            <li key={r.roomId}>
              <button type="button" className="rooms__item" onClick={() => setDangMo(r.roomId)}>
                <span className="rooms__live" aria-hidden="true" />
                <span className="rooms__body">
                  <span className="rooms__title">{r.title}</span>
                  {r.topic !== null && <span className="rooms__topic">{r.topic}</span>}
                </span>
                <span className="rooms__count">
                  {/* Hiện cả trần, không chỉ số hiện tại: "48/50" nói được là
                      phòng sắp đầy, còn "48" thì không. */}
                  {r.memberCount}/{r.maxMembers}
                </span>
                <Icon name="chevron-right" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoomCreate({ onDone }: { onDone: () => void }) {
  const [ten, setTen] = useState("");
  const [chuDe, setChuDe] = useState("");
  const [tran, setTran] = useState(50);
  const [loi, setLoi] = useState("");
  const [dangChay, setDangChay] = useState(false);

  async function tao(e: React.FormEvent) {
    e.preventDefault();
    setDangChay(true);
    setLoi("");
    try {
      await api.createRoom(ten.trim(), chuDe.trim(), tran);
      onDone();
    } catch {
      setLoi("Không tạo được phòng. Thử lại.");
    } finally {
      setDangChay(false);
    }
  }

  return (
    <form className="rooms__create" onSubmit={tao}>
      <Field label="Tên phòng">
        <input
          className="gate__in"
          value={ten}
          maxLength={80}
          onChange={(e) => setTen(e.target.value)}
          placeholder="Ví dụ: Cà phê tối thứ bảy"
        />
      </Field>
      <Field label="Chủ đề" description="Không bắt buộc.">
        <input
          className="gate__in"
          value={chuDe}
          maxLength={200}
          onChange={(e) => setChuDe(e.target.value)}
          placeholder="Nói chuyện nhẹ nhàng"
        />
      </Field>
      {/* Trần người là lựa chọn có hệ quả THẬT, không phải con số trang trí:
          phòng càng đông thì một tin xấu càng chạm tới nhiều người, mà đội kiểm
          duyệt là một người. Nói ra, thay vì giấu trong "cài đặt nâng cao". */}
      <Field label="Số người tối đa" description="Phòng nhỏ dễ giữ trật tự hơn.">
        <div className="gate__chips">
          {[10, 50, 200].map((n) => (
            <button
              key={n}
              type="button"
              className={tran === n ? "gate__chip gate__chip--on" : "gate__chip"}
              aria-pressed={tran === n}
              onClick={() => setTran(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>
      {loi !== "" && (
        <p className="gate__err" role="alert">
          {loi}
        </p>
      )}
      <Button tone="accent" type="submit" disabled={dangChay || ten.trim() === ""}>
        {dangChay ? "Đang tạo…" : "Tạo phòng"}
      </Button>
    </form>
  );
}

/* ─── Phòng đang mở ────────────────────────────────────────────────────── */

function RoomLive({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  // Danh tính của chính mình. Cần để không mời người dùng tự tặng mình —
  // `RoomMember` không có cờ "là tôi", và server thì không nên phải nói cho
  // client biết ai là ai lần nữa: client đã biết mình là ai.
  const toiLa = useSession().userId;
  const [v, setV] = useState<RoomView | null>(null);
  const [soan, setSoan] = useState("");
  const [loi, setLoi] = useState("");
  const [quaMo, setQuaMo] = useState<RoomMember | null>(null);
  const cuon = useRef<HTMLDivElement>(null);

  const tai = useCallback(async () => {
    try {
      setV(await api.viewRoom(roomId));
    } catch {
      /* Giữ nguyên nội dung đang hiện. Một lần hỏi hỏng không được làm trắng
         phòng — người dùng đang đọc dở. */
    }
  }, [roomId]);

  useEffect(() => {
    void tai();
    const t = window.setInterval(() => void tai(), POLL_MS);
    return () => window.clearInterval(t);
  }, [tai]);

  // Cuộn xuống đáy khi có tin mới — nhưng CHỈ khi người dùng đang ở gần đáy.
  // Kéo lên đọc lại mà bị giật xuống mỗi 3 giây thì không đọc được gì.
  useEffect(() => {
    const el = cuon.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [v?.messages.length]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const text = soan.trim();
    if (text === "") return;
    setSoan("");
    setLoi("");
    const r = await api.postRoomMessage(roomId, text);
    if (!r.ok) {
      setLoi(r.reason ?? "Không gửi được.");
      // Trả chữ về ô soạn. Mất nội dung vừa gõ vì bị chặn tốc độ là phạt người
      // dùng hai lần cho một lỗi.
      setSoan(text);
      return;
    }
    void tai();
  }

  if (v === null) return <p className="me__rowNote">Đang mở phòng…</p>;

  return (
    <section className="live">
      <header className="live__head">
        <button type="button" className="live__back" onClick={onBack}>
          <Icon name="chevron-right" size={16} />
          <span>Tất cả phòng</span>
        </button>
        <div className="live__id">
          <h1 className="live__title">{v.room.title}</h1>
          {v.room.topic !== null && <p className="live__topic">{v.room.topic}</p>}
        </div>
        {v.joined ? (
          <Button onClick={() => void api.leaveRoom(roomId).then(onBack)}>Rời phòng</Button>
        ) : (
          <Button tone="accent" onClick={() => void api.joinRoom(roomId).then(tai)}>
            Vào phòng
          </Button>
        )}
      </header>

      <div className="live__grid">
        <div className="live__main">
          <div className="live__msgs" ref={cuon}>
            {v.messages.length === 0 ? (
              <p className="me__rowNote">Chưa có tin nhắn. Nói câu đầu tiên đi.</p>
            ) : (
              v.messages.map((m) => (
                <p key={m.messageId} className="live__msg">
                  <span className="live__from">{m.name}</span>
                  <span>{m.body}</span>
                </p>
              ))
            )}
          </div>

          {v.gifts.length > 0 && (
            <div className="live__gifts" aria-label="Quà vừa tặng">
              {v.gifts.slice(0, 6).map((g) => (
                <span key={g.id} className="live__gift">
                  <span aria-hidden="true">{g.glyph}</span>
                  {g.fromName} → {g.toName}
                  {g.qty > 1 && ` ×${g.qty}`}
                </span>
              ))}
            </div>
          )}

          {loi !== "" && (
            <p className="gate__err" role="alert">
              {loi}
            </p>
          )}

          <form className="live__compose" onSubmit={gui}>
            <input
              className="live__in"
              value={soan}
              maxLength={500}
              onChange={(e) => setSoan(e.target.value)}
              placeholder={v.joined ? "Nhắn gì đó…" : "Vào phòng để nhắn"}
              disabled={!v.joined}
              aria-label="Nội dung tin nhắn"
            />
            <Button tone="accent" type="submit" disabled={!v.joined || soan.trim() === ""}>
              Gửi
            </Button>
          </form>
        </div>

        <aside className="live__side">
          <h2 className="pf__sectionTitle">Đang ở đây · {v.members.length}</h2>
          <ul className="live__members">
            {v.members.map((m) => (
              <li key={m.userId} className="live__member">
                <span className="live__mName">
                  {m.name}
                  {m.role === 2 && <span className="live__role">chủ phòng</span>}
                </span>
                {/*
                  Nút tặng hiện cho MỌI người khác mình, kể cả chủ phòng.
                  
                  Bản đầu lọc bằng `m.role !== 2`, và sai theo hai hướng cùng
                  lúc: nó hiện nút cạnh CHÍNH MÌNH (server luôn từ chối — mời
                  người dùng bấm một nút chắc chắn hỏng), đồng thời GIẤU nút ở
                  chủ phòng — mà chủ phòng lại chính là người hay được tặng
                  nhất. `role` là quyền điều hành, không phải danh tính; lọc
                  theo nó là dùng nhầm trường.
                */}
                {v.joined && m.userId !== toiLa && (
                  <button type="button" className="live__giftBtn" onClick={() => setQuaMo(m)}>
                    Tặng quà
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {quaMo !== null && (
        <GiftPicker
          roomId={roomId}
          nguoiNhan={quaMo}
          onClose={() => setQuaMo(null)}
          onSent={() => {
            setQuaMo(null);
            void tai();
          }}
        />
      )}
    </section>
  );
}

/* ─── Chọn quà ─────────────────────────────────────────────────────────── */

function GiftPicker({
  roomId,
  nguoiNhan,
  onClose,
  onSent,
}: {
  roomId: string;
  nguoiNhan: RoomMember;
  onClose: () => void;
  onSent: () => void;
}) {
  const [qua, setQua] = useState<Gift[]>([]);
  const [soDu, setSoDu] = useState<number | null>(null);
  const [loi, setLoi] = useState("");
  const [thieu, setThieu] = useState(false);
  const [dangGui, setDangGui] = useState(false);

  useEffect(() => {
    void api
      .listGifts()
      .then(setQua)
      .catch(() => setQua([]));
    void api
      .fetchWallet()
      .then((w) => setSoDu(w.balance))
      .catch(() => setSoDu(null));
  }, []);

  async function tang(g: Gift) {
    setDangGui(true);
    setLoi("");
    setThieu(false);
    const r = await api.sendGift(roomId, nguoiNhan.userId, g.giftId, 1);
    setDangGui(false);
    if (!r.ok) {
      setLoi(r.reason);
      setThieu(r.thieuXu);
      return;
    }
    setSoDu(r.balance);
    onSent();
  }

  return (
    <div className="giftbox" role="dialog" aria-label={`Tặng quà cho ${nguoiNhan.name}`}>
      <div className="giftbox__head">
        <h2 className="pf__sectionTitle">Tặng {nguoiNhan.name}</h2>
        <span className="giftbox__bal">
          <Icon name="coin" size={14} />
          {soDu === null ? "—" : soDu.toLocaleString("vi-VN")}
        </span>
        <button type="button" className="pf__close giftbox__x" onClick={onClose} aria-label="Đóng">
          <Icon name="x-close" size={16} />
        </button>
      </div>

      <div className="giftbox__grid">
        {qua.map((g) => (
          <button
            key={g.giftId}
            type="button"
            className="giftbox__item"
            disabled={dangGui}
            onClick={() => void tang(g)}
          >
            <span className="giftbox__glyph" aria-hidden="true">
              {g.glyph}
            </span>
            <span className="giftbox__name">{g.name}</span>
            <span className="giftbox__price">{g.price.toLocaleString("vi-VN")} xu</span>
          </button>
        ))}
      </div>

      {loi !== "" && (
        <p className="gate__err" role="alert">
          {loi}
          {/* Không đủ xu là tình huống có ĐƯỜNG RA. Chỉ ra đường đó ngay tại
              chỗ, thay vì để người dùng tự đi tìm nơi nạp. */}
          {thieu && (
            <>
              {" "}
              <a className="gate__link" href="#/nang-cap">
                Nạp thêm xu
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
