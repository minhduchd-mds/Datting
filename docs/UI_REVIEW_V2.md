# Datting Mobile — UI/UX Review V2

## Executive assessment

Datting currently has stronger engineering foundations than product presentation. Matching, optimistic swipe, offline retry, realtime nudge, moderation, reduced motion and haptics are well considered; the mobile visual system and information architecture have not yet expressed that quality.

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

The new visual direction avoids neon dating-app clichés and avoids looking like a developer dashboard.

- Base: warm near-black `#0B0B0D`
- Surface: `#151518`
- Primary: rose/coral `#F06274`
- Accent: coral/lavender used sparingly
- Radius: 16–30px, image-first cards
- Borders: translucent, low contrast
- Hierarchy: emotion first, metrics second
- Motion: retain the existing tested motion system and reduced-motion behavior

All shared values live in `apps/mobile/src/theme.ts`; new V2 screens must not introduce arbitrary hard-coded product colors unless they are image overlays or one-off semantic states.

## Information architecture

### Before

`Khám phá · Kết đôi · Thông báo`

### V2

`Khám phá · Kết nối · Hồ sơ`

Notifications remain available as a secondary event stream from header actions. This removes a low-value primary destination and adds the missing ownership surface for the user’s profile.

## Discover

### Problems

1. The card asks for a binary decision before giving the user a deliberate way to understand the profile.
2. Compatibility is visible as a number but the reason for the match is separated from the decision moment.
3. The screen has no product-level header or clear context for the recommendation mode.
4. Visual treatment was close to “dark UI + pink button”, not a distinctive dating product.

### V2

- Adds a Datting / “Dành cho bạn” header.
- Adds filter and notification entry points.
- Keeps swipe gestures and explicit accessible buttons.
- Adds “Xem hồ sơ đầy đủ” without removing swipe speed.
- Uses an image-first Warm Midnight card with subtle compatibility and topic chips.
- Full profile shows reasons, prompts, interests and safety context before the user returns to decide.

## Match Celebration

The previous screen surfaced three progress bars during the most emotional moment in the app. The data was useful, but its hierarchy was wrong.

V2 keeps the same motion choreography and haptic success feedback while changing the hierarchy to:

1. Confirmation: both users chose each other.
2. Emotional visual: two people + compatibility.
3. Evidence: compact common points and secondary compatibility signals.
4. Primary CTA: “Nhắn lời chào”.
5. Secondary CTA: “Xem hồ sơ”.

The old semantic bug — a button labelled “Xem hồ sơ chi tiết” opening chat — is removed.

## Connections

A new match and an established conversation are different user jobs.

V2 separates:

- **Match mới**: horizontal, visual, action = start conversation.
- **Tin nhắn**: vertical conversation list, unread and recency optimized.

This makes new opportunities visible without polluting ongoing conversations.

## Profile Hub

V2 introduces a new primary Profile destination with:

- profile identity and verification state;
- completion/quality score;
- actionable quality signals (photos, interests, intent, verification);
- entry to profile editing;
- privacy, safety and account groups.

Until `/v1/profiles/me` exists, onboarding profile data is cached in a dedicated MMKV store. This is explicitly a UI cache, not a server source of truth.

## Accessibility preserved

The V2 work intentionally preserves or improves:

- explicit buttons in addition to swipe gestures;
- accessibility labels for glyph icons;
- existing reduced-motion configuration;
- haptic gates and tested gesture behavior;
- high-contrast core text;
- minimum touch-target sizing.

## Next V2.1 backlog

1. Real profile-service endpoints: `GET/PUT /v1/profiles/me` and `GET /v1/profiles/:id`.
2. Profile prompts (3 answers) and prompt-specific likes.
3. Likes-you / incoming interest surface when product rules are finalized.
4. AI profile coach as an optional assistive layer, never auto-publishing content.
5. Conversation starters based on actual shared signals.
6. Date planning and post-date safety feedback.
7. Dedicated photo editor/reorder flow with moderation status.
8. Vector icon set once dependency policy allows it; current glyphs remain intentionally dependency-free.

## Implementation scope in `agent/mobile-v2-ui`

- `src/theme.ts` — shared Warm Midnight tokens.
- `src/profileStore.ts` — local onboarding profile cache.
- `app/(tabs)/_layout.tsx` — new primary IA.
- `app/(tabs)/discover.tsx` — V2 header + profile journey.
- `src/components/SwipeDeck.tsx` — V2 card visual hierarchy.
- `src/components/MatchCelebration.tsx` — corrected post-match actions and visual hierarchy.
- `app/profile/[userId].tsx` — full candidate profile.
- `app/(tabs)/matches.tsx` — new matches vs conversations.
- `app/(tabs)/profile.tsx` — profile hub.
- `app/profile/edit.tsx` — lightweight local editor.
- `app/(onboarding)/profile.tsx` — persist onboarding profile cache.
- `app/_layout.tsx` — V2 theme and detail-screen back gestures.
