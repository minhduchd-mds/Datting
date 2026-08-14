/**
 * Onboarding 4 bước.
 *
 * Bước vị trí trong luồng này tạo ra DỮ LIỆU NHẠY CẢM theo NĐ13/2023, nên
 * `locationGranted` không chỉ là một boolean UI — nó phải sinh ra một bản ghi
 * đồng ý có mốc thời gian và phiên bản chính sách, ở cả client lẫn server.
 *
 * Ghi lên server là `void` có chủ ý: người dùng không nên bị chặn ở màn
 * onboarding vì mạng chập chờn. Nhưng bản ghi client thì ghi NGAY và đồng bộ —
 * nếu chỉ tin vào lần gọi mạng, mất mạng đồng nghĩa mất bằng chứng đồng ý.
 */
import { router } from "expo-router";

import { api } from "../../src/api";
import { OnboardingFlow } from "../../src/screens/OnboardingScreens";
import { CONSENT_PURPOSE, POLICY_VERSION, nextRoute, session } from "../../src/session";

export default function Onboarding() {
  return (
    <OnboardingFlow
      onDone={(d) => {
        session.setConsent(CONSENT_PURPOSE.LOCATION, d.locationGranted);
        void api
          .setConsent(CONSENT_PURPOSE.LOCATION, d.locationGranted, POLICY_VERSION)
          .catch(() => {
            // Nuốt lỗi mạng nhưng KHÔNG nuốt sự kiện: bản ghi client vẫn còn,
            // và lần gọi API kế tiếp sẽ đẩy lại (xem app/(tabs)/_layout.tsx).
          });

        // TODO(hồ sơ): d.displayName / d.photos / d.interests cần PUT lên
        // /v1/profiles/me. Endpoint đó chưa có — xem ENDPOINTS trong src/api.ts.
        session.finishOnboarding();
        router.replace(nextRoute() as never);
      }}
    />
  );
}
