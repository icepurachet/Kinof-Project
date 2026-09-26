// Explicit one-time database upgrade with a backup of the affected objects first.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const backend = path.resolve(__dirname, "..");
const root = path.resolve(backend, "..");

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("No changes made. After approval: node scripts/upgrade-lab-features.cjs --apply");
    return;
  }
  const env = dotenv.parse(fs.readFileSync(path.join(backend, ".env")));
  if (env.DB_DATABASE !== "kinof") throw new Error("DATABASE_NAME_MISMATCH");
  const sql = fs.readFileSync(path.join(root, "database/migrations/003_upstream_lab_features.sql"), "utf8");
  const tablesOnly = process.argv.includes("--tables-only-backup");
  if (tablesOnly) {
    const statements = sql.replace(/^\s*--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean);
    if (statements.some(s => !/^USE\s+kinof$/i.test(s) && !/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+/i.test(s))) {
      throw new Error("TABLES_ONLY_BACKUP_REQUIRES_ADDITIVE_TABLE_MIGRATION");
    }
  }
  const binary = "C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe";
  if (!fs.existsSync(binary)) throw new Error("MYSQLDUMP_NOT_FOUND");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(root, "storage", "database-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `kinof-before-003-${stamp}.sql`);
  const fd = fs.openSync(backup, "wx");
  const dump = spawnSync(binary, [
    "--single-transaction", "--skip-lock-tables", "--no-tablespaces",
    ...(tablesOnly ? ["--triggers"] : ["--routines", "--triggers", "--events"]), "--set-gtid-purged=OFF",
    "--host", env.DB_HOST || "localhost", "--port", env.DB_PORT || "3306",
    "--user", env.DB_USERNAME, env.DB_DATABASE,
  ], { env: { ...process.env, MYSQL_PWD: env.DB_PASSWORD }, stdio: ["ignore", fd, "pipe"] });
  fs.closeSync(fd);
  if (dump.status !== 0 || fs.statSync(backup).size < 100) {
    throw new Error("BACKUP_FAILED_NO_MIGRATION_APPLIED");
  }
  const db = await mysql.createConnection({
    host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USERNAME,
    password:env.DB_PASSWORD,database:env.DB_DATABASE,multipleStatements:true,
  });
  try {
    const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
    const counts = {};
    for (const table of tables) {
      const [count] = await db.query("SELECT COUNT(*) AS total FROM ??", [table.TABLE_NAME]);
      counts[table.TABLE_NAME] = Number(count[0].total);
    }
    await db.query(sql);
    const expected = ["program_rules","behavior_reviews","behavior_penalties","kiosk_devices","agent_login_challenges","imported_domain_rules"];
    const [updated] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
    if (expected.some(name=>!updated.some(table=>table.TABLE_NAME===name))) throw new Error("UPGRADE_INCOMPLETE");
    const changed = [];
    for (const [name, before] of Object.entries(counts)) {
      const [count] = await db.query("SELECT COUNT(*) AS total FROM ??", [name]);
      if (Number(count[0].total) !== before) changed.push(name);
    }
    console.log(JSON.stringify({upgraded:true,backup,backupScope:tablesOnly?"tables-data-views-triggers; excludes unchanged routines and events":"full",tables:expected,existingTableRowCountChanges:changed}));
  } finally { await db.end(); }
}
main().catch(error=>{
  console.error(JSON.stringify({upgraded:false,errorCode:error.code||error.message||error.name}));
  process.exitCode=1;
});
