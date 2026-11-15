#!/usr/bin/env node
// 生成/重置独立 SurfCore Web 的登录密码。
// 用法：
//   node standalone/setup-password.mjs              # 随机生成并打印一次
//   node standalone/setup-password.mjs '你的密码'    # 指定密码
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const file = process.env.SURFCORE_WEB_PASSWORD_FILE
  || path.join(os.homedir(), '.dsh', 'surfcore', 'web-password.json');
const password = process.argv[2] || crypto.randomBytes(9).toString('base64url');
const username = process.env.SURFCORE_WEB_USERNAME || process.argv[3] || 'admin';
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);

fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({
  scheme: 'scrypt',
  username,
  salt: salt.toString('base64'),
  hash: hash.toString('base64'),
  createdAt: new Date().toISOString(),
}, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(file, 0o600);

console.log(`password file: ${file}`);
console.log(`username     : ${username}`);
console.log(`password     : ${password}`);
console.log('（只显示这一次；忘了就重新运行本脚本重置）');
