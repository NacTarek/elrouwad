/* Rouwad studio offline worker: open instantly from cache, check for a newer page in the background */
const CACHE = "rouwad-studio-v22";
const SHELL = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const sameOrigin = u => new URL(u).origin === self.location.origin;
async function refreshPage(){ // revalidate the page (ETag → 304 when unchanged, so this is cheap)
  try{
    const c = await caches.open(CACHE), old = await c.match("./");
    const res = await fetch("./", { cache: "no-cache" });
    if(!res.ok) return;
    const changed = !old || (res.headers.get("etag") && res.headers.get("etag") !== old.headers.get("etag")) || res.headers.get("content-length") !== old.headers.get("content-length");
    if(!changed) return;
    await c.put("./", res.clone());
    if(old){ const cl = await self.clients.matchAll({ type: "window" }); cl.forEach(w => w.postMessage({ type: "rouwad-update" })); }
  }catch(e){ /* offline: keep the cached page */ }
}
self.addEventListener("fetch", e => {
  const r = e.request; if(r.method !== "GET" || !sameOrigin(r.url)) return; // Supabase and other hosts go straight to the network
  if(r.mode === "navigate"){
    e.respondWith((async () => { const c = await caches.open(CACHE); const hit = await c.match("./");
      if(hit){ e.waitUntil(refreshPage()); return hit; }
      try{ const res = await fetch(r); if(res.ok) c.put("./", res.clone()); return res; }catch(err){ return new Response("غير متصل", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); } })());
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => { if(res.ok){ const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })));
});
self.addEventListener("message", e => { if(e.data === "rouwad-check") e.waitUntil(refreshPage()); });
