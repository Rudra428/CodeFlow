const IDE_ORIGINS = new Set([
  "http://localhost:5173",
  "https://code-flow-rho-lemon.vercel.app"
]);

window.addEventListener("message", async (event) => {
  if (event.source !== window || !IDE_ORIGINS.has(event.origin) || !event.data) return;
  const ideOrigin = event.origin;

  if (event.data.type === "LOAD_CF_PROBLEM") {
    const key = String(event.data.key || "");
    const requestId = event.data.requestId;
    if (!/^\d+_[A-Z]\d*$/.test(key)) {
      window.postMessage({
        type: "CF_BRIDGE_ERROR",
        requestId,
        error: "The Codeforces problem link is invalid. Reopen the problem with the CodeFlow extension."
      }, ideOrigin);
      return;
    }
    try {
      const stored = await chrome.storage.local.get(`cf_prob_${key}`);
      window.postMessage({
        type: "CF_PROBLEM_LOADED",
        requestId,
        key,
        problem: stored[`cf_prob_${key}`] || null
      }, ideOrigin);
    } catch (error) {
      window.postMessage({ type: "CF_BRIDGE_ERROR", requestId, error: error.message }, ideOrigin);
    }
  }

  if (event.data.type === "CF_SUBMIT_CODE") {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CF_SUBMIT_CODE",
        ...event.data.payload
      });
      window.postMessage({ type: "CF_SUBMIT_RESULT", requestId: event.data.requestId, ...response }, ideOrigin);
    } catch (error) {
      window.postMessage({
        type: "CF_SUBMIT_RESULT",
        requestId: event.data.requestId,
        ok: false,
        error: error.message
      }, ideOrigin);
    }
  }
});
