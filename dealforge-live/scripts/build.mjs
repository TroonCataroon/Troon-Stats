import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "web"), dist, { recursive: true });
await cp(resolve(root, "lib"), resolve(dist, "lib"), { recursive: true });
console.log("DealForge static bundle created in dist/");
