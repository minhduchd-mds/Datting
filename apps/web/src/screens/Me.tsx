import { useEffect, useState } from "react";
import type * as React from "react";
import { Button, Switch } from "@datting/ui-web/primitives";

import { Icon } from "../icons.js";
import {
  api, POLICY_VERSION,
  type ConsentPurpose, type LinkPlatform, type ProfileEdit, type ProfileLink,
} from "../api.js";
import { avatarUrl, LOI_SONG, SO_THICH, Y_DINH } from "../data/profiles.js";

/**
 * Hồ sơ của chính mình.
 *
 * Điểm chất lượng hồ sơ tính ở CLIENT, và điều đó là TẠM: `PRODUCTION_AUDIT`
 * §2.7 ghi rõ nó nên do server tính và có phiên bản, để mọi client cho ra cùng
 * một con số và để A/B test được. Công thức để lộ ra chứ không giấu trong một
 * hàm — người dùng cần thấy làm gì thì điểm tăng, không phải một con số bí ẩn.
 */
const ME = {
  name: "Đỗ Minh Đức",
  age: 28,
  jobTitle: "Kỹ sư phần mềm",
  community: "Cầu Giấy",
  bio: "Thích những cuộc trò chuyện đi xa hơn câu chào.",
  interests: [SO_THICH[0]!, SO_THICH[4]!, SO_THICH[5]!],
  lifestyle: [LOI_SONG[0]!, LOI_SONG[2]!],
  intent: Y_DINH[0]!,
  verified: false,
  photos: 2,
  prompts: 1,
};

export function Me() {
  const score = Math.min(
    100,
    25 + Math.min(ME.photos, 3) * 10 + Math.min(ME.interests.length, 3) * 5 +
      (ME.bio.trim() ? 10 : 0) + (ME.intent ? 10 : 0) +
      Math.min(ME.prompts, 2) * 5 + (ME.verified ? 5 : 0),
  );

  const todo = [
    { done: ME.photos >= 3, text: `Thêm ảnh (đang có ${ME.photos}/6)`, points: 10 },
    { done: ME.prompts >= 2, text: `Trả lời thêm câu hỏi mở (đang có ${ME.prompts}/3)`, points: 5 },
    { done: ME.verified, text: "Xác minh ảnh thật", points: 5 },
  ];

  return (
    <>
      <header className="disc__head">
        <div>
          <h1 className="disc__title">Hồ sơ của bạn</h1>
          <p className="disc__sub">Ảnh rõ và câu trả lời có chất riêng giúp người phù hợp hiểu bạn nhanh hơn.</p>
        </div>
      </header>

      <div className="me">
        <section className="me__card">
          <img className="pf__avatar" src={avatarUrl(`${ME.name}-me`)} alt="" />
          <div>
            <h2 className="pf__name">{ME.name}, {ME.age}</h2>
            <p className="pf__meta">{ME.jobTitle} · {ME.community}</p>
            <p className="pf__bio">{ME.bio}</p>
          </div>
        </section>

        <section className="me__score">
          <div className="me__scoreTop">
            <span className="pf__sectionTitle">Chất lượng hồ sơ</span>
            <strong className="me__scoreVal">{score}%</strong>
          </div>
          <span className="detail__bar"><span className="detail__fill" style={{ width: `${score}%` }} /></span>
          <ul className="me__todo">
            {todo.map((t) => (
              <li key={t.text} className={t.done ? "me__todoItem me__todoItem--done" : "me__todoItem"}>
                <Icon name={t.done ? "star" : "chevron-right"} size={14} />
                {/* Icon luôn `aria-hidden`, gạch ngang là CSS thuần — cả hai
                    tín hiệu "đã xong" đều vô hình với trình đọc màn hình. */}
                <span className="dw-sr-only">{t.done ? "Đã xong: " : "Chưa xong: "}</span>
                <span>{t.text}</span>
                {!t.done && <span className="me__points">+{t.points}%</span>}
              </li>
            ))}
          </ul>
        </section>

        {/*
          Đồng ý theo NĐ13 là mục RIÊNG, không gộp với tuỳ chọn hiển thị bên
          dưới. Hai thứ này khác hẳn nhau về pháp lý: tuỳ chọn là sở thích, còn
          đồng ý là căn cứ để xử lý dữ liệu nhạy cảm — nghị định đòi mỗi mục
          đích một đồng ý riêng biệt, chứng minh được, rút lại được. Một ô tích
          "Tôi đồng ý với điều khoản" là KHÔNG hợp lệ, và gộp hai nhóm này lại
          một chỗ chính là bước đầu để trượt về đúng cái ô đó.
        */}
        <EditProfile />
        <MyLinks />

        <section className="me__section">
          <h2 className="pf__sectionTitle">Dữ liệu nhạy cảm</h2>
          <p className="me__rowNote">
            Theo Nghị định 13/2023, hai loại dữ liệu dưới đây cần bạn đồng ý riêng.
            Rút lại lúc nào cũng được — bên mình dừng dùng ngay từ lúc đó.
          </p>

          <Consent
            purpose="location"
            label="Dùng vị trí của tôi"
            note="Để tính khoảng cách và gợi ý người ở gần. Hồ sơ chỉ hiện khu vực đã làm mờ, không bao giờ là toạ độ."
          />
          <Consent
            purpose="orientation"
            label="Dùng giới tính tôi muốn tìm"
            note="Đây là dữ liệu suy ra được xu hướng tính dục, nên nó cần một đồng ý riêng chứ không đi kèm mục trên."
          />

          <p className="me__rowNote">
            Bạn đang xem chính sách bản <code>{POLICY_VERSION}</code>.
          </p>
        </section>

        <section className="me__section">
          <h2 className="pf__sectionTitle">Hiển thị</h2>
          <Row label="Hiện khoảng cách trên hồ sơ" note="Tắt thì chỉ hiện tên khu vực, không hiện số km." />
          <Row label="Cho phép người khác giới thiệu mình" note="Bạn vẫn duyệt từng lời giới thiệu trước khi nó hiện ra." />
          <p className="me__pending">
            Hai công tắc này là tuỳ chọn hiển thị, chưa nối vào server — chúng
            không phải đồng ý NĐ13 và không thay thế được mục trên.
          </p>
        </section>

        <section className="me__section">
          <h2 className="pf__sectionTitle">Xoá tài khoản</h2>
          <DeleteAccount />
        </section>
      </div>
    </>
  );
}

/**
 * Sửa hồ sơ.
 *
 * ─── Vì sao chỉ sáu trường ────────────────────────────────────────────────
 * `verified`, `age`, `gender` cố tình KHÔNG sửa được ở đây. Tuổi là giá trị dẫn
 * xuất từ ngày sinh — cho sửa tuổi là cho lách cổng 18. `verified` là kết luận
 * của người kiểm duyệt, không phải lựa chọn của chủ hồ sơ. Server cũng chỉ nhận
 * đúng sáu trường này, nên đây không phải hàng rào duy nhất.
 *
 * ─── Lưu TƯỜNG MINH, không tự lưu ─────────────────────────────────────────
 * Hồ sơ là thứ người ta soạn rồi mới muốn công bố. Tự lưu từng ký tự nghĩa là
 * một câu viết dở đã hiện ra với người lạ trước khi viết xong.
 */
function EditProfile() {
  const [form, setForm] = useState<ProfileEdit | null>(null);
  const [goc, setGoc] = useState<ProfileEdit | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">("idle");

  useEffect(() => {
    let ignore = false;
    void api
      .fetchMyProfile()
      .then((p) => {
        if (ignore) return;
        const v: ProfileEdit = {
          bio: p.bio, jobTitle: p.jobTitle, community: p.community,
          interests: p.interests, lifestyle: p.lifestyle, intent: p.intent,
        };
        setForm(v);
        setGoc(v);
      })
      .catch(() => undefined);
    return () => { ignore = true; };
  }, []);

  if (!form) {
    return (
      <section className="me__section">
        <h2 className="pf__sectionTitle">Thông tin hồ sơ</h2>
        <p className="me__rowNote">Đang tải…</p>
      </section>
    );
  }

  // So với bản gốc chứ không dùng một cờ "đã chạm": gõ rồi xoá về như cũ thì
  // không có gì để lưu, và nút phải phản ánh đúng điều đó.
  const doi = JSON.stringify(form) !== JSON.stringify(goc);
  const set = (k: keyof ProfileEdit, v: string | string[]) => {
    setForm({ ...form, [k]: v });
    setState("idle");
  };

  return (
    <section className="me__section">
      <h2 className="pf__sectionTitle">Thông tin hồ sơ</h2>

      <Field label="Giới thiệu ngắn" hint={`${(form.bio ?? "").length}/500`}>
        <textarea
          className="me__input me__input--area"
          rows={3}
          maxLength={500}
          value={form.bio ?? ""}
          onChange={(e) => set("bio", e.target.value)}
        />
      </Field>

      {/* Chức danh thì được, NƠI LÀM thì không — đơn vị công tác suy ra được
          chỗ làm của một người thật, ghép với vị trí là một bề mặt rò rỉ mới. */}
      <Field label="Chức danh" hint="Không điền tên công ty.">
        <input className="me__input" maxLength={80} value={form.jobTitle ?? ""}
               onChange={(e) => set("jobTitle", e.target.value)} />
      </Field>

      <Field label="Khu vực" hint="Chỉ tên quận/khu vực, không phải địa chỉ.">
        <input className="me__input" maxLength={80} value={form.community ?? ""}
               onChange={(e) => set("community", e.target.value)} />
      </Field>

      <Field label="Sở thích" hint="Cách nhau bằng dấu phẩy.">
        <input className="me__input" value={(form.interests ?? []).join(", ")}
               onChange={(e) => set("interests", splitList(e.target.value))} />
      </Field>

      <Field label="Lối sống" hint="Cách nhau bằng dấu phẩy.">
        <input className="me__input" value={(form.lifestyle ?? []).join(", ")}
               onChange={(e) => set("lifestyle", splitList(e.target.value))} />
      </Field>

      <Field label="Đang tìm">
        <input className="me__input" maxLength={80} value={form.intent ?? ""}
               onChange={(e) => set("intent", e.target.value)} />
      </Field>

      <div className="me__deleteRow">
        <Button
          tone="accent"
          disabled={!doi || state === "busy"}
          onClick={() => {
            setState("busy");
            void api
              .updateProfile(form)
              .then(() => { setGoc(form); setState("saved"); })
              .catch(() => setState("failed"));
          }}
        >
          {state === "busy" ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
        {doi && state !== "busy" && (
          <Button onClick={() => { setForm(goc); setState("idle"); }}>Hoàn tác</Button>
        )}
      </div>

      {state === "saved" && <p className="me__rowNote" role="status">Đã lưu.</p>}
      {state === "failed" && <p className="me__consentErr" role="status">Không lưu được. Thử lại.</p>}
    </section>
  );
}

/** "a, b ,, c" → ["a","b","c"]. Bỏ mục rỗng để dấu phẩy thừa không sinh thẻ trống. */
function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="me__field">
      <span className="me__fieldLabel">{label}</span>
      {children}
      {hint !== undefined && <span className="me__fieldHint">{hint}</span>}
    </label>
  );
}

/**
 * Liên kết mạng xã hội.
 *
 * ─── Đây KHÔNG phải đăng nhập MXH ─────────────────────────────────────────
 * Danh tính vẫn chỉ là SĐT + OTP. Thêm login MXH là Apple bắt buộc có "Sign in
 * with Apple" ngang hàng (App Store 4.8). Đây chỉ là nội dung hồ sơ.
 *
 * ─── Vì sao chỉ có hai mức hiển thị ───────────────────────────────────────
 * Lược đồ có ba (ẩn · sau khi kết nối · công khai) nhưng ở đây chỉ mở hai. Mức
 * công khai đặt một handle có thật lên thẻ khám phá — đường định danh ngược cho
 * bất kỳ ai lướt qua, ghép được với vị trí và xu hướng tính dục. Nó cần một
 * bước xin đồng ý riêng nói rõ hậu quả, không phải một công tắc lặng lẽ.
 */
const PLATFORMS: { key: LinkPlatform; label: string; hint: string }[] = [
  { key: "instagram", label: "Instagram", hint: "tên tài khoản, không phải link" },
  { key: "tiktok", label: "TikTok", hint: "không cần dấu @" },
  { key: "spotify", label: "Spotify", hint: "id người dùng" },
];

function MyLinks() {
  const [links, setLinks] = useState<ProfileLink[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let ignore = false;
    void api.fetchMyLinks().then((l) => {
      if (ignore) return;
      setLinks(l);
      setDraft(Object.fromEntries(l.map((x) => [x.platform, x.handle])));
    }).catch(() => undefined);
    return () => { ignore = true; };
  }, []);

  return (
    <section className="me__section">
      <h2 className="pf__sectionTitle">Liên kết mạng xã hội</h2>
      <p className="me__rowNote">
        Chỉ hiện với người bạn <strong>đã kết nối</strong>. Để trống rồi lưu là xoá.
      </p>

      {links === null ? (
        <p className="me__rowNote">Đang tải…</p>
      ) : (
        PLATFORMS.map((p) => {
          const hienTai = links.find((l) => l.platform === p.key)?.handle ?? "";
          const val = draft[p.key] ?? "";
          return (
            <div key={p.key} className="me__linkRow">
              <Field label={p.label} hint={p.hint}>
                <input
                  className="me__input"
                  maxLength={64}
                  value={val}
                  placeholder="chưa đặt"
                  onChange={(e) => setDraft({ ...draft, [p.key]: e.target.value })}
                />
              </Field>
              <Button
                disabled={val.trim() === hienTai || busy === p.key}
                onClick={() => {
                  setBusy(p.key);
                  void api
                    .saveLink(p.key, val.trim())
                    .then(() => api.fetchMyLinks())
                    .then(setLinks)
                    .catch(() => undefined)
                    .finally(() => setBusy(""));
                }}
              >
                {busy === p.key ? "…" : val.trim() === "" && hienTai !== "" ? "Xoá" : "Lưu"}
              </Button>
            </div>
          );
        })
      )}
    </section>
  );
}

function Row({ label, note }: { label: string; note: string }) {
  return (
    <div className="me__row">
      <div>
        <div className="me__rowLabel">{label}</div>
        <div className="me__rowNote">{note}</div>
      </div>
      <Switch disabled aria-label={label} />
    </div>
  );
}

/**
 * Một mục đồng ý.
 *
 * Cập nhật LẠC QUAN rồi lùi lại nếu hỏng — nhưng khác deck ở một điểm quan
 * trọng: khi hỏng thì nói thẳng là chưa lưu được. Với một quyền pháp lý, để
 * người dùng tin rằng họ đã rút đồng ý trong khi server chưa nhận là hỏng
 * nghiêm trọng hơn nhiều so với một cú vuốt trượt.
 */
function Consent({ purpose, label, note }: { purpose: ConsentPurpose; label: string; note: string }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState(false);

  return (
    <div className="me__row">
      <div>
        <div className="me__rowLabel">{label}</div>
        <div className="me__rowNote">{note}</div>
        {err && <div className="me__consentErr">Chưa lưu được lựa chọn này. Thử lại.</div>}
      </div>
      <Switch
        checked={on}
        aria-label={label}
        onCheckedChange={(next) => {
          setOn(next);
          setErr(false);
          void api.setConsent(purpose, next).catch(() => {
            setOn(!next);
            setErr(true);
          });
        }}
      />
    </div>
  );
}

/**
 * Xoá tài khoản.
 *
 * Xoá MỀM 30 ngày rồi mới purge cứng, nên câu chữ phải nói đúng điều đó: người
 * dùng có quyền biết dữ liệu của họ còn nằm ở đâu và trong bao lâu. Bắt gõ đúng
 * chữ "XOA" chứ không chỉ bấm hai lần — sau 30 ngày việc này không hoàn tác
 * được, mà một hộp thoại xác nhận thường bị bấm qua theo phản xạ.
 */
function DeleteAccount() {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  if (state === "done") {
    return (
      <p className="me__rowNote" role="status">
        Đã nhận yêu cầu xoá. Tài khoản bị ẩn ngay, và dữ liệu sẽ được xoá hẳn sau
        30 ngày. Đăng nhập lại trong 30 ngày đó là huỷ được yêu cầu.
      </p>
    );
  }

  if (!armed) {
    return (
      <>
        <p className="me__rowNote">
          Tài khoản bị ẩn ngay lập tức, dữ liệu được xoá hẳn sau 30 ngày. Trong
          30 ngày đó, đăng nhập lại là khôi phục được.
        </p>
        <div className="me__deleteRow">
          <Button tone="danger" onClick={() => setArmed(true)}>Xoá tài khoản của tôi</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="me__rowNote">
        Gõ <b>XOA</b> để xác nhận. Sau 30 ngày, việc này không hoàn tác được.
      </p>
      <label className="me__deleteConfirm">
        <span className="dw-sr-only">Gõ XOA để xác nhận</span>
        <input
          className="me__deleteInput"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="XOA"
          autoComplete="off"
        />
      </label>
      {state === "failed" && <p className="me__consentErr">Không gửi được yêu cầu. Thử lại.</p>}
      <div className="me__deleteRow">
        <Button onClick={() => { setArmed(false); setTyped(""); }}>Huỷ</Button>
        <Button
          tone="danger"
          disabled={typed.trim().toUpperCase() !== "XOA" || state === "busy"}
          onClick={() => {
            setState("busy");
            void api
              .deleteAccount()
              .then(() => setState("done"))
              .catch(() => setState("failed"));
          }}
        >
          Xoá vĩnh viễn
        </Button>
      </div>
    </>
  );
}
