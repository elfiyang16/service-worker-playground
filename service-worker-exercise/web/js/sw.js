"use strict";
const version = 2;
var isOnline = true;
var isLoggedIn = false;

self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("message", onMessage);

main().catch(console.error);

async function main() {
  await sendMessage({ requestStatusUpdate: true });
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
  //get the new service worker come into control (in case old pages still under control of old workers)
  await client.claim();
  console.log(`service worker ${version} is activated ...`);
}
