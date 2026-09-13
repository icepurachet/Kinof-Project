const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ไม่พบไฟล์ตั้งค่า ${filePath}`);
  }

  const result = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function question(interface_, message) {
  return new Promise((resolve) => interface_.question(message, resolve));
}

function hiddenQuestion(message) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('ต้องรันคำสั่งนี้ใน Terminal ที่รองรับการกรอกรหัสผ่านแบบซ่อน'));
      return;
    }

    readline.emitKeypressEvents(input);
    let value = '';
    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        output.write('\n');
        reject(new Error('ยกเลิกการสร้าง Super Admin'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        output.write('\n');
        resolve(value);
        return;
      }
      if (key.name === 'backspace') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write('\b \b');
        }
        return;
      }
      if (
        typeof character === 'string' &&
        character.length > 0 &&
        !key.ctrl &&
        !key.meta &&
        key.name !== 'tab'
      ) {
        value += character;
        output.write('*');
      }
    };

    output.write(message);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
  });
}

function looksLikeBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value ?? ''));
}

async function connect(env) {
  const required = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`ค่าใน .env ไม่ครบ: ${missing.join(', ')}`);
  }
  return mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    charset: 'utf8mb4',
  });
}

async function checkDatabase(connection) {
  const [rows] = await connection.query(
    `SELECT id, password_hash, role, status
     FROM admins
     WHERE status = 'active'`,
  );
  const usableSuperAdmins = rows.filter(
    (row) => row.role === 'super_admin' && looksLikeBcryptHash(row.password_hash),
  );
  const unusableAccounts = rows.filter(
    (row) => !looksLikeBcryptHash(row.password_hash),
  );
  return { usableSuperAdmins, unusableAccounts };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('ใช้ครั้งแรก: npm.cmd run bootstrap:super-admin');
    console.log('ตรวจสถานะอย่างเดียว: npm.cmd run bootstrap:super-admin -- --check');
    return;
  }

  const env = loadEnv(path.resolve(process.cwd(), '.env'));
  const connection = await connect(env);
  try {
    const state = await checkDatabase(connection);
    if (process.argv.includes('--check')) {
      console.log(
        state.usableSuperAdmins.length > 0
          ? 'มีบัญชี Super Admin ที่มี password hash ใช้งานได้แล้ว'
          : 'ยังไม่มีบัญชี Super Admin ที่มี password hash ใช้งานได้',
      );
      if (state.unusableAccounts.length > 0) {
        console.log(`พบบัญชีตัวอย่างที่ hash ใช้งานไม่ได้ ${state.unusableAccounts.length} บัญชี`);
      }
      return;
    }

    if (state.usableSuperAdmins.length > 0) {
      throw new Error(
        'มี Super Admin ที่ใช้งานได้อยู่แล้ว คำสั่ง bootstrap ถูกปิดเพื่อป้องกันการข้ามสิทธิ์',
      );
    }

    const interface_ = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const email = String(await question(interface_, 'อีเมล Super Admin: '))
      .trim()
      .toLowerCase();
    const firstName =
      String(await question(interface_, 'ชื่อ [ผู้ดูแล]: ')).trim() || 'ผู้ดูแล';
    const lastName =
      String(await question(interface_, 'นามสกุล [ระบบ]: ')).trim() || 'ระบบ';
    interface_.close();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
    }

    const password = await hiddenQuestion('ตั้งรหัสผ่าน (8-72 ไบต์): ');
    const confirmation = await hiddenQuestion('ยืนยันรหัสผ่านอีกครั้ง: ');
    if (password !== confirmation) throw new Error('รหัสผ่านทั้งสองครั้งไม่ตรงกัน');
    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (passwordBytes < 8 || passwordBytes > 72) {
      throw new Error('รหัสผ่านต้องมีความยาว 8-72 ไบต์');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await connection.beginTransaction();
    try {
      const [matchingRows] = await connection.query(
        'SELECT id FROM admins WHERE email = ? LIMIT 1 FOR UPDATE',
        [email],
      );
      let adminId;
      let action;
      if (matchingRows.length > 0) {
        adminId = Number(matchingRows[0].id);
        await connection.query(
          `UPDATE admins
           SET first_name = ?, last_name = ?, password_hash = ?,
               role = 'super_admin', status = 'active'
           WHERE id = ?`,
          [firstName, lastName, passwordHash, adminId],
        );
        action = `Bootstrap บัญชี Super Admin #${adminId}`;
      } else {
        const [placeholderRows] = await connection.query(
          `SELECT id FROM admins
           WHERE password_hash NOT LIKE '$2%'
           ORDER BY id ASC
           LIMIT 2 FOR UPDATE`,
        );
        if (placeholderRows.length === 1) {
          adminId = Number(placeholderRows[0].id);
          await connection.query(
            `UPDATE admins
             SET email = ?, first_name = ?, last_name = ?, password_hash = ?,
                 role = 'super_admin', status = 'active'
             WHERE id = ?`,
            [email, firstName, lastName, passwordHash, adminId],
          );
          action = `แทนที่บัญชีตัวอย่างด้วย Super Admin #${adminId}`;
        } else {
          const [insertResult] = await connection.query(
            `INSERT INTO admins
             (email, first_name, last_name, password_hash, role, status)
             VALUES (?, ?, ?, ?, 'super_admin', 'active')`,
            [email, firstName, lastName, passwordHash],
          );
          adminId = Number(insertResult.insertId);
          action = `Bootstrap บัญชี Super Admin #${adminId}`;
        }
      }

      await connection.query(
        'INSERT INTO audit_logs (action, admin_id) VALUES (?, ?)',
        [action, adminId],
      );
      await connection.commit();
      console.log(`สร้าง Super Admin สำเร็จ: ${email}`);
      console.log('เปิด Backend ใหม่ แล้วเลือก ผู้ดูแลระบบ ที่หน้าเข้าสู่ระบบ');
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`ไม่สำเร็จ: ${error.message}`);
  process.exitCode = 1;
});
