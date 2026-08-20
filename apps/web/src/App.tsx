import { useState } from "react";

import { ROUTES } from "./routes.js";
import { navigate, useRoute } from "./useRoute.js";
import { Discover } from "./screens/Discover.js";
import { PeopleList } from "./screens/PeopleList.js";
import { Me } from "./screens/Me.js";
import { Notifications } from "./screens/Notifications.js";
import { ProfileDetail } from "./screens/ProfileDetail.js";
import { Conversation } from "./screens/Conversation.js";
import { SafetySheet } from "./screens/SafetySheet.js";
import { PROFILES, type Profile } from "./data/profiles.js";
import { ME_ID, pairKeyOf } from "./api.js";
import { Icon, type IconName } from "./icons.js";

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

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Điều hướng chính">
        <div className="sidebar__brand">Datting</div>
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
            people={PROFILES.slice(0, 6)}
            caption={(p) => (p.verified ? "Đã xác minh ảnh" : "Chưa xác minh ảnh")}
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
            emptyWhy="Bảng introductions đã có trong 0001_init.sql với đủ cột, nhưng chưa có endpoint."
            people={PROFILES.slice(6, 12)}
            caption={(p) => `Được ${PROFILES[(Number(p.userId) % 5) + 20]!.name} giới thiệu`}
            onOpen={setOpen}
          />
        )}

        {route === "ket-noi" && (
          <PeopleList
            title="Kết nối của bạn"
            subtitle="Cả hai đã chọn nhau. Mở lời bằng một điểm chung thay vì một chữ chào."
            emptyTitle="Chưa có kết nối nào"
            emptyWhy="Kết nối xảy ra khi cả hai cùng chọn nhau."
            people={PROFILES.filter((p) => Number(p.userId) % 4 === 0)}
            caption={(p) => (p.daysSinceActive === 0 ? "Đang hoạt động" : `Hoạt động ${p.daysSinceActive} ngày trước`)}
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
