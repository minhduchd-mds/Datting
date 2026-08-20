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

/**
 * Phòng live.
 *
 * ─── Bố cục lấy từ quy ước của TikTok Live / Bigo / TRTC Live UIKit ──────
 * Bản trước là một ứng dụng chat có sidebar: khung tin nhắn viền trắng chiếm
 * giữa màn, danh sách người bên phải, quà nằm thành một hàng chip tĩnh. Đó là
 * bố cục của hộp thư, không phải của phòng live.
 *
 * Phòng live dựng theo LỚP, không theo cột. Mọi thứ nổi trên một SÂN KHẤU:
 *
 *   ┌──────────────────────────────────────┐
 *   │ ‹   Tên phòng · chủ phòng · 12/50 [x]│  thanh trên
 *   │ 🥇 A   🥈 B   🥉 C                    │  bảng vàng
 *   │                                      │
 *   │            SÂN KHẤU                  │
 *   │                          🎁 quà bay  │  hiệu ứng tạm, phải
 *   │  ┌────────────────┐                  │
 *   │  │ A: xin chào    │                  │  chat PHỦ, trái-dưới
 *   │  │ B: hi cả nhà   │                  │
 *   │  └────────────────┘                  │
 *   │  [ Nói gì đó… ]   [Gửi]   [🎁]       │  thanh dưới
 *   └──────────────────────────────────────┘
 *
 * Ba quy ước, và lý do từng cái:
 *
 *   1. Chat PHỦ lên sân khấu, không chiếm chỗ riêng. Sân khấu là thứ người ta
 *      tới xem; cắt nó làm đôi để nhường chỗ cho chữ là làm hỏng đúng thứ
 *      đang giữ chân họ. Nền mờ, chiều cao có trần, tin cũ mờ dần.
 *
 *   2. Quà là HIỆU ỨNG TẠM, không phải danh sách. Giá trị của việc tặng quà
 *      nằm ở khoảnh khắc mọi người cùng nhìn thấy. Một danh sách tĩnh biến nó
 *      thành dòng nhật ký.
 *
 *   3. Bảng vàng luôn hiện. Đây là thứ khiến kinh tế quà tặng chạy được:
 *      không ai tặng để rơi vào im lặng.
 *
 * ─── Vì sao KHÔNG kéo một thư viện live vào ──────────────────────────────
 * TRTC Live UIKit, Agora và LiveKit đều có sẵn UIKit phòng live. Cả ba dựng
 * quanh VIDEO THỜI GIAN THỰC — WebRTC, SFU, quản lý track, và một máy chủ phát
 * trả phí. Datting chưa có video: phòng ở đây là chat cộng quà. Kéo một SDK
 * video vào chỉ để dùng phần vẽ giao diện là gánh cả một hạ tầng chưa dùng
 * tới, và khoá kiến trúc vào nhà cung cấp đó.
 *
 * Điều kiện thay: khi phòng có video thật. Lúc đó LiveKit là chỗ nên nhìn
 * trước — mã nguồn mở, tự host được, không buộc dùng đám mây của họ.
 */

/** Bao lâu thì một hiệu ứng quà biến mất. Đủ để nhìn, không đủ để che màn. */
const GIFT_FLY_MS = 4200;

function RoomLive({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  // Danh tính của chính mình. Cần để không mời người dùng tự tặng mình —
  // `RoomMember` không có cờ "là tôi", và server thì không nên phải nói cho
  // client biết ai là ai lần nữa: client đã biết mình là ai.
  const toiLa = useSession().userId;
  const [v, setV] = useState<RoomView | null>(null);
  const [soan, setSoan] = useState("");
  const [loi, setLoi] = useState("");
  const [quaMo, setQuaMo] = useState<RoomMember | null>(null);
  const [moNguoi, setMoNguoi] = useState(false);
  /** Quà đang bay. Tách khỏi `v.gifts` vì đây là trạng thái CỦA MÀN HÌNH. */
  const [bay, setBay] = useState<{ key: string; glyph: string; text: string }[]>([]);
  const daThay = useRef<Set<string>>(new Set());
  const lanDau = useRef(true);
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

  /*
   * Quà MỚI thì cho bay; quà cũ thì không.
   *
   * Lần tải ĐẦU TIÊN cố ý không cho bay gì cả: vừa mở phòng mà hai chục món
   * quà cũ đồng loạt bay ra là một màn pháo hoa nói dối — không có gì vừa xảy
   * ra cả. Lượt đó chỉ để nạp `daThay`.
   */
  useEffect(() => {
    if (!v) return;
    const moiQua = v.gifts.filter((g) => !daThay.current.has(g.id));
    for (const g of v.gifts) daThay.current.add(g.id);
    if (lanDau.current) {
      lanDau.current = false;
      return;
    }
    if (moiQua.length === 0) return;

    const them = moiQua.map((g) => ({
      key: g.id,
      glyph: g.glyph,
      text: `${g.fromName} tặng ${g.toName}${g.qty > 1 ? ` ×${g.qty}` : ""}`,
    }));
    setBay((cu) => [...them, ...cu].slice(0, 4));
    const t = window.setTimeout(() => {
      setBay((cu) => cu.filter((x) => !them.some((y) => y.key === x.key)));
    }, GIFT_FLY_MS);
    return () => window.clearTimeout(t);
  }, [v]);

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

  const chuPhong = v.members.find((m) => m.role === 2);
  /*
   * Bảng vàng: cộng dồn số món quà mỗi người NHẬN được, từ 20 sự kiện gần nhất.
   *
   * Xếp theo SỐ MÓN, không theo giá trị xu: `RoomGiftEvent` không mang giá, và
   * suy giá từ tên món ở client là dựng một bảng giá thứ hai sẽ lệch với
   * `gift_catalog`. Khi cần xếp theo giá trị thì server trả thêm — nó là chỗ
   * duy nhất biết giá đã chốt tại thời điểm tặng.
   */
  const bangVang = (() => {
    const d = new Map<string, number>();
    for (const g of v.gifts) d.set(g.toName, (d.get(g.toName) ?? 0) + g.qty);
    return [...d.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();

  return (
    <section className="stage">
      {/* ── Sân khấu: nền + mọi lớp phủ ────────────────────────────────── */}
      <div className="stage__floor">
        {/* Chưa có video. Nói thẳng, thay vì để một ô đen trông như đang tải
            hỏng — ô đen im lặng là thứ khiến người dùng bấm tải lại mãi. */}
        <div className="stage__idle">
          <span className="stage__idleGlyph" aria-hidden="true">
            <Icon name="live" size={30} />
          </span>
          <p className="stage__idleText">Phòng thoại. Chưa mở video.</p>
        </div>

        <header className="stage__top">
          <button type="button" className="stage__back" onClick={onBack} aria-label="Tất cả phòng">
            <Icon name="chevron-right" size={18} />
          </button>
          <div className="stage__host">
            <span className="stage__hostName">{v.room.title}</span>
            <span className="stage__hostSub">
              {chuPhong ? chuPhong.name : "—"} · {v.room.memberCount}/{v.room.maxMembers}
            </span>
          </div>
          <button
            type="button"
            className="stage__people"
            onClick={() => setMoNguoi(true)}
            aria-label={`Xem ${v.members.length} người trong phòng`}
          >
            <Icon name="users" size={15} />
            <span>{v.members.length}</span>
          </button>
        </header>

        {bangVang.length > 0 && (
          <ol className="stage__board" aria-label="Nhận nhiều quà nhất">
            {bangVang.map(([ten, n], i) => (
              <li key={ten} className="stage__boardItem">
                <span className="stage__rank" aria-hidden="true">
                  {["🥇", "🥈", "🥉"][i]}
                </span>
                <span className="stage__boardName">{ten}</span>
                <span className="stage__boardN">{n}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Quà đang bay. `aria-live="polite"` để người dùng trình đọc màn hình
            cũng biết có quà — nhưng KHÔNG "assertive": quà không đáng cắt
            ngang câu đang đọc dở. */}
        <div className="stage__fly" aria-live="polite">
          {bay.map((b) => (
            <div key={b.key} className="stage__flyItem">
              <span className="stage__flyGlyph" aria-hidden="true">
                {b.glyph}
              </span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>

        {/* Chat PHỦ lên sân khấu, neo trái-dưới. */}
        <div className="stage__chat" ref={cuon}>
          {v.messages.length === 0 ? (
            <p className="stage__hint">Chưa có ai nói gì.</p>
          ) : (
            v.messages.map((m) => (
              <p key={m.messageId} className="stage__msg">
                <span className="stage__msgFrom">{m.name}</span>
                <span>{m.body}</span>
              </p>
            ))
          )}
        </div>
      </div>

      {/* ── Thanh dưới ─────────────────────────────────────────────────── */}
      {loi !== "" && (
        <p className="gate__err" role="alert">
          {loi}
        </p>
      )}

      {v.joined ? (
        <form className="stage__bar" onSubmit={gui}>
          <input
            className="stage__in"
            value={soan}
            maxLength={500}
            onChange={(e) => setSoan(e.target.value)}
            placeholder="Nói gì đó…"
            aria-label="Nội dung tin nhắn"
          />
          <Button type="submit" disabled={soan.trim() === ""}>
            Gửi
          </Button>
          {/* Nút quà tách riêng và NỔI hơn nút gửi: đây là hành động đem lại
              doanh thu, và ở mọi phòng live nó là nút to nhất thanh dưới. */}
          <button
            type="button"
            className="stage__giftBtn"
            onClick={() => setMoNguoi(true)}
            aria-label="Tặng quà"
          >
            🎁
          </button>
        </form>
      ) : (
        <div className="stage__bar stage__bar--join">
          <p className="stage__joinHint">Vào phòng để nhắn và tặng quà.</p>
          <Button tone="accent" onClick={() => void api.joinRoom(roomId).then(tai)}>
            Vào phòng
          </Button>
        </div>
      )}

      {/* ── Danh sách người: tấm trượt, không phải cột cố định ──────────── */}
      {moNguoi && (
        <div className="peoplebox" role="dialog" aria-label="Người trong phòng">
          <div className="giftbox__head">
            <h2 className="pf__sectionTitle">Đang ở đây · {v.members.length}</h2>
            <button
              type="button"
              className="pf__close giftbox__x"
              onClick={() => setMoNguoi(false)}
              aria-label="Đóng"
            >
              <Icon name="x-close" size={16} />
            </button>
          </div>
          <ul className="peoplebox__list">
            {v.members.map((m) => (
              <li key={m.userId} className="peoplebox__row">
                <span className="live__mName">
                  {m.name}
                  {m.role === 2 && <span className="live__role">chủ phòng</span>}
                </span>
                {/*
                  Nút tặng hiện cho MỌI người khác mình, kể cả chủ phòng.

                  Bản đầu lọc bằng role khác 2, và sai theo hai hướng cùng lúc:
                  hiện nút cạnh CHÍNH MÌNH (server luôn từ chối — mời người
                  dùng bấm một nút chắc chắn hỏng), đồng thời GIẤU nút ở chủ
                  phòng, mà chủ phòng lại là người hay được tặng nhất. `role`
                  là quyền điều hành, không phải danh tính.
                */}
                {v.joined && m.userId !== toiLa && (
                  <button
                    type="button"
                    className="live__giftBtn"
                    onClick={() => {
                      setMoNguoi(false);
                      setQuaMo(m);
                    }}
                  >
                    Tặng quà
                  </button>
                )}
              </li>
            ))}
          </ul>
          {v.joined && (
            <button
              type="button"
              className="gate__link peoplebox__leave"
              onClick={() => void api.leaveRoom(roomId).then(onBack)}
            >
              Rời phòng
            </button>
          )}
        </div>
      )}

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
  const [chon, setChon] = useState<Gift | null>(null);
  const [sl, setSl] = useState(1);
  const [loi, setLoi] = useState("");
  const [thieu, setThieu] = useState(false);
  const [dangGui, setDangGui] = useState(false);

  useEffect(() => {
    void api
      .listGifts()
      .then((g) => {
        setQua(g);
        setChon(g[0] ?? null);
      })
      .catch(() => setQua([]));
    void api
      .fetchWallet()
      .then((w) => setSoDu(w.balance))
      .catch(() => setSoDu(null));
  }, []);

  async function tang() {
    if (chon === null) return;
    setDangGui(true);
    setLoi("");
    setThieu(false);
    const r = await api.sendGift(roomId, nguoiNhan.userId, chon.giftId, sl);
    setDangGui(false);
    if (!r.ok) {
      setLoi(r.reason);
      setThieu(r.thieuXu);
      return;
    }
    setSoDu(r.balance);
    onSent();
  }

  const tong = chon === null ? 0 : chon.price * sl;

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
            className={
              chon?.giftId === g.giftId ? "giftbox__item giftbox__item--on" : "giftbox__item"
            }
            aria-pressed={chon?.giftId === g.giftId}
            onClick={() => setChon(g)}
          >
            <span className="giftbox__glyph" aria-hidden="true">
              {g.glyph}
            </span>
            <span className="giftbox__name">{g.name}</span>
            <span className="giftbox__price">{g.price.toLocaleString("vi-VN")} xu</span>
          </button>
        ))}
      </div>

      {/*
        Chọn số lượng rồi mới gửi — KHÔNG gửi ngay khi bấm vào món quà.
        Bản trước bắn đi luôn: bấm nhầm một món 1.000 xu là mất 1.000 xu, không
        có bước nào để dừng lại. Với thứ tiêu tiền thật thì một bước xác nhận
        không phải ma sát thừa, nó là cái phanh.
      */}
      <div className="giftbox__send">
        <div className="giftbox__qty" role="group" aria-label="Số lượng">
          {[1, 5, 10, 30].map((n) => (
            <button
              key={n}
              type="button"
              className={sl === n ? "giftbox__q giftbox__q--on" : "giftbox__q"}
              aria-pressed={sl === n}
              onClick={() => setSl(n)}
            >
              ×{n}
            </button>
          ))}
        </div>
        <Button tone="accent" disabled={dangGui || chon === null} onClick={() => void tang()}>
          {dangGui ? "Đang gửi…" : `Tặng · ${tong.toLocaleString("vi-VN")} xu`}
        </Button>
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
