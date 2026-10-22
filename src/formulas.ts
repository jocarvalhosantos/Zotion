export type FormulaValue = string | number | boolean | null | FormulaValue[];
export type FormulaEvaluation = { value: FormulaValue } | { error: string };

type Token = { kind: "number" | "string" | "identifier" | "symbol" | "eof"; value: string };
type Expression =
  | { kind: "literal"; value: FormulaValue }
  | { kind: "array"; values: Expression[] }
  | { kind: "property"; name: string }
  | { kind: "unary"; operator: string; value: Expression }
  | { kind: "binary"; operator: string; left: Expression; right: Expression }
  | { kind: "conditional"; condition: Expression; yes: Expression; no: Expression }
  | { kind: "call"; name: string; arguments: Expression[] }
  | { kind: "method"; target: Expression; name: string; arguments: Expression[] };

const MAX_FORMULA_LENGTH = 2_000;
const MAX_TOKENS = 512;
const MAX_DEPTH = 64;

function tokenize(source: string): Token[] {
  if (source.length > MAX_FORMULA_LENGTH) throw new Error(`A fórmula ultrapassa ${MAX_FORMULA_LENGTH} caracteres.`);
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const next = source[index++];
        if (next === quote) { closed = true; break; }
        if (next === "\\") {
          const escaped = source[index++];
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += escapes[escaped] ?? escaped;
        } else value += next;
      }
      if (!closed) throw new Error("Há uma string sem aspas de fechamento.");
      tokens.push({ kind: "string", value });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const operator = ["===", "!==", ">=", "<=", "==", "!=", "&&", "||"].find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      tokens.push({ kind: "symbol", value: operator });
      index += operator.length;
      continue;
    }
    if ("+-*/%^><!?:(),[].".includes(char)) {
      tokens.push({ kind: "symbol", value: char });
      index += 1;
      continue;
    }
    throw new Error(`Caractere não suportado: ${char}`);
  }
  if (tokens.length > MAX_TOKENS) throw new Error(`A fórmula ultrapassa o limite de ${MAX_TOKENS} partes.`);
  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

class Parser {
  private index = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) { this.tokens = tokens; }

  parse(): Expression {
    const expression = this.parseConditional(0);
    if (this.peek().kind !== "eof") throw new Error(`Parte inesperada: ${this.peek().value}`);
    return expression;
  }

  private peek(): Token { return this.tokens[this.index]; }
  private take(): Token { return this.tokens[this.index++]; }
  private match(value: string): boolean {
    if (this.peek().value !== value) return false;
    this.index += 1;
    return true;
  }
  private expect(value: string): void {
    if (!this.match(value)) throw new Error(`Esperado “${value}”, recebido “${this.peek().value || "fim da fórmula"}”.`);
  }

  private parseConditional(depth: number): Expression {
    if (depth > MAX_DEPTH) throw new Error("A fórmula está aninhada profundamente demais.");
    const condition = this.parseBinary(1, depth + 1);
    if (!this.match("?")) return condition;
    const yes = this.parseConditional(depth + 1);
    this.expect(":");
    const no = this.parseConditional(depth + 1);
    return { kind: "conditional", condition, yes, no };
  }

  private parseBinary(minPrecedence: number, depth: number): Expression {
    let left = this.parseUnary(depth + 1);
    while (true) {
      const token = this.peek();
      const operator = token.kind === "identifier" ? token.value.toLocaleLowerCase("en-US") : token.value;
      const precedence = this.precedence(operator);
      if (precedence < minPrecedence) break;
      this.take();
      const right = this.parseBinary(precedence + (operator === "^" ? 0 : 1), depth + 1);
      left = { kind: "binary", operator, left, right };
    }
    return left;
  }

  private precedence(operator: string): number {
    if (operator === "or" || operator === "||") return 2;
    if (operator === "and" || operator === "&&") return 3;
    if (["==", "===", "!=", "!==", ">", ">=", "<", "<="].includes(operator)) return 4;
    if (operator === "+" || operator === "-") return 5;
    if (["*", "/", "%"].includes(operator)) return 6;
    if (operator === "^") return 7;
    return 0;
  }

  private parseUnary(depth: number): Expression {
    const token = this.peek();
    const operator = token.kind === "identifier" ? token.value.toLocaleLowerCase("en-US") : token.value;
    if (["!", "+", "-", "not"].includes(operator)) {
      this.take();
      return { kind: "unary", operator, value: this.parseUnary(depth + 1) };
    }
    return this.parsePostfix(depth + 1);
  }

  private parsePostfix(depth: number): Expression {
    let expression = this.parsePrimary(depth + 1);
    while (this.match(".")) {
      const name = this.take();
      if (name.kind !== "identifier") throw new Error("Esperado o nome de uma função após o ponto.");
      this.expect("(");
      expression = { kind: "method", target: expression, name: name.value, arguments: this.parseArguments(depth + 1) };
    }
    return expression;
  }

  private parsePrimary(depth: number): Expression {
    if (depth > MAX_DEPTH) throw new Error("A fórmula está aninhada profundamente demais.");
    const token = this.take();
    if (token.kind === "number") return { kind: "literal", value: Number(token.value) };
    if (token.kind === "string") return { kind: "literal", value: token.value };
    if (token.value === "(") {
      const expression = this.parseConditional(depth + 1);
      this.expect(")");
      return expression;
    }
    if (token.value === "[") {
      const values: Expression[] = [];
      if (!this.match("]")) {
        do { values.push(this.parseConditional(depth + 1)); } while (this.match(","));
        this.expect("]");
      }
      return { kind: "array", values };
    }
    if (token.kind === "identifier") {
      const identifier = token.value.toLocaleLowerCase("en-US");
      if (identifier === "true") return { kind: "literal", value: true };
      if (identifier === "false") return { kind: "literal", value: false };
      if (identifier === "null") return { kind: "literal", value: null };
      if (this.match("(")) return { kind: "call", name: token.value, arguments: this.parseArguments(depth + 1) };
      throw new Error(`Nome não suportado: ${token.value}`);
    }
    throw new Error(`Esperado um valor, recebido “${token.value || "fim da fórmula"}”.`);
  }

  private parseArguments(depth: number): Expression[] {
    const arguments_: Expression[] = [];
    if (!this.match(")")) {
      do { arguments_.push(this.parseConditional(depth + 1)); } while (this.match(","));
      this.expect(")");
    }
    return arguments_;
  }
}

function asNumber(value: FormulaValue, label = "valor"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} precisa ser um número.`);
  return value;
}

function asString(value: FormulaValue, label = "valor"): string {
  if (typeof value !== "string") throw new Error(`${label} precisa ser um texto.`);
  return value;
}

function asBoolean(value: FormulaValue, label = "condição"): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} precisa ser verdadeiro ou falso.`);
  return value;
}

function isEmpty(value: FormulaValue): boolean {
  return value === null || value === "" || value === 0 || (Array.isArray(value) && value.length === 0);
}

function flatten(values: FormulaValue[]): FormulaValue[] {
  return values.flatMap((value) => Array.isArray(value) ? flatten(value) : [value]);
}

function numericArguments(values: FormulaValue[]): number[] {
  return flatten(values).filter((value) => value !== null).map((value) => asNumber(value));
}

function dateBetween(first: FormulaValue, second: FormulaValue, unitValue: FormulaValue): number {
  const firstDate = new Date(asString(first, "data"));
  const secondDate = new Date(asString(second, "data"));
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(secondDate.getTime())) throw new Error("dateBetween precisa de duas datas válidas.");
  const unit = asString(unitValue, "unidade").toLocaleLowerCase("en-US");
  const milliseconds = firstDate.getTime() - secondDate.getTime();
  const days = milliseconds / 86_400_000;
  if (unit === "minutes") return Math.trunc(milliseconds / 60_000);
  if (unit === "hours") return Math.trunc(milliseconds / 3_600_000);
  if (unit === "days") return Math.trunc(days);
  if (unit === "weeks") return Math.trunc(days / 7);
  const months = (firstDate.getUTCFullYear() - secondDate.getUTCFullYear()) * 12 + firstDate.getUTCMonth() - secondDate.getUTCMonth();
  if (unit === "months") return months;
  if (unit === "quarters") return Math.trunc(months / 3);
  if (unit === "years") return Math.trunc(months / 12);
  throw new Error("Unidade de data não suportada.");
}

function evaluateCall(name: string, values: FormulaValue[]): FormulaValue {
  const key = name.toLocaleLowerCase("en-US");
  if (key === "and" || key === "or") {
    if (values.length < 2) throw new Error(`${name} precisa de pelo menos duas condições.`);
    const conditions = values.map((value) => asBoolean(value));
    return key === "and" ? conditions.every(Boolean) : conditions.some(Boolean);
  }
  if (key === "not") {
    if (values.length !== 1) throw new Error("not precisa de uma condição.");
    return !asBoolean(values[0]);
  }
  if (key === "if") {
    if (values.length !== 3) throw new Error("if precisa de três argumentos.");
    return asBoolean(values[0]) ? values[1] : values[2];
  }
  if (key === "ifs") {
    if (values.length < 3) throw new Error("ifs precisa de uma condição, um valor e um resultado padrão.");
    for (let index = 0; index + 1 < values.length - 1; index += 2) if (asBoolean(values[index])) return values[index + 1];
    return values.at(-1) ?? null;
  }
  if (key === "empty") return values.length === 1 && isEmpty(values[0]);
  if (key === "length") {
    if (values.length !== 1) throw new Error("length precisa de um argumento.");
    if (typeof values[0] === "string" || Array.isArray(values[0])) return values[0].length;
    throw new Error("length precisa de texto ou lista.");
  }
  if (key === "format") {
    if (values.length !== 1) throw new Error("format precisa de um argumento.");
    const value = values[0];
    return value === null ? "" : Array.isArray(value) ? value.map((item) => item === null ? "" : String(item)).join(", ") : String(value);
  }
  if (key === "contains" || key === "includes") {
    if (values.length !== 2) throw new Error(`${name} precisa de dois argumentos.`);
    const [source, search] = values;
    return typeof source === "string" ? source.includes(String(search ?? "")) : Array.isArray(source) ? source.some((item) => item === search) : false;
  }
  if (key === "substring") {
    if (values.length < 2 || values.length > 3) throw new Error("substring precisa de dois ou três argumentos.");
    const text = asString(values[0]);
    return text.slice(asNumber(values[1]), values[2] === undefined ? undefined : asNumber(values[2]));
  }
  if (key === "replace") {
    if (values.length !== 3) throw new Error("replace precisa de três argumentos.");
    return asString(values[0]).split(asString(values[1])).join(asString(values[2]));
  }
  if (key === "lower" || key === "lowercase") return asString(values[0] ?? null).toLocaleLowerCase("pt-BR");
  if (key === "upper" || key === "uppercase") return asString(values[0] ?? null).toLocaleUpperCase("pt-BR");
  if (key === "trim") return asString(values[0] ?? null).trim();
  if (key === "split") {
    if (values.length !== 2) throw new Error("split precisa de dois argumentos.");
    return asString(values[0]).split(asString(values[1]));
  }
  if (key === "join") {
    if (values.length < 1 || values.length > 2 || !Array.isArray(values[0])) throw new Error("join precisa de uma lista e um separador opcional.");
    return values[0].map((value) => value === null ? "" : String(value)).join(values[1] === undefined ? "," : asString(values[1]));
  }
  if (key === "first" || key === "last") {
    if (!Array.isArray(values[0])) throw new Error(`${name} precisa de uma lista.`);
    return key === "first" ? values[0][0] ?? null : values[0].at(-1) ?? null;
  }
  if (key === "at") {
    if (values.length !== 2 || !Array.isArray(values[0])) throw new Error("at precisa de uma lista e um índice.");
    return values[0][asNumber(values[1])] ?? null;
  }
  if (key === "now") {
    if (values.length !== 0) throw new Error("now não recebe argumentos.");
    return new Date().toISOString();
  }
  if (key === "dateadd" || key === "datesubtract") {
    if (values.length !== 3) throw new Error(`${name} precisa de uma data, quantidade e unidade.`);
    const date = new Date(asString(values[0], "data"));
    if (Number.isNaN(date.getTime())) throw new Error(`${name} precisa de uma data válida.`);
    const amount = asNumber(values[1]) * (key === "datesubtract" ? -1 : 1);
    const unit = asString(values[2], "unidade").toLocaleLowerCase("en-US");
    if (unit === "years") date.setUTCFullYear(date.getUTCFullYear() + amount);
    else if (unit === "quarters") date.setUTCMonth(date.getUTCMonth() + amount * 3);
    else if (unit === "months") date.setUTCMonth(date.getUTCMonth() + amount);
    else if (unit === "weeks") date.setUTCDate(date.getUTCDate() + amount * 7);
    else if (unit === "days") date.setUTCDate(date.getUTCDate() + amount);
    else if (unit === "hours") date.setUTCHours(date.getUTCHours() + amount);
    else if (unit === "minutes") date.setUTCMinutes(date.getUTCMinutes() + amount);
    else throw new Error("Unidade de data não suportada.");
    return date.toISOString();
  }
  if (key === "parseDate") {
    const date = new Date(asString(values[0] ?? null));
    if (Number.isNaN(date.getTime())) throw new Error("A data não está no formato esperado.");
    return date.toISOString();
  }
  if (key === "dateBetween") {
    if (values.length !== 3) throw new Error("dateBetween precisa de duas datas e uma unidade.");
    return dateBetween(values[0], values[1], values[2]);
  }
  if (key === "timestamp") {
    const date = new Date(asString(values[0] ?? null));
    if (Number.isNaN(date.getTime())) throw new Error("timestamp precisa de uma data válida.");
    return date.getTime();
  }
  if (key === "fromTimestamp") {
    const date = new Date(asNumber(values[0] ?? null));
    if (Number.isNaN(date.getTime())) throw new Error("fromTimestamp precisa de um timestamp válido.");
    return date.toISOString();
  }
  if (key === "formatDate") {
    if (values.length !== 2) throw new Error("formatDate precisa de uma data e um formato.");
    const date = new Date(asString(values[0], "data"));
    if (Number.isNaN(date.getTime())) throw new Error("formatDate precisa de uma data válida.");
    const parts: Record<string, string> = {
      YYYY: `${date.getUTCFullYear()}`,
      MM: `${date.getUTCMonth() + 1}`.padStart(2, "0"),
      DD: `${date.getUTCDate()}`.padStart(2, "0"),
      M: `${date.getUTCMonth() + 1}`,
      D: `${date.getUTCDate()}`,
      Y: `${date.getUTCFullYear()}`,
    };
    return asString(values[1], "formato").replace(/YYYY|MM|DD|M|D|Y/g, (token) => parts[token]);
  }

  if (["add", "subtract", "minus", "multiply", "divide", "mod", "pow", "abs", "round", "ceil", "floor", "sqrt", "cbrt", "exp", "ln", "log10", "log2", "min", "max", "sum", "mean", "median", "pi", "e"].includes(key)) {
    const numbers = numericArguments(values);
    let result: number;
    if (key === "pi") result = Math.PI;
    else if (key === "e") result = Math.E;
    else if (key === "add" || key === "sum") result = numbers.reduce((sum, value) => sum + value, 0);
    else if (key === "subtract" || key === "minus") { if (numbers.length !== 2) throw new Error(`${name} precisa de dois números.`); result = numbers[0] - numbers[1]; }
    else if (key === "multiply") { if (numbers.length !== 2) throw new Error("multiply precisa de dois números."); result = numbers[0] * numbers[1]; }
    else if (key === "divide") { if (numbers.length !== 2 || numbers[1] === 0) throw new Error("divide precisa de dois números e um divisor diferente de zero."); result = numbers[0] / numbers[1]; }
    else if (key === "mod") { if (numbers.length !== 2) throw new Error("mod precisa de dois números."); result = numbers[0] % numbers[1]; }
    else if (key === "pow") { if (numbers.length !== 2) throw new Error("pow precisa de dois números."); result = numbers[0] ** numbers[1]; }
    else if (key === "abs") result = Math.abs(asNumber(values[0] ?? null));
    else if (key === "round") {
      const value = asNumber(values[0] ?? null);
      const precision = values[1] === undefined ? 0 : asNumber(values[1]);
      const factor = 10 ** precision;
      result = Math.round(value * factor) / factor;
    } else if (key === "ceil") result = Math.ceil(asNumber(values[0] ?? null));
    else if (key === "floor") result = Math.floor(asNumber(values[0] ?? null));
    else if (key === "sqrt") result = Math.sqrt(asNumber(values[0] ?? null));
    else if (key === "cbrt") result = Math.cbrt(asNumber(values[0] ?? null));
    else if (key === "exp") result = Math.exp(asNumber(values[0] ?? null));
    else if (key === "ln") result = Math.log(asNumber(values[0] ?? null));
    else if (key === "log10") result = Math.log10(asNumber(values[0] ?? null));
    else if (key === "log2") result = Math.log2(asNumber(values[0] ?? null));
    else if (key === "min") result = numbers.length ? Math.min(...numbers) : 0;
    else if (key === "max") result = numbers.length ? Math.max(...numbers) : 0;
    else if (key === "mean") result = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
    else if (key === "median") {
      const sorted = [...numbers].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      result = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    } else throw new Error(`Função numérica não suportada: ${name}`);
    if (!Number.isFinite(result)) throw new Error("O cálculo não produziu um número finito.");
    return result;
  }
  throw new Error(`Função não suportada: ${name}`);
}

function evaluateExpression(expression: Expression, resolveProperty: (name: string) => FormulaValue, depth = 0): FormulaValue {
  if (depth > MAX_DEPTH) throw new Error("O cálculo excedeu o limite de profundidade.");
  if (expression.kind === "literal") return expression.value;
  if (expression.kind === "array") return expression.values.map((item) => evaluateExpression(item, resolveProperty, depth + 1));
  if (expression.kind === "property") return resolveProperty(expression.name);
  if (expression.kind === "unary") {
    const value = evaluateExpression(expression.value, resolveProperty, depth + 1);
    if (expression.operator === "!" || expression.operator === "not") return !asBoolean(value);
    if (expression.operator === "+") return asNumber(value);
    return -asNumber(value);
  }
  if (expression.kind === "conditional") return asBoolean(evaluateExpression(expression.condition, resolveProperty, depth + 1))
    ? evaluateExpression(expression.yes, resolveProperty, depth + 1)
    : evaluateExpression(expression.no, resolveProperty, depth + 1);
  if (expression.kind === "binary") {
    const left = evaluateExpression(expression.left, resolveProperty, depth + 1);
    if (expression.operator === "and" || expression.operator === "&&") return asBoolean(left) && asBoolean(evaluateExpression(expression.right, resolveProperty, depth + 1));
    if (expression.operator === "or" || expression.operator === "||") return asBoolean(left) || asBoolean(evaluateExpression(expression.right, resolveProperty, depth + 1));
    const right = evaluateExpression(expression.right, resolveProperty, depth + 1);
    if (expression.operator === "+") return typeof left === "string" || typeof right === "string" ? `${left ?? ""}${right ?? ""}` : asNumber(left) + asNumber(right);
    if (expression.operator === "-") return asNumber(left) - asNumber(right);
    if (expression.operator === "*") return asNumber(left) * asNumber(right);
    if (expression.operator === "/") { if (asNumber(right) === 0) throw new Error("Não é possível dividir por zero."); return asNumber(left) / asNumber(right); }
    if (expression.operator === "%") return asNumber(left) % asNumber(right);
    if (expression.operator === "^") return asNumber(left) ** asNumber(right);
    if (["==", "===", "!=", "!=="].includes(expression.operator)) {
      const equal = Array.isArray(left) || Array.isArray(right) ? JSON.stringify(left) === JSON.stringify(right) : left === right;
      return expression.operator === "!=" || expression.operator === "!==" ? !equal : equal;
    }
    if (expression.operator === ">" || expression.operator === ">=" || expression.operator === "<" || expression.operator === "<=") {
      const comparison = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true });
      return expression.operator === ">" ? comparison > 0 : expression.operator === ">=" ? comparison >= 0 : expression.operator === "<" ? comparison < 0 : comparison <= 0;
    }
  }
  if (expression.kind === "call") {
    const name = expression.name.toLocaleLowerCase("en-US");
    if (name === "prop") {
      if (expression.arguments.length !== 1) throw new Error("prop precisa do nome de uma propriedade.");
      const propertyName = evaluateExpression(expression.arguments[0], resolveProperty, depth + 1);
      if (typeof propertyName !== "string") throw new Error("prop precisa receber um nome entre aspas.");
      return resolveProperty(propertyName);
    }
    if (name === "if") {
      if (expression.arguments.length !== 3) throw new Error("if precisa de três argumentos.");
      const condition = asBoolean(evaluateExpression(expression.arguments[0], resolveProperty, depth + 1));
      return evaluateExpression(expression.arguments[condition ? 1 : 2], resolveProperty, depth + 1);
    }
    if (name === "ifs") {
      if (expression.arguments.length < 3) throw new Error("ifs precisa de uma condição, um valor e um resultado padrão.");
      for (let index = 0; index + 1 < expression.arguments.length - 1; index += 2) {
        if (asBoolean(evaluateExpression(expression.arguments[index], resolveProperty, depth + 1))) return evaluateExpression(expression.arguments[index + 1], resolveProperty, depth + 1);
      }
      return evaluateExpression(expression.arguments.at(-1)!, resolveProperty, depth + 1);
    }
    const values = expression.arguments.map((item) => evaluateExpression(item, resolveProperty, depth + 1));
    return evaluateCall(expression.name, values);
  }
  if (expression.kind === "method") {
    const receiver = evaluateExpression(expression.target, resolveProperty, depth + 1);
    const arguments_ = expression.arguments.map((item) => evaluateExpression(item, resolveProperty, depth + 1));
    return evaluateCall(expression.name, [receiver, ...arguments_]);
  }
  return null;
}

export function evaluateFormula(expression: string, resolveProperty: (name: string) => FormulaValue): FormulaEvaluation {
  try {
    if (!expression.trim()) return { value: null };
    const parsed = new Parser(tokenize(expression)).parse();
    return { value: evaluateExpression(parsed, resolveProperty) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Fórmula inválida." };
  }
}

const SUPPORTED_FORMULA_FUNCTIONS = new Set([
  "and", "or", "not", "if", "ifs", "empty", "length", "format", "contains", "includes", "substring", "replace",
  "lower", "lowercase", "upper", "uppercase", "trim", "split", "join", "first", "last", "at", "now", "dateadd",
  "datesubtract", "parsedate", "datebetween", "timestamp", "fromtimestamp", "formatdate", "add", "subtract", "minus",
  "multiply", "divide", "mod", "pow", "abs", "round", "ceil", "floor", "sqrt", "cbrt", "exp", "ln", "log10",
  "log2", "min", "max", "sum", "mean", "median", "pi", "e",
]);

function validateExpressionTree(expression: Expression, propertyNames: Set<string>): string | null {
  if (expression.kind === "array") {
    for (const item of expression.values) { const error = validateExpressionTree(item, propertyNames); if (error) return error; }
    return null;
  }
  if (expression.kind === "unary") return validateExpressionTree(expression.value, propertyNames);
  if (expression.kind === "binary") return validateExpressionTree(expression.left, propertyNames) ?? validateExpressionTree(expression.right, propertyNames);
  if (expression.kind === "conditional") return validateExpressionTree(expression.condition, propertyNames)
    ?? validateExpressionTree(expression.yes, propertyNames)
    ?? validateExpressionTree(expression.no, propertyNames);
  if (expression.kind === "method") {
    if (!SUPPORTED_FORMULA_FUNCTIONS.has(expression.name.toLocaleLowerCase("en-US"))) return `Método não suportado: ${expression.name}`;
    return validateExpressionTree(expression.target, propertyNames)
      ?? expression.arguments.map((item) => validateExpressionTree(item, propertyNames)).find(Boolean)
      ?? null;
  }
  if (expression.kind === "call") {
    const name = expression.name.toLocaleLowerCase("en-US");
    if (name === "prop") {
      if (expression.arguments.length !== 1 || expression.arguments[0].kind !== "literal" || typeof expression.arguments[0].value !== "string") return 'Use prop("Nome da propriedade").';
      const propertyName = expression.arguments[0].value.toLocaleLowerCase("pt-BR");
      return propertyNames.has(propertyName) ? null : `A propriedade “${expression.arguments[0].value}” não existe nesta base.`;
    }
    if (!SUPPORTED_FORMULA_FUNCTIONS.has(name)) return `Função não suportada: ${expression.name}`;
    return expression.arguments.map((item) => validateExpressionTree(item, propertyNames)).find(Boolean) ?? null;
  }
  return null;
}

export function validateFormula(expression: string, propertyNames: string[]): string | null {
  try {
    if (!expression.trim()) return "Informe uma expressão para a fórmula.";
    const parsed = new Parser(tokenize(expression)).parse();
    const allowedProperties = new Set(propertyNames.map((name) => name.toLocaleLowerCase("pt-BR")));
    return validateExpressionTree(parsed, allowedProperties);
  } catch (error) {
    return error instanceof Error ? error.message : "Fórmula inválida.";
  }
}

export function formatFormulaValue(value: FormulaValue): string {
  if (value === null) return "";
  if (Array.isArray(value)) return value.map(formatFormulaValue).join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("pt-BR") : value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  return value;
}
