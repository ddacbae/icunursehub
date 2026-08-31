// 앱을 수정해서 배포할 때마다 아래 버전 숫자를 올려주세요 (v2 → v3 → ...)
const CACHE_NAME = 'icu-hub-v13';
const FILES = ['./', './index.html', './app.js', './style.css', './manifest.json', './icon.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // 설치 시점의 파일도 브라우저 캐시를 무시하고 서버에서 새로 받아옴
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 항상 네트워크 먼저 → 실패 시 캐시 사용 (오프라인 대응)
self.addEventListener('fetch', e => {
  const req = e.request;

  // GET 이외(구글시트 전송 등)는 서비스워커가 관여하지 않음
  if (req.method !== 'GET') return;

  // 같은 출처(내 앱 파일)만 처리. 외부 요청(구글시트 조회 등)은 그대로 통과
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // APK 는 한 번 받으면 끝인 1MB 넘는 파일이라 캐시에 담지 않음
  if (url.pathname.endsWith('.apk')) return;

  e.respondWith(
    // cache:'no-store' — 브라우저 HTTP 캐시(10분)를 건너뛰고 항상 서버 최신본을 받음
    fetch(req, { cache: 'no-store' })
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        return res;
      })
      // 오프라인: 캐시 → 없으면 페이지 이동 요청은 index.html로 대체
      .catch(() =>
        caches.match(req).then(hit => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
