import { createApp, demoDeps } from "./server.js";
import { pgDeps } from "./pgDeps.js";
import type { Deps } from "./server.js";

/**
 * Điểm vào. Chọn nguồn dữ liệu theo BIẾN MÔI TRƯỜNG, không theo cờ build.
 *
 *   DATABASE_URL có   → Postgres/PostGIS thật
 *   DATABASE_URL rỗng → 500 hồ sơ sinh tất định trong RAM
 *
 * Bản demo không phải đồ trang trí: nó giữ cho `npm run dev` chạy được mà
 * không cần hạ tầng, và giữ cho test không phải dựng database. Nhưng nó cũng
 * KHÔNG được im lặng giả làm bản thật — nên khi rơi vào nhánh đó, service nói
 * thẳng ra ở dòng log đầu tiên.
 */
const port = Number(process.env["PORT"] ?? 8080);
const databaseUrl = process.env["DATABASE_URL"] ?? "";

async function main(): Promise<void> {
  let deps: Deps;
  let close: () => Promise<void> = async () => {};

  if (databaseUrl) {
    const built = await pgDeps({
      connectionString: databaseUrl,
      ...(process.env["VALKEY_URL"] ? { valkeyUrl: process.env["VALKEY_URL"] } : {}),
      ...(process.env["SHARD_TARGET"]
        ? { targetShards: Number(process.env["SHARD_TARGET"]) }
        : {}),
      pushNudge: async (ids, kind, cursor) => {
        // eslint-disable-next-line no-console
        console.log(`[nudge] ${kind} → ${ids.join(",")} cursor=${cursor}`);
      },
    });
    deps = built.deps;
    close = built.close;
    // eslint-disable-next-line no-console
    console.log("nguồn dữ liệu: PostgreSQL/PostGIS");
  } else {
    deps = demoDeps();
    // eslint-disable-next-line no-console
    console.log(
      "nguồn dữ liệu: BẢN DEMO TRONG RAM (500 hồ sơ sinh tất định).\n" +
        "  Đặt DATABASE_URL để chạy trên Postgres thật.",
    );
  }

  const server = createApp(deps).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`match-service lắng nghe :${port}
  thử:  curl 'http://localhost:${port}/v1/deck?uid=1&limit=5'
        curl -XPOST localhost:${port}/v1/swipe -d '{"from":"1","to":"2","action":"like"}'
        curl -XPOST localhost:${port}/v1/swipe -d '{"from":"2","to":"1","action":"like"}'   # → matched:true`);
  });

  // Đóng pool khi dừng: không đóng thì Postgres giữ kết nối tới hết idle
  // timeout, và chạy đi chạy lại lúc dev sẽ ăn hết slot kết nối.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      server.close(() => {
        void close().then(() => process.exit(0));
      });
    });
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("không khởi động được:", err instanceof Error ? err.message : err);
  process.exit(1);
});
