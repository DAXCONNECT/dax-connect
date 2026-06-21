export default {
  async fetch(request, env) {
    const h = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: h });

    const url = new URL(request.url);
    const path = url.pathname;
    const DB = env.DB;

    try {
      // ---- UPLOAD IMAGE ----
      if (request.method === 'POST' && path === '/upload') {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) return json({ error: 'No file' }, 400, h);
        const ext = file.name.split('.').pop() || 'jpg';
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
        const publicUrl = `https://pub-c59abb1df94540cebef8ec6fd286e08f.r2.dev/${key}`;
        return json({ url: publicUrl, key }, 200, h);
      }

      // ---- STORAGE STATS ----
      if (request.method === 'GET' && path === '/stats') {
        const listed = await env.BUCKET.list();
        let totalSize = 0;
        for (const obj of listed.objects) totalSize += obj.size;
        return json({ totalFiles: listed.objects.length, totalSizeBytes: totalSize, totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100, limitGB: 10, usedPercent: Math.round(totalSize / (10 * 1024 * 1024 * 1024) * 10000) / 100 }, 200, h);
      }

      // ---- AUTH: REGISTER ----
      if (request.method === 'POST' && path === '/auth/register') {
        const b = await request.json();
        const existing = await DB.prepare('SELECT id FROM users WHERE email=?').bind(b.email).first();
        if (existing) return json({ error: 'Email déjà utilisé' }, 409, h);
        const fpCheck = await DB.prepare('SELECT id FROM users WHERE fingerprint=?').bind(b.fingerprint || '').first();
        if (fpCheck) return json({ error: 'Un compte existe déjà depuis cet appareil' }, 409, h);
        const id = 'u' + Date.now();
        await DB.prepare('INSERT INTO users (id,name,email,pwd,initials,color,tc,role,rue,quartier,avatar,fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(id, b.name, b.email, b.pwd, b.initials, b.color, b.tc, 'member', b.rue, b.quartier, b.avatar || null, b.fingerprint || null).run();
        const user = await DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
        return json({ user }, 200, h);
      }

      // ---- AUTH: LOGIN ----
      if (request.method === 'POST' && path === '/auth/login') {
        const b = await request.json();
        const user = await DB.prepare('SELECT * FROM users WHERE email=? AND pwd=?').bind(b.email, b.pwd).first();
        if (!user) return json({ error: 'Email ou mot de passe incorrect' }, 401, h);
        if (user.status === 'banned') return json({ error: 'Ce compte a été exclu' }, 403, h);
        if (user.status === 'suspended') return json({ error: 'Compte suspendu : ' + user.statusInfo }, 403, h);
        return json({ user }, 200, h);
      }

      // ---- USERS ----
      if (request.method === 'GET' && path === '/users') {
        const users = await DB.prepare('SELECT id,name,initials,color,tc,role,rue,quartier,status,statusInfo,avatar FROM users').all();
        return json({ users: users.results }, 200, h);
      }

      if (request.method === 'PUT' && path.startsWith('/users/')) {
        const uid = path.split('/')[2];
        const b = await request.json();
        if (b.role !== undefined) await DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role, uid).run();
        if (b.status !== undefined) await DB.prepare('UPDATE users SET status=?,statusInfo=? WHERE id=?').bind(b.status, b.statusInfo || '', uid).run();
        if (b.avatar !== undefined) await DB.prepare('UPDATE users SET avatar=? WHERE id=?').bind(b.avatar, uid).run();
        return json({ ok: true }, 200, h);
      }

      // ---- POSTS ----
      if (request.method === 'GET' && path === '/posts') {
        const posts = await DB.prepare('SELECT * FROM posts ORDER BY createdAt DESC').all();
        for (const p of posts.results) {
          p.media = JSON.parse(p.media || '[]');
          p.sondage = p.sondage ? JSON.parse(p.sondage) : null;
          const comments = await DB.prepare('SELECT * FROM comments WHERE postId=? ORDER BY createdAt ASC').bind(p.id).all();
          p.comments = comments.results;
          const reactions = await DB.prepare('SELECT type, COUNT(*) as c FROM likes WHERE postId=? GROUP BY type').bind(p.id).all();
          p.reactions={};
          for(const r of reactions.results) p.reactions[r.type]=r.c;
          const myReactions = await DB.prepare('SELECT type FROM likes WHERE postId=? AND userId=?').bind(p.id, url.searchParams.get('userId')||'').all();
          p.myReactions=myReactions.results.map(r=>r.type);
        }
        return json({ posts: posts.results }, 200, h);
      }

      if (request.method === 'POST' && path === '/posts') {
        const b = await request.json();
        const id = Date.now();
        await DB.prepare('INSERT INTO posts (id,authorId,cat,text,scope,media,eventDate,sondage) VALUES (?,?,?,?,?,?,?,?)')
          .bind(id, b.authorId, b.cat, b.text, b.scope || 'Tout Dax', JSON.stringify(b.media || []), b.eventDate || null, b.sondage ? JSON.stringify(b.sondage) : null).run();
        return json({ id }, 200, h);
      }

      if (request.method === 'PUT' && path.startsWith('/posts/')) {
        const pid = parseInt(path.split('/')[2]);
        const b = await request.json();
        if (b.text !== undefined) await DB.prepare('UPDATE posts SET text=? WHERE id=?').bind(b.text, pid).run();
        if (b.sondage !== undefined) await DB.prepare('UPDATE posts SET sondage=? WHERE id=?').bind(JSON.stringify(b.sondage), pid).run();
        return json({ ok: true }, 200, h);
      }

      if (request.method === 'DELETE' && path.startsWith('/posts/')) {
        const pid = parseInt(path.split('/')[2]);
        await DB.prepare('DELETE FROM comments WHERE postId=?').bind(pid).run();
        await DB.prepare('DELETE FROM likes WHERE postId=?').bind(pid).run();
        await DB.prepare('DELETE FROM posts WHERE id=?').bind(pid).run();
        return json({ ok: true }, 200, h);
      }

      // ---- COMMENTS ----
      if (request.method === 'POST' && path === '/comments') {
        const b = await request.json();
        await DB.prepare('INSERT INTO comments (id,postId,authorId,text,time) VALUES (?,?,?,?,?)')
          .bind(Date.now(), b.postId, b.authorId, b.text, b.time || "À l'instant").run();
        return json({ ok: true }, 200, h);
      }

      if (request.method === 'DELETE' && path.startsWith('/comments/')) {
        const cid = parseInt(path.split('/')[2]);
        await DB.prepare('DELETE FROM comments WHERE id=?').bind(cid).run();
        return json({ ok: true }, 200, h);
      }

      // ---- REACTIONS ----
      if (request.method === 'POST' && path === '/reactions') {
        const b = await request.json();
        const existing = await DB.prepare('SELECT * FROM likes WHERE userId=? AND postId=? AND type=?').bind(b.userId, b.postId, b.type).first();
        if (existing) {
          await DB.prepare('DELETE FROM likes WHERE userId=? AND postId=? AND type=?').bind(b.userId, b.postId, b.type).run();
          return json({ toggled: false }, 200, h);
        } else {
          await DB.prepare('INSERT INTO likes (userId,postId,type) VALUES (?,?,?)').bind(b.userId, b.postId, b.type).run();
          return json({ toggled: true }, 200, h);
        }
      }

      // ---- CONVERSATIONS & MESSAGES ----
      if (request.method === 'GET' && path === '/conversations') {
        const userId = url.searchParams.get('userId');
        const convs = await DB.prepare('SELECT * FROM conversations WHERE user1=? OR user2=?').bind(userId, userId).all();
        for (const c of convs.results) {
          const msgs = await DB.prepare('SELECT * FROM messages WHERE convId=? ORDER BY createdAt ASC').bind(c.id).all();
          c.messages = msgs.results;
          c.withId = c.user1 === userId ? c.user2 : c.user1;
        }
        return json({ conversations: convs.results }, 200, h);
      }

      if (request.method === 'GET' && path === '/unread') {
        const userId = url.searchParams.get('userId');
        if (!userId) return json({ count: 0 }, 200, h);
        const convs = await DB.prepare('SELECT * FROM conversations WHERE (user1=? OR user2=?) AND unread=1').bind(userId, userId).all();
        return json({ count: convs.results.length }, 200, h);
      }

      if (request.method === 'POST' && path === '/messages') {
        const b = await request.json();
        let conv = await DB.prepare('SELECT * FROM conversations WHERE id=?').bind(b.convId).first();
        if (!conv) {
          await DB.prepare('INSERT INTO conversations (id,user1,user2,unread) VALUES (?,?,?,1)').bind(b.convId, b.from, b.to).run();
        } else {
          await DB.prepare('UPDATE conversations SET unread=1 WHERE id=?').bind(b.convId).run();
        }
        await DB.prepare('INSERT INTO messages (convId,fromId,text,time) VALUES (?,?,?,?)').bind(b.convId, b.from, b.text, b.time || 'maintenant').run();
        return json({ ok: true }, 200, h);
      }

      if (request.method === 'PUT' && path.startsWith('/conversations/')) {
        const cid = path.split('/')[2];
        await DB.prepare('UPDATE conversations SET unread=0 WHERE id=?').bind(cid).run();
        return json({ ok: true }, 200, h);
      }

      if (request.method === 'DELETE' && path.startsWith('/messages/')) {
        const mid = parseInt(path.split('/')[2]);
        await DB.prepare('DELETE FROM messages WHERE id=?').bind(mid).run();
        return json({ ok: true }, 200, h);
      }

      if (request.method === 'DELETE' && path.startsWith('/conversations/')) {
        const cid = path.split('/')[2];
        await DB.prepare('DELETE FROM messages WHERE convId=?').bind(cid).run();
        await DB.prepare('DELETE FROM conversations WHERE id=?').bind(cid).run();
        return json({ ok: true }, 200, h);
      }

      // ---- MOD LOG ----
      if (request.method === 'GET' && path === '/modlog') {
        const logs = await DB.prepare('SELECT * FROM mod_log ORDER BY createdAt DESC LIMIT 50').all();
        return json({ logs: logs.results }, 200, h);
      }

      if (request.method === 'POST' && path === '/modlog') {
        const b = await request.json();
        await DB.prepare('INSERT INTO mod_log (icon,bg,ic,text,time) VALUES (?,?,?,?,?)').bind(b.icon, b.bg, b.ic, b.text, b.time || "à l'instant").run();
        return json({ ok: true }, 200, h);
      }

      return json({ error: 'Not found' }, 404, h);
    } catch (e) {
      return json({ error: e.message }, 500, h);
    }
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
