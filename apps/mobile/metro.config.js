// Cấu hình Metro cho monorepo.
//
// Hai dòng quan trọng nhất:
//   watchFolders  → Metro theo dõi packages/core, nên sửa @datting/core là app
//                   reload ngay, không cần build lại.
//   nodeModulesPaths → cho phép hoisting ở gốc workspace.
//
// LƯU Ý VỀ WORKLET: các hàm trong @datting/core có chỉ thị "worklet" (cardRotation,
// stampOpacity) chỉ hoạt động trên UI thread khi Metro TRANSFORM MÃ NGUỒN của
// chúng. Vì @datting/core trỏ thẳng vào ./src/index.ts (không phải dist), babel
// plugin của Reanimated xử lý được. Nếu đổi sang dùng bản build, phải thêm
// packages/core vào danh sách file được plugin xử lý.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// ĐỪNG bật `disableHierarchicalLookup`. Tài liệu monorepo của Expo có gợi ý nó,
// nhưng gợi ý đó giả định cây node_modules được hoist PHẲNG hoàn toàn. Cây của
// npm ở đây KHÔNG phẳng, và không thể phẳng:
//
//   1. `expo-asset`, `expo-file-system`, `expo-keep-awake`, `@expo/ui` đều
//      peer-depend ngược lại vào `expo`, trong khi `expo` lại depend vào chúng.
//      Vòng lặp peer này npm chỉ giải được bằng cách LỒNG chúng vào
//      node_modules/expo/.
//   2. `expo-modules-core` khai báo peer `react-native-worklets` trần ^0.10.0,
//      nhưng Reanimated 4.5.3 bắt buộc 0.11.4. Metadata thượng nguồn bị lệch,
//      npm không đặt được ở gốc nên lồng xuống.
//
// Bật cờ đó ⇒ Metro CHỈ tìm trong hai đường dẫn trên và không bao giờ nhìn vào
// thư mục lồng ⇒ "Unable to resolve module expo-modules-core from
// node_modules/expo/src/Expo.ts". Lỗi này KHÔNG hiện ra khi chạy `tsc`; nó chỉ
// nổ lúc Metro bundle, tức là sau khi đã xếp hàng 15 phút trên EAS Build.
//
// Tra cứu phân cấp là đúng ở đây: nó tìm bản lồng khi có, và vẫn dùng bản ở gốc
// khi không có. Đã kiểm: react + mọi native module chỉ có ĐÚNG MỘT bản trong lock.

// ---------------------------------------------------------------------------
// Cầu nối ESM: `./motion.js` → `./motion.ts`
//
// `packages/core` là ESM thật (`"type": "module"`, `moduleResolution: NodeNext`),
// nên trong mã nguồn TS nó BẮT BUỘC phải viết `export * from "./motion.js"`.
// Node ESM không tự thêm đuôi; bỏ `.js` đi là `node --test dist/...` gãy ngay.
//
// Nhưng Metro đọc thẳng `./src/index.ts` (xem ghi chú worklet ở đầu file) nên nó
// đi tìm đúng chữ `motion.js` — một file không tồn tại trong `src/`.
//
// Hai bên đều đúng theo tiêu chuẩn của mình; chỗ phải nhượng bộ là Metro. Chỉ
// can thiệp trên NHÁNH LỖI: đường dẫn tương đối `.js` nào giải được thì giữ
// nguyên, giải không được mới thử lại với `.ts`/`.tsx`. Happy path không tốn gì.
//
// Cách khác là trỏ @datting/core vào `dist/`, nhưng khi đó babel plugin của
// Reanimated không còn thấy mã nguồn ⇒ các hàm "worklet" (cardRotation,
// stampOpacity) tụt về JS thread và thẻ vuốt khựng — mất nhiều hơn được.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const stem = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, moduleName, platform);
    } catch {
      for (const ext of [".ts", ".tsx"]) {
        try {
          return context.resolveRequest(context, stem + ext, platform);
        } catch {
          /* thử đuôi tiếp theo */
        }
      }
      throw new Error(
        `Không giải được "${moduleName}" (đã thử cả .ts/.tsx) từ ${context.originModulePath}`,
      );
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
