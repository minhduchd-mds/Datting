import { useCallback, useEffect, useRef, useState } from "react";

export interface Deferred {
  /** photoId hoặc reportId — dùng để ẩn mục khỏi hàng đợi ngay lập tức. */
  key: string;
  /** Câu hiển thị trên thanh hoàn tác. */
  label: string;
  /** Gửi thật lên server. Chỉ chạy khi hết cửa sổ hoàn tác. */
  commit: () => Promise<void>;
}

/**
 * Hoãn gửi quyết định trong một cửa sổ ngắn để còn hoàn tác được.
 *
 * Vì sao HOÃN GỬI chứ không gửi ngay rồi bù trừ bằng một request ngược lại:
 *
 * Ở tốc độ ~10 giây một ảnh, bấm nhầm là chuyện chắc chắn xảy ra, không phải
 * rủi ro. Hai cách chữa:
 *
 *   (a) Gửi ngay, hoàn tác = gửi thêm một request đảo ngược.
 *       Nhược điểm: quyết định SAI đã kịp có hiệu lực. Ảnh đã bị chặn thì đã
 *       biến mất khỏi hồ sơ; tài khoản đã bị khoá thì người đó đã bị đăng xuất.
 *       Bù trừ được về mặt dữ liệu, nhưng hậu quả bên ngoài thì không rút lại.
 *
 *   (b) Hoãn vài giây rồi mới gửi. Trong cửa sổ đó chưa có gì xảy ra thật.
 *       Nhược điểm: mất tối đa `windowMs` thông lượng, và phải cẩn thận khi
 *       người dùng đóng tab.
 *
 * Chọn (b). Với hàng đợi CHẶN đăng ký, sai một nhịp còn hơn sai một quyết định:
 * mất 6 giây là mất 6 giây, còn chặn nhầm một người là mất luôn người đó.
 *
 * Xử lý đóng tab: `beforeunload` gửi hết phần đang treo. Không có nó, quyết
 * định đã bấm sẽ bốc hơi và ảnh quay lại hàng đợi ở lần đăng nhập sau.
 */
export function useDeferredDecisions(windowMs = 6000) {
  // Nguồn sự thật là ref, KHÔNG phải state.
  //
  // `undo()` phải trả về ngay mục vừa rút để chỗ gọi khôi phục con trỏ hàng đợi.
  // Nếu chỉ dùng `setPending(list => ...)` thì updater chạy ở lần render SAU,
  // nên đọc kết quả ngay sau lệnh gọi luôn ra rỗng. State ở đây chỉ là bản sao
  // để React vẽ lại.
  const ref = useRef<Deferred[]>([]);
  const [pending, setPending] = useState<Deferred[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const sync = useCallback(() => setPending([...ref.current]), []);

  const fire = useCallback(
    (d: Deferred) => {
      timers.current.delete(d.key);
      ref.current = ref.current.filter((x) => x.key !== d.key);
      sync();
      void d.commit().catch((err) => {
        console.error(`Gửi quyết định thất bại cho ${d.key}`, err);
      });
    },
    [sync],
  );

  const submit = useCallback(
    (d: Deferred) => {
      ref.current = [...ref.current, d];
      sync();
      timers.current.set(
        d.key,
        setTimeout(() => fire(d), windowMs),
      );
    },
    [fire, sync, windowMs],
  );

  /** Rút lại quyết định gần nhất. Trả về mục vừa rút, hoặc null nếu không có. */
  const undo = useCallback((): Deferred | null => {
    const taken = ref.current[ref.current.length - 1];
    if (!taken) return null;

    const t = timers.current.get(taken.key);
    if (t !== undefined) {
      clearTimeout(t);
      timers.current.delete(taken.key);
    }
    ref.current = ref.current.slice(0, -1);
    sync();
    return taken;
  }, [sync]);

  // Đóng tab / rời trang: gửi hết ngay, đừng để quyết định bốc hơi.
  useEffect(() => {
    function flushAll() {
      for (const [key, t] of timers.current) {
        clearTimeout(t);
        timers.current.delete(key);
      }
      const list = ref.current;
      ref.current = [];
      for (const d of list) void d.commit();
      sync();
    }
    window.addEventListener("beforeunload", flushAll);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      flushAll();
    };
  }, [sync]);

  const pendingKeys = new Set(pending.map((d) => d.key));
  return { pending, pendingKeys, submit, undo };
}
