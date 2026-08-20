import { useSyncExternalStore } from "react";

import { DEFAULT_ROUTE, routeFromHash, type RouteId } from "./routes.js";

/**
 * Đích hiện tại, đọc từ `location.hash`.
 *
 * Dùng `useSyncExternalStore` chứ không phải `useState` + `useEffect` vì
 * `hashchange` là nguồn dữ liệu NGOÀI React: cách này không có khoảng trống
 * giữa lần render đầu và lúc effect chạy, nên không loé sai màn.
 *
 * `getSnapshot` trả về CHUỖI chứ không phải object — `useSyncExternalStore` so
 * sánh bằng `Object.is`, nên trả object mới mỗi lần gọi sẽ render vô hạn. Cùng
 * cạm bẫy mà `apps/mobile/src/live.ts` đã ghi lại.
 */
function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function getSnapshot(): RouteId {
  return routeFromHash(window.location.hash);
}

export function useRoute(): RouteId {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_ROUTE);
}

export function navigate(id: RouteId): void {
  window.location.hash = "/" + id;
}
