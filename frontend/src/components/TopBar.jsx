export default function TopBar({
  problem,
  executionMode,
  onExecutionModeChange,
  language,
  onLanguageChange,
  executionModes,
  onRunAll,
  onSubmit,
  isSubmitting,
  submissionState
}) {
  const verdictClass = {
    accepted: "verdict-accepted",
    rejected: "verdict-rejected",
    error: "verdict-error",
    testing: "verdict-testing",
    polling: "verdict-testing"
  }[submissionState.status] || "verdict-idle";

  return (
    <header className="topbar">
      <div className="brand"><img className="brand-mark" src="/codeflow-icon.svg" alt="" /><span>CodeFlow</span></div>
      <div className="problem-meta">
        <strong>{problem?.title || "Select a Codeforces problem"}</strong>
        {problem && <span>{problem.contestType === "gym" ? "Gym" : "Contest"} {problem.contestId} · {problem.problemIndex} · {problem.timeLimitMs} ms · {problem.memoryLimitMb} MB</span>}
      </div>
      <div className="topbar-actions">
        <label className="execution-field">
          <span>Run code with</span>
          <select value={executionMode} onChange={(event) => onExecutionModeChange(event.target.value)}>
            {["judge0", "local"].map((mode) => (
              <option key={mode} value={mode} disabled={!executionModes?.[mode]?.languages?.[language]?.available}>
                {mode === "judge0"
                  ? "Judge0 CE (online)"
                  : executionModes?.local?.languages?.[language]?.available
                    ? "Local runner (this device)"
                    : "Local runner (not detected)"}
              </option>
            ))}
          </select>
        </label>
        <label className="execution-field">
          <span>Language</span>
          <select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
            {[
              ["cpp", "C++"],
              ["python", "Python 3"],
              ["java", "Java 17"]
            ].map(([value, label]) => {
              const available = ["local", "judge0"].some(
                (mode) => executionModes?.[mode]?.languages?.[value]?.available
              );
              return <option key={value} value={value} disabled={!available}>{label}{available ? "" : " (unavailable)"}</option>;
            })}
          </select>
        </label>
        <button className="button button-muted" onClick={onRunAll}>Run All Samples</button>
        <button className="button button-submit" onClick={onSubmit} disabled={isSubmitting || !problem}>
          {isSubmitting ? "Submitting..." : "Submit to CF"}
        </button>
        <div className={`verdict-pill ${verdictClass}`} title={submissionState.detail}>
          <span className="verdict-dot" />
          <span>{submissionState.detail || "No submission"}</span>
        </div>
      </div>
    </header>
  );
}
