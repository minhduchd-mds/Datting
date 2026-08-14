/**
 * Điểm vào. Không vẽ gì — chỉ chuyển hướng theo trạng thái phiên.
 *
 * Toàn bộ luật điều hướng khởi động nằm ở `stageOf()` + `STAGE_ROUTE` trong
 * src/session.ts. Rải điều kiện `if (!token) router.replace(...)` khắp các màn
 * là cách chắc chắn nhất để có hai màn cùng chuyển hướng lẫn nhau và app treo
 * trong vòng lặp.
 *
 * Đây là file DUY NHẤT được phép nằm ở đường dẫn `/`. Dấu ngoặc là route group
 * nên không tính vào URL — một `index.tsx` đặt trong `(onboarding)` hay `(tabs)`
 * sẽ đòi cùng đường dẫn này và biến mọi lệnh `router.replace("/")` thành trò
 * may rủi. Vì vậy hai màn đó tên là `profile.tsx` và `discover.tsx`; ghi chú
 * đầy đủ ở `STAGE_ROUTE` (src/session.ts). Các màn khác điều hướng bằng
 * `nextRoute()`, không bao giờ bằng đường dẫn viết tay.
 *
 * Dùng `<Redirect>` chứ không `router.replace()` trong useEffect: effect chạy
 * SAU khi cây điều hướng gắn xong, nên sẽ loé một frame màn trắng. `<Redirect>`
 * xử lý ngay trong lúc render.
 */
import { Redirect } from "expo-router";

import { STAGE_ROUTE, stageOf, useSession } from "../src/session";

export default function Index() {
  const state = useSession();
  return <Redirect href={STAGE_ROUTE[stageOf(state)] as never} />;
}
