// Requêtes HTTPS minimalistes (avec prise en charge d'un proxy HTTPS_PROXY si défini).
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
export const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

export const USER_AGENT = 'Mozilla/5.0 (Paddock-Live local dashboard)';

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} pour ${url}`);
    this.status = status;
  }
}

// lookup : résolution DNS de la connexion (relais radio : adresses locales refusées)
export function request(url, { method = 'GET', headers = {}, body, timeout = 20000, redirects = 3, lookup } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      agent,
      ...(lookup ? { lookup } : {}),
      headers: { 'User-Agent': USER_AGENT, ...headers },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        request(next, { method, headers, body, timeout, redirects: redirects - 1, lookup }).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error(`Délai dépassé pour ${url}`)));
    if (body) req.write(body);
    req.end();
  });
}

export async function getText(url, opts) {
  const r = await request(url, opts);
  if (r.status !== 200) throw new HttpError(r.status, url);
  return r.body.toString('utf8').replace(/^﻿/, '');
}

export async function getJSON(url, opts) {
  return JSON.parse(await getText(url, opts));
}

// Erreurs qu'il vaut la peine de réessayer : réseau, délai dépassé, refus temporaires
// (408, 409, 422, 425, 429 : serveur surchargé ou protection anti-rafales) et erreurs serveur.
// Une ressource absente ou interdite (400, 401, 403, 404) ne se réessaie pas.
export function isTemporary(err) {
  if (!(err instanceof HttpError)) return true;
  return [408, 409, 422, 425, 429].includes(err.status) || err.status >= 500;
}

export async function withRetry(fn, { tries = 4, delay = 1500 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTemporary(err) || i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, delay * 2 ** i));
    }
  }
}
