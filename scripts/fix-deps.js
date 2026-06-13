import fs from "node:fs";
import path from "node:path";

const targetPath = path.join(
  process.cwd(),
  "node_modules",
  "bitget-core",
  "package.json"
);

try {
  if (fs.existsSync(targetPath)) {
    const raw = fs.readFileSync(targetPath, "utf-8");
    const pkg = JSON.parse(raw);
    
    if (pkg.exports && pkg.exports["."] && !pkg.exports["."].require) {
      pkg.exports["."] = {
        import: pkg.exports["."].import,
        require: pkg.exports["."].import, // Map require to the compiled ESM/JS file
        types: pkg.exports["."].types
      };
      
      fs.writeFileSync(targetPath, JSON.stringify(pkg, null, 2));
      console.log("[FixDeps] Successfully patched bitget-core exports for CommonJS compatibility.");
    } else {
      console.log("[FixDeps] bitget-core exports already patched or require mapping exists.");
    }
  } else {
    console.warn("[FixDeps] bitget-core package.json not found. Skipping patching.");
  }
} catch (err) {
  console.error("[FixDeps] Failed to patch package.json:", err);
}
