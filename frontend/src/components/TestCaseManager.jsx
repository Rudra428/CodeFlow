function compareOutput(actual, expected) {
  const normalize = (value) => value.split(/\r?\n/).map((line) => line.trimEnd()).join("\n").replace(/\n+$/, "");
  return normalize(actual) === normalize(expected);
}

const STATUS_STYLES = {
  AC: "badge-ac",
  WA: "badge-wa",
  TLE: "badge-tle",
  RE: "badge-re",
  CE: "badge-wa",
  IDLE: "badge-idle",
  RUNNING: "badge-tle"
};

function statusFor(test) {
  if (test.running) return "RUNNING";
  if (test.errorType === "compile") return "CE";
  if (test.errorType === "timeout") return "TLE";
  if (test.errorType) return "RE";
  if (test.actualOutput == null) return "IDLE";
  return compareOutput(test.actualOutput, test.expectedOutput) ? "AC" : "WA";
}

function outputDiff(actual, expected) {
  const actualLines = actual.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const expectedLines = expected.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  return Array.from({ length: Math.max(actualLines.length, expectedLines.length) }, (_, index) => ({
    actual: actualLines[index],
    expected: expectedLines[index]
  }));
}

export default function TestCaseManager({ testCases, onChange, onAdd, onDelete, onRunSingle, onRunAll, runningAll }) {
  return (
    <section className="tests-panel">
      <div className="tests-toolbar">
        <div>
          <h2>Test cases</h2>
          <span className="muted">{testCases.length} cases</span>
        </div>
        <div className="button-row">
          <button className="button button-muted" onClick={onAdd}>+ Add Test Case</button>
          <button className="button button-primary" onClick={onRunAll} disabled={!testCases.length || runningAll}>
            {runningAll ? "Running..." : "Run All Tests"}
          </button>
        </div>
      </div>
      <div className="test-list">
        {testCases.map((test, index) => {
          const status = statusFor(test);
          return (
            <article className="test-card" key={test.id}>
              <header className="test-card-heading">
                <div className="test-card-title">
                  <span className={`status-badge ${STATUS_STYLES[status]}`}>{status}</span>
                  <strong>Test {index + 1}</strong>
                  {test.durationMs != null && <span className="muted">{test.durationMs.toFixed(1)} ms</span>}
                </div>
                <div className="button-row">
                  <button className="button button-small button-muted" disabled={test.running || runningAll} onClick={() => onRunSingle(test.id)}>Run</button>
                  <button className="button button-small button-danger" onClick={() => onDelete(test.id)} aria-label={`Delete test ${index + 1}`}>Delete</button>
                </div>
              </header>
              <div className="io-grid">
                <label className="io-input">Input<textarea value={test.input} onChange={(event) => onChange(test.id, "input", event.target.value)} spellCheck="false" /></label>
                <label className="io-actual">Actual output<pre className="output-box">{test.actualOutput ?? "Run this test to see output."}</pre></label>
                <label className="io-expected">Expected output<textarea value={test.expectedOutput} onChange={(event) => onChange(test.id, "expectedOutput", event.target.value)} spellCheck="false" /></label>
                <label className="io-stderr">Debug (stderr)<pre className="output-box stderr-console">{test.stderr || (test.error ? `${test.error}\n` : "No diagnostics.")}</pre></label>
              </div>
              {test.actualOutput != null && status === "WA" && (
                <div className="diff-box">
                  <strong>Output differs</strong>
                  <span>Expected and actual output after trailing-whitespace normalization:</span>
                  <pre className="diff-content">{outputDiff(test.actualOutput, test.expectedOutput).map((line, lineIndex) => (
                    <span className={line.actual === line.expected ? "" : "diff-line-changed"} key={lineIndex}>
                      {line.expected !== undefined && `- ${line.expected}\n`}
                      {line.actual !== undefined && `+ ${line.actual}`}
                    </span>
                  ))}</pre>
                </div>
              )}
            </article>
          );
        })}
        {!testCases.length && <div className="empty-state">No test cases yet. Add one or load a problem from Codeforces.</div>}
      </div>
    </section>
  );
}
