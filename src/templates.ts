import { createEmptyMeetingData, makeId } from "./model";
import type { BlockType, Page } from "./model";
import { createBlankPage } from "./workspaces";

export interface BuiltinTemplate {
  id: string;
  title: string;
  icon: string;
  category: string;
  description: string;
  build: () => Page;
}

function documentTemplate(title: string, icon: string, content: [BlockType, string][]): Page {
  return { ...createBlankPage("document", null), title, icon, blocks: content.map(([type, text]) => ({ id: makeId("block"), type, text, checked: false })) };
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "meeting", title: "Reunião", icon: "🎙️", category: "Trabalho", description: "Pauta, participantes, gravação local, decisões e ações.",
    build: () => ({ ...createBlankPage("document", null), title: "Notas de reunião", icon: "🎙️", cover: "sand", blocks: [{ id: makeId("block"), type: "meeting", text: "Nova reunião", meeting: createEmptyMeetingData() }] }),
  },
  {
    id: "project", title: "Plano de projeto", icon: "🚀", category: "Trabalho", description: "Objetivo, entregas, riscos e próximos passos.",
    build: () => ({ ...documentTemplate("Plano de projeto", "🚀", [
      ["callout", "Descreva o resultado que este projeto precisa alcançar."],
      ["heading2", "Objetivo"], ["paragraph", ""],
      ["heading2", "Entregas"], ["todo", "Definir as entregas e os critérios de aceitação"],
      ["heading2", "Cronograma"], ["bulleted", "Marco • responsável • data"],
      ["heading2", "Riscos e decisões"], ["paragraph", ""],
      ["heading2", "Próximos passos"], ["todo", "Combinar responsáveis e prazos"],
    ]), cover: "ocean" }),
  },
  {
    id: "wiki", title: "Wiki da equipe", icon: "📚", category: "Conhecimento", description: "Uma porta de entrada para processos e referências.",
    build: () => ({ ...documentTemplate("Wiki da equipe", "📚", [
      ["heading1", "Tudo que precisamos saber"],
      ["paragraph", "Organize o conhecimento e adicione links para páginas do workspace."],
      ["heading2", "Comece aqui"], ["bulleted", "Propósito da equipe e principais contatos"],
      ["heading2", "Como trabalhamos"], ["toggle", "Rotinas e acordos"],
      ["heading2", "Referências"], ["pageLink", "Escolha uma página de referência"],
      ["heading2", "Perguntas frequentes"], ["toggle", "Adicione uma pergunta"],
    ]), cover: "forest", showOutline: true }),
  },
  {
    id: "weekly", title: "Planejamento semanal", icon: "📅", category: "Pessoal", description: "Prioridades, tarefas e uma revisão da semana.",
    build: () => documentTemplate("Minha semana", "📅", [
      ["heading2", "Prioridades da semana"], ["todo", "Minha prioridade principal"], ["todo", "Uma entrega importante"],
      ["heading2", "Segunda a sexta"], ["bulleted", "Segunda-feira"], ["bulleted", "Terça-feira"], ["bulleted", "Quarta-feira"], ["bulleted", "Quinta-feira"], ["bulleted", "Sexta-feira"],
      ["heading2", "Revisão"], ["paragraph", "O que funcionou? O que vou ajustar?"],
    ]),
  },
  {
    id: "journal", title: "Diário", icon: "🌱", category: "Pessoal", description: "Reflexões, aprendizados e pequenas conquistas.",
    build: () => ({ ...documentTemplate("Meu diário", "🌱", [
      ["heading2", "Como estou hoje"], ["paragraph", ""],
      ["heading2", "O que aconteceu"], ["paragraph", ""],
      ["heading2", "Aprendizados"], ["bulleted", ""],
      ["heading2", "Uma coisa boa"], ["paragraph", ""],
    ]), cover: "lavender", font: "serif" }),
  },
  {
    id: "tasks", title: "Tarefas e projetos", icon: "✅", category: "Trabalho", description: "Base pronta para acompanhar status, prioridade e prazo.",
    build: () => {
      const page = createBlankPage("database", null);
      return { ...page, title: "Minhas tarefas", icon: "✅", rows: [
        { id: makeId("row"), title: "Organizar as prioridades", status: "In progress", priority: "High", dueDate: "", assignee: "", category: "Planejamento" },
        { id: makeId("row"), title: "Preparar a próxima entrega", status: "Not started", priority: "Medium", dueDate: "", assignee: "", category: "Trabalho" },
      ] };
    },
  },
  {
    id: "notes", title: "Notas de estudo", icon: "💡", category: "Conhecimento", description: "Ideias, conceitos e perguntas para aprofundar.",
    build: () => documentTemplate("Notas de estudo", "💡", [
      ["heading2", "Tema e objetivo"], ["paragraph", ""],
      ["heading2", "Ideias principais"], ["bulleted", ""],
      ["heading2", "Perguntas"], ["todo", "O que ainda preciso entender?"],
      ["heading2", "Fontes"], ["bookmark", ""],
    ]),
  },
];

export function markdownToPage(source: string, filename: string): Page {
  if (source.length > 2_000_000) throw new Error("Este arquivo é grande demais para uma página local. Importe um arquivo de até 2 MB.");
  const page = createBlankPage("document", null);
  page.title = filename.replace(/\.(md|markdown|txt)$/i, "") || "Documento importado";
  const blocks: Page["blocks"] = [];
  let codeLines: string[] | null = null;
  const add = (type: BlockType, text: string, checked = false) => blocks.push({ id: makeId("block"), type, text, checked });
  for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (line.startsWith(String.fromCharCode(96, 96, 96))) {
      if (codeLines) { add("code", codeLines.join("\n")); codeLines = null; }
      else codeLines = [];
      continue;
    }
    if (codeLines) { codeLines.push(line); continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const todo = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (heading) add(("heading" + heading[1].length) as BlockType, heading[2]);
    else if (todo) add("todo", todo[2], todo[1].toLowerCase() === "x");
    else if (/^[-*_]{3,}\s*$/.test(line)) add("divider", "");
    else if (/^\s*[-*+]\s+/.test(line)) add("bulleted", line.replace(/^\s*[-*+]\s+/, ""));
    else if (/^\s*\d+\.\s+/.test(line)) add("numbered", line.replace(/^\s*\d+\.\s+/, ""));
    else if (/^>\s?/.test(line)) add("quote", line.replace(/^>\s?/, ""));
    else if (line.trim() || blocks.at(-1)?.text !== "") add("paragraph", line);
  }
  if (codeLines) add("code", codeLines.join("\n"));
  page.blocks = blocks.length ? blocks : page.blocks;
  return page;
}
