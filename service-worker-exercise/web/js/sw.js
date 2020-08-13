"use strict";
const version = 9;
var isOnline = true;
var isLoggedIn = false;
var cacheName = `ramblings-${version}`;

var urlsToCache = {
  loggedOut: [
    "/",
    "/about",
    "/contact",
    "/404",
    "/login",
    "/offline",
    "/css/styles.css",
    "/js/blog.js",
    "/js/home.js",
    "/js/login.js",
    "/js/add-post.js",
    "/js/external/idb-keyval-iife.min.js",
    "/images/logo.gif",
    "/images/offline.png",
  ],
};

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("message", onMessage);

main().catch(console.error);

async function main() {
  await sendMessage({ requestStatusUpdate: true });
  await cacheLoggedOutFiles();
  console.log(`service worker ${version} is starting ...`);
}
async function onInstall(e) {
  console.log(`service worker ${version} is installed ...`);
  self.skipWaiting();
}

async function sendMessage(msg) {
  //first get all clients
  var allClients = await clients.matchAll({ includeUncontrolled: true });
  // give them promises
  return Promise.all(
    allClients.map(function sendTo(client) {
      var chan = new MessageChannel();
      chan.port1.onmessage = onMessage;
      return client.postMessage(msg, [chan.port2]);
    })
  );
}

function onMessage({ data }) {
  if ("statusUpdate" in data) {
    ({ isOnline, isLoggedIn } = data.statusUpdate);
    console.log(
      `Service Worker (v${version}) status update... isOnline:${isOnline}, isLoggedIn:${isLoggedIn}`
    );
  }
}

async function onActivate(e) {
  // tell not to shut down until handleActivation is finished
  e.waitUntil(handleActivation());
}

async function handleActivation() {
  //clean old cache
  await clearCaches();
  //we want to force reload (cache) first time when worker activated
  await cacheLoggedOutFiles(true);
  //get the new service worker come into control (in case old pages still under control of old workers)
  await clients.claim();

  console.log(`service worker ${version} is activated ...`);
}

async function cacheLoggedOutFiles(forceReload = false) {
  var cache = await caches.open(cacheName);
  return Promise.all(
    urlsToCache.loggedOut.map(async function cacheFile(url) {
      try {
        let res;
        // we only make a cache request
        // when in forcerelaod
        if (!forceReload) {
          res = await cache.match(url);
          if (res) {
            return res;
          }
        }
        let fetchOptions = {
          method: "GET",
          cache: "no-cache", //tell browser don't store this in intermidiary response, we want fresh from server
          credentials: "omit", // credentials are cookies, in loggout status we want to omit
        };
        res = await fetch(url, fetchOptions);
        if (res.ok) {
          //normally we need to clone res when we both want to return res to browser and cache it
          // await cache.put(url, res.clone())
          // but in this case we are making request ourselves
          await cache.put(url, res);
        }
      } catch (err) {}
    })
  );
}

async function clearCaches() {
  var cacheNames = await caches.keys();
  var oldCacheNames = cacheNames.filter(function matchOldCache(cacheName) {
    if (/^ramblings-(\d+)$/.test(cacheName)) {
      /*only delete cache created by us */
      let [, cacheVersion] = cacheName.match(/^ramblings-(\d+)$/);
      cacheVersion = cacheVersion != null ? Number(cacheVersion) : cacheVersion;
      return cacheVersion > 0 && version != cacheVersion;
    }
  });
  await Promise.all(
    oldCacheNames.map(function deleteCache(cacheName) {
      return caches.delete(cacheName);
    })
  );
}
