/**
 * Điểm vào. Không vẽ gì — chỉ chuyển hướng theo trạng thái phiên.
 *
 * Toàn bộ luật điều hướng khởi động nằm ở `stageOf()` trong src/session.ts, một
 * hàm THUẦN TUÝ. Rải điều kiện `if (!token) router.replace(...)` khắp các màn là
 * cách chắc chắn nhất để có hai màn cùng chuyển hướng lẫn nhau và app treo trong
 * vòng lặp.
 *
 * Dùng `<Redirect>` chứ không `router.replace()` trong useEffect: effect chạy
 * SAU khi cây điều hướng gắn xong, nên sẽ loé một frame màn trắng. `<Redirect>`
 * xử lý ngay trong lúc render.
 */
import { Redirect } from "expo-router";

import { stageOf, useSession, type SessionStage } from "../src/session";

const ROUTE: Record<SessionStage, string> = {
  "age-gate": "/(auth)/age-gate",
  "sign-in": "/(auth)/sign-in",
  onboarding: "/(onboarding)",
  preferences: "/(onboarding)/preferences",
  verify: "/(onboarding)/verify",
  ready: "/(tabs)",
};

export default function Index() {
  const state = useSession();
  return <Redirect href={ROUTE[stageOf(state)] as never} />;
}
