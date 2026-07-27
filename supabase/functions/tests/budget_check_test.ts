import { assertEquals, assert } from "@std/assert";
import { handleBudgetCheck, type BudgetCheckDeps } from "../budget-check/index.ts";

const NOW = new Date("2026-07-20T03:00:00Z");

function makeDeps(over: Partial<BudgetCheckDeps> = {}): BudgetCheckDeps {
  return {
    now: () => NOW,
    listActiveUsers: () => Promise.resolve([{ userId: "u1", monthStartDay: 1, locale: "en" }]),
    listBudgets: () => Promise.resolve([
      { id: "b1", scope: "category", category_slug: "food", period: "monthly", amount: 1000, warn_pct: 80 },
    ]),
    getCycleSpend: () => Promise.resolve({ overall: 900, byCategory: { food: 900 } }),
    getCategoryHistory: () => Promise.resolve([]),
    listSentAlerts: () => Promise.resolve([]),
    recordAlerts: () => Promise.resolve(),
    getPushTokens: () => Promise.resolve(["ExponentPushToken[x]"]),
    sendPush: () => Promise.resolve(),
    ...over,
  };
}

const post = () => new Request("http://localhost", { method: "POST" });

Deno.test("sends ONE push summarizing the day's alerts", async () => {
  const sent: unknown[][] = [];
  const res = await handleBudgetCheck(post(), makeDeps({
    sendPush: (msgs) => { sent.push(msgs); return Promise.resolve(); },
  }));
  assertEquals(res.status, 200);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].length, 1); // one token -> one message
});

Deno.test("records the alert so it is not repeated", async () => {
  let recorded: unknown[] = [];
  await handleBudgetCheck(post(), makeDeps({
    recordAlerts: (_u, rows) => { recorded = rows; return Promise.resolve(); },
  }));
  assertEquals(recorded.length, 1);
  assertEquals((recorded[0] as { kind: string }).kind, "approaching");
  assertEquals((recorded[0] as { cycle_key: string }).cycle_key, "2026-07");
});

Deno.test("an already-sent alert is skipped and no push goes out", async () => {
  let pushed = false;
  await handleBudgetCheck(post(), makeDeps({
    listSentAlerts: () => Promise.resolve([
      { budget_id: "b1", kind: "approaching", cycle_key: "2026-07", category_slug: "food" },
    ]),
    sendPush: () => { pushed = true; return Promise.resolve(); },
  }));
  assertEquals(pushed, false);
});

Deno.test("no budgets and no insights -> no push, still 200", async () => {
  let pushed = false;
  const res = await handleBudgetCheck(post(), makeDeps({
    listBudgets: () => Promise.resolve([]),
    sendPush: () => { pushed = true; return Promise.resolve(); },
  }));
  assertEquals(res.status, 200);
  assertEquals(pushed, false);
});

Deno.test("a user with no push token records alerts but sends nothing", async () => {
  let pushed = false;
  let recorded = 0;
  await handleBudgetCheck(post(), makeDeps({
    getPushTokens: () => Promise.resolve([]),
    sendPush: () => { pushed = true; return Promise.resolve(); },
    recordAlerts: (_u, rows) => { recorded = rows.length; return Promise.resolve(); },
  }));
  assertEquals(pushed, false);
  assertEquals(recorded, 1);
});

Deno.test("insights are included alongside budget alerts", async () => {
  let recorded: Array<{ kind: string }> = [];
  await handleBudgetCheck(post(), makeDeps({
    getCategoryHistory: () => Promise.resolve([
      { categorySlug: "shopping", cycleSpend: 3000, avg3mMonthly: 1000, weekCount: 0, avgWeekCount: 0 },
    ]),
    recordAlerts: (_u, rows) => { recorded = rows as Array<{ kind: string }>; return Promise.resolve(); },
  }));
  assert(recorded.some((r) => r.kind === "insight_spike"));
});

Deno.test("one user failing does not abort the others", async () => {
  let recordedUsers: string[] = [];
  await handleBudgetCheck(post(), makeDeps({
    listActiveUsers: () => Promise.resolve([
      { userId: "bad", monthStartDay: 1, locale: "en" },
      { userId: "good", monthStartDay: 1, locale: "en" },
    ]),
    getCycleSpend: (userId) => {
      if (userId === "bad") throw new Error("db blew up");
      return Promise.resolve({ overall: 900, byCategory: { food: 900 } });
    },
    recordAlerts: (u) => { recordedUsers.push(u); return Promise.resolve(); },
  }));
  assertEquals(recordedUsers, ["good"]);
});

Deno.test("a failed push is swallowed and does NOT record the alert (retry next run)", async () => {
  let recordCalled = false;
  const res = await handleBudgetCheck(post(), makeDeps({
    sendPush: () => Promise.reject(new Error("network blew up")),
    recordAlerts: () => { recordCalled = true; return Promise.resolve(); },
  }));
  assertEquals(res.status, 200);
  assertEquals(recordCalled, false);
});

Deno.test("a successful push still records the alert", async () => {
  let recordCalled = false;
  let sendCalled = false;
  const res = await handleBudgetCheck(post(), makeDeps({
    sendPush: () => { sendCalled = true; return Promise.resolve(); },
    recordAlerts: () => { recordCalled = true; return Promise.resolve(); },
  }));
  assertEquals(res.status, 200);
  assertEquals(sendCalled, true);
  assertEquals(recordCalled, true);
});

Deno.test("more than 3 fresh alerts: body shows +N more, but ALL alerts are recorded", async () => {
  let sentBody = "";
  let recorded: unknown[] = [];
  await handleBudgetCheck(post(), makeDeps({
    listBudgets: () => Promise.resolve([
      { id: "b1", scope: "category", category_slug: "food", period: "monthly", amount: 1000, warn_pct: 80 },
      { id: "b2", scope: "category", category_slug: "transport", period: "monthly", amount: 500, warn_pct: 80 },
      { id: "b3", scope: "category", category_slug: "bills", period: "monthly", amount: 200, warn_pct: 80 },
      { id: "b4", scope: "category", category_slug: "shopping", period: "monthly", amount: 300, warn_pct: 80 },
      { id: "b5", scope: "category", category_slug: "fun", period: "monthly", amount: 100, warn_pct: 80 },
    ]),
    getCycleSpend: () => Promise.resolve({
      overall: 2000,
      byCategory: { food: 900, transport: 480, bills: 200, shopping: 290, fun: 95 },
    }),
    sendPush: (msgs) => { sentBody = msgs[0].body; return Promise.resolve(); },
    recordAlerts: (_u, rows) => { recorded = rows; return Promise.resolve(); },
  }));
  assert(sentBody.includes("+2 more"), `expected "+2 more" in body, got: ${sentBody}`);
  assertEquals(recorded.length, 5);
});

Deno.test("GET is rejected", async () => {
  const res = await handleBudgetCheck(
    new Request("http://localhost", { method: "GET" }), makeDeps(),
  );
  assertEquals(res.status, 405);
});

// 2026-07-11 is a Saturday — the first run of a new weekly cycle.
const SATURDAY = new Date("2026-07-11T03:00:00Z");

Deno.test("recap: sends a separate digest push on Saturday", async () => {
  const bodies: string[] = [];
  await handleBudgetCheck(post(), makeDeps({
    now: () => SATURDAY,
    getCycleSpend: () => Promise.resolve({ overall: 300, byCategory: { food: 300 } }),
    sendPush: (msgs) => {
      for (const m of msgs) bodies.push(m.body);
      return Promise.resolve();
    },
  }));
  // 300/1000 triggers no threshold alert, so the ONLY push is the recap.
  assertEquals(bodies.length, 1);
  assert(bodies[0].includes("food"));
});

Deno.test("recap: not sent midweek", async () => {
  let pushed = 0;
  await handleBudgetCheck(post(), makeDeps({
    now: () => new Date("2026-07-14T03:00:00Z"), // Tuesday
    getCycleSpend: () => Promise.resolve({ overall: 300, byCategory: { food: 300 } }),
    sendPush: () => { pushed++; return Promise.resolve(); },
  }));
  assertEquals(pushed, 0);
});

Deno.test("recap: skipped when already sent for this week", async () => {
  let pushed = 0;
  await handleBudgetCheck(post(), makeDeps({
    now: () => SATURDAY,
    getCycleSpend: () => Promise.resolve({ overall: 300, byCategory: { food: 300 } }),
    listSentAlerts: () => Promise.resolve([
      { budget_id: null, kind: "recap", cycle_key: "2026-W28", category_slug: null },
    ]),
    sendPush: () => { pushed++; return Promise.resolve(); },
  }));
  assertEquals(pushed, 0);
});

Deno.test("recap: more than 4 budgets -> body shows +N more, meta records ALL lines", async () => {
  let sentBody = "";
  let recordedMeta: { lines: string[] } | undefined;
  await handleBudgetCheck(post(), makeDeps({
    now: () => SATURDAY,
    listBudgets: () => Promise.resolve([
      { id: "b1", scope: "category", category_slug: "food", period: "monthly", amount: 1000, warn_pct: 80 },
      { id: "b2", scope: "category", category_slug: "transport", period: "monthly", amount: 500, warn_pct: 80 },
      { id: "b3", scope: "category", category_slug: "bills", period: "monthly", amount: 200, warn_pct: 80 },
      { id: "b4", scope: "category", category_slug: "shopping", period: "monthly", amount: 300, warn_pct: 80 },
      { id: "b5", scope: "category", category_slug: "fun", period: "monthly", amount: 100, warn_pct: 80 },
      { id: "b6", scope: "category", category_slug: "health", period: "monthly", amount: 100, warn_pct: 80 },
    ]),
    getCycleSpend: () => Promise.resolve({
      overall: 0,
      // Kept low so no threshold alert fires — the recap push is the ONLY push.
      byCategory: { food: 10, transport: 10, bills: 10, shopping: 10, fun: 10, health: 10 },
    }),
    sendPush: (msgs) => { sentBody = msgs[0].body; return Promise.resolve(); },
    recordAlerts: (_u, rows) => {
      recordedMeta = (rows[0].meta as unknown as { lines: string[] });
      return Promise.resolve();
    },
  }));
  assert(sentBody.includes("+2 more"), `expected "+2 more" in body, got: ${sentBody}`);
  assertEquals(recordedMeta?.lines.length, 6);
});

Deno.test("recap: lines are ordered highest-percentage-first", async () => {
  let recordedMeta: { lines: string[] } | undefined;
  await handleBudgetCheck(post(), makeDeps({
    now: () => SATURDAY,
    listBudgets: () => Promise.resolve([
      // warn_pct 95 (above the highest spend below) so no threshold alert
      // fires — the recap push must be the ONLY push here.
      { id: "b1", scope: "category", category_slug: "food", period: "monthly", amount: 1000, warn_pct: 95 },
      { id: "b2", scope: "category", category_slug: "transport", period: "monthly", amount: 1000, warn_pct: 95 },
      { id: "b3", scope: "category", category_slug: "bills", period: "monthly", amount: 1000, warn_pct: 95 },
    ]),
    getCycleSpend: () => Promise.resolve({
      overall: 0,
      // Deliberately out of category-definition order: bills highest, transport
      // mid, food lowest, so a correct sort must reorder them.
      byCategory: { food: 50, transport: 300, bills: 900 },
    }),
    recordAlerts: (_u, rows) => {
      recordedMeta = (rows[0].meta as unknown as { lines: string[] });
      return Promise.resolve();
    },
  }));
  assertEquals(recordedMeta?.lines, ["bills 90%", "transport 30%", "food 5%"]);
});
