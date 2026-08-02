# Edge Functions

## categorize

`POST /functions/v1/categorize` — `verify_jwt = true`.

**Request:** `{ "text": string, "locale"?: "ar" | "en" }`
**Response (200):** `{ "parsed": ParsedTransaction }`

Status codes: `400` bad/empty/invalid-JSON body, `405` non-POST,
`413` text longer than 2000 chars, `500` missing `GROQ_API_KEY`,
`502` upstream (Groq) failure.

Calls **Groq** `llama-3.3-70b-versatile` via the OpenAI-compatible Chat
Completions API in JSON mode (`max_tokens: 256`, `temperature: 0`). The model's
`category_slug` is validated against the 17 category slugs, falling back to
`other_expense` / `other_income` when out of range.

## ingest-sms internal transfer pairing

`ingest-sms` extracts a bank reference from Instapay messages. When the same
user receives an incoming and outgoing SMS with the same reference, amount, and
nearby timestamp, both rows are marked as internal transfers. They remain in
history but are excluded from dashboard totals, budgets, balances, and pending
review. Messages with a reference wait briefly before their pending push so the
mirrored half can arrive without creating a false review alert. Amount/time
alone never pair transactions.

## Local development

1. Provide the secret (gitignored):

   ```bash
   cp supabase/functions/.env.example supabase/functions/.env
   # edit supabase/functions/.env -> real GROQ_API_KEY (gsk_...) from console.groq.com
   ```

2. Start the function runtime (reads `supabase/functions/.env` automatically):

   ```bash
   supabase functions serve categorize
   ```

3. Invoke it. `verify_jwt = true`, so you need a JWT. Locally the anon key works
   as a bearer for a quick smoke test:

   ```bash
   curl -i -X POST http://127.0.0.1:54321/functions/v1/categorize \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "apikey: $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"text":"spent 50 EGP on coffee","locale":"en"}'
   ```

   Expected: `200` with `{ "parsed": { "type": "expense", "amount": 50, ... } }`.

> A physical iPhone must use the Mac LAN IP (e.g. `http://192.168.x.x:54321`),
> not `localhost`. Same Wi-Fi; allow port 54321 through the macOS firewall.

## Production secrets

Local `.env` is dev-only. For deployed functions set the secret separately:

```bash
supabase secrets set GROQ_API_KEY=gsk_...
supabase functions deploy categorize
```

## Tests

Pure Deno tests with an injected fake Groq transport (no network, no key):

```bash
deno test --allow-env --config supabase/functions/deno.json supabase/functions/tests/
```
