# Needle 2 for Datting

## Goal
Use Needle 2 as a tiny on-device intent/tool router, not as Datting's conversational LLM.

## Why this shape
- Navigation and simple commands should not require a cloud LLM.
- Destructive actions must remain explicit and user-confirmed.
- The app must keep working when the local model is missing, not initialized, or fails inference.
- Datting currently uses Expo SDK 57 / React Native 0.86, so native AI runtime integration is isolated behind an adapter instead of being hard-wired into UI code.

## Implemented now
`apps/mobile/src/ai/needle/`
- `tools.ts`: Datting-specific function-calling schema.
- `router.ts`: Needle provider interface, strict JSON parsing, allow-list validation, deterministic Vietnamese fallback routing.
- `executor.ts`: safe action execution; block/unmatch always require confirmation.

Supported first-pass tools:
- open_discover
- open_matches
- open_profile
- open_notifications
- open_chat
- show_likes_you
- set_discovery_preferences (parse only until a real preference contract exists)
- block_user (confirmation required)
- unmatch_user (confirmation required)

## Native runtime phase
Needle's official runtime path is Cactus. The runtime accepts OpenAI-style tool schemas and the Needle model is intended for single-shot function calling on-device.

Do not add an archived/obsolete React Native package blindly. Integrate the current Cactus React Native/JNI/FFI binding only after verifying compatibility with Expo SDK 57, React Native 0.86, Android Gradle setup, and the iOS dependency chain.

The adapter contract is intentionally tiny:

```ts
interface NeedleInferenceProvider {
  generate(input: { query: string; tools: string }): Promise<string>;
}
```

A future `CactusNeedleProvider` should:
1. lazily download/init the Needle model,
2. pass `needleToolsJson()` to the runtime,
3. return raw tool-call JSON,
4. expose no user profile/photo/message content beyond the minimum command text required for routing,
5. fall back locally on any runtime error.

## Safety/privacy rules
1. Needle may select a tool but cannot bypass Datting authorization or API validation.
2. Never send passwords, OTPs, auth tokens, precise location, private messages, or raw photos into the routing prompt.
3. `block_user` and `unmatch_user` require an explicit confirmation UI after routing.
4. Unknown tools and malformed arguments are rejected.
5. Preference changes must use a real typed persistence/API contract before execution.

## Suggested UI
Add an optional command entry point in Discover/Profile, e.g.:
- “Tìm người 25–30 tuổi trong bán kính 10 km”
- “Mở kết nối của tôi”
- “Ai đã thích tôi?”

The UI should show the interpreted action before applying any consequential change.

## Rollout
### Phase A — merged in this change
Tool schema + router + guardrails + deterministic Vietnamese fallback.

### Phase B
Add `CactusNeedleProvider` native bridge and test Android first.

### Phase C
Add a small Smart Command UI and telemetry limited to latency/success/fallback rate (no command content by default).

### Phase D
Fine-tune/evaluate Needle against Datting's Vietnamese command set, including slang, typos and ambiguous requests.

## Acceptance targets
- Local navigation intent p50 < 100 ms after model warm-up.
- >= 95% correct tool selection on Datting's curated command test set before default-on rollout.
- 0 destructive actions without confirmation.
- 100% functional fallback when the model/runtime is unavailable.
