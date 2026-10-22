import { evaluateFormula, formatFormulaValue } from "./formulas";
import type { FormulaEvaluation, FormulaValue } from "./formulas";
import type { ContentBlock, DatabaseProperty, DatabasePropertyValue, DatabaseRow, Page } from "./model";

function inline(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([`*_{}[\]<>])/g, "\\$1");
}

function tableCell(value: string): string {
  return inline(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function quote(value: string): string {
  return value.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

function destination(value: string): string {
  return value.replace(/[\s<>()[\]\\]/g, (character) => encodeURIComponent(character));
}

function fencedCode(value: string): string {
  const sequences = value.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...sequences.map((sequence) => sequence.length + 1)));
  return `${fence}\n${value}\n${fence}`;
}

function blockToMarkdown(block: ContentBlock, number: number): string {
  switch (block.type) {
    case "heading1": return `# ${inline(block.text)}`;
    case "heading2": return `## ${inline(block.text)}`;
    case "heading3": return `### ${inline(block.text)}`;
    case "bulleted": return `- ${block.text.replace(/\n/g, "\n  ")}`;
    case "numbered": return `${number}. ${block.text.replace(/\n/g, "\n   ")}`;
    case "todo": return `- [${block.checked ? "x" : " "}] ${block.text.replace(/\n/g, "\n  ")}`;
    case "quote": return quote(block.text);
    case "callout": return quote(`💡 ${block.text}`);
    case "code": return fencedCode(block.text);
    case "divider": return "---";
    case "toggle": return `**${inline(block.text || "Detalhes")}**${block.details ? `\n\n${quote(block.details)}` : ""}`;
    case "image": {
      const source = block.imageData || block.url;
      const caption = block.caption || block.text || "Imagem";
      return source ? `![${inline(caption)}](${destination(source)})${block.caption ? `\n\n_${inline(block.caption)}_` : ""}` : `[Imagem: ${inline(caption)}]`;
    }
    case "bookmark": return block.url ? `[${inline(block.text || block.url)}](${destination(block.url)})${block.caption ? `\n\n${inline(block.caption)}` : ""}` : inline(block.text);
    case "pageLink": return `📄 **${inline(block.text || "Página vinculada")}**${block.targetPageId ? ` — referência local: \`${block.targetPageId.replace(/`/g, "")}\`` : ""}`;
    case "meeting": {
      const meeting = block.meeting;
      const parts = [`## ${inline(block.text || "Reunião")}`];
      if (meeting?.participants) parts.push(`### Participantes\n\n${meeting.participants}`);
      if (meeting?.agenda) parts.push(`### Pauta\n\n${meeting.agenda}`);
      if (meeting?.transcript) parts.push(`### Transcrição\n\n${meeting.transcript}`);
      if (meeting?.summary) parts.push(`### Resumo\n\n${meeting.summary}`);
      if (meeting?.actionItems?.length) parts.push(`### Ações\n\n${meeting.actionItems.map((action) => `- [${action.done ? "x" : " "}] ${action.text.replace(/\n/g, "\n  ")}${action.owner ? ` — ${inline(action.owner)}` : ""}`).join("\n")}`);
      parts.push("_Os áudios da reunião são armazenados separadamente no navegador e não fazem parte deste arquivo._");
      return parts.join("\n\n");
    }
    default: return block.text;
  }
}

const BUILTIN_PROPERTIES: DatabaseProperty[] = [
  { id: "title", name: "Nome", type: "Text" },
  { id: "status", name: "Status", type: "Select" },
  { id: "priority", name: "Prioridade", type: "Select" },
  { id: "startDate", name: "Início", type: "Date" },
  { id: "dueDate", name: "Prazo", type: "Date" },
  { id: "assignee", name: "Responsável", type: "Person" },
  { id: "category", name: "Categoria", type: "Text" },
];

function rowValue(row: DatabaseRow, property: DatabaseProperty): DatabasePropertyValue {
  switch (property.id) {
    case "title": return row.title;
    case "status": return row.status;
    case "priority": return row.priority;
    case "startDate": return row.startDate || "";
    case "dueDate": return row.dueDate;
    case "assignee": return row.assignee;
    case "category": return row.category;
    default: return row.properties?.[property.id] ?? null;
  }
}

function databaseMarkdown(page: Page): string {
  const properties = [...BUILTIN_PROPERTIES, ...(page.databaseProperties ?? []).filter((property) => !BUILTIN_PROPERTIES.some((builtin) => builtin.id === property.id))];
  const calculateFormula = (row: DatabaseRow, property: DatabaseProperty, stack: string[] = []): FormulaEvaluation => {
    if (stack.includes(property.id)) return { error: "Referência circular" };
    return evaluateFormula(property.formulaExpression ?? "", (name): FormulaValue => {
      const target = properties.find((candidate) => candidate.name.toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"));
      if (!target) throw new Error(`Propriedade não encontrada: ${name}`);
      if (target.type === "Rollup") throw new Error("Rollup requer a base vinculada");
      if (target.type === "Formula") {
        const result = calculateFormula(row, target, [...stack, property.id]);
        if ("error" in result) throw new Error(result.error);
        return result.value;
      }
      return rowValue(row, target);
    });
  };
  const displayValue = (row: DatabaseRow, property: DatabaseProperty): string => {
    if (property.type === "Formula") {
      const result = calculateFormula(row, property);
      return "error" in result ? `Erro: ${result.error}` : formatFormulaValue(result.value);
    }
    if (property.type === "Rollup") return "(cálculo na base vinculada)";
    if (property.id === "status") return ({ "Not started": "Não iniciada", "In progress": "Em andamento", Done: "Concluída" })[row.status];
    if (property.id === "priority") return ({ Low: "Baixa", Medium: "Média", High: "Alta" })[row.priority];
    const value = rowValue(row, property);
    if (value === null) return "";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    return String(value);
  };
  const rows = (page.rows ?? []).map((row) => `| ${properties.map((property) => tableCell(displayValue(row, property))).join(" | ")} |`);
  const parts = [`| ${properties.map((property) => tableCell(property.name)).join(" | ")} |\n| ${properties.map(() => "---").join(" | ")} |${rows.length ? `\n${rows.join("\n")}` : ""}`];
  const configurations = (page.databaseProperties ?? []).filter((property) => ["Formula", "Relation", "Rollup"].includes(property.type));
  if (configurations.length) {
    parts.push(`### Configuração das propriedades\n\n${configurations.map((property) => {
      if (property.type === "Formula") return `- **${inline(property.name)}**: fórmula\n\n  ${fencedCode(property.formulaExpression ?? "").replace(/\n/g, "\n  ")}`;
      if (property.type === "Relation") return `- **${inline(property.name)}**: relação com a base \`${property.relationDatabaseId ?? "não definida"}\`. As células preservam os identificadores vinculados.`;
      return `- **${inline(property.name)}**: rollup ${inline(property.rollupFunction ?? "Count all")}, relação \`${property.rollupRelationPropertyId ?? ""}\`, propriedade \`${property.rollupTargetPropertyId ?? ""}\`. O cálculo precisa da base vinculada.`;
    }).join("\n")}`);
  }
  return parts.join("\n\n");
}

export function pageToMarkdown(page: Page): string {
  const parts = [`# ${inline(page.title || "Sem título")}`];
  let number = 0;
  for (const block of page.blocks) {
    number = block.type === "numbered" ? number + 1 : 0;
    parts.push(blockToMarkdown(block, number));
  }
  if (page.kind === "database") parts.push(databaseMarkdown(page));
  if (page.comments?.length) {
    parts.push(`## Comentários locais\n\n${page.comments.map((comment) => `- **${inline(comment.author)}** · ${comment.createdAt}${comment.resolved ? " · Resolvido" : ""}${comment.parentId ? " · Resposta" : ""}\n\n${quote(comment.text)}`).join("\n\n")}`);
  }
  return `${parts.filter((part) => part.trim()).join("\n\n")}\n`;
}

export function exportPageMarkdown(page: Page): void {
  const text = pageToMarkdown(page);
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const safeTitle = [...(page.title || "pagina")]
    .map((character) => character.charCodeAt(0) < 32 ? "-" : character).join("")
    .replace(/[<>:"/\\|?*]/g, "-").slice(0, 120).trim();
  anchor.download = (safeTitle || "pagina") + ".md";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
