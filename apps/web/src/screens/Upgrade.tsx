import { useEffect, useState } from "react";
import { Button } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import { api, type Wallet } from "../api.js";

/**
 * Ví xu và gói nâng cấp.
 *
 * ─── Vì sao trang này chỉ có trên WEB ────────────────────────────────────
 * Hàng số bán TRONG app iOS/Android bắt buộc đi qua In-App Purchase (App Store
 * 3.1.1) và Google Play Billing. Không được dùng MoMo/VNPay/ZaloPay cho hàng
 * số bên trong app, và Apple/Google giữ 15–30%. Trên web thì ngược lại: cổng
 * nào cũng được, không mất phần trăm đó.
 *
 * Nên bản mobile sẽ có màn tương đương nhưng gọi IAP, không gọi các endpoint ở
 * đây. Cả hai cùng đổ về MỘT tầng ví duy nhất (`0011_wallet.sql` có cột
 * `provider`), vì số dư của người dùng phải là một con số dù họ nạp bằng đường
 * nào.
 *
 * ─── Trang này chưa nối cổng thanh toán thật ─────────────────────────────
 * Endpoint nạp/mua hiện khoá sau `OTP_DEV_ECHO` và trả 501 ở production. Nói
 * thẳng ra trên màn hình thay vì để nút trông như đã hoạt động: một nút "Nạp"
 * bấm được mà không trừ tiền thật là thứ khiến người thử tin rằng phần thanh
 * toán đã xong.
 */

/**
 * Gói xu.
 *
 * Giá theo bậc, và bậc lớn hơn thì RẺ HƠN TRÊN MỖI XU — đó là lý do duy nhất
 * chính đáng để có nhiều bậc. Nếu mọi bậc cùng đơn giá thì chúng chỉ là một ô
 * nhập số được vẽ thành bốn cái nút.
 */
const GOI_XU = [
  { coins: 100, vnd: 20_000 },
  { coins: 300, vnd: 50_000 },
  { coins: 700, vnd: 100_000 },
  { coins: 1500, vnd: 200_000 },
];

const GOI_NANG_CAP = [
  {
    tier: "plus",
    ten: "Plus",
    vnd: 99_000,
    days: 30,
    loi: ["Xem ai đã thích bạn", "Hoàn tác không giới hạn", "Không quảng cáo"],
  },
  {
    tier: "gold",
    ten: "Gold",
    vnd: 199_000,
    days: 30,
    loi: ["Tất cả quyền lợi Plus", "5 lượt Ưu tiên mỗi tuần", "Huy hiệu trong phòng"],
  },
];

function dinhDangVnd(v: number): string {
  return v.toLocaleString("vi-VN") + "₫";
}

export function Upgrade() {
  const [vi, setVi] = useState<Wallet | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState("");
  const [xong, setXong] = useState("");

  const tai = () => {
    void api
      .fetchWallet()
      .then(setVi)
      .catch(() => setVi(null));
  };
  useEffect(tai, []);

  async function nap(coins: number) {
    setDangChay(true);
    setLoi("");
    setXong("");
    try {
      setVi(await api.topUp(coins));
      setXong(`Đã cộng ${coins.toLocaleString("vi-VN")} xu.`);
    } catch {
      // 501 = chưa nối cổng. Nói đúng chuyện đó, đừng nói "lỗi": người dùng
      // thử lại mười lần cũng không khác gì.
      setLoi("Chưa nối cổng thanh toán. Đây là bản đang dựng.");
    } finally {
      setDangChay(false);
    }
  }

  async function mua(tier: string, days: number) {
    setDangChay(true);
    setLoi("");
    setXong("");
    try {
      await api.subscribe(tier, days);
      tai();
      setXong("Đã kích hoạt gói.");
    } catch {
      setLoi("Chưa nối cổng thanh toán. Đây là bản đang dựng.");
    } finally {
      setDangChay(false);
    }
  }

  return (
    <section className="up">
      <header>
        <h1 className="disc__title">Nâng cấp</h1>
        <p className="disc__sub">Xu để tặng quà trong phòng. Gói để mở thêm quyền.</p>
      </header>

      <div className="up__wallet">
        <span className="up__walletLabel">Số dư</span>
        <span className="up__balance">
          <Icon name="coin" size={20} />
          {vi === null ? "—" : vi.balance.toLocaleString("vi-VN")}
          <span className="up__unit">xu</span>
        </span>
        {vi?.tier != null && (
          <span className="up__tier">
            {vi.tier.toUpperCase()}
            {vi.tierExpiresAt !== null && (
              // Ngày hết hạn luôn hiện cạnh tên gói. Một huy hiệu "GOLD" không
              // kèm hạn thì người dùng không biết mình còn bao lâu, và phát
              // hiện ra bằng cách mất quyền.
              <span className="up__tierTo">
                đến {new Date(vi.tierExpiresAt).toLocaleDateString("vi-VN")}
              </span>
            )}
          </span>
        )}
      </div>

      {loi !== "" && (
        <p className="gate__err" role="alert">
          {loi}
        </p>
      )}
      {xong !== "" && (
        <p className="up__ok" role="status">
          {xong}
        </p>
      )}

      <h2 className="pf__sectionTitle">Nạp xu</h2>
      <div className="up__grid">
        {GOI_XU.map((g) => (
          <button
            key={g.coins}
            type="button"
            className="up__pack"
            disabled={dangChay}
            onClick={() => void nap(g.coins)}
          >
            <span className="up__packCoins">{g.coins.toLocaleString("vi-VN")} xu</span>
            <span className="up__packPrice">{dinhDangVnd(g.vnd)}</span>
            {/* Đơn giá mỗi xu: con số cho phép so sánh các bậc mà không phải tự
                chia. Giấu nó đi là bắt người dùng làm phép tính để biết bậc nào
                lợi hơn. */}
            <span className="up__packUnit">
              {Math.round(g.vnd / g.coins).toLocaleString("vi-VN")}₫/xu
            </span>
          </button>
        ))}
      </div>

      <h2 className="pf__sectionTitle">Gói tháng</h2>
      <div className="up__tiers">
        {GOI_NANG_CAP.map((t) => (
          <div key={t.tier} className="up__tierCard">
            <h3 className="up__tierName">{t.ten}</h3>
            <p className="up__tierPrice">
              {dinhDangVnd(t.vnd)}
              <span className="up__unit">/tháng</span>
            </p>
            <ul className="up__benefits">
              {t.loi.map((b) => (
                <li key={b}>
                  <Icon name="chevron-right" size={13} />
                  {b}
                </li>
              ))}
            </ul>
            <Button tone="accent" disabled={dangChay} onClick={() => void mua(t.tier, t.days)}>
              Chọn {t.ten}
            </Button>
          </div>
        ))}
      </div>

      {/* Nói ra hai điều người dùng sẽ hỏi, trước khi họ phải đi tìm. Cái thứ
          hai đặc biệt quan trọng: mua tiếp khi còn hạn thì thời gian CỘNG DỒN,
          không bị đặt lại — không nói thì người dùng sẽ đợi hết hạn mới mua và
          mất mấy ngày không có quyền. */}
      <p className="gate__note up__note">
        Xu chỉ dùng trong ứng dụng và không quy đổi ngược ra tiền. Mua thêm gói khi đang còn
        hạn thì thời gian được cộng dồn, không đặt lại từ đầu.
      </p>
    </section>
  );
}
