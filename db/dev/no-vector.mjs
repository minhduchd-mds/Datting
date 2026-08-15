#!/usr/bin/env node
/**
 * Sinh schema DEV không cần pgvector — dùng khi máy dev không cài được nó.
 *
 * ─── Vì sao SINH RA chứ không chép ra một file thứ hai ────────────────────
 * Một bản sao 183 dòng của `0001_init.sql` sẽ lệch khỏi bản gốc trong vòng vài
 * tuần, và lệch âm thầm: cả hai đều chạy được, chỉ khác nhau. Script này đọc
 * bản gốc mỗi lần chạy và áp đúng BA phép thay thế, nên "schema dev" luôn là
 * "schema thật trừ đi pgvector", không bao giờ là một thứ khác.
 *
 * Nếu bản gốc đổi và một phép thay thế không còn khớp, script DỪNG với lỗi
 * thay vì lặng lẽ bỏ qua — im lặng ở đây nghĩa là dựng một database thiếu thứ
 * gì đó mà không ai biết.
 *
 * ─── Vì sao pgvector vắng mặt ─────────────────────────────────────────────
 * Trên Windows, pgvector phải biên dịch bằng MSVC; không có bản zip chính thức.
 * Và đây không phải vấn đề riêng của Windows: `docker-compose.yml` dùng image
 * `postgis/postgis:18-3.6` (không kèm pgvector) rồi ghi "pgvector cài thêm ở
 * bước init (xem ops/)" — mà thư mục `ops/` KHÔNG TỒN TẠI trong repo. Nên
 * đường Docker cũng hỏng ở đúng chỗ này.
 *
 * ─── Chỗ lệch, nói rõ để không ai nhầm ────────────────────────────────────
 *   `embedding VECTOR(128)`  →  `embedding REAL[]`
 *   index HNSW               →  không có
 *
 * Hệ quả: dev KHÔNG chạy được truy vấn ANN (`<=>`). Chấp nhận được vì truy hồi
 * ANN thuộc về Qdrant chứ không phải Postgres — cột này chỉ là bản sao để
 * backfill/đối soát, đúng như comment ở bản gốc nói.
 *
 * Lưu ý định dạng: `real[]` in ra text kiểu `{0.5,0.5}` còn `vector` in ra
 * `[0.5,0.5]`. `parseVector` trong candidateSql.ts nhận cả hai, có test.
 *
 * Dùng:
 *   node db/dev/no-vector.mjs | psql "$DATABASE_URL"
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "migrations", "0001_init.sql");

/** Mỗi phép thay thế PHẢI khớp, nếu không script dừng. */
const EDITS = [
  {
    what: "bỏ CREATE EXTENSION vector",
    find: "CREATE EXTENSION IF NOT EXISTS vector;",
    replace: "-- [dev] CREATE EXTENSION vector — bỏ: pgvector không có trên máy này",
  },
  {
    what: "đổi kiểu cột embedding",
    find: "embedding      VECTOR(128),",
    replace:
      "embedding      REAL[],  -- [dev] thật ra là VECTOR(128); text form là {..} chứ không [..]",
  },
  {
    what: "bỏ index HNSW",
    find: `CREATE INDEX idx_profiles_embedding ON profiles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);`,
    replace: "-- [dev] index HNSW bỏ: cần pgvector. Truy vấn ANN không chạy được ở dev.",
  },
];

// Chuẩn hoá CRLF → LF TRƯỚC khi so khớp.
//
// `.gitattributes` của repo để git chuyển đuôi dòng lúc checkout, nên file trên
// đĩa Windows có `\r\n` còn chuỗi tìm viết trong file này có `\n`. Phép thay thế
// nhiều dòng (index HNSW) sẽ không khớp, và guard bên dưới sẽ báo "0001_init.sql
// đã đổi" — một chẩn đoán SAI cho một file không hề đổi.
const original = (await readFile(source, "utf8")).replace(/\r\n/g, "\n");
let out = original;

for (const e of EDITS) {
  if (!out.includes(e.find)) {
    console.error(
      `db/dev/no-vector.mjs: không tìm thấy đoạn cần sửa (${e.what}).\n` +
        `0001_init.sql đã đổi. Cập nhật script này rồi chạy lại — đừng bỏ qua, ` +
        `bỏ qua nghĩa là dựng một database thiếu thứ gì đó mà không ai biết.`,
    );
    process.exit(1);
  }
  out = out.replace(e.find, e.replace);
}

process.stdout.write(
  `-- ⚠ SINH TỰ ĐỘNG từ db/migrations/0001_init.sql bởi db/dev/no-vector.mjs\n` +
    `-- ĐÂY LÀ SCHEMA DEV: không pgvector, embedding là real[], không index HNSW.\n` +
    `-- Đừng commit kết quả này. Đừng dùng cho production.\n\n` +
    out,
);
