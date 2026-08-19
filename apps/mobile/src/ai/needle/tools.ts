export type DattingNeedleToolName =
  | "open_discover"
  | "open_matches"
  | "open_profile"
  | "open_notifications"
  | "open_chat"
  | "show_likes_you"
  | "set_discovery_preferences"
  | "block_user"
  | "unmatch_user";

export interface DattingNeedleTool {
  name: DattingNeedleToolName;
  description: string;
  parameters: Record<string, { type: "string" | "number" | "boolean"; description: string; required?: boolean }>;
  /** Destructive/privacy-sensitive tools must never execute from model output without UI confirmation. */
  requiresConfirmation?: boolean;
}

export const DATTING_NEEDLE_TOOLS: DattingNeedleTool[] = [
  { name: "open_discover", description: "Mở màn hình khám phá và danh sách gợi ý phù hợp.", parameters: {} },
  { name: "open_matches", description: "Mở danh sách các kết nối/match hiện có.", parameters: {} },
  { name: "open_profile", description: "Mở hồ sơ của chính người dùng.", parameters: {} },
  { name: "open_notifications", description: "Mở thông báo.", parameters: {} },
  {
    name: "open_chat",
    description: "Mở cuộc trò chuyện với một match đã biết.",
    parameters: {
      matchId: { type: "string", description: "ID match nội bộ Datting.", required: true },
      name: { type: "string", description: "Tên hiển thị của người đang trò chuyện." },
    },
  },
  { name: "show_likes_you", description: "Mở danh sách những người đã thích người dùng.", parameters: {} },
  {
    name: "set_discovery_preferences",
    description: "Diễn giải câu lệnh lọc khám phá thành preference có cấu trúc. Chỉ áp dụng các trường app hỗ trợ.",
    parameters: {
      minAge: { type: "number", description: "Tuổi tối thiểu." },
      maxAge: { type: "number", description: "Tuổi tối đa." },
      maxDistanceKm: { type: "number", description: "Khoảng cách tối đa theo km." },
      topic: { type: "string", description: "Sở thích/chủ đề ưu tiên." },
    },
  },
  {
    name: "block_user",
    description: "Chặn một người dùng. Luôn yêu cầu xác nhận UI trước khi gọi API.",
    parameters: { userId: { type: "string", description: "ID người dùng cần chặn.", required: true } },
    requiresConfirmation: true,
  },
  {
    name: "unmatch_user",
    description: "Huỷ kết nối với một match. Luôn yêu cầu xác nhận UI trước khi gọi API.",
    parameters: { matchId: { type: "string", description: "ID match cần huỷ.", required: true } },
    requiresConfirmation: true,
  },
];

/** Needle/Cactus nhận tool theo OpenAI function-calling shape. */
export function needleToolsJson(): string {
  return JSON.stringify(
    DATTING_NEEDLE_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  );
}
