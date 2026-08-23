const CACHE = 'kakeibo-v10';
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // 外部API(Google/Anthropic/Supabase)はSWを通さず素通し
  if (url.includes('googleapis.com') || url.includes('anthropic.com') || url.includes('supabase')) return;

  // HTML本体(ページ遷移)は「ネット優先」= 常に最新を取得し、取れたらキャッシュも更新。
  // オフライン時のみキャッシュにフォールバック。これで古い版に固まらない。
  const isHtml = e.request.mode === 'navigate' || url.endsWith('/index.html') || url.endsWith('/kakeibo/');
  if (isHtml) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', clone));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // それ以外(CDNライブラリ等)はキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && url.startsWith('https://cdnjs')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
