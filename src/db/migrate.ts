import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { seedDefaults } from "./repository.js";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "schema.sql"), "utf8");

mkdirSync(dirname(env.databasePath), { recursive: true });
const db = new Database(env.databasePath);
db.exec(schema);
seedDefaults(db);
db.close();
console.log("migrate ok:", env.databasePath);
