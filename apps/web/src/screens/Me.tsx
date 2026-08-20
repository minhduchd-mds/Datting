import { Switch } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
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

        <section className="me__section">
          <h2 className="pf__sectionTitle">Quyền riêng tư</h2>
          <Row label="Hiện khoảng cách trên hồ sơ" note="Chỉ hiện khu vực đã làm mờ, không bao giờ là toạ độ." />
          <Row label="Cho phép người khác giới thiệu mình" note="Bạn vẫn duyệt từng lời giới thiệu trước khi nó hiện ra." />
          {/* Hai công tắc trên CỐ Ý bị khoá. Ghi đồng ý theo NĐ13 phải lưu được
              mốc thời gian và phiên bản chính sách ở SERVER; làm ở client thôi
              là một lời hứa rỗng. Thà để rõ trạng thái còn hơn giả vờ chạy. */}
          <p className="me__pending">
            Hai công tắc trên chưa nối vào server. Ghi đồng ý theo NĐ13 cần mốc thời gian và
            phiên bản chính sách lưu phía server — cần <code>POST /v1/me/consents</code>.
          </p>
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
