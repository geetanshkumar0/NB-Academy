'use strict';
/*
 * Persistence for NB Academy using Node's built-in SQLite (node:sqlite, Node 22.13+).
 * Every record is stored as a JSON row keyed by (collection, id). After each operation
 * only the rows that changed are written, inside one transaction.
 * Audit rows are append-only: database triggers reject any UPDATE or DELETE of them.
 */
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const Core = require('../public/core.js');

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, 'files'), {recursive:true});
    fs.mkdirSync(path.join(dir, 'scorm'), {recursive:true});
    this.db = new DatabaseSync(path.join(dir, 'nbacademy.db'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS records (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (coll, id));
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON records WHEN OLD.coll = 'audit' BEGIN SELECT RAISE(ABORT, 'The audit log is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON records WHEN OLD.coll = 'audit' BEGIN SELECT RAISE(ABORT, 'The audit log is append-only'); END;`);
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN last_seen INTEGER'); } catch (e) { /* already there */ }
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN real_user TEXT'); } catch (e) { /* already there */ }
    this.q = {
      all: this.db.prepare('SELECT coll, id, data FROM records'),
      put: this.db.prepare('INSERT INTO records (coll, id, data) VALUES (?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data'),
      del: this.db.prepare('DELETE FROM records WHERE coll = ? AND id = ?'),
      sGet: this.db.prepare('SELECT user_id, expires, last_seen FROM sessions WHERE token = ?'),
      sPut: this.db.prepare('INSERT INTO sessions (token, user_id, created, expires, last_seen, real_user) VALUES (?, ?, ?, ?, ?, ?)'),
      sSeen: this.db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?'),
      sDel: this.db.prepare('DELETE FROM sessions WHERE token = ?'),
      sDelUser: this.db.prepare('DELETE FROM sessions WHERE user_id = ?'),
      sPurge: this.db.prepare('DELETE FROM sessions WHERE expires < ?')
    };
    this.seq = 0;
    this.cache = new Map(); // "coll\u0000id" -> json string last written
  }
  isEmpty() { return this.q.all.all().length === 0; }
  load() {
    const S = Core.emptyState(); S.roles = [];
    for (const k of Core.MAPS) S[k] = {};
    for (const row of this.q.all.all()) {
      this.cache.set(row.coll + '\u0000' + row.id, row.data);
      const v = JSON.parse(row.data);
      if (row.coll === 'site') S.site = v;
      else if (Core.MAPS.includes(row.coll)) S[row.coll][row.id] = v;
      else if (Core.ARRAYS.includes(row.coll)) S[row.coll].push(v);
    }
    // Upgrade older data: add new settings and built-in roles that did not exist yet
    const def = Core.defaultSite();
    for (const [k, v] of Object.entries(def)) { if (S.site[k] === undefined) S.site[k] = v; else if (v && typeof v === 'object' && !Array.isArray(v)) S.site[k] = {...v, ...S.site[k]}; }
    for (const [k, t] of Object.entries(Core.DEFAULT_TEMPLATES)) if (!S.site.templates[k]) S.site.templates[k] = Core.clone(t);
    for (const r of Core.BUILTIN_ROLES) if (!S.roles.some(x => x.id === r.id)) S.roles.push(Core.clone(r));
    // Standard teams added in later versions join the saved list, unless an administrator removed them
    if (Array.isArray(S.site.teams)) { const removed = new Set((S.site.teamsRemoved || []).map(t => t.toLowerCase())); for (const t of Core.TEAMS) if (!removed.has(t.toLowerCase()) && !S.site.teams.some(x => x.toLowerCase() === t.toLowerCase())) S.site.teams.push(t); }
    for (const k of Core.ARRAYS) S[k].sort((a, b) => (a._o ?? 0) - (b._o ?? 0));
    this.seq = Core.ARRAYS.reduce((mx, k) => S[k].reduce((m, r) => Math.max(m, r._o || 0), mx), 0);
    S.version = Core.VERSION;
    return S;
  }
  /* Write only what changed since the last save. Insertion order is kept with a stable _o sequence number. */
  save(S) {
    const seen = new Set(), writes = [];
    const consider = (coll, id, obj) => { const key = coll + '\u0000' + id; seen.add(key); const json = JSON.stringify(obj); if (this.cache.get(key) !== json) writes.push([coll, id, json, key]); };
    consider('site', 'site', S.site);
    for (const k of Core.ARRAYS) S[k].forEach(row => { if (row._o == null) row._o = ++this.seq; consider(k, String(row.id), row); });
    for (const k of Core.MAPS) for (const [id, v] of Object.entries(S[k])) consider(k, id, v);
    const dels = [...this.cache.keys()].filter(k => !seen.has(k));
    if (!writes.length && !dels.length) return 0;
    this.db.exec('BEGIN');
    try {
      for (const [c, id, json, key] of writes) { this.q.put.run(c, id, json); this.cache.set(key, json); }
      for (const key of dels) { const [c, id] = key.split('\u0000'); this.q.del.run(c, id); this.cache.delete(key); }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return writes.length + dels.length;
  }
  /* Sessions with an idle timeout */
  sessionUser(token, idleMs) {
    if (!token) return null; const r = this.q.sGet.get(token); const now = Date.now();
    if (!r || r.expires < now) return null;
    if (idleMs && r.last_seen && now - r.last_seen > idleMs) { this.q.sDel.run(token); return null; }
    if (!r.last_seen || now - r.last_seen > 30e3) this.q.sSeen.run(now, token);
    return r.user_id;
  }
  createSession(token, userId, ttl, realUser) { const t = Date.now(); this.q.sPut.run(token, userId, t, t + ttl, t, realUser || null); }
  dropSession(token) { this.q.sDel.run(token); }
  dropUserSessions(userId) { this.q.sDelUser.run(userId); }
  purgeSessions() { this.q.sPurge.run(Date.now()); }
  /* Files on disk */
  filePath(id) { if (!/^f_[a-z0-9_]+$/i.test(id)) throw new Error('bad file id'); return path.join(this.dir, 'files', id); }
  scormDir(cmid) { if (!/^[a-z0-9_]+$/i.test(cmid)) throw new Error('bad id'); return path.join(this.dir, 'scorm', cmid); }
  close() { try { this.db.close(); } catch (e) {} }
}
module.exports = Store;
