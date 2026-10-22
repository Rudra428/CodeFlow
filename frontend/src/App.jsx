import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditorPane, { LANGUAGE_TEMPLATES } from "./components/EditorPane.jsx";
import TestCaseManager from "./components/TestCaseManager.jsx";
import TopBar from "./components/TopBar.jsx";
import { useExtensionBridge } from "./hooks/useExtensionBridge.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const LOCAL_BACKEND_URL = import.meta.env.VITE_LOCAL_BACKEND_URL || "http://127.0.0.1:4000";

const UNAVAILABLE_LOCAL_MODE = {
  available: false,
  languages: {
    cpp: { available: false, language: null },
    python: { available: false, language: null },
    java: { available: false, language: null }
  }
};

function createId() {
  return globalThis.crypto?.randomUUID?.() || `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const { problem, problemKey, bridgeError, submitCode, pollVerdict, submissionState, setSubmissionState } = useExtensionBridge();
  const [language, setLanguage] = useState("cpp");
  const storageKey = useMemo(() => {
    const base = `cf-cloud-code-${problemKey || "scratch"}`;
    return language === "cpp" ? base : `${base}-${language}`;
  }, [language, problemKey]);
  const [code, setCode] = useState(() => localStorage.getItem(storageKey) || LANGUAGE_TEMPLATES[language]);
  const activeStorageKey = useRef(storageKey);
  const [testCases, setTestCases] = useState([]);
  const [compilerStandard, setCompilerStandard] = useState("Detecting compiler...");
  const [executionMode, setExecutionMode] = useState("judge0");
  const [executionModes, setExecutionModes] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("checking");
  const [runningAll, setRunningAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeStorageKey.current !== storageKey) {
      activeStorageKey.current = storageKey;
      setCode(localStorage.getItem(storageKey) || LANGUAGE_TEMPLATES[language]);
      return;
    }
    localStorage.setItem(storageKey, code);
  }, [storageKey, code, language]);
  useEffect(() => {
    let active = true;
    const localController = new AbortController();
    const localTimeout = window.setTimeout(() => localController.abort(), 30000);

    fetch(`${LOCAL_BACKEND_URL}/api/local-health`, {
      cache: "no-store",
      signal: localController.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Local runner returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((health) => {
        if (!active) return;
        const localMode = { available: health.available, languages: health.languages };
        setExecutionModes((current) => ({
          ...(current || { judge0: { available: false, languages: {} } }),
          local: localMode
        }));
      })
      .catch(() => {
        if (!active) return;
        setExecutionModes((current) => ({
          ...(current || { judge0: { available: false, languages: {} } }),
          local: UNAVAILABLE_LOCAL_MODE
        }));
      })
      .finally(() => window.clearTimeout(localTimeout));

    fetch(`${BACKEND_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((health) => {
        if (!active) return;
        setExecutionModes((current) => ({
          ...health.modes,
          local: current?.local || UNAVAILABLE_LOCAL_MODE
        }));
      })
      .catch(() => {
        if (!active) return;
        setCompilerStandard("Judge0 backend unavailable");
        setExecutionModes((current) => current || {
          judge0: { available: false, languages: {} },
          local: UNAVAILABLE_LOCAL_MODE
        });
      });
    return () => {
      active = false;
      localController.abort();
      window.clearTimeout(localTimeout);
    };
  }, []);
  useEffect(() => {
    if (!executionModes) return;
    const selected = executionModes[executionMode]?.languages?.[language];
    setCompilerStandard(selected?.available
      ? selected.language
      : `${language} unavailable in ${executionMode === "local" ? "local mode" : "Judge0 CE"}`);
  }, [executionMode, executionModes, language]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDiagnosticsStatus("checking");
      try {
        const backendUrl = executionMode === "local" ? LOCAL_BACKEND_URL : BACKEND_URL;
        const response = await fetch(`${backendUrl}/api/diagnostics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCode: code, executionMode, language }),
          signal: controller.signal
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Diagnostics returned HTTP ${response.status}.`);
        setDiagnostics(result.diagnostics || []);
        setDiagnosticsStatus("ready");
      } catch (error) {
        if (error.name === "AbortError") return;
        setDiagnostics([]);
        setDiagnosticsStatus("error");
      }
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [code, executionMode, language]);
  useEffect(() => {
    if (!problem) return;
    setTestCases(problem.testCases.map((test) => ({
      ...test,
      expectedOutput: test.expectedOutput || "",
      actualOutput: null,
      stderr: "",
      error: "",
      errorType: null
    })));
  }, [problem]);

  const updateTest = (id, field, value) => setTestCases((current) =>
    current.map((test) => test.id === id ? { ...test, [field]: value } : test)
  );
  const addTest = () => setTestCases((current) => [...current, {
    id: createId(), input: "", expectedOutput: "", actualOutput: null, stderr: "", error: "", errorType: null
  }]);
  const deleteTest = (id) => setTestCases((current) => current.filter((test) => test.id !== id));

  const runCases = useCallback(async (ids) => {
    if (!ids.length) return;
    setTestCases((current) => current.map((test) => ids.includes(test.id)
      ? { ...test, running: true, error: "", errorType: null, actualOutput: null }
      : test));
    try {
      const backendUrl = executionMode === "local" ? LOCAL_BACKEND_URL : BACKEND_URL;
      const response = await fetch(`${backendUrl}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionMode,
          language,
          sourceCode: code,
          timeLimitMs: problem?.timeLimitMs || 2000,
          testCases: testCases.filter((test) => ids.includes(test.id)).map(({ id, input }) => ({ id, input }))
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Execution service returned HTTP ${response.status}.`);
      if (result.language) setCompilerStandard(result.language);
      if (result.compileError) {
        setTestCases((current) => current.map((test) => ids.includes(test.id)
          ? { ...test, running: false, error: result.compileError, errorType: "compile", stderr: result.compileError }
          : test));
        return;
      }
      const byId = new Map(result.results.map((item) => [item.id, item]));
      setTestCases((current) => current.map((test) => {
        const item = byId.get(test.id);
        if (!item) return test;
        return {
          ...test,
          running: false,
          actualOutput: item.stdout ?? "",
          stderr: item.stderr ?? "",
          error: item.error || "",
          errorType: item.status === "CE" ? "compile" : item.status === "TLE" ? "timeout" : item.status === "RE" ? "runtime" : null,
          durationMs: item.durationMs
        };
      }));
    } catch (error) {
      setTestCases((current) => current.map((test) => ids.includes(test.id)
        ? { ...test, running: false, error: error.message || "Execution request failed.", errorType: "runtime" }
        : test));
    }
  }, [code, executionMode, language, problem, testCases]);

  const runSingle = (id) => runCases([id]);
  const runAll = async () => {
    setRunningAll(true);
    try {
      await runCases(testCases.map((test) => test.id));
    } finally {
      setRunningAll(false);
    }
  };

  const changeLanguage = (nextLanguage) => {
    const otherMode = executionMode === "local" ? "judge0" : "local";
    const available = executionModes?.[executionMode]?.languages?.[nextLanguage]?.available;
    const availableInOther = executionModes?.[otherMode]?.languages?.[nextLanguage]?.available;
    if (!available && availableInOther) setExecutionMode(otherMode);
    setLanguage(nextLanguage);
  };

  const submit = async () => {
    if (!problem) return;
    if (!problem.cfHandle?.trim()) {
      setSubmissionState({ status: "error", detail: "Sign in to Codeforces and reload this problem." });
      return;
    }
    setSubmitting(true);
    setSubmissionState({ status: "polling", detail: "Submitting..." });
    const submittedAt = Date.now();
    try {
      const result = await submitCode({
        contestId: problem.contestId,
        contestType: problem.contestType,
        problemIndex: problem.problemIndex,
        language,
        sourceCode: code
      });
      if (!result.ok) {
        setSubmissionState({ status: "error", detail: result.error || "Submission failed." });
        return;
      }
      void pollVerdict({ handle: problem.cfHandle, contestId: problem.contestId, problemIndex: problem.problemIndex, submittedAt });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="app-shell">
      <TopBar
        problem={problem}
        executionMode={executionMode}
        onExecutionModeChange={setExecutionMode}
        language={language}
        onLanguageChange={changeLanguage}
        executionModes={executionModes}
        onRunAll={runAll}
        onSubmit={submit}
        isSubmitting={submitting}
        submissionState={submissionState}
      />
      {bridgeError && <div className="notice">{bridgeError} Ensure the CodeFlow extension is enabled.</div>}
      {executionMode === "local" && (
        <div className="notice">
          Local mode runs code on this computer with your account permissions. Only run code you trust.
        </div>
      )}
      <div className="workspace">
        <section className="editor-section">
          <EditorPane
            value={code}
            onChange={setCode}
            compilerStandard={compilerStandard}
            diagnostics={diagnostics}
            diagnosticsStatus={diagnosticsStatus}
            language={language === "cpp" ? "cpp" : language}
          />
        </section>
        <TestCaseManager
          testCases={testCases}
          onChange={updateTest}
          onAdd={addTest}
          onDelete={deleteTest}
          onRunSingle={runSingle}
          onRunAll={runAll}
          runningAll={runningAll}
        />
      </div>
      <footer className="statusbar">
        <span>{problemKey ? `Problem ${problemKey}` : "Scratch workspace"}</span>
        <span>Saved locally · {executionMode === "local" ? "Local runtime" : "Judge0 CE"} · Backend {BACKEND_URL}</span>
      </footer>
    </main>
  );
}
