const TYPE_ALIAS_PATTERN = /^(?:std::)?[A-Za-z_]\w*(?:::\w+)*(?:\s*<[^;=]+>)?$/;

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\r\n]*/g, " ");
}

function matchingDelimiter(source, start, opening, closing) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === opening) depth += 1;
    if (source[index] === closing && --depth === 0) return index;
  }
  return -1;
}

function splitTemplateArguments(type) {
  const start = type.indexOf("<");
  if (start < 0) return [];
  const end = matchingDelimiter(type, start, "<", ">");
  if (end < 0) return [];
  const argumentsList = [];
  let depth = 0;
  let argumentStart = start + 1;
  for (let index = argumentStart; index < end; index += 1) {
    if (type[index] === "<") depth += 1;
    if (type[index] === ">") depth -= 1;
    if (type[index] === "," && depth === 0) {
      argumentsList.push(type.slice(argumentStart, index).trim());
      argumentStart = index + 1;
    }
  }
  argumentsList.push(type.slice(argumentStart, end).trim());
  return argumentsList;
}

function parseType(type, aliases) {
  let normalized = type.trim().replace(/^(?:(?:const|volatile|typename|class|struct)\s+)+/, "");
  normalized = normalized.replace(/\s*[*&]+\s*$/, "").trim();
  for (let pass = 0; pass < aliases.size + 1; pass += 1) {
    const alias = normalized.match(/^([A-Za-z_]\w*)\b/);
    if (!alias || !aliases.has(alias[1])) break;
    normalized = `${aliases.get(alias[1])}${normalized.slice(alias[1].length)}`.trim();
  }
  return normalized.replace(/^std::/, "");
}

function collectAliases(source) {
  const aliases = new Map();
  for (const match of source.matchAll(/^\s*#\s*define\s+([A-Za-z_]\w*)\s+([^\r\n]+)/gm)) {
    const aliasType = match[2].replace(/\/\/.*$/, "").trim();
    if (TYPE_ALIAS_PATTERN.test(aliasType)) aliases.set(match[1], aliasType);
  }
  for (const match of source.matchAll(/\busing\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g)) {
    aliases.set(match[1], match[2].trim());
  }
  for (const match of source.matchAll(/\btypedef\s+(.+?)\s+([A-Za-z_]\w*)\s*;/g)) {
    aliases.set(match[2], match[1].trim());
  }
  return aliases;
}

function collectStructs(source, aliases) {
  const structs = new Map();
  const declarationPattern = /\b(?:struct|class)\s+([A-Za-z_]\w*)[^;{]*\{/g;
  for (const match of source.matchAll(declarationPattern)) {
    const opening = source.indexOf("{", match.index);
    const closing = matchingDelimiter(source, opening, "{", "}");
    if (closing < 0) continue;
    const members = [];
    const body = source.slice(opening + 1, closing).replace(/\b(?:public|private|protected)\s*:/g, "");
    const inlineMethods = /(?:^|[;{}])\s*(?:(?:static|virtual|inline|constexpr|explicit)\s+)*(?:[\w:]+(?:\s*<[^;{}]*>)?\s*[*&]*\s+)?(~?[A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?=\{|;)/g;
    for (const method of body.matchAll(inlineMethods)) {
      members.push({ label: method[1], kind: "method", type: "" });
    }
    for (const statement of body.split(";")) {
      const declaration = statement.trim();
      if (!declaration || /[{}]/.test(declaration)) continue;
      const method = declaration.match(/(?:^|\s)(~?[A-Za-z_]\w*)\s*\([^()]*\)\s*(?:const\b)?\s*$/);
      if (method) {
        if (!members.some((entry) => entry.label === method[1])) {
          members.push({ label: method[1], kind: "method", type: "" });
        }
        continue;
      }
      const field = declaration.match(/(?:^|\s)([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:=.*)?$/);
      if (!field) continue;
      const type = declaration.slice(0, field.index + field[0].length - field[1].length).trim();
      if (!type || /[=()]/.test(type)) continue;
      members.push({ label: field[1], kind: "property", type: parseType(type, aliases) });
    }
    structs.set(match[1], members);
  }
  return structs;
}

function collectVariables(source, aliases) {
  const variables = new Map();
  const statements = source.split(/[;{}\r\n]/);
  for (const rawStatement of statements) {
    const statement = rawStatement.replace(/^\s*(?:for|if|while)\s*\(/, " ").trim();
    const variable = statement.match(/(?:^|\s)([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?(?:=\s*(.*))?$/);
    if (!variable) continue;
    const name = variable[1];
    const type = statement.slice(0, variable.index + variable[0].length - name.length).trim();
    const normalizedType = type
      .replace(/^(?:(?:const|volatile|typename|class|struct)\s+)+/, "")
      .replace(/\s*[*&]+\s*$/, "")
      .trim();
    if (!normalizedType || !TYPE_ALIAS_PATTERN.test(normalizedType)) continue;
    const parsedType = parseType(type, aliases);
    if (parsedType === "auto" && variable[2]) {
      variables.set(name, { type: "auto", initializer: variable[2].trim() });
    } else {
      variables.set(name, { type: parsedType, initializer: variable[2]?.trim() || "" });
    }
  }
  return variables;
}

function elementType(type) {
  const name = type.replace(/<.*$/, "").trim();
  const argumentsList = splitTemplateArguments(type);
  if (["map", "multimap", "unordered_map", "unordered_multimap"].includes(name)) return argumentsList[1] || "";
  if (["vector", "deque", "list", "forward_list", "array", "set", "multiset", "unordered_set", "unordered_multiset", "priority_queue", "stack", "queue"].includes(name)) return argumentsList[0] || "";
  if (name === "string") return "char";
  return "";
}

function resolveExpressionType(expression, variables, structs, aliases, depth = 0) {
  if (depth > 12) return "";
  const normalized = expression.trim().replace(/^\((.*)\)$/, "$1");
  const base = normalized.match(/^([A-Za-z_]\w*)/);
  if (!base) return "";
  const variable = variables.get(base[1]);
  if (!variable) return "";
  let type = variable.type === "auto" && variable.initializer
    ? resolveExpressionType(variable.initializer, variables, structs, aliases, depth + 1)
    : parseType(variable.type, aliases);
  let cursor = base[0].length;
  while (type && cursor < normalized.length) {
    const remainder = normalized.slice(cursor).trimStart();
    cursor = normalized.length - remainder.length;
    if (remainder.startsWith("[")) {
      const closing = matchingDelimiter(remainder, 0, "[", "]");
      if (closing < 0) return "";
      type = elementType(type);
      cursor += closing + 1;
      continue;
    }
    const member = remainder.match(/^(?:->|\.)\s*([A-Za-z_]\w*)/);
    if (!member) break;
    const structName = parseType(type, aliases).replace(/<.*$/, "").trim();
    const property = structs.get(structName)?.find((entry) => entry.label === member[1] && entry.kind === "property");
    type = property?.type || "";
    cursor += member[0].length;
  }
  return parseType(type, aliases);
}

export function getCppDeclaredTypes(source) {
  const cleanSource = stripComments(source);
  const aliases = collectAliases(cleanSource);
  const structs = collectStructs(cleanSource, aliases);
  return [...new Set([...aliases.keys(), ...structs.keys()])];
}

export function getCppMemberEntries(source, expression, memberCompletions) {
  const cleanSource = stripComments(source);
  const aliases = collectAliases(cleanSource);
  const structs = collectStructs(cleanSource, aliases);
  const variables = collectVariables(cleanSource, aliases);
  const type = resolveExpressionType(expression, variables, structs, aliases);
  const typeName = type.replace(/<.*$/, "").trim();
  const customMembers = structs.get(typeName);
  if (customMembers) return customMembers;
  return (memberCompletions[typeName] || []).map((label) => ({
    label,
    kind: "method",
    type: ""
  }));
}