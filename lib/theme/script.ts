import { THEME_STORAGE_KEY } from "./constants";

/**
 * The no-flash theme bootstrap.
 *
 * This string is injected as a synchronous, blocking <script> in <head> so the
 * correct theme class is on <html> BEFORE the browser paints the first frame.
 * Without it the page paints light, then React hydrates and flips to dark —
 * the classic theme flash.
 *
 * Constraints that shape how this is written:
 * - It must be tiny and synchronous. No imports, no async, no framework.
 * - It must never throw. localStorage access throws in Safari private mode and
 *   when cookies/site-data are blocked, and a throw here would abort the rest
 *   of <head>. Hence the try/catch around everything.
 * - It sets `color-scheme` too, so native UI (form controls, scrollbars, the
 *   canvas behind the page) matches immediately rather than flashing white.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(s!=="light"&&s!=="dark"&&s!=="system"){s="light";}
var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var e=document.documentElement;
e.classList.toggle("dark",d);
e.style.colorScheme=d?"dark":"light";
}catch(_){}})();`;
