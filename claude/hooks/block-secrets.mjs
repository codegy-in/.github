#!/usr/bin/env node
// Blocks secrets from entering the repo (README §10 rule 1).
//
//   PreToolUse hook:  reads the tool call JSON on stdin; exit 2 blocks it and
//                     tells Claude why.
//   CI / manual:      node .claude/hooks/block-secrets.mjs --scan
//                     scans every git-tracked file; exit 1 on a hit.
//
// Placeholders ($VAR, <value>, [YOUR-PASSWORD], your-...) are allowed.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Values that are references or placeholders, never secrets.
const PLACEHOLDER = /^(?:[$<[{`*]|your-|xx+$|process\.env|import\.meta|Deno\.env|env\.)/i;

// A Supabase JWT whose role isn't service_role (the public anon key).
function isPublicJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()).role !== "service_role";
  } catch {
    return false;
  }
}

const RULES = [
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Meta access token", re: /\bEAA[A-Za-z0-9]{30,}/ },
  {
    name: "Resend API key",
    re: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{6,}/g,
    // Real keys mix case and digits; code identifiers like re_render_x don't.
    allow: (m) => !(/\d/.test(m[0]) && /[A-Z]/.test(m[0])),
  },
  { name: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: "secret in an env-style assignment",
    re: /\b[A-Z0-9_]*(?:API_KEY|SECRET|SECRET_KEY|ACCESS_KEY|SERVICE_ROLE_KEY|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY)\s*[:=]\s*["']?([A-Za-z0-9_\-+/=.]{16,})/g,
    allow: (m) => PLACEHOLDER.test(m[1]) || !/\d/.test(m[1]),
  },
  {
    name: "secret in JSON",
    re: /"(?:password|passwd|secret|token|api_?key|access_token|client_secret)"\s*:\s*"([^"\s]{8,})"/gi,
    allow: (m) => PLACEHOLDER.test(m[1]) || /^\*+$/.test(m[1]),
  },
  {
    name: "literal bearer token",
    re: /\bBearer\s+([A-Za-z0-9._~+/=-]{24,})/g,
    allow: (m) => PLACEHOLDER.test(m[1]) || isPublicJwt(m[1]),
  },
  { name: "Supabase personal access token", re: /\bsbp_[a-f0-9]{40}\b/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { name: "private key", re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  {
    name: "Postgres URL with password",
    re: /postgres(?:ql)?:\/\/[^:\s/@]{1,200}:([^@\s]{3,200})@/g,
    allow: (m) => /^[$<[{]|^\*+$|^(?:pass|password|secret)$|^your-/i.test(m[1]),
  },
  {
    name: "hard-coded password",
    re: /\b(?:password|passwd|pwd|PW)\s*[:=]\s*["']([^"'\s]{6,})["']/gi,
    allow: (m) => /^[$<[{]|^your-|^\*+$|^x+$/i.test(m[1]),
  },
  {
    name: "service_role JWT",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g,
    allow: (m) => {
      try {
        const payload = JSON.parse(Buffer.from(m[1], "base64url").toString());
        return payload.role !== "service_role";
      } catch {
        return true;
      }
    },
  },
];

export function findSecrets(text) {
  const hits = [];
  for (const rule of RULES) {
    const re = rule.re.global ? rule.re : new RegExp(rule.re.source, rule.re.flags + "g");
    for (const m of text.matchAll(re)) {
      if (rule.allow?.(m)) continue;
      hits.push(rule.name);
      break;
    }
  }
  return hits;
}

// Shell commands that would print a secret into the session transcript.
// Matched only where a command starts (start of line, after ; & | ( $( or a
// -c quote, so `bash -c 'cat .env'` counts). A command that only MENTIONS one of
// these in a message body can still trip it: pass bodies with -F/--body-file.
// Not covered: grep/sed/awk of env files, `security dump-keychain -d`.
const AT_START = String.raw`(?:^|[;&|\n(]|\$\(|-c\s+["'])\s*(?:sudo\s+|env\s+|time\s+)?`;
const END = String.raw`(?=[\s;|&)"']|$)`;
const COMMAND_RULES = [
  {
    name: "an env file printed to the output",
    re: new RegExp(AT_START + String.raw`(?:cat|less|more|head|tail|bat|strings)\b[^|;&\n]*?["']?[\w./-]*\.env(?!(?:\.[\w-]+)*\.(?:example|sample|template|ts|tsx|js|mjs|cjs|md)` + END + String.raw`)(?:\.[\w-]+)*` + END, "m"),
  },
  { name: "Vercel env values pulled into a file", re: new RegExp(AT_START + String.raw`(?:(?:npx|pnpm\s+dlx|bunx)\s+)?vercel\s+env\s+pull\b`, "m") },
];

// Keychain reads: -w / -g print the password. Allowed when the value is
// captured by $(...) for an assignment or argument, or sent to a file or a
// pipe into another program; never echoed to the output.
const KEYCHAIN_READ = /\bsecurity\s+find-(?:generic|internet)-password\b[^;&|\n]*?\s-[A-Za-z]*[wg][A-Za-z]*\b/;
const KEYCHAIN_SEGMENT = /\bsecurity\s+find-(?:generic|internet)-password\b([^;&\n]*)/g;
function stripCaptures(command) {
  let prev;
  let out = command;
  do {
    prev = out;
    out = out.replace(/\$\([^()]*\)/g, "");
  } while (out !== prev);
  return out;
}
function keychainPrints(command) {
  if (!KEYCHAIN_READ.test(command)) return false;
  // Echoing a captured value prints it (unless redirected to a file).
  if (/\b(?:echo|printf)\b[^;&|\n>]*\$\(\s*security\s+find-[^;&\n]*$/m.test(command) && !/>\s*[^\s&]/.test(command)) return true;
  if (/\bcat\b[^;&|\n]*\$\(\s*security\s+find-/.test(command)) return true;
  const outside = stripCaptures(command);
  for (const m of outside.matchAll(KEYCHAIN_SEGMENT)) {
    const rest = m[1];
    if (!/\s-[A-Za-z]*[wg][A-Za-z]*\b/.test(rest)) continue;
    // Output into a file, or a pipe into a program other than cat/tee/less.
    // stdout (not 2>) sent to a file other than the terminal.
    const toFile = rest.match(/(?:^|[^\d&])1?>{1,2}\s*([^\s&|;]+)/);
    if (toFile && !/^\/dev\/(?:stdout|stderr|tty)$/.test(toFile[1])) continue;
    const pipe = rest.match(/\|\s*(\S+)/);
    if (pipe && !/^(?:cat|tee|less|more|head|tail|xargs)$/.test(pipe[1])) continue;
    return true;
  }
  return false;
}

export function commandProblems(command) {
  const out = COMMAND_RULES.filter((r) => r.re.test(command)).map((r) => r.name);
  if (keychainPrints(command)) out.unshift("a Keychain secret printed to the output (capture it with $(...) or read it inside a script)");
  return out;
}

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain && process.argv.includes("--scan")) {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((f) => !/\.(png|jpe?g|gif|webp|ico|woff2?|lock)$|package-lock\.json$/.test(f));
  let bad = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const hits = findSecrets(text);
    if (hits.length) {
      bad++;
      console.error(`${file}: ${hits.join(", ")}`);
    }
  }
  if (bad) {
    console.error(`\n${bad} file(s) contain secrets. Move them to Vercel env, Supabase Vault or Bitwarden.`);
    process.exit(1);
  }
  console.log(`secret scan: ${files.length} files clean`);
  process.exit(0);
}

if (isMain) {
let input = "";
for await (const chunk of process.stdin) input += chunk;
let call;
try {
  call = JSON.parse(input);
} catch {
  process.exit(0);
}
const hits = findSecrets(strings(call.tool_input).join("\n"));
if (call.tool_name === "Bash" && typeof call.tool_input?.command === "string") {
  const p = commandProblems(call.tool_input.command);
  if (p.length) {
    console.error(`Blocked: this command would put ${p.join(", ")} into the session transcript. Use the value inside a script or a $(...) capture instead. (If the command only mentions it, e.g. in a commit message, use -F/--body-file.)`);
    process.exit(2);
  }
}
if (hits.length) {
  console.error(
    `Blocked: this ${call.tool_name} call contains a ${hits.join(", ")}. ` +
      "Secrets never go into the repo, docs or commands (README §10). " +
      "Reference an env var instead and store the value in Vercel env, Supabase Vault or Bitwarden.",
  );
  process.exit(2);
}
process.exit(0);
}
