import { Icon, type IconName } from "../icons.js";
import { PROFILES } from "../data/profiles.js";

/**
 * Thông báo.
 *
 * Mốc thời gian hiển thị dạng TƯƠNG ĐỐI ("3 giờ trước") vì đó là thứ người ta
 * thật sự muốn biết. Nhưng giá trị LƯU là số nguyên giờ, không phải chuỗi đã
 * định dạng — chuỗi thì không sắp xếp được và không đổi ngôn ngữ được.
 */
interface Note {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  hoursAgo: number;
  unread: boolean;
}

const NOTES: Note[] = [
  { id: "n1", icon: "star", title: `Bạn và ${PROFILES[2]!.name} đã kết nối`, body: "Gửi lời chào dựa trên điểm chung thay vì chỉ nói 'hi'.", hoursAgo: 1, unread: true },
  { id: "n2", icon: "heart", title: `${PROFILES[5]!.name} đã thích hồ sơ của bạn`, body: "Thích lại để mở cuộc trò chuyện.", hoursAgo: 4, unread: true },
  { id: "n3", icon: "users", title: `${PROFILES[8]!.name} giới thiệu một người cho bạn`, body: "Lời giới thiệu hết hạn sau 24 giờ.", hoursAgo: 9, unread: false },
  { id: "n4", icon: "message", title: `${PROFILES[1]!.name} đã nhắn tin`, body: "Mở cuộc trò chuyện để xem.", hoursAgo: 26, unread: false },
  { id: "n5", icon: "sparkle", title: "Gợi ý hằng ngày đã sẵn sàng", body: "Một cặp được chọn riêng cho hôm nay.", hoursAgo: 30, unread: false },
];

function ago(h: number): string {
  if (h < 1) return "vừa xong";
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export function Notifications() {
  return (
    <>
      <header className="disc__head">
        <div>
          <h1 className="disc__title">Thông báo</h1>
          <p className="disc__sub">Việc mới trước, phần đã xem lùi xuống.</p>
        </div>
      </header>

      <ul className="notes">
        {NOTES.map((n, i) => (
          <li
            key={n.id}
            className={n.unread ? "note note--unread" : "note"}
            style={{ animationDelay: `${Math.min(240, Math.round(40 * Math.sqrt(i)))}ms` }}
          >
            <span className="note__icon"><Icon name={n.icon} size={18} /></span>
            <div className="note__body">
              <div className="note__title">{n.title}</div>
              <div className="note__text">{n.body}</div>
            </div>
            <time className="note__time">{ago(n.hoursAgo)}</time>
          </li>
        ))}
      </ul>
    </>
  );
}
