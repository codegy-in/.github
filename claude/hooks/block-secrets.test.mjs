// Tests for block-secrets.mjs. Run: node --test claude/hooks/*.test.mjs
// Secret-shaped strings are assembled at runtime so this file itself passes
// the scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findSecrets, commandProblems } from "./block-secrets.mjs";

const HOOK = fileURLToPath(new URL("./block-secrets.mjs", import.meta.url));

const j = (...p) => p.join("");
const jwt = (payload) => j("eyJhbGciOiJIUzI1NiJ9.", Buffer.from(JSON.stringify(payload)).toString("base64url"), ".", "s".repeat(30));

const BLOCK = {
  "Anthropic key": j("ANTHROPIC_API_KEY=sk-", "ant-api03-", "A1b2".repeat(10)),
  "Anthropic key inline": j("key: 'sk-", "ant-", "Zz9_".repeat(8), "'"),
  "Meta token": j("token = 'EA", "AG", "Zx9Q".repeat(12), "'"),
  "Resend key": j("re_", "Ab12Cd34", "_", "Ef56Gh78Ij90Kl"),
  "AWS key": j("AK", "IA", "ABCDEFGHIJKLMNOP"),
  "service_role JWT": jwt({ role: "service_role", iss: "supabase" }),
  "quoted password": j('password = "', "Hunter2Hunter2", '"'),
  "JSON password": j('{"password": "', "Sup3rS3cretValue", '"}'),
  "JSON token": j('{"api_key":"', "k3yk3yk3yk3yk3yk3y", '"}'),
  "unquoted env password": j("DB_PASSWORD=", "Q8vX2mN4pL7rT1wZ"),
  "unquoted env token": j("VERCEL_TOKEN=", "aB3dE5gH7jK9mN1pQ3sT5vX"),
  "literal bearer": j("Authorization: Bearer ", "aB3dE5gH7jK9mN1pQ3sT5vX7z"),
  "Supabase secret key": j("sb_", "secret_", "x".repeat(30)),
  "Postgres URL": j("postgres://postgres:", "Kq8sPz2LmN", "@db.example.supabase.co:5432/postgres"),
  "Supabase secret key env": j("SUPABASE_SECRET_KEY=", "Ab3dEf5hIj7lMn9pQr"),
  "service role key env": j("SUPABASE_SERVICE_ROLE_KEY: ", "Ab3dEf5hIj7lMn9pQr"),
  "AWS secret access key": j("AWS_SECRET_ACCESS_KEY=", "wJalrXUtnFEMI/K7MDENG/bPxRfiCY1EXAMPLE"),
};

const ALLOW = {
  "anon JWT": jwt({ role: "anon", iss: "supabase" }),
  "env reference": "LEADS_INGEST_TOKEN = process.env.LEADS_INGEST_TOKEN",
  "template bearer": "Authorization: `Bearer ${process.env.CRON_SECRET}`",
  "shell variable": 'curl -H "Authorization: Bearer $TOKEN" https://x',
  "placeholder password": 'password = "<your-password>"',
  "short placeholder": "SUPABASE_SECRET_KEY: ci-placeholder",
  "code identifier": "const re_renderCount = 3; function re_render_component_tree() {}",
  "prose": "Set CRON_SECRET on the hq Vercel project and the same value as Vault secret hq_cron_secret.",
  "lowercase variable": "const token = await getToken(); const password = form.get('password');",
  "env name list": "| `WHATSAPP_TOKEN` | Meta access token |",
  "masked": 'password: "********"',
  "anon JWT as bearer": "Authorization: Bearer " + jwt({ role: "anon", iss: "supabase" }),
  "storage key constant": "const DESIGN_PREFS_KEY = 'codegy.design.prefs.v2'",
};

for (const [name, text] of Object.entries(BLOCK)) {
  test(`blocks ${name}`, () => assert.ok(findSecrets(text).length > 0, `not caught: ${name}`));
}
for (const [name, text] of Object.entries(ALLOW)) {
  test(`allows ${name}`, () => assert.deepEqual(findSecrets(text), [], `false positive: ${name}`));
}

test("blocks commands that print a secret into the session", () => {
  for (const c of [
    "security find-generic-password -s codegy-anthropic-api-key -w",
    "security find-generic-password -s x -a y -w; echo done",
    "security find-generic-password -s x -w 2>/dev/null",
    "security find-generic-password -s x -w | cat",
    "security find-generic-password -s x -w | tee /tmp/k",
    "security find-generic-password -w -s x",
    "security find-generic-password -ws x",
    "security find-generic-password -g -s x",
    "echo $(security find-generic-password -s x -w)",
    'security find-generic-password -s "$(whoami)-key" -w',
    'security find-generic-password -a "$(id -un)" -s x -w',
    'cat ".env.local"',
    "bash -c 'cat .env.local'",
    'sh -c "cat .env"',
    "time cat .env",
    "bunx vercel env pull",
    "cat hq/.env.local",
    "cat .env.production.local",
    "head -5 .env",
    "npx vercel env pull .env.local",
  ]) assert.ok(commandProblems(c).length > 0, `not caught: ${c}`);
});

test("allows commands that use a secret without printing it", () => {
  for (const c of [
    "security find-generic-password -s codegy-hq-test-password",
    'security add-generic-password -U -s x -a y -w "$(pbpaste)"',
    "node tools/walk/walk.mjs public",
    "cat .env.example",
    "git diff .env.example",
    'curl -H "Authorization: Bearer $(security find-generic-password -s x -w)" https://x',
    'TOKEN="$(security find-generic-password -s x -w)" node script.mjs',
    'git commit -m "Hook refuses cat .env.local and vercel env pull"',
    'grep -rn "vercel env pull" docs',
    "cat lib/.env.ts",
    'X="$(security find-generic-password -a "$(id -un)" -s x -w)"; node s.mjs',
    "printf 'K=%s' \"$(security find-generic-password -s x -w)\" > /tmp/e",
    "security find-generic-password -s x -w | pbcopy",
    "security find-generic-password -s x -w | npx supabase secrets set --env-file /dev/stdin",
    'git commit -F /tmp/msg.txt',
    "cat .env.sample",
  ]) assert.deepEqual(commandProblems(c), [], `false positive: ${c}`);
});

test("runs as a hook: blocks a Bash call and passes a harmless one", () => {
  const run = (input) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "cat .env.local" } }).status, 2);
  assert.equal(run({ tool_name: "Write", tool_input: { content: j("sk-", "ant-", "Q".repeat(30)) } }).status, 2);
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "ls -la" } }).status, 0);
});

test("documents the limit: a heredoc body line that starts with a blocked command trips the rule", () => {
  // Bodies go through -F/--body-file; the block message says so.
  const c = "git commit -m \"$(cat <<'EOF'\nsummary\ncat .env.local is now refused\nEOF\n)\"";
  assert.ok(commandProblems(c).length > 0);
});
