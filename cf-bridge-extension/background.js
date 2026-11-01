const IDE_URL = "https://code-flow-rho-lemon.vercel.app/";

function parseProblemUrl(url) {
  const parsed = new URL(url);
  if (["codeforces.com", "www.codeforces.com"].includes(parsed.hostname)) {
    const match = parsed.pathname.match(/^\/(contest|gym)\/(\d+)\/problem\/([A-Z]\d*)\/?$/)
      || parsed.pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Z]\d*)\/?$/);
    if (!match) return null;

    if (match.length === 4) {
      return { platform: "codeforces", contestType: match[1], contestId: match[2], problemIndex: match[3] };
    }
    return { platform: "codeforces", contestType: "contest", contestId: match[1], problemIndex: match[2] };
  }

  if (["atcoder.jp", "www.atcoder.jp"].includes(parsed.hostname)) {
    const match = parsed.pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/);
    if (!match) return null;
    return {
      platform: "atcoder",
      contestId: match[1],
      problemId: match[2],
      problemIndex: match[2].startsWith(`${match[1]}_`) ? match[2].slice(match[1].length + 1) : match[2]
    };
  }

  if (["cses.fi", "www.cses.fi"].includes(parsed.hostname)) {
    const match = parsed.pathname.match(/^\/problemset\/task\/(\d+)\/?$/);
    if (!match) return null;
    return { platform: "cses", contestId: "problemset", problemId: match[1], problemIndex: match[1] };
  }

  return null;
}

function scrapeProblem(problem) {
  if (problem.platform === "atcoder") {
    const readPre = (element) => {
      if (!element) return "";
      const clone = element.cloneNode(true);
      clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      return (clone.textContent || "").replace(/^\n+|\n+$/g, "");
    };
    const samples = new Map();
    const sections = Array.from(document.querySelectorAll("#task-statement section, .lang-en section"));
    sections.forEach((section) => {
      const heading = section.querySelector("h3, h4")?.innerText?.trim() || "";
      const match = heading.match(/^Sample (Input|Output) (\d+)$/i);
      const pre = section.querySelector("pre");
      if (!match || !pre) return;
      const [, kind, index] = match;
      const sample = samples.get(index) || { id: `sample-${index}`, input: "", expectedOutput: "" };
      sample[kind.toLowerCase() === "input" ? "input" : "expectedOutput"] = readPre(pre);
      samples.set(index, sample);
    });
    const statementText = document.querySelector("#task-statement .lang-en")?.innerText || "";
    const timeMatch = statementText.match(/Time Limit\s*:\s*(\d+(?:\.\d+)?)\s*sec/i);
    const memoryMatch = statementText.match(/Memory Limit\s*:\s*(\d+)\s*(?:MiB|MB)/i);
    return {
      ...problem,
      title: document.querySelector("#task-statement h2, .lang-en h2, .h2")?.innerText?.trim() || "AtCoder problem",
      timeLimitMs: timeMatch ? Math.round(Number(timeMatch[1]) * 1000) : 2000,
      memoryLimitMb: memoryMatch ? Number(memoryMatch[1]) : 1024,
      testCases: Array.from(samples.values())
    };
  }

  if (problem.platform === "cses") {
    const readPre = (element) => {
      if (!element) return "";
      const clone = element.cloneNode(true);
      clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      return (clone.textContent || "").replace(/^\n+|\n+$/g, "");
    };
    const content = document.querySelector(".content") || document;
    const headings = Array.from(content.querySelectorAll("h3, h4"));
    const examples = [];
    headings.forEach((heading, headingIndex) => {
      if (!/^Example(?:\s+\d+)?$/i.test(heading.innerText.trim())) return;
      const readFollowingPres = (start) => {
        const pres = [];
        let sibling = start.nextElementSibling;
        while (sibling && !/^H[1-4]$/.test(sibling.tagName)) {
          if (sibling.matches("pre")) pres.push(sibling);
          pres.push(...sibling.querySelectorAll("pre"));
          sibling = sibling.nextElementSibling;
        }
        return pres;
      };
      const outputHeading = headings.slice(headingIndex + 1).find((candidate) =>
        /^Output(?:\s+\d+)?$/i.test(candidate.innerText.trim())
      );
      const inputPres = readFollowingPres(heading);
      const outputPres = outputHeading ? readFollowingPres(outputHeading) : [];
      if (inputPres[0] && outputPres[0]) {
        examples.push({
          id: `sample-${examples.length + 1}`,
          input: readPre(inputPres[0]),
          expectedOutput: readPre(outputPres[0])
        });
      } else {
        for (let index = 0; index + 1 < inputPres.length; index += 2) {
          examples.push({
            id: `sample-${examples.length + 1}`,
            input: readPre(inputPres[index]),
            expectedOutput: readPre(inputPres[index + 1])
          });
        }
      }
    });
    return {
      ...problem,
      title: content.querySelector("h2")?.innerText?.trim() || "CSES problem",
      timeLimitMs: 2000,
      memoryLimitMb: 512,
      testCases: examples
    };
  }

  const textFromPre = (pre) => {
    const lines = pre.querySelectorAll(".test-example-line");
    if (lines.length) return Array.from(lines, (line) => line.innerText).join("\n");

    const clone = pre.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    return clone.textContent || "";
  };
  const parseLimit = (selector, multiplier) => {
    const value = document.querySelector(selector)?.innerText || "";
    const match = value.match(/(\d+(?:[.,]\d+)?)/);
    return match ? Math.round(Number(match[1].replace(",", ".")) * multiplier) : null;
  };

  const inputElements = Array.from(document.querySelectorAll(".sample-test .input pre"));
  const outputElements = Array.from(document.querySelectorAll(".sample-test .output pre"));
  const profileLink = Array.from(document.querySelectorAll("#header a[href]")).find((anchor) =>
    /^\/profile\/[^/]+\/?$/.test(new URL(anchor.href).pathname)
  );
  const cfHandle = profileLink
    ? decodeURIComponent(new URL(profileLink.href).pathname.split("/")[2])
    : "";
  const testCases = inputElements.map((input, index) => ({
    id: `sample-${index + 1}`,
    input: textFromPre(input),
    expectedOutput: outputElements[index] ? textFromPre(outputElements[index]) : ""
  }));

  return {
    ...problem,
    title: document.querySelector(".problem-statement .header .title")?.innerText?.trim() || "Codeforces problem",
    timeLimitMs: parseLimit(".time-limit", 1000) || 2000,
    memoryLimitMb: parseLimit(".memory-limit", 1) || 256,
    cfHandle,
    testCases
  };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  const problem = parseProblemUrl(tab.url);
  if (!problem) {
    console.warn("Open a Codeforces, AtCoder, or CSES problem page first.");
    return;
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeProblem,
      args: [problem]
    });
    const payload = result?.result;
    if (!payload) throw new Error("Could not read the problem page.");

    const key = payload.platform === "codeforces"
      ? `${payload.contestId}_${payload.problemIndex}`
      : `${payload.platform}_${payload.contestId}_${payload.problemId}`;
    const storageKey = payload.platform === "codeforces" ? `cf_prob_${key}` : `problem_${key}`;
    await chrome.storage.local.set({ [storageKey]: payload });
    await chrome.tabs.create({ url: `${IDE_URL}?problem=${encodeURIComponent(key)}` });
  } catch (error) {
    console.error("Unable to load the Codeforces problem:", error);
  }
});

function waitForTab(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Timed out waiting for Codeforces submit page."));
    }, timeoutMs);
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }).catch((error) => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(error);
    });
  });
}

function waitForTabNavigation(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let sawLoading = false;
    const finish = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "loading") sawLoading = true;
      if (sawLoading && changeInfo.status === "complete") finish();
    };
    const onRemoved = (removedTabId) => {
      if (removedTabId === tabId) finish();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function submitToOtherPlatform({ platform, contestId, problemId, language = "cpp", sourceCode }) {
  if (!["atcoder", "cses"].includes(platform) || typeof sourceCode !== "string") {
    throw new Error("Invalid submission details.");
  }
  if (!(["cpp", "python", "java"].includes(language))) {
    throw new Error("Unsupported submission language.");
  }

  const submitUrl = platform === "atcoder"
    ? `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submit`
    : `https://cses.fi/problemset/submit/${encodeURIComponent(problemId)}`;
  const tab = await chrome.tabs.create({ url: submitUrl, active: false });
  await waitForTab(tab.id);
  const navigation = waitForTabNavigation(tab.id);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    args: [{ platform, problemId, language, sourceCode }],
    func: async ({ platform, problemId, language, sourceCode }) => {
      const languagePatterns = {
        cpp: /C\+\+|GNU C\+\+/i,
        python: /Python\s*3/i,
        java: /\bJava(?:\s+\d|$|\s*\()/i
      };
      const selectors = platform === "atcoder"
        ? { problem: "select[name='data.TaskScreenName']", language: "select[name='data.LanguageId']", source: "textarea[name='sourceCode'], textarea#sourceCode" }
        : { problem: null, language: "select[name='lang'], select[name='language'], select", source: "textarea[name='source'], textarea#source, textarea[name='sourceCode']" };
      const form = Array.from(document.forms).find((candidate) => candidate.querySelector(selectors.source));
      const source = form?.querySelector(selectors.source);
      const languageSelect = form?.querySelector(selectors.language);
      if (!form || !source || !languageSelect) {
        throw new Error(`${platform === "atcoder" ? "AtCoder" : "CSES"} submission form was not found. Sign in and reload the problem.`);
      }

      if (selectors.problem) {
        const problemSelect = form.querySelector(selectors.problem);
        if (!problemSelect || !Array.from(problemSelect.options).some((option) => option.value === problemId)) {
          throw new Error("AtCoder did not offer the current problem in its submission form.");
        }
        problemSelect.value = problemId;
        problemSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const matchingLanguage = Array.from(languageSelect.options).find((option) =>
        languagePatterns[language].test(option.text)
      );
      if (!matchingLanguage) {
        throw new Error(`${platform === "atcoder" ? "AtCoder" : "CSES"} does not offer a matching ${language} language.`);
      }
      languageSelect.value = matchingLanguage.value;
      languageSelect.dispatchEvent(new Event("change", { bubbles: true }));

      const codeMirror = source.CodeMirror;
      if (codeMirror) {
        codeMirror.setValue(sourceCode);
        codeMirror.save();
      } else {
        source.value = sourceCode;
      }
      const editorElement = form.querySelector(".ace_editor");
      if (editorElement && window.ace) window.ace.edit(editorElement).setValue(sourceCode);
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.dispatchEvent(new Event("change", { bubbles: true }));

      const submit = form.querySelector("button[type='submit'], input[type='submit'], button:not([type])");
      if (!submit) throw new Error("The platform submission button was not found.");
      if (submit.disabled) throw new Error("The platform kept its Submit button disabled.");
      submit.click();
      return { submitted: true };
    }
  });
  if (!result?.result?.submitted) throw new Error("The platform did not accept the submission form.");
  await navigation;
  return { ok: true, message: "Submission sent. Check the platform tab for its verdict." };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CF_SUBMIT_CODE") return false;

  (async () => {
    if (message.platform === "atcoder" || message.platform === "cses") {
      sendResponse(await submitToOtherPlatform(message));
      return;
    }
    const { contestId, contestType = "contest", problemIndex, language = "cpp", programTypeId, sourceCode } = message;
    if (!/^\d+$/.test(String(contestId)) || !/^[A-Z]\d*$/.test(String(problemIndex)) || typeof sourceCode !== "string") {
      throw new Error("Invalid submission details.");
    }
    if (!["cpp", "python", "java"].includes(language)) {
      throw new Error("Unsupported submission language.");
    }

    const contestPath = contestType === "gym" ? "gym" : "contest";
    const tab = await chrome.tabs.create({
      url: `https://codeforces.com/${contestPath}/${contestId}/submit`,
      active: false
    });
    try {
      await waitForTab(tab.id);
      const navigation = waitForTabNavigation(tab.id);
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        args: [{ problemIndex, language, programTypeId, sourceCode }],
        func: async ({ problemIndex, language, programTypeId, sourceCode }) => {
          const setSelect = (selector, value) => {
            const select = document.querySelector(selector);
            if (!select) throw new Error(`Missing form field: ${selector}`);
            if (!Array.from(select.options).some((option) => option.value === value)) {
              throw new Error(`Codeforces form does not offer value ${value} for ${selector}.`);
            }
            select.value = value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          };

          setSelect("select[name='submittedProblemIndex']", problemIndex);
          const programSelect = document.querySelector("select[name='programTypeId']");
          if (!programSelect) throw new Error("Missing Codeforces language selector.");
          const languagePatterns = {
            cpp: /\bGNU\s+G\+\+|\bGNU\s+C\+\+|\bC\+\+/i,
            python: /Python 3/i,
            java: /Java 17|Java 21/i
          };
          const options = Array.from(programSelect.options);
          const matchingOption = options.find((option) =>
            languagePatterns[language].test(option.text)
          );
          const selectedProgramTypeId = programTypeId || matchingOption?.value;
          if (!selectedProgramTypeId) throw new Error(`Codeforces does not offer a matching ${language} language.`);
          setSelect("select[name='programTypeId']", String(selectedProgramTypeId));
          const editorToggle = document.querySelector("#toggleEditorCheckbox");
          if (editorToggle?.checked) {
            editorToggle.click();
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          const textarea = document.querySelector("#sourceCodeTextarea");
          const submit = document.querySelector("#singlePageSubmitButton");
          if (!textarea || !submit) throw new Error("Codeforces submission form was not found.");

          const editor = textarea.CodeMirror;
          if (editor) {
            editor.setValue(sourceCode);
            editor.save();
          } else {
            textarea.value = sourceCode;
          }
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.dispatchEvent(new Event("change", { bubbles: true }));
          if ((editor?.getValue() ?? textarea.value) !== sourceCode || textarea.value !== sourceCode) {
            throw new Error("Could not sync the source code with the Codeforces editor.");
          }
          const enableDeadline = Date.now() + 3000;
          while (submit.disabled && Date.now() < enableDeadline) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (submit.disabled) throw new Error("Codeforces kept the Submit button disabled after the source was filled.");
          submit.click();
          return { submitted: true };
        }
      });
      if (!result?.result?.submitted) throw new Error("Codeforces did not accept the submission form.");
      await navigation;
      sendResponse({ ok: true, message: "Submission form submitted." });
    } catch (error) {
      throw error;
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Submission failed." });
  });

  return true;
});
