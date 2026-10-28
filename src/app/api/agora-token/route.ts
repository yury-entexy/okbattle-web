// Proxies the mobile app's Agora token server, which browsers cannot call directly (no CORS).
// Only RTC tokens for a game channel are passed through.
const TOKEN_SERVER = process.env.AGORA_TOKEN_SERVER ?? 'https://agora-token-server-00p7.onrender.com';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const channel = params.get('channel') ?? '';
  const role = params.get('role') === '1' ? '1' : '2';
  const uid = params.get('uid') ?? '';
  if (!/^[\w-]{1,64}$/.test(channel) || !/^\d{1,10}$/.test(uid)) {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  // The token server sleeps when idle (free hosting) and can take a while to wake up.
  const res = await fetch(`${TOKEN_SERVER}/rtc/${channel}/${role}/uid/${uid}?expiry=18000`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  }).catch(() => null);
  if (!res?.ok) return Response.json({ error: 'token server unavailable' }, { status: 502 });
  const { rtcToken } = (await res.json()) as { rtcToken?: string };
  return Response.json({ rtcToken });
}
