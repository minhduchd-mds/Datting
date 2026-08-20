import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import { Button, Switch } from "@datting/ui-web/primitives";

import { profileScore, type ScoreItem } from "@datting/core";

import { Icon } from "../icons.js";
import {
  api,
  type LinkPlatform, type MyPhoto, type ProfileEdit, type ProfileLink,
} from "../api.js";
import type { Profile } from "../data/profiles.js";

/**
 * Hồ sơ của chính mình.
 *
 * Điểm chất lượng hồ sơ tính ở CLIENT, và điều đó là TẠM: `PRODUCTION_AUDIT`
 * §2.7 ghi rõ nó nên do server tính và có phiên bản, để mọi client cho ra cùng
 * một con số và để A/B test được. Công thức để lộ ra chứ không giấu trong một
 * hàm — người dùng cần thấy làm gì thì điểm tăng, không phải một con số bí ẩn.
 */

/** Nhãn người đọc cho từng hạng mục điểm. Khớp `ScoreItem["key"]` của core. */
const ITEM_LABEL: Record<ScoreItem["key"], string> = {
  photos: "Thêm ảnh",
  interests: "Thêm sở thích",
  bio: "Viết giới thiệu",
  intent: "Cho biết đang tìm gì",
  prompts: "Trả lời câu hỏi mở",
  verified: "Xác minh ảnh thật",
};

export function Me() {
  const [me, setMe] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<MyPhoto[]>([]);

  /**
   * MỘT nguồn dữ liệu cho cả trang.
   *
   * Trước đây bản xem trước, điểm số và ô sửa mỗi thứ đọc một nơi — bản xem
   * trước còn đọc một hằng số CỨNG trong file này, nên sửa hồ sơ xong nó vẫn
   * hiện dữ liệu cũ. Nạp một lần ở đây rồi truyền xuống thì ba chỗ không thể
   * lệch nhau.
   */
  const reload = () => {
    void api.fetchMyProfile().then(setMe).catch(() => undefined);
    void api.fetchMyPhotos().then(setPhotos).catch(() => undefined);
  };
  useEffect(reload, []);

  // Ảnh CHỜ DUYỆT chưa tính điểm: nó chưa hiển thị công khai nên chưa giúp gì
  // cho việc người khác hiểu mình. Đếm đúng thứ đang có tác dụng.
  const daDuyet = photos.filter((p) => p.moderation === 1).length;

  const { score, items } = profileScore({
    photos: daDuyet,
    interests: me?.interests ?? [],
    bio: me?.bio ?? "",
    intent: me?.intent ?? "",
    prompts: me?.prompts.length ?? 0,
    verified: me?.verified ?? false,
  });

  return (
    <>
      <header className="disc__head">
        <div>
          <h1 className="disc__title">Hồ sơ của bạn</h1>
          <p className="disc__sub">Bên trái là đúng thứ người khác nhìn thấy. Sửa bên phải, thấy đổi ngay.</p>
        </div>
      </header>

      {/*
        Bố cục HAI CỘT, và đó là toàn bộ ý tưởng của bản thiết kế lại.

        Bản cũ là sáu hộp trắng giống hệt nhau xếp dọc — đọc ra như trang cài
        đặt chứ không phải hồ sơ. Nhưng trên app hẹn hò, hồ sơ CHÍNH LÀ sản
        phẩm: thứ duy nhất một người lạ dùng để quyết định.
        Nên cột trái là tấm thẻ thật, dựng bằng ĐÚNG các class của thẻ ở màn Đề
        xuất — không phải bản mô phỏng gần giống, mà cùng một CSS.
      */}
      <div className="me2">
        <div className="me2__left">
          <MyCard me={me} photos={photos} />
          <ScorePanel score={score} items={items} />
        </div>

        <div className="me2__right">
          <MyPhotos onChange={reload} />
          <EditProfile me={me} onSaved={reload} />
          <MyLinks />


        <section className="me__section">
          <h2 className="pf__sectionTitle">Hiển thị</h2>
          <Row label="Hiện khoảng cách trên hồ sơ" note="Tắt thì chỉ hiện tên khu vực, không hiện số km." />
          <Row label="Cho phép người khác giới thiệu mình" note="Bạn vẫn duyệt từng lời giới thiệu trước khi nó hiện ra." />
          <p className="me__pending">Hai công tắc này chưa nối vào server.</p>
        </section>

          <section className="me__section">
            <h2 className="pf__sectionTitle">Xoá tài khoản</h2>
            <DeleteAccount />
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * Tấm thẻ của chính mình, dựng bằng ĐÚNG các class của thẻ ở màn Đề xuất.
 *
 * Không phải một bản mô phỏng gần giống — cùng `.card`, `.card__scrim`,
 * `.card__info`, `.card__topic`. Nhờ vậy nó không thể trôi khỏi thứ người khác
 * thật sự nhìn thấy: đổi CSS của thẻ là đổi luôn ở đây.
 *
 * Ảnh lấy tấm ĐÃ DUYỆT đầu tiên. Nếu chưa có tấm nào duyệt xong thì nói thẳng,
 * vì đó chính là điều đang xảy ra với người khác: họ không thấy gì.
 */
function MyCard({ me, photos }: { me: Profile | null; photos: MyPhoto[] }) {
  const anh = photos.find((p) => p.moderation === 1);
  const cho = photos.filter((p) => p.moderation === 0).length;

  return (
    <section className="me2__preview">
      <div className="me2__previewTop">
        <span className="me2__previewLabel">Người khác nhìn thấy</span>
      </div>

      <article className="card me2__card">
        {anh ? (
          <img className="card__img" src={anh.cdn_key} alt="" />
        ) : (
          <div className="me2__noPhoto">
            <Icon name="upload" size={26} />
            <span>Chưa có ảnh nào được duyệt</span>
            {cho > 0 && <span className="me2__noPhotoSub">{cho} ảnh đang chờ duyệt</span>}
          </div>
        )}
        <span className="card__scrim" />
        <div className="card__info">
          <h2 className="card__name">
            {me ? `${me.name}, ${me.age}` : "…"}
          </h2>
          <p className="card__job">
            {me ? [me.jobTitle, me.community].filter(Boolean).join(" · ") : ""}
          </p>
          <div className="card__topics">
            {(me?.interests ?? []).slice(0, 4).map((t) => (
              <span key={t} className="card__topic">{t}</span>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}

/**
 * Điểm chất lượng, kèm ĐƯỜNG TỚI 100.
 *
 * ─── Vì sao là đường tới 100 chứ không phải lịch sử điểm ──────────────────
 * Biểu đồ lịch sử cần một bảng lưu điểm theo thời gian — chưa có — và với người
 * dùng mới nó chỉ có đúng một điểm, tức một biểu đồ đường không có đường nào.
 *
 * Đường tới 100 dùng dữ liệu ĐANG CÓ và trả lời câu hỏi người ta thật sự hỏi
 * khi nhìn con số này: "làm gì thì lên bao nhiêu". Mỗi bậc là một việc còn
 * thiếu, chiều cao bậc là số điểm việc đó cho.
 */
function ScorePanel({ score, items }: { score: number; items: ScoreItem[] }) {
  const conThieu = items.filter((i) => !i.done);

  return (
    <section className="me__section">
      <div className="me__scoreTop">
        <span className="pf__sectionTitle">Chất lượng hồ sơ</span>
        <strong className="me__scoreVal">{score}%</strong>
      </div>

      <PathChart score={score} steps={conThieu} />

      {conThieu.length === 0 ? (
        <p className="me__rowNote">Hồ sơ đã đầy đủ. Không còn gì cần thêm.</p>
      ) : (
        <ul className="me__todo">
          {conThieu.map((t) => (
            <li key={t.key} className="me__todoItem">
              <Icon name="chevron-right" size={14} />
              <span className="dw-sr-only">Chưa xong: </span>
              <span>
                {ITEM_LABEL[t.key]}
                {t.need > 1 && <span className="me__have"> {t.have}/{t.need}</span>}
              </span>
              <span className="me__points">+{t.points}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Biểu đồ đường bậc thang: từ điểm hiện tại lên 100.
 *
 * Vẽ tay bằng SVG chứ không kéo thư viện biểu đồ: ở đây chỉ có một đường và vài
 * điểm mốc, mà một thư viện biểu đồ là hàng chục KB cộng một mô hình dữ liệu
 * riêng phải học. Khi nào cần trục thời gian, chú giải và tương tác thì hãy tính.
 */
function PathChart({ score, steps }: { score: number; steps: ScoreItem[] }) {
  const W = 320;
  const H = 96;
  const PAD = 8;

  // Mốc đầu là điểm hiện tại; mỗi bậc cộng thêm điểm của một việc. Kẹp ở 100 vì
  // tổng lý thuyết là 105 — không kẹp thì đường vẽ vọt khỏi khung.
  const moc: number[] = [score];
  for (const s of steps) moc.push(Math.min(100, moc[moc.length - 1]! + s.points));

  const x = (i: number) => PAD + (i / Math.max(1, moc.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / 100) * (H - PAD * 2);

  // Đường BẬC THANG chứ không phải đường cong: điểm không tăng dần đều theo thời
  // gian, nó nhảy một nấc khi làm xong một việc. Đường cong sẽ ngụ ý sai.
  const d = moc
    .map((v, i) => (i === 0 ? `M ${x(0)} ${y(v)}` : `L ${x(i)} ${y(moc[i - 1]!)} L ${x(i)} ${y(v)}`))
    .join(" ");

  return (
    <figure className="path">
      <svg
        className="path__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          steps.length === 0
            ? `Điểm hồ sơ ${score} phần trăm, đã đầy đủ.`
            : `Đường tới 100 phần trăm: hiện ${score}, còn ${steps.length} việc — ${steps
                .map((s) => `${ITEM_LABEL[s.key]} cộng ${s.points}`)
                .join(", ")}.`
        }
      >
        {/* Mốc 100 — cái đích, vẽ mờ để không tranh với đường. */}
        <line x1={PAD} y1={y(100)} x2={W - PAD} y2={y(100)}
              stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
        <text x={W - PAD} y={y(100) - 5} textAnchor="end"
              fontSize="10" fill="var(--fg-dim)">100%</text>

        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* Điểm HIỆN TẠI đặc, các mốc sau rỗng: phân biệt "đang ở đây" với
            "sẽ tới đây nếu làm". */}
        {moc.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === 0 ? 4 : 3}
                  fill={i === 0 ? "var(--accent)" : "var(--panel)"}
                  stroke="var(--accent)" strokeWidth="2" />
        ))}
      </svg>
    </figure>
  );
}

/** Nhãn cho `photos.moderation`. Người dùng phải THẤY ảnh mình đang ở đâu. */
const MOD_LABEL = ["Đang chờ duyệt", "Đã duyệt", "Đã làm mờ", "Đã gỡ"] as const;

/**
 * Thư viện ảnh của tôi.
 *
 * ─── Ảnh mới LUÔN vào trạng thái chờ duyệt ────────────────────────────────
 * Và giao diện phải nói ra điều đó. Duyệt ảnh là ràng buộc CHẶN của sản phẩm:
 * ảnh chưa duyệt không hiển thị công khai. Một nút tải ảnh im lặng khiến người
 * dùng tưởng ảnh đã lên — rồi họ không hiểu vì sao chẳng ai thấy.
 *
 * KHÔNG hứa thời gian duyệt. Đội kiểm duyệt là một người, hàng đợi xếp theo mức
 * nghiêm trọng chứ không theo thứ tự tới — mọi con số cụ thể viết ở đây đều sai.
 */
function MyPhotos({ onChange }: { onChange: () => void }) {
  const [photos, setPhotos] = useState<MyPhoto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  const reload = () => {
    void api.fetchMyPhotos().then(setPhotos).catch(() => setPhotos([]));
    // Báo lên cha: thêm hay xoá ảnh làm ĐỔI ĐIỂM và đổi cả bản xem trước bên
    // trái. Không báo thì hai chỗ đó vẫn hiện số cũ cho tới lần tải trang sau.
    onChange();
  };
  useEffect(reload, []);

  const day = photos ?? [];
  const conCho = 6 - day.length;

  return (
    <section className="me__section">
      <div className="me__row">
        <div>
          <h2 className="pf__sectionTitle">Thư viện ảnh</h2>
          <div className="me__rowNote">
            Tối đa 6 ảnh. Ảnh mới cần được duyệt trước khi người khác nhìn thấy.
          </div>
        </div>
      </div>

      <div className="shots">
        {day.map((p) => (
          <figure key={p.position} className="shot">
            <img className="shot__img" src={p.cdn_key} alt={`Ảnh ${p.position + 1} của bạn`} />
            {/* Hai tín hiệu cho ảnh chưa duyệt: chữ VÀ làm mờ ảnh. Chỉ một nhãn
                nhỏ thì rất dễ lướt qua. */}
            {p.moderation !== 1 && <span className="shot__state">{MOD_LABEL[p.moderation]}</span>}
            <button
              type="button"
              className="shot__del"
              aria-label={`Xoá ảnh ${p.position + 1}`}
              onClick={() => {
                void api.deletePhoto(p.position).then(reload).catch(() => undefined);
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </figure>
        ))}

        {conCho > 0 && (
          <button
            type="button"
            className="shot shot--add"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" size={22} />
            <span>{busy ? "Đang tải…" : "Thêm ảnh"}</span>
            <span className="shot__slots">còn {conCho} chỗ</span>
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="dw-sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // để chọn lại CÙNG một tệp vẫn kích hoạt onChange
          if (!f) return;
          setErr("");
          setBusy(true);
          void api
            .uploadPhoto(f)
            .then(reload)
            .catch((x: unknown) => setErr(x instanceof Error ? x.message : "Tải lên không thành công."))
            .finally(() => setBusy(false));
        }}
      />

      {err !== "" && <p className="me__consentErr" role="status">{err}</p>}
    </section>
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
function EditProfile({ me, onSaved }: { me: Profile | null; onSaved: () => void }) {
  const [form, setForm] = useState<ProfileEdit | null>(null);
  const [goc, setGoc] = useState<ProfileEdit | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "failed">("idle");

  // Nhận hồ sơ TỪ CHA, không tự nạp: cả trang chỉ có một lượt gọi và một bản
  // dữ liệu, nên bản xem trước bên trái và ô sửa bên phải không thể lệch nhau.
  useEffect(() => {
    if (!me) return;
    const v: ProfileEdit = {
      bio: me.bio, jobTitle: me.jobTitle, community: me.community,
      interests: me.interests, lifestyle: me.lifestyle, intent: me.intent,
    };
    setForm(v);
    setGoc(v);
  }, [me]);

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
      {/* Icon bút CẠNH tiêu đề, không phải một nút riêng ở đâu đó: nó nói "mục
          này sửa được", đúng chỗ mắt đang nhìn. Nó cũng là nút thật — bấm là
          đưa tiêu điểm vào ô đầu tiên, nên người dùng bàn phím không phải Tab
          qua cả màn để tới chỗ sửa. */}
      <h2 className="pf__sectionTitle me__editHead">
        Thông tin hồ sơ
        <button
          type="button"
          className="me__editBtn"
          aria-label="Chỉnh sửa hồ sơ"
          onClick={() => {
            const el = document.querySelector<HTMLTextAreaElement>(".me__input--area");
            el?.focus();
            el?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
        >
          <Icon name="edit" size={16} />
        </button>
      </h2>

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
              .then(() => { setGoc(form); setState("saved"); onSaved(); })
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

/*
 * Component `Consent` đã XOÁ khỏi file này cùng lúc gỡ mục NĐ13 (20/08/2026).
 *
 * Giữ lại một component không ai gọi thì `tsc` đỏ, và mã chết luôn trôi khỏi
 * thực tế. Phần đắt tiền vẫn còn nguyên và dùng lại được ngay:
 *   · bảng `consents` trong `0001_init.sql` (purpose, granted, policy_version)
 *   · `POST /v1/me/consents` trong message-service — ghi THÊM hàng, không ghi
 *     đè, nên vẫn chứng minh được đã đồng ý hay rút vào lúc nào
 *   · `api.setConsent()` và `POLICY_VERSION` trong `apps/web/src/api.ts`
 *
 * Dựng lại giao diện là viết một khối `<Switch>` gọi `api.setConsent`.
 */

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
