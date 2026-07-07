import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_HOSTS = ['hooks.slack.com', 'discord.com', 'discordapp.com'];

function isAllowedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { url, payload } = req.body ?? {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing webhook url' });
  }
  if (!isAllowedUrl(url)) {
    return res.status(403).json({ ok: false, error: 'Webhook URL not allowed — only Slack and Discord are supported' });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'Missing payload' });
  }

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    const text = await upstream.text().catch(() => '');
    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: `Upstream returned HTTP ${upstream.status}`, detail: text });
    }
    return res.status(200).json({ ok: true, status: upstream.status });
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: e?.message || 'Network error forwarding webhook' });
  }
}
