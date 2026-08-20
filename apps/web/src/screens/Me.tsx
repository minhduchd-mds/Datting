import { useState } from "react";
import { Button, Switch } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import { api, POLICY_VERSION, type ConsentPurpose } from "../api.js";
import { avatarUrl, LOI_SONG, SO_THICH, Y_DINH } from "../data/profiles.js";

/**
 * Hồ sơ của chính mình.
 *
 * Điểm chất lượng hồ sơ tính ở CLIENT, và điều đó là TẠM: `PRODUCTION_AUDIT`
 * §2.7 ghi rõ nó nên do server tính và có phiên bản, để mọi client cho ra cùng
 * một con số và để A/B test được. Công thức để lộ ra chứ không giấu trong một
 * hàm — người dùng cần thấy làm gì thì điểm tăng, không phải một con số bí ẩn.
 */
const ME = {
  name: "Đỗ Minh Đức",
  age: 28,
  jobTitle: "Kỹ sư phần mềm",
  community: "Cầu Giấy",
  bio: "Thích những cuộc trò chuyện đi xa hơn câu chào.",
  interests: [SO_THICH[0]!, SO_THICH[4]!, SO_THICH[5]!],
  lifestyle: [LOI_SONG[0]!, LOI_SONG[2]!],
  intent: Y_DINH[0]!,
  verified: false,
  photos: 2,
  prompts: 1,
};

export function Me() {
  const score = Math.min(
    100,
    25 + Math.min(ME.photos, 3) * 10 + Math.min(ME.interests.length, 3) * 5 +
      (ME.bio.trim() ? 10 : 0) + (ME.intent ? 10 : 0) +
      Math.min(ME.prompts, 2) * 5 + (ME.verified ? 5 : 0),
  );

  const todo = [
    { done: ME.photos >= 3, text: `Thêm ảnh (đang có ${ME.photos}/6)`, points: 10 },
    { done: ME.prompts >= 2, text: `Trả lời thêm câu hỏi mở (đang có ${ME.prompts}/3)`, points: 5 },
    { done: ME.verified, text: "Xác minh ảnh thật", points: 5 },
  ];

  return (
    <>
      <header className="disc__head">
        <div>
          <h1 className="disc__title">Hồ sơ của bạn</h1>
          <p className="disc__sub">Ảnh rõ và câu trả lời có chất riêng giúp người phù hợp hiểu bạn nhanh hơn.</p>
        </div>
      </header>

      <div className="me">
        <section className="me__card">
          <img className="pf__avatar" src={avatarUrl(`${ME.name}-me`)} alt="" />
          <div>
            <h2 className="pf__name">{ME.name}, {ME.age}</h2>
            <p className="pf__meta">{ME.jobTitle} · {ME.community}</p>
            <p className="pf__bio">{ME.bio}</p>
          </div>
        </section>

        <section className="me__score">
          <div className="me__scoreTop">
            <span className="pf__sectionTitle">Chất lượng hồ sơ</span>
            <strong className="me__scoreVal">{score}%</strong>
          </div>
          <span className="detail__bar"><span className="detail__fill" style={{ width: `${score}%` }} /></span>
          <ul className="me__todo">
            {todo.map((t) => (
              <li key={t.text} className={t.done ? "me__todoItem me__todoItem--done" : "me__todoItem"}>
                <Icon name={t.done ? "star" : "chevron-right"} size={14} />
                {/* Icon luôn `aria-hidden`, gạch ngang là CSS thuần — cả hai
                    tín hiệu "đã xong" đều vô hình với trình đọc màn hình. */}
                <span className="dw-sr-only">{t.done ? "Đã xong: " : "Chưa xong: "}</span>
                <span>{t.text}</span>
                {!t.done && <span className="me__points">+{t.points}%</span>}
              </li>
            ))}
          </ul>
        </section>

        {/*
          Đồng ý theo NĐ13 là mục RIÊNG, không gộp với tuỳ chọn hiển thị bên
          dưới. Hai thứ này khác hẳn nhau về pháp lý: tuỳ chọn là sở thích, còn
          đồng ý là căn cứ để xử lý dữ liệu nhạy cảm — nghị định đòi mỗi mục
          đích một đồng ý riêng biệt, chứng minh được, rút lại được. Một ô tích
          "Tôi đồng ý với điều khoản" là KHÔNG hợp lệ, và gộp hai nhóm này lại
          một chỗ chính là bước đầu để trượt về đúng cái ô đó.
        */}
        <section className="me__section">
          <h2 className="pf__sectionTitle">Dữ liệu nhạy cảm</h2>
          <p className="me__rowNote">
            Theo Nghị định 13/2023, hai loại dữ liệu dưới đây cần bạn đồng ý riêng.
            Rút lại lúc nào cũng được — bên mình dừng dùng ngay từ lúc đó.
          </p>

          <Consent
            purpose="location"
            label="Dùng vị trí của tôi"
            note="Để tính khoảng cách và gợi ý người ở gần. Hồ sơ chỉ hiện khu vực đã làm mờ, không bao giờ là toạ độ."
          />
          <Consent
            purpose="orientation"
            label="Dùng giới tính tôi muốn tìm"
            note="Đây là dữ liệu suy ra được xu hướng tính dục, nên nó cần một đồng ý riêng chứ không đi kèm mục trên."
          />

          <p className="me__rowNote">
            Bạn đang xem chính sách bản <code>{POLICY_VERSION}</code>.
          </p>
        </section>

        <section className="me__section">
          <h2 className="pf__sectionTitle">Hiển thị</h2>
          <Row label="Hiện khoảng cách trên hồ sơ" note="Tắt thì chỉ hiện tên khu vực, không hiện số km." />
          <Row label="Cho phép người khác giới thiệu mình" note="Bạn vẫn duyệt từng lời giới thiệu trước khi nó hiện ra." />
          <p className="me__pending">
            Hai công tắc này là tuỳ chọn hiển thị, chưa nối vào server — chúng
            không phải đồng ý NĐ13 và không thay thế được mục trên.
          </p>
        </section>

        <section className="me__section">
          <h2 className="pf__sectionTitle">Xoá tài khoản</h2>
          <DeleteAccount />
        </section>
      </div>
    </>
  );
}

function Row({ label, note }: { label: string; note: string }) {
  return (
    <div className="me__row">
      <div>
        <div className="me__rowLabel">{label}</div>
        <div className="me__rowNote">{note}</div>
      </div>
      <Switch disabled aria-label={label} />
    </div>
  );
}

/**
 * Một mục đồng ý.
 *
 * Cập nhật LẠC QUAN rồi lùi lại nếu hỏng — nhưng khác deck ở một điểm quan
 * trọng: khi hỏng thì nói thẳng là chưa lưu được. Với một quyền pháp lý, để
 * người dùng tin rằng họ đã rút đồng ý trong khi server chưa nhận là hỏng
 * nghiêm trọng hơn nhiều so với một cú vuốt trượt.
 */
function Consent({ purpose, label, note }: { purpose: ConsentPurpose; label: string; note: string }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState(false);

  return (
    <div className="me__row">
      <div>
        <div className="me__rowLabel">{label}</div>
        <div className="me__rowNote">{note}</div>
        {err && <div className="me__consentErr">Chưa lưu được lựa chọn này. Thử lại.</div>}
      </div>
      <Switch
        checked={on}
        aria-label={label}
        onCheckedChange={(next) => {
          setOn(next);
          setErr(false);
          void api.setConsent(purpose, next).catch(() => {
            setOn(!next);
            setErr(true);
          });
        }}
      />
    </div>
  );
}

/**
 * Xoá tài khoản.
 *
 * Xoá MỀM 30 ngày rồi mới purge cứng, nên câu chữ phải nói đúng điều đó: người
 * dùng có quyền biết dữ liệu của họ còn nằm ở đâu và trong bao lâu. Bắt gõ đúng
 * chữ "XOA" chứ không chỉ bấm hai lần — sau 30 ngày việc này không hoàn tác
 * được, mà một hộp thoại xác nhận thường bị bấm qua theo phản xạ.
 */
function DeleteAccount() {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  if (state === "done") {
    return (
      <p className="me__rowNote" role="status">
        Đã nhận yêu cầu xoá. Tài khoản bị ẩn ngay, và dữ liệu sẽ được xoá hẳn sau
        30 ngày. Đăng nhập lại trong 30 ngày đó là huỷ được yêu cầu.
      </p>
    );
  }

  if (!armed) {
    return (
      <>
        <p className="me__rowNote">
          Tài khoản bị ẩn ngay lập tức, dữ liệu được xoá hẳn sau 30 ngày. Trong
          30 ngày đó, đăng nhập lại là khôi phục được.
        </p>
        <div className="me__deleteRow">
          <Button tone="danger" onClick={() => setArmed(true)}>Xoá tài khoản của tôi</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="me__rowNote">
        Gõ <b>XOA</b> để xác nhận. Sau 30 ngày, việc này không hoàn tác được.
      </p>
      <label className="me__deleteConfirm">
        <span className="dw-sr-only">Gõ XOA để xác nhận</span>
        <input
          className="me__deleteInput"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="XOA"
          autoComplete="off"
        />
      </label>
      {state === "failed" && <p className="me__consentErr">Không gửi được yêu cầu. Thử lại.</p>}
      <div className="me__deleteRow">
        <Button onClick={() => { setArmed(false); setTyped(""); }}>Huỷ</Button>
        <Button
          tone="danger"
          disabled={typed.trim().toUpperCase() !== "XOA" || state === "busy"}
          onClick={() => {
            setState("busy");
            void api
              .deleteAccount()
              .then(() => setState("done"))
              .catch(() => setState("failed"));
          }}
        >
          Xoá vĩnh viễn
        </Button>
      </div>
    </>
  );
}
