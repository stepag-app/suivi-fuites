// Relais d'essai LOCAL : imite l'authentification Supabase (/auth/v1, jeton signé avec le secret de PostgREST)
// et transmet /rest/v1 à PostgREST, compressé en gzip comme l'API Supabase. Jamais la production.
//
//   PGRST_JWT_SECRET=… UID_ESSAI=<profil> PORT_RELAIS=54398 PORT_PGRST=54331 node outils/charge/relais.mjs
//
// Toute connexion du panneau web ouvre une session au nom de UID_ESSAI (identifiant et mot de passe ignorés).
import { createHmac } from 'node:crypto';
import { createServer, request } from 'node:http';
import { createGzip } from 'node:zlib';

const SECRET = process.env.PGRST_JWT_SECRET;
if (!SECRET) throw new Error('PGRST_JWT_SECRET manquant (secret de la configuration PostgREST locale)');
const UID = process.env.UID_ESSAI ?? 'c0000000-0000-4000-8000-000000000007';
const PORT_PGRST = Number(process.env.PORT_PGRST ?? 54331);
const PORT = Number(process.env.PORT_RELAIS ?? 54398);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const signer = (p) => {
  const t = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(p)}`;
  return `${t}.${createHmac('sha256', SECRET).update(t).digest('base64url')}`;
};
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
const USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'essai@agents.stepag.ma', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const SESSION = () => ({
  access_token: signer({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, email: USER.email }),
  refresh_token: 'rafraichissement-essai', token_type: 'bearer', expires_in: 86400 * 30, expires_at: exp, user: USER,
});

createServer((req, res) => {
  const cors = {
    'access-control-allow-origin': req.headers.origin || '*',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range, content-profile',
    'timing-allow-origin': '*',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const json = (code, o) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
  if (u.pathname.startsWith('/auth/v1/token')) return json(200, SESSION());
  if (u.pathname === '/auth/v1/user') return json(200, USER);
  if (u.pathname === '/auth/v1/logout') return json(204);
  if (u.pathname.startsWith('/storage/v1')) return json(404, { message: 'stockage absent de l\'essai' });
  if (!u.pathname.startsWith('/rest/v1')) return json(404, { message: 'inconnu' });
  const entetes = { ...req.headers };
  delete entetes.host;
  const p = request({ host: '127.0.0.1', port: PORT_PGRST, method: req.method, path: u.pathname.slice('/rest/v1'.length) + u.search, headers: entetes }, (r) => {
    if (/gzip/.test(req.headers['accept-encoding'] || '') && !r.headers['content-encoding']) {
      const h = { ...r.headers, ...cors, 'content-encoding': 'gzip' };
      delete h['content-length'];
      res.writeHead(r.statusCode, h);
      r.pipe(createGzip()).pipe(res);
    } else {
      res.writeHead(r.statusCode, { ...r.headers, ...cors });
      r.pipe(res);
    }
  });
  p.on('error', (e) => json(502, { message: String(e) }));
  req.pipe(p);
}).listen(PORT, '127.0.0.1', () => console.log(`relais d'essai prêt sur ${PORT} (compte ${UID})`));
