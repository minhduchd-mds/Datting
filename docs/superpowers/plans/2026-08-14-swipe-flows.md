# Luồng vuốt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vuốt trái/phải không còn làm thoát app, và hoàn thiện năm luồng còn dang dở trên màn deck: super-like, xem hồ sơ, báo cáo/chặn, hoàn tác, offline/hết lượt.

**Architecture:** Ba lớp. (1) `@datting/core` giữ mọi quyết định thuần tuý — cổng "bấm back hai lần", điều kiện hoàn tác, bảng mã lý do báo cáo — nên chúng chạy được với `node --test` và dùng lại được ở backend. (2) `SwipeDeck` đổi từ *uncontrolled* sang *controlled*: `index` do màn `discover` giữ, nhờ vậy hoàn tác và tải lại deck đều chỉ là đổi một con số. (3) Hàng đợi vuốt (`swipeQueue.ts`) mọc thêm một **cửa sổ hoãn** cho `pass`, còn `like`/`superlike` vẫn gửi ngay và hoàn tác bằng một endpoint mới ở match-service.

**Tech Stack:** React Native 0.86 (New Arch, Hermes) · Expo SDK 57 · expo-router 57 · Reanimated 4.5 + react-native-worklets 0.11 · gesture-handler 2.32 · MMKV 3.3 · TypeScript 5.9 strict · `node --test` cho logic thuần · match-service trên `node:http` không framework.

## Global Constraints

Mọi task đều nằm dưới các ràng buộc này. Không task nào được phép vi phạm.

- **`packages/core` là logic THUẦN TUÝ.** Không `react`, không `react-native`, không I/O. Import nội bộ phải có đuôi `.js` (ESM thật) — `node --test dist/...` gãy ngay nếu bỏ đuôi.
- **Metro đọc thẳng `packages/core/src/*.ts`**, không đọc `dist/`. File mới thêm vào core tự động dùng được ở app, không cần build. Đừng trỏ `@datting/core` sang `dist/`.
- **Mọi con số hiệu ứng đến từ `@datting/core`.** Không `withTiming(300)` viết tay. Cử chỉ dùng `withSpring`, không dùng `withTiming`.
- **`apps/mobile/android/` và `apps/mobile/ios/` nằm trong `.gitignore`** — là artifact của `expo prebuild`. **Không sửa tay file native.** Mọi cấu hình Android phải đi qua `app.json`.
- **KHÔNG bật `android.predictiveBackGestureEnabled`** trong `app.json`. Predictive back thay `BackHandler` bằng `OnBackInvokedCallback`, và Task 2 dựa hoàn toàn vào `BackHandler`.
- **KHÔNG thêm dependency mới.** `netinfo`/`expo-network` bị cấm: `apps/mobile` đã dính hai lần lỗi npm lồng bản thứ hai của native module (`react 19.2.0`, `react-native-screens ~4.16`). Dùng `AppState` có sẵn trong React Native.
- **`pairKey` chỉ có một biểu diễn `min:max`**, so sánh bằng `BigInt`, không bằng chuỗi.
- **Đừng viết UI hứa thời gian duyệt cụ thể.** Không có câu nào kiểu "dưới 1 phút".
- **Copy tiếng Việt**, giọng như phần còn lại của app.
- **`npm install` chạy ở ROOT**, không chạy trong từng package.
- Lệnh xác minh dùng suốt plan:
  - `npm -w @datting/core test`
  - `npm -w @datting/match-service test`
  - `npm -w @datting/mobile run typecheck`
  - `cd apps/mobile && npx expo export --platform android` — **`tsc --noEmit` xanh KHÔNG chứng minh Metro bundle được**; chỉ lệnh này mới chứng minh.

---

## Cấu trúc file

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `packages/core/src/backGate.ts` | Cổng "bấm back lần nữa để thoát". Thuần tuý, có test. |
| `packages/core/src/swipe.ts` | Điều kiện hoàn tác một lượt vuốt. Thuần tuý, có test. |
| `apps/mobile/src/useBackToExit.ts` | Nối `backGate` vào `BackHandler` của React Native. |
| `apps/mobile/src/components/UndoBar.tsx` | Thanh "Hoàn tác" có đếm ngược. |
| `apps/mobile/app/profile/[userId].tsx` | Màn hồ sơ đầy đủ. |
| `db/migrations/0002_report_reason_scam.sql` | Thêm mã lý do 6 (lừa đảo) + CHECK chặn trôi mã. |

**Sửa**

| File | Vì sao |
|---|---|
| `packages/core/src/index.ts` | Re-export hai file core mới. |
| `packages/core/src/moderation.ts` | Thêm `REPORT_REASON.SCAM` + trọng số nghiêm trọng. |
| `packages/core/test/core.test.ts` | Test cho `backGate` + `swipe`. |
| `packages/core/test/moderation.test.ts` | Test mã lý do báo cáo không còn ra `NaN`. |
| `apps/mobile/src/components/SwipeDeck.tsx` | Controlled index · thoát vùng cử chỉ hệ thống · haptic vào worklet · super-like · chạm mở hồ sơ. |
| `apps/mobile/app/(tabs)/discover.tsx` | Giữ `index` · back-to-exit · hoàn tác · báo cáo · offline. |
| `apps/mobile/src/swipeQueue.ts` | Cửa sổ hoãn cho `pass` + `undoLast`. |
| `apps/mobile/src/api.ts` | `fetchProfile` + `undoSwipe`. |
| `apps/mobile/src/screens/SocialScreens.tsx` | `REPORT_REASONS` gõ kiểu theo `ReportReason`. |
| `apps/mobile/app/_layout.tsx` | Khai `profile/[userId]` với `gestureEnabled: true`. |
| `apps/admin/src/labels.ts` | Nhãn cho mã lý do mới (nếu thiếu, `tsc` sẽ đỏ). |
| `services/match-service/src/mutualLike.ts` | `undoSwipe()` + Lua. |
| `services/match-service/src/server.ts` | `POST /v1/swipe/undo`. |

**Thứ tự phụ thuộc:** T1→T2→T3 (chặn thoát app, độc lập với phần còn lại) · T4, T5 (sửa vòng vuốt lõi; T5 chặn T6, T13) · T6, T7, T8→T9 (các luồng độc lập nhau) · T10→T11→T12→T13 (hoàn tác, theo đúng thứ tự) · T14 (cuối).

---

## Task 1: Cổng "bấm back lần nữa để thoát" (logic thuần)

**Files:**
- Create: `packages/core/src/backGate.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/core.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `createBackToExitGate(windowMs?: number): BackToExitGate` với `BackToExitGate = { press(nowMs: number): "warn" | "exit"; reset(): void }`. Task 2 dùng.

- [ ] **Step 1: Viết test cho hành vi cổng**

Chèn vào cuối `packages/core/test/core.test.ts`. Thêm một dòng `import` MỚI ở đầu file (không gộp vào import của `motion.js`):

```ts
import { createBackToExitGate } from "../src/backGate.js";
```

Rồi chèn các test:

```ts
/* ===========================================================================
 * Cổng thoát app — bấm back một lần chỉ cảnh báo, bấm lần nữa mới thoát.
 * =========================================================================== */

test("lần bấm đầu tiên chỉ cảnh báo, không thoát", () => {
  const g = createBackToExitGate(2000);
  assert.equal(g.press(1_000), "warn");
});

test("bấm lần hai trong cửa sổ thì thoát", () => {
  const g = createBackToExitGate(2000);
  assert.equal(g.press(1_000), "warn");
  assert.equal(g.press(2_500), "exit");
});

test("bấm lần hai QUÁ muộn thì cảnh báo lại, không thoát", () => {
  const g = createBackToExitGate(2000);
  assert.equal(g.press(1_000), "warn");
  assert.equal(g.press(4_000), "warn", "quá 2 giây phải nạp lại từ đầu");
});

test("sau khi thoát thì cổng nạp lại — lần bấm kế tiếp là cảnh báo", () => {
  const g = createBackToExitGate(2000);
  g.press(1_000);
  assert.equal(g.press(1_500), "exit");
  assert.equal(g.press(1_600), "warn", "không được thoát hai lần liên tiếp");
});

test("reset() huỷ cảnh báo đang treo", () => {
  const g = createBackToExitGate(2000);
  assert.equal(g.press(1_000), "warn");
  g.reset();
  assert.equal(g.press(1_500), "warn", "rời màn rồi quay lại phải bấm lại từ đầu");
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó ĐỎ**

```bash
npm -w @datting/core test
```

Kỳ vọng: FAIL — `Cannot find module '../src/backGate.js'`.

- [ ] **Step 3: Viết cài đặt tối thiểu**

Tạo `packages/core/src/backGate.ts`:

```ts
/**
 * Cổng "bấm back lần nữa để thoát".
 *
 * Vì sao cần: màn deck là gốc của cây điều hướng (app/index.tsx dùng
 * `<Redirect>`, tức là `replace`, nên không có gì để quay lại). Back ở đó rơi
 * thẳng xuống Android và app đóng. Người dùng vuốt thẻ ở sát mép màn hình rất
 * dễ chạm nhầm cử chỉ back của hệ thống — và mất luôn cả phiên.
 *
 * Vì sao logic nằm ở đây chứ không nằm trong component: nó là một máy trạng
 * thái nhỏ có biên thời gian, tức là đúng loại thứ mà test bắt được lỗi còn mắt
 * người thì không. Component chỉ còn việc nối nó vào `BackHandler`.
 *
 * Trả "warn" hay "exit" chứ KHÔNG tự gọi hàm thoát: package này thuần tuý,
 * không biết `BackHandler` là gì, và người gọi mới là người quyết định "thoát"
 * nghĩa là gì trên nền tảng của họ.
 */
export interface BackToExitGate {
  /** Ghi nhận một lần bấm back. `nowMs` do người gọi truyền vào để test được. */
  press(nowMs: number): "warn" | "exit";
  /** Huỷ cảnh báo đang treo — gọi khi màn hình mất focus. */
  reset(): void;
}

/** 2 giây: đủ đọc xong toast, chưa đủ để quên là mình vừa bấm gì. */
export const BACK_TO_EXIT_WINDOW_MS = 2000;

export function createBackToExitGate(
  windowMs: number = BACK_TO_EXIT_WINDOW_MS,
): BackToExitGate {
  let warnedAt = -Infinity;
  return {
    press(nowMs: number): "warn" | "exit" {
      if (nowMs - warnedAt <= windowMs) {
        // Nạp lại NGAY: nếu không, lần bấm thứ ba cũng ra "exit" và người dùng
        // quay lại app rồi bấm back một cái là bay ra lần nữa.
        warnedAt = -Infinity;
        return "exit";
      }
      warnedAt = nowMs;
      return "warn";
    },
    reset(): void {
      warnedAt = -Infinity;
    },
  };
}
```

- [ ] **Step 4: Re-export từ core**

Trong `packages/core/src/index.ts`, thêm dòng dưới `export * from "./motion.js";`:

```ts
export * from "./backGate.js";
```

- [ ] **Step 5: Chạy test để xác nhận XANH**

```bash
npm -w @datting/core test
```

Kỳ vọng: PASS, tổng số test tăng thêm 5.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/backGate.ts packages/core/src/index.ts packages/core/test/core.test.ts
git commit -m "feat(core): cổng bấm back hai lần để thoát"
```

---

## Task 2: Nối cổng vào màn deck — back không còn giết app

**Files:**
- Create: `apps/mobile/src/useBackToExit.ts`
- Modify: `apps/mobile/app/(tabs)/discover.tsx`

**Interfaces:**
- Consumes: `createBackToExitGate` (Task 1). `Toast` từ `src/components/Feedback.tsx` — chữ ký: `{ kind, message, visible, onDismiss, actionLabel?, onAction? }`.
- Produces: `useBackToExit(onWarn: () => void): void`. Không task nào khác dùng.

- [ ] **Step 1: Viết hook**

Tạo `apps/mobile/src/useBackToExit.ts`:

```ts
/**
 * Chặn Back ở màn gốc: lần đầu cảnh báo, lần thứ hai mới cho thoát.
 *
 * ─── Vì sao trả `false` chứ không gọi `BackHandler.exitApp()` ─────────────
 * Trả `false` nghĩa là "tôi không xử lý", và Android làm đúng việc mặc định của
 * nó — kết thúc activity theo đúng cách của hệ điều hành, kể cả khi người dùng
 * đến đây bằng cử chỉ vuốt mép chứ không bằng nút. `exitApp()` là một lệnh giết
 * tiến trình từ phía app; nó bỏ qua vòng đời và không phải thứ nên dùng cho
 * thao tác back bình thường.
 *
 * ─── Vì sao `useFocusEffect` chứ không `useEffect` ───────────────────────
 * `BackHandler` là một NGĂN XẾP toàn cục. Handler trả `true` sẽ nuốt back của
 * MỌI màn đang mở, kể cả màn chat nằm trên nó. Đăng ký theo focus thì handler
 * chỉ sống đúng lúc màn này đang hiển thị.
 *
 * `useFocusEffect` được expo-router re-export. Nếu import gãy sau khi nâng cấp,
 * lấy từ `@react-navigation/native` (phụ thuộc bắc cầu của expo-router) —
 * KHÔNG hạ xuống `useEffect`, xem lý do ở trên.
 */
import { useCallback, useMemo } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import { createBackToExitGate } from "@datting/core";

export function useBackToExit(onWarn: () => void): void {
  const gate = useMemo(() => createBackToExitGate(), []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (gate.press(Date.now()) === "exit") return false;
        onWarn();
        return true;
      });
      return () => {
        // Rời màn phải nạp lại cổng. Không nạp lại thì người dùng bấm back ở
        // deck (cảnh báo), sang tab khác, quay lại, bấm back — và thoát ngay.
        gate.reset();
        sub.remove();
      };
    }, [gate, onWarn]),
  );
}
```

- [ ] **Step 2: Nối vào màn deck**

Trong `apps/mobile/app/(tabs)/discover.tsx`, thêm import:

```ts
import { Toast } from "../../src/components/Feedback";
import { useBackToExit } from "../../src/useBackToExit";
```

Thêm state và hook, ngay sau `const loadingMore = useRef(false);`:

```ts
  const [exitHint, setExitHint] = useState(false);
  useBackToExit(useCallback(() => setExitHint(true), []));
```

Thêm `<Toast>` vào trong `<View style={styles.root}>`, ngay sau thẻ `<SwipeDeck ... />`:

```tsx
      <Toast
        kind="info"
        message="Nhấn lần nữa để thoát"
        visible={exitHint}
        onDismiss={() => setExitHint(false)}
      />
```

- [ ] **Step 3: Kiểm kiểu**

```bash
npm -w @datting/mobile run typecheck
```

Kỳ vọng: PASS, không lỗi.

- [ ] **Step 4: Xác minh trên máy Android thật**

```bash
cd apps/mobile && npx expo run:android
```

Kỳ vọng — ba điều, kiểm lần lượt:
1. Ở tab Khám phá, bấm nút Back → hiện toast "Nhấn lần nữa để thoát", app **không** đóng.
2. Bấm Back lần nữa trong 2 giây → app đóng.
3. Bắt đầu kéo thẻ từ sát **mép trái** màn hình → nếu vẫn thấy toast xuất hiện, tức là hệ điều hành đang nuốt cử chỉ (đúng như chẩn đoán). App không còn thoát nữa, nhưng cú vuốt vẫn bị mất — Task 3 chữa phần đó.

Ghi lại kết quả bước 3 vào phần mô tả commit: nó là bằng chứng cho chẩn đoán ở Task 3.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/useBackToExit.ts "apps/mobile/app/(tabs)/discover.tsx"
git commit -m "fix(mobile): back ở deck không còn thoát app ngay lần bấm đầu"
```

---

## Task 3: Đưa thẻ ra khỏi vùng cử chỉ của hệ điều hành

**Files:**
- Modify: `apps/mobile/src/components/SwipeDeck.tsx:39-42` (hằng số), `:103-128` (cấu hình `Gesture.Pan`), `:273-281` (style `card`)

**Interfaces:**
- Consumes: không có.
- Produces: hằng số nội bộ `CARD_INSET = 24`. Không export.

**Bối cảnh:** thẻ hiện rộng `SCREEN_W - 32` ⇒ mép thẻ cách mép màn hình 16 px. Android dành 20–24 dp mỗi bên cho cử chỉ back và **nuốt chạm trước khi nó tới React Native** — không có API JS nào giành lại được. Cách duy nhất không đụng code native là để vùng kéo nằm ngoài dải đó.

- [ ] **Step 1: Nới lề thẻ và khai báo lý do**

Trong `apps/mobile/src/components/SwipeDeck.tsx`, thay khối hằng số ở dòng 39–42:

```ts
const { width: SCREEN_W } = Dimensions.get("window");
/**
 * Lề ngang của thẻ. 24 chứ không phải 16, và đây là con số AN TOÀN chứ không
 * phải con số thẩm mỹ.
 *
 * Android dành 20–24 dp mỗi mép cho cử chỉ back và nuốt chạm ở đó TRƯỚC KHI nó
 * tới React Native — `setSystemGestureExclusionRects` chỉ gọi được từ native,
 * mà `apps/mobile/android/` là artifact của prebuild nên không sửa tay được.
 * Nên cách chữa là đừng đặt vùng kéo vào chỗ đó.
 *
 * Người dùng chỉnh "độ nhạy back" lên mức cao nhất vẫn có thể chạm tới ~40 dp.
 * Trường hợp đó cử chỉ vẫn mất, nhưng app không chết nữa — xem useBackToExit.ts.
 */
const CARD_INSET = 24;
const SWIPE_THRESHOLD = SCREEN_W * 0.28;
const PREFETCH_WHEN_REMAINING = 8;
const FLING_VELOCITY = 800;
```

- [ ] **Step 2: Dùng hằng số mới trong style**

Trong `StyleSheet.create`, sửa `card`:

```ts
  card: {
    position: "absolute",
    top: 24,
    width: SCREEN_W - CARD_INSET * 2,
    height: "72%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
```

- [ ] **Step 3: Buộc cử chỉ phải đi được một quãng mới kích hoạt**

Sửa dòng khai báo `pan` (dòng 103) thành:

```ts
  const pan = Gesture.Pan()
    // Chạm phải đi được 8 px mới tính là kéo. Hai lý do: (1) chạm đứng yên còn
    // dành cho cử chỉ mở hồ sơ ở Task 7; (2) cú chạm run tay không làm thẻ
    // nhúc nhích rồi bật lại.
    .minDistance(8)
    .onUpdate((e) => {
```

Giữ nguyên toàn bộ phần thân `.onUpdate` và `.onEnd`.

- [ ] **Step 4: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck
```

Kỳ vọng: PASS.

```bash
cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: bundle thành công, không cảnh báo resolver.

- [ ] **Step 5: Xác minh bằng tay**

Chạy lại `npx expo run:android`. Kéo thẻ bắt đầu từ **mép trái của thẻ** (không phải mép màn hình): thẻ phải đi theo ngón tay, không xuất hiện toast "Nhấn lần nữa để thoát". Kéo bắt đầu từ **mép màn hình** (bên ngoài thẻ): vẫn là cử chỉ back của hệ thống — đó là hành vi đúng của Android, không phải lỗi.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/SwipeDeck.tsx
git commit -m "fix(mobile): thẻ vuốt lùi khỏi dải cử chỉ back của Android"
```

---

## Task 4: Cổng haptic chạy trên UI thread, không qua bridge mỗi frame

**Files:**
- Modify: `apps/mobile/src/components/SwipeDeck.tsx:9-12` (comment), `:76-94` (`advance`), `:96-109` (`feedbackCross` + `onUpdate`)

**Interfaces:**
- Consumes: `createThresholdHaptic` từ `src/motion/haptics.ts` (giữ nguyên, không đổi chữ ký).
- Produces: không có.

**Bối cảnh:** comment ở đầu file khẳng định "không có một lần đi qua JS bridge nào trong lúc kéo thẻ", nhưng dòng 108 gọi `runOnJS(feedbackCross)` trong `onUpdate` — tức 60–120 lần/giây. Đưa việc *phát hiện cạnh lên* vào worklet thì bridge chỉ bị chạm đúng lúc thẻ vượt ngưỡng.

- [ ] **Step 1: Thêm shared value nhớ trạng thái cổng**

Ngay dưới `const y = useSharedValue(0);` (dòng 74), thêm:

```ts
  // Cổng chống rung SỐNG TRÊN UI THREAD. `armed` là điều kiện cạnh lên: chỉ
  // bắn khi VỪA vượt ngưỡng, và phải kéo về dưới ngưỡng mới nạp lại.
  const armed = useSharedValue(true);
```

- [ ] **Step 2: Đổi `feedbackCross` thành hàm chỉ chạy ở cạnh lên**

Thay khối `feedbackCross` (dòng 96–101) bằng:

```ts
  // Chỉ được gọi từ worklet ở ĐÚNG khoảnh khắc vượt ngưỡng, không phải mỗi
  // frame. `createThresholdHaptic` vẫn giữ khoảng cách tối thiểu giữa hai lần
  // rung, phòng trường hợp ngón tay dao động qua lại quanh ngưỡng.
  const fireCrossHaptic = useCallback(() => {
    const now = Date.now();
    thresholdHaptic.update(true, now);
    thresholdHaptic.update(false, now);
  }, [thresholdHaptic]);
```

- [ ] **Step 3: Đổi `onUpdate` sang phát hiện cạnh trong worklet**

Thay thân `.onUpdate` (dòng 104–109) bằng:

```ts
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY;
      const crossed = Math.abs(e.translationX) > SWIPE_THRESHOLD;
      if (crossed && armed.value) {
        armed.value = false;
        runOnJS(fireCrossHaptic)();
      } else if (!crossed && !armed.value) {
        armed.value = true;
      }
    })
```

- [ ] **Step 4: Nạp lại cổng khi thẻ rời đi**

Trong `advance` (dòng 76–94), thay `thresholdHaptic.reset();` bằng hai dòng:

```ts
      thresholdHaptic.reset();
      armed.value = true;
```

và thêm `armed` vào mảng dependency của `useCallback` ở dòng 93:

```ts
    [cards, index, onSwipe, onNeedMore, x, y, armed, thresholdHaptic],
```

- [ ] **Step 5: Sửa comment đầu file cho khớp sự thật**

Ở dòng 9–12, thay đoạn "Không có một lần đi qua JS bridge nào trong lúc kéo thẻ" bằng:

```
 * 1. Cử chỉ chạy trên UI thread (worklet). Bridge chỉ bị chạm ĐÚNG MỘT LẦN mỗi
 *    lần thẻ vượt ngưỡng, để bắn haptic — phát hiện cạnh lên nằm trong worklet
 *    (`armed`), không nằm ở JS. Bản trước gọi `runOnJS` trong `onUpdate`, tức
 *    60–120 lần/giây, và comment này thì nói ngược lại.
```

- [ ] **Step 6: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck && cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 7: Xác minh bằng tay**

Kéo thẻ chậm qua lại quanh ngưỡng: rung đúng một lần mỗi lần vượt, không rung liên tục. Kéo nhanh hết cỡ: rung một lần rồi thẻ bay đi.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/SwipeDeck.tsx
git commit -m "perf(mobile): phát hiện vượt ngưỡng trong worklet, bỏ runOnJS mỗi frame"
```

---

## Task 5: `SwipeDeck` thành controlled — sửa luôn lỗi "Tải lại" không có tác dụng

**Files:**
- Modify: `apps/mobile/src/components/SwipeDeck.tsx:58-94` (props + `advance`), `:154-167` (dựng hình)
- Modify: `apps/mobile/app/(tabs)/discover.tsx`

**Interfaces:**
- Consumes: không có.
- Produces: `SwipeDeck` nhận thêm hai prop bắt buộc:
  - `index: number`
  - `onIndexChange: (next: number) => void`

  và **bỏ** `useState` nội bộ. Task 6 và Task 13 dựa vào hai prop này.

**Bối cảnh:** `index` đang nằm trong `SwipeDeck`. Khi `discover` gọi `load(false)` (nút "Tải lại" ở `EmptyState`, hoặc thử lại ở `ErrorState`), `cards` bị thay hoàn toàn nhưng `index` vẫn ở chỗ cũ — deck mới hiện ra đã cạn sẵn và nút trông như hỏng.

- [ ] **Step 1: Đổi props của `SwipeDeck`**

Thay interface `Props` (dòng 58–64):

```ts
interface Props {
  cards: Card[];
  /**
   * Vị trí thẻ trên cùng. NẰM Ở NGƯỜI GỌI, không nằm trong component.
   *
   * Bản trước giữ `index` bằng `useState` nội bộ, và điều đó âm thầm làm hỏng
   * mọi thứ thay `cards`: `load(false)` nạp deck mới nhưng index cũ ở lại, nên
   * nút "Tải lại" ở màn rỗng nạp về 20 thẻ rồi hiện lại đúng màn rỗng đó.
   * Đưa index ra ngoài cũng là điều kiện để có nút hoàn tác (Task 13).
   */
  index: number;
  onIndexChange: (next: number) => void;
  loading?: boolean;
  onSwipe: (card: Card, action: SwipeAction) => void;
  onNeedMore: () => void;
  onEmpty?: () => React.ReactNode;
}
```

- [ ] **Step 2: Bỏ state nội bộ, dùng prop**

Thay chữ ký hàm và dòng `useState` (dòng 66–68):

```ts
export function SwipeDeck({
  cards, index, onIndexChange, loading, onSwipe, onNeedMore, onEmpty,
}: Props) {
  const m = useMotionConfig();
  const prefetched = useRef(false);
```

Xoá hẳn `const [index, setIndex] = useState(0);`, và bỏ `useState` khỏi dòng import `react` nếu không còn chỗ nào trong file dùng nó.

- [ ] **Step 3: `advance` báo lên trên thay vì tự đặt state**

Trong `advance`, thay `setIndex(next);` bằng:

```ts
      onIndexChange(next);
```

và cập nhật mảng dependency ở cuối `useCallback`:

```ts
    [cards, index, onIndexChange, onSwipe, onNeedMore, x, y, armed, thresholdHaptic],
```

- [ ] **Step 4: `discover.tsx` giữ index và reset đúng chỗ**

Trong `apps/mobile/app/(tabs)/discover.tsx`, thêm state ngay dưới `const [cards, setCards] = useState<DeckCard[]>([]);`:

```ts
  const [index, setIndex] = useState(0);
```

Trong `load`, đặt lại index **chỉ khi thay deck**, không đặt khi nối thêm:

```ts
  const load = useCallback(async (append: boolean) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    if (!append) setLoading(true);
    try {
      const next = await api.fetchDeck(PAGE);
      setCards((cur) => (append ? [...cur, ...next] : next));
      // Deck MỚI thì con trỏ phải về 0. Không reset là lỗi cũ: "Tải lại" nạp
      // được 20 thẻ nhưng index vẫn ở 20 nên màn rỗng hiện lại y nguyên.
      if (!append) setIndex(0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      loadingMore.current = false;
    }
  }, []);
```

Truyền hai prop mới xuống:

```tsx
      <SwipeDeck
        cards={cards}
        index={index}
        onIndexChange={setIndex}
        loading={loading}
        onSwipe={onSwipe}
        onNeedMore={() => void load(true)}
        onEmpty={() => (
```

- [ ] **Step 5: Kiểm kiểu**

```bash
npm -w @datting/mobile run typecheck
```

Kỳ vọng: PASS. Nếu đỏ vì `SwipeDeck` thiếu prop, tức là còn chỗ gọi khác chưa sửa — `grep -rn "<SwipeDeck" apps/mobile` để tìm.

- [ ] **Step 6: Xác minh bằng tay**

Vuốt hết deck cho tới màn "Hết người phù hợp quanh đây" → bấm **Tải lại** → phải thấy thẻ mới. Trước khi sửa, nút này hiện lại đúng màn rỗng.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/SwipeDeck.tsx "apps/mobile/app/(tabs)/discover.tsx"
git commit -m "fix(mobile): index của deck do màn giữ — nút Tải lại hoạt động trở lại"
```

---

## Task 6: Super-like — vuốt lên và nút thứ ba

**Files:**
- Modify: `apps/mobile/src/components/SwipeDeck.tsx` (ngưỡng dọc, `.onEnd`, tem, hàng nút, styles)

**Interfaces:**
- Consumes: `index`/`onIndexChange` (Task 5). `SwipeAction` đã có sẵn `"superlike"`.
- Produces: không có API mới. `onSwipe(card, "superlike")` bắt đầu được gọi.

**Bối cảnh:** `y.value` đã được theo dõi và đưa vào transform nhưng chưa ai đọc — trục dọc dựng dở. `api.swipe` và `DemoApi` đều đã xử lý `"superlike"` (`action !== "pass"` mới tính match).

- [ ] **Step 1: Thêm ngưỡng dọc**

Sửa dòng khai `SCREEN_W` để lấy cả hai chiều trong MỘT khai báo (Task 3 đã đặt `CARD_INSET` ngay dưới nó):

```ts
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
```

Rồi thêm ngay dưới `const SWIPE_THRESHOLD = SCREEN_W * 0.28;`:

```ts
/**
 * Ngưỡng vuốt lên. Tính theo CHIỀU CAO màn hình, không theo chiều ngang: cùng
 * một quãng 100 px là "hơi nhích" theo chiều dọc nhưng đã là "quyết tâm" theo
 * chiều ngang trên màn điện thoại.
 *
 * 18% cao so với 28% rộng — mà màn cao gấp ~2 lần rộng, nên quãng tuyệt đối vẫn
 * xa hơn: super-like là thao tác báo cho người kia biết, không rút lại được về
 * mặt cảm xúc, nên phải khó chạm nhầm hơn "kết nối".
 */
const SUPERLIKE_THRESHOLD = SCREEN_H * 0.18;
```

- [ ] **Step 2: Xử lý trục dọc trong `.onEnd`**

Thay toàn bộ thân `.onEnd` bằng:

```ts
    .onEnd((e) => {
      const flungX = Math.abs(e.velocityX) > FLING_VELOCITY;
      const flungY = Math.abs(e.velocityY) > FLING_VELOCITY;
      const goUp = y.value < -SUPERLIKE_THRESHOLD || (flungY && e.velocityY < 0);
      const goRight = x.value > SWIPE_THRESHOLD || (flungX && e.velocityX > 0);
      const goLeft = x.value < -SWIPE_THRESHOLD || (flungX && e.velocityX < 0);

      // Trục nào ĐI XA HƠN thì trục đó thắng. Không có luật này thì một cú vuốt
      // chéo lên-phải vừa đủ cả hai ngưỡng sẽ ra kết quả tuỳ thứ tự viết if.
      const verticalWins = Math.abs(y.value) > Math.abs(x.value);

      if (goUp && verticalWins) {
        const target = -SCREEN_H * 1.2;
        const duration = flingDuration(e.velocityY, target - y.value);
        y.value = withTiming(target, { duration }, () => {
          runOnJS(advance)("superlike");
        });
        return;
      }

      if (goRight || goLeft) {
        const target = (goRight ? 1 : -1) * SCREEN_W * 1.5;
        const duration = flingDuration(e.velocityX, target - x.value);
        x.value = withTiming(target, { duration }, () => {
          runOnJS(advance)(goRight ? "like" : "pass");
        });
        return;
      }

      x.value = withSpring(0, m.spring("card"));
      y.value = withSpring(0, m.spring("card"));
    });
```

- [ ] **Step 3: Thêm tem "ĐẶC BIỆT"**

Sau `passStyle` (khoảng dòng 150), thêm:

```ts
  const superStyle = useAnimatedStyle(() => ({
    // Dùng lại `stampOpacity` với trục y: hàm nhận một quãng CÓ DẤU và một
    // ngưỡng, nó không quan tâm đó là trục nào. Hướng -1 vì vuốt lên là y âm.
    opacity: stampOpacity(y.value, SUPERLIKE_THRESHOLD, -1),
  }));
```

Trong JSX, sau tem "BỎ QUA":

```tsx
          <Animated.View style={[styles.stamp, styles.stampSuper, superStyle]}>
            <Text style={styles.stampText}>ĐẶC BIỆT</Text>
          </Animated.View>
```

Trong `StyleSheet.create`, sau `stampPass`:

```ts
  // Tem này nằm GIỮA và KHÔNG xoay: hai tem kia nghiêng vì thẻ nghiêng theo
  // trục ngang; vuốt lên thì thẻ không xoay nên tem nghiêng sẽ trông như lỗi.
  stampSuper: { alignSelf: "center", borderColor: "#38bdf8" },
```

- [ ] **Step 4: Thêm nút thứ ba**

Thay khối `<View style={styles.actions}>` và dòng `hint` bằng:

```tsx
      {/* Ba nút, và nút giữa vẫn là "Kết nối" — không phải super-like. Nút to
          nhất ở chính giữa là nút ngón tay cái tìm thấy khi không nhìn, nên nó
          phải là thao tác dùng nhiều nhất, không phải thao tác hiếm nhất. */}
      <View style={styles.actions}>
        <ActionButton icon="✕" label="Bỏ qua" onPress={() => { void haptic.light(); advance("pass"); }} />
        <ActionButton icon="♥" label="Kết nối" primary onPress={() => { void haptic.medium(); advance("like"); }} />
        <ActionButton icon="★" label="Thích đặc biệt" onPress={() => { void haptic.medium(); advance("superlike"); }} />
      </View>

      <Text style={styles.hint}>Vuốt trái để bỏ qua, phải để kết nối, lên để thích đặc biệt</Text>
```

- [ ] **Step 5: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck && cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 6: Xác minh bằng tay**

Vuốt lên → tem "ĐẶC BIỆT" hiện dần, thẻ bay lên. Vuốt chéo lên-phải nhưng lệch nhiều về phải → ra "Kết nối", không ra super-like. Bấm nút ★ → thẻ đi, đôi khi hiện màn ăn mừng (demo cho ~22%).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/SwipeDeck.tsx
git commit -m "feat(mobile): super-like bằng vuốt lên và nút thứ ba"
```

---

## Task 7: Xem hồ sơ — chạm vào thẻ, và vá lỗ trợ năng

**Files:**
- Create: `apps/mobile/app/profile/[userId].tsx`
- Modify: `apps/mobile/src/api.ts` (interface `Api`, `HttpApi`, `DemoApi`)
- Modify: `apps/mobile/src/components/SwipeDeck.tsx` (prop `onOpenProfile`, cử chỉ chạm, `onAccessibilityAction`)
- Modify: `apps/mobile/app/(tabs)/discover.tsx` (điều hướng)
- Modify: `apps/mobile/app/_layout.tsx` (bật cử chỉ vuốt-để-quay-lại)

**Interfaces:**
- Consumes: `Card` từ `SwipeDeck`.
- Produces:
  - `api.fetchProfile(userId: string): Promise<Card | null>`
  - `SwipeDeck` nhận thêm prop `onOpenProfile: (card: Card) => void`
  - Route `/profile/[userId]`

**Bối cảnh:** `SwipeDeck.tsx:180-183` khai `accessibilityActions` gồm `{ name: "activate", label: "Xem hồ sơ" }` nhưng **không có `onAccessibilityAction`** — TalkBack đọc ra một hành động không tồn tại. Chạm vào thẻ cũng không làm gì.

- [ ] **Step 1: Thêm `fetchProfile` vào hợp đồng API**

Trong `apps/mobile/src/api.ts`, thêm vào `interface Api` (sau `fetchDeck`):

```ts
  /**
   * Hồ sơ đầy đủ của MỘT người. Dùng chung endpoint lô `/v1/profiles` với một
   * phần tử: server đã có sẵn, và giữ một đường vào thì cổng chặn "ảnh chưa
   * duyệt không hiển thị công khai" cũng chỉ có một chỗ để sai.
   */
  fetchProfile(userId: string): Promise<Card | null>;
```

Trong `class HttpApi`, sau `fetchDeck`:

```ts
  async fetchProfile(userId: string): Promise<Card | null> {
    const r = await this.call<{ profiles: ProfileDto[] }>(ENDPOINTS.profiles, {
      method: "POST",
      body: JSON.stringify({ user_ids: [userId] }),
    });
    const p = r.profiles[0];
    if (!p) return null;
    return {
      userId: p.user_id,
      name: p.name,
      age: p.age,
      community: p.community,
      photoUrl: p.photo_url,
      topics: p.topics,
    };
  }
```

Trong `class DemoApi`, sau `fetchDeck`:

```ts
  async fetchProfile(userId: string): Promise<Card | null> {
    await sleep(200);
    return this.issued.get(userId) ?? null;
  }
```

- [ ] **Step 2: Chuyển `top`/`behind` lên trước khối cử chỉ**

`tap` cần nhìn thấy `top`, nhưng `const top = cards[index];` đang nằm ở dòng ~156, sau các hook. Chuyển hai dòng này lên ngay dưới `const armed = useSharedValue(true);`:

```ts
  const top = cards[index];
  const behind = cards[index + 1];
```

Giữ nguyên hai nhánh `if (loading) return …` và `if (!top) return …` ở vị trí cũ — chúng vẫn phải nằm sau toàn bộ hook.

- [ ] **Step 3: Thêm cử chỉ chạm và nối hành động trợ năng**

Thêm `onOpenProfile` vào `interface Props` và vào destructure của hàm:

```ts
  onOpenProfile: (card: Card) => void;
```

Ngay dưới định nghĩa `pan`, thêm:

```ts
  // `Exclusive` chứ không `Race`: pan có `minDistance(8)` nên chạm đứng yên
  // không kích hoạt nó, còn `Race` sẽ để cái nào xong trước thắng — kéo nhanh
  // rồi nhả trong vòng 250 ms sẽ mở nhầm màn hồ sơ giữa lúc thẻ đang bay.
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (success && top) runOnJS(onOpenProfile)(top);
    });
  const gesture = Gesture.Exclusive(pan, tap);
```

Đổi thẻ `<GestureDetector>`:

```tsx
      <GestureDetector gesture={gesture}>
```

Thêm handler trợ năng vào `<Animated.View>` bên trong nó, ngay sau `accessibilityActions`:

```tsx
          onAccessibilityAction={(e) => {
            // Không có handler này thì TalkBack đọc ra hai hành động rồi không
            // làm gì cả khi người dùng chọn — tệ hơn là không khai gì.
            if (e.nativeEvent.actionName === "activate") onOpenProfile(top);
            if (e.nativeEvent.actionName === "magicTap") { void haptic.medium(); advance("like"); }
          }}
```

- [ ] **Step 4: Viết màn hồ sơ**

Tạo `apps/mobile/app/profile/[userId].tsx`:

```tsx
/**
 * Hồ sơ đầy đủ của một người trong deck.
 *
 * ─── Vì sao là một ROUTE chứ không phải một modal trong SwipeDeck ─────────
 * Vì nó phải mở được bằng deep link (`datting://profile/1234`) — thông báo và
 * chia sẻ đều cần điều đó — và vì thẻ vuốt đang giữ trạng thái cử chỉ, nhét
 * thêm một lớp hiển thị vào đó là cách chắc chắn nhất để một cú vuốt trên màn
 * hồ sơ đi xuyên xuống thẻ bên dưới.
 *
 * Tên file KHÔNG nằm trong route group và KHÔNG phải `index` — xem ghi chú dài
 * ở `STAGE_ROUTE` (src/session.ts) về hai cái bẫy của Expo Router.
 */
import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../../src/api";
import type { Card } from "../../src/components/SwipeDeck";
import { PressableScale, Skeleton } from "../../src/components/Feedback";
import { ErrorState } from "../../src/screens/SocialScreens";

export default function Profile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    api
      .fetchProfile(userId)
      .then((c) => {
        if (!alive) return;
        setCard(c);
        // `null` = hồ sơ không còn hiển thị được (bị chặn, đã xoá, ảnh chưa
        // duyệt). Đó là câu trả lời hợp lệ, không phải sự cố — nhưng với người
        // dùng thì cả hai đều là "không xem được", nên dùng chung một màn.
        setState(c ? "ready" : "failed");
      })
      .catch(() => alive && setState("failed"));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (state === "failed") {
    return <ErrorState onRetry={() => router.back()} />;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {state === "loading" || !card ? (
        <>
          <Skeleton width="100%" height={460} radius={20} />
          <View style={{ gap: 10, marginTop: 16 }}>
            <Skeleton width="50%" height={26} />
            <Skeleton width="35%" height={16} />
          </View>
        </>
      ) : (
        <>
          <Image source={{ uri: card.photoUrl }} style={styles.photo} resizeMode="cover" />
          <Text style={styles.name}>
            {card.name}, {card.age}
          </Text>
          <Text style={styles.community}>{card.community}</Text>

          <Text style={styles.section}>Quan tâm</Text>
          <View style={styles.topics}>
            {card.topics.map((t) => (
              <View key={t} style={styles.topic}>
                <Text style={styles.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <PressableScale
        style={styles.back}
        onPress={() => router.back()}
        hapticOnPress="light"
        accessibilityLabel="Quay lại deck"
      >
        <Text style={styles.backText}>Quay lại</Text>
      </PressableScale>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d0d10" },
  content: { padding: 16, paddingBottom: 48 },
  photo: { width: "100%", height: 460, borderRadius: 20, backgroundColor: "#1a1a1a" },
  name: { color: "#fff", fontSize: 26, fontWeight: "700", marginTop: 16 },
  community: { color: "rgba(255,255,255,.7)", fontSize: 14, marginTop: 4 },
  section: { color: "#8b949e", fontSize: 13, marginTop: 24, marginBottom: 8 },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  topic: {
    backgroundColor: "rgba(255,255,255,.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  topicText: { color: "#fff", fontSize: 13 },
  back: {
    marginTop: 28,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#30363d",
  },
  backText: { color: "#e6edf3", fontWeight: "600" },
});
```

- [ ] **Step 5: Cho phép vuốt-để-quay-lại ở màn hồ sơ**

Trong `apps/mobile/app/_layout.tsx`, thêm ngay dưới dòng khai `chat/[matchId]`:

```tsx
          {/* Cùng lý do với màn chat: đây là màn ĐỌC, quay lại không làm mất
              trạng thái nào. Các nhóm (auth)/(onboarding) vẫn tắt cử chỉ. */}
          <Stack.Screen name="profile/[userId]" options={{ gestureEnabled: true }} />
```

- [ ] **Step 6: Nối điều hướng ở màn deck**

Trong `apps/mobile/app/(tabs)/discover.tsx`, thêm prop vào `<SwipeDeck>`:

```tsx
        onOpenProfile={(card) =>
          router.push({
            pathname: "/profile/[userId]",
            params: { userId: card.userId },
          } as never)
        }
```

- [ ] **Step 7: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck && cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 8: Xác minh bằng tay, gồm cả TalkBack**

1. Chạm nhanh vào thẻ → mở màn hồ sơ. Kéo thẻ rồi nhả → **không** mở màn hồ sơ.
2. Bật TalkBack, chọn thẻ, mở menu hành động → chọn "Xem hồ sơ" → phải mở màn hồ sơ (trước khi sửa: không có gì xảy ra).
3. Ở màn hồ sơ, vuốt từ mép trái → quay lại deck.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/app/profile apps/mobile/src/api.ts apps/mobile/src/components/SwipeDeck.tsx "apps/mobile/app/(tabs)/discover.tsx" apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): màn hồ sơ mở bằng chạm và bằng hành động trợ năng"
```

---

## Task 8: Sửa mã lý do báo cáo — hiện tại nó cho ra `NaN`

**Files:**
- Modify: `packages/core/src/moderation.ts:108-160`
- Modify: `apps/mobile/src/screens/SocialScreens.tsx:231-238`, và nhánh `reason === 6` ở `:279`
- Modify: `apps/admin/src/labels.ts`
- Create: `db/migrations/0002_report_reason_scam.sql`
- Test: `packages/core/test/moderation.test.ts`

**Interfaces:**
- Consumes: `REPORT_REASON`, `SEVERITY_WEIGHT`, `reportPriority` (đã có).
- Produces: `REPORT_REASON.SCAM = 6`. Task 9 dùng danh sách lý do đã sửa.

**Bối cảnh — đây là lỗi dữ liệu thật, không phải dọn dẹp:**

| Nguồn | Mã 5 | Mã 6 |
|---|---|---|
| `db/migrations/0001_init.sql:157` | khác | *(không tồn tại)* |
| `packages/core/src/moderation.ts:114` | `OTHER` | *(không tồn tại)* |
| `apps/mobile/.../SocialScreens.tsx:236-237` | **"Lừa đảo, xin tiền"** | **"Lý do khác"** |

Hệ quả: app gửi `reason: 6` cho mọi báo cáo "Lý do khác" ⇒ `SEVERITY_WEIGHT[6]` là `undefined` ⇒ `reportPriority` (moderation.ts:214) trả **`NaN`** ⇒ báo cáo đó xếp ở vị trí không xác định trong hàng đợi của **người kiểm duyệt duy nhất**. Task 9 sắp đổ thêm báo cáo từ deck vào đúng đường này, nên phải sửa trước.

- [ ] **Step 1: Viết test cho lỗi**

Chèn vào cuối `packages/core/test/moderation.test.ts` (thêm `SEVERITY_WEIGHT`, `REPORT_REASON`, `reportPriority` vào import nếu thiếu):

```ts
test("mọi mã lý do đều có trọng số — không mã nào cho ra NaN", () => {
  for (const code of Object.values(REPORT_REASON)) {
    const p = reportPriority(
      {
        reportId: "r1",
        reporterId: "1",
        reportedUserId: "2",
        reason: code,
        status: 0,
        createdAtMs: 0,
        distinctReportersAgainstTarget: 1,
      },
      0,
    );
    assert.ok(Number.isFinite(p), `reason=${code} cho ra ${p}`);
  }
});

test("lừa đảo xếp trên spam và trên 'khác'", () => {
  assert.ok(SEVERITY_WEIGHT[REPORT_REASON.SCAM] > SEVERITY_WEIGHT[REPORT_REASON.SPAM]);
  assert.ok(SEVERITY_WEIGHT[REPORT_REASON.SCAM] > SEVERITY_WEIGHT[REPORT_REASON.OTHER]);
});

test("spam dù chờ bao lâu vẫn không vượt lừa đảo mới", () => {
  const base = {
    reportId: "r", reporterId: "1", reportedUserId: "2",
    status: 0 as const, distinctReportersAgainstTarget: 1,
  };
  const spamCu = reportPriority(
    { ...base, reason: REPORT_REASON.SPAM, createdAtMs: 0 },
    30 * 24 * 3_600_000,
  );
  const luaDaoMoi = reportPriority(
    { ...base, reason: REPORT_REASON.SCAM, createdAtMs: 0 },
    0,
  );
  assert.ok(luaDaoMoi > spamCu, "trần thâm niên phải giữ được thứ tự nghiêm trọng");
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó ĐỎ**

```bash
npm -w @datting/core test
```

Kỳ vọng: FAIL — `Property 'SCAM' does not exist` lúc biên dịch.

- [ ] **Step 3: Thêm mã 6 vào core**

Trong `packages/core/src/moderation.ts`, sửa `REPORT_REASON`:

```ts
/** KHỚP cột `reports.reason` trong 0001_init.sql + 0002. Đừng đổi số. */
export const REPORT_REASON = {
  SPAM: 1,
  HARASSMENT: 2,
  IMPERSONATION: 3,
  BAD_CONTENT: 4,
  OTHER: 5,
  /**
   * Lừa đảo, xin tiền. Thêm ở 0002 vì app đã gửi mã này từ trước khi nó tồn tại
   * — `SEVERITY_WEIGHT[6]` là `undefined` nên `reportPriority` trả NaN và báo
   * cáo rơi vào vị trí không xác định trong hàng đợi.
   */
  SCAM: 6,
} as const;
```

và `SEVERITY_WEIGHT`:

```ts
export const SEVERITY_WEIGHT: Record<ReportReason, number> = {
  [REPORT_REASON.HARASSMENT]: 100,   // an toàn thân thể/tinh thần — luôn trước
  [REPORT_REASON.SCAM]: 95,          // mất tiền, không lấy lại được; đi theo lô
  [REPORT_REASON.BAD_CONTENT]: 90,   // nội dung xấu — rủi ro pháp lý
  [REPORT_REASON.IMPERSONATION]: 60, // giả mạo — hại nạn nhân bên ngoài app
  [REPORT_REASON.OTHER]: 40,         // chưa rõ ⇒ phải có người đọc mới biết
  [REPORT_REASON.SPAM]: 10,          // phiền, không nguy hiểm; gom lô được
};
```

- [ ] **Step 4: Chạy test để xác nhận XANH**

```bash
npm -w @datting/core test
```

Kỳ vọng: PASS.

- [ ] **Step 5: Sửa danh sách trong app, và gõ kiểu để nó không trôi lại**

Trong `apps/mobile/src/screens/SocialScreens.tsx`, thêm import:

```ts
import { REPORT_REASON, type ReportReason } from "@datting/core";
```

Thay `REPORT_REASONS`:

```ts
/**
 * Nhãn cho từng mã lý do.
 *
 * Kiểu là `Record<ReportReason, string>` chứ không phải một mảng tự do: thiếu
 * một mã hoặc bịa thêm một mã đều thành lỗi biên dịch. Đó chính là cái đã trôi
 * mất một lần — app từng gửi mã 6 cho "Lý do khác" trong khi database hiểu 5 là
 * "khác" và không biết 6 là gì, nên hàm xếp hàng đợi trả về NaN.
 */
const REPORT_LABEL: Record<ReportReason, string> = {
  [REPORT_REASON.SPAM]: "Spam hoặc quảng cáo",
  [REPORT_REASON.HARASSMENT]: "Quấy rối, xúc phạm",
  [REPORT_REASON.IMPERSONATION]: "Hồ sơ giả mạo / không phải người thật",
  [REPORT_REASON.BAD_CONTENT]: "Nội dung nhạy cảm, không phù hợp",
  [REPORT_REASON.SCAM]: "Lừa đảo, xin tiền",
  [REPORT_REASON.OTHER]: "Lý do khác",
};

/** Thứ tự HIỂN THỊ — nặng trước, "khác" cuối cùng. Không phải thứ tự mã số. */
export const REPORT_REASONS: readonly { code: ReportReason; label: string }[] = [
  REPORT_REASON.HARASSMENT,
  REPORT_REASON.SCAM,
  REPORT_REASON.BAD_CONTENT,
  REPORT_REASON.IMPERSONATION,
  REPORT_REASON.SPAM,
  REPORT_REASON.OTHER,
].map((code) => ({ code, label: REPORT_LABEL[code] }));
```

Trong `ReportBlockSheet`, nhánh hiện ô nhập chi tiết đang so `reason === 6`. Sửa thành:

```tsx
      {reason === REPORT_REASON.OTHER && (
```

- [ ] **Step 6: Thêm nhãn ở console kiểm duyệt**

`npm -w @datting/admin run typecheck` sẽ đỏ ở `apps/admin/src/labels.ts` vì `Record<ReportReason, …>` thiếu key. Thêm vào `REASON_LABEL`:

```ts
  [REPORT_REASON.SCAM]: "Lừa đảo",
```

và vào `REASON_TONE`:

```ts
  [REPORT_REASON.SCAM]: "high",
```

- [ ] **Step 7: Migration cho database**

Tạo `db/migrations/0002_report_reason_scam.sql`:

```sql
-- 0002 — thêm mã lý do 6 (lừa đảo) và chặn mã trôi thêm lần nữa.
--
-- Bối cảnh: app di động đã gửi reason=6 từ trước khi mã này tồn tại, vì danh
-- sách trong app dài hơn danh sách trong bảng. Cột không có CHECK nên PostgreSQL
-- nhận hết; lỗi chỉ lộ ra ở hàng đợi kiểm duyệt, nơi trọng số nghiêm trọng
-- không tra được và điểm ưu tiên thành NaN. Với đội một người, một báo cáo xếp
-- sai chỗ là một báo cáo không bao giờ được đọc.
--
-- Chạy được trên dữ liệu đang có: mọi hàng hiện tại đều nằm trong 1..6.

COMMENT ON COLUMN reports.reason IS
  '1 spam, 2 quấy rối, 3 giả mạo, 4 nội dung xấu, 5 khác, 6 lừa đảo';

-- CHECK chính là thứ đã thiếu. Thêm mã mới từ nay phải sửa ở đây trước, và
-- packages/core/src/moderation.ts sẽ báo lỗi biên dịch nếu quên trọng số.
ALTER TABLE reports
  ADD CONSTRAINT reports_reason_known CHECK (reason BETWEEN 1 AND 6);
```

- [ ] **Step 8: Chạy toàn bộ kiểm tra**

```bash
npm -w @datting/core test && npm -w @datting/mobile run typecheck && npm -w @datting/admin run typecheck
```

Kỳ vọng: cả ba PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/moderation.ts packages/core/test/moderation.test.ts apps/mobile/src/screens/SocialScreens.tsx apps/admin/src/labels.ts db/migrations/0002_report_reason_scam.sql
git commit -m "fix(moderation): mã lý do 6 (lừa đảo) tồn tại thật, không còn NaN trong hàng đợi"
```

---

## Task 9: Báo cáo / chặn ngay từ deck

**Files:**
- Modify: `apps/mobile/src/components/SwipeDeck.tsx` (nút "⋯" trên thẻ + styles)
- Modify: `apps/mobile/app/(tabs)/discover.tsx` (Modal + `ReportBlockSheet`)

**Interfaces:**
- Consumes: `ReportBlockSheet` từ `src/screens/SocialScreens.tsx` — chữ ký chính xác: `{ peerName: string; onReport: (code: number, detail: string) => Promise<void>; onBlock: () => Promise<void>; onUnmatch: () => Promise<void>; onClose: () => void }`. `api.report`, `api.block` đã có.
- Produces: `SwipeDeck` nhận thêm prop `onReport: (card: Card) => void`.

**Bối cảnh:** `ReportBlockSheet` chỉ được nối ở màn chat, nghĩa là **chỉ báo cáo được người đã kết đôi**. Với app hẹn hò công khai, đường lạm dụng phổ biến nhất — hồ sơ giả, ảnh khiêu dâm, tài khoản lừa đảo — nằm ở deck, nơi chưa có ai match với ai cả.

- [ ] **Step 1: Thêm nút "⋯" lên thẻ**

Trong `interface Props`:

```ts
  onReport: (card: Card) => void;
```

Trong JSX, ngay sau `<CardFace card={top} />` bên trong thẻ trên cùng:

```tsx
          {/* Nút này KHÔNG nằm trong `CardFace`: thẻ nền phía sau cũng dùng
              `CardFace`, và một nút bấm được nằm dưới thẻ khác là một vùng chạm
              ma. Chỉ thẻ trên cùng mới có nút. */}
          <PressableScale
            style={styles.more}
            onPress={() => onReport(top)}
            hapticOnPress="selection"
            accessibilityLabel={`Báo cáo hoặc chặn ${top.name}`}
          >
            <Text style={styles.moreIcon}>⋯</Text>
          </PressableScale>
```

Trong `StyleSheet.create`:

```ts
  // Góc trên TRÁI: góc phải đã có badge phần trăm, và đặt chồng lên nhau thì
  // vùng chạm cái nào thắng là chuyện của thứ tự render, không phải của thiết kế.
  more: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 44,          // sàn chạm 44pt (Apple HIG) / 48dp (Material)
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,.45)",
  },
  moreIcon: { color: "#fff", fontSize: 22, lineHeight: 24, includeFontPadding: false },
```

- [ ] **Step 2: Nối sheet ở màn deck**

Trong `apps/mobile/app/(tabs)/discover.tsx`, sửa import:

```ts
import { Modal, StyleSheet, View } from "react-native";
import { EmptyState, ErrorState, ReportBlockSheet } from "../../src/screens/SocialScreens";
```

Thêm state:

```ts
  const [reporting, setReporting] = useState<DeckCard | null>(null);
```

Truyền prop cho `SwipeDeck`:

```tsx
        onReport={(card) => setReporting(cards.find((c) => c.userId === card.userId) ?? null)}
```

Thêm Modal (sau khối `{celebration && …}`):

```tsx
      <Modal
        visible={reporting !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setReporting(null)}
      >
        <View style={styles.sheetBackdrop}>
          {reporting && (
            <ReportBlockSheet
              peerName={reporting.name}
              onReport={async (code, detail) => {
                await api.report(reporting.userId, code, detail);
              }}
              onBlock={async () => {
                const id = reporting.userId;
                setReporting(null);
                // Bỏ hẳn khỏi deck NGAY, không chờ mạng. Cùng nguyên tắc với
                // màn chat: người vừa bị quấy rối không phải nhìn thêm giây nào.
                setCards((cur) => cur.filter((c) => c.userId !== id));
                await api.block(id);
              }}
              // Chưa match thì không có gì để huỷ ghép — nút này chỉ đóng sheet.
              // Vẫn phải truyền vì `ReportBlockSheet` dùng chung với màn chat.
              onUnmatch={async () => setReporting(null)}
              onClose={() => setReporting(null)}
            />
          )}
        </View>
      </Modal>
```

Thêm style:

```ts
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#000a" },
```

- [ ] **Step 3: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck && cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 4: Xác minh bằng tay**

Bấm "⋯" trên thẻ → sheet trượt lên với sáu lý do, "Quấy rối, xúc phạm" ở đầu và "Lý do khác" ở cuối. Chọn "Lý do khác" → hiện ô nhập chi tiết. Gửi → sheet đóng ngay. Chọn ô "Đồng thời chặn người này" rồi gửi → thẻ biến mất khỏi deck.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/SwipeDeck.tsx "apps/mobile/app/(tabs)/discover.tsx"
git commit -m "feat(mobile): báo cáo và chặn được ngay từ deck, không cần match trước"
```

---

## Task 10: Điều kiện hoàn tác (logic thuần) — **cần bạn viết**

**Files:**
- Create: `packages/core/src/swipe.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/core.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `UNDO_WINDOW_MS: number`
  - `interface UndoCandidate { action: "like" | "pass" | "superlike"; atMs: number; sent: boolean; createdMatch: boolean }`
  - `type UndoVerdict = { ok: true } | { ok: false; reason: "expired" | "matched" | "nothing-to-undo" }`
  - `canUndo(c: UndoCandidate | null, nowMs: number, windowMs?: number): UndoVerdict`

  Task 11 và 13 dùng cả bốn.

- [ ] **Step 1: Tạo file với đầy đủ ngữ cảnh và một chỗ trống**

Tạo `packages/core/src/swipe.ts`:

```ts
/**
 * Điều kiện hoàn tác một lượt vuốt.
 *
 * ─── Vì sao logic này KHÔNG nằm trong component ───────────────────────────
 * Nó có ba trục cùng lúc — thời gian, đã-gửi-hay-chưa, và đã-tạo-match-hay-chưa
 * — nên đúng tám tổ hợp. Loại quyết định này viết trong JSX thì đọc lại sau ba
 * tháng không ai dám sửa. Ở đây nó chạy được với `node --test`, và nếu sau này
 * server cần chặn hoàn tác thì server dùng lại đúng hàm này chứ không viết bản
 * thứ hai — hai bản là hai bản sẽ lệch nhau.
 *
 * ─── Ba sự thật ràng buộc thiết kế ────────────────────────────────────────
 * 1. `pass` không ghi gì lên server. `recordSwipe` (services/match-service/
 *    src/mutualLike.ts) trả về ngay với `matched: false` mà không chạm Redis.
 *    Nên hoãn gửi một `pass` vài giây không mất gì cả.
 * 2. `like`/`superlike` phải gửi NGAY, vì màn ăn mừng phụ thuộc câu trả lời.
 *    Hoãn chúng là hoãn khoảnh khắc quan trọng nhất của sản phẩm.
 * 3. Match đã tạo ra thì KHÔNG rút lại bằng hoàn tác được. Phía bên kia đã nhận
 *    nudge và đã thấy match. Muốn gỡ thì đó là "huỷ kết nối", một thao tác khác,
 *    có hậu quả khác, và người dùng phải biết mình đang làm gì.
 */

/**
 * 5 giây. Đủ để nhận ra "ơ, vuốt nhầm rồi" và đưa tay tới nút; chưa đủ để người
 * dùng đã vuốt tiếp ba thẻ nữa rồi mới đòi quay lại.
 */
export const UNDO_WINDOW_MS = 5_000;

export interface UndoCandidate {
  action: "like" | "pass" | "superlike";
  /** Thời điểm người dùng vuốt. */
  atMs: number;
  /** Đã đẩy lên server hay còn nằm trong cửa sổ hoãn. */
  sent: boolean;
  /** Lượt vuốt này đã tạo ra một match. */
  createdMatch: boolean;
}

export type UndoVerdict =
  | { ok: true }
  | { ok: false; reason: "expired" | "matched" | "nothing-to-undo" };

/**
 * Lượt vuốt gần nhất còn hoàn tác được không?
 *
 * TODO — xem phần mô tả trong plan. Ba nhánh từ chối, một nhánh chấp nhận.
 */
export function canUndo(
  c: UndoCandidate | null,
  nowMs: number,
  windowMs: number = UNDO_WINDOW_MS,
): UndoVerdict {
  throw new Error("chưa cài đặt");
}
```

- [ ] **Step 2: Viết test cho hành vi mong muốn**

Chèn vào cuối `packages/core/test/core.test.ts`, kèm dòng import mới:

```ts
import { canUndo, UNDO_WINDOW_MS, type UndoCandidate } from "../src/swipe.js";

const swipe = (over: Partial<UndoCandidate> = {}): UndoCandidate => ({
  action: "pass", atMs: 1_000, sent: false, createdMatch: false, ...over,
});

test("không có gì để hoàn tác thì từ chối", () => {
  assert.deepEqual(canUndo(null, 1_000), { ok: false, reason: "nothing-to-undo" });
});

test("vuốt vừa xong thì hoàn tác được", () => {
  assert.deepEqual(canUndo(swipe(), 2_000), { ok: true });
});

test("quá cửa sổ thì hết hạn", () => {
  assert.deepEqual(
    canUndo(swipe({ atMs: 0 }), UNDO_WINDOW_MS + 1),
    { ok: false, reason: "expired" },
  );
});

test("đúng biên cửa sổ vẫn còn hoàn tác được", () => {
  assert.deepEqual(canUndo(swipe({ atMs: 0 }), UNDO_WINDOW_MS), { ok: true });
});

test("đã tạo match thì KHÔNG hoàn tác, dù còn trong cửa sổ", () => {
  assert.deepEqual(
    canUndo(swipe({ action: "like", sent: true, createdMatch: true }), 1_100),
    { ok: false, reason: "matched" },
  );
});

test("like đã gửi nhưng chưa match thì vẫn hoàn tác được", () => {
  assert.deepEqual(canUndo(swipe({ action: "like", sent: true }), 1_100), { ok: true });
});

test("match được kiểm TRƯỚC hạn giờ — lý do từ chối phải nói đúng chuyện", () => {
  assert.deepEqual(
    canUndo(swipe({ action: "like", sent: true, createdMatch: true, atMs: 0 }), 99_999),
    { ok: false, reason: "matched" },
    "nói 'hết hạn' cho một lượt đã match là nói dối — người dùng sẽ thử lại nhanh hơn",
  );
});
```

- [ ] **Step 3: Chạy test để chắc chắn nó ĐỎ**

```bash
npm -w @datting/core test
```

Kỳ vọng: FAIL, 7 test ném `chưa cài đặt`.

- [ ] **Step 4: Viết `canUndo` — CHỖ NÀY DÀNH CHO BẠN**

> **Bối cảnh:** khung, kiểu dữ liệu và test đã xong. Phần còn lại là một quyết định sản phẩm, khoảng 8 dòng, và nó định hình cảm giác của tính năng — nên nó nên là của bạn.
>
> **Việc cần làm:** cài đặt `canUndo` trong `packages/core/src/swipe.ts`.
>
> **Bốn nhánh — và **thứ tự** giữa chúng chính là quyết định:**
> - `c === null` → `nothing-to-undo`
> - `c.createdMatch` → `matched`
> - `nowMs - c.atMs > windowMs` → `expired`
> - còn lại → `{ ok: true }`
>
> **Điều đáng cân nhắc:** test cuối cùng ép **`matched` phải được kiểm trước `expired`**. Một lượt vuốt vừa quá hạn *vừa* đã tạo match thì hai câu trả lời đều đúng về mặt logic, nhưng chỉ một câu là hữu ích. Nói "hết hạn" gợi ý "lần sau bấm nhanh hơn" — người dùng sẽ thử lại và lại thất bại, vì cái chặn họ không phải thời gian. Nói "đã kết đôi rồi" thì họ biết phải đi tìm nút "huỷ kết nối".
>
> Nguyên tắc chung đáng nhớ khi viết hàm trả về lý do từ chối: **sắp xếp theo thứ tự "cái nào giải thích được nhiều nhất", không theo thứ tự rẻ nhất để kiểm.**
>
> Nếu bạn muốn một luật khác — ví dụ cho hoàn tác cả khi đã match, hoặc cửa sổ dài hơn cho `superlike` vì nó "đắt" hơn — cứ sửa test cho khớp rồi báo lại; hạ nguồn (Task 11–13) sẽ bám theo.

- [ ] **Step 5: Re-export và chạy test**

Trong `packages/core/src/index.ts`:

```ts
export * from "./swipe.js";
```

```bash
npm -w @datting/core test
```

Kỳ vọng: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/swipe.ts packages/core/src/index.ts packages/core/test/core.test.ts
git commit -m "feat(core): điều kiện hoàn tác lượt vuốt"
```

---

## Task 11: Cửa sổ hoãn cho `pass` trong hàng đợi vuốt

**Files:**
- Modify: `apps/mobile/src/swipeQueue.ts`

**Interfaces:**
- Consumes: `canUndo`, `UNDO_WINDOW_MS`, `UndoCandidate`, `UndoVerdict` (Task 10). `api.swipe`, `api.undoSwipe` (Task 12).
- Produces:
  - `queueSwipe(toUserId, action, onResult?): void` — **đổi kiểu trả về từ `Promise<SwipeResult|null>` sang `void`**, kết quả đi qua callback.
  - `flushDeferred(): void`
  - `undoLast(nowMs?: number): Promise<UndoVerdict>`

  Task 13 dùng `queueSwipe` (chữ ký mới) và `undoLast`. Đây là **breaking change** với `discover.tsx` — sửa ở Task 13.

- [ ] **Step 1: Thêm bộ đệm hoãn**

Trong `apps/mobile/src/swipeQueue.ts`, thêm import:

```ts
import { canUndo, UNDO_WINDOW_MS, type UndoCandidate, type UndoVerdict } from "@datting/core";
```

Thêm khối này sau `let flushing = false;`:

```ts
/* ---------------------------------------------------------------- Hoàn tác
 * `pass` được HOÃN, `like`/`superlike` gửi NGAY.
 *
 * Lý do bất đối xứng: `recordSwipe` phía server trả về ngay cho `pass` mà không
 * chạm Redis, nên hoãn nó vài giây không mất gì. Còn `like` phải đi ngay vì màn
 * ăn mừng phụ thuộc câu trả lời — hoãn nó là hoãn khoảnh khắc quan trọng nhất
 * của sản phẩm, để đổi lấy một tính năng mà đa số người dùng không bấm.
 *
 * Chỉ giữ MỘT lượt hoàn tác được, không giữ ngăn xếp. Hoàn tác nhiều bước khi
 * thẻ đã bay khỏi màn hình là mời gọi người dùng lạc: họ không nhớ thẻ thứ ba
 * lùi về là ai.
 */
let last: (UndoCandidate & { toUserId: string }) | null = null;
let deferred: ReturnType<typeof setTimeout> | null = null;

function clearDeferred(): void {
  if (deferred) {
    clearTimeout(deferred);
    deferred = null;
  }
}
```

- [ ] **Step 2: Viết lại `queueSwipe`**

Thay toàn bộ `queueSwipe` bằng:

```ts
/**
 * Ghi một lượt vuốt.
 *
 * Không trả Promise nữa: `pass` bị hoãn nên "khi nào xong" không còn là câu hỏi
 * có câu trả lời tại chỗ. Kết quả đi qua `onResult`, và `null` vẫn giữ nguyên
 * nghĩa cũ — "chưa biết có match hay không", KHÔNG phải "không match".
 */
export function queueSwipe(
  toUserId: string,
  action: SwipeAction,
  onResult?: (r: SwipeResult | null) => void,
): void {
  // Lượt trước đó hết quyền hoàn tác ngay khi có lượt mới: nếu nó đang bị hoãn
  // thì đẩy đi luôn, đừng để nằm chờ hết 5 giây trong khi người dùng đã vuốt
  // tiếp — thoát app lúc đó là mất nó.
  flushDeferred();

  const s = { toUserId, action, atMs: Date.now(), sent: false, createdMatch: false };
  last = s;

  if (action === "pass") {
    deferred = setTimeout(() => {
      deferred = null;
      void send(s, onResult);
    }, UNDO_WINDOW_MS);
    return;
  }

  void send(s, onResult);
}

/** Đẩy ngay lượt đang hoãn (nếu có), không chờ hết cửa sổ. */
export function flushDeferred(): void {
  if (!deferred || !last || last.sent) return;
  const s = last;
  clearDeferred();
  void send(s);
}

async function send(
  s: UndoCandidate & { toUserId: string },
  onResult?: (r: SwipeResult | null) => void,
): Promise<void> {
  s.sent = true;
  try {
    const r = await api.swipe(s.toUserId, s.action);
    if (r.matched) s.createdMatch = true;
    onResult?.(r);
  } catch {
    write([...read(), { toUserId: s.toUserId, action: s.action, at: s.atMs }]);
    onResult?.(null);
  }
}
```

- [ ] **Step 3: Viết `undoLast`**

Thêm sau `send`:

```ts
/**
 * Hoàn tác lượt vuốt gần nhất.
 *
 * Hai đường, tuỳ lượt đó đã rời máy chưa:
 *   chưa gửi → huỷ hẹn giờ. Server chưa từng biết chuyện này xảy ra.
 *   đã gửi   → gọi `api.undoSwipe`, xoá like ở phía server.
 *
 * Cả hai đường đều chỉ chạy sau khi `canUndo` gật đầu — luật nằm ở @datting/core
 * để backend dùng lại được cùng một hàm.
 */
export async function undoLast(nowMs: number = Date.now()): Promise<UndoVerdict> {
  const verdict = canUndo(last, nowMs);
  if (!verdict.ok || !last) return verdict;

  const target = last;
  last = null;

  if (!target.sent) {
    clearDeferred();
    return { ok: true };
  }

  try {
    await api.undoSwipe(target.toUserId);
    return { ok: true };
  } catch {
    // Không gọi được server. Không nuốt im lặng — nhưng cũng không dựng lại
    // thẻ: giật ngược một thẻ đã hiện lại còn khó hiểu hơn là để nó ở đó.
    return { ok: false, reason: "expired" };
  }
}
```

- [ ] **Step 4: Đẩy lượt đang hoãn khi flush hàng đợi**

Trong `flushSwipes`, thêm ngay sau `flushing = true;`:

```ts
    // Có lượt đang nằm chờ hết cửa sổ hoàn tác thì đẩy nó đi trước, để thứ tự
    // gửi khớp thứ tự vuốt. Một người có thể bị "pass" rồi "like" ở hai lần
    // khác nhau; đảo thứ tự là ghi ngược ý định của người dùng.
    flushDeferred();
```

- [ ] **Step 5: Kiểm kiểu — sẽ ĐỎ, và đó là đúng**

```bash
npm -w @datting/mobile run typecheck
```

Kỳ vọng: FAIL ở hai chỗ — `api.undoSwipe` chưa tồn tại (Task 12 thêm) và `discover.tsx` còn dùng `queueSwipe(...).then(...)` (Task 13 sửa). Đừng chữa ở đây.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/swipeQueue.ts
git commit -m "feat(mobile): cửa sổ hoãn 5 giây cho lượt bỏ qua"
```

---

## Task 12: Endpoint hoàn tác ở match-service

**Files:**
- Modify: `services/match-service/src/mutualLike.ts` (thêm `UNDO_LIKE_LUA`, `undoSwipe`, sửa `InMemoryRedis.eval`)
- Modify: `services/match-service/src/server.ts:2` (import), `:47` (route mới)
- Modify: `apps/mobile/src/api.ts` (`ENDPOINTS`, `interface Api`, `HttpApi`, `DemoApi`)
- Test: file test phụ trách `mutualLike` trong `services/match-service/test/`

**Interfaces:**
- Consumes: `pairKey`, `RedisLike`, `InMemoryRedis` (đã có).
- Produces:
  - `undoSwipe(redis, from, to): Promise<{ undone: boolean; reason?: "matched" }>`
  - `POST /v1/swipe/undo` nhận `{ from, to }`, trả `{ undone, reason? }`, mã 200 hoặc 409
  - `api.undoSwipe(toUserId: string): Promise<void>` — Task 11 gọi.

**Giới hạn phải nói thẳng:** `SeenFilter` là Bloom filter (`services/match-service/src/seen.ts:11`) và Bloom filter **không xoá được**. Nên `deck.markSwiped` không lùi lại được: người vừa bị hoàn tác sẽ không xuất hiện trong các lô deck **về sau**. Với luồng này thì không sao — thẻ vẫn nằm trong mảng `cards` phía client nên hoàn tác trong phiên vẫn đúng. Nhưng đừng hứa nhiều hơn thế.

- [ ] **Step 1: Viết test cho `undoSwipe`**

Chèn vào cuối `services/match-service/test/matching.test.ts` (thêm `undoSwipe` vào import sẵn có từ `../src/mutualLike.js`):

```ts
test("hoàn tác một like xoá dấu vết, người kia vuốt lại không thành match", async () => {
  const r = new InMemoryRedis();
  await recordSwipe(r, 1n, 2n, "like");
  const u = await undoSwipe(r, 1n, 2n);
  assert.equal(u.undone, true);

  const back = await recordSwipe(r, 2n, 1n, "like");
  assert.equal(back.matched, false, "like đã hoàn tác không được tính là còn đó");
});

test("không hoàn tác được lượt vuốt đã tạo match", async () => {
  const r = new InMemoryRedis();
  await recordSwipe(r, 1n, 2n, "like");
  const m = await recordSwipe(r, 2n, 1n, "like");
  assert.equal(m.matched, true);

  const u = await undoSwipe(r, 2n, 1n);
  assert.equal(u.undone, false);
  assert.equal(u.reason, "matched");
});

test("hoàn tác một pass luôn thành công — pass không ghi gì để mà xoá", async () => {
  const r = new InMemoryRedis();
  await recordSwipe(r, 1n, 2n, "pass");
  assert.equal((await undoSwipe(r, 1n, 2n)).undone, true);
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó ĐỎ**

```bash
npm -w @datting/match-service test
```

Kỳ vọng: FAIL — `undoSwipe` chưa tồn tại.

- [ ] **Step 3: Cài `undoSwipe`**

Trong `services/match-service/src/mutualLike.ts`, thêm sau `MUTUAL_LIKE_LUA`:

```ts
/**
 * Hoàn tác một like. NGUYÊN TỬ, cùng lý do với MUTUAL_LIKE_LUA.
 *
 * Kiểm chiều ngược lại TRƯỚC khi xoá: nếu cả hai đã like nhau thì match đã tồn
 * tại, cả hai đã nhận nudge, và xoá một chiều lúc này để lại một match mà một
 * bên "chưa từng like". Đó là trạng thái không đại diện cho bất cứ điều gì.
 */
export const UNDO_LIKE_LUA = `
-- KEYS[1] = like:{pairKey}
-- ARGV[1] = from_user   ARGV[2] = to_user
-- Trả 1 nếu đã xoá, 0 nếu từ chối vì đã thành match
if redis.call('HEXISTS', KEYS[1], ARGV[2]) == 1 then
  return 0
end
redis.call('HDEL', KEYS[1], ARGV[1])
return 1
`.trim();
```

Thêm sau `recordSwipe`:

```ts
export interface UndoResult {
  undone: boolean;
  reason?: "matched";
}

export async function undoSwipe(
  redis: RedisLike,
  from: bigint | number,
  to: bigint | number,
): Promise<UndoResult> {
  const key = pairKey(from, to);
  const r = await redis.eval(
    UNDO_LIKE_LUA,
    1,
    `like:${key}`,
    String(BigInt(from)),
    String(BigInt(to)),
  );
  return r === 1 ? { undone: true } : { undone: false, reason: "matched" };
}
```

- [ ] **Step 4: Dạy `InMemoryRedis` chạy script thứ hai**

`InMemoryRedis.eval` đang **bỏ qua** tham số script và luôn chạy logic của mutual-like. Với hai script thì "bỏ qua" trở thành "chạy nhầm cái kia" mà không báo gì. Thay thân `eval`:

```ts
  async eval(script: string, _numKeys: number, ...args: string[]): Promise<number> {
    this.evalCount++;
    const [key, from, to, ttl] = args as [string, string, string, string?];
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }

    if (script === UNDO_LIKE_LUA) {
      if (h.has(to)) return 0;
      h.delete(from);
      return 1;
    }

    h.set(from, "1");
    this.ttl.set(key, Number(ttl));
    return h.has(to) ? 1 : 0;
  }
```

- [ ] **Step 5: Chạy test để xác nhận XANH**

```bash
npm -w @datting/match-service test
```

Kỳ vọng: PASS, số test tăng thêm 3.

- [ ] **Step 6: Thêm route HTTP**

Trong `services/match-service/src/server.ts`, sửa import dòng 2:

```ts
import { InMemoryRedis, recordSwipe, undoSwipe, type SwipeAction } from "./mutualLike.js";
```

Thêm ngay sau khối `POST /v1/swipe` (dòng 47):

```ts
      // ---- POST /v1/swipe/undo --------------------------------------------
      // KHÔNG lùi được `deck.markSwiped`: SeenFilter là Bloom filter, xoá bit là
      // xoá cả những id khác cùng băm vào đó — false negative, tức hiện lại
      // người đã bỏ qua, đúng thứ bộ lọc sinh ra để chặn. Nên người vừa được
      // hoàn tác sẽ không quay lại ở các lô deck SAU; thẻ hiện tại vẫn nằm ở
      // client nên hoàn tác trong phiên vẫn đúng.
      if (req.method === "POST" && url.pathname === "/v1/swipe/undo") {
        const body = await readJson<{ from: string; to: string }>(req);
        const r = await undoSwipe(deps.redis, BigInt(body.from), BigInt(body.to));
        return json(res, r.undone ? 200 : 409, {
          undone: r.undone,
          ...(r.reason ? { reason: r.reason } : {}),
        });
      }
```

- [ ] **Step 7: Thêm `undoSwipe` vào client**

Trong `apps/mobile/src/api.ts`:

`ENDPOINTS`, sau `swipe`:

```ts
  swipeUndo: "/v1/swipe/undo",
```

`interface Api`, sau `swipe`:

```ts
  /** Hoàn tác lượt vuốt gần nhất với người này. Ném lỗi nếu đã thành match. */
  undoSwipe(toUserId: string): Promise<void>;
```

`HttpApi`, sau `swipe`:

```ts
  async undoSwipe(toUserId: string): Promise<void> {
    const { userId } = currentSession();
    await this.call(ENDPOINTS.swipeUndo, {
      method: "POST",
      body: JSON.stringify({ from: userId, to: toUserId }),
    });
  }
```

`DemoApi`, sau `swipe`:

```ts
  async undoSwipe(toUserId: string): Promise<void> {
    await sleep(150);
    // Bản demo giữ match trong Map nên nó kiểm được đúng điều server kiểm.
    const me = currentSession().userId ?? "1";
    if (this.matches.has(pairKeyOf(me, toUserId))) {
      throw new ApiError(409, "matched");
    }
  }
```

- [ ] **Step 8: Chạy toàn bộ test**

```bash
make test
```

Kỳ vọng: PASS.

- [ ] **Step 9: Commit**

```bash
git add services/match-service apps/mobile/src/api.ts
git commit -m "feat(match-service): POST /v1/swipe/undo, từ chối khi đã thành match"
```

---

## Task 13: Thanh hoàn tác trên màn deck

**Files:**
- Create: `apps/mobile/src/components/UndoBar.tsx`
- Modify: `apps/mobile/app/(tabs)/discover.tsx`

**Interfaces:**
- Consumes: `undoLast`, `queueSwipe` (chữ ký mới ở Task 11) · `UNDO_WINDOW_MS` (Task 10) · `index`/`setIndex` (Task 5) · `Toast` từ `Feedback.tsx`.
- Produces: `UndoBar` với props `{ visible: boolean; onUndo: () => void; onExpire: () => void }`.

- [ ] **Step 1: Viết `UndoBar`**

Tạo `apps/mobile/src/components/UndoBar.tsx`:

```tsx
/**
 * Thanh "Hoàn tác" có vạch đếm ngược.
 *
 * ─── Vì sao có vạch chứ không có con số ───────────────────────────────────
 * "Còn 3 giây" bắt người dùng đọc, hiểu, rồi mới quyết định — mà cả ba việc đó
 * đều tốn đúng cái thứ đang cạn. Một vạch ngắn dần thì nhìn là biết, không cần
 * đọc, và tự nói luôn "sắp hết".
 *
 * ─── Vì sao animate `scaleX` chứ không animate `width` ────────────────────
 * `width` là thuộc tính bố cục: đổi nó là Yoga phải tính lại cây layout mỗi
 * frame. `scaleX` chạy thẳng trên UI thread. Cùng hình ảnh, khác hẳn giá — và
 * đây là thứ chạy song song với cử chỉ vuốt thẻ.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { UNDO_WINDOW_MS } from "@datting/core";

import { useMotionConfig } from "../motion/useMotionConfig";
import { PressableScale } from "./Feedback";

export function UndoBar({
  visible,
  onUndo,
  onExpire,
}: {
  visible: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const m = useMotionConfig();
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;
    progress.value = 1;
    progress.value = withTiming(
      0,
      { duration: UNDO_WINDOW_MS, easing: Easing.linear },
      (done) => {
        // `done === false` nghĩa là animation bị cắt giữa chừng (người dùng đã
        // bấm hoàn tác, hoặc vuốt tiếp). Gọi onExpire lúc đó là báo hết giờ cho
        // một việc đã xong.
        if (done) runOnJS(onExpire)();
      },
    );
  }, [visible, progress, onExpire]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  if (!visible) return null;

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <PressableScale
        style={styles.btn}
        onPress={onUndo}
        hapticOnPress="light"
        accessibilityLabel="Hoàn tác lượt vuốt vừa rồi"
      >
        <Text style={styles.label}>↩ Hoàn tác</Text>
      </PressableScale>
      {/* Vạch đếm ngược ẩn hẳn khi bật "giảm chuyển động": một thanh co lại đều
          đặn ở rìa tầm nhìn là đúng loại chuyển động mà thiết lập đó tồn tại để
          tắt. Nút vẫn còn, chỉ mất phần trang trí. */}
      {!m.reduceMotion && <Animated.View style={[styles.progress, barStyle]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    // Nằm TRÊN hàng nút (bottom: 52, cao 68) để ngón cái không chạm nhầm
    // "Hoàn tác" khi đang định bấm "Kết nối".
    bottom: 132,
    borderRadius: 12,
    backgroundColor: "#161b22",
    borderWidth: 1,
    borderColor: "#30363d",
    overflow: "hidden",
  },
  btn: { paddingVertical: 12, alignItems: "center" },
  label: { color: "#e6edf3", fontSize: 14, fontWeight: "600" },
  progress: {
    height: 2,
    backgroundColor: "#e0567a",
    // `scaleX` co về TÂM theo mặc định; đặt gốc về mép trái để vạch rút từ phải
    // sang trái như người ta chờ đợi.
    transformOrigin: "left",
  },
});
```

- [ ] **Step 2: Cập nhật `discover.tsx` theo chữ ký mới của `queueSwipe`**

Thay `onSwipe`:

```ts
  const onSwipe = useCallback((card: Card, action: SwipeAction) => {
    const full = cards.find((c) => c.userId === card.userId);
    setUndoable(true);
    queueSwipe(card.userId, action, (result) => {
      if (!result?.matched || !full) return;
      // Có match thì hoàn tác không còn nghĩa lý gì — `canUndo` cũng sẽ từ chối,
      // nhưng để thanh hoàn tác nằm đó dưới màn ăn mừng là mời người dùng bấm
      // một nút chắc chắn thất bại.
      setUndoable(false);
      setCelebration({ card: full, matchId: result.pairKey });
      bump("matches");
      bump("notifications");
    });
  }, [cards]);
```

Thêm state và handler:

```ts
  const [undoable, setUndoable] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  const onUndo = useCallback(() => {
    setUndoable(false);
    void undoLast().then((v) => {
      if (v.ok) {
        // Lùi con trỏ, không dựng lại mảng: thẻ chưa bao giờ rời khỏi `cards`.
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      setUndoError(
        v.reason === "matched"
          ? "Hai bạn đã kết đôi rồi — dùng Huỷ kết nối nếu muốn gỡ."
          : "Không hoàn tác được lượt vuốt này nữa.",
      );
    });
  }, []);
```

Sửa import:

```ts
import { flushSwipes, queueSwipe, undoLast } from "../../src/swipeQueue";
import { UndoBar } from "../../src/components/UndoBar";
```

Thêm JSX (sau `<SwipeDeck …/>`, trước `<Toast>` của Task 2):

```tsx
      <UndoBar
        visible={undoable && celebration === null}
        onUndo={onUndo}
        onExpire={() => setUndoable(false)}
      />

      <Toast
        kind="error"
        message={undoError ?? ""}
        visible={undoError !== null}
        onDismiss={() => setUndoError(null)}
      />
```

- [ ] **Step 3: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck && cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: cả hai PASS — đây là lúc lỗi kiểu ở Task 11 Step 5 được dọn hết.

- [ ] **Step 4: Xác minh bằng tay**

1. Vuốt trái (bỏ qua) → thanh "Hoàn tác" hiện, vạch rút dần → bấm → thẻ cũ quay lại.
2. Vuốt trái rồi để yên hơn 5 giây → thanh biến mất, bấm không được nữa.
3. Vuốt phải cho tới khi ra màn ăn mừng → thanh hoàn tác **không** hiện.
4. Vuốt trái, hoàn tác, rồi vuốt trái lại → lặp được, không kẹt.
5. Bật "Giảm chuyển động" trong cài đặt hệ thống → nút còn, vạch mất.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/UndoBar.tsx "apps/mobile/app/(tabs)/discover.tsx"
git commit -m "feat(mobile): thanh hoàn tác lượt vuốt với vạch đếm ngược"
```

---

## Task 14: Offline và hết lượt — dùng hai màn đã viết mà chưa ai gọi

**Files:**
- Modify: `apps/mobile/app/(tabs)/discover.tsx`

**Interfaces:**
- Consumes — chữ ký chính xác, đã đọc từ nguồn:
  - `OfflineState({ onRetry: () => void })`
  - `RateLimitState({ resetAt: number; onImproveProfile: () => void })` — **không** nhận `onRetry`; nó tự chạy đồng hồ đếm ngược mỗi giây tới `resetAt`
  - `ErrorState({ onRetry: () => void; correlationId?: string })`
  - `flushSwipes()` từ `swipeQueue.ts` · `AppState` từ React Native · `ApiError` (có `.status`, `.body`) từ `src/api.ts`
- Produces: không có.

**Bối cảnh:** `OfflineState` (`SocialScreens.tsx:423`) và `RateLimitState` (`:439`) đã viết xong nhưng **chưa màn nào dùng**. Đồng thời `flushSwipes()` chỉ chạy đúng một lần lúc mount — mà `OfflineState` thì hứa nguyên văn "sẽ tự gửi khi có mạng trở lại". Câu hứa đó hiện chỉ đúng nếu người dùng tắt hẳn app rồi mở lại.

Không thêm `netinfo`: suy ra trạng thái mạng từ chính lệnh gọi API vừa hỏng, và dùng `AppState` (có sẵn trong React Native) làm mốc thử lại.

- [ ] **Step 1: Phân biệt ba kiểu hỏng**

Trong `discover.tsx`, thêm ở phạm vi module (ngoài component, cạnh `const PAGE = 20;`):

```ts
/**
 * Ba kiểu hỏng, ba màn khác nhau. Gộp làm một cờ `failed` như trước là bảo
 * người mất mạng đi "Thử lại" (vô ích) và bảo người hết lượt rằng có sự cố (sai).
 *
 * `rate-limit` mang theo `resetAt` vì `RateLimitState` chạy đồng hồ đếm ngược
 * THẬT — nó không nhận `onRetry`, nó nhận mốc hết hạn.
 */
type Failure =
  | { kind: "none" }
  | { kind: "offline" }
  | { kind: "rate-limit"; resetAt: number }
  | { kind: "error" };

/**
 * Mốc hết hạn hạn mức, đọc từ thân phản hồi 429 (`{ "reset_at": <epoch ms> }`).
 *
 * Chưa có endpoint nào trả 429 (xem phụ lục), nên nhánh dự phòng là nhánh sẽ
 * chạy trước: lùi về nửa đêm hôm nay, vì hạn mức là theo NGÀY. Một đồng hồ sai
 * vài phút vẫn tốt hơn một màn "hết lượt" không nói được bao giờ hết.
 */
function resetAtFrom(body: string): number {
  try {
    const r = (JSON.parse(body) as { reset_at?: number }).reset_at;
    if (typeof r === "number" && Number.isFinite(r)) return r;
  } catch {
    /* thân không phải JSON — dùng mốc dự phòng */
  }
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}
```

Thay `const [failed, setFailed] = useState(false);`:

```ts
  const [failure, setFailure] = useState<Failure>({ kind: "none" });
```

Trong `load`, thay dòng `setFailed(false)` và khối `catch`:

```ts
      setFailure({ kind: "none" });
    } catch (e) {
      // 429 là câu trả lời HỢP LỆ của server, không phải sự cố. Không có
      // response nào cả (fetch ném TypeError) thì gần như chắc chắn là mạng.
      if (e instanceof ApiError && e.status === 429) {
        setFailure({ kind: "rate-limit", resetAt: resetAtFrom(e.body) });
      } else if (e instanceof ApiError) {
        setFailure({ kind: "error" });
      } else {
        setFailure({ kind: "offline" });
      }
    }
```

Sửa import: `import { api, ApiError, type DeckCard } from "../../src/api";`

- [ ] **Step 2: Dựng đúng màn cho từng kiểu hỏng**

Thay khối `if (failed && cards.length === 0)`:

```tsx
  if (cards.length === 0) {
    if (failure.kind === "offline") return <OfflineState onRetry={() => void load(false)} />;
    if (failure.kind === "rate-limit") {
      return (
        <RateLimitState
          resetAt={failure.resetAt}
          // Chưa có màn "sửa hồ sơ" riêng; màn onboarding là chỗ duy nhất sửa
          // được hồ sơ hôm nay. Dùng `push` chứ không `replace` để người dùng
          // quay lại deck được — xem phụ lục.
          onImproveProfile={() => router.push("/(onboarding)/profile" as never)}
        />
      );
    }
    if (failure.kind === "error") return <ErrorState onRetry={() => void load(false)} />;
  }
```

Thêm `OfflineState`, `RateLimitState` vào import từ `SocialScreens`.

- [ ] **Step 3: Đẩy hàng đợi khi app quay lại tiền cảnh**

Thay `useEffect` hiện tại:

```ts
  useEffect(() => {
    void load(false);
    void flushSwipes();

    // Mở lại app là mốc "có thể mạng đã về" rẻ nhất và đáng tin nhất mà không
    // cần thêm thư viện: người mất mạng gần như luôn rời app rồi quay lại.
    // netinfo sẽ chính xác hơn, nhưng nó là native module — và apps/mobile đã
    // dính hai lần lỗi npm lồng bản thứ hai của native module.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void flushSwipes();
    });
    return () => sub.remove();
  }, [load]);
```

Thêm `AppState` vào import từ `react-native`.

- [ ] **Step 4: Kiểm kiểu và bundle**

```bash
npm -w @datting/mobile run typecheck && cd apps/mobile && npx expo export --platform android
```

Kỳ vọng: cả hai PASS.

- [ ] **Step 5: Xác minh bằng tay**

1. Bật chế độ máy bay rồi mở app → hiện `OfflineState`, không phải `ErrorState`.
2. Vẫn ở chế độ máy bay, vuốt vài thẻ (nếu deck đã nạp trước đó) → không lỗi, hàng đợi nhận.
3. Tắt chế độ máy bay, chuyển app sang nền rồi quay lại → các lượt vuốt được đẩy đi (theo dõi bằng `adb logcat` hoặc log của match-service).

- [ ] **Step 6: Chạy toàn bộ kiểm tra lần cuối**

```bash
make test
```

```bash
npm -w @datting/mobile run typecheck
```

```bash
cd apps/mobile && npx expo export --platform ios
```

Kỳ vọng: tất cả PASS. Lệnh `--platform ios` là bắt buộc trước khi đẩy lên EAS — hàng đợi ở đó ~15 phút mới báo hỏng.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/(tabs)/discover.tsx"
git commit -m "feat(mobile): màn offline/hết lượt và đẩy hàng đợi khi app trở lại"
```

---

## Phụ lục — những gì plan này KHÔNG làm

Ghi lại để lần sau không phải điều tra lại:

- **Không sửa được việc Android nuốt cử chỉ ở mép màn hình.** `setSystemGestureExclusionRects` chỉ gọi được từ code native, mà `apps/mobile/android/` là artifact của `prebuild`. Task 3 lùi thẻ ra khỏi vùng đó; ai chỉnh độ nhạy back lên mức cao nhất vẫn có thể chạm phải. Task 2 lo phần "chạm phải thì đừng chết".
- **Hoàn tác không đưa người đó trở lại các lô deck sau.** `SeenFilter` là Bloom filter, không xoá được — chi tiết ở đầu Task 12.
- **Không có test tự động cho UI di động.** Repo chưa có runner nào cho `apps/mobile` (`packages/core` và match-service dùng `node --test`). Mọi bước "Xác minh bằng tay" trong plan này là cố ý, không phải chỗ bỏ sót. Dựng một runner cho RN là một plan riêng.
- **Không đụng tới hạn mức vuốt phía server.** Task 14 chỉ hiển thị đúng màn khi server trả 429 kèm `{ "reset_at": … }`; hiện **chưa endpoint nào trả mã đó**, nên nhánh `rate-limit` là code chờ sẵn, chưa chạy được thật. Nhánh dự phòng `resetAtFrom` đếm tới nửa đêm.
- **Chưa có màn "sửa hồ sơ" riêng.** Nút "Hoàn thiện hồ sơ" ở `RateLimitState` đẩy người dùng vào `(onboarding)/profile` — màn duy nhất sửa được hồ sơ hôm nay. Nó được thiết kế cho luồng một chiều và kết thúc bằng `router.replace(nextRoute())`, nên người dùng sẽ về deck chứ không "quay lại" đúng nghĩa. Chấp nhận được, nhưng đây là món nợ: một màn `app/settings/profile.tsx` riêng là plan khác.
