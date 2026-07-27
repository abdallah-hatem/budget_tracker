// Edge Function: budget-check
// Invoked once daily by pg_cron + pg_net. For every user with budgets (or
// enough history for insights) it aggregates this cycle's CONFIRMED expense
// spend, evaluates thresholds / pace / insights, drops anything already sent
// this cycle, and delivers AT MOST ONE push per user.
//
// Every DB/network touch is behind `deps` so the tests run with no network.
//
// NOTE: this file contains ONLY the pure handler (`handleBudgetCheck`) and its
// types. The production `Deno.serve` wiring, Supabase client construction, and
// real dependency implementations are Task 7's job, not this one.
import { corsHeaders } from "../_shared/cors.ts";
import { cycleFor, type Cycle } from "../_shared/budgetCycles.ts";
import {
  detectInsights,
  evaluateBudget,
  type AlertDescriptor,
  type BudgetRow,
  type CategoryHistory,
} from "../_shared/budgetEval.ts";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ActiveUser {
  userId: string;
  monthStartDay: number;
  locale: string;
}

export interface SentAlert {
  budget_id: string | null;
  kind: string;
  cycle_key: string;
  category_slug: string | null;
}

export interface AlertRow {
  user_id: string;
  budget_id: string | null;
  kind: string;
  cycle_key: string;
  category_slug: string | null;
  meta: Record<string, unknown>;
}

export interface BudgetCheckDeps {
  now: () => Date;
  listActiveUsers: () => Promise<ActiveUser[]>;
  listBudgets: (userId: string) => Promise<BudgetRow[]>;
  getCycleSpend: (
    userId: string,
    start: Date,
    end: Date,
  ) => Promise<{ overall: number; byCategory: Record<string, number> }>;
  getCategoryHistory: (userId: string, cycle: Cycle) => Promise<CategoryHistory[]>;
  listSentAlerts: (userId: string, cycleKeys: string[]) => Promise<SentAlert[]>;
  recordAlerts: (userId: string, rows: AlertRow[]) => Promise<void>;
  getPushTokens: (userId: string) => Promise<string[]>;
  sendPush: (messages: ExpoPushMessage[]) => Promise<void>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Identity of an alert for dedup purposes — mirrors the DB unique index. */
function dedupKey(a: { budget_id?: string | null; budgetId?: string | null; kind: string; cycle_key?: string; cycleKey?: string; category_slug?: string | null; categorySlug?: string | null }): string {
  const budget = a.budget_id ?? a.budgetId ?? "";
  const cycle = a.cycle_key ?? a.cycleKey ?? "";
  const cat = a.category_slug ?? a.categorySlug ?? "";
  return `${budget}|${a.kind}|${cycle}|${cat}`;
}

/** Short human line per alert; the push body joins these with " · ". */
export function alertLine(a: AlertDescriptor, label: string): string {
  const m = a.meta as Record<string, number>;
  switch (a.kind) {
    case "exceeded": return `${label} over by E£${m.over}`;
    case "reached": return `${label} at 100%`;
    case "approaching": return `${label} ${m.pct}%`;
    case "pace": return `${label} on pace +E£${m.over}`;
    case "insight_spike": return `${label} up ${m.pctAbove}%`;
    case "insight_frequency": return `${label} ${m.count}x this week`;
    default: return label;
  }
}

export async function handleBudgetCheck(
  req: Request,
  deps: BudgetCheckDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const now = deps.now();
  const users = await deps.listActiveUsers();
  let notified = 0;

  for (const user of users) {
    // One user's failure must never abort the whole run.
    try {
      const budgets = await deps.listBudgets(user.userId);
      const monthly = cycleFor("monthly", now, user.monthStartDay);
      const weekly = cycleFor("weekly", now, user.monthStartDay);

      // Spend per cycle kind — fetched once each, not per budget.
      const monthlySpend = await deps.getCycleSpend(user.userId, monthly.start, monthly.end);
      const weeklySpend = budgets.some((b) => b.period === "weekly")
        ? await deps.getCycleSpend(user.userId, weekly.start, weekly.end)
        : { overall: 0, byCategory: {} as Record<string, number> };

      const descriptors: Array<AlertDescriptor & { cycleKey: string }> = [];

      for (const b of budgets) {
        const cycle = b.period === "weekly" ? weekly : monthly;
        const spendSet = b.period === "weekly" ? weeklySpend : monthlySpend;
        const spend = b.scope === "overall"
          ? spendSet.overall
          : spendSet.byCategory[b.category_slug ?? ""] ?? 0;
        const d = evaluateBudget(b, spend, cycle);
        if (d) descriptors.push({ ...d, cycleKey: cycle.key });
      }

      const history = await deps.getCategoryHistory(user.userId, monthly);
      for (const d of detectInsights(history, monthly)) {
        descriptors.push({ ...d, cycleKey: monthly.key });
      }

      if (descriptors.length === 0) continue;

      // Drop anything already sent for this cycle.
      const sent = await deps.listSentAlerts(user.userId, [monthly.key, weekly.key]);
      const seen = new Set(sent.map(dedupKey));
      const fresh = descriptors.filter((d) => !seen.has(dedupKey(d)));
      if (fresh.length === 0) continue;

      const alertRows: AlertRow[] = fresh.map((d) => ({
        user_id: user.userId,
        budget_id: d.budgetId,
        kind: d.kind,
        cycle_key: d.cycleKey,
        category_slug: d.categorySlug,
        meta: d.meta,
      }));

      const tokens = await deps.getPushTokens(user.userId);
      if (tokens.length === 0) {
        // Nothing can be delivered — record so the dedup filter still applies.
        await deps.recordAlerts(user.userId, alertRows);
        continue;
      }

      // ONE push per user: join the top few lines, noting any hidden overflow.
      const shown = fresh.slice(0, 3);
      const hidden = fresh.length - shown.length;
      const body = shown
        .map((d) => alertLine(d, d.categorySlug ?? "Overall"))
        .join(" · ") + (hidden > 0 ? ` +${hidden} more` : "");

      // Send BEFORE recording: for a once-daily job, a duplicate notification
      // (if recording fails after a successful send) is far less harmful than
      // an alert that silently never gets delivered because it was already
      // marked as sent before the push actually went out.
      await deps.sendPush(
        tokens.map((to) => ({
          to,
          title: "Budget check",
          body,
          data: { url: "/budgets" },
        })),
      );
      await deps.recordAlerts(user.userId, alertRows);
      notified++;
    } catch (_e) {
      continue;
    }
  }

  return json({ ok: true, users: users.length, notified }, 200);
}
