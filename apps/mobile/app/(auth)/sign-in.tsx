/**
 * Đăng nhập bằng SĐT + OTP. Không mật khẩu, không email, không login MXH.
 *
 * Thêm bất kỳ login MXH nào (Google/Facebook) ⇒ App Store 4.8 BẮT BUỘC phải có
 * "Sign in with Apple" ngang hàng. Đó là một quyết định sản phẩm, không phải
 * một dòng code — đừng thêm vì tiện.
 *
 * `onVerifyOtp` trả về boolean chứ không ném lỗi: mã sai là kết quả BÌNH THƯỜNG
 * của luồng này, không phải sự cố. Ném exception cho một nhánh dự kiến sẽ khiến
 * mọi lớp gọi phía trên phải bọc try/catch chỉ để xử lý "người dùng gõ nhầm".
 */
import { router } from "expo-router";

import { api } from "../../src/api";
import { SignInScreen } from "../../src/screens/AuthScreens";
import { nextRoute, session } from "../../src/session";

export default function SignIn() {
  return (
    <SignInScreen
      onRequestOtp={(phone) => api.requestOtp(phone)}
      onVerifyOtp={async (phone, code) => {
        const r = await api.verifyOtp(phone, code);
        if (!r) return false;
        session.signIn(r.userId, r.token);
        router.replace(nextRoute() as never);
        return true;
      }}
    />
  );
}
