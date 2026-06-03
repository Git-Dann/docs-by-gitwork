/**
 * Gitwork Pulse — embeddable site health-check widget.
 *
 * Usage (drop anywhere on your page):
 *   <script async src="https://foundry.gitwork.co.uk/embed/pulse/embed.js"></script>
 *
 * Inserts a responsive, auto-resizing iframe at the script's location.
 */
(function () {
  var ORIGIN = "https://foundry.gitwork.co.uk";
  var current = document.currentScript;

  var iframe = document.createElement("iframe");
  iframe.src = ORIGIN + "/embed/pulse";
  iframe.title = "Gitwork Pulse — free site health check";
  iframe.loading = "lazy";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.minHeight = "420px";
  iframe.style.overflow = "hidden";

  if (current && current.parentNode) {
    current.parentNode.insertBefore(iframe, current);
  } else {
    document.body.appendChild(iframe);
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN) return;
    var data = e.data || {};
    if (data.type === "pulse-embed-height" && typeof data.height === "number") {
      iframe.style.height = data.height + "px";
    }
  });
})();
