import { useEffect, useState } from "react";

import { ROUTES } from "./routes.js";
import { navigate, useRoute } from "./useRoute.js";
import { Discover } from "./screens/Discover.js";
import { PeopleList } from "./screens/PeopleList.js";
import { Me } from "./screens/Me.js";
import { Notifications } from "./screens/Notifications.js";
import { ProfileDetail } from "./screens/ProfileDetail.js";
import { Conversation } from "./screens/Conversation.js";
import { SafetySheet } from "./screens/SafetySheet.js";
// Chỉ còn KIỂU: cả ba danh sách nay đến từ service, không còn cắt lát dữ liệu
// cục bộ. `data/profiles.ts` giờ chỉ phục vụ bản demo trong `api.ts`.
import type { Profile } from "./data/profiles.js";
import {
  api, ME_ID, pairKeyOf,
  type IntroItem, type LikeItem, type MatchSummary,
} from "./api.js";
import { Icon, type IconName } from "./icons.js";
import { Logo } from "./Logo.js";

/**
 * Vỏ ứng dụng: sidebar 240 + container 1200, đúng bố cục 1440 của thiết kế.
 *
 * Sidebar có mặt ở CẢ 27 màn nên nó là LAYOUT, không phải component đặt lại ở
 * từng màn — đó là lý do nó sống ở đây chứ không ở trong mỗi screen.
 */
export function App() {
  const route = useRoute();
  const [open, setOpen] = useState<Profile | null>(null);
  const [chat, setChat] = useState<Profile | null>(null);
  const [safety, setSafety] = useState<Profile | null>(null);

  const [likes, setLikes] = useState<LikeItem[]>([]);
  const [intros, setIntros] = useState<IntroItem[]>([]);
  const [matches, setMatches] = useState<MatchSummary[]>([]);

  /**
   * Nạp ba danh sách khi vào đúng màn của chúng.
   *
   * Phụ thuộc `route` chứ không nạp cả ba lúc mount: người dùng mở app ở màn Đề
   * xuất, ba lượt gọi cho ba màn họ chưa mở là ba lượt phí — và ở kết nối chậm
   * thì chúng tranh băng thông với chính cái deck đang phải hiện ra.
   *
   * Nạp LẠI mỗi lần quay lại màn: đóng hội thoại rồi về danh sách phải thấy tin
   * cuối vừa gửi, không phải bản chụp cũ.
   */
  useEffect(() => {
    let ignore = false;
    const load =
      route === "cho" ? api.fetchLikesYou().then((v) => !ignore && setLikes(v))
      : route === "gioi-thieu" ? api.fetchIntroductions().then((v) => !ignore && setIntros(v))
      : route === "ket-noi" ? api.fetchMatches().then((v) => !ignore && setMatches(v))
      : null;
    // Lỗi mạng KHÔNG làm trắng màn: danh sách giữ nguyên và trạng thái rỗng đã
    // tự nói vì sao trống. Một màn trắng không cho người dùng thêm thông tin nào.
    void load?.catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [route, chat]);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Điều hướng chính">
        <div className="sidebar__brand"><Logo /></div>
        <ul className="sidebar__list">
          {ROUTES.map((r) => {
            const on = r.id === route;
            return (
              <li key={r.id}>
                <a
                  className={`navitem${on ? " navitem--on" : ""}`}
                  href={`#/${r.id}`}
                  aria-current={on ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(r.id);
                  }}
                >
                  <Icon name={r.icon as IconName} size={20} className="navitem__icon" />
                  <span>{r.label}</span>
                  {r.dot && <span className="navitem__dot" aria-label="có mục mới" />}
                </a>
              </li>
            );
          })}
        </ul>

      </nav>

      <main className="container">
        {route === "de-xuat" && <Discover />}

        {route === "cho" && (
          <PeopleList
            title="Đang chờ bạn"
            subtitle="Những người đã chọn bạn trước. Thích lại là mở được cuộc trò chuyện."
            emptyTitle="Chưa có ai đang chờ"
            emptyWhy="Khi có người thích hồ sơ của bạn, họ xuất hiện ở đây."
            people={likes.map((l) => l.peer)}
            // Nhãn nói NGƯỜI KIA THÍCH CÁI GÌ, không phải "đã thích bạn" chung
            // chung: một tín hiệu cụ thể là chỗ bám để mở lời.
            caption={(p) =>
              likes.find((l) => l.peer.userId === p.userId)?.likedTarget.label ?? ""
            }
            actionIcon="star"
            actionLabel="Kết nối với"
            onAction={() => undefined}
            onOpen={setOpen}
          />
        )}

        {route === "gioi-thieu" && (
          <PeopleList
            title="Giới thiệu"
            subtitle="Người quen giới thiệu. Bạn vẫn quyết, họ chỉ mở lời."
            emptyTitle="Chưa có lời giới thiệu nào"
            emptyWhy="Khi ai đó giới thiệu một người cho bạn, lời giới thiệu hiện ở đây."
            people={intros.map((i) => i.peer)}
            caption={(p) => {
              const i = intros.find((x) => x.peer.userId === p.userId);
              return i ? `Được ${i.introducer} giới thiệu` : "";
            }}
            onOpen={setOpen}
          />
        )}

        {route === "ket-noi" && (
          <PeopleList
            title="Kết nối của bạn"
            subtitle="Cả hai đã chọn nhau. Mở lời bằng một điểm chung thay vì một chữ chào."
            emptyTitle="Chưa có kết nối nào"
            emptyWhy="Kết nối xảy ra khi cả hai cùng chọn nhau."
            people={matches.map((m) => m.peer)}
            // Ưu tiên hiện TIN CUỐI: ở màn danh sách hội thoại, câu vừa nói với
            // nhau đáng giá hơn "hoạt động 3 ngày trước".
            caption={(p) => {
              const m = matches.find((x) => x.peer.userId === p.userId);
              if (m?.lastMessage) return m.lastMessage;
              return p.daysSinceActive === 0
                ? "Đang hoạt động"
                : `Hoạt động ${p.daysSinceActive} ngày trước`;
            }}
            actionIcon="message"
            actionLabel="Nhắn tin cho"
            onAction={setChat}
            onOpen={setOpen}
          />
        )}

        {route === "ho-so" && <Me />}
        {route === "thong-bao" && <Notifications />}

        {open && (
          <ProfileDetail
            profile={open}
            onClose={() => setOpen(null)}
            onDecide={() => setOpen(null)}
            onSafety={() => {
              // Đóng hồ sơ TRƯỚC khi mở lớp an toàn: hai lớp phủ chồng nhau là
              // hai bẫy tiêu điểm chồng nhau, và Esc khi đó không rõ đóng cái
              // nào.
              setSafety(open);
              setOpen(null);
            }}
          />
        )}

        {chat && (
          <Conversation
            peer={chat}
            onClose={() => setChat(null)}
            onSafety={() => {
              setSafety(chat);
              setChat(null);
            }}
          />
        )}

        {safety && (
          <SafetySheet
            peer={safety}
            pairKey={pairKeyOf(ME_ID, safety.userId)}
            onClose={() => setSafety(null)}
          />
        )}
      </main>
    </div>
  );
}
