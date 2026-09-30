import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('prisma');
mkdirSync(root,{recursive:true});
const db = new DatabaseSync(join(root,'dev.db'));
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _app_migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL);');
for (const name of readdirSync(join(root,'migrations')).sort()) {
  const file=join(root,'migrations',name,'migration.sql');
  let sql;
  try { sql=readFileSync(file,'utf8').replace(/^\ufeff/,''); } catch { continue; }
  if(db.prepare('SELECT 1 FROM _app_migrations WHERE name=?').get(name)) continue;
  db.exec('BEGIN');
  try { db.exec(sql); db.prepare('INSERT INTO _app_migrations (name,appliedAt) VALUES (?,?)').run(name,new Date().toISOString()); db.exec('COMMIT'); console.log(`Applied ${name}`); }
  catch(e) { db.exec('ROLLBACK'); throw e; }
}
db.close();
