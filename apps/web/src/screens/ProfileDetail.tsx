import { useEffect, useMemo, useState } from "react";
import type * as React from "react";
import { Button, Panel } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import { api, type Gallery, type LinkPlatform } from "../api.js";
import type { Profile } from "../data/profiles.js";

/**
 * Hồ sơ đầy đủ.
 *
 * ─── Vì sao bỏ tấm dán mép phải ────────────────────────────────────────
 * Bản trước dùng `Sheet`: một dải dọc rộng 620px neo vào mép phải màn hình.
 * Ba thứ hỏng theo, và cả ba đều đo được chứ không phải chuyện thẩm mỹ:
 *
 *   1. Hồ sơ hẹn hò được đọc bằng ẢNH trước, chữ sau. Dải dọc ép ảnh xuống
 *      còn một avatar 96px và nhường hết bề ngang cho chữ — đúng thứ tự ngược.
 *   2. Mọi khối xếp thành MỘT cột, nên `Bỏ qua`/`Kết nối` nằm dưới đáy một
 *      trang cuộn dài. Ở màn Đề xuất người dùng ra quyết định liên tục; bắt
 *      cuộn hết hồ sơ mới bấm được nút là chi phí trả cho TỪNG hồ sơ.
 *   3. Ở 1440–2560 thì 620px dán mép phải trông như một cái điện thoại dán vào
 *      cạnh màn, phần còn lại bỏ trống.
 *
 * Nay là `Panel`: tấm ở giữa, ảnh một cột, chữ một cột, hàng nút GHIM ở đáy
 * tấm nên luôn với tới được — không phụ thuộc hồ sơ dài bao nhiêu.
 *
 * Figma có ba biến thể màn "Xem chi tiết hồ sơ"; biến thể "hiển thị ít thông
 * tin" là cùng bố cục với các khối rỗng bị ẩn, nên không cần component riêng —
 * nó rơi ra tự nhiên khi hồ sơ thiếu trường.
 *
 * Mở bằng lớp phủ thay vì đổi route: người dùng đang ở giữa một deck, đẩy họ
 * sang trang khác rồi bắt bấm back là làm đứt nhịp duyệt.
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
  const [anh, setAnh] = useState(0);

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

  /*
   * Ảnh để xem.
   *
   * `gallery.photos` đã được SERVER lọc — chỉ tấm `moderation = 1`. Client
   * không lọc lại: lọc ở client thì ảnh chưa duyệt đã rời khỏi server rồi.
   *
   * Khi thư viện rỗng (chưa tải xong, hoặc chưa ảnh nào qua kiểm duyệt) vẫn
   * phải có MỘT tấm để cột trái không thành một ô xám — dùng `photoUrl` của
   * deck, vốn cũng do server chọn trong số ảnh đã duyệt.
   */
  const anhs = useMemo(
    () => (gallery.photos.length > 0 ? gallery.photos.map((p) => p.url) : [profile.photoUrl]),
    [gallery.photos, profile.photoUrl],
  );
  // Đổi người thì về tấm đầu. Không có dòng này, mở hồ sơ có 1 ảnh ngay sau khi
  // vừa xem tấm thứ 4 của người trước sẽ trỏ vào một chỉ số không tồn tại.
  useEffect(() => setAnh(0), [profile.userId]);
  const dangXem = anhs[Math.min(anh, anhs.length - 1)] ?? profile.photoUrl;

  const ho = profile.name.split(" ").slice(-1)[0];

  return (
    <Panel
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      label={"Hồ sơ " + profile.name}
    >
      <div className="pf">
        {/* ── Cột trái: ảnh ────────────────────────────────────────────── */}
        <div className="pf__media">
          <img className="pf__hero" src={dangXem} alt={"Ảnh của " + profile.name} />

          {anhs.length > 1 && (
            <div className="pf__thumbs" role="group" aria-label="Chọn ảnh">
              {anhs.map((u, i) => (
                <button
                  key={u}
                  type="button"
                  className={i === anh ? "pf__thumb pf__thumb--on" : "pf__thumb"}
                  aria-label={"Ảnh " + (i + 1) + " trên " + anhs.length}
                  aria-pressed={i === anh}
                  onClick={() => setAnh(i)}
                >
                  <img src={u} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Cột phải: chữ, cuộn riêng ────────────────────────────────── */}
        <div className="pf__read">
          <button type="button" className="pf__close" onClick={onClose} aria-label="Đóng">
            <Icon name="x-close" size={18} />
          </button>

          <header className="pf__head">
            <h1 className="pf__name">
              {profile.name}, {profile.age}
              {/* `title` chỉ hiện khi rê CHUỘT — người dùng cảm ứng và bàn phím
                  không bao giờ thấy nó, và trình đọc màn hình đọc `title` không
                  nhất quán giữa các trình duyệt. `aria-label` mới là tên khả
                  truy cập ổn định; giữ `title` cho tooltip chuột. */}
              {profile.verified && (
                <span className="pf__verified" title="Đã xác minh ảnh" aria-label="Đã xác minh ảnh">
                  <Icon name="star" size={13} />
                </span>
              )}
            </h1>
            {/* Chức danh và khu vực đã làm mờ. Không có đơn vị công tác. */}
            <p className="pf__meta">
              {profile.jobTitle} · {profile.community}
            </p>
            <p className="pf__meta pf__meta--soft">
              {profile.daysSinceActive === 0
                ? "Đang hoạt động hôm nay"
                : "Hoạt động " + profile.daysSinceActive + " ngày trước"}
            </p>
          </header>

          {profile.bio.trim() !== "" && <p className="pf__bio">{profile.bio}</p>}

          <Section title="Vì sao hai bạn được gợi ý">
            <div className="pf__bars">
              {(
                [
                  ["Sở thích", profile.breakdown.interest],
                  ["Tính cách", profile.breakdown.personality],
                  ["Khoảng cách", profile.breakdown.location],
                ] as const
              ).map(([l, v]) => (
                <div key={l} className="detail__row">
                  <span className="detail__label">{l}</span>
                  <span className="detail__bar">
                    <span className="detail__fill" style={{ width: v + "%" }} />
                  </span>
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

          <Section title="Sở thích">
            <Chips items={profile.interests} />
          </Section>
          <Section title="Lối sống">
            <Chips items={profile.lifestyle} />
          </Section>
          <Section title="Đang tìm">
            <Chips items={[profile.intent]} />
          </Section>

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
              {/* Nói rõ VÌ SAO mình thấy được: người kia chọn chia sẻ sau khi
                  kết nối, chứ không phải nó vẫn công khai với cả thế giới. */}
              <p className="pf__linkNote">Chỉ hiện với người đã kết nối.</p>
            </Section>
          )}

          {/* Đường báo cáo phải có mặt ở ĐÚNG chỗ người ta nhìn thấy thứ khiến
              họ muốn báo cáo. Để nhạt và ở cuối vì nó không phải hành động
              thường xuyên — nhưng có mặt thì mới gọi là có. */}
          {onSafety && (
            <button type="button" className="pf__safety" onClick={onSafety}>
              Báo cáo hoặc chặn {ho}
            </button>
          )}
        </div>
      </div>

      {/* ── Hàng nút: GHIM ở đáy tấm, ngoài vùng cuộn ─────────────────────
          Đây là điểm khác chính so với bản dải dọc. Hồ sơ dài bao nhiêu cũng
          không đẩy được hai nút này ra khỏi tầm với. */}
      <footer className="pf__bar">
        {/* Gợi ý này phải nói ĐÚNG thứ đang chạy. `←`/`→` bị tắt có chủ đích
            khi hồ sơ đang mở (xem `!profileOpen` trong `Discover.tsx`): đọc kỹ
            hồ sơ một người rồi theo phản xạ bấm `→` là gửi một lượt kết nối
            thật cho đúng người đó. Ghi hai phím ấy lên đây sẽ mời người dùng
            làm đúng cái việc mình vừa chặn. */}
        <p className="pf__barHint">
          <kbd>Esc</kbd> đóng · phím <kbd>←</kbd> <kbd>→</kbd> tạm nghỉ để không lỡ tay
        </p>
        <div className="pf__barBtns">
          <Button onClick={() => onDecide("pass")}>Bỏ qua</Button>
          <Button tone="accent" onClick={() => onDecide("like")}>
            Kết nối
          </Button>
        </div>
      </footer>
    </Panel>
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
      {items.map((x) => (
        <span key={x} className="pf__chip">
          {x}
        </span>
      ))}
    </div>
  );
}
