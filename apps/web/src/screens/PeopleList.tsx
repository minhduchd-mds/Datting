import type { Profile } from "../data/profiles.js";
import { Icon, type IconName } from "../icons.js";

/**
 * Lưới người, dùng chung cho ba màn: Chờ, Kết nối, Giới thiệu.
 *
 * Ba màn đó khác nhau ở TIÊU ĐỀ, DÒNG PHỤ và HÀNH ĐỘNG — không khác ở cách bày
 * người. Gộp làm một để chúng không trôi khỏi nhau về sau, cùng lý do khiến
 * `orderReportQueue` sống ở `packages/core` chứ không nằm trong component của
 * console kiểm duyệt.
 */
export interface PeopleListProps {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyWhy: string;
  people: Profile[];
  /** Nhãn phụ dưới mỗi thẻ — ví dụ "đã thích ảnh của bạn". */
  caption?: (p: Profile) => string;
  actionIcon?: IconName;
  actionLabel?: string;
  onAction?: (p: Profile) => void;
  onOpen: (p: Profile) => void;
}

export function PeopleList({
  title, subtitle, emptyTitle, emptyWhy, people,
  caption, actionIcon, actionLabel, onAction, onOpen,
}: PeopleListProps) {
  if (people.length === 0) {
    return (
      <div className="empty">
        <h1 className="empty__title">{emptyTitle}</h1>
        <p className="empty__why">{emptyWhy}</p>
      </div>
    );
  }

  return (
    <>
      <header className="disc__head">
        <div>
          <h1 className="disc__title">{title}</h1>
          <p className="disc__sub">{subtitle}</p>
        </div>
      </header>

      <ul className="grid">
        {people.map((p, i) => (
          <li
            key={p.userId}
            className="tile"
            /* Vào lệch nhau cho danh sách có nhịp. Chặn ở 240ms để người thứ 20
               không phải chờ — cùng công thức bão hoà của staggerDelay trong
               packages/core, ở đây tính bằng CSS. */
            style={{ animationDelay: `${Math.min(240, Math.round(40 * Math.sqrt(i)))}ms` }}
          >
            <button type="button" className="tile__open" onClick={() => onOpen(p)}>
              <img className="tile__img" src={p.photoUrl} alt="" />
              <span className="tile__body">
                <span className="tile__name">{p.name}, {p.age}</span>
                <span className="tile__meta">{p.jobTitle}</span>
                <span className="tile__meta">{p.community}</span>
                {caption && <span className="tile__caption">{caption(p)}</span>}
              </span>
            </button>
            {onAction && actionIcon && (
              <button
                type="button"
                className="tile__act"
                onClick={() => onAction(p)}
                aria-label={`${actionLabel} ${p.name}`}
              >
                <Icon name={actionIcon} size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
