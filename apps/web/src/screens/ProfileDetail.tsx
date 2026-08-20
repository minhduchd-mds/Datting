import { useEffect, useState } from "react";
import type * as React from "react";
import { Button, Sheet } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import { api, type Gallery, type LinkPlatform } from "../api.js";
import type { Profile } from "../data/profiles.js";

/**
 * Hồ sơ đầy đủ.
 *
 * Thay hộp thoại tạm ở GĐ 2. Figma có ba biến thể màn "Xem chi tiết hồ sơ";
 * biến thể "hiển thị ít thông tin" là cùng bố cục với các khối rỗng bị ẩn, nên
 * không cần component riêng — nó rơi ra tự nhiên khi hồ sơ thiếu trường.
 *
 * Mở bằng lớp phủ trượt lên thay vì đổi route: người dùng đang ở giữa một deck,
 * đẩy họ sang trang khác rồi bắt bấm back là làm đứt nhịp duyệt.
 *
 * ─── Vì sao là `Sheet` chứ không phải div tự viết ─────────────────────────
 * Bản đầu ở đây là `<div role="dialog" aria-modal="true">` tự dựng, chỉ tự lo
 * mỗi phím Esc. `aria-modal="true"` là lời hứa rằng tiêu điểm bị nhốt trong
 * hộp — Tab khi đó vẫn đi thẳng ra sidebar phía sau lớp phủ, tức là khai một
 * đằng làm một nẻo. Bốn việc còn lại (bẫy tiêu điểm, trả tiêu điểm về nút đã
 * mở, `inert` nền, khoá cuộn nền) nay do Base UI lo, qua `Sheet`.
 */
export interface ProfileDetailProps {
  profile: Profile;
  onClose: () => void;
  onDecide: (action: "like" | "pass") => void;
  /** Mở lớp an toàn. Không truyền thì nút không hiện. */
  onSafety?: (() => void) | undefined;
}

/** Nhãn hiển thị cho từng nền tảng. Khớp `LinkPlatform` do service trả về. */
const LINK_LABEL: Record<LinkPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  spotify: "Spotify",
  facebook: "Facebook",
  khac: "Liên kết",
};

export function ProfileDetail({ profile, onClose, onDecide, onSafety }: ProfileDetailProps) {
  const [gallery, setGallery] = useState<Gallery>({ photos: [], links: [] });

  useEffect(() => {
    let ignore = false;
    void api
      .fetchGallery(profile.userId)
      .then((g) => {
        if (!ignore) setGallery(g);
      })
      // Thư viện hỏng KHÔNG được làm hỏng cả màn hồ sơ: phần chính vẫn đọc
      // được, chỉ thiếu ảnh phụ và liên kết.
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [profile.userId]);

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      label={`Hồ sơ ${profile.name}`}
    >
      <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">
        <Icon name="x-close" size={20} />
      </button>

      <header className="pf__head">
        <img className="pf__avatar" src={profile.photoUrl} alt="" />
        <div>
          <h1 className="pf__name">
            {profile.name}, {profile.age}
            {/* `title` chỉ hiện khi rê CHUỘT — người dùng cảm ứng và bàn phím
                không bao giờ thấy nó, và trình đọc màn hình đọc `title` không
                nhất quán giữa các trình duyệt. `aria-label` mới là tên khả
                truy cập ổn định; giữ `title` cho tooltip chuột. */}
            {profile.verified && (
              <span className="pf__verified" title="Đã xác minh ảnh" aria-label="Đã xác minh ảnh">
                <Icon name="star" size={14} />
              </span>
            )}
          </h1>
          {/* Chức danh và khu vực đã làm mờ. Không có đơn vị công tác. */}
          <p className="pf__meta">{profile.jobTitle} · {profile.community}</p>
          <p className="pf__meta">
            {profile.daysSinceActive === 0
              ? "Đang hoạt động hôm nay"
              : `Hoạt động ${profile.daysSinceActive} ngày trước`}
          </p>
        </div>
      </header>

      <p className="pf__bio">{profile.bio}</p>

      {gallery.photos.length > 1 && (
        <Section title="Thư viện ảnh">
          {/* Ảnh trong đây ĐÃ được server lọc: chỉ tấm đã duyệt. Client không
              lọc lại — lọc ở client thì ảnh chưa duyệt đã rời khỏi server rồi. */}
          <div className="pf__gallery">
            {gallery.photos.map((ph) => (
              <img
                key={ph.position}
                className="pf__shot"
                src={ph.url}
                alt={`Ảnh ${ph.position + 1} của ${profile.name}`}
                loading="lazy"
              />
            ))}
          </div>
        </Section>
      )}

      {gallery.links.length > 0 && (
        <Section title="Liên kết">
          <div className="pf__links">
            {gallery.links.map((l) => (
              <a
                key={l.platform}
                className="pf__link"
                href={l.url || undefined}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon name="share" size={15} />
                <span>{LINK_LABEL[l.platform]}</span>
                <span className="pf__linkHandle">{l.handle}</span>
              </a>
            ))}
          </div>
          {/* Nói rõ VÌ SAO mình thấy được: người kia chọn chia sẻ sau khi kết
              nối, chứ không phải nó vẫn công khai với cả thế giới. */}
          <p className="pf__linkNote">Chỉ hiện với người đã kết nối.</p>
        </Section>
      )}

      <Section title="Vì sao hai bạn được gợi ý">
        <div className="pf__bars">
          {([["Sở thích", profile.breakdown.interest],
             ["Tính cách", profile.breakdown.personality],
             ["Khoảng cách", profile.breakdown.location]] as const).map(([l, v]) => (
            <div key={l} className="detail__row">
              <span className="detail__label">{l}</span>
              <span className="detail__bar"><span className="detail__fill" style={{ width: `${v}%` }} /></span>
              <span className="detail__val">{v}%</span>
            </div>
          ))}
        </div>
      </Section>

      {profile.prompts.map((p) => (
        <Section key={p.question} title={p.question}>
          <p className="pf__answer">{p.answer}</p>
        </Section>
      ))}

      <Section title="Sở thích"><Chips items={profile.interests} /></Section>
      <Section title="Lối sống"><Chips items={profile.lifestyle} /></Section>
      <Section title="Đang tìm"><Chips items={[profile.intent]} /></Section>

      <div className="pf__actions">
        <Button onClick={() => onDecide("pass")}>Bỏ qua</Button>
        <Button tone="accent" onClick={() => onDecide("like")}>Kết nối</Button>
      </div>

      {/* Đường báo cáo phải có mặt ở ĐÚNG chỗ người ta nhìn thấy thứ khiến họ
          muốn báo cáo. Để nhạt và ở cuối vì nó không phải hành động thường
          xuyên — nhưng có mặt thì mới gọi là có. */}
      {onSafety && (
        <button type="button" className="pf__safety" onClick={onSafety}>
          Báo cáo hoặc chặn {profile.name.split(" ").slice(-1)[0]}
        </button>
      )}
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pf__section">
      <h2 className="pf__sectionTitle">{title}</h2>
      {children}
    </section>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="pf__chips">
      {items.map((x) => <span key={x} className="pf__chip">{x}</span>)}
    </div>
  );
}
