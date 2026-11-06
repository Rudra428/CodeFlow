import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { getCppDeclaredTypes, getCppMemberEntries } from "./cppCompletion.js";

export const DEFAULT_CODE = `#include <bits/stdc++.h>
using namespace std;
#define int long long
#define yes cout << "YES" << '\\n'
#define no cout << "NO" << '\\n'
#define e cout << '\\n'
#define fr(i, a, b) for (int i = (a); i < (int)(b); i++)
#define frr(i, a, b) for (int i = (a); i >= (int)(b); i--)
#define vi vector<int>
#define vvi vector<vi>
#define pi pair<int,int>
#define vpi vector<pair<int,int>>
#define all(a) a.begin(), a.end()

void ansi(int ans) { cout << ans << '\\n'; }

void read(vi &a, int n) {
    for (int i = 0; i < n; i++) {
        cin >> a[i];
    }
}
template <typename T>
void show(vector<T> &a) {
    for (auto &x : a) {
        cout << x << " ";
    }
    cout << '\\n';
}

map<int, int> frequency(vi a, int n) {
    map<int, int> freq;
    fr(i, 0, n) {
        freq[a[i]]++;
    }
    return freq;
}

int lcm(int a, int b) {
    return a * b / __gcd(a, b);
}

const int mod = 1e9 + 7;
int modexp(int a, int b) {
    int res = 1;
    a = a % mod;
    while (b > 0) {
        if (b & 1) {
            res = (1LL * res * a) % mod;
        }
        a = (1LL * a * a) % mod;
        b >>= 1;
    }
    return res;
}
void sieve(vi &prime, int n) {
    prime[0] = prime[1] = 0;
    for (int i = 2; i * i <= n; i++) {
        if (prime[i]) {
            for (int j = i * i; j <= n; j += i) {
                prime[j] = 0;
            }
        }
    }
}

void solve() {
    
}

signed main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int t = 1;
    cin >> t;
    while (t--) solve();
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

const CPP_HEADERS = ["bits/stdc++.h", "iostream", "algorithm", "numeric", "vector", "string", "queue", "stack", "map", "set", "unordered_map", "unordered_set", "deque", "array", "bitset", "cmath", "limits", "utility"];

const GENERAL_COMPLETIONS = [
  ["vector", "Type", "vector<$1>"],
  ["string", "Type", "string"],
  ["stack", "Type", "stack<$1>"],
  ["queue", "Type", "queue<$1>"],
  ["deque", "Type", "deque<$1>"],
  ["list", "Type", "list<$1>"], ["forward_list", "Type", "forward_list<$1>"],
  ["array", "Type", "array<$1, $2>"], ["bitset", "Type", "bitset<$1>"],
  ["set", "Type", "set<$1>"],
  ["multiset", "Type", "multiset<$1>"], ["multimap", "Type", "multimap<$1, $2>"],
  ["map", "Type", "map<$1, $2>"],
  ["unordered_map", "Type", "unordered_map<$1, $2>"],
  ["unordered_set", "Type", "unordered_set<$1>"],
  ["unordered_multimap", "Type", "unordered_multimap<$1, $2>"],
  ["unordered_multiset", "Type", "unordered_multiset<$1>"],
  ["ordered_set", "Type", "ordered_set<$1>"],
  ["priority_queue", "Type", "priority_queue<$1>"],
  ["pair", "Type", "pair<$1, $2>"],
  ["tuple", "Type", "tuple<$1, $2>"], ["greater", "Type", "greater<$1>"],
  ["sort", "Function", "sort($1.begin(), $1.end());"],
  ["stable_sort", "Function", "stable_sort($1.begin(), $1.end());"],
  ["reverse", "Function", "reverse($1.begin(), $1.end());"],
  ["unique", "Function", "unique($1.begin(), $1.end())"],
  ["next_permutation", "Function", "next_permutation($1.begin(), $1.end())"],
  ["min", "Function", "min($1, $2)"], ["max", "Function", "max($1, $2)"],
  ["min_element", "Function", "min_element($1.begin(), $1.end())"],
  ["max_element", "Function", "max_element($1.begin(), $1.end())"],
  ["nth_element", "Function", "nth_element($1.begin(), $1.begin() + $2, $1.end())"],
  ["lower_bound", "Function", "lower_bound($1.begin(), $1.end(), $2)"],
  ["upper_bound", "Function", "upper_bound($1.begin(), $1.end(), $2)"],
  ["binary_search", "Function", "binary_search($1.begin(), $1.end(), $2)"],
  ["find", "Function", "find($1.begin(), $1.end(), $2)"],
  ["count", "Function", "count($1.begin(), $1.end(), $2)"],
  ["accumulate", "Function", "accumulate($1.begin(), $1.end(), $2)"],
  ["iota", "Function", "iota($1.begin(), $1.end(), $2)"],
  ["gcd", "Function", "gcd($1, $2)"], ["lcm", "Function", "lcm($1, $2)"],
  ["abs", "Function", "abs($0)"], ["swap", "Function", "swap($1, $2)"],
  ["make_pair", "Function", "make_pair($1, $2)"],
  ["cout", "Variable", "cout << $0;"],
  ["cin", "Variable", "cin >> $0;"],
  ["cerr", "Variable", "cerr << $0;"],
  ["long long", "Keyword", "long long"],
  ["int", "Keyword", "int"], ["bool", "Keyword", "bool"],
  ["const", "Keyword", "const"],
  ["constexpr", "Keyword", "constexpr"],
  ["auto", "Keyword", "auto"],
  ["return", "Keyword", "return"],
  ["break", "Keyword", "break;"], ["continue", "Keyword", "continue;"],
  ["for", "Keyword", "for ($1; $2; $3) {\n    $0\n}"],
  ["if", "Keyword", "if ($1) {\n    $0\n}"],
  ["else", "Keyword", "else {\n    $0\n}"],
  ["while", "Keyword", "while ($1) {\n    $0\n}"],
  ["switch", "Keyword", "switch ($1) {\n    case $2:\n        $0\n        break;\n    default:\n        break;\n}"]
];

const MEMBER_COMPLETIONS = {
  stack: ["empty", "size", "top", "push", "emplace", "pop", "swap"],
  ordered_set: ["begin", "clear", "empty", "end", "erase", "find", "insert", "lower_bound", "order_of_key", "size", "upper_bound", "find_by_order"],
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
    monaco.editor.defineTheme("codeflow-black", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#000000"
      }
    });
    monaco.editor.setTheme("codeflow-black");
    completionProvider?.dispose();
    const monacoLanguage = language === "cpp" ? "cpp" : language === "python" ? "python" : "java";
    const languageCompletions = language === "python"
      ? [
          ["print", "Function", "print($0)"], ["input", "Function", "input()"],
          ["len", "Function", "len($0)"], ["range", "Function", "range($0)"],
          ["enumerate", "Function", "enumerate($0)"], ["zip", "Function", "zip($1, $2)"],
          ["sorted", "Function", "sorted($0)"], ["reversed", "Function", "reversed($0)"],
          ["sum", "Function", "sum($0)"], ["min", "Function", "min($0)"],
          ["max", "Function", "max($0)"], ["abs", "Function", "abs($0)"],
          ["all", "Function", "all($0)"], ["any", "Function", "any($0)"],
          ["map", "Function", "map($1, $2)"], ["filter", "Function", "filter($1, $2)"],
          ["int", "Type", "int($0)"], ["float", "Type", "float($0)"],
          ["str", "Type", "str($0)"], ["set", "Type", "set()"],
          ["dict", "Type", "dict()"], ["list", "Type", "list()"],
          ["tuple", "Type", "tuple()"], ["bytearray", "Type", "bytearray()"],
          ["sys", "Module", "sys"], ["math", "Module", "math"],
          ["heapq", "Module", "heapq"], ["bisect", "Module", "bisect"],
          ["itertools", "Module", "itertools"], ["collections", "Module", "collections"],
          ["deque", "Type", "deque()"], ["defaultdict", "Function", "defaultdict($0)"],
          ["Counter", "Type", "Counter($0)"], ["heappush", "Function", "heappush($1, $2)"],
          ["heappop", "Function", "heappop($0)"], ["bisect_left", "Function", "bisect_left($1, $2)"],
          ["bisect_right", "Function", "bisect_right($1, $2)"],
          ["gcd", "Function", "gcd($1, $2)"], ["factorial", "Function", "factorial($0)"],
          ["solve", "Function", "solve()"], ["for", "Keyword", "for $1 in $2:\n    $0"],
          ["if", "Keyword", "if $1:\n    $0"], ["elif", "Keyword", "elif $1:\n    $0"],
          ["while", "Keyword", "while $1:\n    $0"], ["def", "Keyword", "def $1($2):\n    $0"],
          ["class", "Keyword", "class $1:\n    $0"], ["try", "Keyword", "try:\n    $0\nexcept Exception as e:\n    pass"]
        ]
      : language === "java"
        ? [
            ["System.out.println", "Function", "System.out.println($0);"],
            ["System.out.print", "Function", "System.out.print($0);"],
            ["StringBuilder", "Type", "StringBuilder"],
            ["ArrayList", "Type", "ArrayList<$1>"],
            ["List", "Type", "List<$1>"], ["Map", "Type", "Map<$1, $2>"],
            ["Set", "Type", "Set<$1>"], ["Queue", "Type", "Queue<$1>"],
            ["Deque", "Type", "Deque<$1>"],
            ["HashMap", "Type", "HashMap<$1, $2>"],
            ["HashSet", "Type", "HashSet<$1>"],
            ["TreeMap", "Type", "TreeMap<$1, $2>"],
            ["TreeSet", "Type", "TreeSet<$1>"],
            ["PriorityQueue", "Type", "PriorityQueue<$1>"],
            ["ArrayDeque", "Type", "ArrayDeque<$1>"],
            ["StringTokenizer", "Type", "StringTokenizer($1)"],
            ["Arrays.binarySearch", "Function", "Arrays.binarySearch($1, $2)"],
            ["Arrays.sort", "Function", "Arrays.sort($1);"],
            ["Arrays.fill", "Function", "Arrays.fill($1, $2);"],
            ["Arrays.copyOf", "Function", "Arrays.copyOf($1, $2)"],
            ["Collections.sort", "Function", "Collections.sort($1);"],
            ["Collections.reverse", "Function", "Collections.reverse($0);"],
            ["Collections.max", "Function", "Collections.max($0)"],
            ["Collections.min", "Function", "Collections.min($0)"],
            ["Math.max", "Function", "Math.max($1, $2)"],
            ["Math.min", "Function", "Math.min($1, $2)"],
            ["Math.abs", "Function", "Math.abs($0)"],
            ["Math.sqrt", "Function", "Math.sqrt($0)"],
            ["Math.pow", "Function", "Math.pow($1, $2)"],
            ["BigInteger", "Type", "BigInteger"],
            ["for", "Keyword", "for (int $1 = 0; $1 < $2; $1++) {\n    $0\n}"],
            ["for-each", "Snippet", "for ($1 $2 : $3) {\n    $0\n}"],
            ["if", "Keyword", "if ($1) {\n    $0\n}"],
            ["else", "Keyword", "else {\n    $0\n}"],
            ["while", "Keyword", "while ($1) {\n    $0\n}"],
            ["try", "Keyword", "try {\n    $0\n} catch (Exception e) {\n    e.printStackTrace();\n}"],
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
        if (language === "cpp" && /^\s*#\s*include\s*[<"][^>"]*$/.test(line)) {
          return {
            suggestions: CPP_HEADERS.map((header) => ({
              label: header,
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: header,
              range
            }))
          };
        }
        const memberMatch = line.match(/((?:[A-Za-z_]\w*)(?:\s*(?:\[[^\]]*\]|\.\s*[A-Za-z_]\w*(?:\s*\([^()]*\))?|->\s*[A-Za-z_]\w*(?:\s*\([^()]*\))?))*)\s*(?:\.|->)\s*\w*$/);
        if (language === "cpp" && memberMatch) {
          const members = getCppMemberEntries(model.getValue(), memberMatch[1], MEMBER_COMPLETIONS);
          return {
            suggestions: members.map(({ label, kind }) => ({
              label,
              kind: kind === "property"
                ? monaco.languages.CompletionItemKind.Field
                : monaco.languages.CompletionItemKind.Method,
              insertText: label,
              range
            }))
          };
        }

        const identifiers = new Set();
        if (language === "cpp") {
          for (const typeName of getCppDeclaredTypes(model.getValue())) identifiers.add(typeName);
        }
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
          ? [
              ...Object.entries(SNIPPETS),
              ["orderedset", "#include <ext/pb_ds/assoc_container.hpp>\n#include <ext/pb_ds/tree_policy.hpp>\nusing namespace __gnu_pbds;\ntemplate <class T>\nusing ordered_set = tree<T, null_type, less<T>, rb_tree_tag, tree_order_statistics_node_update>;\n"]
            ]
          : language === "python"
            ? [
                ["fori", "for i in range(n):\n    $0"],
                ["fore", "for item in items:\n    $0"],
                ["readint", "int(sys.stdin.readline())"],
                ["readints", "list(map(int, sys.stdin.readline().split()))"],
                ["solve", "def solve():\n    $0"],
                ["testcases", "t = int(sys.stdin.readline())\nfor _ in range(t):\n    solve()"],
                ["main", 'if __name__ == "__main__":\n    main()']
              ]
            : [
                ["fori", "for (int i = 0; i < n; i++) {\n    $0\n}"],
                ["fore", "for (var item : items) {\n    $0\n}"],
                ["scanner", "Scanner $1 = new Scanner(System.in);"],
                ["stringbuilder", "StringBuilder $1 = new StringBuilder();"],
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
            wordWrap: "off",
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
