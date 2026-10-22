export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "divider";

export interface ContentBlock {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

export type TaskStatus = "Not started" | "In progress" | "Done";
export type Priority = "Low" | "Medium" | "High";

export interface DatabaseRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  assignee: string;
  category: string;
}

export interface Page {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  kind: "document" | "database";
  blocks: ContentBlock[];
  rows?: DatabaseRow[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceData {
  version: 1;
  workspaceName: string;
  pages: Page[];
  activePageId: string;
  favorites: string[];
  theme: "light" | "dark";
}

export const STATUS_OPTIONS: TaskStatus[] = ["Not started", "In progress", "Done"];
export const PRIORITY_OPTIONS: Priority[] = ["Low", "Medium", "High"];

const initialTime = "2026-10-22T12:00:00.000Z";

export function createInitialWorkspace(): WorkspaceData {
  return {
    version: 1,
    workspaceName: "Meu espaço de trabalho",
    activePageId: "welcome",
    favorites: ["welcome", "project-tracker"],
    theme: "light",
    pages: [
      {
        id: "welcome",
        title: "Boas-vindas ao seu espaço",
        icon: "👋",
        parentId: null,
        kind: "document",
        createdAt: initialTime,
        updatedAt: initialTime,
        blocks: [
          { id: "welcome-heading", type: "heading1", text: "Um espaço mais leve para trabalhar" },
          {
            id: "welcome-intro",
            type: "paragraph",
            text: "Reúna suas anotações, planos e projetos. Este espaço está pronto para ganhar a sua cara.",
          },
          { id: "welcome-spacer", type: "paragraph", text: "" },
          { id: "welcome-section", type: "heading2", text: "Comece com alguns blocos" },
          {
            id: "welcome-list-1",
            type: "bulleted",
            text: "Crie uma página para uma ideia, reunião ou projeto",
          },
          {
            id: "welcome-list-2",
            type: "bulleted",
            text: "Digite / em uma página para adicionar um bloco",
          },
          {
            id: "welcome-list-3",
            type: "bulleted",
            text: "Use uma base de dados para acompanhar o trabalho em um só lugar",
          },
          {
            id: "welcome-callout",
            type: "callout",
            text: "Suas alterações são salvas neste navegador. Exporte um backup pelo menu do espaço de trabalho.",
          },
        ],
      },
      {
        id: "meeting-notes",
        title: "Anotações de reunião",
        icon: "📝",
        parentId: null,
        kind: "document",
        createdAt: initialTime,
        updatedAt: initialTime,
        blocks: [
          { id: "meeting-heading", type: "heading2", text: "Reunião semanal" },
          { id: "meeting-date", type: "paragraph", text: "Adicione aqui a pauta, as decisões e os próximos passos." },
          { id: "meeting-divider", type: "divider", text: "" },
          { id: "meeting-todo-1", type: "todo", text: "Compartilhar atualizações antes da reunião", checked: false },
          { id: "meeting-todo-2", type: "todo", text: "Registrar decisões e responsáveis", checked: false },
        ],
      },
      {
        id: "project-tracker",
        title: "Acompanhamento de projetos",
        icon: "📊",
        parentId: null,
        kind: "database",
        createdAt: initialTime,
        updatedAt: initialTime,
        blocks: [],
        rows: [
          {
            id: "row-northstar",
            title: "Lançamento do Northstar",
            status: "In progress",
            priority: "High",
            dueDate: "2026-11-04",
            assignee: "Alex Morgan",
            category: "Produto",
          },
          {
            id: "row-research",
            title: "Entrevistas com clientes",
            status: "Not started",
            priority: "Medium",
            dueDate: "2026-11-10",
            assignee: "Jordan Lee",
            category: "Pesquisa",
          },
          {
            id: "row-guide",
            title: "Publicar guia de integração",
            status: "Done",
            priority: "Low",
            dueDate: "2026-10-21",
            assignee: "Sam Taylor",
            category: "Operações",
          },
          {
            id: "row-review",
            title: "Revisar feedback do lançamento",
            status: "Not started",
            priority: "High",
            dueDate: "2026-11-15",
            assignee: "",
            category: "Produto",
          },
        ],
      },
      {
        id: "product-brief",
        title: "Resumo do produto",
        icon: "💡",
        parentId: null,
        kind: "document",
        createdAt: initialTime,
        updatedAt: initialTime,
        blocks: [
          { id: "brief-heading", type: "heading1", text: "Um lugar claro para cada ideia" },
          { id: "brief-p1", type: "paragraph", text: "Use esta página para definir um problema, o público e o resultado esperado antes de começar." },
          { id: "brief-h2", type: "heading2", text: "A oportunidade" },
          { id: "brief-p2", type: "paragraph", text: "O que está atrapalhando hoje? Descreva a necessidade em poucas frases diretas." },
          { id: "brief-h3", type: "heading2", text: "Como será o sucesso" },
          { id: "brief-check", type: "todo", text: "Definir um resultado mensurável", checked: false },
        ],
      },
    ],
  };
}

export function makeId(prefix = "item"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Salvo";
  return `Editado às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
