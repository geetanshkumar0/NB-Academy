'use strict';
/* LDAP simple bind (RFC 4511) over node:net / node:tls. Used to check a user's directory password. */
const net = require('node:net');
const tls = require('node:tls');

function len(n) { if (n < 128) return Buffer.from([n]); const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); }
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const int = n => tlv(0x02, Buffer.from([n]));
const octets = s => tlv(0x04, Buffer.from(s, 'utf8'));
/* RFC 4514 escaping for values placed into a DN */
function escapeDn(v) { return String(v).replace(/[\\,+"<>;=#]/g, '\\$&').replace(/^ /, '\\ ').replace(/ $/, '\\ ').replace(/\0/g, '\\00'); }

function bind(url, dn, password, timeoutMs = 8000) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (e) { return resolve({ok:false, error:'Invalid LDAP URL.'}); }
    if (!password) return resolve({ok:false, error:'Empty password.'}); // anonymous binds must never count as success
    const secure = u.protocol === 'ldaps:'; const port = Number(u.port) || (secure ? 636 : 389);
    const req = tlv(0x30, Buffer.concat([int(1), tlv(0x60, Buffer.concat([int(3), octets(dn), tlv(0x80, Buffer.from(password, 'utf8'))]))]));
    let done = false, buf = Buffer.alloc(0);
    const finish = r => { if (done) return; done = true; clearTimeout(t); try { sock.destroy(); } catch (e) {} resolve(r); };
    const t = setTimeout(() => finish({ok:false, error:'The directory server did not respond.'}), timeoutMs);
    const sock = secure ? tls.connect({host:u.hostname, port, servername:u.hostname}) : net.connect({host:u.hostname, port});
    sock.on(secure ? 'secureConnect' : 'connect', () => sock.write(req));
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf(0x61); if (i < 0) return; // [APPLICATION 1] BindResponse
      let p = i + 1; let l = buf[p++]; if (l & 0x80) { const n = l & 0x7f; l = 0; for (let k = 0; k < n; k++) l = (l << 8) | buf[p++]; }
      if (buf[p] !== 0x0a) return; const code = buf[p + 2];
      finish(code === 0 ? {ok:true} : {ok:false, code, error:code === 49 ? 'Invalid credentials.' : `LDAP error ${code}.`});
    });
    sock.on('error', e => finish({ok:false, error:`Cannot reach the directory server (${e.code || e.message}).`}));
  });
}
module.exports = {bind, escapeDn};
