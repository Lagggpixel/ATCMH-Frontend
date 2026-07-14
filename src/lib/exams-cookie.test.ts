import assert from "node:assert/strict";
import test from "node:test";

import { examsCookieOptions } from "./exams-cookie";

test("production Exams cookies are scoped and hardened", () => {
  assert.deepEqual(examsCookieOptions("https://www.atcmh.org"), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/exams",
  });
});

test("only exact HTTP loopback origins may omit Secure", () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.equal(examsCookieOptions(origin).secure, false, origin);
  }
  for (const origin of ["https://localhost:3000", "http://localhost.example:3000", "http://0.0.0.0:3000", "http://127.0.0.2:3000"]) {
    assert.equal(examsCookieOptions(origin).secure, true, origin);
  }
});
