import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
const types = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain",
  ".json": "application/json",
};
const assets = {};
async function walk(dir) {
  for (const file of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, file.name);
    if (file.isDirectory()) {
      await walk(full);
      continue;
    }
    const mime = types[path.extname(file.name)];
    if (!mime) continue;
    const uri = "/" + path.relative("out", full);
    assets[uri] = [mime, await fs.readFile(full, "utf8")];
    if (uri.endsWith(".html"))
      assets[uri === "/index.html" ? "/" : uri.slice(0, -5)] = assets[uri];
  }
}
await walk("out");
const src = await fs.readFile("cloud/worker.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
await fs.mkdir("dist/server", { recursive: true });
await fs.writeFile(
  "dist/server/index.js",
  "const assets=" + JSON.stringify(assets) + ";\n" + js,
);
