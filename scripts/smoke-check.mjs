import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const cwd = process.cwd();
const commandsDir = path.join(cwd, "commands");
const settingsFile = path.join(cwd, "settings", "settings.json");
const packageFile = path.join(cwd, "package.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectJsFiles(dirPath, results = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, results);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeAliases(command) {
  const names = [];

  if (command?.name) {
    names.push(command.name);
  }

  if (Array.isArray(command?.command)) {
    names.push(...command.command);
  } else if (command?.command) {
    names.push(command.command);
  }

  return names
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  readJson(packageFile);
  readJson(settingsFile);

  const files = collectJsFiles(commandsDir);
  const aliasOwners = new Map();
  const issues = [];

  for (const filePath of files) {
    let mod;

    try {
      mod = await import(pathToFileURL(filePath).href);
    } catch (error) {
      issues.push(`No pude importar ${path.relative(cwd, filePath)}: ${error?.message || error}`);
      continue;
    }

    const command = mod?.default;
    if (!command || typeof command.run !== "function") {
      continue;
    }

    const aliases = normalizeAliases(command);
    if (!aliases.length) {
      issues.push(`Sin aliases en ${path.relative(cwd, filePath)}`);
      continue;
    }

    for (const alias of aliases) {
      const owner = aliasOwners.get(alias);
      if (owner && owner !== filePath) {
        issues.push(
          `Alias duplicado "${alias}" en ${path.relative(cwd, owner)} y ${path.relative(cwd, filePath)}`
        );
        continue;
      }

      aliasOwners.set(alias, filePath);
    }
  }

  if (issues.length) {
    for (const issue of issues) {
      console.error(`[smoke] ${issue}`);
    }
    process.exit(1);
  }

  console.log(`[smoke] OK. ${files.length} archivos JS revisados, ${aliasOwners.size} aliases cargados.`);
}

main().catch((error) => {
  console.error(`[smoke] FATAL: ${error?.stack || error}`);
  process.exit(1);
});
