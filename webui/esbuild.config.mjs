import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const repoRoot = join(root, "..");
const docsDir = join(repoRoot, "docs");
const watch = process.argv.includes("--watch");

const appVersion = process.env.APP_VERSION || "dev";

function copyShellAssets() {
  const dest = join(docsDir, "assets", "shell");
  mkdirSync(dest, { recursive: true });
  cpSync(join(root, "shell", "styles.css"), join(dest, "styles.css"));
  cpSync(join(root, "shell", "chat-overrides.css"), join(dest, "chat-overrides.css"));
}

function writeIndexHtml() {
  const template = readFileSync(join(root, "index.template.html"), "utf8");
  const html = template.replaceAll("__APP_VERSION__", appVersion);
  writeFileSync(join(docsDir, "index.html"), html);
}

const buildOptions = {
  entryPoints: [join(root, "src", "main.ts")],
  bundle: true,
  outfile: join(docsDir, "assets", "chat.js"),
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  metafile: true,
  loader: { ".css": "css" },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

async function buildCssBundle() {
  const result = await esbuild.build({
    ...buildOptions,
    write: false,
  });
  mkdirSync(join(docsDir, "assets"), { recursive: true });
  const jsOut = result.outputFiles.find((f) => f.path.endsWith(".js"));
  if (jsOut) writeFileSync(join(docsDir, "assets", "chat.js"), jsOut.text);
  const cssFile = result.outputFiles.find((f) => f.path.endsWith(".css"));
  if (cssFile) {
    writeFileSync(join(docsDir, "assets", "chat.css"), cssFile.text);
  }
}

async function run() {
  mkdirSync(join(docsDir, "assets"), { recursive: true });
  copyShellAssets();
  writeIndexHtml();

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching webui…");
  } else {
    await buildCssBundle();
    console.log("Built docs/assets/chat.js + chat.css");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
