'use strict';
/* OpenID Connect single sign-on (authorization code flow with PKCE), using fetch and node:crypto only. */
const crypto = require('node:crypto');
const b64url = b => Buffer.from(b).toString('base64url');
const cache = new Map(); // issuer -> {config, jwks, at}
const pending = new Map(); // state -> {verifier, nonce, at}

async function discover(issuer) {
  const c = cache.get(issuer); if (c && Date.now() - c.at < 3600e3) return c;
  const r = await fetch(`${issuer}/.well-known/openid-configuration`); if (!r.ok) throw new Error(`Discovery failed (${r.status}).`);
  const config = await r.json(); const j = await fetch(config.jwks_uri); if (!j.ok) throw new Error('Could not load signing keys.');
  const v = {config, jwks:(await j.json()).keys || [], at:Date.now()}; cache.set(issuer, v); return v;
}
async function startUrl(sso, redirectUri) {
  const {config} = await discover(sso.issuer);
  const state = b64url(crypto.randomBytes(18)), nonce = b64url(crypto.randomBytes(18)), verifier = b64url(crypto.randomBytes(32));
  pending.set(state, {verifier, nonce, at:Date.now()}); for (const [k, v] of pending) if (Date.now() - v.at > 600e3) pending.delete(k);
  const q = new URLSearchParams({response_type:'code', client_id:sso.clientId, redirect_uri:redirectUri, scope:'openid email profile', state, nonce, code_challenge:b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method:'S256'});
  return `${config.authorization_endpoint}?${q}`;
}
function verifyJwt(token, keys, alg0) {
  const [h, p, s] = String(token).split('.'); if (!s) throw new Error('Malformed ID token.');
  const header = JSON.parse(Buffer.from(h, 'base64url')); const jwk = keys.find(k => !header.kid || k.kid === header.kid); if (!jwk) throw new Error('Unknown signing key.');
  const key = crypto.createPublicKey({key:jwk, format:'jwk'}); const data = Buffer.from(`${h}.${p}`), sig = Buffer.from(s, 'base64url');
  const alg = header.alg || alg0; let ok = false;
  if (/^RS(256|384|512)$/.test(alg)) ok = crypto.verify('sha' + alg.slice(2), data, key, sig);
  else if (/^PS(256|384|512)$/.test(alg)) ok = crypto.verify('sha' + alg.slice(2), data, {key, padding:crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength:Number(alg.slice(2)) / 8}, sig);
  else if (/^ES(256|384|512)$/.test(alg)) ok = crypto.verify('sha' + (alg === 'ES512' ? '512' : alg.slice(2)), data, {key, dsaEncoding:'ieee-p1363'}, sig);
  else throw new Error(`Unsupported signing algorithm ${alg}.`);
  if (!ok) throw new Error('Invalid ID token signature.');
  return JSON.parse(Buffer.from(p, 'base64url'));
}
async function finish(sso, redirectUri, code, state) {
  const p = pending.get(state); pending.delete(state); if (!p) throw new Error('This sign-in link has expired. Please try again.');
  const {config, jwks} = await discover(sso.issuer);
  const r = await fetch(config.token_endpoint, {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'authorization_code', code, redirect_uri:redirectUri, client_id:sso.clientId, client_secret:sso.clientSecret || '', code_verifier:p.verifier})});
  const tok = await r.json(); if (!r.ok || !tok.id_token) throw new Error(tok.error_description || tok.error || 'Token exchange failed.');
  let claims; try { claims = verifyJwt(tok.id_token, jwks); } catch (e) { cache.delete(sso.issuer); const fresh = await discover(sso.issuer); claims = verifyJwt(tok.id_token, fresh.jwks); }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== config.issuer) throw new Error('ID token issuer does not match.');
  if (!aud.includes(sso.clientId)) throw new Error('ID token audience does not match.');
  if (claims.exp * 1000 < Date.now() - 60e3) throw new Error('ID token has expired.');
  if (claims.nonce !== p.nonce) throw new Error('ID token nonce does not match.');
  if (!claims.email) throw new Error('The identity provider did not return an email address.');
  if (claims.email_verified === false) throw new Error('Your email address is not verified with the identity provider.');
  return claims;
}
module.exports = {startUrl, finish, verifyJwt, _pending:pending};
