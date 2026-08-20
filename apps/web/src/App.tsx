import { ROUTES } from "./routes.js";
import { navigate, useRoute } from "./useRoute.js";
import { Discover } from "./screens/Discover.js";
import { Placeholder } from "./screens/Placeholder.js";
import { Icon, type IconName } from "./icons.js";

/**
 * Vỏ ứng dụng: sidebar 240 + container 1200, đúng bố cục 1440 của thiết kế.
 *
 * Sidebar có mặt ở CẢ 27 màn nên nó là LAYOUT, không phải component đặt lại ở
 * từng màn — đó là lý do nó sống ở đây chứ không ở trong mỗi screen.
 */
export function App() {
  const route = useRoute();
  const current = ROUTES.find((r) => r.id === route);

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
        {route === "de-xuat" ? (
          <Discover />
        ) : (
          <Placeholder title={current?.label ?? ""} routeId={route} />
        )}
      </main>
    </div>
  );
}
