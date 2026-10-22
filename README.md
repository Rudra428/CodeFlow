# CodeFlow

CodeFlow is a React/Monaco coding workspace, a Manifest V3 Chrome bridge for importing Codeforces samples and submitting through your signed-in browser session, and APIs for judging C++, Python 3, and Java 17 solutions with Judge0 CE or an opt-in runner on the user's computer.

## Requirements

- Google Chrome or Microsoft Edge
- Node.js 18 or later and npm
- Python 3.9 or later
- Internet access from the Flask backend to Judge0 CE (`https://ce.judge0.com`) when using online mode
- `g++` on the user's computer for local C++ mode
- Python 3 for local Python mode (the Flask Python interpreter is used)
- JDK 17+ on the user's computer for local Java mode

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

## Run the optional local judge

The hosted IDE can use a small runner on the user's own Windows, macOS, or Linux computer. This sends run and diagnostics requests to `127.0.0.1:4000`; it does not route local runs through Render or Judge0.

1. Install Python 3.9 or newer and the compiler(s) you want to use (`g++` for C++, Python for Python, and JDK 17+ for Java).
2. In a terminal, enter the backend folder, install the Python requirements, and start the runner:

   ```powershell
   cd backend
   py -m pip install -r requirements.txt
   py run_local.py
   ```

   On macOS or Linux, use `python3 -m pip install -r requirements.txt` and `python3 run_local.py` instead.

3. Keep the runner terminal open while using Local mode. Open CodeFlow and choose **Local runner (this device)**. The IDE checks for the runner automatically; if the browser asks for permission to access the local network, allow it for CodeFlow.

The runner binds only to `127.0.0.1`, accepts browser requests only from the configured exact CodeFlow or development origins, and is separate from the Render API. Set `FRONTEND_ORIGINS` before starting it if your production frontend uses another origin; include only trusted origins, comma-separated. Chromium-based browsers may ask to grant CodeFlow local-network access the first time it contacts the runner.

**Security:** local execution is not a sandbox. Programs run with the same permissions as the user who started the runner and may access that user's files and network. Only run source code you trust. The runner is opt-in, and the IDE displays a warning whenever Local mode is selected.

## Deploy frontend and API

Push the project to GitHub, then create two services from the same repository:

### Backend on Render

1. In Render, create a **Blueprint** using this repository and approve the `render.yaml` configuration.
2. When prompted for `FRONTEND_ORIGINS`, enter your exact Vercel production origin (currently `https://code-flow-rho-lemon.vercel.app`, with no trailing slash).
3. Keep `ENABLE_LOCAL_EXECUTION` set to `false`. The Render backend is used for Judge0 CE requests; local execution happens only through the separately started runner on the user's device.
4. Wait for the `codeflow-api` service to deploy and copy its Render URL, such as `https://codeflow-api.onrender.com`.

### Frontend on Vercel

1. Import the same GitHub repository in Vercel and set **Root Directory** to `frontend`.
2. Vercel should detect Vite. Use `npm run build` as the build command and `dist` as the output directory if it does not fill them automatically.
3. Add the environment variable `VITE_BACKEND_URL` with the Render service URL (for example, `https://codeflow-api.onrender.com`, without a trailing slash), then deploy or redeploy.
4. If your Vercel production domain changes, update Render's `FRONTEND_ORIGINS` to the new exact origin and save the change to redeploy/restart the backend.

The Codeforces browser extension opens `https://code-flow-rho-lemon.vercel.app` and allows messages only from that exact origin or `http://localhost:5173` for development. If your Vercel production domain changes, update the extension's `IDE_URL`, `IDE_ORIGINS`, and manifest host/content-script matches to the new exact origin. Avoid allowing arbitrary Vercel domains.

When a problem link opens the IDE, the IDE retries the extension handshake briefly to tolerate slow content-script startup. If it still reports that the extension did not respond, confirm the extension is enabled and has site access for the Vercel domain, reload the extension from `chrome://extensions` (or `edge://extensions`), then reopen the problem from Codeforces.

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

Set `VITE_BACKEND_URL` when building/running the frontend if the API is hosted somewhere other than `http://localhost:5000`. The Flask service allows the origin or comma-separated origins configured in `FRONTEND_ORIGINS`; by default this is `http://localhost:5173`.

Use **Judge0 CE (online)** or start the optional local runner and choose **Local runner (this device)**. C++ is the default language and execution mode. The runner probes `http://127.0.0.1:4000` and enables only locally installed runtimes. Judge0 discovers the newest available GCC C++, Python 3, and Java runtime. By default, it uses the public `https://ce.judge0.com` instance; set `JUDGE0_BASE_URL` to use another Judge0 CE instance. Set `JUDGE0_CPP_LANGUAGE_ID`, `JUDGE0_PYTHON_LANGUAGE_ID`, or `JUDGE0_JAVA_LANGUAGE_ID` to pin a runtime.

Judge0 mode sends source and test input to the configured Judge0 CE service; the public instance may apply rate limits, queue delays, or availability restrictions. The Flask API enforces request-size and test-count limits and caps concurrent requests.

Codeforces submission supports the selected language when Codeforces offers the corresponding compiler in its submission form.

## Project layout

- `cf-bridge-extension/` — Chrome Manifest V3 service worker and IDE content-script relay.
- `frontend/` — React, Vite, Tailwind CSS, and Monaco IDE.
- `backend/` — Flask API and opt-in loopback runner for Judge0 CE or local C++, Python 3, and Java execution.
