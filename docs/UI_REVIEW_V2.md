# Datting Mobile — UI/UX Review V2/V2.1

Bản review chi tiết mới nhất đã được chuyển sang:

- `docs/PRODUCTION_AUDIT_2026-08-15.md`

Tài liệu production audit là nguồn đánh giá hiện hành cho:

- UI/UX và product flow;
- visual/design system;
- typography/font strategy;
- mobile frontend;
- core architecture và backend readiness;
- moderation console;
- P0/P1/P2 roadmap trước public launch.

## Quy ước môi trường sau V2.1

- `EXPO_PUBLIC_APP_MODE=production`: bắt buộc có `EXPO_PUBLIC_API_BASE` và `EXPO_PUBLIC_WS_URL`; app fail-fast nếu thiếu, không fallback demo.
- `EXPO_PUBLIC_APP_MODE=demo`: chỉ dùng cho internal QA/dev profile.
- CI Android build của PR/main là **production-target APK**.
- EAS `production` sinh AAB và trỏ production API/WS.

## Product invariants tiếp tục giữ nguyên

- canonical pairKey;
- mutual-like nguyên tử;
- optimistic/offline swipe queue;
- WebSocket nudge;
- moderation/safety actions;
- reduced motion và haptic gates;
- AI conversation starter không auto-send;
- like theo photo/prompt vẫn là person-level like, context chỉ dùng cho conversation.

> Lưu ý: production-target client không đồng nghĩa toàn platform backend đã production-complete. Danh sách service/endpoint P0 còn thiếu được ghi rõ trong `PRODUCTION_AUDIT_2026-08-15.md`.
