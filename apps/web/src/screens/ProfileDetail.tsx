import { useEffect } from "react";
import type * as React from "react";
import { Button } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
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
 */
export interface ProfileDetailProps {
  profile: Profile;
  onClose: () => void;
  onDecide: (action: "like" | "pass") => void;
}

export function ProfileDetail({ profile, onClose, onDecide }: ProfileDetailProps) {
  // Esc đóng. Đăng ký ở pha CAPTURE chứ không dùng useHotkeys chung: lớp phủ
  // này phải ăn phím TRƯỚC màn deck bên dưới, nếu không mũi tên vẫn vuốt thẻ
  // đang bị che.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={`Hồ sơ ${profile.name}`}>
      <div className="sheet__scrim" onClick={onClose} />
      <div className="sheet__panel">
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Đóng">
          <Icon name="x-close" size={20} />
        </button>

        <header className="pf__head">
          <img className="pf__avatar" src={profile.photoUrl} alt="" />
          <div>
            <h1 className="pf__name">
              {profile.name}, {profile.age}
              {profile.verified && (
                <span className="pf__verified" title="Đã xác minh ảnh">
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
      </div>
    </div>
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
