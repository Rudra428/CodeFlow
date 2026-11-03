# CodeFlow

CodeFlow is a coding workspace for solving programming problems. It brings problem examples into an online editor, lets you run your code, and helps submit it using your existing Codeforces, AtCoder, or CSES browser session.

Open CodeFlow: [code-flow-rho-lemon.vercel.app](https://code-flow-rho-lemon.vercel.app/)

## How it works

1. The browser extension reads a supported problem and its sample tests.
2. CodeFlow opens the problem in the editor, where you can write code and run tests.
3. Choose online judging, or optionally install the local judge to run code on your own computer.
4. Submit using your signed-in account on the problem site.

## Get started

### 1. Install the browser extension

[Download CodeFlow as a ZIP](https://github.com/Rudra428/CodeFlow/archive/refs/heads/main.zip). The ZIP contains the `cf-bridge-extension` folder. Extract the ZIP, then:

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Turn on **Developer mode** and select **Load unpacked**.
3. Choose the extracted `cf-bridge-extension` folder.
4. Sign in to Codeforces, AtCoder, or CSES, open a problem, and select the CodeFlow extension.

### 2. Use CodeFlow

Open the [CodeFlow editor](https://code-flow-rho-lemon.vercel.app/), choose a language, and run your code against the example tests. Sign in to the problem site before submitting. There is no separate CodeFlow account.

The extension supports Codeforces, AtCoder, and CSES problem pages. Online judging is ready to use without installing anything else.

## Optional: Run code on your computer

For Windows, [download the CodeFlow Local Runner installer](https://github.com/Rudra428/CodeFlow/releases/latest/download/CodeFlowLocalRunner-Setup.exe) and open it. Then start the runner and choose **Local runner (this device)** in CodeFlow. Install a compiler or runtime for each language you plan to use: `g++` for C++, Python for Python, or JDK 17+ for Java.

The installer is unsigned, so Windows may show a security warning. Only download it from the official link above.

**Important:** The local judge is not sandboxed. Code you run can access your files and network with your user permissions. Run only code you trust. Local judging is optional; online judging does not require this installer.
