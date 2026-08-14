/**
 * Cổng tuổi. Màn hình đầu tiên, trước cả đăng nhập.
 *
 * Đặt sau đăng nhập là sai thứ tự về pháp lý: lúc đó đã thu thập SĐT của người
 * có thể dưới 18 tuổi rồi.
 *
 * Sau khi qua cổng, KHÔNG điều hướng thẳng tới màn kế. Hỏi `nextRoute()` để
 * `stageOf()` tự quyết định — luật điều hướng chỉ được sống ở MỘT chỗ. Nếu màn
 * này tự biết "kế tiếp là sign-in", thì mỗi lần luồng đổi phải sửa N chỗ, và
 * chỗ bị quên sẽ là chỗ gãy.
 *
 * (Bản trước bật về `"/"` cho `app/index.tsx` phân xử. Cách đó vẫn đúng ở nhóm
 * `(auth)` nhưng gãy ở `(onboarding)` — `/` là đường dẫn mơ hồ, xem `STAGE_ROUTE`.)
 */
import { router } from "expo-router";

import { AgeGateScreen } from "../../src/screens/AuthScreens";
import { nextRoute, session } from "../../src/session";

export default function AgeGate() {
  return (
    <AgeGateScreen
      onPass={(birthDate) => {
        session.passAgeGate(birthDate);
        router.replace(nextRoute() as never);
      }}
    />
  );
}
