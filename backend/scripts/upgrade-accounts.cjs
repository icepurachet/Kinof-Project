// Run only after explicit database approval. No automatic startup migrations.
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');
async function main() {
  const env = dotenv.parse(fs.readFileSync(path.join(backend, '.env')));
  if (env.DB_DATABASE !== 'kinof') throw new Error('DATABASE_NAME_MISMATCH');
  const db = await mysql.createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USERNAME,password:env.DB_PASSWORD,database:env.DB_DATABASE});
  try {
    const [columns] = await db.query('SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
    const has = (table, column) => columns.some(c => c.TABLE_NAME === table && c.COLUMN_NAME === column);
    const changes = [];
    const definitions = [['users','student_id','VARCHAR(10) NULL'],['admins','username','VARCHAR(50) NULL'],['admins','job_title','VARCHAR(100) NULL'],['admins','phone','VARCHAR(20) NULL'],['admins','password_setup_required','TINYINT NOT NULL DEFAULT 0']];
    for (const [table,column,type] of definitions) if (!has(table,column)) changes.push(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    const [indexes] = await db.query('SELECT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()');
    for (const [table,column,name] of [['users','student_id','uq_users_student_id'],['admins','username','uq_admins_username']]) {
      if (!indexes.some(i => i.TABLE_NAME===table && i.INDEX_NAME===name)) {
        if (has(table,column)) {
          const [duplicates] = await db.query(`SELECT COUNT(*) AS total FROM (SELECT ${column} FROM ${table} WHERE ${column} IS NOT NULL GROUP BY ${column} HAVING COUNT(*)>1) d`);
          if (Number(duplicates[0].total)>0) throw new Error('DUPLICATE_ACCOUNT_IDENTIFIER');
        }
        changes.push(`ALTER TABLE ${table} ADD UNIQUE KEY ${name} (${column})`);
      }
    }
    const sql = fs.readFileSync(path.join(root,'database/migrations/004_student_admin_accounts.sql'),'utf8');
    const create = sql.slice(sql.indexOf('CREATE TABLE'));
    const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_password_tokens'");
    if (!tables.length) changes.push(create);
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify({applied:false,pendingStatements:changes.length,requiresApproval:true})); return; }
    if (!changes.length) {console.log(JSON.stringify({applied:true,alreadyUpgraded:true})); return;}
    const binary='C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe';
    if (!fs.existsSync(binary)) throw new Error('MYSQLDUMP_NOT_FOUND');
    const dir=path.join(root,'storage/database-backups'); fs.mkdirSync(dir,{recursive:true});
    const backup=path.join(dir,`kinof-accounts-before-004-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`);
    const fd=fs.openSync(backup,'wx');
    const dump=spawnSync(binary,['--single-transaction','--skip-lock-tables','--no-tablespaces','--triggers','--set-gtid-purged=OFF','--host',env.DB_HOST||'localhost','--port',env.DB_PORT||'3306','--user',env.DB_USERNAME,env.DB_DATABASE,'users','admins'],{env:{...process.env,MYSQL_PWD:env.DB_PASSWORD},stdio:['ignore',fd,'pipe']}); fs.closeSync(fd);
    if(dump.status!==0 || fs.statSync(backup).size<100) throw new Error('BACKUP_FAILED_NO_MIGRATION_APPLIED');
    for(const statement of changes) await db.query(statement);
    console.log(JSON.stringify({applied:true,backup,changedStatements:changes.length,backupScope:'users and admins data/schema/triggers; existing routines untouched'}));
  } finally {await db.end();}
}
main().catch(error=>{console.error(JSON.stringify({applied:false,errorCode:error.code||error.message}));process.exitCode=1;});
