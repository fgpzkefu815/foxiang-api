export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // GET /status?session=2026-11-26-08&userId=xxx
    if (url.pathname === '/status') {
      const session = url.searchParams.get('session');
      const userId = url.searchParams.get('userId');
      if (!session) return json({ error: 'missing session' }, 400, cors);

      const total = await env.DB.prepare(
        'SELECT COUNT(*) as c FROM draws WHERE session_key = ?'
      ).bind(session).first('c');

      let mine = 0;
      if (userId) {
        mine = await env.DB.prepare(
          'SELECT COUNT(*) as c FROM draws WHERE session_key = ? AND user_id = ?'
        ).bind(session, userId).first('c');
      }

      return json({
        remaining: Math.max(0, 108 - total),
        myCount: mine,
        quota: 108,
        perUserLimit: 2
      }, 200, cors);
    }

    // POST /draw  { session, userId, deityId }
    if (url.pathname === '/draw' && request.method === 'POST') {
      const body = await request.json();
      const { session, userId, deityId } = body;
      if (!session || !userId || !deityId) {
        return json({ error: 'missing params' }, 400, cors);
      }

      const [totalRes, mineRes] = await env.DB.batch([
        env.DB.prepare('SELECT COUNT(*) as c FROM draws WHERE session_key = ?').bind(session),
        env.DB.prepare('SELECT COUNT(*) as c FROM draws WHERE session_key = ? AND user_id = ?').bind(session, userId),
      ]);

      const total = totalRes.results[0].c;
      const mine = mineRes.results[0].c;

      if (total >= 108) return json({ error: 'FULL' }, 409, cors);
      if (mine >= 2) return json({ error: 'LIMIT' }, 409, cors);

      await env.DB.prepare(
        'INSERT INTO draws (session_key, user_id, deity_id) VALUES (?, ?, ?)'
      ).bind(session, userId, deityId).run();

      return json({ ok: true, remaining: 108 - total - 1 }, 200, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  }
};

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
