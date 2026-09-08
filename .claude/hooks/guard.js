#!/usr/bin/env node
'use strict';
// PreToolUse guard for recipe-social-network.
// Enforces the rules in CLAUDE.md and MEM.md that a hook can check mechanically:
//   - secrets live only in .env / .env.local, which Claude never reads, writes or stages
//   - no AI attribution lines in commits; no PRs through `gh` (PRs go through GitKraken)
//   - SPEC.md holds only settled requirements: no TBD / TODO / open questions
//   - per-folder CLAUDE.md files are Rotem's; editing one asks for confirmation
//   - renderer and desktop code never carry a provider key, SDK or URL (SPEC §11.3)
// Reads the hook JSON on stdin. Prints a decision on stdout only when it objects;
// silence means "no objection, normal permission flow applies".

const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    return;
  }
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  // agent_id is present only when the hook fires inside a subagent call.
  const agent = input.agent_id ? String(input.agent_type || 'subagent') : null;
  let verdict = null;
  if (tool === 'Bash') verdict = checkBash(String(ti.command || ''), agent);
  else if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') verdict = checkFile(ti, agent);
  if (verdict) emit(verdict.decision, verdict.reason);
});

const SPEC_FILE = /\.(spec|test)\.(ts|tsx|js|jsx|mts|cts)$/i;

// Unit tests are written only by the test-writer subagent (Rotem, 2026-09-08).
function checkTestAuthor(name, agent) {
  if (!SPEC_FILE.test(name)) return null;
  if (agent === 'test-writer') return null;
  if (!agent) {
    return {
      decision: 'deny',
      reason: `${name} is a unit test. Unit tests are written only by the test-writer subagent, never by the main session (Rotem, 2026-09-08). Spawn test-writer with the files and SPEC IDs.`,
    };
  }
  return {
    decision: 'ask',
    reason: `${name} is a unit test and the ${agent} subagent is about to write it; test-writer is the designated author (Rotem, 2026-09-08). Confirm.`,
  };
}

function emit(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

function isSecretEnvFile(name) {
  return name === '.env' || name === '.env.local' || /^\.env\..+\.local$/.test(name);
}

function basename(p) {
  return path.win32.basename(String(p || '').replace(/["'`]/g, ''));
}

// ---------- Bash ----------

function checkBash(cmd, agent) {
  const tokens = cmd.split(/[\s"'`;&|<>()]+/).filter(Boolean);
  const writes = /(^|[\s;&|])(>|>>|sed\s+-i|tee\s|cp\s|mv\s|cat\s*<<)/.test(cmd);
  for (const t of tokens) {
    if (writes) {
      const v = checkTestAuthor(basename(t), agent);
      if (v) return v;
    }
    if (isSecretEnvFile(basename(t))) {
      return {
        decision: 'deny',
        reason:
          `The command references ${basename(t)}. Secrets live only in .env.local and Claude never reads, writes, copies or stages it (CLAUDE.md). ` +
          'Only .env.example is touched from here; Rotem fills .env.local himself.',
      };
    }
  }

  if (/\bgit\s+commit\b/.test(cmd)) {
    if (/co-authored-by|generated with|🤖/i.test(cmd)) {
      return {
        decision: 'deny',
        reason:
          'Commit messages carry no AI attribution: no Co-Authored-By, no "Generated with" (CLAUDE.md; MEM.md rule 6). Remove the trailer and commit again.',
      };
    }
    if (/--no-verify\b/.test(cmd)) {
      return { decision: 'ask', reason: 'This commit skips git hooks (--no-verify). Confirm with Rotem.' };
    }
    if (/--amend\b/.test(cmd)) {
      return { decision: 'ask', reason: 'This rewrites the last commit (--amend). Confirm with Rotem.' };
    }
  }

  if (/\bgit\s+push\b/.test(cmd) && /(\s--force\b|\s-f\b|\s--force-with-lease\b)/.test(cmd)) {
    return { decision: 'ask', reason: 'Force push. Confirm with Rotem before rewriting remote history.' };
  }

  if (/\bgh\s+pr\s+create\b/.test(cmd)) {
    return {
      decision: 'deny',
      reason: 'Pull requests are opened through the GitKraken MCP tools, not gh (MEM.md rule 6). Use /commit for the workflow.',
    };
  }

  return null;
}

// ---------- Edit / Write / MultiEdit ----------

function checkFile(ti, agent) {
  const filePath = String(ti.file_path || '');
  const name = basename(filePath);
  const text = newText(ti);
  const norm = filePath.replace(/\\/g, '/');

  const testVerdict = checkTestAuthor(name, agent);
  if (testVerdict) return testVerdict;

  if (isSecretEnvFile(name)) {
    return {
      decision: 'deny',
      reason: `${name} holds secrets and is never written by Claude (CLAUDE.md). Change .env.example instead and let Rotem fill .env.local.`,
    };
  }

  if (/^spec\.md$/i.test(name)) {
    const hit = text.match(/\bTBD\b|\bTODO\b|\bto be decided\b|\bopen question\b|^[^\n]*\?[ \t]*$/im);
    if (hit) {
      return {
        decision: 'deny',
        reason:
          `SPEC.md holds only settled requirements; this edit adds "${hit[0].trim()}". No TBD, TODO or questions in SPEC.md: ask Rotem in chat and write the decision (CLAUDE.md; SPEC §0).`,
      };
    }
  }

  if (/^claude\.md$/i.test(name)) {
    return {
      decision: 'ask',
      reason: 'Per-folder CLAUDE.md constraints are written by Rotem (MEM.md rule 5). Confirm Rotem asked for this exact change.',
    };
  }

  if (/\/(apps\/(web|desktop)|libs\/(web|shared))\//.test(norm) && !/\.(md|json)$/i.test(name)) {
    const leak = text.match(
      /OPENROUTER_KEY|THEMEALDB_KEY|USDA_FDC_KEY|JWT_(ACCESS|REFRESH)_SECRET|FIREBASE_|firebase-admin|@google-cloud\/storage|openrouter\.ai|themealdb\.com|api\.nal\.usda\.gov|open-meteo\.com|navigator\.geolocation/,
      );
    if (leak) {
      return {
        decision: 'deny',
        reason:
          `"${leak[0]}" does not belong in ${norm.split('/').slice(-3).join('/')}: renderer, desktop and shared code hold no provider key, SDK, URL or geolocation call (SPEC §11.3, WX-8). Only apps/api and libs/api talk to third parties.`,
      };
    }
  }

  return null;
}

function newText(ti) {
  if (typeof ti.content === 'string') return ti.content;
  if (typeof ti.new_string === 'string') return ti.new_string;
  if (Array.isArray(ti.edits)) return ti.edits.map((e) => e.new_string || '').join('\n');
  return '';
}
