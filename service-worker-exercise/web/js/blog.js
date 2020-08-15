(function Blog() {
  "use strict";

  var offlineIcon;
  var isOnline = "onLine" in navigator ? navigator.onLine : true;
  var isLoggedIn = /isLoggedIn=1/.test(document.cookie.toString() || "");
  // let the page monitor if we are logged in since worker cannot do it
  var swRegistration;
  var svcworker;

  document.addEventListener("DOMContentLoaded", ready, false);

  if ("serviceWorker" in navigator) {
    initServiceWorker().catch(console.error);
  }
  // **********************************

  function ready() {
    offlineIcon = document.getElementById("connectivity-status");

    if (!isOnline) {
      offlineIcon.classList.remove("hidden");
    }

    window.addEventListener("online", function online() {
      offlineIcon.classList.add("hidden");
      isOnline = true;
      sendStatusUpdate(); //not passing in target this time
    });

    window.addEventListener("offline", function offline() {
      offlineIcon.classList.add("hidden");
      isOnline = false;
      sendStatusUpdate();
    });
  }
  // STEP 1. init servie worker
  async function initServiceWorker() {
    swRegistration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });

    var svworker =
      swRegistration.installing ||
      swRegistration.waiting ||
      swRegistration.active;

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      function onController() {
        svworker = navigator.serviceWorker.controller;
        // proactively send status update when controller changes
        sendStatusUpdate(svcworker);
      }
    );

    navigator.serviceWorker.addEventListener("message", onSWMessage, false);

    function onSWMessage(e) {
      var { data } = e;
      // if the worker has this requestStatusUpdate property
      if (data.requestStatusUpdate) {
        console.log(`Receive status update request from service worker `);
        sendStatusUpdate(e.ports && e.ports[0]);
      }
    }

    function sendStatusUpdate(target) {
      sendSWMessage({ statusUpdate: { isOnline, isLoggedIn } }, target);
    }
  }
  // Message Handling in the Client
  // Send msg to the worker from this page
  async function sendSWMessage(msg, target) {
    if (target) {
      target.postMessage(msg);
    } else if (svcworker) {
      svcworker.postMessage(msg);
    } else {
      navigator.serviceWorker.controller.postMessage(msg);
    }
  }
})();
