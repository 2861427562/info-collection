// Cloudflare Worker —— 漫画上传 + Supabase 代理
// 绑三个域名到这一个 Worker：
//   up.ygylyp.app    → 上传/删除/目录接口
//   api.ygylyp.app   → 反向代理 Supabase（国内直连可用）
//   (默认 workers.dev 也行，但国内不通)
//
// 需要的设置：
//   Variables and secrets：UPLOAD_PASS（上传口令）、GH_TOKEN（GitHub token，用来同步目录）
//   Bindings：R2 bucket → 变量名 MANGA → manga 桶

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-pass, apikey, authorization, prefer, range",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "content-range, content-length",
};
const JSON_H = { ...CORS, "content-type": "application/json" };
const REPO = "2861427562/info-collection";
const SUPABASE = "https://jriobiugqjsejpctzhuj.supabase.co";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_H });
}

/* ---------- Supabase 反向代理 ---------- */
async function proxySupabase(request, url) {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  const target = SUPABASE + url.pathname + url.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  const init = { method: request.method, headers, redirect: "follow" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const resp = await fetch(target, init);
  const out = new Response(resp.body, { status: resp.status, statusText: resp.statusText });
  resp.headers.forEach((v, k) => {
    if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k.toLowerCase())) return;
    out.headers.set(k, v);
  });
  Object.entries(CORS).forEach(([k, v]) => out.headers.set(k, v));
  return out;
}

/* ---------- 目录同步到 GitHub ---------- */
async function syncToGitHub(env) {
  if (!env.GH_TOKEN) return { skipped: "no token" };
  const obj = await env.MANGA.get("index.json");
  if (!obj) return { skipped: "no index" };
  const content = await obj.text();
  const api = `https://api.github.com/repos/${REPO}/contents/manga.json`;
  const gh = { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "manga-worker" };
  let sha = null;
  const cur = await fetch(api + "?ref=main", { headers: gh });
  if (cur.ok) sha = (await cur.json()).sha;
  const body = {
    message: "manga index sync " + new Date().toISOString().slice(0, 16),
    content: btoa(unescape(encodeURIComponent(content))),
    branch: "main",
  };
  if (sha) body.sha = sha;
  const put = await fetch(api, { method: "PUT", headers: { ...gh, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: put.status, ok: put.ok };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // api.* 走 Supabase 代理
    if (url.hostname.startsWith("api.")) return proxySupabase(request, url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (request.method === "GET") {
      if (url.pathname === "/index.json" || url.searchParams.get("act") === "index") {
        const obj = await env.MANGA.get("index.json");
        const txt = obj ? await obj.text() : '{"base":"","series":[]}';
        return new Response(txt, { headers: JSON_H });
      }
      if (url.searchParams.get("act") === "ping") return json({ ok: true });
      return json({ ok: true, hint: "use POST for upload" });
    }

    if (request.method !== "POST") return json({ error: "method" }, 405);

    const pass = request.headers.get("x-pass") || "";
    if (!env.UPLOAD_PASS || pass !== env.UPLOAD_PASS) return json({ error: "forbidden" }, 403);

    const act = url.searchParams.get("act");

    if (act === "put") {
      const key = url.searchParams.get("key") || "";
      if (!key.startsWith("m/")) return json({ error: "bad key" }, 400);
      const buf = await request.arrayBuffer();
      await env.MANGA.put(key, buf, { httpMetadata: { contentType: "image/webp" } });
      return json({ ok: true, key, bytes: buf.byteLength });
    }

    if (act === "delete") {
      const prefix = url.searchParams.get("prefix") || "";
      if (!prefix.startsWith("m/")) return json({ error: "bad prefix" }, 400);
      let cursor, n = 0;
      do {
        const list = await env.MANGA.list({ prefix, cursor });
        for (const o of list.objects) { await env.MANGA.delete(o.key); n++; }
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      return json({ ok: true, deleted: n });
    }

    if (act === "index-get") {
      const obj = await env.MANGA.get("index.json");
      if (!obj) return json({ base: "", series: [] });
      return new Response(await obj.text(), { headers: JSON_H });
    }

    if (act === "index-put") {
      const txt = await request.text();
      let parsed;
      try { parsed = JSON.parse(txt); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!Array.isArray(parsed.series)) return json({ error: "bad shape" }, 400);
      await env.MANGA.put("index.json", txt, { httpMetadata: { contentType: "application/json" } });
      const gh = await syncToGitHub(env).catch(e => ({ error: String(e) }));
      return json({ ok: true, count: parsed.series.length, github: gh });
    }

    if (act === "gh-sync") {
      return json(await syncToGitHub(env).catch(e => ({ error: String(e) })));
    }

    // 写标签表：存 R2 并同步 GitHub
    if (act === "tags-put") {
      const txt = await request.text();
      let parsed;
      try { parsed = JSON.parse(txt); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!parsed || typeof parsed !== "object") return json({ error: "bad shape" }, 400);
      await env.MANGA.put("manga-tags.json", txt, { httpMetadata: { contentType: "application/json" } });
      const gh = await syncFileToGitHub(env, "manga-tags.json", txt).catch(e => ({ error: String(e) }));
      return json({ ok: true, github: gh });
    }

    return json({ error: "unknown act" }, 400);
  },
};
