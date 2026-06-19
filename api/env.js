import fs from "node:fs";
import path from "node:path";

const localEnvCache = new Map();

function readLocalEnvValue(name) {
  if (localEnvCache.has(name)) {
    return localEnvCache.get(name);
  }

  const envPath = path.join(process.cwd(), ".env.local");
  try {
    const envText = fs.readFileSync(envPath, "utf8");
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = envText.match(new RegExp(`^${escapedName}=(.*)$`, "m"));
    const value = match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
    localEnvCache.set(name, value);
    return value;
  } catch {
    localEnvCache.set(name, "");
    return "";
  }
}

export function getEnvValue(name) {
  return process.env[name] || readLocalEnvValue(name);
}
