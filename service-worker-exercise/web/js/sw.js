"use strict";
const version = 11;
var isOnline = true;
var isLoggedIn = false;
var cacheName = `ramblings-${version}`;
var allPostsCaching = false;

var urlsToCache = {
  loggedOut: [
    "/",
    "/about",
    "/contact",
    "/404",
    "/login",
    "/offline",
    "/css/style.css",
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
self.addEventListener("fetch", onFetch);

main().catch(console.error);

async function main() {
  await sendMessage({ requestStatusUpdate: true });
  await cacheLoggedOutFiles();
  console.log(`service worker ${version} is starting ...`);
   return cacheAllPosts();
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

function onFetch(e) {
  e.respondWith(router(e.request));
}

// async function router(req) {
//   var url = new URL(req.url);
//   var res;
//   var reqURL = url.pathname;
//   var cache = await caches.open(cacheName);

//   // request for site's own URL?
//   if (url.origin == location.origin) {
//     try {
//       let fetchOptions = {
//         method: req.method,
//         headers: req.headers,
//         credentials: "omit",
//         cache: "no-store",
//       };
//       // try to get from the server
//       let res = await fetch(req.url, fetchOptions);
//       if (res && res.ok) {
//         // then cache it
//         await cache.put(reqURL, res.clone());
//         return res;
//       }
//     } catch (err) {
//       // if we can;t get from server, let's see if it's in cache
//       res = await cache.match(reqURL);
//       if (res) {
//         return res;
//       }
//     }
//   }
//   // TODO: figure out CORS request
// }

async function router(req) {
  var url = new URL(req.url);
  var reqURL = url.pathname;
  var cache = await caches.open(cacheName);

  // request for site's own URL?
  if (url.origin == location.origin) {
    // are we making an API request?
    if (/^\/api\/.+$/.test(reqURL)) {
      //1. get fresh from server if possible
      let fetchOptions = {
        credentials: "same-origin" /* for post where session is sent */,
        cache: "no-store",
      };
      let res = await safeRequest(
        reqURL,
        req,
        fetchOptions,
        /*cacheResponse=*/ false,
        /*checkCacheFirst=*/ false,
        /*checkCacheLast=*/ true,
        /*useRequestDirectly=*/ true
      );
      if (res) {
        if (req.method == "GET") {
          await cache.put(reqURL, res.clone());
        }
        // clear offline-backup of successful post?
        else if (reqURL == "/api/add-post") {
          await idbKeyval.del("add-post-backup");
        }
        return res;
      }
      //2 g404 not found

      return notFoundResponse();
    }
    // are we requesting a page?
    else if (req.headers.get("Accept").includes("text/html")) {
      // login-aware requests?
      if (/^\/(?:login|logout|add-post)$/.test(reqURL)) {
        let res;

        if (reqURL == "/login") {
          if (isOnline) {
            let fetchOptions = {
              method: req.method,
              headers: req.headers,
              credentials: "same-origin",
              cache: "no-store",
              redirect: "manual",
            };
            res = await safeRequest(reqURL, req, fetchOptions);
            if (res) {
              if (res.type == "opaqueredirect") {
                return Response.redirect("/add-post", 307);
              }
              return res;
            }
            if (isLoggedIn) {
              return Response.redirect("/add-post", 307);
            }
            res = await cache.match("/login");
            if (res) {
              return res;
            }
            return Response.redirect("/", 307);
          } else if (isLoggedIn) {
            return Response.redirect("/add-post", 307);
          } else {
            res = await cache.match("/login");
            if (res) {
              return res;
            }
            return cache.match("/offline");
          }
        } else if (reqURL == "/logout") {
          if (isOnline) {
            let fetchOptions = {
              method: req.method,
              headers: req.headers,
              credentials: "same-origin",
              cache: "no-store",
              redirect: "manual",
            };
            res = await safeRequest(reqURL, req, fetchOptions);
            if (res) {
              if (res.type == "opaqueredirect") {
                return Response.redirect("/", 307);
              }
              return res;
            }
            if (isLoggedIn) {
              isLoggedIn = false;
              await sendMessage("force-logout");
              await delay(100);
            }
            return Response.redirect("/", 307);
          } else if (isLoggedIn) {
            isLoggedIn = false;
            await sendMessage("force-logout");
            await delay(100);
            return Response.redirect("/", 307);
          } else {
            return Response.redirect("/", 307);
          }
        } else if (reqURL == "/add-post") {
          if (isOnline) {
            let fetchOptions = {
              method: req.method,
              headers: req.headers,
              credentials: "same-origin",
              cache: "no-store",
            };
            res = await safeRequest(
              reqURL,
              req,
              fetchOptions,
              /*cacheResponse=*/ true
            );
            if (res) {
              return res;
            }
            res = await cache.match(isLoggedIn ? "/add-post" : "/login");
            if (res) {
              return res;
            }
            return Response.redirect("/", 307);
          } else if (isLoggedIn) {
            res = await cache.match("/add-post");
            if (res) {
              return res;
            }
            return cache.match("/offline");
          } else {
            res = await cache.match("/login");
            if (res) {
              return res;
            }
            return cache.match("/offline");
          }
        }
      }
      // otherwise, just use "network-and-cache"
      else {
        let fetchOptions = {
          method: req.method,
          headers: req.headers,
          cache: "no-store",
        };
        let res = await safeRequest(
          reqURL,
          req,
          fetchOptions,
          /*cacheResponse=*/ false,
          /*checkCacheFirst=*/ false,
          /*checkCacheLast=*/ true
        );
        if (res) {
          // only cache not our 404 page
          if (!res.headers.get("X-Not-Found")) {
            await cache.put(reqURL, res.clone());
          } else {
            await cache.delete(reqURL);
          }
          return res;
        }

        // otherwise, return an offline-friendly page
        return cache.match("/offline");
      }
    }
    // all other files use "cache-first"
    else {
      let fetchOptions = {
        method: req.method,
        headers: req.headers,
        cache: "no-store",
      };
      let res = await safeRequest(
        reqURL,
        req,
        fetchOptions,
        /*cacheResponse=*/ true,
        /*checkCacheFirst=*/ true
      );
      if (res) {
        return res;
      }

      // otherwise, force a network-level 404 response
      return notFoundResponse();
    }
  }
}

async function handleActivation() {
  //clean old cache
  await clearCaches();
  //we want to force reload (cache) first time when worker activated
  await cacheLoggedOutFiles(true);
  //get the new service worker come into control (in case old pages still under control of old workers)
  await clients.claim();
  console.log(`service worker ${version} is activated ...`);


  // spin off background caching of all past posts (over time)
  cacheAllPosts(/*forceReload=*/ true).catch(console.error);
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

async function cacheAllPosts(forceReload = false) {
  // already caching the posts?
  if (allPostsCaching) {
    return;
  }
  allPostsCaching = true;
  await delay(5000);

  var cache = await caches.open(cacheName);
  var postIDs;

  try {
    if (isOnline) {
      let fetchOptions = {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
      };
      let res = await fetch("/api/get-posts", fetchOptions);
      if (res && res.ok) {/*if get the posts successfully */
        await cache.put("/api/get-posts", res.clone());
        postIDs = await res.json();
      }
    } else {/*if getting the posts failed, try to find the match */
      let res = await cache.match("/api/get-posts");
      if (res) {/*if find successfully */
				// To allow for efficient memory usage, you can only read a response/request's body once. 
				// clone() is used to create a copy of the response that can be read separately. 
        let resCopy = res.clone();
        postIDs = await res.json();
      }
      // caching not started, try to start again (later)
      else { /*if not found */
        allPostsCaching = false;
        return cacheAllPosts(forceReload);
      }
    }
  } catch (err) {
    console.error(err);
  }

  if (postIDs && postIDs.length > 0) {
    return cachePost(postIDs.shift());
  } else {
    allPostsCaching = false;
  }

  // *************************

  async function cachePost(postID) {
    var postURL = `/post/${postID}`;
    var needCaching = true;

    if (!forceReload) {
      let res = await cache.match(postURL);
      if (res) {
        needCaching = false;
      }
    }

    if (needCaching) {
      await delay(10000);
      if (isOnline) {
        try {
          let fetchOptions = {
            method: "GET",
            cache: "no-store",
            credentials: "omit",
          };
          let res = await fetch(postURL, fetchOptions);
          if (res && res.ok) { /*caching when fetched succssfully*/
            await cache.put(postURL, res.clone());
            needCaching = false;
          }
        } catch (err) {}
      }

      // failed, try caching this post again?
      if (needCaching) {
        return cachePost(postID);
      }
    }

    // any more posts to cache?
    if (postIDs.length > 0) {
      return cachePost(postIDs.shift());
    } else {
      allPostsCaching = false;
    }
  }
}


async function safeRequest(
  reqURL,
  req,
  options,
  cacheResponse = false,
  checkCacheFirst = false,
  checkCacheLast = false,
  useRequestDirectly = false
) {
  var cache = await caches.open(cacheName);
  var res;

  if (checkCacheFirst) {
    res = await cache.match(reqURL);
    if (res) {
      return res;
    }
  }

  if (isOnline) {
    try {
      if (useRequestDirectly) {
        res = await fetch(req, options);
      } else {
        res = await fetch(req.url, options);
      }

      if (res && (res.ok || res.type == "opaqueredirect")) {
        if (cacheResponse) {
          await cache.put(reqURL, res.clone());
        }
        return res;
      }
    } catch (err) {}
  }

  if (checkCacheLast) {
    res = await cache.match(reqURL);
    if (res) {
      return res;
    }
  }
}

function notFoundResponse() {
  return new Response("", {
    status: 404,
    statusText: "Not Found",
  });
}

function delay(ms) {
  return new Promise(function c(res) {
    setTimeout(res, ms);
  });
}