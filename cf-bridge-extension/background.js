const IDE_URL = "https://code-flow-rho-lemon.vercel.app/";

function parseProblemUrl(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "codeforces.com" && parsed.hostname !== "www.codeforces.com") {
    return null;
  }

  const match = parsed.pathname.match(/^\/(contest|gym)\/(\d+)\/problem\/([A-Z]\d*)\/?$/)
    || parsed.pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Z]\d*)\/?$/);
  if (!match) return null;

  if (match.length === 4) {
    return { contestType: match[1], contestId: match[2], problemIndex: match[3] };
  }
  return { contestType: "contest", contestId: match[1], problemIndex: match[2] };
}

function scrapeProblem(problem) {
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
    console.warn("Open a Codeforces contest, gym, or problemset problem page first.");
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

    const key = `${payload.contestId}_${payload.problemIndex}`;
    await chrome.storage.local.set({ [`cf_prob_${key}`]: payload });
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CF_SUBMIT_CODE") return false;

  (async () => {
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
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [{ problemIndex, language, programTypeId, sourceCode }],
        func: ({ problemIndex, language, programTypeId, sourceCode }) => {
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
          if (editorToggle && !editorToggle.checked) {
            editorToggle.click();
          }
          const textarea = document.querySelector("#sourceCodeTextarea");
          const submit = document.querySelector("#singlePageSubmitButton");
          if (!textarea || !submit) throw new Error("Codeforces submission form was not found.");

          const commentPrefix = language === "python" ? "# " : "// ";
          textarea.value = `${sourceCode}\n${commentPrefix}Submitted via CodeFlow at ${new Date().toISOString()}`;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          submit.click();
          return { submitted: true };
        }
      });
      if (!result?.result?.submitted) throw new Error("Codeforces did not accept the submission form.");
      sendResponse({ ok: true, message: "Submission form submitted." });
      setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 3000);
    } catch (error) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      throw error;
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Submission failed." });
  });

  return true;
});
