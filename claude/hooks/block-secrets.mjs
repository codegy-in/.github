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
import { readFileSync } from "node:fs";

const RULES = [
  { name: "Supabase personal access token", re: /\bsbp_[a-f0-9]{40}\b/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { name: "private key", re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  {
    name: "Postgres URL with password",
    re: /postgres(?:ql)?:\/\/[^:\s/@]+:([^@\s]{3,})@/g,
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

function findSecrets(text) {
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

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

if (process.argv.includes("--scan")) {
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

let input = "";
for await (const chunk of process.stdin) input += chunk;
let call;
try {
  call = JSON.parse(input);
} catch {
  process.exit(0);
}
const hits = findSecrets(strings(call.tool_input).join("\n"));
if (hits.length) {
  console.error(
    `Blocked: this ${call.tool_name} call contains a ${hits.join(", ")}. ` +
      "Secrets never go into the repo, docs or commands (README §10). " +
      "Reference an env var instead and store the value in Vercel env, Supabase Vault or Bitwarden.",
  );
  process.exit(2);
}
process.exit(0);
