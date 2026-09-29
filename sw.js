const CACHE='rep-harbor-v24';

const ASSETS=[
'./',
'./index.html',
'./manifest.webmanifest',
'./rep-harbor-180.png?v=12',
'./rep-harbor-192.png?v=12',
'./rep-harbor-512.png?v=12',
'./shark-squat.gif?v=3'
];

self.addEventListener(
'install',
event=>{

event.waitUntil(

caches
.open(CACHE)
.then(
cache=>cache.addAll(ASSETS)
)

);

self.skipWaiting();

}
);

self.addEventListener(
'activate',
event=>{

event.waitUntil(

caches
.keys()
.then(
keys=>
Promise.all(

keys
.filter(
key=>key!==CACHE
)
.map(
key=>caches.delete(key)
)

)
)
.then(
()=>self.clients.claim()
)

);

}
);

self.addEventListener(
'fetch',
event=>{

event.respondWith(

fetch(event.request)

.then(
response=>{

const copy=
response.clone();

caches
.open(CACHE)
.then(
cache=>
cache.put(
event.request,
copy
)
);

return response;

}
)

.catch(
()=>caches.match(
event.request
)
)

);

}
);
