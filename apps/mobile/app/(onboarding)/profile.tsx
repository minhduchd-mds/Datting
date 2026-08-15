/**
 * Onboarding 4 bước.
 *
 * Bước vị trí trong luồng này tạo ra DỮ LIỆU NHẠY CẢM theo NĐ13/2023, nên
 * `locationGranted` không chỉ là một boolean UI — nó phải sinh ra một bản ghi
 * đồng ý có mốc thời gian và phiên bản chính sách, ở cả client lẫn server.
 */
import { router } from "expo-router";

import { api } from "../../src/api";
import { profileStore } from "../../src/profileStore";
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
            // Bản ghi client vẫn còn. Khi profile-service có sync queue, thao tác
            // đồng ý này sẽ được đẩy lại cùng các thay đổi hồ sơ đang chờ.
          });

        // Profile-service chưa có PUT /v1/profiles/me. Lưu bản nháp cục bộ để
        // Profile Hub/Edit Profile dùng ngay; đây KHÔNG phải nguồn sự thật server.
        profileStore.save({
          displayName: d.displayName,
          jobTitle: d.jobTitle,
          community: d.community,
          bio: d.bio,
          interests: d.interests,
          intent: d.intent,
          photos: d.photos,
          prompts: [],
        });

        session.finishOnboarding();
        router.replace(nextRoute() as never);
      }}
    />
  );
}
