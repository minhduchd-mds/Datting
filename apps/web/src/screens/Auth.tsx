import { useState } from "react";
import type * as React from "react";
import { CONSENT_PURPOSE, stageOf, validateBirthDate, type SessionStage } from "@datting/core";
import { Button, Field } from "@datting/ui-web/primitives";

import { Logo } from "../Logo.js";
import { api } from "../api.js";
import { session, useSession } from "../session.js";

/**
 * Cổng tuổi · đăng nhập · onboarding cho bản web.
 *
 * ─── Vì sao là CỔNG CHẶN, không phải route ────────────────────────────────
 * Web dùng hash router (`#/de-xuat`, `#/ho-so`). Nếu các chặng này là route,
 * người dùng gõ thẳng `#/de-xuat` là vào được deck khi chưa qua cổng tuổi và
 * chưa có đồng ý xu hướng tính dục. Đó không phải chuyện điều hướng — đó là
 * dữ liệu nhạy cảm bị xử lý khi không có cơ sở pháp lý.
 *
 * Nên `Gate` bọc NGOÀI router: chưa `ready` thì router không được render, và
 * không có URL nào đi vòng qua được.
 *
 * ─── Luật ở core, không ở đây ─────────────────────────────────────────────
 * `stageOf()` và `validateBirthDate()` đến từ `@datting/core`, dùng chung với
 * mobile. File này chỉ vẽ. Viết lại "18 tuổi" hay "khi nào được vào deck" ở
 * đây là tạo bản thứ hai của một quy tắc pháp lý.
 */

export function Gate({ children }: { children: React.ReactNode }) {
  const s = useSession();
  const chang: SessionStage = stageOf(s);

  if (chang === "ready") return <>{children}</>;

  return (
    <div className="gate">
      <div className="gate__card">
        <div className="gate__brand">
          <Logo />
        </div>
        <Steps stage={chang} />
        {chang === "age-gate" && <AgeGate />}
        {chang === "sign-in" && <SignIn />}
        {chang === "onboarding" && <Onboarding />}
        {chang === "preferences" && <Preferences />}
        {chang === "verify" && <Verify />}
      </div>
    </div>
  );
}

/*
 * Thanh chặng.
 *
 * `verify` KHÔNG có mặt ở đây dù nó là một chặng thật. Nó bỏ qua được, nên vẽ
 * nó thành một ô trong dãy là hứa rằng phải làm xong mới hết — rồi nút "Để
 * sau" ngay dưới lại nói ngược lại.
 */
const CHANG: { key: SessionStage; nhan: string }[] = [
  { key: "age-gate", nhan: "Tuổi" },
  { key: "sign-in", nhan: "Số điện thoại" },
  { key: "onboarding", nhan: "Hồ sơ" },
  { key: "preferences", nhan: "Tìm ai" },
];

function Steps({ stage }: { stage: SessionStage }) {
  const i = CHANG.findIndex((c) => c.key === stage);
  if (i < 0) return null;
  return (
    <ol className="gate__steps" aria-label={`Bước ${i + 1} trên ${CHANG.length}`}>
      {CHANG.map((c, n) => (
        <li
          key={c.key}
          className={n <= i ? "gate__step gate__step--on" : "gate__step"}
          aria-current={n === i ? "step" : undefined}
        >
          <span className="gate__stepDot" aria-hidden="true" />
          <span>{c.nhan}</span>
        </li>
      ))}
    </ol>
  );
}

/* ─── 1. Cổng tuổi ─────────────────────────────────────────────────────── */

/**
 * Đứng TRƯỚC đăng nhập.
 *
 * Đặt sau là sai thứ tự pháp lý: lúc đó đã thu số điện thoại của một người có
 * thể chưa đủ 18 tuổi rồi mới đi hỏi tuổi.
 */
function AgeGate() {
  const [d, setD] = useState("");
  const [m, setM] = useState("");
  const [y, setY] = useState("");
  const [loi, setLoi] = useState("");

  function tiep(e: React.FormEvent) {
    e.preventDefault();
    // Luật ở core — cùng hàm mobile dùng. Ba cạm bẫy (năm nhuận, chưa tới sinh
    // nhật trong năm, múi giờ) đã xử lý ở đó và có test.
    const r = validateBirthDate(d, m, y);
    if (!r.ok) {
      setLoi(r.reason);
      return;
    }
    session.passAgeGate(r.iso);
  }

  return (
    <form className="gate__form" onSubmit={tiep}>
      <h1 className="gate__title">Bạn sinh ngày nào?</h1>
      <p className="gate__lead">
        Datting chỉ dành cho người từ 18 tuổi. Chúng tôi lưu ngày sinh, không lưu tuổi.
      </p>

      <Field label="Ngày sinh" error={loi || undefined}>
        <div className="gate__dob">
          <input
            className="gate__in gate__in--n"
            inputMode="numeric"
            autoComplete="bday-day"
            placeholder="Ngày"
            aria-label="Ngày"
            maxLength={2}
            value={d}
            onChange={(e) => {
              setD(e.target.value);
              setLoi("");
            }}
          />
          <input
            className="gate__in gate__in--n"
            inputMode="numeric"
            autoComplete="bday-month"
            placeholder="Tháng"
            aria-label="Tháng"
            maxLength={2}
            value={m}
            onChange={(e) => {
              setM(e.target.value);
              setLoi("");
            }}
          />
          <input
            className="gate__in gate__in--n"
            inputMode="numeric"
            autoComplete="bday-year"
            placeholder="Năm"
            aria-label="Năm"
            maxLength={4}
            value={y}
            onChange={(e) => {
              setY(e.target.value);
              setLoi("");
            }}
          />
        </div>
      </Field>

      <Button tone="accent" type="submit">
        Tiếp tục
      </Button>
    </form>
  );
}

/* ─── 2. Đăng nhập ─────────────────────────────────────────────────────── */

/**
 * SĐT + OTP. Không mật khẩu, không email, không login MXH.
 *
 * Thêm bất kỳ login MXH nào ⇒ App Store 4.8 BẮT BUỘC có "Sign in with Apple"
 * ngang hàng. Đó là một quyết định sản phẩm, không phải một dòng code.
 */
function SignIn() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [daGui, setDaGui] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [loi, setLoi] = useState("");
  const [dangChay, setDangChay] = useState(false);

  async function xinMa(e: React.FormEvent) {
    e.preventDefault();
    setDangChay(true);
    setLoi("");
    try {
      const r = await api.requestOtp(phone);
      setDaGui(true);
      setDevCode(r.devCode);
    } catch {
      setLoi("Không gửi được mã. Kiểm tra số điện thoại rồi thử lại.");
    } finally {
      setDangChay(false);
    }
  }

  async function xacNhan(e: React.FormEvent) {
    e.preventDefault();
    setDangChay(true);
    setLoi("");
    try {
      const r = await api.verifyOtp(phone, code);
      // `null` là mã sai — một nhánh BÌNH THƯỜNG, không phải sự cố.
      if (r === null) {
        setLoi("Mã không đúng hoặc đã hết hạn.");
        return;
      }
      session.signIn(r.userId, r.token);
    } finally {
      setDangChay(false);
    }
  }

  if (!daGui) {
    return (
      <form className="gate__form" onSubmit={xinMa}>
        <h1 className="gate__title">Số điện thoại của bạn</h1>
        <p className="gate__lead">
          Datting chỉ đăng nhập bằng số điện thoại. Không mật khẩu, không email.
        </p>
        <Field label="Số điện thoại" error={loi || undefined}>
          <input
            className="gate__in"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09xx xxx xxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setLoi("");
            }}
          />
        </Field>
        <Button tone="accent" type="submit" disabled={dangChay || phone.trim() === ""}>
          {dangChay ? "Đang gửi…" : "Gửi mã"}
        </Button>
      </form>
    );
  }

  return (
    <form className="gate__form" onSubmit={xacNhan}>
      <h1 className="gate__title">Nhập mã 6 số</h1>
      <p className="gate__lead">Đã gửi tới {phone}.</p>

      {/* Chỉ có mặt khi service bật `OTP_DEV_ECHO=1`. Nói thẳng đây là chế độ
          dev — nếu không, người xem sẽ tưởng app đang tự lộ mã của mình. */}
      {devCode !== undefined && (
        <p className="gate__dev">
          Chế độ dev (máy này không có nhà mạng): mã là <strong>{devCode}</strong>
        </p>
      )}

      <Field label="Mã xác nhận" error={loi || undefined}>
        <input
          className="gate__in gate__in--otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            setLoi("");
          }}
        />
      </Field>

      <Button tone="accent" type="submit" disabled={dangChay || code.length !== 6}>
        {dangChay ? "Đang kiểm tra…" : "Xác nhận"}
      </Button>
      <button
        type="button"
        className="gate__link"
        onClick={() => {
          setDaGui(false);
          setCode("");
          setLoi("");
        }}
      >
        Đổi số điện thoại
      </button>
    </form>
  );
}

/* ─── 3. Onboarding ────────────────────────────────────────────────────── */

const SO_THICH = [
  "Du lịch",
  "Nấu ăn",
  "Leo núi",
  "Xem phim",
  "Đạp xe",
  "Cà phê",
  "Bơi lội",
  "Làm vườn",
  "Cờ vua",
  "Đọc sách",
];

/**
 * Ba bước: tên/chức danh → sở thích → vị trí.
 *
 * Bước vị trí sinh ra DỮ LIỆU NHẠY CẢM theo NĐ13/2023, nên nó không phải một
 * boolean giao diện: nó phải sinh ra một bản ghi đồng ý có mốc thời gian và
 * phiên bản chính sách, ở cả client lẫn server.
 */
function Onboarding() {
  const s = useSession();
  const [buoc, setBuoc] = useState(0);
  const [ten, setTen] = useState("");
  const [chucDanh, setChucDanh] = useState("");
  const [khuVuc, setKhuVuc] = useState("");
  // `profiles.gender` là NOT NULL trong 0001_init.sql — không hỏi thì không tạo
  // được hồ sơ. `null` = chưa chọn, để nút Tiếp tục biết mà chặn.
  const [gioi, setGioi] = useState<0 | 1 | null>(null);
  const [thich, setThich] = useState<string[]>([]);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState("");

  function bat(x: string) {
    setThich((cu) => (cu.includes(x) ? cu.filter((i) => i !== x) : [...cu, x]));
  }

  async function xong(choPhepViTri: boolean) {
    if (gioi === null || s.birthDate === null) return;
    setDangChay(true);
    // Ghi đồng ý TRƯỚC khi lưu hồ sơ: lưu trước rồi ghi đồng ý hỏng thì ta có
    // dữ liệu mà không có cơ sở pháp lý cho nó — đúng thứ tự ngược.
    session.setConsent(CONSENT_PURPOSE.LOCATION, choPhepViTri);
    await api.setConsent(CONSENT_PURPOSE.LOCATION, choPhepViTri).catch(() => undefined);
    /*
     * Lưu hồ sơ. Hỏng thì DỪNG LẠI, không đi tiếp.
     *
     * Bản trước ở đây là `.catch(() => undefined)` rồi gọi thẳng
     * `finishOnboarding()`. Hậu quả đã đo được: toàn bộ luồng chạy trơn tru
     * trên màn hình, người dùng vào tới deck, mà bảng `profiles` không có một
     * dòng nào — nguyên nhân thật là CORS thiếu header `authorization`, và
     * không có gì trên màn hình cho biết.
     *
     * Nuốt lỗi ở một bước GHI DỮ LIỆU là biến một lỗi sửa được thành một tài
     * khoản hỏng vĩnh viễn: người dùng đã "xong" onboarding nên không bao giờ
     * được hỏi lại.
     *
     * Ngày sinh lấy từ CỔNG TUỔI, không hỏi lại. Hỏi hai lần là mở đường cho
     * hai giá trị khác nhau, và giá trị thứ hai không đi qua cổng nào cả.
     */
    try {
      await api.createProfile({
        displayName: ten,
        birthDate: s.birthDate,
        gender: gioi,
        jobTitle: chucDanh,
        community: khuVuc,
        interests: thich,
      });
    } catch {
      setLoi("Chưa lưu được hồ sơ. Kiểm tra kết nối rồi thử lại.");
      setDangChay(false);
      return;
    }
    session.finishOnboarding();
    setDangChay(false);
  }

  if (buoc === 0) {
    return (
      <form
        className="gate__form"
        onSubmit={(e) => {
          e.preventDefault();
          setBuoc(1);
        }}
      >
        <h1 className="gate__title">Giới thiệu một chút</h1>
        <p className="gate__lead">Tên hiển thị và vài dòng để người khác biết bạn là ai.</p>

        <Field label="Tên hiển thị">
          <input
            className="gate__in"
            value={ten}
            maxLength={50}
            onChange={(e) => setTen(e.target.value)}
            placeholder="Tên bạn muốn hiện"
          />
        </Field>
        {/* Chức danh thì được, NƠI LÀM THÌ KHÔNG. Đơn vị công tác suy ra được
            chỗ làm của một người thật; ghép với vị trí và xu hướng tính dục là
            thành một bề mặt rò rỉ mới. Xem CLAUDE.md. */}
        <Field label="Chức danh" description="Không cần nêu nơi làm việc.">
          <input
            className="gate__in"
            value={chucDanh}
            maxLength={80}
            onChange={(e) => setChucDanh(e.target.value)}
            placeholder="Ví dụ: Kỹ sư phần mềm"
          />
        </Field>
        <Field label="Giới tính">
          <div className="gate__chips">
            {([[1, "Nữ"], [0, "Nam"]] as const).map(([v, nhan]) => (
              <button
                key={nhan}
                type="button"
                className={gioi === v ? "gate__chip gate__chip--on" : "gate__chip"}
                aria-pressed={gioi === v}
                onClick={() => setGioi(v)}
              >
                {nhan}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Khu vực" description="Quận hoặc khu vực bạn hay sinh hoạt.">
          <input
            className="gate__in"
            value={khuVuc}
            maxLength={60}
            onChange={(e) => setKhuVuc(e.target.value)}
            placeholder="Ví dụ: Cầu Giấy"
          />
        </Field>

        <Button tone="accent" type="submit" disabled={ten.trim() === "" || gioi === null}>
          Tiếp tục
        </Button>
      </form>
    );
  }

  if (buoc === 1) {
    return (
      <div className="gate__form">
        <h1 className="gate__title">Bạn thích làm gì?</h1>
        <p className="gate__lead">Chọn vài thứ. Đây là phần Đề xuất dựa vào nhiều nhất.</p>
        <div className="gate__chips">
          {SO_THICH.map((x) => (
            <button
              key={x}
              type="button"
              className={thich.includes(x) ? "gate__chip gate__chip--on" : "gate__chip"}
              aria-pressed={thich.includes(x)}
              onClick={() => bat(x)}
            >
              {x}
            </button>
          ))}
        </div>
        <Button tone="accent" onClick={() => setBuoc(2)} disabled={thich.length === 0}>
          Tiếp tục
        </Button>
        <button type="button" className="gate__link" onClick={() => setBuoc(0)}>
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="gate__form">
      <h1 className="gate__title">Cho phép dùng vị trí?</h1>
      <p className="gate__lead">
        Vị trí dùng để xếp người ở gần lên trước. Không có nó thì vẫn dùng được, chỉ là
        khoảng cách sẽ không chính xác.
      </p>
      {/* Nói rõ hai điều mà một ô tích "đồng ý điều khoản" không nói được:
          dùng vào việc gì, và rút lại được ở đâu. Thiếu một trong hai thì theo
          NĐ13 đồng ý đó không hợp lệ. */}
      <p className="gate__note">
        Đây là đồng ý RIÊNG cho vị trí, không gộp với bất kỳ mục đích nào khác. Bạn rút
        lại được bất cứ lúc nào ở mục Hồ sơ.
      </p>

      {loi !== "" && (
        <p className="gate__err" role="alert">
          {loi}
        </p>
      )}

      <Button tone="accent" onClick={() => void xong(true)} disabled={dangChay}>
        {dangChay ? "Đang lưu…" : "Đồng ý dùng vị trí"}
      </Button>
      {/* Từ chối phải DỄ NGANG đồng ý. Giấu nó thành chữ nhạt tí xíu là biến
          "tự nguyện" thành hình thức. */}
      <Button onClick={() => void xong(false)} disabled={dangChay}>
        Không, cảm ơn
      </Button>
    </div>
  );
}

/* ─── 4. Giới tính muốn tìm ────────────────────────────────────────────── */

const GIOI = [
  { id: "nu", nhan: "Nữ" },
  { id: "nam", nhan: "Nam" },
  { id: "khac", nhan: "Tất cả" },
];

/**
 * Màn RIÊNG, không gộp vào onboarding — và đó là điều quan trọng nhất ở đây.
 *
 * NĐ13/2023 coi xu hướng tính dục là dữ liệu nhạy cảm. Người dùng không hề
 * khai "tôi là người đồng tính", nhưng "tôi là nam, tôi muốn tìm nam" thì SUY
 * RA ĐƯỢC, và luật nhìn dữ liệu suy ra được y hệt dữ liệu khai báo.
 *
 * Hệ quả thiết kế: đồng ý phải lấy tại đúng thời điểm dữ liệu phát sinh, cho
 * đúng một mục đích, và người dùng phải đọc được mình đang đồng ý cho cái gì.
 * Một ô tích "Tôi đồng ý với điều khoản" ở cuối form là KHÔNG HỢP LỆ.
 */
function Preferences() {
  const [chon, setChon] = useState<string[]>([]);
  const [dangChay, setDangChay] = useState(false);

  function bat(x: string) {
    setChon((cu) => (cu.includes(x) ? cu.filter((i) => i !== x) : [...cu, x]));
  }

  async function dongY() {
    setDangChay(true);
    // Đồng ý TRƯỚC, dữ liệu SAU. `setWantGenders` chỉ được gọi khi đã có cơ sở
    // pháp lý — đảo thứ tự là tạo ra dữ liệu nhạy cảm không có căn cứ, dù chỉ
    // trong vài mili giây.
    session.setConsent(CONSENT_PURPOSE.ORIENTATION, true);
    await api.setConsent(CONSENT_PURPOSE.ORIENTATION, true).catch(() => undefined);
    session.setWantGenders(chon);
    setDangChay(false);
  }

  return (
    <div className="gate__form">
      <h1 className="gate__title">Bạn muốn gặp ai?</h1>
      <div className="gate__chips">
        {GIOI.map((g) => (
          <button
            key={g.id}
            type="button"
            className={chon.includes(g.id) ? "gate__chip gate__chip--on" : "gate__chip"}
            aria-pressed={chon.includes(g.id)}
            onClick={() => bat(g.id)}
          >
            {g.nhan}
          </button>
        ))}
      </div>

      <p className="gate__note">
        Lựa chọn này cho biết xu hướng tính dục của bạn — theo Nghị định 13/2023 đó là dữ
        liệu nhạy cảm, nên nó cần một đồng ý riêng chứ không nằm chung với các mục khác.
        Chỉ dùng để chọn người hiển thị trong Đề xuất. Rút lại được bất cứ lúc nào ở mục
        Hồ sơ; khi rút, lựa chọn này bị xoá.
      </p>

      <Button tone="accent" onClick={() => void dongY()} disabled={dangChay || chon.length === 0}>
        {dangChay ? "Đang lưu…" : "Đồng ý và tiếp tục"}
      </Button>
    </div>
  );
}

/* ─── 5. Xác minh ảnh ──────────────────────────────────────────────────── */

/**
 * Bước AN TOÀN, không phải bước PHÁP LÝ — nên nó khuyến khích chứ không chặn.
 *
 * Ép selfie ngay lúc đăng ký làm rơi tỉ lệ hoàn tất rất mạnh, và chính màn này
 * đang hứa một PHẦN THƯỞNG ("nhận nhiều lượt kết nối hơn"). Hứa thưởng rồi
 * chặn đường là mâu thuẫn.
 */
function Verify() {
  return (
    <div className="gate__form">
      <h1 className="gate__title">Xác minh ảnh</h1>
      <p className="gate__lead">
        Hồ sơ đã xác minh nhận được nhiều lượt kết nối hơn, và giúp mọi người tin rằng bạn
        là người thật.
      </p>
      {/* Không hứa thời gian duyệt. Đội kiểm duyệt là MỘT người; mọi con số nêu
          ra ở đây đều sẽ sai. */}
      <p className="gate__note">
        Ảnh selfie chỉ dùng để so khớp rồi xoá ngay — đây là dữ liệu sinh trắc học, giữ
        lại không đem lại lợi ích gì sau lần so khớp đầu tiên.
      </p>

      {/*
       * Chưa nối vào endpoint xác minh — chưa có endpoint đó, và tư thế phải do
       * SERVER sinh mới có giá trị (client tự chọn thì kẻ tấn công sửa client
       * để luôn ra tư thế đã quay sẵn). Nút dưới đây chỉ dẫn tới đường bỏ qua,
       * và nói đúng như vậy thay vì giả vờ đã chạy.
       */}
      <p className="gate__note">Trên bản web, xác minh ảnh chưa mở. Bạn có thể làm sau.</p>

      <Button tone="accent" onClick={() => session.deferVerification()}>
        Để sau
      </Button>
    </div>
  );
}
