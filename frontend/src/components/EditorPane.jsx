import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";

export const DEFAULT_CODE = `#include <bits/stdc++.h>
using namespace std;

void solve() {
    // Write your solution here
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int tests = 1;
    // cin >> tests;
    while (tests--) solve();
    return 0;
}
`;

export const LANGUAGE_TEMPLATES = {
  cpp: DEFAULT_CODE,
  python: `import sys

def solve():
    # Write your solution here
    pass

def main():
    data = sys.stdin.read().strip().split()
    solve()

if __name__ == "__main__":
    main()
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        FastScanner fs = new FastScanner(System.in);
        StringBuilder out = new StringBuilder();

        // Write your solution here

        System.out.print(out);
    }

    static class FastScanner {
        private final InputStream in;
        private final byte[] buffer = new byte[1 << 16];
        private int ptr = 0, len = 0;

        FastScanner(InputStream in) { this.in = in; }
        private int read() throws IOException {
            if (ptr >= len) { len = in.read(buffer); ptr = 0; }
            return len < 0 ? -1 : buffer[ptr++];
        }
        String next() throws IOException {
            StringBuilder s = new StringBuilder();
            int c;
            while ((c = read()) <= 32 && c != -1) {}
            while (c > 32 && c != -1) { s.append((char)c); c = read(); }
            return s.toString();
        }
        int nextInt() throws IOException { return Integer.parseInt(next()); }
        long nextLong() throws IOException { return Long.parseLong(next()); }
    }
}
`
};

const SNIPPETS = {
  fori: "for (int i = 0; i < n; ++i) {\n    $0\n}",
  fore: "for (const auto& $1 : $2) {\n    $0\n}",
  rep: "for (int $1 = 0; $1 < $2; ++$1) {\n    $0\n}",
  ll: "long long",
  pb: "push_back",
  solve: "void solve() {\n    $0\n}",
  fastio: "ios::sync_with_stdio(false);\ncin.tie(nullptr);"
};

const GENERAL_COMPLETIONS = [
  ["bits/stdc++.h", "Header", "bits/stdc++.h"],
  ["vector", "Type", "vector<$1>"],
  ["string", "Type", "string"],
  ["stack", "Type", "stack<$1>"],
  ["queue", "Type", "queue<$1>"],
  ["deque", "Type", "deque<$1>"],
  ["set", "Type", "set<$1>"],
  ["map", "Type", "map<$1, $2>"],
  ["unordered_map", "Type", "unordered_map<$1, $2>"],
  ["priority_queue", "Type", "priority_queue<$1>"],
  ["pair", "Type", "pair<$1, $2>"],
  ["sort", "Function", "sort($1.begin(), $1.end());"],
  ["lower_bound", "Function", "lower_bound($1.begin(), $1.end(), $2)"],
  ["upper_bound", "Function", "upper_bound($1.begin(), $1.end(), $2)"],
  ["binary_search", "Function", "binary_search($1.begin(), $1.end(), $2)"],
  ["accumulate", "Function", "accumulate($1.begin(), $1.end(), $2)"],
  ["cout", "Variable", "cout << $0;"],
  ["cin", "Variable", "cin >> $0;"],
  ["long long", "Keyword", "long long"],
  ["const", "Keyword", "const"],
  ["constexpr", "Keyword", "constexpr"],
  ["auto", "Keyword", "auto"],
  ["return", "Keyword", "return"],
  ["for", "Keyword", "for ($1; $2; $3) {\n    $0\n}"],
  ["if", "Keyword", "if ($1) {\n    $0\n}"],
  ["while", "Keyword", "while ($1) {\n    $0\n}"]
];

const MEMBER_COMPLETIONS = {
  stack: ["empty", "size", "top", "push", "emplace", "pop", "swap"],
  queue: ["empty", "size", "front", "back", "push", "emplace", "pop", "swap"],
  priority_queue: ["empty", "size", "top", "push", "emplace", "pop", "swap"],
  vector: ["at", "back", "begin", "capacity", "cbegin", "cend", "clear", "crbegin", "crend", "data", "emplace", "emplace_back", "empty", "end", "front", "insert", "max_size", "pop_back", "push_back", "rbegin", "rend", "reserve", "resize", "shrink_to_fit", "size", "swap"],
  string: ["append", "at", "back", "begin", "c_str", "capacity", "cbegin", "cend", "clear", "compare", "copy", "crbegin", "crend", "data", "empty", "end", "erase", "find", "find_first_not_of", "find_first_of", "find_last_not_of", "find_last_of", "front", "insert", "length", "max_size", "pop_back", "push_back", "rbegin", "rend", "replace", "reserve", "resize", "rfind", "shrink_to_fit", "size", "substr", "swap"],
  map: ["at", "begin", "cbegin", "cend", "clear", "contains", "crbegin", "crend", "emplace", "empty", "end", "erase", "extract", "find", "insert", "insert_or_assign", "lower_bound", "max_size", "merge", "rbegin", "rend", "size", "swap", "try_emplace", "upper_bound"],
  multimap: ["begin", "cbegin", "cend", "clear", "contains", "crbegin", "crend", "emplace", "empty", "end", "equal_range", "erase", "extract", "find", "insert", "lower_bound", "max_size", "merge", "rbegin", "rend", "size", "swap", "upper_bound"],
  set: ["begin", "cbegin", "cend", "clear", "contains", "crbegin", "crend", "emplace", "empty", "end", "equal_range", "erase", "extract", "find", "insert", "lower_bound", "max_size", "merge", "rbegin", "rend", "size", "swap", "upper_bound"],
  multiset: ["begin", "cbegin", "cend", "clear", "contains", "crbegin", "crend", "emplace", "empty", "end", "equal_range", "erase", "extract", "find", "insert", "lower_bound", "max_size", "merge", "rbegin", "rend", "size", "swap", "upper_bound"],
  unordered_map: ["at", "begin", "bucket", "bucket_count", "bucket_size", "cbegin", "cend", "clear", "contains", "emplace", "empty", "end", "erase", "find", "insert", "load_factor", "max_load_factor", "max_size", "rehash", "reserve", "size", "swap", "try_emplace"],
  unordered_set: ["begin", "bucket", "bucket_count", "bucket_size", "cbegin", "cend", "clear", "contains", "emplace", "empty", "end", "erase", "find", "insert", "load_factor", "max_load_factor", "max_size", "rehash", "reserve", "size", "swap"],
  deque: ["at", "back", "begin", "cbegin", "cend", "clear", "crbegin", "crend", "emplace", "emplace_back", "emplace_front", "empty", "end", "erase", "front", "insert", "max_size", "pop_back", "pop_front", "push_back", "push_front", "rbegin", "rend", "resize", "shrink_to_fit", "size", "swap"],
  list: ["back", "begin", "cbegin", "cend", "clear", "crbegin", "crend", "emplace", "emplace_back", "emplace_front", "empty", "end", "erase", "front", "insert", "max_size", "merge", "pop_back", "pop_front", "push_back", "push_front", "rbegin", "remove", "remove_if", "rend", "reverse", "size", "sort", "splice", "swap", "unique"],
  forward_list: ["before_begin", "cbefore_begin", "cbegin", "cend", "clear", "emplace_after", "empty", "end", "erase_after", "front", "insert_after", "merge", "pop_front", "push_front", "remove", "remove_if", "reverse", "sort", "splice_after", "unique"],
  array: ["at", "back", "begin", "cbegin", "cend", "data", "empty", "end", "fill", "front", "max_size", "rbegin", "rend", "size", "swap"],
  bitset: ["all", "any", "count", "flip", "none", "reset", "set", "size", "test", "to_ullong", "to_ulong"],
  pair: ["first", "second"]
};

let completionProvider;

function inferContainerType(source, variable) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const containerNames = Object.keys(MEMBER_COMPLETIONS)
    .filter((name) => name !== "pair")
    .sort((left, right) => right.length - left.length)
    .join("|");
  const declaration = new RegExp(`(?:std::)?(${containerNames})\\s*<(?:[^<>]|<[^<>]*>)*>\\s*${escaped}\\b|(?:std::)?(string)\\s+${escaped}\\b`);
  const match = source.match(declaration);
  if (match?.[1] || match?.[2]) return match[1] || match[2];

  const aliases = new Map();
  const definePattern = new RegExp(`^\\s*#\\s*define\\s+([A-Za-z_]\\w*)\\s+(?:std::)?(${containerNames})\\s*<`, "gm");
  const usingPattern = new RegExp(`\\busing\\s+([A-Za-z_]\\w*)\\s*=\\s*(?:std::)?(${containerNames})\\s*<`, "g");
  for (const alias of source.matchAll(definePattern)) aliases.set(alias[1], alias[2]);
  for (const alias of source.matchAll(usingPattern)) aliases.set(alias[1], alias[2]);
  for (const [alias, container] of aliases) {
    const aliasDeclaration = new RegExp(`(?:^|[;{}(),\\n])\\s*${alias}\\s*(?:[&*]\\s*)*${escaped}\\b`);
    if (aliasDeclaration.test(source)) return container;
  }
  return null;
}

export default function EditorPane({ value, onChange, compilerStandard, diagnostics, diagnosticsStatus, language }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    monacoRef.current.editor.setModelMarkers(
      model,
      "cf-cloud-compiler",
      diagnostics.map((diagnostic) => ({
        startLineNumber: diagnostic.line,
        startColumn: diagnostic.column,
        endLineNumber: diagnostic.line,
        endColumn: diagnostic.endColumn || diagnostic.column + 1,
        message: diagnostic.message,
        severity: diagnostic.severity === "warning"
          ? monacoRef.current.MarkerSeverity.Warning
          : monacoRef.current.MarkerSeverity.Error,
        source: diagnostic.source || compilerStandard
      }))
    );
  }, [diagnostics, compilerStandard]);

  useEffect(() => () => {
    if (completionProvider) {
      completionProvider.dispose();
      completionProvider = null;
    }
  }, []);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    completionProvider?.dispose();
    const monacoLanguage = language === "cpp" ? "cpp" : language === "python" ? "python" : "java";
    const languageCompletions = language === "python"
      ? [
          ["print", "Function", "print($0)"], ["len", "Function", "len($0)"],
          ["range", "Function", "range($0)"], ["enumerate", "Function", "enumerate($0)"],
          ["sorted", "Function", "sorted($0)"], ["set", "Type", "set()"],
          ["dict", "Type", "dict()"], ["list", "Type", "list()"],
          ["deque", "Type", "deque()"], ["heapq", "Module", "heapq"],
          ["collections", "Module", "collections"], ["defaultdict", "Function", "defaultdict($0)"],
          ["Counter", "Type", "Counter($0)"], ["solve", "Function", "solve()"],
          ["for", "Keyword", "for $1 in $2:\n    $0"], ["if", "Keyword", "if $1:\n    $0"],
          ["while", "Keyword", "while $1:\n    $0"], ["def", "Keyword", "def $1($2):\n    $0"]
        ]
      : language === "java"
        ? [
            ["System.out.println", "Function", "System.out.println($0);"],
            ["StringBuilder", "Type", "StringBuilder"],
            ["ArrayList", "Type", "ArrayList<$1>"],
            ["HashMap", "Type", "HashMap<$1, $2>"],
            ["HashSet", "Type", "HashSet<$1>"],
            ["PriorityQueue", "Type", "PriorityQueue<$1>"],
            ["ArrayDeque", "Type", "ArrayDeque<$1>"],
            ["Arrays.sort", "Function", "Arrays.sort($1);"],
            ["Collections.sort", "Function", "Collections.sort($1);"],
            ["for", "Keyword", "for (int $1 = 0; $1 < $2; $1++) {\n    $0\n}"],
            ["if", "Keyword", "if ($1) {\n    $0\n}"],
            ["while", "Keyword", "while ($1) {\n    $0\n}"],
            ["main", "Snippet", "public static void main(String[] args) {\n    $0\n}"]
          ]
        : GENERAL_COMPLETIONS;
    completionProvider = monaco.languages.registerCompletionItemProvider(monacoLanguage, {
      triggerCharacters: [".", ":"],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };
        const memberMatch = line.match(/([A-Za-z_]\w*)\.\w*$/);
        if (language === "cpp" && memberMatch) {
          const container = inferContainerType(model.getValue(), memberMatch[1]);
          const members = MEMBER_COMPLETIONS[container] || [];
          return {
            suggestions: members.map((member) => ({
              label: member,
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: member,
              range
            }))
          };
        }

        const identifiers = new Set();
        for (const match of model.getValue().matchAll(/\b(?:auto|bool|char|double|float|int|long|short|string|size_t|[A-Z]\w*)\s+([A-Za-z_]\w*)/g)) {
          identifiers.add(match[1]);
        }
        for (const match of model.getValue().matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
          identifiers.add(match[1]);
        }
        const kinds = {
          Header: monaco.languages.CompletionItemKind.Module,
          Module: monaco.languages.CompletionItemKind.Module,
          Type: monaco.languages.CompletionItemKind.Class,
          Function: monaco.languages.CompletionItemKind.Function,
          Variable: monaco.languages.CompletionItemKind.Variable,
          Keyword: monaco.languages.CompletionItemKind.Keyword,
          Snippet: monaco.languages.CompletionItemKind.Snippet
        };
        const languageSnippets = language === "cpp"
          ? Object.entries(SNIPPETS)
          : language === "python"
            ? [
                ["fori", "for i in range(n):\n    $0"],
                ["fore", "for item in items:\n    $0"],
                ["solve", "def solve():\n    $0"],
                ["main", 'if __name__ == "__main__":\n    main()']
              ]
            : [
                ["fori", "for (int i = 0; i < n; i++) {\n    $0\n}"],
                ["fore", "for (var item : items) {\n    $0\n}"],
                ["main", "public static void main(String[] args) {\n    $0\n}"]
              ];
        return {
          suggestions: [
            ...languageCompletions.map(([label, category, insertText]) => ({
              label,
              kind: kinds[category],
              insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range
            })),
            ...languageSnippets.map(([label, insertText]) => ({
              label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range
            })),
            ...Array.from(identifiers, (label) => ({
              label,
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: label,
              range
            }))
          ]
        };
      }
    });
    editor.focus();
  };

  return (
    <div className="editor-frame">
      <div className="pane-heading">
        <span>{language === "python" ? "main.py" : language === "java" ? "Main.java" : "main.cpp"}</span>
        <span className="editor-heading-status">
          {diagnosticsStatus === "checking" && <span className="diagnostics-checking">Checking...</span>}
          {diagnosticsStatus === "error" && <span className="diagnostics-unavailable">Diagnostics unavailable</span>}
          <span>{diagnostics.length ? `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}` : "✓"} · {compilerStandard}</span>
        </span>
      </div>
      <div className="monaco-shell">
        <Editor
          key={language}
          height="100%"
          language={language}
          theme="vs-dark"
          value={value}
          onChange={(next) => onChange(next ?? "")}
          onMount={handleMount}
          options={{
            automaticLayout: true,
            fontSize: 15,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 4,
            wordWrap: "on",
            padding: { top: 14 },
            glyphMargin: true,
            folding: true,
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            matchBrackets: "always",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            wordBasedSuggestions: "currentDocument",
            parameterHints: { enabled: true },
            hover: { enabled: true, delay: 250 },
            snippetSuggestions: "top",
            tabCompletion: "on"
          }}
        />
      </div>
    </div>
  );
}
