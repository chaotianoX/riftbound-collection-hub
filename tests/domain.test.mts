import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalOrder, inventory, progress, target } from "../lib/domain/collection";
test("masterset uses copies, caps excess and leaves unknown categories unresolved", () => {
  assert.deepEqual(progress([{ owned: 2, category: "Normal" }, { owned: 1, category: "Legend" }]),
    { total: 4, covered: 3, missing: 1, excess: 0, unresolved: 0, completion: 75 });
  assert.equal(progress([{ owned: 5, category: "Normal" }]).excess, 2);
  assert.equal(progress([{ owned: 5, category: "Normal" }]).completion, 100);
  assert.equal(progress([]).completion, null);
  assert.equal(progress([{ owned: 0, category: null }]).completion, null);
  assert.equal(target("Battlefield"), 1);
});
test("reservations change availability, not owned or collection progress", () => {
  assert.deepEqual(inventory(3, 2), { owned: 3, reserved: 2, available: 1 });
  for (const n of [-1, 0.5, NaN, Infinity]) assert.throws(() => inventory(n, 0));
  assert.throws(() => inventory(1, 2));
});
test("whole set blocks, natural numbers/suffixes, absent numbers last and stable ties before paging", () => {
  const rows = [
    { id: "s", setOrder: 20, cardNumber: "001" },
    { id: "ten", setOrder: 10, cardNumber: "10" },
    { id: "two", setOrder: 10, cardNumber: "002" },
    { id: "missing", setOrder: 10, cardNumber: null },
    { id: "suffix10", setOrder: 10, cardNumber: "2a10" },
    { id: "suffix2", setOrder: 10, cardNumber: "2a2" },
  ].sort(canonicalOrder);
  assert.deepEqual(rows.map(r => r.id), ["two", "suffix2", "suffix10", "ten", "missing", "s"]);
  assert.deepEqual(rows.slice(0, 2).map(r => r.id), ["two", "suffix2"]);
  assert.ok(canonicalOrder({ id: "a", setOrder: 10, cardNumber: "02" }, { id: "b", setOrder: 10, cardNumber: "2" }) < 0);
});

import { displayImage } from "../lib/domain/images";
test("images require reviewed rights, ready state, provenance and HTTPS; errors fall back", () => {
  assert.equal(displayImage(null), null);
  const image = { state: "ready" as const, usageVerified: true, checksum: "fixture", authorizedUrl: "https://example.invalid/test-only.png" };
  assert.equal(displayImage(image), image.authorizedUrl);
  assert.equal(displayImage({ ...image, usageVerified: false }), null);
  assert.equal(displayImage({ ...image, state: "error" }), null);
  assert.equal(displayImage({ ...image, checksum: null }), null);
  assert.equal(displayImage({ ...image, authorizedUrl: "data:image/png;base64,fixture" }), null);
  assert.equal(displayImage({ ...image, authorizedUrl: "https://user:password@example.invalid/image" }), null);
});
