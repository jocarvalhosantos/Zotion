import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownWideNarrow,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Filter,
  GanttChart,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings2,
  Table2,
  Trash2,
  Columns3,
} from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, createDefaultDatabaseView, makeId } from "./model";
import type { DatabaseFilterGroup, DatabaseFilterNode, DatabaseFilterOperator, DatabaseFilterRule, DatabaseProperty, DatabasePropertyType, DatabasePropertyValue, DatabaseRow, DatabaseSortRule, DatabaseViewLayout, DatabaseViewSettings, Page, Priority, RollupFunction, TaskStatus } from "./model";
import { evaluateFormula, formatFormulaValue, validateFormula } from "./formulas";
import type { FormulaEvaluation, FormulaValue } from "./formulas";

type ViewKind = DatabaseViewLayout;
type ChartStyle = "Bar" | "Donut";
type DatabaseTableGroup = { id: string; label: string; rows: DatabaseRow[]; subgroups?: DatabaseTableGroup[] };

const STATUS_LABELS: Record<TaskStatus, string> = { "Not started": "Não iniciada", "In progress": "Em andamento", Done: "Concluída" };
const PRIORITY_LABELS: Record<Priority, string> = { Low: "Baixa", Medium: "Média", High: "Alta" };
const VIEW_LABELS: Record<ViewKind, string> = { Table: "Tabela", Board: "Quadro", List: "Lista", Calendar: "Calendário", Gallery: "Galeria", Timeline: "Linha do tempo", Chart: "Gráfico", Form: "Formulário" };
const DEFAULT_DATABASE_VIEW = createDefaultDatabaseView();
const VIEW_LAYOUTS: ViewKind[] = ["Table", "Board", "List", "Calendar", "Gallery", "Timeline", "Chart", "Form"];
const PROPERTY_TYPES: DatabasePropertyType[] = ["Text", "Number", "Select", "Multi-select", "Date", "Checkbox", "URL", "Email", "Phone", "Person", "Relation", "Rollup", "Formula"];
const PROPERTY_TYPE_LABELS: Record<DatabasePropertyType, string> = {
  Text: "Texto",
  Number: "Número",
  Select: "Seleção",
  "Multi-select": "Seleção múltipla",
  Date: "Data",
  Checkbox: "Caixa de seleção",
  URL: "URL",
  Email: "E-mail",
  Phone: "Telefone",
  Person: "Pessoa",
  Relation: "Relação",
  Rollup: "Rollup",
  Formula: "Fórmula",
};
const ROLLUP_FUNCTION_LABELS: Record<RollupFunction, string> = {
  "Show original": "Mostrar original",
  "Show unique values": "Mostrar valores únicos",
  "Count all": "Contar todos",
  "Count values": "Contar valores preenchidos",
  "Count unique values": "Contar valores únicos",
  "Count empty": "Contar vazios",
  "Count not empty": "Contar preenchidos",
  "Percent empty": "Percentual vazio",
  "Percent not empty": "Percentual preenchido",
  Sum: "Soma",
  Average: "Média",
  Median: "Mediana",
  Min: "Mínimo",
  Max: "Máximo",
  Range: "Intervalo",
  "Earliest date": "Data mais antiga",
  "Latest date": "Data mais recente",
  "Date range": "Intervalo de datas",
};
const ROLLUP_COMMON_FUNCTIONS: RollupFunction[] = ["Show original", "Show unique values", "Count all", "Count values", "Count unique values", "Count empty", "Count not empty", "Percent empty", "Percent not empty"];
const ROLLUP_NUMBER_FUNCTIONS: RollupFunction[] = ["Sum", "Average", "Median", "Min", "Max", "Range"];
const ROLLUP_NUMERIC_FUNCTIONS: RollupFunction[] = ["Count all", "Count values", "Count unique values", "Count empty", "Count not empty", "Percent empty", "Percent not empty", ...ROLLUP_NUMBER_FUNCTIONS];
const ROLLUP_DATE_FUNCTIONS: RollupFunction[] = ["Earliest date", "Latest date", "Date range"];
const BUILTIN_DATABASE_PROPERTIES: DatabaseProperty[] = [
  { id: "title", name: "Nome", type: "Text" },
  { id: "status", name: "Status", type: "Select" },
  { id: "priority", name: "Prioridade", type: "Select" },
  { id: "startDate", name: "Início", type: "Date" },
  { id: "dueDate", name: "Prazo", type: "Date" },
  { id: "assignee", name: "Responsável", type: "Person" },
  { id: "category", name: "Categoria", type: "Text" },
];
interface DatabaseViewProps {
  page: Page;
  allPages: Page[];
  onUpdateRows: (rows: DatabaseRow[]) => void;
  onUpdateProperties: (properties: DatabaseProperty[]) => void;
  onUpdateViews: (views: DatabaseViewSettings[]) => void;
  onUpdateActiveViewId: (viewId: string) => void;
}

function formatDate(value: string): string {
  if (!value) return "Sem data";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function propertyValueText(value: DatabasePropertyValue, type: DatabasePropertyType): string {
  if (value === null || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (type === "Date") return formatDate(value);
  return value;
}

function getRowPropertyValue(row: DatabaseRow, propertyId: string): DatabasePropertyValue {
  if (propertyId === "title") return row.title;
  if (propertyId === "status") return row.status;
  if (propertyId === "priority") return row.priority;
  if (propertyId === "startDate") return row.startDate || null;
  if (propertyId === "dueDate") return row.dueDate || null;
  if (propertyId === "assignee") return row.assignee || null;
  if (propertyId === "category") return row.category || null;
  return row.properties?.[propertyId] ?? null;
}

function isEmptyPropertyValue(value: DatabasePropertyValue): boolean {
  return value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

const FILTER_OPERATOR_LABELS: Record<DatabaseFilterOperator, string> = {
  is: "é",
  "is-not": "não é",
  contains: "contém",
  "does-not-contain": "não contém",
  "is-empty": "está vazio",
  "is-not-empty": "não está vazio",
  "greater-than": "é maior que",
  "less-than": "é menor que",
  "on-or-before": "é nesta data ou antes",
  "on-or-after": "é nesta data ou depois",
};

function isNumericProperty(property: DatabaseProperty): boolean {
  return property.type === "Number" || (property.type === "Rollup" && ROLLUP_NUMERIC_FUNCTIONS.includes(property.rollupFunction ?? "Count all"));
}

function getFilterOperators(property: DatabaseProperty): DatabaseFilterOperator[] {
  const emptyOperators: DatabaseFilterOperator[] = ["is-empty", "is-not-empty"];
  if (property.type === "Formula") return ["is", "is-not", "contains", "does-not-contain", "greater-than", "less-than", "on-or-before", "on-or-after", ...emptyOperators];
  if (isNumericProperty(property)) {
    return ["is", "is-not", "greater-than", "less-than", ...emptyOperators];
  }
  if (property.type === "Date") {
    return ["is", "is-not", "on-or-before", "on-or-after", ...emptyOperators];
  }
  if (property.type === "Select" || property.type === "Checkbox") return ["is", "is-not", ...emptyOperators];
  if (property.type === "Multi-select" || property.type === "Relation") return ["contains", "does-not-contain", ...emptyOperators];
  return ["contains", "does-not-contain", "is", "is-not", ...emptyOperators];
}

function parseLocaleNumber(value: string | number): number {
  if (typeof value === "number") return value;
  const normalized = value.trim().replace(/%$/, "");
  if (!normalized) return Number.NaN;
  if (normalized.includes(",")) return Number(normalized.replace(/\./g, "").replace(",", "."));
  const thousandsGrouped = /^-?\d{1,3}(?:\.\d{3})+$/.test(normalized);
  return Number(thousandsGrouped ? normalized.replace(/\./g, "") : normalized);
}

function updateFilterTree(nodes: DatabaseFilterNode[], id: string, update: (node: DatabaseFilterNode) => DatabaseFilterNode): DatabaseFilterNode[] {
  return nodes.map((node) => {
    if (node.id === id) return update(node);
    return node.kind === "group" ? { ...node, children: updateFilterTree(node.children, id, update) } : node;
  });
}

function removeFilterTreeNode(nodes: DatabaseFilterNode[], id: string): DatabaseFilterNode[] {
  return nodes.flatMap<DatabaseFilterNode>((node): DatabaseFilterNode[] => {
    if (node.id === id) return [];
    return node.kind === "group" ? [{ ...node, children: removeFilterTreeNode(node.children, id) }] : [node];
  });
}

function countFilterRules(nodes: DatabaseFilterNode[]): number {
  return nodes.reduce((count, node) => count + (node.kind === "group" ? countFilterRules(node.children) : 1), 0);
}

function getFilterGroupDepth(nodes: DatabaseFilterNode[], id: string, depth = 1): number | null {
  for (const node of nodes) {
    if (node.kind !== "group") continue;
    if (node.id === id) return depth;
    const nestedDepth = getFilterGroupDepth(node.children, id, depth + 1);
    if (nestedDepth !== null) return nestedDepth;
  }
  return null;
}

function removePropertyFilters(nodes: DatabaseFilterNode[], propertyIds: Set<string>): DatabaseFilterNode[] {
  return nodes.flatMap<DatabaseFilterNode>((node): DatabaseFilterNode[] => {
    if (node.kind === "group") return [{ ...node, children: removePropertyFilters(node.children, propertyIds) }];
    return propertyIds.has(node.propertyId) ? [] : [node];
  });
}

function getCalendarMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function DatabaseView({ page, allPages, onUpdateRows, onUpdateProperties, onUpdateViews, onUpdateActiveViewId }: DatabaseViewProps) {
  const databaseViews = useMemo(() => {
    const storedViews = page.databaseViews?.length ? page.databaseViews : [DEFAULT_DATABASE_VIEW];
    return storedViews.map((storedView) => ({
      ...DEFAULT_DATABASE_VIEW,
      ...storedView,
      filters: storedView.filters ?? [],
      filterGroups: storedView.filterGroups ?? [],
      sorts: storedView.sorts ?? (storedView.sortPropertyId ? [{ id: "legacy-sort", propertyId: storedView.sortPropertyId, direction: storedView.sortDirection }] : []),
      groupPropertyId: storedView.groupPropertyId ?? "",
      subGroupPropertyId: storedView.subGroupPropertyId ?? "",
    }));
  }, [page.databaseViews]);
  const activeViewId = databaseViews.some((candidate) => candidate.id === page.activeDatabaseViewId)
    ? page.activeDatabaseViewId!
    : databaseViews[0].id;
  const activeView = databaseViews.find((candidate) => candidate.id === activeViewId) ?? databaseViews[0];
  const activeViewSorts = activeView.sorts ?? [];
  const view = activeView.layout;
  const [query, setQuery] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [chartStyle, setChartStyle] = useState<ChartStyle>("Bar");
  const [chartGroupBy, setChartGroupBy] = useState("status");
  const [formValues, setFormValues] = useState<Record<string, DatabasePropertyValue>>({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [propertyManagerOpen, setPropertyManagerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [viewCreateOpen, setViewCreateOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewLayout, setViewLayout] = useState<ViewKind>("Table");
  const [propertyName, setPropertyName] = useState("");
  const [propertyType, setPropertyType] = useState<DatabasePropertyType>("Text");
  const [propertyOptions, setPropertyOptions] = useState("");
  const [formulaExpression, setFormulaExpression] = useState("");
  const [propertyError, setPropertyError] = useState("");
  const [relationDatabaseId, setRelationDatabaseId] = useState("");
  const [rollupRelationPropertyId, setRollupRelationPropertyId] = useState("");
  const [rollupTargetPropertyId, setRollupTargetPropertyId] = useState("title");
  const [rollupFunction, setRollupFunction] = useState<RollupFunction>("Count all");
  const rows = page.rows ?? [];
  const properties = page.databaseProperties ?? [];
  const filterProperties = [...BUILTIN_DATABASE_PROPERTIES, ...properties];
  const formFields = filterProperties.filter((property) => property.type !== "Rollup" && property.type !== "Formula");

  const getFormQuestion = (propertyId: string) => {
    const storedQuestion = activeView.formQuestions?.[propertyId];
    return {
      enabled: propertyId === "title" || storedQuestion?.enabled !== false,
      required: propertyId === "title" || storedQuestion?.required === true,
      description: storedQuestion?.description ?? "",
    };
  };

  useEffect(() => {
    setFormValues({});
    setFormSubmitted(false);
    setFormError("");
  }, [activeView.id]);

  const rollupRelationProperties = properties.filter((property) => property.type === "Relation");
  const selectedRollupRelationPropertyId = rollupRelationProperties.some((property) => property.id === rollupRelationPropertyId)
    ? rollupRelationPropertyId
    : rollupRelationProperties[0]?.id ?? "";
  const selectedRollupRelationProperty = rollupRelationProperties.find((property) => property.id === selectedRollupRelationPropertyId);
  const rollupTargetPage = allPages.find((candidate) => candidate.id === selectedRollupRelationProperty?.relationDatabaseId);
  const rollupTargetProperties = [
    ...BUILTIN_DATABASE_PROPERTIES,
    ...(rollupTargetPage?.databaseProperties ?? []).filter((property) => property.type !== "Relation" && property.type !== "Rollup" && property.type !== "Formula"),
  ];
  const selectedRollupTargetPropertyId = rollupTargetProperties.some((property) => property.id === rollupTargetPropertyId)
    ? rollupTargetPropertyId
    : rollupTargetProperties[0]?.id ?? "";
  const selectedRollupTargetProperty = rollupTargetProperties.find((property) => property.id === selectedRollupTargetPropertyId);
  const availableRollupFunctions = [
    ...ROLLUP_COMMON_FUNCTIONS,
    ...(selectedRollupTargetProperty?.type === "Number" ? ROLLUP_NUMBER_FUNCTIONS : []),
    ...(selectedRollupTargetProperty?.type === "Date" ? ROLLUP_DATE_FUNCTIONS : []),
  ];
  const selectedRollupFunction = availableRollupFunctions.includes(rollupFunction)
    ? rollupFunction
    : availableRollupFunctions[0] ?? "Count all";

  const calculateRollup = (row: DatabaseRow, property: DatabaseProperty): string => {
    const relationProperty = properties.find((candidate) => candidate.id === property.rollupRelationPropertyId && candidate.type === "Relation");
    if (!relationProperty) return "";
    const targetPage = allPages.find((candidate) => candidate.id === relationProperty.relationDatabaseId && candidate.kind === "database");
    if (!targetPage) return "";
    const relationValue = row.properties?.[relationProperty.id] ?? null;
    const linkedIds = Array.isArray(relationValue) ? relationValue : typeof relationValue === "string" ? [relationValue] : [];
    const linkedRows = (targetPage.rows ?? []).filter((targetRow) => linkedIds.includes(targetRow.id));
    const calculation = property.rollupFunction ?? "Count all";
    if (calculation === "Show original") return linkedRows.map((linkedRow) => linkedRow.title || "Sem título").join(", ");

    const targetProperty = [
      ...BUILTIN_DATABASE_PROPERTIES,
      ...(targetPage.databaseProperties ?? []).filter((candidate) => candidate.type !== "Relation" && candidate.type !== "Rollup" && candidate.type !== "Formula"),
    ].find((candidate) => candidate.id === property.rollupTargetPropertyId);
    if (!targetProperty) return "";
    const values = linkedRows.map((linkedRow) => getRowPropertyValue(linkedRow, targetProperty.id));
    const populatedValues = values.filter((value) => !isEmptyPropertyValue(value));
    const flattenedValues = populatedValues.flatMap((value) => Array.isArray(value) ? value : value === null ? [] : [value]);
    const uniqueValues = [...new Map(flattenedValues.map((value) => [`${typeof value}:${String(value)}`, value])).values()];
    const displayValues = (items: Array<string | number | boolean>) => items.map((value) => propertyValueText(value, targetProperty.type)).join(", ");
    const numericValues = populatedValues.filter((value): value is number => typeof value === "number");
    const sortedNumbers = [...numericValues].sort((a, b) => a - b);
    const dateValues = populatedValues.filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)));
    const sortedDates = [...dateValues].sort();
    const emptyCount = values.length - populatedValues.length;
    const numberResult = (value: number) => Number.isInteger(value) ? value.toLocaleString("pt-BR") : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

    if (calculation === "Show unique values") return displayValues(uniqueValues);
    if (calculation === "Count all") return numberResult(values.length);
    if (calculation === "Count values" || calculation === "Count not empty") return numberResult(populatedValues.length);
    if (calculation === "Count unique values") return numberResult(uniqueValues.length);
    if (calculation === "Count empty") return numberResult(emptyCount);
    if (calculation === "Percent empty") return `${numberResult(values.length ? emptyCount / values.length * 100 : 0)}%`;
    if (calculation === "Percent not empty") return `${numberResult(values.length ? populatedValues.length / values.length * 100 : 0)}%`;
    if (calculation === "Sum") return numberResult(numericValues.reduce((sum, value) => sum + value, 0));
    if (calculation === "Average") return numberResult(numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : 0);
    if (calculation === "Median") {
      if (sortedNumbers.length === 0) return "0";
      const middle = Math.floor(sortedNumbers.length / 2);
      return numberResult(sortedNumbers.length % 2 ? sortedNumbers[middle] : (sortedNumbers[middle - 1] + sortedNumbers[middle]) / 2);
    }
    if (calculation === "Min") return numberResult(sortedNumbers[0] ?? 0);
    if (calculation === "Max") return numberResult(sortedNumbers.at(-1) ?? 0);
    if (calculation === "Range") return numberResult((sortedNumbers.at(-1) ?? 0) - (sortedNumbers[0] ?? 0));
    if (calculation === "Earliest date") return sortedDates[0] ? propertyValueText(sortedDates[0], "Date") : "";
    if (calculation === "Latest date") return sortedDates.at(-1) ? propertyValueText(sortedDates.at(-1)!, "Date") : "";
    if (calculation === "Date range") {
      if (sortedDates.length === 0) return "";
      const elapsedDays = Math.round((Date.parse(sortedDates.at(-1)!) - Date.parse(sortedDates[0])) / 86400000);
      return `${numberResult(elapsedDays)} ${elapsedDays === 1 ? "dia" : "dias"}`;
    }
    return "";
  };

  const calculateFormula = (row: DatabaseRow, property: DatabaseProperty, stack: string[] = []): FormulaEvaluation => {
    if (stack.includes(property.id)) return { error: "Dependência circular entre fórmulas." };
    if (!property.formulaExpression?.trim()) return { value: null };
    const nextStack = [...stack, property.id];
    return evaluateFormula(property.formulaExpression, (name): FormulaValue => {
      const target = filterProperties.find((candidate) => candidate.name.toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"));
      if (!target) throw new Error(`A propriedade “${name}” não existe nesta base.`);
      if (target.type === "Formula") {
        const result = calculateFormula(row, target, nextStack);
        if ("error" in result) throw new Error(result.error);
        return result.value;
      }
      if (target.type === "Rollup") {
        const value = calculateRollup(row, target);
        if (ROLLUP_NUMERIC_FUNCTIONS.includes(target.rollupFunction ?? "Count all")) {
          const number = parseLocaleNumber(value);
          return Number.isNaN(number) ? null : number;
        }
        return value;
      }
      return getRowPropertyValue(row, target.id);
    });
  };

  const formulaToDatabaseValue = (value: FormulaValue): DatabasePropertyValue => {
    if (Array.isArray(value)) {
      const flattened: FormulaValue[] = [];
      const addValues = (items: FormulaValue[]) => {
        for (const item of items) {
          if (Array.isArray(item)) addValues(item);
          else flattened.push(item);
        }
      };
      addValues(value);
      return flattened.map((item) => formatFormulaValue(item));
    }
    return value;
  };

  const propertyDisplayText = (row: DatabaseRow, property: DatabaseProperty): string => {
    const value = row.properties?.[property.id] ?? null;
    if (property.type === "Relation") {
      const targetPage = allPages.find((candidate) => candidate.id === property.relationDatabaseId);
      const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return ids.map((id) => targetPage?.rows?.find((targetRow) => targetRow.id === id)?.title ?? "").filter(Boolean).join(", ");
    }
    if (property.type === "Rollup") return calculateRollup(row, property);
    if (property.type === "Formula") {
      const result = calculateFormula(row, property);
      return "error" in result ? `Erro: ${result.error}` : formatFormulaValue(result.value);
    }
    return propertyValueText(value, property.type);
  };

  const getFilterValue = (row: DatabaseRow, property: DatabaseProperty): DatabasePropertyValue => {
    if (property.type === "Relation" || property.type === "Rollup") return propertyDisplayText(row, property);
    if (property.type === "Formula") {
      const result = calculateFormula(row, property);
      return "error" in result ? `Erro: ${result.error}` : formulaToDatabaseValue(result.value);
    }
    return getRowPropertyValue(row, property.id);
  };

  const matchesFilter = (row: DatabaseRow, filter: DatabaseFilterRule): boolean => {
    const property = filterProperties.find((candidate) => candidate.id === filter.propertyId);
    if (!property) return true;
    const rawValue = getFilterValue(row, property);
    const empty = isEmptyPropertyValue(rawValue);
    if (filter.operator === "is-empty") return empty;
    if (filter.operator === "is-not-empty") return !empty;
    if (empty) return false;

    if (isNumericProperty(property) || (property.type === "Formula" && typeof rawValue === "number")) {
      const actual = parseLocaleNumber(typeof rawValue === "number" ? rawValue : String(rawValue));
      const expected = Number(filter.value);
      if (Number.isNaN(actual) || Number.isNaN(expected)) return false;
      if (filter.operator === "is") return actual === expected;
      if (filter.operator === "is-not") return actual !== expected;
      if (filter.operator === "greater-than") return actual > expected;
      if (filter.operator === "less-than") return actual < expected;
      return false;
    }

    if (property.type === "Checkbox") {
      const actual = rawValue === true;
      const expected = filter.value === "true";
      if (filter.operator === "is") return actual === expected;
      if (filter.operator === "is-not") return actual !== expected;
      return false;
    }

    const normalize = (value: string | number | boolean) => String(value).trim().toLocaleLowerCase("pt-BR");
    const expected = normalize(filter.value);
    if (filter.operator === "contains" || filter.operator === "does-not-contain") {
      const found = Array.isArray(rawValue)
        ? rawValue.some((item) => normalize(item).includes(expected))
        : normalize(String(rawValue)).includes(expected);
      return filter.operator === "contains" ? found : !found;
    }
    if (filter.operator === "is" || filter.operator === "is-not") {
      const found = Array.isArray(rawValue)
        ? rawValue.some((item) => normalize(item) === expected)
        : normalize(String(rawValue)) === expected;
      return filter.operator === "is" ? found : !found;
    }
    if (property.type === "Formula" && typeof rawValue === "string") {
      const comparison = rawValue.localeCompare(filter.value, "pt-BR", { numeric: true });
      if (filter.operator === "greater-than") return comparison > 0;
      if (filter.operator === "less-than") return comparison < 0;
      if (filter.operator === "on-or-before") return comparison <= 0;
      if (filter.operator === "on-or-after") return comparison >= 0;
    }
    if (property.type === "Date" && (filter.operator === "on-or-before" || filter.operator === "on-or-after")) {
      const actual = String(rawValue);
      return filter.operator === "on-or-before" ? actual <= filter.value : actual >= filter.value;
    }
    return false;
  };

  const matchesFilterGroup = (row: DatabaseRow, group: DatabaseFilterGroup): boolean | null => {
    const matches = group.children.map((child) => child.kind === "group" ? matchesFilterGroup(row, child) : matchesFilter(row, child)).filter((match): match is boolean => match !== null);
    if (matches.length === 0) return null;
    return group.filterMatch === "OR" ? matches.some(Boolean) : matches.every(Boolean);
  };

  const getFilterChoices = (property: DatabaseProperty) => {
    if (property.id === "status") return STATUS_OPTIONS.map((value) => ({ value, label: STATUS_LABELS[value] }));
    if (property.id === "priority") return PRIORITY_OPTIONS.map((value) => ({ value, label: PRIORITY_LABELS[value] }));
    if (property.type === "Checkbox") return [{ value: "true", label: "Marcado" }, { value: "false", label: "Desmarcado" }];
    if (property.type === "Relation") {
      const targetPage = allPages.find((candidate) => candidate.id === property.relationDatabaseId);
      return (targetPage?.rows ?? []).map((row) => ({ value: row.title, label: row.title || "Sem título" }));
    }
    const values = rows.flatMap((row) => {
      const value = getFilterValue(row, property);
      return Array.isArray(value) ? value.map(String) : value === null || value === "" ? [] : [String(value)];
    });
    const uniqueValues = [...new Set([...(property.options ?? []), ...values])];
    return uniqueValues.map((value) => ({ value, label: value }));
  };

  const visibleRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const result = rows.filter((row) => {
      const customValues = properties.map((property) => propertyDisplayText(row, property));
      const matchesText = !text || [row.title, row.assignee, row.category, row.priority, row.status, ...customValues].some((value) => value.toLowerCase().includes(text));
      const matches = [
        ...(activeView.filters ?? []).map((filter) => matchesFilter(row, filter)),
        ...(activeView.filterGroups ?? []).map((group) => matchesFilterGroup(row, group)),
      ].filter((match): match is boolean => match !== null);
      const matchesFilters = matches.length === 0 || (activeView.filterMatch === "OR" ? matches.some(Boolean) : matches.every(Boolean));
      return matchesText && matchesFilters;
    });
    if (activeViewSorts.length > 0) result.sort((a, b) => {
      for (const sort of activeViewSorts) {
        const sortProperty = filterProperties.find((property) => property.id === sort.propertyId);
        if (!sortProperty) continue;
        const aValue = getFilterValue(a, sortProperty);
        const bValue = getFilterValue(b, sortProperty);
        const aEmpty = isEmptyPropertyValue(aValue);
        const bEmpty = isEmptyPropertyValue(bValue);
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        let order = 0;
        if (sortProperty.type === "Select" || sortProperty.type === "Multi-select") {
          const optionOrder = sortProperty.id === "status" ? STATUS_OPTIONS : sortProperty.id === "priority" ? PRIORITY_OPTIONS : sortProperty.options ?? [];
          const optionRanks = (value: DatabasePropertyValue) => (Array.isArray(value) ? value : value === null ? [] : [String(value)])
            .map((option) => {
              const rank = optionOrder.indexOf(option);
              return rank < 0 ? optionOrder.length : rank;
            })
            .sort((left, right) => left - right);
          const aRanks = optionRanks(aValue);
          const bRanks = optionRanks(bValue);
          for (let rankIndex = 0; rankIndex < Math.max(aRanks.length, bRanks.length); rankIndex += 1) {
            const aRank = aRanks[rankIndex] ?? Number.POSITIVE_INFINITY;
            const bRank = bRanks[rankIndex] ?? Number.POSITIVE_INFINITY;
            if (aRank !== bRank) {
              order = aRank - bRank;
              break;
            }
          }
        } else if (isNumericProperty(sortProperty)) {
          order = parseLocaleNumber(typeof aValue === "number" ? aValue : String(aValue)) - parseLocaleNumber(typeof bValue === "number" ? bValue : String(bValue));
          if (!Number.isFinite(order)) order = 0;
        } else {
          order = String(aValue).localeCompare(String(bValue), "pt-BR", { numeric: true, sensitivity: "base" });
        }
        if (order !== 0) return sort.direction === "Descending" ? -order : order;
      }
      return 0;
    });
    return result;
  }, [rows, query, activeView, properties, allPages, filterProperties]);

  const groupRowsByProperty = (items: DatabaseRow[], property: DatabaseProperty): DatabaseTableGroup[] => {
    const groups = new Map<string, DatabaseTableGroup>();
    for (const row of items) {
      const value = getFilterValue(row, property);
      const label = property.id === "status" && typeof value === "string"
        ? STATUS_LABELS[value as TaskStatus]
        : property.id === "priority" && typeof value === "string"
          ? PRIORITY_LABELS[value as Priority]
          : property.type === "Relation" || property.type === "Rollup"
            ? propertyDisplayText(row, property)
            : propertyValueText(value, property.type);
      const groupLabel = label.trim() || "Sem valor";
      if (!groups.has(groupLabel)) groups.set(groupLabel, { id: groupLabel, label: groupLabel, rows: [] });
      groups.get(groupLabel)!.rows.push(row);
    }
    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { numeric: true, sensitivity: "base" }));
  };

  const tableGroups = useMemo(() => {
    const groupProperty = filterProperties.find((property) => property.id === activeView.groupPropertyId);
    if (!groupProperty) return null;
    const subGroupProperty = filterProperties.find((property) => property.id === activeView.subGroupPropertyId && property.id !== groupProperty.id);
    return groupRowsByProperty(visibleRows, groupProperty).map((group) => ({
      ...group,
      subgroups: subGroupProperty ? groupRowsByProperty(group.rows, subGroupProperty) : undefined,
    }));
  }, [visibleRows, activeView.groupPropertyId, activeView.subGroupPropertyId, filterProperties]);

  const updateActiveView = (update: Partial<DatabaseViewSettings>) => {
    onUpdateViews(databaseViews.map((candidate) => candidate.id === activeView.id ? { ...candidate, ...update } : candidate));
  };

  const updateFormQuestion = (propertyId: string, update: Partial<{ enabled: boolean; required: boolean; description: string }>) => {
    const current = getFormQuestion(propertyId);
    const next = { ...current, ...update };
    if (propertyId === "title") {
      next.enabled = true;
      next.required = true;
    }
    updateActiveView({ formQuestions: { ...(activeView.formQuestions ?? {}), [propertyId]: next } });
  };

  const updateSorts = (sorts: DatabaseSortRule[]) => updateActiveView({
    sorts,
    sortPropertyId: sorts[0]?.propertyId ?? "",
    sortDirection: sorts[0]?.direction ?? "Ascending",
  });

  const addSort = () => {
    const property = filterProperties.find((candidate) => !activeViewSorts.some((sort) => sort.propertyId === candidate.id));
    if (!property) return;
    updateSorts([...activeViewSorts, { id: makeId("sort"), propertyId: property.id, direction: "Ascending" }]);
  };

  const updateSort = (id: string, update: Partial<DatabaseSortRule>) => {
    updateSorts(activeViewSorts.map((sort) => sort.id === id ? { ...sort, ...update } : sort));
  };

  const removeSort = (id: string) => updateSorts(activeViewSorts.filter((sort) => sort.id !== id));

  const moveSort = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= activeViewSorts.length) return;
    const sorts = [...activeViewSorts];
    [sorts[index], sorts[nextIndex]] = [sorts[nextIndex], sorts[index]];
    updateSorts(sorts);
  };

  const updateFilter = (id: string, update: Partial<DatabaseFilterRule>) => {
    if (activeView.filters.some((filter) => filter.id === id)) {
      updateActiveView({ filters: activeView.filters.map((filter) => filter.id === id ? { ...filter, ...update } : filter) });
      return;
    }
    updateActiveView({ filterGroups: updateFilterTree(activeView.filterGroups ?? [], id, (node) => node.kind === "group" ? node : { ...node, ...update }) as DatabaseFilterGroup[] });
  };

  const addFilter = (groupId?: string) => {
    const filter: DatabaseFilterRule = { id: makeId("filter"), propertyId: "title", operator: "contains", value: "" };
    if (!groupId) {
      updateActiveView({ filters: [...activeView.filters, filter] });
      return;
    }
    updateActiveView({ filterGroups: updateFilterTree(activeView.filterGroups ?? [], groupId, (node) => node.kind === "group" ? { ...node, children: [...node.children, filter] } : node) as DatabaseFilterGroup[] });
  };

  const addFilterGroup = (parentId?: string) => {
    const groups = activeView.filterGroups ?? [];
    const parentDepth = parentId ? getFilterGroupDepth(groups, parentId) : null;
    if (parentId && (parentDepth === null || parentDepth >= 3)) return;
    const group: DatabaseFilterGroup = { id: makeId("filter-group"), kind: "group", filterMatch: "AND", children: [] };
    if (!parentId) {
      updateActiveView({ filterGroups: [...groups, group] });
      return;
    }
    updateActiveView({ filterGroups: updateFilterTree(groups, parentId, (node) => node.kind === "group" ? { ...node, children: [...node.children, group] } : node) as DatabaseFilterGroup[] });
  };

  const removeFilter = (id: string) => {
    if (activeView.filters.some((filter) => filter.id === id)) {
      updateActiveView({ filters: activeView.filters.filter((filter) => filter.id !== id) });
      return;
    }
    updateActiveView({ filterGroups: removeFilterTreeNode(activeView.filterGroups ?? [], id) as DatabaseFilterGroup[] });
  };

  const updateFilterGroupMatch = (id: string, filterMatch: "AND" | "OR") => {
    updateActiveView({ filterGroups: updateFilterTree(activeView.filterGroups ?? [], id, (node) => node.kind === "group" ? { ...node, filterMatch } : node) as DatabaseFilterGroup[] });
  };

  const submitNewView = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const baseName = viewName.trim() || VIEW_LABELS[viewLayout];
    let name = baseName;
    let suffix = 2;
    while (databaseViews.some((candidate) => candidate.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    const newView: DatabaseViewSettings = {
      id: makeId("view"),
      name,
      layout: viewLayout,
      filters: [],
      filterGroups: [],
      filterMatch: "AND",
      sorts: [],
      sortPropertyId: "",
      sortDirection: "Ascending",
    };
    onUpdateViews([...databaseViews, newView]);
    onUpdateActiveViewId(newView.id);
    setViewName("");
    setViewLayout("Table");
    setViewCreateOpen(false);
    setViewSettingsOpen(false);
  };

  const deleteActiveView = () => {
    if (databaseViews.length <= 1) return;
    const nextViews = databaseViews.filter((candidate) => candidate.id !== activeView.id);
    const nextView = nextViews[Math.max(0, databaseViews.findIndex((candidate) => candidate.id === activeView.id) - 1)] ?? nextViews[0];
    onUpdateViews(nextViews);
    onUpdateActiveViewId(nextView.id);
    setViewSettingsOpen(false);
  };

  const renderFilterValue = (filter: DatabaseFilterRule, property: DatabaseProperty) => {
    if (filter.operator === "is-empty" || filter.operator === "is-not-empty") return null;
    const updateValue = (value: string) => updateFilter(filter.id, { value });
    const isNumber = property.type === "Number" || (property.type === "Rollup" && ["Sum", "Average", "Median", "Min", "Max", "Range"].includes(property.rollupFunction ?? ""));
    if (property.type === "Date") return <input type="date" value={filter.value} onChange={(event) => updateValue(event.target.value)} aria-label={`Valor do filtro ${property.name}`} />;
    if (isNumber) return <input type="number" value={filter.value} onChange={(event) => updateValue(event.target.value)} aria-label={`Valor do filtro ${property.name}`} placeholder="Número" />;
    if (["Select", "Checkbox", "Relation"].includes(property.type)) {
      const choices = getFilterChoices(property);
      if (choices.length > 0) return <select value={filter.value} onChange={(event) => updateValue(event.target.value)} aria-label={`Valor do filtro ${property.name}`}><option value="">Escolher valor</option>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>;
    }
    return <input type="text" value={filter.value} onChange={(event) => updateValue(event.target.value)} aria-label={`Valor do filtro ${property.name}`} placeholder="Valor" />;
  };

  const renderFilterRule = (filter: DatabaseFilterRule): ReactNode => {
    const property = filterProperties.find((candidate) => candidate.id === filter.propertyId) ?? BUILTIN_DATABASE_PROPERTIES[0];
    const operators = getFilterOperators(property);
    const operator = operators.includes(filter.operator) ? filter.operator : operators[0];
    return <div className="database-filter-rule" key={filter.id}>
      <select value={property.id} onChange={(event) => {
        const nextProperty = filterProperties.find((candidate) => candidate.id === event.target.value) ?? BUILTIN_DATABASE_PROPERTIES[0];
        updateFilter(filter.id, { propertyId: nextProperty.id, operator: getFilterOperators(nextProperty)[0], value: "" });
      }} aria-label="Propriedade do filtro">{filterProperties.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
      <select value={operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value as DatabaseFilterOperator })} aria-label="Operador do filtro">{operators.map((option) => <option key={option} value={option}>{FILTER_OPERATOR_LABELS[option]}</option>)}</select>
      {renderFilterValue({ ...filter, operator }, property)}
      <button type="button" className="database-filter-remove" aria-label="Remover filtro" title="Remover filtro" onClick={() => removeFilter(filter.id)}><Trash2 size={13} /></button>
    </div>;
  };

  const renderFilterNode = (node: DatabaseFilterNode, depth: number): ReactNode => {
    if (node.kind !== "group") return renderFilterRule(node);
    return <div className="database-filter-group" key={node.id} data-depth={depth}>
      <div className="database-filter-group-heading">
        <strong>Grupo {depth}</strong>
        <label>Correspondência<select value={node.filterMatch} onChange={(event) => updateFilterGroupMatch(node.id, event.target.value as "AND" | "OR")} aria-label={`Lógica do grupo ${depth}`}><option value="AND">todas (AND)</option><option value="OR">qualquer (OR)</option></select></label>
        <button type="button" onClick={() => addFilter(node.id)}><Plus size={12} /> Filtro</button>
        <button type="button" onClick={() => addFilterGroup(node.id)} disabled={depth >= 3} title={depth >= 3 ? "Limite de três níveis de grupos" : "Adicionar grupo aninhado"}><Plus size={12} /> Grupo</button>
        <button type="button" className="database-filter-remove" aria-label="Remover grupo de filtros" title="Remover grupo" onClick={() => removeFilter(node.id)}><Trash2 size={13} /></button>
      </div>
      <div className="database-filter-group-children">
        {node.children.length === 0
          ? <p className="database-filter-group-empty">Grupo vazio: adicione uma condição ou outro grupo.</p>
          : node.children.map((child) => renderFilterNode(child, depth + 1))}
      </div>
    </div>;
  };

  const filterCount = activeView.filters.length + countFilterRules(activeView.filterGroups ?? []);
  const hasFilterGroups = (activeView.filterGroups ?? []).length > 0;

  const updateRow = (id: string, update: Partial<DatabaseRow>) => {
    onUpdateRows(rows.map((row) => (row.id === id ? { ...row, ...update } : row)));
  };

  const createProperty = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPropertyError("");
    const name = propertyName.trim();
    if (!name) return;
    if (propertyType === "Relation" && !allPages.some((candidate) => candidate.id === relationDatabaseId && candidate.kind === "database")) return;
    if (propertyType === "Rollup" && (!selectedRollupRelationProperty || !selectedRollupTargetProperty)) return;
    if (propertyType === "Formula") {
      const validationError = validateFormula(formulaExpression, filterProperties.map((property) => property.name));
      if (validationError) {
        setPropertyError(validationError);
        return;
      }
    }
    const options = propertyOptions.split(",").map((option) => option.trim()).filter(Boolean);
    const property: DatabaseProperty = {
      id: makeId("property"),
      name,
      type: propertyType,
      ...(propertyType === "Select" || propertyType === "Multi-select"
        ? { options: options.length ? options : ["Opção 1", "Opção 2"] }
        : {}),
      ...(propertyType === "Relation" ? { relationDatabaseId } : {}),
      ...(propertyType === "Rollup" ? {
        rollupRelationPropertyId: selectedRollupRelationPropertyId,
        rollupTargetPropertyId: selectedRollupTargetPropertyId,
        rollupFunction: selectedRollupFunction,
      } : {}),
      ...(propertyType === "Formula" ? { formulaExpression: formulaExpression.trim() } : {}),
    };
    onUpdateProperties([...properties, property]);
    setPropertyName("");
    setPropertyOptions("");
    setFormulaExpression("");
    setPropertyError("");
  };

  const updateProperty = (id: string, update: Partial<DatabaseProperty>) => {
    onUpdateProperties(properties.map((property) => property.id === id ? { ...property, ...update } : property));
  };

  const removeProperty = (id: string) => {
    const removedPropertyIds = new Set([
      id,
      ...properties.filter((property) => property.type === "Rollup" && property.rollupRelationPropertyId === id).map((property) => property.id),
    ]);
    onUpdateProperties(properties.filter((property) => !removedPropertyIds.has(property.id)));
    onUpdateViews(databaseViews.map((viewSettings) => {
      const sorts = (viewSettings.sorts ?? []).filter((sort) => !removedPropertyIds.has(sort.propertyId));
      const groupPropertyId = removedPropertyIds.has(viewSettings.groupPropertyId ?? "") ? "" : viewSettings.groupPropertyId ?? "";
      const subGroupPropertyId = !groupPropertyId || removedPropertyIds.has(viewSettings.subGroupPropertyId ?? "") ? "" : viewSettings.subGroupPropertyId ?? "";
      return {
        ...viewSettings,
        filters: viewSettings.filters.filter((filter) => !removedPropertyIds.has(filter.propertyId)),
        filterGroups: removePropertyFilters(viewSettings.filterGroups ?? [], removedPropertyIds) as DatabaseFilterGroup[],
        sorts,
        sortPropertyId: sorts[0]?.propertyId ?? "",
        sortDirection: sorts[0]?.direction ?? "Ascending",
        groupPropertyId,
        subGroupPropertyId,
      };
    }));
    onUpdateRows(rows.map((row) => {
      const next = { ...(row.properties ?? {}) };
      for (const propertyId of removedPropertyIds) delete next[propertyId];
      return { ...row, properties: next };
    }));
  };

  const updatePropertyValue = (row: DatabaseRow, property: DatabaseProperty, value: DatabasePropertyValue) => {
    updateRow(row.id, { properties: { ...(row.properties ?? {}), [property.id]: value } });
  };

  const renderPropertyCell = (row: DatabaseRow, property: DatabaseProperty) => {
    const value = row.properties?.[property.id] ?? null;
    const ariaLabel = `${property.name} · ${row.title}`;
    if (property.type === "Relation") {
      const targetPage = allPages.find((candidate) => candidate.id === property.relationDatabaseId);
      const targetRows = targetPage?.rows ?? [];
      const selectedIds = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      const selectedTitles = targetRows.filter((targetRow) => selectedIds.includes(targetRow.id)).map((targetRow) => targetRow.title);
      return <details className="relation-cell"><summary title={selectedTitles.join(", ")}>{selectedTitles.join(", ") || "Vincular página"}</summary><div className="relation-cell-options">{targetRows.map((targetRow) => <label key={targetRow.id}><input type="checkbox" checked={selectedIds.includes(targetRow.id)} onChange={(event) => updatePropertyValue(row, property, event.target.checked ? [...selectedIds, targetRow.id] : selectedIds.filter((id) => id !== targetRow.id))} /><span>{targetRow.title || "Sem título"}</span></label>)}{targetRows.length === 0 && <small>Essa base ainda não tem páginas.</small>}</div></details>;
    }
    if (property.type === "Rollup") {
      const text = propertyDisplayText(row, property);
      return <span className="rollup-value" title={`${property.name}: ${text}`}>{text || "—"}</span>;
    }
    if (property.type === "Formula") {
      const text = propertyDisplayText(row, property);
      return <span className={`rollup-value ${text.startsWith("Erro:") ? "formula-error" : ""}`} title={`${property.name}: ${text}`}>{text || "—"}</span>;
    }
    if (property.type === "Checkbox") return <input className="property-checkbox" type="checkbox" checked={value === true} onChange={(event) => updatePropertyValue(row, property, event.target.checked)} aria-label={ariaLabel} />;
    if (property.type === "Number") return <input className="cell-text" type="number" value={typeof value === "number" ? value : ""} onChange={(event) => updatePropertyValue(row, property, event.target.value === "" ? null : Number(event.target.value))} aria-label={ariaLabel} placeholder="Número" />;
    if (property.type === "Date") return <input className="cell-date" type="date" value={typeof value === "string" ? value : ""} onChange={(event) => updatePropertyValue(row, property, event.target.value || null)} aria-label={ariaLabel} />;
    if (property.type === "Select") return <select className="custom-select" value={typeof value === "string" ? value : ""} onChange={(event) => updatePropertyValue(row, property, event.target.value || null)} aria-label={ariaLabel}><option value="">Sem valor</option>{[...new Set([...(property.options ?? []), ...(typeof value === "string" && value ? [value] : [])])].map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (property.type === "Multi-select") return <input className="cell-text" value={Array.isArray(value) ? value.join(", ") : ""} onChange={(event) => updatePropertyValue(row, property, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} aria-label={ariaLabel} placeholder="Separar por vírgulas" />;
    const inputType = property.type === "URL" ? "url" : property.type === "Email" ? "email" : property.type === "Phone" ? "tel" : "text";
    return <input className="cell-text" type={inputType} value={typeof value === "string" ? value : ""} onChange={(event) => updatePropertyValue(row, property, event.target.value)} aria-label={ariaLabel} placeholder={PROPERTY_TYPE_LABELS[property.type]} />;
  };

  const addRow = (status: TaskStatus = "Not started") => {
    const newRow: DatabaseRow = {
      id: makeId("row"),
      title: "Nova tarefa",
      status,
      priority: "Medium",
      startDate: "",
      dueDate: "",
      assignee: "",
      category: "",
    };
    onUpdateRows([...rows, newRow]);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-row-title="${newRow.id}"]`);
      input?.focus();
      input?.select();
    });
  };

  const formValue = (property: DatabaseProperty): DatabasePropertyValue => formValues[property.id]
    ?? (property.id === "status" ? "Not started"
      : property.id === "priority" ? "Medium"
        : property.type === "Checkbox" ? false
          : property.type === "Multi-select" || property.type === "Relation" ? [] : "");

  const changeFormValue = (propertyId: string, value: DatabasePropertyValue) => {
    setFormValues((current) => ({ ...current, [propertyId]: value }));
    setFormError("");
    setFormSubmitted(false);
  };

  const renderFormInput = (property: DatabaseProperty): ReactNode => {
    const value = formValue(property);
    const textValue = typeof value === "string" ? value : "";
    const ariaLabel = `Resposta: ${property.name}`;
    if (property.id === "title") return <input className="database-form-control" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel} placeholder="Sua resposta" />;
    if (property.id === "status") return <select className="database-form-control" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel}>{STATUS_OPTIONS.map((option) => <option key={option} value={option}>{STATUS_LABELS[option]}</option>)}</select>;
    if (property.id === "priority") return <select className="database-form-control" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel}>{PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{PRIORITY_LABELS[option]}</option>)}</select>;
    if (property.id === "startDate" || property.id === "dueDate") return <input className="database-form-control" type="date" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel} />;
    if (property.id === "assignee" || property.id === "category") return <input className="database-form-control" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel} placeholder="Sua resposta" />;
    if (property.type === "Checkbox") return <label className="database-form-checkbox"><input type="checkbox" checked={value === true} onChange={(event) => changeFormValue(property.id, event.target.checked)} aria-label={ariaLabel} /><span>Sim</span></label>;
    if (property.type === "Number") return <input className="database-form-control" type="number" value={typeof value === "number" ? value : ""} onChange={(event) => changeFormValue(property.id, event.target.value === "" ? null : Number(event.target.value))} aria-label={ariaLabel} placeholder="Número" />;
    if (property.type === "Date") return <input className="database-form-control" type="date" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel} />;
    if (property.type === "Select") return <select className="database-form-control" value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel}><option value="">Escolha uma opção</option>{property.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (property.type === "Multi-select" || property.type === "Relation") {
      const selectedValues = Array.isArray(value) ? value.map(String) : [];
      const options = property.type === "Relation"
        ? (allPages.find((candidate) => candidate.id === property.relationDatabaseId)?.rows ?? []).map((row) => ({ value: row.id, label: row.title || "Sem título" }))
        : (property.options ?? []).map((option) => ({ value: option, label: option }));
      return <div className="database-form-choice-list">{options.length === 0 ? <span className="database-form-help">Nenhuma opção disponível.</span> : options.map((option) => <label key={option.value}><input type="checkbox" checked={selectedValues.includes(option.value)} onChange={(event) => changeFormValue(property.id, event.target.checked ? [...selectedValues, option.value] : selectedValues.filter((selected) => selected !== option.value))} /><span>{option.label}</span></label>)}</div>;
    }
    const inputType = property.type === "URL" ? "url" : property.type === "Email" ? "email" : property.type === "Phone" ? "tel" : "text";
    return <input className="database-form-control" type={inputType} value={textValue} onChange={(event) => changeFormValue(property.id, event.target.value)} aria-label={ariaLabel} placeholder={inputType === "text" ? "Sua resposta" : PROPERTY_TYPE_LABELS[property.type]} />;
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const visibleFields = formFields.filter((property) => getFormQuestion(property.id).enabled);
    const missingField = visibleFields.find((property) => {
      if (!getFormQuestion(property.id).required) return false;
      const value = formValue(property);
      return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    });
    if (missingField) {
      setFormError(`Preencha o campo obrigatório: ${missingField.name}.`);
      return;
    }
    const valueAsString = (propertyId: string) => {
      const value = formValues[propertyId];
      return typeof value === "string" ? value : "";
    };
    const rowProperties = Object.fromEntries(properties
      .filter((property) => property.type !== "Rollup" && property.type !== "Formula")
      .map((property) => [property.id, formValues[property.id] ?? (property.type === "Checkbox" ? false : property.type === "Multi-select" || property.type === "Relation" ? [] : null)]));
    const newRow: DatabaseRow = {
      id: makeId("row"),
      title: valueAsString("title").trim(),
      status: (valueAsString("status") || "Not started") as TaskStatus,
      priority: (valueAsString("priority") || "Medium") as Priority,
      startDate: valueAsString("startDate"),
      dueDate: valueAsString("dueDate"),
      assignee: valueAsString("assignee"),
      category: valueAsString("category"),
      properties: rowProperties,
    };
    onUpdateRows([...rows, newRow]);
    setFormValues({});
    setFormError("");
    setFormSubmitted(true);
  };

  const removeRow = (id: string) => onUpdateRows(rows.filter((row) => row.id !== id));

  const monthLabel = calendarMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const timelineColumns = `190px repeat(${daysInMonth}, 34px)`;
  const firstDay = new Date(monthStart);
  firstDay.setDate(1 - monthStart.getDay());
  const calendarDates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return date;
  });
  const chartGroupOptions = [
    { id: "status", name: "Status" },
    { id: "priority", name: "Prioridade" },
    { id: "category", name: "Categoria" },
    { id: "assignee", name: "Responsável" },
    { id: "dueDate", name: "Prazo" },
    ...properties.map((property) => ({ id: property.id, name: property.name })),
  ];
  const selectedChartGroupBy = chartGroupOptions.some((option) => option.id === chartGroupBy) ? chartGroupBy : "status";
  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of visibleRows) {
      let values: string[];
      if (selectedChartGroupBy === "status") values = [STATUS_LABELS[row.status]];
      else if (selectedChartGroupBy === "priority") values = [PRIORITY_LABELS[row.priority]];
      else if (selectedChartGroupBy === "category") values = [row.category];
      else if (selectedChartGroupBy === "assignee") values = [row.assignee];
      else if (selectedChartGroupBy === "dueDate") values = [row.dueDate ? new Date(`${row.dueDate}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : ""];
      else {
        const property = properties.find((item) => item.id === selectedChartGroupBy);
        const value = row.properties?.[selectedChartGroupBy] ?? null;
        if (property?.type === "Relation") {
          const targetPage = allPages.find((candidate) => candidate.id === property.relationDatabaseId);
          const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
          values = ids.map((id) => targetPage?.rows?.find((targetRow) => targetRow.id === id)?.title ?? "");
        } else if (property?.type === "Rollup") {
          values = [propertyDisplayText(row, property)];
        } else if (property?.type === "Date" && typeof value === "string" && value) values = [new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })];
        else if (Array.isArray(value)) values = value;
        else if (typeof value === "boolean") values = [value ? "Sim" : "Não"];
        else values = [value === null ? "" : String(value)];
      }
      if (values.length === 0) values = [""];
      for (const value of values) {
        const label = value.trim() || "Sem valor";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
  }, [visibleRows, selectedChartGroupBy, properties, allPages]);
  const chartTotal = chartData.reduce((total, item) => total + item.count, 0);
  const chartMax = Math.max(1, ...chartData.map((item) => item.count));
  const chartColors = ["#668b72", "#6685ad", "#c08a50", "#9581b3", "#4f9b99", "#c36e66", "#7c879a", "#b1a354"];
  let chartCursor = 0;
  const chartGradient = chartData.length
    ? `conic-gradient(${chartData.map((item, index) => {
      const start = chartCursor;
      chartCursor += item.count / chartTotal * 100;
      return `${chartColors[index % chartColors.length]} ${start}% ${chartCursor}%`;
    }).join(", ")})`
    : "conic-gradient(var(--surface-soft) 0% 100%)";
  const renderTableRow = (row: DatabaseRow): ReactNode => <tr key={row.id}>
    <td className="title-column"><span className="row-page-icon">▱</span><input data-row-title={row.id} className="cell-title" value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} aria-label="Nome da tarefa" /></td>
    <td><select className={`status-select status-${row.status.toLowerCase().replaceAll(" ", "-")}`} value={row.status} onChange={(event) => updateRow(row.id, { status: event.target.value as TaskStatus })} aria-label="Status da tarefa">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></td>
    <td><select className={`priority-select priority-${row.priority.toLowerCase()}`} value={row.priority} onChange={(event) => updateRow(row.id, { priority: event.target.value as Priority })} aria-label="Prioridade da tarefa">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></td>
    <td><input className="cell-date" type="date" value={row.startDate ?? ""} onChange={(event) => updateRow(row.id, { startDate: event.target.value })} aria-label="Data de início" /></td>
    <td><input className="cell-date" type="date" value={row.dueDate} onChange={(event) => updateRow(row.id, { dueDate: event.target.value })} aria-label="Prazo" /></td>
    <td><input className="cell-text" value={row.assignee} onChange={(event) => updateRow(row.id, { assignee: event.target.value })} placeholder="Atribuir" aria-label="Responsável" /></td>
    <td><input className="cell-text" value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })} placeholder="Adicionar categoria" aria-label="Categoria" /></td>
    {properties.map((property) => <td key={property.id}>{renderPropertyCell(row, property)}</td>)}
    <td className="row-actions"><button type="button" title="Excluir linha" aria-label={`Excluir ${row.title}`} onClick={() => removeRow(row.id)}><Trash2 size={14} /></button></td>
  </tr>;
  const tableColSpan = 8 + properties.length;

  return (
    <section className="database-view" aria-label={`${page.title} database`}>
      <div className="database-toolbar">
        <div className="database-tabs" role="tablist" aria-label="Visualizações da base de dados">
          {databaseViews.map((databaseView) => {
            const Icon = databaseView.layout === "Table" ? Table2 : databaseView.layout === "Board" ? Columns3 : databaseView.layout === "List" ? List : databaseView.layout === "Calendar" ? CalendarDays : databaseView.layout === "Gallery" ? LayoutGrid : databaseView.layout === "Chart" ? BarChart3 : databaseView.layout === "Form" ? ClipboardList : GanttChart;
            return (
              <button key={databaseView.id} role="tab" aria-selected={databaseView.id === activeView.id} className={`database-tab ${databaseView.id === activeView.id ? "active" : ""}`} onClick={() => onUpdateActiveViewId(databaseView.id)} type="button" title={VIEW_LABELS[databaseView.layout]}>
                <Icon size={15} /> {databaseView.name}
              </button>
            );
          })}
          <div className="database-popover-wrap">
            <button className={`database-add-view ${viewCreateOpen ? "selected" : ""}`} type="button" title="Adicionar visualização" aria-label="Adicionar visualização" aria-expanded={viewCreateOpen} onClick={() => { setViewCreateOpen((open) => !open); setViewSettingsOpen(false); }}><Plus size={15} /></button>
            {viewCreateOpen && <form className="database-view-create-popover" role="dialog" aria-label="Criar visualização" onSubmit={submitNewView}>
              <strong>Nova visualização</strong>
              <label>Nome<input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder={VIEW_LABELS[viewLayout]} aria-label="Nome da visualização" /></label>
              <label>Layout<select value={viewLayout} onChange={(event) => setViewLayout(event.target.value as ViewKind)} aria-label="Layout da visualização">{VIEW_LAYOUTS.map((layout) => <option key={layout} value={layout}>{VIEW_LABELS[layout]}</option>)}</select></label>
              <button className="database-new-button" type="submit"><Plus size={14} /> Criar visualização</button>
            </form>}
          </div>
        </div>
        <div className="database-actions">
          <label className="database-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na base de dados" aria-label="Buscar na base de dados" />
          </label>
          <div className="database-popover-wrap">
            <button className={`icon-button database-sort ${filterOpen || filterCount > 0 || hasFilterGroups ? "selected" : ""}`} type="button" title="Filtrar esta visualização" aria-expanded={filterOpen} onClick={() => { setFilterOpen((open) => !open); setSortOpen(false); setViewSettingsOpen(false); }}>
              <Filter size={16} /><span>Filtrar{filterCount ? ` · ${filterCount}` : ""}</span>
            </button>
            {filterOpen && <div className="database-filter-popover" role="dialog" aria-label="Filtros da visualização">
              <div className="database-popover-heading"><strong>Filtros</strong><span>{filterCount} {filterCount === 1 ? "condição" : "condições"}</span></div>
              {(filterCount > 1 || hasFilterGroups) && <label className="database-filter-match">Mostrar páginas que correspondam a<select value={activeView.filterMatch} onChange={(event) => updateActiveView({ filterMatch: event.target.value as "AND" | "OR" })} aria-label="Lógica dos filtros"><option value="AND">todas as condições</option><option value="OR">qualquer condição</option></select></label>}
              <div className="database-filter-rules">
                {activeView.filters.map(renderFilterRule)}
                {(activeView.filterGroups ?? []).map((group) => renderFilterNode(group, 1))}
                {filterCount === 0 && !hasFilterGroups && <p className="database-property-empty">Adicione condições e grupos para filtrar as páginas desta visualização.</p>}
              </div>
              <div className="database-popover-actions"><button type="button" onClick={() => addFilter()}><Plus size={13} /> Adicionar filtro</button><button type="button" onClick={() => addFilterGroup()}><Plus size={13} /> Adicionar grupo</button><button type="button" onClick={() => updateActiveView({ filters: [], filterGroups: [] })} disabled={filterCount === 0 && !hasFilterGroups}>Limpar</button></div>
            </div>}
          </div>
          <div className="database-popover-wrap">
            <button className={`icon-button database-sort ${sortOpen || activeViewSorts.length > 0 ? "selected" : ""}`} type="button" title="Ordenar esta visualização" aria-expanded={sortOpen} onClick={() => { setSortOpen((open) => !open); setFilterOpen(false); setViewSettingsOpen(false); }}>
              <ArrowDownWideNarrow size={16} /><span>Ordenar{activeViewSorts.length ? ` · ${activeViewSorts.length}` : ""}</span>
            </button>
            {sortOpen && <div className="database-sort-popover" role="dialog" aria-label="Ordenação da visualização">
              <div className="database-popover-heading"><strong>Ordenar</strong><span>Critérios do primeiro ao último</span></div>
              {activeViewSorts.length === 0 && <p className="database-sort-empty">Esta visualização ainda não tem ordenações.</p>}
              <div className="database-sort-rules">
                {activeViewSorts.map((sort, index) => <div className="database-sort-rule" key={sort.id}>
                  <span className="database-sort-position">{index + 1}</span>
                  <select value={sort.propertyId} onChange={(event) => updateSort(sort.id, { propertyId: event.target.value })} aria-label={`Propriedade da ordenação ${index + 1}`}>
                    {filterProperties.map((property) => <option key={property.id} value={property.id} disabled={activeViewSorts.some((other) => other.id !== sort.id && other.propertyId === property.id)}>{property.name}</option>)}
                  </select>
                  <select value={sort.direction} onChange={(event) => updateSort(sort.id, { direction: event.target.value as "Ascending" | "Descending" })} aria-label={`Direção da ordenação ${index + 1}`}><option value="Ascending">Crescente</option><option value="Descending">Decrescente</option></select>
                  <button type="button" aria-label={`Mover ordenação ${index + 1} para cima`} title="Mover para cima" disabled={index === 0} onClick={() => moveSort(index, -1)}><ChevronUp size={14} /></button>
                  <button type="button" aria-label={`Mover ordenação ${index + 1} para baixo`} title="Mover para baixo" disabled={index === activeViewSorts.length - 1} onClick={() => moveSort(index, 1)}><ChevronDown size={14} /></button>
                  <button type="button" className="database-filter-remove" aria-label={`Remover ordenação ${index + 1}`} title="Remover ordenação" onClick={() => removeSort(sort.id)}><Trash2 size={13} /></button>
                </div>)}
              </div>
              <div className="database-popover-actions"><button type="button" onClick={addSort} disabled={activeViewSorts.length >= filterProperties.length}><Plus size={13} /> Adicionar ordenação</button><button type="button" onClick={() => updateSorts([])} disabled={activeViewSorts.length === 0}>Limpar</button></div>
            </div>}
          </div>
          <div className="database-popover-wrap">
            <button className={`icon-button database-sort ${viewSettingsOpen ? "selected" : ""}`} type="button" title="Configurações da visualização" aria-expanded={viewSettingsOpen} onClick={() => { setViewSettingsOpen((open) => !open); setFilterOpen(false); setSortOpen(false); setViewCreateOpen(false); }}>
              <Settings2 size={16} /><span>Visualização</span>
            </button>
            {viewSettingsOpen && <div className={`database-view-settings-popover ${view === "Form" ? "database-form-settings" : ""}`} role="dialog" aria-label="Configurações da visualização">
              <div className="database-popover-heading"><strong>Visualização</strong><span>Preferências salvas nesta base</span></div>
              <label>Nome<input value={activeView.name} onChange={(event) => updateActiveView({ name: event.target.value })} aria-label="Nome da visualização atual" /></label>
              <label>Layout<select value={activeView.layout} onChange={(event) => updateActiveView({ layout: event.target.value as ViewKind })} aria-label="Layout atual">{VIEW_LAYOUTS.map((layout) => <option key={layout} value={layout}>{VIEW_LABELS[layout]}</option>)}</select></label>
              {view === "Form" && <>
                <div className="database-form-settings-heading"><strong>Apresentação do formulário</strong><span>Ajustes salvos nesta visualização</span></div>
                <label>Título<input value={activeView.formTitle ?? ""} onChange={(event) => updateActiveView({ formTitle: event.target.value })} placeholder={page.title} aria-label="Título do formulário" /></label>
                <label>Descrição<textarea value={activeView.formDescription ?? ""} onChange={(event) => updateActiveView({ formDescription: event.target.value })} placeholder="Explique o objetivo deste formulário" aria-label="Descrição do formulário" rows={3} /></label>
                <div className="database-form-settings-heading"><strong>Perguntas</strong><span>Marque os campos que deseja perguntar</span></div>
                <div className="database-form-question-settings">
                  {formFields.map((property) => {
                    const question = getFormQuestion(property.id);
                    return <div className="database-form-question-setting" key={property.id}>
                      <label className="database-form-question-toggle"><input type="checkbox" checked={question.enabled} disabled={property.id === "title"} onChange={(event) => updateFormQuestion(property.id, { enabled: event.target.checked })} /><strong>{property.name}</strong></label>
                      <label className="database-form-required-toggle"><input type="checkbox" checked={question.required} disabled={!question.enabled || property.id === "title"} onChange={(event) => updateFormQuestion(property.id, { required: event.target.checked })} />Obrigatória</label>
                      <input value={question.description} onChange={(event) => updateFormQuestion(property.id, { description: event.target.value })} disabled={!question.enabled} placeholder="Ajuda opcional" aria-label={`Descrição da pergunta ${property.name}`} />
                    </div>;
                  })}
                </div>
                <label>Texto do botão<input value={activeView.formSubmitLabel ?? ""} onChange={(event) => updateActiveView({ formSubmitLabel: event.target.value })} placeholder="Enviar resposta" aria-label="Texto do botão de envio" /></label>
                <label>Título de confirmação<input value={activeView.formConfirmationTitle ?? ""} onChange={(event) => updateActiveView({ formConfirmationTitle: event.target.value })} placeholder="Resposta enviada" aria-label="Título da confirmação" /></label>
                <label>Mensagem de confirmação<textarea value={activeView.formConfirmationBody ?? ""} onChange={(event) => updateActiveView({ formConfirmationBody: event.target.value })} placeholder="Sua resposta foi salva nesta base de dados." aria-label="Mensagem de confirmação" rows={2} /></label>
                <p className="database-form-settings-note">As respostas ficam salvas apenas neste navegador.</p>
              </>}
              {view === "Table" && <>
                <label>Agrupar por<select value={activeView.groupPropertyId ?? ""} onChange={(event) => updateActiveView({ groupPropertyId: event.target.value, subGroupPropertyId: event.target.value && event.target.value !== activeView.subGroupPropertyId ? activeView.subGroupPropertyId : "" })} aria-label="Agrupar linhas por"><option value="">Sem agrupamento</option>{filterProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                {activeView.groupPropertyId && <label>Subgrupo por<select value={activeView.subGroupPropertyId ?? ""} onChange={(event) => updateActiveView({ subGroupPropertyId: event.target.value })} aria-label="Subagrupar linhas por"><option value="">Sem subgrupo</option>{filterProperties.filter((property) => property.id !== activeView.groupPropertyId).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
              </>}
              <button className="database-view-delete" type="button" onClick={deleteActiveView} disabled={databaseViews.length <= 1}><Trash2 size={13} /> Excluir visualização</button>
            </div>}
          </div>
          <div className="database-property-wrap">
            <button className={`icon-button database-sort ${propertyManagerOpen ? "selected" : ""}`} type="button" title="Gerenciar propriedades" onClick={() => setPropertyManagerOpen((open) => !open)}>
              <Settings2 size={16} /><span>Propriedades</span>
            </button>
            {propertyManagerOpen && <div className="database-property-popover" role="dialog" aria-label="Gerenciar propriedades">
              <div className="database-property-heading"><strong>Propriedades</strong><span>{properties.length} campos personalizados</span></div>
              <form className="database-property-form" onSubmit={createProperty}>
                <label>Nome<input value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Ex.: Orçamento" aria-label="Nome da propriedade" /></label>
                <label>Tipo<select value={propertyType} onChange={(event) => setPropertyType(event.target.value as DatabasePropertyType)} aria-label="Tipo da propriedade">{PROPERTY_TYPES.map((type) => <option key={type} value={type}>{PROPERTY_TYPE_LABELS[type]}</option>)}</select></label>
                {propertyType === "Formula" && <label>Expressão<textarea value={formulaExpression} onChange={(event) => { setFormulaExpression(event.target.value); setPropertyError(""); }} placeholder={'prop("Estimativa") * 1.1'} aria-label="Expressão da fórmula" rows={3} /><small>Use prop("Nome") para consultar um campo; há funções de texto, matemática e datas.</small></label>}
                {propertyError && <p className="database-property-error" role="alert">{propertyError}</p>}
                {(propertyType === "Select" || propertyType === "Multi-select") && <label>Opções<input value={propertyOptions} onChange={(event) => setPropertyOptions(event.target.value)} placeholder="Alto, Médio, Baixo" aria-label="Opções separadas por vírgula" /></label>}
                {propertyType === "Relation" && <label>Base relacionada<select value={relationDatabaseId} onChange={(event) => setRelationDatabaseId(event.target.value)} aria-label="Base relacionada"><option value="">Escolher base</option>{allPages.filter((candidate) => candidate.kind === "database").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>}
                {propertyType === "Rollup" && (rollupRelationProperties.length === 0
                  ? <p className="database-property-empty">Crie primeiro uma propriedade de relação nesta base.</p>
                  : <>
                    <label>Relação<select value={selectedRollupRelationPropertyId} onChange={(event) => { setRollupRelationPropertyId(event.target.value); setRollupTargetPropertyId("title"); }} aria-label="Relação do rollup">{rollupRelationProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                    <label>Propriedade relacionada<select value={selectedRollupTargetPropertyId} onChange={(event) => setRollupTargetPropertyId(event.target.value)} aria-label="Propriedade relacionada">{rollupTargetProperties.map((property) => <option key={property.id} value={property.id}>{property.name} · {PROPERTY_TYPE_LABELS[property.type]}</option>)}</select></label>
                    <label>Calcular<select value={selectedRollupFunction} onChange={(event) => setRollupFunction(event.target.value as RollupFunction)} aria-label="Cálculo do rollup">{availableRollupFunctions.map((calculation) => <option key={calculation} value={calculation}>{ROLLUP_FUNCTION_LABELS[calculation]}</option>)}</select></label>
                  </>)}
                <button className="database-new-button" type="submit" disabled={(propertyType === "Relation" && !relationDatabaseId) || (propertyType === "Rollup" && (!selectedRollupRelationProperty || !selectedRollupTargetProperty))}><Plus size={14} /> Adicionar propriedade</button>
              </form>
              <div className="database-property-list">
                {properties.length === 0 && <span className="database-property-empty">Nenhuma propriedade personalizada.</span>}
                {properties.map((property) => <div className="database-property-item" key={property.id}>
                  <input value={property.name} onChange={(event) => updateProperty(property.id, { name: event.target.value })} aria-label={`Renomear ${property.name}`} />
                  <small>{PROPERTY_TYPE_LABELS[property.type]}</small>
                  <button type="button" title={`Excluir propriedade ${property.name}`} aria-label={`Excluir propriedade ${property.name}`} onClick={() => removeProperty(property.id)}><Trash2 size={14} /></button>
                  {property.type === "Formula" && <textarea className="database-property-formula-editor" value={property.formulaExpression ?? ""} onChange={(event) => updateProperty(property.id, { formulaExpression: event.target.value })} aria-label={`Expressão da fórmula ${property.name}`} placeholder={'prop("Prioridade") == "High"'} rows={2} />}
                </div>)}
              </div>
            </div>}
          </div>
          <button className="database-new-button" type="button" onClick={() => addRow()}><Plus size={15} /> Novo</button>
        </div>
      </div>

      <div className="database-content">
        {view === "Table" && (
          <div className="database-table-scroll">
            <table className="database-table">
              <thead>
                <tr>
                  <th className="title-column"><span>▤</span> Nome</th>
                  <th><span className="property-dot status-dot" /> Status</th>
                  <th><span className="property-dot priority-dot" /> Prioridade</th>
                  <th><CalendarDays size={13} /> Início</th>
                  <th><CalendarDays size={13} /> Prazo</th>
                  <th><span className="property-dot person-dot" /> Responsável</th>
                  <th><span className="property-dot category-dot" /> Categoria</th>
                  {properties.map((property) => <th key={property.id} title={PROPERTY_TYPE_LABELS[property.type]}><span className="property-dot custom-property-dot" />{property.name}</th>)}
                  <th className="row-actions-heading" />
                </tr>
              </thead>
              <tbody>
                {tableGroups
                  ? tableGroups.flatMap((group) => [
                    <tr className="database-group-row" key={`group-${group.id}`}><td colSpan={tableColSpan}><strong>{group.label}</strong><span>{group.rows.length}</span></td></tr>,
                    ...(group.subgroups
                      ? group.subgroups.flatMap((subgroup) => [
                        <tr className="database-group-row database-subgroup-row" key={`subgroup-${group.id}-${subgroup.id}`}><td colSpan={tableColSpan}><strong>{subgroup.label}</strong><span>{subgroup.rows.length}</span></td></tr>,
                        ...subgroup.rows.map(renderTableRow),
                      ])
                      : group.rows.map(renderTableRow)),
                  ])
                  : visibleRows.map(renderTableRow)}
              </tbody>
            </table>
            {visibleRows.length === 0 && <EmptyRows query={query} onAdd={addRow} />}
            <button className="add-row-inline" type="button" onClick={() => addRow()}><Plus size={14} /> Nova página</button>
          </div>
        )}

        {view === "List" && (
          <div className="database-list">
            {visibleRows.map((row) => <div className="database-list-row" key={row.id}>
              <span className="row-page-icon">▱</span><input className="cell-title" value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} aria-label="Nome da tarefa" />
              <select className={`status-select status-${row.status.toLowerCase().replaceAll(" ", "-")}`} value={row.status} onChange={(event) => updateRow(row.id, { status: event.target.value as TaskStatus })} aria-label="Status da tarefa">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
              <span className={`priority-chip priority-${row.priority.toLowerCase()}`}>{PRIORITY_LABELS[row.priority]}</span>
              <span className="list-date">{formatDate(row.dueDate)}</span>
              {properties.length > 0 && <span className="database-list-properties">{properties.map((property) => <span key={property.id} title={property.name}>{propertyDisplayText(row, property)}</span>)}</span>}
              <button type="button" className="row-delete" aria-label={`Excluir ${row.title}`} onClick={() => removeRow(row.id)}><Trash2 size={14} /></button>
            </div>)}
            {visibleRows.length === 0 && <EmptyRows query={query} onAdd={addRow} />}
            <button className="add-row-inline" type="button" onClick={() => addRow()}><Plus size={14} /> Nova página</button>
          </div>
        )}

        {view === "Gallery" && (
          <div className="gallery-grid">
            {visibleRows.map((row) => <article className="gallery-card" key={row.id}>
              <div className={`gallery-card-cover status-${row.status.toLowerCase().replaceAll(" ", "-")}`}><span>{row.category || "Sem categoria"}</span><span className="gallery-cover-mark">✦</span></div>
              <div className="gallery-card-body">
                <input className="gallery-card-title" value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} aria-label="Nome da página" />
                <div className="gallery-card-properties">
                  <label><span>Status</span><select className={`status-select status-${row.status.toLowerCase().replaceAll(" ", "-")}`} value={row.status} onChange={(event) => updateRow(row.id, { status: event.target.value as TaskStatus })} aria-label="Status da tarefa">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
                  <label><span>Prioridade</span><select className={`priority-select priority-${row.priority.toLowerCase()}`} value={row.priority} onChange={(event) => updateRow(row.id, { priority: event.target.value as Priority })} aria-label="Prioridade da tarefa">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></label>
                  <label><span>Responsável</span><input value={row.assignee} onChange={(event) => updateRow(row.id, { assignee: event.target.value })} placeholder="Atribuir" aria-label="Responsável" /></label>
                  <label><span>Prazo</span><input type="date" value={row.dueDate} onChange={(event) => updateRow(row.id, { dueDate: event.target.value })} aria-label="Prazo" /></label>
                  {properties.map((property) => <label key={property.id}><span>{property.name}</span>{renderPropertyCell(row, property)}</label>)}
                </div>
                <button type="button" className="gallery-delete" onClick={() => removeRow(row.id)}><Trash2 size={13} /> Excluir página</button>
              </div>
            </article>)}
            {visibleRows.length === 0 && <EmptyRows query={query} onAdd={addRow} />}
            <button className="gallery-add-card" type="button" onClick={() => addRow()}><Plus size={16} /> Nova página</button>
          </div>
        )}

        {view === "Board" && (
          <div className="board-columns">
            {STATUS_OPTIONS.map((status) => {
              const statusRows = visibleRows.filter((row) => row.status === status);
              return <section className="board-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedRowId) updateRow(draggedRowId, { status }); setDraggedRowId(null); }}>
                <header><span className={`board-status-dot status-dot-${status.toLowerCase().replaceAll(" ", "-")}`} /> <strong>{STATUS_LABELS[status]}</strong><span className="board-count">{statusRows.length}</span><button type="button" title={`Adicionar em ${STATUS_LABELS[status]}`} onClick={() => addRow(status)}><Plus size={15} /></button></header>
                <div className="board-card-list">
                  {statusRows.map((row) => <article className="board-card" key={row.id} draggable onDragStart={() => setDraggedRowId(row.id)} onDragEnd={() => setDraggedRowId(null)}>
                    <input className="board-card-title" value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} aria-label="Nome da tarefa" />
                    {row.category && <span className="board-category">{row.category}</span>}
                    {properties.some((property) => propertyDisplayText(row, property) !== "") && <div className="board-custom-properties">{properties.map((property) => {
                      const text = propertyDisplayText(row, property);
                      return text ? <span className="property-value-chip" key={property.id} title={property.name}>{property.name}: {text}</span> : null;
                    })}</div>}
                    <div className="board-card-footer"><select className={`priority-select priority-${row.priority.toLowerCase()}`} value={row.priority} onChange={(event) => updateRow(row.id, { priority: event.target.value as Priority })} aria-label="Prioridade da tarefa">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select><span>{row.dueDate ? formatDate(row.dueDate) : ""}</span></div>
                  </article>)}
                  <button className="board-add-card" type="button" onClick={() => addRow(status)}><Plus size={14} /> Novo</button>
                </div>
              </section>;
            })}
          </div>
        )}

        {view === "Chart" && (
          <div className="database-chart-view">
            <div className="database-chart-toolbar">
              <label>Agrupar por<select value={selectedChartGroupBy} onChange={(event) => setChartGroupBy(event.target.value)}>{chartGroupOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              <div className="database-chart-switch" role="group" aria-label="Tipo de gráfico">
                <button className={chartStyle === "Bar" ? "selected" : ""} type="button" onClick={() => setChartStyle("Bar")}>Barras</button>
                <button className={chartStyle === "Donut" ? "selected" : ""} type="button" onClick={() => setChartStyle("Donut")}>Rosca</button>
              </div>
            </div>
            {chartData.length === 0 ? <EmptyRows query={query} onAdd={addRow} /> : chartStyle === "Bar" ? (
              <div className="database-bar-chart" role="img" aria-label={`Gráfico de barras agrupado por ${chartGroupOptions.find((option) => option.id === selectedChartGroupBy)?.name ?? "propriedade"}`}>
                {chartData.map((item, index) => <div className="database-bar-chart-row" key={item.label}>
                  <span className="database-bar-chart-label" title={item.label}>{item.label}</span>
                  <div className="database-bar-track"><span style={{ width: `${item.count / chartMax * 100}%`, background: chartColors[index % chartColors.length] }} /></div>
                  <strong>{item.count}</strong>
                </div>)}
                <p>{chartTotal} {chartTotal === 1 ? "registro" : "registros"} · {visibleRows.length} páginas visíveis</p>
              </div>
            ) : (
              <div className="database-donut-layout">
                <div className="database-donut" style={{ background: chartGradient }} role="img" aria-label={`Gráfico de rosca com ${chartTotal} registros`}><span><strong>{chartTotal}</strong><small>registros</small></span></div>
                <div className="database-chart-legend">{chartData.map((item, index) => <div key={item.label}><i style={{ background: chartColors[index % chartColors.length] }} /><span title={item.label}>{item.label}</span><strong>{item.count}</strong></div>)}</div>
              </div>
            )}
          </div>
        )}

        {view === "Calendar" && (
          <div className="calendar-view">
            <div className="calendar-heading"><h3>{monthLabel}</h3><div><button type="button" aria-label="Mês anterior" onClick={() => setCalendarMonth((date) => getCalendarMonth(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setCalendarMonth(new Date())}>Hoje</button><button type="button" aria-label="Próximo mês" onClick={() => setCalendarMonth((date) => getCalendarMonth(date, 1))}><ChevronRight size={17} /></button></div></div>
            <div className="calendar-grid">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
              {calendarDates.map((date) => {
                const dateKey = toDateInputValue(date);
                const items = visibleRows.filter((row) => row.dueDate === dateKey);
                const outsideMonth = date.getMonth() !== calendarMonth.getMonth();
                return <div className={`calendar-cell ${outsideMonth ? "outside-month" : ""}`} key={dateKey}>
                  <span className={date.toDateString() === new Date().toDateString() ? "calendar-today" : ""}>{date.getDate()}</span>
                  {items.slice(0, 3).map((row) => <button key={row.id} type="button" className={`calendar-item status-${row.status.toLowerCase().replaceAll(" ", "-")}`} onClick={() => setQuery(row.title)} title={`${row.title} · ${row.status}`}>{row.title}</button>)}
                  {items.length > 3 && <small>+{items.length - 3} mais</small>}
                </div>;
              })}
            </div>
          </div>
        )}

        {view === "Timeline" && (
          <div className="timeline-view">
            <div className="calendar-heading"><h3>{monthLabel}</h3><div><button type="button" aria-label="Mês anterior" onClick={() => setCalendarMonth((date) => getCalendarMonth(date, -1))}><ChevronLeft size={17} /></button><button type="button" onClick={() => setCalendarMonth(new Date())}>Hoje</button><button type="button" aria-label="Próximo mês" onClick={() => setCalendarMonth((date) => getCalendarMonth(date, 1))}><ChevronRight size={17} /></button></div></div>
            <div className="timeline-scroll">
              <div className="timeline-grid" style={{ gridTemplateColumns: timelineColumns }}>
                <div className="timeline-axis-title">Página</div>
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1);
                  const isToday = date.toDateString() === new Date().toDateString();
                  return <div className={`timeline-day-header ${isToday ? "timeline-today" : ""}`} key={index}><small>{date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</small><strong>{index + 1}</strong></div>;
                })}
                {visibleRows.map((row) => {
                  const startValue = row.startDate || row.dueDate;
                  const endValue = row.dueDate || row.startDate;
                  let startDate = startValue ? new Date(`${startValue}T12:00:00`) : null;
                  let endDate = endValue ? new Date(`${endValue}T12:00:00`) : null;
                  if (startDate && endDate && startDate > endDate) [startDate, endDate] = [endDate, startDate];
                  const intersects = !!startDate && !!endDate && startDate <= monthEnd && endDate >= monthStart;
                  const visibleStart = intersects && startDate ? (startDate < monthStart ? monthStart : startDate) : null;
                  const visibleEnd = intersects && endDate ? (endDate > monthEnd ? monthEnd : endDate) : null;
                  const firstDay = visibleStart?.getDate() ?? 0;
                  const span = visibleStart && visibleEnd ? Math.max(1, Math.round((visibleEnd.getTime() - visibleStart.getTime()) / 86400000) + 1) : 1;
                  return <div className="timeline-row" key={row.id} style={{ gridTemplateColumns: timelineColumns, gridColumn: "1 / -1" }}>
                    <button className="timeline-row-title" type="button" onClick={() => setQuery(row.title)} title="Buscar esta página nesta visualização">{row.title || "Sem título"}</button>
                    {Array.from({ length: daysInMonth }, (_, index) => <span className={`timeline-day-cell ${((index + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay()) % 7 === 0 || (index + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay()) % 7 === 6) ? "timeline-weekend" : ""}`} style={{ gridColumn: index + 2 }} key={index} />)}
                    {intersects && <button className={`timeline-bar status-${row.status.toLowerCase().replaceAll(" ", "-")}`} style={{ gridColumn: `${firstDay + 1} / span ${span}`, gridRow: 1 }} type="button" onClick={() => setQuery(row.title)} title={`${row.title}: ${formatDate(startValue ?? "")} – ${formatDate(endValue ?? "")}`}>{row.title}</button>}
                  </div>;
                })}
              </div>
            </div>
            <p className="timeline-hint">Edite as datas de início e prazo na visualização Tabela. Itens sem datas não aparecem como barras.</p>
          </div>
        )}

        {view === "Form" && (
          <div className="database-form-view">
            {formSubmitted ? <div className="database-form-success" role="status">
              <div className="database-form-success-icon">✓</div>
              <h3>{activeView.formConfirmationTitle?.trim() || "Resposta enviada"}</h3>
              <p>{activeView.formConfirmationBody?.trim() || "Sua resposta foi salva nesta base de dados."}</p>
              <button className="database-new-button" type="button" onClick={() => { setFormSubmitted(false); setFormValues({}); }}>Enviar outra resposta</button>
            </div> : <form className="database-form" onSubmit={submitForm} noValidate>
              <header className="database-form-header">
                <ClipboardList size={21} />
                <h2>{activeView.formTitle?.trim() || page.title}</h2>
                {(activeView.formDescription ?? "").trim() && <p>{activeView.formDescription}</p>}
              </header>
              {formFields.filter((property) => getFormQuestion(property.id).enabled).map((property) => {
                const question = getFormQuestion(property.id);
                return <div className="database-form-field" key={property.id}>
                  <div className="database-form-label">{property.name}{question.required && <span aria-label="Obrigatória"> *</span>}</div>
                  {question.description.trim() && <p className="database-form-help">{question.description}</p>}
                  {renderFormInput(property)}
                </div>;
              })}
              {formError && <p className="database-form-error" role="alert">{formError}</p>}
              <button className="database-form-submit" type="submit">{activeView.formSubmitLabel?.trim() || "Enviar resposta"}</button>
              <p className="database-form-local-note">A resposta será armazenada neste navegador.</p>
            </form>}
          </div>
        )}
      </div>
      <div className="database-footer"><span>{visibleRows.length} {visibleRows.length === 1 ? "página" : "páginas"}</span><span>·</span><button type="button" onClick={() => { setQuery(""); updateActiveView({ filters: [], filterGroups: [], filterMatch: "AND", sorts: [], sortPropertyId: "", sortDirection: "Ascending" }); }}>Limpar filtros e ordenação</button></div>
    </section>
  );
}

function EmptyRows({ query, onAdd }: { query: string; onAdd: () => void }) {
  return <div className="database-empty"><div className="empty-icon"><Table2 size={19} /></div><strong>{query ? "Nenhuma página encontrada" : "Esta base de dados está vazia"}</strong><p>{query ? "Tente outra busca ou limpe o filtro." : "Adicione uma página para começar."}</p>{!query && <button className="database-new-button" type="button" onClick={onAdd}><Plus size={15} /> Nova página</button>}</div>;
}
