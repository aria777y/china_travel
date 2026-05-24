import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexPath = resolve(root, "index.html");
const schemaPath = resolve(root, "supabase/schema.sql");
const requiredFiles = [
  "assets/roadtrip-config.js",
  "assets/roadtrip-collab.css",
  "assets/roadtrip-api.js",
  "assets/roadtrip-collab.js"
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

const html = readFileSync(indexPath, "utf8");
const rawMatch = html.match(/const rawPlan = `\n([\s\S]*?)\n`\.trim\(\);/);
if (!rawMatch) {
  fail("rawPlan block missing");
} else {
  const lines = rawMatch[1].trim().split(/\n+/);
  const bad = lines.map((line, index) => [index + 1, line.split("|").length]).filter(([, count]) => count !== 13);
  const days = lines.reduce((sum, line) => sum + Number(line.split("|")[3]), 0);
  if (bad.length) fail(`rawPlan rows with invalid column count: ${JSON.stringify(bad)}`);
  if (days !== 365) fail(`expanded route has ${days} days instead of 365`);
}

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) fail(`${file} missing`);
}

const htmlNeedles = [
  'id="authBar"',
  'id="collabDrawer"',
  'id="profileModal"',
  "window.ROADTRIP_DAYS = days",
  'data-collab-kind="notes"',
  'data-collab-kind="comments"',
  "roadtrip-api.js",
  "roadtrip-collab.js"
];
for (const needle of htmlNeedles) {
  if (!html.includes(needle)) fail(`index.html missing ${needle}`);
}

if (existsSync(schemaPath)) {
  const schema = readFileSync(schemaPath, "utf8");
  const schemaNeedles = [
    "create table if not exists public.profiles",
    "unique(display_name_key)",
    "alter table public.profiles enable row level security",
    "alter table public.notes enable row level security",
    "alter table public.comments enable row level security",
    "create policy \"Admins moderate notes\"",
    "create policy \"Admins moderate comments\"",
    "create or replace function public.normalize_display_name",
    "create or replace function public.has_profile"
  ];
  for (const needle of schemaNeedles) {
    if (!schema.includes(needle)) fail(`schema.sql missing ${needle}`);
  }
}

const apiPath = resolve(root, "assets/roadtrip-api.js");
if (existsSync(apiPath)) {
  const api = readFileSync(apiPath, "utf8");
  for (const needle of [
    "window.roadtripApi",
    "normalizeDisplayName",
    "signInWithOAuth",
    "saveProfile",
    "listNotes",
    "listComments",
    "hideEntry"
  ]) {
    if (!api.includes(needle)) fail(`roadtrip-api.js missing ${needle}`);
  }
}

const collabPath = resolve(root, "assets/roadtrip-collab.js");
if (existsSync(collabPath)) {
  const collab = readFileSync(collabPath, "utf8");
  for (const needle of [
    "window.roadtripCollab",
    "openProfileModal",
    "openDrawer",
    "loadEntries",
    "renderAuthBar",
    "handleSubmit",
    "handleEntryAction",
    "handleProfileSubmit",
    "api.saveProfile",
    "api.createNote",
    "api.createComment"
  ]) {
    if (!collab.includes(needle)) fail(`roadtrip-collab.js missing ${needle}`);
  }
}

if (!process.exitCode) {
  console.log("PASS: roadtrip static site verification succeeded");
}
