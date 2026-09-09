import fs from "fs";
import path from "path";

const src = "frontend/public/images/logo.jpeg";
const targets = [
  "frontend/public/logo.jpg",
  "frontend/public/logo.jpeg",
  "frontend/public/images/logo.jpg",
];

for (const t of targets) {
  fs.copyFileSync(src, t);
  console.log(`Copied to ${t} (size: ${fs.statSync(t).size})`);
}

