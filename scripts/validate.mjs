import { readFile } from "node:fs/promises";

const html = await readFile("public/index.html", "utf8");
const app = await readFile("public/app.js", "utf8");

const ids = [...app.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
const missing = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));

if (missing.length) {
  console.error(`Missing DOM ids: ${missing.join(", ")}`);
  process.exit(1);
}

for (const file of ["public/index.html", "index.html", "public/app.js", "functions/api/inventory.js"]) {
  const text = await readFile(file, "utf8");
  if (text.includes("�")) {
    console.error(`Replacement character found in ${file}`);
    process.exit(1);
  }
}

console.log("Validation passed");
