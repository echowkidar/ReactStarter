import type { SyntheticEvent } from "react";

/**
 * onError for small fixed images (the AMU logo): if the image could not be loaded — for example
 * while the server was restarting during a redeploy — try again a few times instead of leaving a
 * broken image in a header that stays on screen across pages.
 */
export function retryImage(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const tries = Number(img.dataset.retries || "0");
  if (tries >= 3) return;
  img.dataset.retries = String(tries + 1);
  const base = img.src.split("?")[0];
  setTimeout(() => { img.src = `${base}?retry=${Date.now()}`; }, 2000 * (tries + 1));
}
