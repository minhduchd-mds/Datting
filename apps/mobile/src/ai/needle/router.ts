import { DATTING_NEEDLE_TOOLS, type DattingNeedleToolName, needleToolsJson } from "./tools";

export interface NeedleCall {
  name: DattingNeedleToolName;
  arguments: Record<string, string | number | boolean>;
  source: "needle" | "fallback";
}

export interface NeedleInferenceProvider {
  /**
   * Native Cactus/Needle bridge implementation goes here.
   * Return the raw model output, expected to be a JSON array of tool calls.
   */
  generate(input: { query: string; tools: string }): Promise<string>;
}

export class DattingNeedleRouter {
  constructor(private readonly provider?: NeedleInferenceProvider) {}

  async route(query: string): Promise<NeedleCall | null> {
    const text = query.trim();
    if (!text) return null;

    if (this.provider) {
      try {
        const raw = await this.provider.generate({ query: text, tools: needleToolsJson() });
        const call = parseNeedleOutput(raw);
        if (call) return { ...call, source: "needle" };
      } catch {
        // Fail closed to deterministic local routing; never block navigation because the model is unavailable.
      }
    }

    return fallbackRoute(text);
  }
}

function parseNeedleOutput(raw: string): Omit<NeedleCall, "source"> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!candidate || typeof candidate !== "object") return null;

    const item = candidate as { name?: unknown; arguments?: unknown };
    if (typeof item.name !== "string" || !isAllowedTool(item.name)) return null;
    const args = item.arguments && typeof item.arguments === "object"
      ? (item.arguments as Record<string, string | number | boolean>)
      : {};
    if (!validateRequiredArgs(item.name, args)) return null;
    return { name: item.name, arguments: sanitizeArgs(args) };
  } catch {
    return null;
  }
}

function fallbackRoute(query: string): NeedleCall | null {
  const q = normalize(query);

  if (hasAny(q, ["kham pha", "goi y", "tim nguoi", "nguoi phu hop"])) return call("open_discover");
  if (hasAny(q, ["ket noi", "match", "ghep doi"])) return call("open_matches");
  if (hasAny(q, ["ho so cua toi", "ho so cua minh", "trang ca nhan", "profile cua toi"])) return call("open_profile");
  if (hasAny(q, ["thong bao", "notification"])) return call("open_notifications");
  if (hasAny(q, ["ai thich toi", "nguoi thich toi", "likes you"])) return call("show_likes_you");

  const age = q.match(/(?:tuoi|age)\s*(\d{2})\s*(?:-|den|toi)\s*(\d{2})/);
  const distance = q.match(/(?:ban kinh|khoang cach|distance)\s*(\d{1,3})\s*km/);
  if (age || distance) {
    const args: Record<string, number> = {};
    if (age) {
      args.minAge = Number(age[1]);
      args.maxAge = Number(age[2]);
    }
    if (distance) args.maxDistanceKm = Number(distance[1]);
    return { name: "set_discovery_preferences", arguments: args, source: "fallback" };
  }

  return null;
}

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function hasAny(input: string, needles: string[]): boolean {
  return needles.some((x) => input.includes(x));
}

function isAllowedTool(name: string): name is DattingNeedleToolName {
  return DATTING_NEEDLE_TOOLS.some((tool) => tool.name === name);
}

function validateRequiredArgs(name: DattingNeedleToolName, args: Record<string, string | number | boolean>): boolean {
  const tool = DATTING_NEEDLE_TOOLS.find((x) => x.name === name);
  if (!tool) return false;
  return Object.entries(tool.parameters).every(([key, schema]) => !schema.required || args[key] !== undefined);
}

function sanitizeArgs(args: Record<string, string | number | boolean>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)),
  );
}

function call(name: DattingNeedleToolName): NeedleCall {
  return { name, arguments: {}, source: "fallback" };
}
