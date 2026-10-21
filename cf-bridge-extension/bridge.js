const IDE_ORIGIN = "http://localhost:5173";

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== IDE_ORIGIN || !event.data) return;

  if (event.data.type === "LOAD_CF_PROBLEM") {
    const key = String(event.data.key || "");
    if (!/^\d+_[A-Z]\d*$/.test(key)) return;
    try {
      const stored = await chrome.storage.local.get(`cf_prob_${key}`);
      window.postMessage({
        type: "CF_PROBLEM_LOADED",
        key,
        problem: stored[`cf_prob_${key}`] || null
      }, IDE_ORIGIN);
    } catch (error) {
      window.postMessage({ type: "CF_BRIDGE_ERROR", error: error.message }, IDE_ORIGIN);
    }
  }

  if (event.data.type === "CF_SUBMIT_CODE") {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CF_SUBMIT_CODE",
        ...event.data.payload
      });
      window.postMessage({ type: "CF_SUBMIT_RESULT", requestId: event.data.requestId, ...response }, IDE_ORIGIN);
    } catch (error) {
      window.postMessage({
        type: "CF_SUBMIT_RESULT",
        requestId: event.data.requestId,
        ok: false,
        error: error.message
      }, IDE_ORIGIN);
    }
  }
});
