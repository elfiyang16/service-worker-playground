"use strict";

var curFib = 0;

self.postMessage("Hello from webworker");

self.onmessage = onMessage;

// **********************************

function onMessage(evt) {
  console.log("receive in the web worker");
  getNextFib();
}

function getNextFib() {
  var fibNum = fib(curFib);
  self.postMessage({ idx: curFib, fib: fibNum });
  curFib++;
  setTimeout(getNextFib, 0);
}

function fib(n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}
