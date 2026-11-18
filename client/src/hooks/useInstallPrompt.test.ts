import { test } from "node:test";
import assert from "node:assert/strict";
import { isStandalone, isIosSafari } from "./useInstallPrompt";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
};

const win = (standaloneMedia: boolean, navStandalone?: boolean) => ({
  matchMedia: (q: string) => ({ matches: standaloneMedia && q === "(display-mode: standalone)" }),
  navigator: { userAgent: UA.androidChrome, standalone: navStandalone },
});

test("standalone: display-mode media query", () => {
  assert.equal(isStandalone(win(true)), true);
  assert.equal(isStandalone(win(false)), false);
});

test("standalone: iOS navigator.standalone", () => {
  assert.equal(isStandalone(win(false, true)), true);
  assert.equal(isStandalone({ navigator: { userAgent: UA.iphoneSafari } }), false);
});

test("iOS hint only for iPhone/iPad Safari", () => {
  assert.equal(isIosSafari({ userAgent: UA.iphoneSafari }), true);
  assert.equal(isIosSafari({ userAgent: UA.ipadDesktopMode, platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isIosSafari({ userAgent: UA.ipadDesktopMode, platform: "MacIntel", maxTouchPoints: 0 }), false); // a Mac
  assert.equal(isIosSafari({ userAgent: UA.iphoneChrome }), false);
  assert.equal(isIosSafari({ userAgent: UA.androidChrome }), false);
});
