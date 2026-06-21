export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
          return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers });
        }

        const ext = file.name.split('.').pop() || 'jpg';
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        await env.BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        const publicUrl = `https://pub-c59abb1df94540cebef8ec6fd286e08f.r2.dev/${key}`;

        return new Response(JSON.stringify({ url: publicUrl, key }), {
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      try {
        const listed = await env.BUCKET.list();
        let totalSize = 0;
        const files = [];
        for (const obj of listed.objects) {
          totalSize += obj.size;
          files.push({ key: obj.key, size: obj.size, uploaded: obj.uploaded });
        }
        const limitBytes = 10 * 1024 * 1024 * 1024;
        return new Response(JSON.stringify({
          totalFiles: files.length,
          totalSizeBytes: totalSize,
          totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
          limitGB: 10,
          usedPercent: Math.round(totalSize / limitBytes * 10000) / 100,
        }), {
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  },
};
