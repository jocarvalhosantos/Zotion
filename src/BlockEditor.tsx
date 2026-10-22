import { useState } from "react";
import type { ClipboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { makeId } from "./model";
import type { ContentBlock, BlockType } from "./model";

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}

interface BlockCommand {
  label: string;
  shortcut: string;
  description: string;
  type: BlockType;
}

const COMMANDS: BlockCommand[] = [
  { label: "Texto", shortcut: "text", description: "Comece a escrever livremente.", type: "paragraph" },
  { label: "Título 1", shortcut: "h1", description: "Título de seção grande.", type: "heading1" },
  { label: "Título 2", shortcut: "h2", description: "Título de seção médio.", type: "heading2" },
  { label: "Título 3", shortcut: "h3", description: "Título de seção pequeno.", type: "heading3" },
  { label: "Lista com marcadores", shortcut: "bullet", description: "Crie uma lista com marcadores.", type: "bulleted" },
  { label: "Lista numerada", shortcut: "numbered", description: "Crie uma lista numerada.", type: "numbered" },
  { label: "Lista de tarefas", shortcut: "todo", description: "Acompanhe uma tarefa com uma caixa de seleção.", type: "todo" },
  { label: "Citação", shortcut: "quote", description: "Adicione uma citação ou destaque.", type: "quote" },
  { label: "Destaque", shortcut: "callout", description: "Realce uma anotação útil.", type: "callout" },
  { label: "Código", shortcut: "code", description: "Adicione um bloco de código.", type: "code" },
  { label: "Divisor", shortcut: "divider", description: "Separe seções com uma linha.", type: "divider" },
];

const richBlockClipboard = new Map<string, ContentBlock[]>();

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function markdownShortcutType(text: string): BlockType | undefined {
  if (text === "### ") return "heading3";
  if (text === "## ") return "heading2";
  if (text === "# ") return "heading1";
  if (["- ", "* ", "+ "].includes(text)) return "bulleted";
  if (text === "1. ") return "numbered";
  if (text === "[]" || text === "[] ") return "todo";
  if (text === '" ') return "quote";
  if (text === "---") return "divider";
  return undefined;
}

function moveBlock(blocks: ContentBlock[], index: number, step: -1 | 1): ContentBlock[] {
  const nextIndex = index + step;
  if (nextIndex < 0 || nextIndex >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function moveSelectedBlocks(blocks: ContentBlock[], selectedIds: string[], step: -1 | 1): ContentBlock[] {
  const selected = new Set(selectedIds);
  const next = [...blocks];
  if (step === -1) {
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
      }
    }
  } else {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
  }
  return next;
}

export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [slashBlockId, setSlashBlockId] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [menuBlockId, setMenuBlockId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [selectionCursorId, setSelectionCursorId] = useState<string | null>(null);
  const selectedBlockSet = new Set(selectedBlockIds);

  const clearSelection = () => {
    setSelectedBlockIds([]);
    setSelectionAnchorId(null);
    setSelectionCursorId(null);
  };

  const selectRange = (anchorId: string, targetId: string) => {
    const anchorIndex = blocks.findIndex((block) => block.id === anchorId);
    const targetIndex = blocks.findIndex((block) => block.id === targetId);
    if (anchorIndex < 0 || targetIndex < 0) {
      setSelectedBlockIds([targetId]);
      setSelectionAnchorId(targetId);
      setSelectionCursorId(targetId);
      return;
    }
    const first = Math.min(anchorIndex, targetIndex);
    const last = Math.max(anchorIndex, targetIndex);
    setSelectedBlockIds(blocks.slice(first, last + 1).map((block) => block.id));
    setSelectionAnchorId(anchorId);
    setSelectionCursorId(targetId);
  };

  const getSelectedBlocks = () => blocks.filter((block) => selectedBlockSet.has(block.id));

  const updateBlock = (id: string, update: Partial<ContentBlock>) => {
    onChange(blocks.map((block) => (block.id === id ? { ...block, ...update } : block)));
  };

  const focusBlock = (id: string, cursor?: number) => {
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(`[data-block-id="${id}"]`);
      input?.focus();
      if (cursor !== undefined) input?.setSelectionRange(cursor, cursor);
    });
  };

  const applyCommand = (blockId: string, command: BlockCommand) => {
    updateBlock(blockId, { type: command.type, text: "", checked: false });
    setSlashBlockId(null);
    setSlashIndex(0);
    setMenuBlockId(null);
    focusBlock(blockId, 0);
  };

  const insertAfter = (index: number, text = "", type: BlockType = "paragraph") => {
    const block: ContentBlock = { id: makeId("block"), type, text, checked: false };
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    onChange(next);
    setSlashBlockId(null);
    focusBlock(block.id, 0);
  };

  const deleteBlock = (index: number) => {
    if (blocks.length === 1) {
      updateBlock(blocks[0].id, { type: "paragraph", text: "", checked: false });
      setMenuBlockId(null);
      focusBlock(blocks[0].id, 0);
      return;
    }
    const next = blocks.filter((_, itemIndex) => itemIndex !== index);
    onChange(next);
    setMenuBlockId(null);
    focusBlock(next[Math.max(0, index - 1)].id);
  };

  const duplicateBlock = (index: number) => {
    const original = blocks[index];
    const duplicate = { ...original, id: makeId("block") };
    const next = [...blocks];
    next.splice(index + 1, 0, duplicate);
    onChange(next);
    setMenuBlockId(null);
    focusBlock(duplicate.id);
  };

  const rememberCopiedBlocks = (copiedBlocks: ContentBlock[]) => {
    const copyId = makeId("copy");
    richBlockClipboard.set(copyId, copiedBlocks.map((block) => ({ ...block })));
    if (richBlockClipboard.size > 50) {
      const oldestCopyId = richBlockClipboard.keys().next().value;
      if (oldestCopyId) richBlockClipboard.delete(oldestCopyId);
    }
    return copyId;
  };

  const clipboardHtml = (copyId: string, copiedBlocks: ContentBlock[]) =>
    `${copiedBlocks.map((block) => `<p>${escapeHtml(block.text).replaceAll("\n", "<br>")}</p>`).join("")}<!-- workspace-lab:${copyId} -->`;

  const setRichClipboardData = (clipboardData: DataTransfer, copiedBlocks: ContentBlock[]) => {
    const copyId = rememberCopiedBlocks(copiedBlocks);
    clipboardData.setData("text/plain", copiedBlocks.map((block) => block.text).join("\n"));
    clipboardData.setData("text/html", clipboardHtml(copyId, copiedBlocks));
  };

  const copyBlocks = async (copiedBlocks: ContentBlock[]) => {
    if (!copiedBlocks.length) return;
    const copyId = rememberCopiedBlocks(copiedBlocks);
    const text = copiedBlocks.map((block) => block.text).join("\n");
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Rich clipboard unavailable");
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([clipboardHtml(copyId, copiedBlocks)], { type: "text/html" }),
      })]);
      setCopyNotice(copiedBlocks.length === 1
        ? "Bloco copiado. Ao colar nesta sessão, o tipo e o conteúdo serão preservados."
        : `${copiedBlocks.length} blocos copiados. Ao colar nesta sessão, os tipos e conteúdos serão preservados.`);
    } catch {
      richBlockClipboard.delete(copyId);
      try {
        await navigator.clipboard.writeText(text);
        setCopyNotice("Texto copiado. A estrutura dos blocos não foi incluída pelo navegador.");
      } catch {
        setCopyNotice("Não foi possível copiar. Verifique a permissão de área de transferência do navegador.");
      }
    }
    setMenuBlockId(null);
    window.setTimeout(() => setCopyNotice(""), 4500);
  };

  const copyBlock = async (block: ContentBlock) => copyBlocks([block]);

  const duplicateSelectedBlocks = () => {
    const selected = getSelectedBlocks();
    if (!selected.length) return;
    const lastSelectedIndex = blocks.reduce((last, block, index) => selectedBlockSet.has(block.id) ? index : last, -1);
    const duplicates = selected.map((block) => ({ ...block, id: makeId("block") }));
    const next = [...blocks];
    next.splice(lastSelectedIndex + 1, 0, ...duplicates);
    onChange(next);
    setSelectedBlockIds(duplicates.map((block) => block.id));
    setSelectionAnchorId(duplicates[0].id);
    setSelectionCursorId(duplicates.at(-1)!.id);
    setMenuBlockId(null);
    focusBlock(duplicates[0].id);
  };

  const deleteSelectedBlocks = () => {
    const selected = getSelectedBlocks();
    if (!selected.length) return;
    const firstSelectedIndex = blocks.findIndex((block) => selectedBlockSet.has(block.id));
    let next = blocks.filter((block) => !selectedBlockSet.has(block.id));
    if (!next.length) next = [{ id: makeId("block"), type: "paragraph", text: "" }];
    onChange(next);
    clearSelection();
    setMenuBlockId(null);
    focusBlock(next[Math.min(firstSelectedIndex, next.length - 1)].id, 0);
  };

  const moveSelection = (step: -1 | 1) => {
    if (!selectedBlockIds.length) return;
    onChange(moveSelectedBlocks(blocks, selectedBlockIds, step));
  };

  const handleBlockMouseDown = (event: ReactMouseEvent<HTMLDivElement>, blockId: string) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    setSlashBlockId(null);
    setMenuBlockId(null);
    if (event.altKey || event.metaKey) {
      const next = selectedBlockSet.has(blockId)
        ? selectedBlockIds.filter((id) => id !== blockId)
        : [...selectedBlockIds, blockId];
      const order = new Map(blocks.map((block, index) => [block.id, index]));
      setSelectedBlockIds(next.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
      setSelectionAnchorId(blockId);
      setSelectionCursorId(blockId);
    } else {
      selectRange(selectionAnchorId ?? blockId, blockId);
    }
    focusBlock(blockId);
  };

  const pasteBlock = (event: ClipboardEvent<HTMLTextAreaElement>, block: ContentBlock, index: number) => {
    const html = event.clipboardData.getData("text/html");
    const copyId = html.match(/<!--\s*workspace-lab:(copy-[a-f0-9-]+)\s*-->/i)?.[1];
    const copiedBlocks = copyId ? richBlockClipboard.get(copyId) : undefined;
    if (!copiedBlocks?.length) return;

    event.preventDefault();
    const input = event.currentTarget;
    const head = block.text.slice(0, input.selectionStart);
    const tail = block.text.slice(input.selectionEnd);
    const replacements: ContentBlock[] = [];
    if (head) replacements.push({ ...block, text: head });
    const pasted = copiedBlocks.map((copied) => ({ ...copied, id: makeId("block") }));
    replacements.push(...pasted);
    if (tail) replacements.push({ ...block, id: makeId("block"), text: tail });

    const next = [...blocks];
    next.splice(index, 1, ...replacements);
    onChange(next);
    setMenuBlockId(null);
    focusBlock((tail ? replacements.at(-1) : pasted.at(-1))!.id, 0);
  };

  const onTextChange = (block: ContentBlock, text: string, input: HTMLTextAreaElement) => {
    const shortcutType = block.type === "paragraph" && markdownShortcutType(text);
    if (shortcutType) {
      updateBlock(block.id, { type: shortcutType, text: "", checked: false });
      setSlashBlockId(null);
      setMenuBlockId(null);
      return;
    }
    updateBlock(block.id, { text });
    input.style.height = "auto";
    input.style.height = `${Math.max(26, input.scrollHeight)}px`;
    if (text.startsWith("/") && text.split("\n").length === 1) {
      setSlashBlockId(block.id);
      setSlashIndex(0);
    } else if (slashBlockId === block.id) {
      setSlashBlockId(null);
    }
  };

  const selectedContentBlocks = getSelectedBlocks();

  return (
    <div className="block-editor" onClick={() => setMenuBlockId(null)}>
      {selectedContentBlocks.length > 0 && (
        <div className="block-selection-toolbar" role="toolbar" aria-label="Ações dos blocos selecionados" onClick={(event) => event.stopPropagation()}>
          <strong>{selectedContentBlocks.length} {selectedContentBlocks.length === 1 ? "bloco selecionado" : "blocos selecionados"}</strong>
          <button type="button" aria-label="Copiar seleção" onClick={() => void copyBlocks(selectedContentBlocks)}><Copy size={14} /> Copiar</button>
          <button type="button" aria-label="Duplicar seleção" onClick={duplicateSelectedBlocks}><Copy size={14} /> Duplicar</button>
          <button type="button" aria-label="Mover seleção para cima" onClick={() => moveSelection(-1)}><ArrowUp size={14} /> Para cima</button>
          <button type="button" aria-label="Mover seleção para baixo" onClick={() => moveSelection(1)}><ArrowDown size={14} /> Para baixo</button>
          <button className="selection-danger-action" type="button" aria-label="Excluir seleção" onClick={deleteSelectedBlocks}><Trash2 size={14} /> Excluir</button>
          <button className="selection-clear-action" type="button" aria-label="Limpar seleção" onClick={clearSelection}><X size={14} /></button>
          <span>Shift + clique seleciona um intervalo · Ctrl + D duplica · Delete exclui</span>
        </div>
      )}
      {blocks.map((block, index) => {
        const query = block.text.startsWith("/") ? block.text.slice(1).toLowerCase().trim() : "";
        const matches = query
          ? COMMANDS.filter((command) => `${command.label} ${command.shortcut}`.toLowerCase().includes(query))
          : COMMANDS;
        const showSlashMenu = slashBlockId === block.id && matches.length > 0;

        return (
          <div
            className={`block-row block-${block.type} ${selectedBlockSet.has(block.id) ? "is-block-selected" : ""}`}
            key={block.id}
            aria-selected={selectedBlockSet.has(block.id)}
            onMouseDown={(event) => handleBlockMouseDown(event, block.id)}
            onClick={(event) => {
              if (event.shiftKey) return;
              setSelectionAnchorId(block.id);
              setSelectionCursorId(block.id);
              if (!selectedBlockSet.has(block.id)) setSelectedBlockIds([]);
            }}
          >
            <div className="block-gutter">
              <button className="block-handle" type="button" aria-label="Ações do bloco" onClick={(event) => { event.stopPropagation(); setMenuBlockId(menuBlockId === block.id ? null : block.id); }}>
                <GripVertical size={15} />
              </button>
              {menuBlockId === block.id && (
                <div className="block-menu" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => void copyBlock(block)}><Copy size={14} /> Copiar bloco</button>
                  <button type="button" onClick={() => duplicateBlock(index)}><Copy size={14} /> Duplicar</button>
                  <button type="button" onClick={() => { onChange(moveBlock(blocks, index, -1)); setMenuBlockId(null); }} disabled={index === 0}><ArrowUp size={14} /> Mover para cima</button>
                  <button type="button" onClick={() => { onChange(moveBlock(blocks, index, 1)); setMenuBlockId(null); }} disabled={index === blocks.length - 1}><ArrowDown size={14} /> Mover para baixo</button>
                  <button className="danger-action" type="button" onClick={() => deleteBlock(index)}><Trash2 size={14} /> Excluir</button>
                </div>
              )}
            </div>

            {block.type === "divider" ? (
              <button className="divider-block" type="button" aria-label="Divisor. Pressione Enter para adicionar um bloco abaixo." onClick={() => insertAfter(index)}><span /></button>
            ) : (
              <div className="block-content-wrap">
                {block.type === "todo" && (
                  <button
                    className={`todo-checkbox ${block.checked ? "is-checked" : ""}`}
                    type="button"
                    aria-label={block.checked ? "Marcar tarefa como pendente" : "Marcar tarefa como concluída"}
                    onClick={() => updateBlock(block.id, { checked: !block.checked })}
                  >
                    {block.checked && <span>✓</span>}
                  </button>
                )}
                {block.type === "bulleted" && <span className="list-marker bullet-marker" aria-hidden="true">•</span>}
                {block.type === "numbered" && <span className="list-marker number-marker" aria-hidden="true">{index + 1}.</span>}
                {block.type === "callout" && <span className="callout-marker" aria-hidden="true">✦</span>}
                <textarea
                  className="block-input"
                  data-block-id={block.id}
                  aria-label={`Bloco ${block.type.replace("heading", "título ")}`}
                  rows={Math.max(1, block.text.split("\n").length)}
                  value={block.text}
                  spellCheck
                  placeholder={block.type === "paragraph" ? "Digite '/' para ver os comandos..." : ""}
                  onFocus={() => setMenuBlockId(null)}
                  onChange={(event) => {
                    onTextChange(block, event.target.value, event.target);
                    if (selectedBlockSet.has(block.id)) clearSelection();
                  }}
                  onCopy={(event) => {
                    if (!selectedBlockSet.has(block.id) || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;
                    const copied = getSelectedBlocks();
                    if (!copied.length) return;
                    try {
                      setRichClipboardData(event.clipboardData, copied);
                      event.preventDefault();
                      setCopyNotice(`${copied.length} ${copied.length === 1 ? "bloco copiado" : "blocos copiados"}.`);
                    } catch {
                      return;
                    }
                  }}
                  onCut={(event) => {
                    if (!selectedBlockSet.has(block.id) || event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) return;
                    const copied = getSelectedBlocks();
                    if (!copied.length) return;
                    try {
                      setRichClipboardData(event.clipboardData, copied);
                      event.preventDefault();
                      deleteSelectedBlocks();
                    } catch {
                      return;
                    }
                  }}
                  onPaste={(event) => pasteBlock(event, block, index)}
                  onKeyDown={(event) => {
                    if (showSlashMenu && event.key === "Escape") {
                      setSlashBlockId(null);
                      return;
                    }
                    if (showSlashMenu && event.key === "ArrowDown") {
                      event.preventDefault();
                      setSlashIndex((value) => Math.min(value + 1, matches.length - 1));
                      return;
                    }
                    if (showSlashMenu && event.key === "ArrowUp") {
                      event.preventDefault();
                      setSlashIndex((value) => Math.max(value - 1, 0));
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      if (selectedBlockIds.length > 0) {
                        clearSelection();
                      } else {
                        setSelectedBlockIds([block.id]);
                        setSelectionAnchorId(block.id);
                        setSelectionCursorId(block.id);
                      }
                      return;
                    }
                    const hasCommandModifier = event.ctrlKey || event.metaKey;
                    if (hasCommandModifier && event.key.toLowerCase() === "a" && !selectedBlockSet.has(block.id)) {
                      event.preventDefault();
                      setSelectedBlockIds([block.id]);
                      setSelectionAnchorId(block.id);
                      setSelectionCursorId(block.id);
                      return;
                    }
                    if (hasCommandModifier && event.key.toLowerCase() === "d" && selectedBlockSet.has(block.id)) {
                      event.preventDefault();
                      duplicateSelectedBlocks();
                      return;
                    }
                    if (hasCommandModifier && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && selectedBlockSet.has(block.id)) {
                      event.preventDefault();
                      moveSelection(event.key === "ArrowUp" ? -1 : 1);
                      return;
                    }
                    if (event.shiftKey && !hasCommandModifier && (event.key === "ArrowUp" || event.key === "ArrowDown") && selectedBlockSet.has(block.id)) {
                      const currentIndex = blocks.findIndex((item) => item.id === (selectionCursorId ?? block.id));
                      const targetIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
                      if (targetIndex >= 0 && targetIndex < blocks.length) {
                        event.preventDefault();
                        selectRange(selectionAnchorId ?? block.id, blocks[targetIndex].id);
                        focusBlock(blocks[targetIndex].id);
                      }
                      return;
                    }
                    if (!hasCommandModifier && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && selectedBlockSet.has(block.id)) {
                      const currentIndex = blocks.findIndex((item) => item.id === block.id);
                      const targetIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
                      if (targetIndex >= 0 && targetIndex < blocks.length) {
                        event.preventDefault();
                        const targetId = blocks[targetIndex].id;
                        setSelectedBlockIds([targetId]);
                        setSelectionAnchorId(targetId);
                        setSelectionCursorId(targetId);
                        focusBlock(targetId);
                      }
                      return;
                    }
                    if ((event.key === "Backspace" || event.key === "Delete") && selectedBlockSet.has(block.id) && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
                      event.preventDefault();
                      deleteSelectedBlocks();
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (showSlashMenu) {
                        applyCommand(block.id, matches[Math.min(slashIndex, matches.length - 1)]);
                        return;
                      }
                      const target = event.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const before = block.text.slice(0, start);
                      const after = block.text.slice(end);
                      updateBlock(block.id, { text: before });
                      insertAfter(index, after, block.type === "divider" ? "paragraph" : block.type);
                      return;
                    }
                    if (event.key === "Backspace" && block.text.length === 0 && blocks.length > 1) {
                      event.preventDefault();
                      deleteBlock(index);
                    }
                  }}
                />
                {block.type === "todo" && block.checked && <span className="completed-sr-only">Concluída</span>}
                {showSlashMenu && (
                  <div className="slash-menu" role="listbox" aria-label="Inserir um bloco" onMouseDown={(event) => event.preventDefault()}>
                    <div className="slash-menu-label">BLOCOS BÁSICOS</div>
                    {matches.slice(0, 7).map((command, commandIndex) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={slashIndex === commandIndex}
                        className={slashIndex === commandIndex ? "selected" : ""}
                        key={command.shortcut}
                        onMouseEnter={() => setSlashIndex(commandIndex)}
                        onClick={() => applyCommand(block.id, command)}
                      >
                        <span className={`command-icon command-${command.type}`}>{command.type === "todo" ? "☐" : command.type === "divider" ? "—" : command.type.startsWith("heading") ? "T" : command.type === "quote" ? "“" : command.type === "code" ? "</>" : command.type === "bulleted" ? "•" : command.type === "numbered" ? "1." : command.type === "callout" ? "✦" : "¶"}</span>
                        <span><strong>{command.label}</strong><small>{command.description}</small></span>
                        <kbd>/{command.shortcut}</kbd>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button className="add-block-button" type="button" onClick={() => insertAfter(blocks.length - 1)}><Plus size={15} /> Adicionar bloco</button>
      {copyNotice && <div className="block-copy-notice" role="status">{copyNotice}</div>}
      <div className="editor-hint">Digite <kbd>/</kbd> para ver comandos <span>·</span> Use <kbd>#</kbd>, <kbd>-</kbd> ou <kbd>[]</kbd> no início da linha <span>·</span> <kbd>Enter</kbd> cria um bloco</div>
    </div>
  );
}
