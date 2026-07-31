const fs = require("fs");
const path = require("path");

const packageRoot = path.dirname(require.resolve("stockfish/package.json"));
const outputDir = path.join(process.cwd(), "public", "stockfish");
const targets = {
  js: "stockfish-18-lite-single.js",
  wasm: "stockfish-18-lite-single.wasm",
};

function walk(dir, found = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, found);
      continue;
    }

    if (entry.name === targets.js || entry.name === targets.wasm) {
      found[entry.name] = fullPath;
    }
  }

  return found;
}

const found = walk(packageRoot);
const missing = Object.values(targets).filter((fileName) => !found[fileName]);

if (missing.length > 0) {
  throw new Error(
    `Could not find Stockfish lite single-threaded file(s): ${missing.join(", ")} in ${packageRoot}`
  );
}

fs.mkdirSync(outputDir, { recursive: true });

for (const fileName of Object.values(targets)) {
  fs.copyFileSync(found[fileName], path.join(outputDir, fileName));
}

fs.copyFileSync(found[targets.wasm], path.join(outputDir, "stockfish.wasm"));

console.log(`Copied Stockfish lite single-threaded files to ${outputDir}`);
