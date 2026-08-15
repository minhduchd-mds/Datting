# Datting Mobile — UI/UX Review V2 / V2.1

## Executive assessment

Datting started V2 with stronger engineering foundations than product presentation. Matching, optimistic swipe, offline retry, realtime nudge, moderation, reduced motion and haptics were already well considered; V2 and V2.1 make that quality visible in the mobile journey.

### Scorecard before V2

| Area | Score | Main issue |
|---|---:|---|
| Product architecture | 8.5/10 | Strong foundation, profile-service still incomplete |
| Interaction logic | 8/10 | Good optimistic/retry behavior |
| Information architecture | 5.5/10 | Notifications occupied a primary tab while My Profile was missing |
| Discover UX | 6/10 | Swipe card had no deliberate “learn more before deciding” layer |
| Match moment | 6/10 | Compatibility breakdown felt like a dashboard at the emotional peak |
| Connections | 5.5/10 | New matches and active conversations were flattened into one list |
| Visual system | 5.5/10 | Hard-coded GitHub-like dark palette across screens |
| Profile ownership | 3/10 | No profile hub, quality guidance or editing surface |

## V2 design direction — Warm Midnight

The visual direction avoids neon dating-app clichés and avoids looking like a developer dashboard.

- Base: warm near-black `#0B0B0D`
- Surface: `#151518`
- Primary: rose/coral `#F06274`
- Accent: coral/lavender used sparingly
- Radius: 16–30px, image-first cards
- Borders: translucent, low contrast
- Hierarchy: emotion first, metrics second
- Motion: retain the existing tested motion system and reduced-motion behavior

Shared values live in `apps/mobile/src/theme.ts`; new product screens should not introduce arbitrary hard-coded product colors unless they are image overlays or one-off semantic states.

## Information architecture

### Before

`Khám phá · Kết đôi · Thông báo`

### V2+

`Khám phá · Kết nối · Hồ sơ`

Notifications remain a secondary event stream. Connections owns Match mới, Tin nhắn and the V2.1 Likes You entry point.

## Discover and profile decision

V2 adds a deliberate “understand before deciding” layer without slowing down swipe users:

- Datting / “Dành cho bạn” product header;
- image-first swipe card, compatibility and topic signals;
- explicit swipe buttons plus gesture support;
- full profile before deciding;
- compatibility reasons and privacy/safety context.

V2.1 extends the full profile with **interaction targets**:

- like the whole profile;
- like a specific approved photo;
- like a specific prompt answer.

These targets do **not** create a second matching algorithm. They still submit the existing person-level `like`; the target is retained as context so a future match can start with something concrete. This preserves pairKey, swipe queue, matching and moderation invariants.

## Profile Prompts — implemented V2.1

The local profile schema now supports up to three prompts:

```ts
interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}
```

The editor provides curated question choices, a 180-character answer limit and explicit save. Storage migrates automatically from `profile.v1` to `profile.v2` without discarding existing onboarding data.

Prompts are shown in Profile Hub and candidate profile detail. Empty prompts are never published to the local presentation layer.

## Match Celebration

V2 changes the hierarchy to:

1. Confirmation: both users chose each other.
2. Emotional visual: two people + compatibility.
3. Evidence: compact common points and secondary compatibility signals.
4. Primary CTA: “Nhắn lời chào”.
5. Secondary CTA: “Xem hồ sơ”.

The old semantic bug — a button labelled “Xem hồ sơ chi tiết” opening chat — is removed.

## Likes You — implemented V2.1

`app/likes-you.tsx` is a dedicated incoming-interest surface. Each card shows:

- who liked the user;
- compatibility score;
- whether they liked a prompt, photo or whole profile;
- “Xem” before deciding;
- explicit like-back action.

Product invariant: **like-back from Likes You is mutual interest, therefore it must create a match when the server confirms the inbound like still exists.** The deterministic demo mirrors this invariant instead of reusing the random demo match rate used by normal deck exploration.

HTTP contract prepared:

- `GET /v1/me/likes-you`

Until the social/profile service rolls this endpoint out, a 404/501 degrades to an empty state rather than breaking Connections.

## Connections

V2 separates:

- **Match mới**: visual, action = start conversation;
- **Tin nhắn**: recency/unread optimized threads.

V2.1 adds **Likes You** above those two jobs. Common-point signals now travel with match/chat routing so the conversation layer can use known context without inventing personal facts.

## AI Conversation Starter — implemented V2.1

Chat V2.1 has an assistive opener layer only while a conversation is empty.

Server contract prepared:

- `POST /v1/matches/:matchId/conversation-starters`

Input is limited to already-known match signals:

- peer display name;
- shared interests/lifestyle/intent;
- the photo/prompt/profile target the user previously liked.

The AI contract returns up to three suggestions. **Suggestions are never auto-sent.** Tapping one only copies it into the message composer; the user can edit or discard it before sending.

If the AI endpoint is not deployed (404/501), the app creates deterministic starter suggestions from the same real signals. The fallback does not invent occupation, history, location or personality facts.

## Date Plan — implemented V2.1 local-first

Chat now exposes a direct “Hẹn” action. `app/date-plan/[matchId].tsx` supports:

- activity choice;
- date label and daypart;
- broad area instead of private address;
- public-place safety check;
- reminder to share the plan with a trusted person.

V2.1 stores the draft locally through `socialStore`. The app explicitly does not auto-send time/location to the match and does not send the safety checklist to a third party. Server sync should only be added after product/privacy rules for shared date plans are finalized.

## Profile Hub

The primary Profile destination now contains:

- profile identity and verification state;
- completion/quality score;
- photos/interests/intent/prompt quality signals;
- prompt preview and editing;
- privacy, safety and account groups.

Until `GET/PUT /v1/profiles/me` exists, onboarding/profile edits remain in a dedicated MMKV UI cache. This is explicitly not server source of truth.

## Accessibility and trust rules preserved

V2/V2.1 preserve or improve:

- explicit buttons in addition to swipe gestures;
- accessibility labels for icon/glyph actions;
- existing reduced-motion configuration;
- haptic gates and tested gesture behavior;
- high-contrast core text;
- minimum touch-target sizing;
- no AI auto-send;
- no fake prompt/profile facts;
- no exact location exposure in match/date presentation;
- report/block/unmatch remain reachable from conversation.

## Backend contracts still required for production source-of-truth

1. `GET/PUT /v1/profiles/me`.
2. `GET /v1/profiles/:id` or equivalent batch profile hydration including approved prompts/photos.
3. Persisted interaction target metadata for photo/prompt/profile likes.
4. `GET /v1/me/likes-you` with authorization, block filtering and stale-like handling.
5. `POST /v1/matches/:matchId/conversation-starters` behind the chosen AI provider/router.
6. Optional shared date-plan API only after consent/privacy behavior is defined.
7. Post-date safety feedback/reporting workflow.
8. Dedicated photo reorder/editor with moderation state.

## Implementation scope in `agent/mobile-v2-ui`

### V2

- `src/theme.ts` — Warm Midnight tokens.
- `app/(tabs)/_layout.tsx` — primary IA.
- `app/(tabs)/discover.tsx` — Discover journey and rich profile routing.
- `src/components/SwipeDeck.tsx` — image-first swipe hierarchy.
- `src/components/MatchCelebration.tsx` — post-match hierarchy and corrected actions.
- `app/(tabs)/matches.tsx` — new matches vs conversations.
- `app/(tabs)/profile.tsx` — Profile Hub.

### V2.1

- `src/profileStore.ts` — profile.v2 + prompt migration.
- `app/profile/edit.tsx` — prompt editor.
- `app/profile/[userId].tsx` — prompt/photo/profile targeted likes.
- `src/socialStore.ts` — local like context and date-plan adapter.
- `src/api.ts` — Likes You + AI starter contracts and safe fallbacks.
- `app/likes-you.tsx` — incoming-interest surface.
- `src/screens/ConversationV21.tsx` — assistive chat UI, no auto-send.
- `app/chat/[matchId].tsx` — AI/context/date-plan wiring while preserving optimistic messaging and safety actions.
- `app/date-plan/[matchId].tsx` — local-first safe date planning.
- `app/_layout.tsx` — V2.1 detail routes.
