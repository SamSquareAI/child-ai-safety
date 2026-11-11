/** Optional same-host durable authority. Trusted operator API, never a public endpoint.
 * Node >=22.13 (node:sqlite); not a distributed database or consent provider. */
import {DatabaseSync} from 'node:sqlite';
import {openSync, closeSync, lstatSync} from 'node:fs';
import {dirname, isAbsolute} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
const identifier=x=>typeof x==='string' && /^[A-Za-z0-9._-]{1,64}$/.test(x);
const digest=x=>typeof x==='string' && /^[a-f0-9]{64}$/.test(x);
const validIdentity=x=>x && typeof x==='object' &&
  Object.keys(x).sort().join(',')==='applicationId,digest,id,tenantId' &&
  identifier(x.id) && identifier(x.tenantId) && identifier(x.applicationId) && digest(x.digest);
const unavailable=()=>new Error('Session authority unavailable');

export function createSqliteSessionAuthority({path, now=Date.now}={}) {
  if(typeof path!=='string' || !isAbsolute(path) || typeof now!=='function')throw new TypeError('Invalid authority configuration');
  // A private operator-owned directory also protects journal/sidecar files.
  let db;
  try {
    const directory=lstatSync(dirname(path));
    if(!directory.isDirectory() || directory.isSymbolicLink() ||
      directory.uid!==process.getuid() || (directory.mode & 0o077)!==0)throw unavailable();
    try {const fd=openSync(path,'wx',0o600);closeSync(fd);} catch(error) {if(error.code!=='EEXIST')throw error;}
    const file=lstatSync(path);
    if(!file.isFile() || file.isSymbolicLink() || file.uid!==process.getuid() || (file.mode & 0o077)!==0)throw unavailable();
    db=new DatabaseSync(path);
    db.exec(`PRAGMA busy_timeout=50;
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, application_id TEXT NOT NULL,
        digest TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
      ) STRICT;`);
  } catch {try {db?.close();} catch {} throw unavailable();}
  let closed=false;
  function time() {
    const value=now();
    if(!Number.isSafeInteger(value) || value<0)throw unavailable();
    return value;
  }
  function run(fn) {try {if(closed)throw unavailable();return fn();}catch {throw unavailable();}}
  const select=db.prepare('SELECT tenant_id,application_id,digest,expires_at,revoked FROM sessions WHERE id=?');
  const insert=db.prepare('INSERT INTO sessions(id,tenant_id,application_id,digest,expires_at) VALUES (?,?,?,?,?)');
  const revoke=db.prepare('UPDATE sessions SET revoked=1 WHERE id=? AND revoked=0');
  return Object.freeze({
    /** Provision only newly issued server-owned sessions. Never run on startup
     * merely because an old credential appears in a deployment configuration. */
    issue(session) {
      if(!session || !validIdentity({id:session.id,tenantId:session.tenantId,
        applicationId:session.applicationId,digest:session.digest}) ||
        Object.keys(session).sort().join(',')!=='applicationId,digest,expiresAt,id,tenantId' ||
        !Number.isSafeInteger(session.expiresAt))throw new TypeError('Invalid session');
      return run(()=>{
        if(session.expiresAt<=time())throw unavailable();
        insert.run(session.id,session.tenantId,session.applicationId,session.digest,session.expiresAt);
      });
    },
    isActive(identity) {
      if(!validIdentity(identity))return false;
      return run(()=>{
        const row=select.get(identity.id), current=time();
        return !!row && row.revoked===0 && row.expires_at>current &&
          row.tenant_id===identity.tenantId && row.application_id===identity.applicationId &&
          digest(row.digest) && timingSafeEqual(Buffer.from(row.digest,'hex'),Buffer.from(identity.digest,'hex'));
      });
    },
    revoke(id) {
      if(!identifier(id))throw new TypeError('Invalid session identifier');
      return run(()=>{revoke.run(id);return !!select.get(id);});
    },
    close() {if(!closed){closed=true;db.close();}}
  });
}
