import type { DerivedQueues } from "../api.js";
import { formatHours, formatPercent } from "../labels.js";

interface Props {
  derived: DerivedQueues;
  totalPhotosPending: number;
}

/**
 * Bảng số liệu tồn đọng.
 *
 * Con số quan trọng nhất ở đây là "trần đăng ký", và nó không phải chỉ số để
 * ngắm. Duyệt ảnh là CHẶN, nên tốc độ duyệt của một người chính là tốc độ tối
 * đa sản phẩm nhận được người dùng mới. Nếu quảng cáo kéo về nhanh hơn con số
 * này thì hàng đợi phình vô hạn và người mới bỏ đi vì hồ sơ chưa lên.
 */
export function BacklogStats({ derived, totalPhotosPending }: Props) {
  const { photoQueue, reportQueue, forecast, mlAbsorbedRatio } = derived;
  const drowning = forecast.daysToDrain > 1;

  return (
    <section className="stats" aria-label="Số liệu tồn đọng">
      <Stat
        label="Ảnh cần mắt người"
        value={String(photoQueue.length)}
        hint={`ML gánh ${formatPercent(mlAbsorbedRatio)} của ${totalPhotosPending} ảnh chờ`}
      />
      <Stat label="Báo cáo đang mở" value={String(reportQueue.length)} hint="xếp theo mức nghiêm trọng" />
      <Stat
        label="Trần đăng ký"
        value={`${Math.round(forecast.profilesPerHour)} hồ sơ/giờ`}
        hint="tốc độ tối đa nhận người mới"
      />
      <Stat
        label="Dọn hết cần"
        value={formatHours(forecast.hoursToDrain)}
        hint={`≈ ${forecast.daysToDrain.toFixed(1)} ngày làm việc`}
        tone={drowning ? "warn" : undefined}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn";
}) {
  return (
    <div className={`stat${tone === "warn" ? " stat--warn" : ""}`}>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
      <div className="stat__hint">{hint}</div>
    </div>
  );
}
