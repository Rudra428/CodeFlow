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
    let replaced = false;
    normalized = normalized.replace(/\b[A-Za-z_]\w*\b/g, (name) => {
      if (!aliases.has(name) || name === "const" || name === "volatile") return name;
      replaced = true;
      return `(${aliases.get(name)})`;
    });
    normalized = normalized.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
    if (!replaced) break;
  }
  return normalized.replace(/^std::/, "");
}

function splitTopLevel(source, delimiter) {
  const parts = [];
  let start = 0;
  let angleDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "<") angleDepth += 1;
    else if (character === ">" && angleDepth) angleDepth -= 1;
    else if (character === "(") parenDepth += 1;
    else if (character === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (character === delimiter && angleDepth === 0 && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function parseDeclarator(declarator, aliases, inheritedType = "") {
  const variable = declarator.match(/(?:^|[\s>*&])([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)?(?:=\s*([\s\S]*))?$/);
  if (!variable) return null;
  const name = variable[1];
  const typeEnd = variable.index + variable[0].indexOf(name);
  const type = inheritedType || declarator.slice(0, typeEnd).trim();
  const normalizedType = type
    .replace(/^(?:(?:const|volatile|typename|class|struct|static|register|extern)\s+)+/, "")
    .replace(/\s*[*&]+\s*$/, "")
    .trim();
  if (!normalizedType || !TYPE_ALIAS_PATTERN.test(normalizedType)) return null;
  return {
    name,
    type: parseType(type, aliases),
    initializer: variable[2]?.trim() || ""
  };
}

function addDeclaration(target, declaration, aliases, inheritedType = "") {
  const declarators = splitTopLevel(declaration, ",");
  let sharedType = inheritedType;
  for (const declarator of declarators) {
    const parsed = parseDeclarator(declarator, aliases, sharedType);
    if (!parsed) continue;
    if (!sharedType) sharedType = parsed.type;
    target.set(parsed.name, { type: parsed.type, initializer: parsed.initializer });
  }
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
      const methodNameIndex = method[0].lastIndexOf(method[1]);
      const returnType = method[0].slice(0, methodNameIndex).replace(/^[;{}\s]+/, "").trim();
      members.push({ label: method[1], kind: "method", type: parseType(returnType, aliases) });
    }
    for (const statement of body.split(";")) {
      const declaration = statement.trim();
      if (!declaration || /[{}]/.test(declaration)) continue;
      const method = declaration.match(/(?:^|\s)(~?[A-Za-z_]\w*)\s*\([^()]*\)\s*(?:const\b)?\s*$/);
      if (method) {
        if (!members.some((entry) => entry.label === method[1])) {
          const returnType = declaration.slice(0, method.index).replace(/\b(?:static|virtual|inline|constexpr|explicit)\b/g, "").trim();
          members.push({ label: method[1], kind: "method", type: parseType(returnType, aliases) });
        }
        continue;
      }
      const fields = new Map();
      addDeclaration(fields, declaration, aliases);
      for (const [label, field] of fields) {
        members.push({ label, kind: "property", type: field.type });
      }
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
    addDeclaration(variables, statement, aliases);
  }
  const functionPattern = /\b[A-Za-z_]\w*\s*\(([^(){};]*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?=\{|;|->)/g;
  for (const match of source.matchAll(functionPattern)) {
    for (const parameter of splitTopLevel(match[1], ",")) {
      addDeclaration(variables, parameter, aliases);
    }
  }
  return variables;
}

function elementType(type, aliases) {
  const normalizedType = parseType(type, aliases);
  const name = normalizedType.replace(/<.*$/, "").trim();
  const argumentsList = splitTemplateArguments(normalizedType);
  if (["map", "multimap", "unordered_map", "unordered_multimap"].includes(name)) return argumentsList[1] || "";
  if (["vector", "deque", "list", "forward_list", "array", "set", "multiset", "unordered_set", "unordered_multiset", "priority_queue", "stack", "queue"].includes(name)) return argumentsList[0] || "";
  if (name === "string") return "char";
  return "";
}

function containerMethodType(type, method, aliases) {
  const normalizedType = parseType(type, aliases);
  const name = normalizedType.replace(/<.*$/, "").trim();
  const argumentsList = splitTemplateArguments(normalizedType);
  if (["map", "multimap", "unordered_map", "unordered_multimap"].includes(name) && method === "at") {
    return argumentsList[1] || "";
  }
  if (["vector", "deque", "list", "forward_list", "array", "basic_string"].includes(name)
    && ["at", "front", "back"].includes(method)) {
    return argumentsList[0] || "";
  }
  if (["stack", "priority_queue"].includes(name) && method === "top") return argumentsList[0] || "";
  if (name === "queue" && ["front", "back"].includes(method)) return argumentsList[0] || "";
  if (name === "pair" && ["first", "second"].includes(method)) {
    return argumentsList[method === "first" ? 0 : 1] || "";
  }
  if (name === "string" && method === "substr") return "string";
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
      type = elementType(type, aliases);
      cursor += closing + 1;
      continue;
    }
    const member = remainder.match(/^(?:->|\.)\s*([A-Za-z_]\w*)/);
    if (!member) break;
    const structName = parseType(type, aliases).replace(/<.*$/, "").trim();
    const structMember = structs.get(structName)?.find((entry) => entry.label === member[1]);
    const afterMember = remainder.slice(member[0].length);
    const callArguments = afterMember.match(/^\s*\(/);
    if (callArguments) {
      const opening = afterMember.indexOf("(");
      const closing = matchingDelimiter(afterMember, opening, "(", ")");
      if (closing < 0) return "";
      type = structMember?.type || containerMethodType(type, member[1], aliases);
      cursor += member[0].length + closing + 1;
    } else {
      type = structMember?.kind === "property" ? structMember.type : "";
      cursor += member[0].length;
    }
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