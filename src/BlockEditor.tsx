import { useCallback, useEffect, useState } from "react";
import type { ClipboardEvent, CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { makeId } from "./model";
import type { ContentBlock, BlockType, Page } from "./model";
import { createEmptyMeetingData } from "./model";
import { MeetingNotesBlock } from "./MeetingNotesBlock";
import { deleteMeetingAudioForBlock, listMeetingAudioSegments } from "./meetingAudioStore";
import { BlockColorMenu, BookmarkBlock, ImageBlock, PageLinkBlock, ToggleBlock } from "./EditorExtensions";

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  pages?: Page[];
  onNavigate?: (id: string) => void;
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
  { label: "Lista recolhível", shortcut: "toggle", description: "Organize detalhes que podem ser expandidos ou recolhidos.", type: "toggle" },
  { label: "Citação", shortcut: "quote", description: "Adicione uma citação ou destaque.", type: "quote" },
  { label: "Destaque", shortcut: "callout", description: "Realce uma anotação útil.", type: "callout" },
  { label: "Código", shortcut: "code", description: "Adicione um bloco de código.", type: "code" },
  { label: "Gravação de reunião", shortcut: "meet", description: "Prepare a pauta, grave o microfone e registre ações localmente.", type: "meeting" },
  { label: "Imagem", shortcut: "image", description: "Envie uma imagem local de até 512 KB e adicione uma legenda.", type: "image" },
  { label: "Favorito da web", shortcut: "bookmark", description: "Guarde um endereço da web em um cartão.", type: "bookmark" },
  { label: "Link para página", shortcut: "link", description: "Vincule e abra outra página deste workspace.", type: "pageLink" },
  { label: "Divisor", shortcut: "divider", description: "Separe seções com uma linha.", type: "divider" },
];

const richBlockClipboard = new Map<string, ContentBlock[]>();
const BLOCK_COLOR_IDS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);

function isBlockColor(value: string | undefined): boolean {
  return Boolean(value && BLOCK_COLOR_IDS.has(value));
}

function blockColorStyle(block: ContentBlock): CSSProperties {
  return {
    ...(isBlockColor(block.color) ? { "--block-text-color": `var(--editor-color-${block.color})` } : {}),
    ...(isBlockColor(block.background) ? { "--block-background-color": `var(--editor-background-${block.background})` } : {}),
  } as CSSProperties;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function normalizeCommandSearch(value: string): string {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function markdownShortcutType(text: string): BlockType | undefined {
  if (text === "### ") return "heading3";
  if (text === "## ") return "heading2";
  if (text === "# ") return "heading1";
  if (["- ", "* ", "+ "].includes(text)) return "bulleted";
  if (text === "1. ") return "numbered";
  if (text === "[]" || text === "[] ") return "todo";
  if (text === '" ') return "quote";
  if (text === "> ") return "toggle";
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

function blockPlainText(block: ContentBlock): string {
  if (block.type === "toggle") return [block.text, block.details].filter(Boolean).join("\n");
  if (block.type === "image") return block.caption || block.text || "Imagem";
  if (block.type === "bookmark") return [block.text, block.url].filter(Boolean).join("\n");
  return block.text;
}

export function BlockEditor({ blocks, onChange, pages = [], onNavigate }: BlockEditorProps) {
  const [slashBlockId, setSlashBlockId] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [menuBlockId, setMenuBlockId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [selectionCursorId, setSelectionCursorId] = useState<string | null>(null);
  const [busyMeetingIds, setBusyMeetingIds] = useState<string[]>([]);
  const selectedBlockSet = new Set(selectedBlockIds);
  const activeSlashQuery = blocks.find((block) => block.id === slashBlockId)?.text;

  useEffect(() => {
    if (slashBlockId) document.getElementById(`slash-option-${slashBlockId}-${slashIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [slashBlockId, slashIndex, activeSlashQuery]);

  const handleRecorderBusyChange = useCallback((blockId: string, busy: boolean) => {
    setBusyMeetingIds((current) => busy
      ? current.includes(blockId) ? current : [...current, blockId]
      : current.filter((id) => id !== blockId));
  }, []);

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

  const selectedContentBlocks = getSelectedBlocks();
  const selectedIndices = selectedContentBlocks.map((block) => blocks.findIndex((item) => item.id === block.id));
  const selectionIsContiguous = selectedIndices.length === selectedBlockIds.length
    && selectedIndices.length > 0
    && Math.max(...selectedIndices) - Math.min(...selectedIndices) === selectedIndices.length - 1;
  const selectedGroupId = selectedContentBlocks[0]?.groupId;
  const canUngroupSelection = selectionIsContiguous
    && Boolean(selectedGroupId)
    && selectedContentBlocks.every((block) => block.groupId === selectedGroupId);
  const canGroupSelection = selectionIsContiguous
    && selectedContentBlocks.length > 1
    && selectedContentBlocks.every((block) => !block.groupId);

  const updateBlock = (id: string, update: Partial<ContentBlock>) => {
    onChange(blocks.map((block) => (block.id === id ? { ...block, ...update } : block)));
  };

  const removeMeetingBlocks = async (removedBlocks: ContentBlock[], commit: () => void) => {
    const meetingIds = removedBlocks.filter((block) => block.type === "meeting").map((block) => block.id);
    if (meetingIds.some((id) => busyMeetingIds.includes(id))) {
      window.alert("Encerre ou aguarde o salvamento da gravação antes de excluir este bloco.");
      return;
    }

    let recordedCount = 0;
    try {
      const recordings = await Promise.all(meetingIds.map((id) => listMeetingAudioSegments(id)));
      recordedCount = recordings.reduce((total, items) => total + items.length, 0);
    } catch (error) {
      window.alert(error instanceof Error ? `Não foi possível verificar os áudios salvos: ${error.message}` : "Não foi possível verificar os áudios salvos.");
      return;
    }

    if (recordedCount > 0 && !window.confirm(`Excluir também ${recordedCount} ${recordedCount === 1 ? "trecho de áudio" : "trechos de áudio"} salvo(s) neste navegador? Exporte os arquivos antes, se quiser mantê-los.`)) return;
    if (recordedCount > 0) {
      try {
        await Promise.all(meetingIds.map((id) => deleteMeetingAudioForBlock(id)));
      } catch (error) {
        window.alert(error instanceof Error ? `Não foi possível excluir os áudios: ${error.message}` : "Não foi possível excluir os áudios.");
        return;
      }
    }
    commit();
  };

  const focusBlock = (id: string, cursor?: number) => {
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-block-id="${CSS.escape(id)}"]`);
      input?.focus();
      if (cursor !== undefined && input && (input instanceof HTMLTextAreaElement || ["text", "search", "url"].includes(input.type))) input.setSelectionRange(cursor, cursor);
    });
  };

  const applyCommand = (blockId: string, command: BlockCommand) => {
    updateBlock(blockId, { type: command.type, text: "", checked: false, meeting: command.type === "meeting" ? createEmptyMeetingData() : undefined, details: undefined, imageData: undefined, caption: undefined, url: undefined, targetPageId: undefined });
    setSlashBlockId(null);
    setSlashIndex(0);
    setMenuBlockId(null);
    focusBlock(blockId, 0);
  };

  const insertAfter = (index: number, text = "", type: BlockType = "paragraph") => {
    const block: ContentBlock = { id: makeId("block"), type, text, checked: false, meeting: type === "meeting" ? createEmptyMeetingData() : undefined };
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    onChange(next);
    setSlashBlockId(null);
    focusBlock(block.id, 0);
  };

  const deleteBlock = (index: number) => {
    const removedBlock = blocks[index];
    if (removedBlock.type === "meeting") {
      void removeMeetingBlocks([removedBlock], () => {
        if (blocks.length === 1) updateBlock(removedBlock.id, { type: "paragraph", text: "", checked: false, meeting: undefined });
        else onChange(blocks.filter((_, itemIndex) => itemIndex !== index));
        setMenuBlockId(null);
      });
      return;
    }
    if (blocks.length === 1) {
      updateBlock(blocks[0].id, { type: "paragraph", text: "", checked: false, details: undefined, imageData: undefined, caption: undefined, url: undefined, targetPageId: undefined });
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
    `${copiedBlocks.map((block) => `<p>${escapeHtml(blockPlainText(block)).replaceAll("\n", "<br>")}</p>`).join("")}<!-- workspace-lab:${copyId} -->`;

  const setRichClipboardData = (clipboardData: DataTransfer, copiedBlocks: ContentBlock[]) => {
    const copyId = rememberCopiedBlocks(copiedBlocks);
    clipboardData.setData("text/plain", copiedBlocks.map(blockPlainText).join("\n"));
    clipboardData.setData("text/html", clipboardHtml(copyId, copiedBlocks));
  };

  const copyBlocks = async (copiedBlocks: ContentBlock[]) => {
    if (!copiedBlocks.length) return;
    const copyId = rememberCopiedBlocks(copiedBlocks);
    const text = copiedBlocks.map(blockPlainText).join("\n");
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
    const preservesGroup = selected.length > 1 && Boolean(selected[0].groupId) && selected.every((block) => block.groupId === selected[0].groupId);
    const duplicateGroupId = preservesGroup ? makeId("block-group") : undefined;
    const duplicates = selected.map((block) => {
      const duplicate = { ...block, id: makeId("block") };
      if (duplicateGroupId) duplicate.groupId = duplicateGroupId;
      else delete duplicate.groupId;
      return duplicate;
    });
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
    void removeMeetingBlocks(selected, () => {
      let next = blocks.filter((block) => !selectedBlockSet.has(block.id));
      if (!next.length) next = [{ id: makeId("block"), type: "paragraph", text: "" }];
      onChange(next);
      clearSelection();
      setMenuBlockId(null);
      focusBlock(next[Math.min(firstSelectedIndex, next.length - 1)].id, 0);
    });
  };

  const moveSelection = (step: -1 | 1) => {
    if (!selectedBlockIds.length) return;
    onChange(moveSelectedBlocks(blocks, selectedBlockIds, step));
  };

  const groupSelectedBlocks = () => {
    if (!canGroupSelection) return;
    const groupId = makeId("block-group");
    onChange(blocks.map((block) => selectedBlockSet.has(block.id) ? { ...block, groupId } : block));
  };

  const ungroupSelectedBlocks = () => {
    if (!canUngroupSelection || !selectedGroupId) return;
    onChange(blocks.map((block) => {
      if (block.groupId !== selectedGroupId) return block;
      const ungrouped = { ...block };
      delete ungrouped.groupId;
      return ungrouped;
    }));
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
    const copiedGroupCounts = new Map<string, number>();
    for (const copied of copiedBlocks) {
      if (copied.groupId) copiedGroupCounts.set(copied.groupId, (copiedGroupCounts.get(copied.groupId) ?? 0) + 1);
    }
    const pastedGroupIds = new Map<string, string>();
    const pasted = copiedBlocks.map((copied) => {
      const pastedBlock = { ...copied, id: makeId("block") };
      if (copied.groupId && (copiedGroupCounts.get(copied.groupId) ?? 0) > 1) {
        if (!pastedGroupIds.has(copied.groupId)) pastedGroupIds.set(copied.groupId, makeId("block-group"));
        pastedBlock.groupId = pastedGroupIds.get(copied.groupId)!;
      } else {
        delete pastedBlock.groupId;
      }
      return pastedBlock;
    });
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

  const numberedPositions = blocks.reduce<number[]>((positions, block, index) => {
    positions.push(block.type === "numbered" ? (positions[index - 1] ?? 0) + 1 : 0);
    return positions;
  }, []);

  return (
    <div className="block-editor" onClick={() => setMenuBlockId(null)}>
      {selectedContentBlocks.length > 0 && (
        <div className="block-selection-toolbar" role="toolbar" aria-label="Ações dos blocos selecionados" onClick={(event) => event.stopPropagation()}>
          <strong>{selectedContentBlocks.length} {selectedContentBlocks.length === 1 ? "bloco selecionado" : "blocos selecionados"}</strong>
          <button type="button" aria-label="Copiar seleção" onClick={() => void copyBlocks(selectedContentBlocks)}><Copy size={14} /> Copiar</button>
          <button type="button" aria-label="Duplicar seleção" onClick={duplicateSelectedBlocks}><Copy size={14} /> Duplicar</button>
          <button type="button" aria-label={canUngroupSelection ? "Desagrupar blocos selecionados" : "Agrupar blocos selecionados"} onClick={canUngroupSelection ? ungroupSelectedBlocks : groupSelectedBlocks} disabled={!canUngroupSelection && !canGroupSelection}>{canUngroupSelection ? "Desagrupar" : "Agrupar"}</button>
          <button type="button" aria-label="Mover seleção para cima" onClick={() => moveSelection(-1)}><ArrowUp size={14} /> Para cima</button>
          <button type="button" aria-label="Mover seleção para baixo" onClick={() => moveSelection(1)}><ArrowDown size={14} /> Para baixo</button>
          <button className="selection-danger-action" type="button" aria-label="Excluir seleção" onClick={deleteSelectedBlocks}><Trash2 size={14} /> Excluir</button>
          <button className="selection-clear-action" type="button" aria-label="Limpar seleção" onClick={clearSelection}><X size={14} /></button>
          <span>Shift + clique seleciona um intervalo · Agrupar exige blocos contíguos · Ctrl + D duplica · Delete exclui</span>
        </div>
      )}
      {blocks.map((block, index) => {
        const groupClassName = block.groupId
          ? ` is-block-grouped${index === 0 || blocks[index - 1].groupId !== block.groupId ? " is-block-group-start" : ""}${index === blocks.length - 1 || blocks[index + 1].groupId !== block.groupId ? " is-block-group-end" : ""}`
          : "";
        const query = block.text.startsWith("/") ? normalizeCommandSearch(block.text.slice(1).trim()) : "";
        const matches = query
          ? COMMANDS.filter((command) => normalizeCommandSearch(`${command.label} ${command.shortcut} ${command.type}`).includes(query))
          : COMMANDS;
        const slashMenuOpen = slashBlockId === block.id;
        const showSlashMenu = slashMenuOpen && matches.length > 0;

        return (
          <div
            className={`block-row block-${block.type}${groupClassName}${isBlockColor(block.color) ? " has-block-text-color" : ""}${isBlockColor(block.background) ? " has-block-background" : ""} ${selectedBlockSet.has(block.id) ? "is-block-selected" : ""}`}
            style={blockColorStyle(block)}
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
                  <BlockColorMenu block={block} onChange={(update) => updateBlock(block.id, update)} />
                </div>
              )}
            </div>

            {block.type === "meeting" ? (
              <MeetingNotesBlock
                block={block}
                onChange={(update) => updateBlock(block.id, update)}
                onRecorderBusyChange={handleRecorderBusyChange}
              />
            ) : block.type === "toggle" ? (
              <ToggleBlock block={block} onChange={(update) => updateBlock(block.id, update)} onInsertAfter={() => insertAfter(index)} />
            ) : block.type === "image" ? (
              <ImageBlock block={block} onChange={(update) => updateBlock(block.id, update)} onInsertAfter={() => insertAfter(index)} />
            ) : block.type === "bookmark" ? (
              <BookmarkBlock block={block} onChange={(update) => updateBlock(block.id, update)} onInsertAfter={() => insertAfter(index)} />
            ) : block.type === "pageLink" ? (
              <PageLinkBlock block={block} onChange={(update) => updateBlock(block.id, update)} onInsertAfter={() => insertAfter(index)} pages={pages} onNavigate={onNavigate} />
            ) : block.type === "divider" ? (
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
                {block.type === "numbered" && <span className="list-marker number-marker" aria-hidden="true">{numberedPositions[index]}.</span>}
                {block.type === "callout" && <span className="callout-marker" aria-hidden="true">✦</span>}
                <textarea
                  className="block-input"
                  data-block-id={block.id}
                  aria-label={`Bloco ${block.type.replace("heading", "título ")}`}
                  aria-controls={slashMenuOpen ? `slash-menu-${block.id}` : undefined}
                  aria-activedescendant={showSlashMenu ? `slash-option-${block.id}-${Math.min(slashIndex, matches.length - 1)}` : undefined}
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
                    if (slashMenuOpen && event.key === "Escape") {
                      event.preventDefault();
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
                      if (!block.text && ["numbered", "bulleted", "todo"].includes(block.type)) {
                        updateBlock(block.id, { type: "paragraph", checked: false });
                        return;
                      }
                      const nextBlock: ContentBlock = { id: makeId("block"), type: block.type, text: after, checked: false, color: block.color, background: block.background };
                      const next = [...blocks];
                      next.splice(index, 1, { ...block, text: before }, nextBlock);
                      onChange(next);
                      setSlashBlockId(null);
                      focusBlock(nextBlock.id, 0);
                      return;
                    }
                    if (event.key === "Backspace" && block.text.length === 0 && blocks.length > 1) {
                      event.preventDefault();
                      deleteBlock(index);
                    }
                  }}
                />
                {block.type === "todo" && block.checked && <span className="completed-sr-only">Concluída</span>}
                {slashMenuOpen && (
                  <div className="slash-menu" id={`slash-menu-${block.id}`} role="listbox" aria-label="Inserir um bloco" onMouseDown={(event) => event.preventDefault()}>
                    <div className="slash-menu-label">TODOS OS BLOCOS · {matches.length} {matches.length === 1 ? "COMANDO" : "COMANDOS"}</div>
                    {!matches.length && <div className="slash-menu-empty">Nenhum comando encontrado. Tente /image, /toggle, /bookmark, /link ou /meet.</div>}
                    {matches.map((command, commandIndex) => (
                      <button
                        type="button"
                        role="option"
                        id={`slash-option-${block.id}-${commandIndex}`}
                        aria-selected={slashIndex === commandIndex}
                        className={slashIndex === commandIndex ? "selected" : ""}
                        key={command.shortcut}
                        onMouseEnter={() => setSlashIndex(commandIndex)}
                        onClick={() => applyCommand(block.id, command)}
                      >
                        <span className={`command-icon command-${command.type}`}>{command.type === "todo" ? "☐" : command.type === "divider" ? "—" : command.type.startsWith("heading") ? "T" : command.type === "quote" ? "“" : command.type === "code" ? "</>" : command.type === "bulleted" ? "•" : command.type === "numbered" ? "1." : command.type === "callout" ? "✦" : command.type === "toggle" ? "▸" : command.type === "image" ? "▧" : command.type === "bookmark" ? "↗" : command.type === "pageLink" ? "↪" : command.type === "meeting" ? "◉" : "¶"}</span>
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
