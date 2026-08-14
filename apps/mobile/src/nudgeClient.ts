/**
 * Client cho mô hình "nudge" (xem services/ws-gateway).
 *
 * Socket CHỈ mang tín hiệu. Khi nhận nudge, client tự gọi HTTP để lấy dữ liệu.
 * Nhờ vậy tầng realtime không bao giờ phải lo về schema, phân trang, hay nhất
 * quán — và mọi nudge đều idempotent nên mất một cái cũng không sao.
 *
 * Ba thứ bắt buộc phải có ở phía client, thiếu cái nào cũng sẽ đau:
 *   1. Exponential backoff + JITTER khi reconnect. Không có jitter → khi một
 *      pod ws-gateway restart, toàn bộ client của pod đó reconnect cùng lúc
 *      và tạo bão (thundering herd).
 *   2. Refetch khi app quay lại foreground — socket có thể đã chết âm thầm.
 *   3. Heartbeat/timeout phía client, không chỉ dựa vào ping của server.
 */

export type NudgeKind = "match" | "message" | "intro" | "pair";

export interface Nudge {
  kind: NudgeKind;
  cursor?: string;
  ts: number;
}

export interface NudgeClientOptions {
  url: string;
  token: string;
  deviceId: string;
  onNudge: (n: Nudge) => void;
  onStateChange?: (state: "connecting" | "open" | "closed") => void;
  /** Tiêm để test; mặc định dùng WebSocket toàn cục. */
  socketFactory?: (url: string) => WebSocket;
  maxBackoffMs?: number;
}

export class NudgeClient {
  private ws?: WebSocket;
  private attempt = 0;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly opts: NudgeClientOptions) {}

  connect(): void {
    if (this.stopped) return;
    this.opts.onStateChange?.("connecting");
    const make = this.opts.socketFactory ?? ((u: string) => new WebSocket(u));
    const url = `${this.opts.url}?device=${encodeURIComponent(this.opts.deviceId)}`;
    const ws = make(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0; // reset backoff CHỈ khi mở thành công
      this.opts.onStateChange?.("open");
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const n = JSON.parse(String(ev.data)) as Nudge;
        if (n && typeof n.kind === "string") this.opts.onNudge(n);
      } catch {
        // nudge hỏng thì bỏ qua — không bao giờ để một payload xấu giết socket
      }
    };
    ws.onclose = () => {
      this.opts.onStateChange?.("closed");
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  /** Backoff mũ CÓ JITTER — thiếu jitter là nguyên nhân của bão reconnect. */
  nextDelayMs(): number {
    const max = this.opts.maxBackoffMs ?? 30_000;
    const base = Math.min(max, 500 * 2 ** this.attempt);
    return Math.floor(base / 2 + Math.random() * (base / 2));
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.nextDelayMs();
    this.attempt++;
    this.timer = setTimeout(() => this.connect(), delay);
  }

  /** Gọi khi app quay lại foreground: socket có thể đã chết âm thầm. */
  resume(): void {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) return;
    this.attempt = 0;
    if (this.timer) clearTimeout(this.timer);
    this.connect();
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
