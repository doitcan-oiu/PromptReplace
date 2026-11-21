import assert from "node:assert/strict";
import test from "node:test";
import { getPaginationItems, getRulePage } from "../frontend/features/rules/rules-model.js";
import { applyReplacements } from "../frontend/features/preview/apply-replacements.js";

const rule = (id, from, to, enabled = true) => Object.freeze({ id, from, to, enabled });

test("combined search and status filtering retains the original order, object references and global action indices", () => {
  const rules = Object.freeze([
    rule("start", "start", "开头"),
    rule("paused-first", "needle-disabled", "old", false),
    rule("match-source", "Needle source", "first"),
    rule("match-target", "other", "中文目标 NeedLE"),
    rule("paused-later", "needle-paused", "no", false),
    rule("match-later", "NEEDLE later", "second"),
    rule("unmatched", "last", "ignored", false),
  ]);
  const result = getRulePage(rules, { query: "nEeDlE", status: "enabled", page: 2, pageSize: 2 });
  assert.deepEqual(result.filtered.map(item => item.index), [2, 3, 5]);
  assert.deepEqual(result.visible.map(item => item.index), [5]);
  assert.equal(result.visible[0].rule, rules[5]);
  assert.equal(result.pageCount, 2);
  assert.equal(result.currentPage, 2);
  assert.equal(result.offset, 2);
  assert.equal(result.enabledCount, 4, "enabled count describes all rules, not only the filtered page");
  assert.deepEqual(getRulePage(rules, { query: "needle", status: "disabled" }).visible.map(item => item.index), [1, 4]);
  assert.deepEqual(getRulePage(rules, { query: "中文" }).visible.map(item => item.index), [3]);
  assert.deepEqual(rules.map(item => item.id), ["start", "paused-first", "match-source", "match-target", "paused-later", "match-later", "unmatched"]);
});

test("empty lists and searches with no matches produce a legal first page without losing the global enabled count", () => {
  const empty = getRulePage([], { page: 50, pageSize: 20 });
  assert.deepEqual(empty.filtered, []);
  assert.deepEqual(empty.visible, []);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.currentPage, 1);
  assert.equal(empty.offset, 0);
  const missing = getRulePage([rule("one", "original", "译文")], { query: "not present", page: 3 });
  assert.deepEqual(missing.visible, []);
  assert.equal(missing.enabledCount, 1);
  assert.equal(missing.currentPage, 1);
  assert.equal(missing.pageCount, 1);
});

test("invalid page inputs fall back safely and stale high pages clamp to the final available page", () => {
  const rules = Array.from({ length: 23 }, (_, index) => rule(String(index), "source " + index, "target " + index));
  for (const options of [
    { page: -8, pageSize: 0 },
    { page: Number.NaN, pageSize: Number.POSITIVE_INFINITY },
    { page: 2.5, pageSize: -3 },
  ]) {
    const result = getRulePage(rules, options);
    assert.equal(result.currentPage, 1);
    assert.equal(result.pageCount, 3);
    assert.equal(result.visible.length, 10);
    assert.equal(result.visible[0].index, 0);
  }
  const last = getRulePage(rules, { page: 999, pageSize: 10 });
  assert.equal(last.currentPage, 3);
  assert.equal(last.offset, 20);
  assert.deepEqual(last.visible.map(item => item.index), [20, 21, 22]);
  const largerPage = getRulePage(rules, { page: 3, pageSize: 20 });
  assert.equal(largerPage.currentPage, 2);
  assert.deepEqual(largerPage.visible.map(item => item.index), [20, 21, 22]);
});

test("pagination keeps useful boundary and nearby pages without enumerating very large page ranges", () => {
  assert.deepEqual(getPaginationItems(1, 1), [1]);
  assert.deepEqual(getPaginationItems(2, 3), [1, 2, 3]);
  assert.deepEqual(getPaginationItems(1, 1_000_000), [1, 2, "gap-1000000", 1_000_000]);
  assert.deepEqual(getPaginationItems(500_000, 1_000_000), [1, "gap-499999", 499_999, 500_000, 500_001, "gap-1000000", 1_000_000]);
  assert.deepEqual(getPaginationItems(1_000_000, 1_000_000), [1, "gap-999999", 999_999, 1_000_000]);
});

test("replacement previews apply rules in order and count matches introduced by an earlier rule", () => {
  const rules = Object.freeze([
    rule("first", "alpha", "beta"),
    rule("second", "beta", "gamma"),
  ]);
  assert.deepEqual(applyReplacements("alpha beta", rules), { output: "gamma gamma", count: 3 });
  assert.deepEqual(applyReplacements("alpha beta", [...rules].reverse()), { output: "beta gamma", count: 2 });
});

test("replacement previews treat regex metacharacters and replacement dollar syntax as literal text", () => {
  assert.deepEqual(applyReplacements("a.* [x] a.*", [
    rule("literal-pattern", "a.*", "$&"),
    rule("brackets", "[x]", "$1"),
  ]), { output: "$& $1 $&", count: 3 });
});

test("disabled and empty-source rules are skipped while empty replacement text deletes only matched text", () => {
  const rules = [
    rule("disabled", "delete_me", "should not apply", false),
    rule("empty-source", "", "should not insert"),
    rule("deletion", "delete_me", ""),
  ];
  assert.deepEqual(applyReplacements("prefix delete_me delete_me suffix", rules), { output: "prefix   suffix", count: 2 });
  assert.deepEqual(applyReplacements("", rules), { output: "", count: 0 });
  assert.deepEqual(applyReplacements("unchanged", []), { output: "unchanged", count: 0 });
});
