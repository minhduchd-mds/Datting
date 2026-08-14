/**
 * Babel — cố ý ngắn. Mỗi dòng thêm vào đây là một dòng có thể sai.
 *
 * Hai loại "plugin" hay bị lẫn:
 *
 *   - `expo.plugins` trong app.json = CONFIG PLUGIN, chạy lúc `expo prebuild`
 *     để sửa native project (Info.plist, AndroidManifest…).
 *   - `plugins` ở file này = BABEL PLUGIN, chạy lúc biên dịch từng file JS.
 *
 * `react-native-reanimated/plugin` từng bị đặt nhầm vào app.json. Nó là loại
 * thứ hai. Nhưng đừng vội chuyển nó xuống đây — với SDK 57 thì KHÔNG cần:
 *
 *   // babel-preset-expo/build/configs/expo.js
 *   if (options.worklets !== false && options.reanimated !== false) {
 *     const p = resolveModule(api, 'react-native-worklets/plugin');
 *     if (p) plugins.push([require(p)]);
 *   }
 *
 * Preset tự dò `react-native-worklets` và tự thêm plugin, đúng vị trí cuối
 * pipeline. Tự khai báo lại trong `plugins` của file này còn TỆ HƠN không khai
 * báo: `plugins` chạy TRƯỚC plugin do preset chèn, nên worklet bị xử lý sai thứ
 * tự. Và truyền `{ reanimated: false }` thì chính điều kiện trên thành false —
 * tắt luôn cơ chế tự động. Reanimated 4 tách worklet ra package riêng nên tên
 * đúng là `react-native-worklets/plugin`, không còn `react-native-reanimated/plugin`.
 *
 * Triệu chứng khi sai: app VẪN chạy, không ném lỗi nào, chỉ có mọi hàm
 * "worklet" âm thầm rơi về JS thread và animation vuốt thẻ giật.
 *
 * `babel-preset-expo` được khai báo tường minh trong devDependencies của
 * apps/mobile. Nó là dependency của `expo`, nhưng npm LỒNG nó vào
 * node_modules/expo/node_modules/ (vì cụm deps của nó đụng bản đã hoist ở root:
 * hermes-parser 0.36.1 vs 0.36.0, @babel/preset-typescript 7.29.7 vs 7.27.1).
 * Babel resolve preset theo vị trí file config này, nên chỗ lồng đó là vô hình.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
