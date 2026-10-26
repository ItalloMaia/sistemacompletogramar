/* Gramar Hub — service worker
   1) deixa o app abrir sem sinal (pra tirar foto no campo)
   2) recebe as notificações push (tarefas e pendências)
   Rede primeiro: com internet sempre carrega a versão nova; o cache só entra quando está offline. */

const CACHE = "gramar-hub-v3";
const LIBS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // dados e fotos nunca vêm do cache
  const doApp = url.origin === self.location.origin;
  if (!doApp && !LIBS.includes(url.hostname)) return;

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") {
        const c = await caches.open(CACHE);
        c.put(doApp && req.mode === "navigate" ? "./index.html" : req, res.clone());
      }
      return res;
    } catch (err) {
      if (req.mode === "navigate") {
        const pagina = (await caches.match("./index.html")) || (await caches.match("./"));
        if (pagina) return pagina;
      }
      const salvo = await caches.match(req);
      if (salvo) return salvo;
      throw err;
    }
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const titulo = d.title || d.titulo || "Gramar Hub";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || d.corpo || "",
    tag: d.tag,
    renotify: !!d.tag,
    icon: "./icons/icon-192.png",
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const j of janelas) {
      if (j.url.startsWith(self.registration.scope)) {
        await j.focus();
        if (j.navigate) await j.navigate(alvo).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(alvo);
  })());
});
