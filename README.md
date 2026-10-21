# CodeFlow

CodeFlow is a local React/Monaco coding workspace, a Manifest V3 Chrome bridge for importing Codeforces samples and submitting through your signed-in browser session, and a Flask service that runs C++, Python 3, and Java 17 solutions locally or with Judge0 CE.

## Requirements

- Google Chrome or Microsoft Edge
- Node.js 18 or later and npm
- Python 3.9 or later
- Internet access from the Flask backend to Judge0 CE (`https://ce.judge0.com`) when using online mode
- `g++` on the computer running Flask for local C++ mode
- Python 3 for local Python mode (the Flask Python interpreter is used)
- JDK 17+ on the computer running Flask for local Java mode

## Start the IDE

In one terminal:

```powershell
cd frontend
npm install
npm run dev
```

The IDE is served at `http://localhost:5173`.

In a second terminal:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

The API listens on `http://127.0.0.1:5000`. If PowerShell blocks activation, run `python -m pip install -r requirements.txt` with the environment's Python directly instead.

## Load the Chrome extension

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and enable **Developer mode**.
2. Choose **Load unpacked** and select the `cf-bridge-extension` folder.
3. Sign in to Codeforces in Chrome.
4. Open a contest, gym, or problemset problem, then click the extension icon. The IDE opens with the problem statement metadata and scraped samples.
5. Sign in to Codeforces in the browser before submitting. The IDE uses the signed-in profile from the problem page; there is no separate handle to enter.

The extension supports `/contest/{id}/problem/{index}`, `/gym/{id}/problem/{index}`, and `/problemset/problem/{id}/{index}`. Submission chooses the matching compiler from the Codeforces form for the selected language.

## Running tests and submitting

- Choose C++, Python 3, or Java 17 from the language selector. Code is auto-saved per problem and language in browser local storage.
- Compiler diagnostics use the selected language and execution mode. C++ syntax highlighting, Python and Java highlighting, bracket matching, autocomplete, and language-specific snippets are enabled.
- Add or edit test cases in the right pane; use **Run** or **Run All Tests** to execute them.
- The API submits each test case to Judge0 CE, returning standard output, standard error, and per-case status.
- **Submit to CF** opens a background Codeforces tab and fills the submission form using your current browser session. The IDE then polls the Codeforces user-status API for the verdict.

## Configuration and operational safety

Set `VITE_BACKEND_URL` when building/running the frontend if the API is hosted somewhere other than `http://localhost:5000`. The Flask service accepts CORS requests only from `http://localhost:5173`.

Use **Judge0 CE (online)** in the IDE's **Run code with** dropdown and select the language. C++ is the default language and execution mode. Local execution is temporarily disabled. To re-enable it for a trusted, private deployment, set `ENABLE_LOCAL_EXECUTION=true` on the Flask backend; local code runs with the permissions of the backend process. Judge0 discovers the newest available GCC C++, Python 3, and Java runtime. By default, it uses the public `https://ce.judge0.com` instance; set `JUDGE0_BASE_URL` to use another Judge0 CE instance. Set `JUDGE0_CPP_LANGUAGE_ID`, `JUDGE0_PYTHON_LANGUAGE_ID`, or `JUDGE0_JAVA_LANGUAGE_ID` to pin a runtime.

Judge0 mode sends source and test input to the configured Judge0 CE service; the public instance may apply rate limits, queue delays, or availability restrictions. The Flask API enforces request-size and test-count limits and caps concurrent requests.

Codeforces submission supports the selected language when Codeforces offers the corresponding compiler in its submission form.

## Project layout

- `cf-bridge-extension/` — Chrome Manifest V3 service worker and IDE content-script relay.
- `frontend/` — React, Vite, Tailwind CSS, and Monaco IDE.
- `backend/` — Flask API for local or Judge0 CE C++, Python 3, and Java execution.
