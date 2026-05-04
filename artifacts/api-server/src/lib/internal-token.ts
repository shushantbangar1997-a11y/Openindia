import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let _token: string | null = null;

export function getInternalToken(): string {
  if (!_token) {
    _token = process.env["INTERNAL_API_TOKEN"] || randomBytes(24).toString("hex");
    process.env["INTERNAL_API_TOKEN"] = _token;
    try {
      const dir = join(tmpdir(), "rapid-x");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "internal_token"), _token, { mode: 0o600 });
    } catch {
      // best-effort write
    }
  }
  return _token;
}
