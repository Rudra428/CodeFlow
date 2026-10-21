import { useCallback, useEffect, useRef, useState } from "react";

export function useExtensionBridge() {
  const [problem, setProblem] = useState(null);
  const [bridgeError, setBridgeError] = useState("");
  const [submissionState, setSubmissionState] = useState({ status: "idle", detail: "" });
  const pendingRef = useRef(new Map());
  const problemKey = new URLSearchParams(window.location.search).get("problem");

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type === "CF_PROBLEM_LOADED") {
        setProblem(data.problem);
        if (!data.problem) setBridgeError("No saved problem was found. Open a Codeforces problem and click the extension icon.");
      } else if (data?.type === "CF_BRIDGE_ERROR") {
        setBridgeError(data.error || "The extension could not load this problem.");
      } else if (data?.type === "CF_SUBMIT_RESULT") {
        const resolve = pendingRef.current.get(data.requestId);
        if (resolve) {
          pendingRef.current.delete(data.requestId);
          resolve(data);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    if (problemKey) window.postMessage({ type: "LOAD_CF_PROBLEM", key: problemKey }, window.location.origin);
    return () => {
      window.removeEventListener("message", handleMessage);
      pendingRef.current.forEach((resolve) => resolve({ ok: false, error: "IDE was closed." }));
      pendingRef.current.clear();
    };
  }, [problemKey]);

  const submitCode = useCallback((payload) => new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    pendingRef.current.set(requestId, resolve);
    window.postMessage({ type: "CF_SUBMIT_CODE", requestId, payload }, window.location.origin);
    window.setTimeout(() => {
      if (!pendingRef.current.has(requestId)) return;
      pendingRef.current.delete(requestId);
      resolve({ ok: false, error: "Timed out waiting for the extension." });
    }, 35000);
  }), []);

  const pollVerdict = useCallback(async ({ handle, contestId, problemIndex, submittedAt }) => {
    if (!handle.trim()) {
      setSubmissionState({ status: "error", detail: "Could not detect the signed-in Codeforces handle." });
      return;
    }
    setSubmissionState({ status: "polling", detail: "Waiting for the submission to appear..." });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle.trim())}&from=1&count=1`);
        const data = await response.json();
        if (data.status !== "OK") throw new Error(data.comment || "Codeforces API request failed.");
        const submission = data.result?.[0];
        if (submission && submission.creationTimeSeconds * 1000 >= submittedAt - 5000) {
          const problem = submission.problem;
          const sameProblem = String(problem?.contestId) === String(contestId)
            && String(problem?.index) === String(problemIndex);
          if (sameProblem) {
            if (submission.verdict && submission.verdict !== "TESTING") {
              const verdict = submission.verdict;
              const accepted = verdict === "OK";
              const detail = accepted
                ? `Accepted · ${submission.timeConsumedMillis} ms · ${submission.memoryConsumedBytes / 1024} KB`
                : `${verdict.replaceAll("_", " ")}${submission.passedTestCount ? ` on test ${submission.passedTestCount + 1}` : ""} · ${submission.timeConsumedMillis} ms · ${submission.memoryConsumedBytes / 1024} KB`;
              setSubmissionState({ status: accepted ? "accepted" : "rejected", detail });
              return;
            }
            setSubmissionState({
              status: "testing",
              detail: `Testing on test ${(submission.passedTestCount || 0) + 1}...`
            });
          }
        }
      } catch (error) {
        setSubmissionState({ status: "error", detail: error.message || "Unable to poll Codeforces." });
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    setSubmissionState({ status: "error", detail: "Timed out waiting for a Codeforces verdict." });
  }, []);

  return { problem, problemKey, bridgeError, submitCode, pollVerdict, submissionState, setSubmissionState };
}
