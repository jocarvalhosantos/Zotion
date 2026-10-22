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

export type DatabasePropertyType =
  | "Text"
  | "Number"
  | "Select"
  | "Multi-select"
  | "Date"
  | "Checkbox"
  | "URL"
  | "Email"
  | "Phone"
  | "Person"
  | "Relation"
  | "Rollup";

export type RollupFunction =
  | "Show original"
  | "Show unique values"
  | "Count all"
  | "Count values"
  | "Count unique values"
  | "Count empty"
  | "Count not empty"
  | "Percent empty"
  | "Percent not empty"
  | "Sum"
  | "Average"
  | "Median"
  | "Min"
  | "Max"
  | "Range"
  | "Earliest date"
  | "Latest date"
  | "Date range";

export type DatabaseViewLayout = "Table" | "Board" | "List" | "Calendar" | "Gallery" | "Timeline" | "Chart";
export type DatabaseFilterOperator =
  | "is"
  | "is-not"
  | "contains"
  | "does-not-contain"
  | "is-empty"
  | "is-not-empty"
  | "greater-than"
  | "less-than"
  | "on-or-before"
  | "on-or-after";

export interface DatabaseFilterRule {
  id: string;
  propertyId: string;
  operator: DatabaseFilterOperator;
  value: string;
}

export interface DatabaseViewSettings {
  id: string;
  name: string;
  layout: DatabaseViewLayout;
  filters: DatabaseFilterRule[];
  filterMatch: "AND" | "OR";
  sortPropertyId: string;
  sortDirection: "Ascending" | "Descending";
}

export type DatabasePropertyValue = string | number | boolean | string[] | null;

export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: string[];
  relationDatabaseId?: string;
  rollupRelationPropertyId?: string;
  rollupTargetPropertyId?: string;
  rollupFunction?: RollupFunction;
}

export interface DatabaseRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  startDate?: string;
  dueDate: string;
  assignee: string;
  category: string;
  properties?: Record<string, DatabasePropertyValue>;
}

export interface Page {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  kind: "document" | "database";
  blocks: ContentBlock[];
  rows?: DatabaseRow[];
  databaseProperties?: DatabaseProperty[];
  databaseViews?: DatabaseViewSettings[];
  activeDatabaseViewId?: string;
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
        databaseProperties: [
          { id: "property-impact", name: "Impacto", type: "Select", options: ["Alto", "Médio", "Baixo"] },
          { id: "property-review", name: "Revisão necessária", type: "Checkbox" },
          { id: "property-deliverables", name: "Entregas relacionadas", type: "Relation", relationDatabaseId: "deliverables" },
          { id: "property-planned-effort", name: "Esforço planejado", type: "Rollup", rollupRelationPropertyId: "property-deliverables", rollupTargetPropertyId: "property-effort", rollupFunction: "Sum" },
        ],
        rows: [
          {
            id: "row-northstar",
            title: "Lançamento do Northstar",
            status: "In progress",
            priority: "High",
            startDate: "2026-10-26",
            dueDate: "2026-11-04",
            assignee: "Alex Morgan",
            category: "Produto",
            properties: { "property-impact": "Alto", "property-review": true, "property-deliverables": ["delivery-interface", "delivery-analytics"] },
          },
          {
            id: "row-research",
            title: "Entrevistas com clientes",
            status: "Not started",
            priority: "Medium",
            startDate: "2026-10-28",
            dueDate: "2026-11-10",
            assignee: "Jordan Lee",
            category: "Pesquisa",
            properties: { "property-impact": "Médio", "property-review": false, "property-deliverables": ["delivery-interviews", "delivery-synthesis"] },
          },
          {
            id: "row-guide",
            title: "Publicar guia de integração",
            status: "Done",
            priority: "Low",
            startDate: "2026-10-19",
            dueDate: "2026-10-21",
            assignee: "Sam Taylor",
            category: "Operações",
            properties: { "property-impact": "Baixo", "property-review": false, "property-deliverables": ["delivery-guide-review"] },
          },
          {
            id: "row-review",
            title: "Revisar feedback do lançamento",
            status: "Not started",
            priority: "High",
            startDate: "2026-11-10",
            dueDate: "2026-11-15",
            assignee: "",
            category: "Produto",
            properties: { "property-impact": "Alto", "property-review": true, "property-deliverables": ["delivery-feedback"] },
          },
        ],
      },
      {
        id: "deliverables",
        title: "Entregas vinculadas",
        icon: "🧩",
        parentId: null,
        kind: "database",
        createdAt: initialTime,
        updatedAt: initialTime,
        blocks: [],
        databaseProperties: [{ id: "property-effort", name: "Pontos de esforço", type: "Number" }],
        rows: [
          { id: "delivery-interface", title: "Preparar interface de lançamento", status: "In progress", priority: "High", startDate: "2026-10-22", dueDate: "2026-10-29", assignee: "Alex Morgan", category: "Interface", properties: { "property-effort": 3 } },
          { id: "delivery-analytics", title: "Configurar métricas do produto", status: "Not started", priority: "Medium", startDate: "2026-10-24", dueDate: "2026-11-01", assignee: "Jordan Lee", category: "Análise", properties: { "property-effort": 5 } },
          { id: "delivery-interviews", title: "Conduzir entrevistas", status: "In progress", priority: "Medium", startDate: "2026-10-23", dueDate: "2026-11-03", assignee: "Jordan Lee", category: "Pesquisa", properties: { "property-effort": 2 } },
          { id: "delivery-synthesis", title: "Sintetizar entrevistas", status: "Not started", priority: "Medium", startDate: "2026-10-30", dueDate: "2026-11-07", assignee: "Jordan Lee", category: "Pesquisa", properties: { "property-effort": 4 } },
          { id: "delivery-guide-review", title: "Revisar guia de integração", status: "Done", priority: "Low", startDate: "2026-10-19", dueDate: "2026-10-21", assignee: "Sam Taylor", category: "Documentação", properties: { "property-effort": 5 } },
          { id: "delivery-feedback", title: "Classificar feedback", status: "Not started", priority: "High", startDate: "2026-11-10", dueDate: "2026-11-12", assignee: "Alex Morgan", category: "Feedback", properties: { "property-effort": 2 } },
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

export function createDefaultDatabaseView(): DatabaseViewSettings {
  return {
    id: "view-table-default",
    name: "Tabela",
    layout: "Table",
    filters: [],
    filterMatch: "AND",
    sortPropertyId: "",
    sortDirection: "Ascending",
  };
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Salvo";
  return `Editado às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
