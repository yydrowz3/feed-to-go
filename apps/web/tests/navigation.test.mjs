import test from "node:test";
import assert from "node:assert/strict";
import { safeRedirect, parseResourceId, validateSearch } from "../src/lib/navigation.ts";
import { requireAuth } from "../src/lib/route-auth.ts";
test("redirects accept only internal non-login targets", () => {
  assert.equal(safeRedirect("/messages/2?q=hello#latest"), "/messages/2?q=hello#latest");
  assert.equal(safeRedirect("/video"), "/video");
  assert.equal(safeRedirect("/video?q=hello%20world"), "/video?q=hello%20world");
  for (const value of [
    undefined,
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/%255cevil.test",
    "/account",
    "/account/?q=x",
    "/x/../account",
    "/account#x",
    "/bad\npath",
  ])
    assert.equal(safeRedirect(value), undefined, String(value));
});
test("resource IDs reject invalid or unsafe integers and search rejects non-strings", () => {
  for (const value of ["0", "-1", "1.5", "abc", "01", "1e2", "9007199254740992"])
    assert.throws(() => parseResourceId(value));
  assert.equal(parseResourceId("9007199254740991"), 9007199254740991);
  assert.deepEqual(validateSearch({ q: 1 }), { q: "" });
  assert.deepEqual(validateSearch({ q: "文字" }), { q: "文字" });
});
test("guard always reads current store and preserves original internal URL", () => {
  let accessToken = "";
  const context = { authStore: { getState: () => ({ accessToken }) } };
  assert.throws(
    () => requireAuth({ context, location: { href: "/messages/3?q=hello" } }),
    (error) => {
      assert.equal(error.options.to, "/account");
      assert.equal(error.options.search.redirect, "/messages/3?q=hello");
      return true;
    },
  );
  accessToken = "current";
  assert.doesNotThrow(() => requireAuth({ context, location: { href: "/messages/3" } }));
});
