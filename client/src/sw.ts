/// <reference lib="webworker" />
// Service worker: makes the app installable and keeps the app shell offline.
// API data is never cached: offline, requests fail and the app shows a banner.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Page loads (SPA routes) get index.html; backend paths always go to the server
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api(\/|$)/, /^\/uploads(\/|$)/],
  }),
);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
