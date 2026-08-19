import { router } from "expo-router";

import type { Api } from "../../api";
import { DATTING_NEEDLE_TOOLS } from "./tools";
import type { NeedleCall } from "./router";

export interface NeedleExecutionResult {
  status: "executed" | "needs_confirmation" | "unsupported";
  message?: string;
  call: NeedleCall;
}

export async function executeNeedleCall(call: NeedleCall, api: Api): Promise<NeedleExecutionResult> {
  const meta = DATTING_NEEDLE_TOOLS.find((tool) => tool.name === call.name);
  if (!meta) return { status: "unsupported", call };
  if (meta.requiresConfirmation) return { status: "needs_confirmation", call };

  switch (call.name) {
    case "open_discover":
      router.replace("/(tabs)/discover" as never);
      return { status: "executed", call };
    case "open_matches":
      router.replace("/(tabs)/matches" as never);
      return { status: "executed", call };
    case "open_profile":
      router.replace("/(tabs)/profile" as never);
      return { status: "executed", call };
    case "open_notifications":
      router.push("/(tabs)/notifications" as never);
      return { status: "executed", call };
    case "show_likes_you":
      router.push("/likes-you" as never);
      return { status: "executed", call };
    case "open_chat": {
      const matchId = String(call.arguments.matchId ?? "");
      if (!matchId) return { status: "unsupported", call, message: "Thiếu matchId" };
      router.push({ pathname: "/chat/[matchId]", params: { matchId, name: String(call.arguments.name ?? "") } } as never);
      return { status: "executed", call };
    }
    case "set_discovery_preferences":
      // Preference persistence is intentionally not invented here. The router already gives
      // a typed payload; wire it to the real preference store/API when that contract lands.
      return {
        status: "unsupported",
        call,
        message: "Đã hiểu bộ lọc nhưng Datting chưa có preference contract để lưu an toàn.",
      };
    case "block_user":
    case "unmatch_user":
      return { status: "needs_confirmation", call };
    default:
      return { status: "unsupported", call };
  }
}

/** Execute a destructive action only after an explicit confirmation UI. */
export async function confirmNeedleCall(call: NeedleCall, api: Api): Promise<NeedleExecutionResult> {
  switch (call.name) {
    case "block_user": {
      const userId = String(call.arguments.userId ?? "");
      if (!userId) return { status: "unsupported", call, message: "Thiếu userId" };
      await api.block(userId);
      return { status: "executed", call };
    }
    case "unmatch_user": {
      const matchId = String(call.arguments.matchId ?? "");
      if (!matchId) return { status: "unsupported", call, message: "Thiếu matchId" };
      await api.unmatch(matchId);
      return { status: "executed", call };
    }
    default:
      return executeNeedleCall(call, api);
  }
}
