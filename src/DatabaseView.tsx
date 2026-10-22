import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  GanttChart,
  LayoutGrid,
  List,
  Plus,
  Search,
  Table2,
  Trash2,
  Columns3,
} from "lucide-react";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, makeId } from "./model";
import type { DatabaseRow, Page, Priority, TaskStatus } from "./model";

type ViewKind = "Table" | "Board" | "List" | "Calendar" | "Gallery" | "Timeline";

const STATUS_LABELS: Record<TaskStatus, string> = { "Not started": "Não iniciada", "In progress": "Em andamento", Done: "Concluída" };
const PRIORITY_LABELS: Record<Priority, string> = { Low: "Baixa", Medium: "Média", High: "Alta" };
const VIEW_LABELS: Record<ViewKind, string> = { Table: "Tabela", Board: "Quadro", List: "Lista", Calendar: "Calendário", Gallery: "Galeria", Timeline: "Linha do tempo" };

interface DatabaseViewProps {
  page: Page;
  onUpdateRows: (rows: DatabaseRow[]) => void;
}

function formatDate(value: string): string {
  if (!value) return "Sem data";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function getCalendarMonth(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function DatabaseView({ page, onUpdateRows }: DatabaseViewProps) {
  const [view, setView] = useState<ViewKind>("Table");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "Todos">("Todos");
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const rows = page.rows ?? [];

  const visibleRows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const result = rows.filter((row) => {
      const matchesText = !text || [row.title, row.assignee, row.category, row.priority, row.status].some((value) => value.toLowerCase().includes(text));
      const matchesStatus = statusFilter === "Todos" || row.status === statusFilter;
      return matchesText && matchesStatus;
    });
    if (sortByDueDate) result.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return result;
  }, [rows, query, statusFilter, sortByDueDate]);

  const updateRow = (id: string, update: Partial<DatabaseRow>) => {
    onUpdateRows(rows.map((row) => (row.id === id ? { ...row, ...update } : row)));
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

  return (
    <section className="database-view" aria-label={`${page.title} database`}>
      <div className="database-toolbar">
        <div className="database-tabs" role="tablist" aria-label="Visualizações da base de dados">
          {(["Table", "Board", "List", "Calendar", "Gallery", "Timeline"] as ViewKind[]).map((kind) => {
            const Icon = kind === "Table" ? Table2 : kind === "Board" ? Columns3 : kind === "List" ? List : kind === "Calendar" ? CalendarDays : kind === "Gallery" ? LayoutGrid : GanttChart;
            return (
              <button key={kind} role="tab" aria-selected={view === kind} className={`database-tab ${view === kind ? "active" : ""}`} onClick={() => setView(kind)} type="button">
                <Icon size={15} /> {VIEW_LABELS[kind]}
              </button>
            );
          })}
          <button className="database-add-view" type="button" title="Adicionar visualização" onClick={() => setView("Board")}><Plus size={15} /></button>
        </div>
        <div className="database-actions">
          <label className="database-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar na base de dados" aria-label="Buscar na base de dados" />
          </label>
          <label className="database-filter">
            <Filter size={15} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "Todos")} aria-label="Filtrar por status">
              <option value="Todos">Todos os status</option>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <button className={`icon-button database-sort ${sortByDueDate ? "selected" : ""}`} type="button" title="Ordenar por prazo" onClick={() => setSortByDueDate((value) => !value)}>
            <ArrowDownWideNarrow size={16} /><span>Ordenar</span>
          </button>
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
                  <th className="row-actions-heading" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td className="title-column"><span className="row-page-icon">▱</span><input data-row-title={row.id} className="cell-title" value={row.title} onChange={(event) => updateRow(row.id, { title: event.target.value })} aria-label="Nome da tarefa" /></td>
                    <td><select className={`status-select status-${row.status.toLowerCase().replaceAll(" ", "-")}`} value={row.status} onChange={(event) => updateRow(row.id, { status: event.target.value as TaskStatus })} aria-label="Status da tarefa">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></td>
                    <td><select className={`priority-select priority-${row.priority.toLowerCase()}`} value={row.priority} onChange={(event) => updateRow(row.id, { priority: event.target.value as Priority })} aria-label="Prioridade da tarefa">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></td>
                    <td><input className="cell-date" type="date" value={row.startDate ?? ""} onChange={(event) => updateRow(row.id, { startDate: event.target.value })} aria-label="Data de início" /></td>
                    <td><input className="cell-date" type="date" value={row.dueDate} onChange={(event) => updateRow(row.id, { dueDate: event.target.value })} aria-label="Prazo" /></td>
                    <td><input className="cell-text" value={row.assignee} onChange={(event) => updateRow(row.id, { assignee: event.target.value })} placeholder="Atribuir" aria-label="Responsável" /></td>
                    <td><input className="cell-text" value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })} placeholder="Adicionar categoria" aria-label="Categoria" /></td>
                    <td className="row-actions"><button type="button" title="Excluir linha" aria-label={`Excluir ${row.title}`} onClick={() => removeRow(row.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
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
                    <div className="board-card-footer"><select className={`priority-select priority-${row.priority.toLowerCase()}`} value={row.priority} onChange={(event) => updateRow(row.id, { priority: event.target.value as Priority })} aria-label="Prioridade da tarefa">{PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select><span>{row.dueDate ? formatDate(row.dueDate) : ""}</span></div>
                  </article>)}
                  <button className="board-add-card" type="button" onClick={() => addRow(status)}><Plus size={14} /> Novo</button>
                </div>
              </section>;
            })}
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
                  {items.slice(0, 3).map((row) => <button key={row.id} type="button" className={`calendar-item status-${row.status.toLowerCase().replaceAll(" ", "-")}`} onClick={() => { setView("Table"); setQuery(row.title); }} title={`${row.title} · ${row.status}`}>{row.title}</button>)}
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
                    <button className="timeline-row-title" type="button" onClick={() => { setView("Table"); setQuery(row.title); }} title="Abrir esta página na tabela">{row.title || "Sem título"}</button>
                    {Array.from({ length: daysInMonth }, (_, index) => <span className={`timeline-day-cell ${((index + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay()) % 7 === 0 || (index + new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay()) % 7 === 6) ? "timeline-weekend" : ""}`} style={{ gridColumn: index + 2 }} key={index} />)}
                    {intersects && <button className={`timeline-bar status-${row.status.toLowerCase().replaceAll(" ", "-")}`} style={{ gridColumn: `${firstDay + 1} / span ${span}`, gridRow: 1 }} type="button" onClick={() => { setView("Table"); setQuery(row.title); }} title={`${row.title}: ${formatDate(startValue ?? "")} – ${formatDate(endValue ?? "")}`}>{row.title}</button>}
                  </div>;
                })}
              </div>
            </div>
            <p className="timeline-hint">Edite as datas de início e prazo na visualização Tabela. Itens sem datas não aparecem como barras.</p>
          </div>
        )}
      </div>
      <div className="database-footer"><span>{visibleRows.length} {visibleRows.length === 1 ? "página" : "páginas"}</span><span>·</span><button type="button" onClick={() => { setQuery(""); setStatusFilter("Todos"); setSortByDueDate(false); }}>Limpar filtros</button></div>
    </section>
  );
}

function EmptyRows({ query, onAdd }: { query: string; onAdd: () => void }) {
  return <div className="database-empty"><div className="empty-icon"><Table2 size={19} /></div><strong>{query ? "Nenhuma página encontrada" : "Esta base de dados está vazia"}</strong><p>{query ? "Tente outra busca ou limpe o filtro." : "Adicione uma página para começar."}</p>{!query && <button className="database-new-button" type="button" onClick={onAdd}><Plus size={15} /> Nova página</button>}</div>;
}
