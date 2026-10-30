// Dialog where a dealing assistant arranges salary registers in the order of
// their paper register. Saved per admin login (server: admin_preferences).
//
// Three ways to arrange:
//   1. Drag & drop  — grab the ⋮⋮ handle and drop the register where it belongs
//                     (the list auto-scrolls near its top/bottom edge)
//   2. Position no. — type the new position in the number box and press Enter
//   3. Click in order — click registers one by one in paper-register order
// plus "Paste list" (e.g. a column copied from Excel).
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronsUp, ChevronsDown, Loader2, ClipboardPaste, RotateCcw, GripVertical, MousePointerClick, Move, X, Undo2 } from "lucide-react";
import { mergeOrder, applyPastedOrder, moveItem } from "@/lib/register-order";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  savedOrder: string[];
  availableRegisters: string[];
  saving: boolean;
  onSave: (order: string[]) => void;
};

type Mode = "drag" | "pick";

export function RegisterOrderDialog({ open, onOpenChange, savedOrder, availableRegisters, saving, onSave }: Props) {
  const [list, setList] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<Mode>("drag");
  const [paste, setPaste] = React.useState("");
  const [showPaste, setShowPaste] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  // drag & drop
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dropAt, setDropAt] = React.useState<number | null>(null); // insertion index 0..n
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // click-in-order
  const [picked, setPicked] = React.useState<string[]>([]);
  const [pickFilter, setPickFilter] = React.useState("");
  const pickSearchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setList(mergeOrder(savedOrder, availableRegisters));
      setMode("drag");
      setPaste("");
      setShowPaste(false);
      setFilter("");
      setPicked([]);
      setPickFilter("");
      setDragFrom(null);
      setDropAt(null);
    }
  }, [open, savedOrder, availableRegisters]);

  const visible = React.useMemo(() => new Set(availableRegisters.map((v) => v.trim().toUpperCase())), [availableRegisters]);
  const move = (from: number, to: number) => setList((l) => moveItem(l, from, to));

  // ── Drag & drop (native HTML5) ─────────────────────────────────────────────
  const onHandleDragStart = (i: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i)); // required by Firefox
    const row = (e.currentTarget as HTMLElement).closest("[data-row]") as HTMLElement | null;
    if (row) e.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
    setDragFrom(i);
  };
  const onRowDragOver = (i: number) => (e: React.DragEvent) => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };
  const onListDragOver = (e: React.DragEvent) => {
    if (dragFrom === null) return;
    e.preventDefault();
    // auto-scroll near the edges of the list
    const box = scrollRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const edge = 48;
    if (e.clientY < r.top + edge) box.scrollTop -= Math.ceil((r.top + edge - e.clientY) / 3);
    else if (e.clientY > r.bottom - edge) box.scrollTop += Math.ceil((e.clientY - (r.bottom - edge)) / 3);
  };
  const finishDrag = () => { setDragFrom(null); setDropAt(null); };
  const onListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragFrom !== null && dropAt !== null) {
      const to = dropAt > dragFrom ? dropAt - 1 : dropAt;
      if (to !== dragFrom) move(dragFrom, to);
    }
    finishDrag();
  };

  // ── Position number ───────────────────────────────────────────────────────
  // Works on the register NAME against the latest list, so a repeated commit
  // (Enter followed by blur) can never move a different register.
  const commitPosition = (reg: string, raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    setList((l) => {
      const from = l.indexOf(reg);
      if (from === -1) return l;
      const to = Math.min(l.length, Math.max(1, n)) - 1;
      return to === from ? l : moveItem(l, from, to);
    });
  };

  // ── Click in order ────────────────────────────────────────────────────────
  const pickedSet = React.useMemo(() => new Set(picked), [picked]);
  const remaining = list.filter((r) => !pickedSet.has(r));
  const pickRemainingFiltered = remaining.filter((r) => !pickFilter.trim() || r.toUpperCase().includes(pickFilter.trim().toUpperCase()));
  const pickOne = (reg: string) => {
    setPicked((p) => [...p, reg]);
    // keep the search handy: clear it when the typed text was used up
    if (pickRemainingFiltered.length <= 1) setPickFilter("");
    pickSearchRef.current?.focus();
  };

  const finalOrder = mode === "pick" ? [...picked, ...remaining] : list;
  const f = filter.trim().toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[640px] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Arrange Salary Registers</DialogTitle>
          <DialogDescription>
            Put the registers in the same order as your paper register. The « » buttons next to the register filter follow this order.
            The order is saved for your login only.
          </DialogDescription>
        </DialogHeader>

        {/* Mode switch */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <Button type="button" size="sm" variant={mode === "drag" ? "default" : "ghost"} className="h-7" onClick={() => setMode("drag")}>
              <Move className="h-4 w-4 mr-1" /> Drag / position
            </Button>
            <Button type="button" size="sm" variant={mode === "pick" ? "default" : "ghost"} className="h-7"
              onClick={() => { setMode("pick"); setTimeout(() => pickSearchRef.current?.focus(), 50); }}>
              <MousePointerClick className="h-4 w-4 mr-1" /> Click in order
            </Button>
          </div>
          {mode === "drag" && (
            <>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setShowPaste((s) => !s)}>
                <ClipboardPaste className="h-4 w-4 mr-1" /> Paste list
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setList([...list].sort())} title="Sort A to Z">
                <RotateCcw className="h-4 w-4 mr-1" /> A–Z
              </Button>
            </>
          )}
        </div>

        {mode === "drag" && showPaste && (
          <div className="space-y-2 rounded-md border p-2 bg-slate-50">
            <p className="text-xs text-muted-foreground">
              Paste register numbers in your paper-register order (one per line — e.g. a column copied from Excel — or separated by commas/spaces).
              They move to the top in that order; the rest stay below.
            </p>
            <textarea
              className="w-full h-28 rounded border p-2 text-sm font-mono"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"UNA40III\nART14D\nCOL14A"}
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={!paste.trim()} onClick={() => { setList(applyPastedOrder(list, paste)); setShowPaste(false); setPaste(""); }}>
                Apply
              </Button>
            </div>
          </div>
        )}

        {mode === "drag" && (
          <>
            <div className="flex items-center gap-2">
              <Input className="h-8 w-44" placeholder="Find register..." value={filter} onChange={(e) => setFilter(e.target.value)} />
              <span className="text-xs text-muted-foreground">
                Drag <GripVertical className="inline h-3 w-3" /> to move, or type a new number and press Enter.
              </span>
            </div>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto rounded-md border min-h-[220px]"
              onDragOver={onListDragOver}
              onDrop={onListDrop}
            >
              {list.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No registers in the current list. Select a month first.</div>
              ) : list.map((reg, i) => {
                if (f && !reg.toUpperCase().includes(f)) return null;
                const inView = visible.has(reg.trim().toUpperCase());
                const isDragged = dragFrom === i;
                return (
                  <div
                    key={reg}
                    data-row
                    onDragOver={onRowDragOver(i)}
                    className={`relative flex items-center gap-2 px-2 py-1 border-b last:border-b-0 text-sm bg-white ${isDragged ? "opacity-40" : "hover:bg-slate-50"}`}
                  >
                    {dropAt === i && dragFrom !== null && <div className="absolute left-0 right-0 -top-[2px] h-[3px] bg-blue-600 rounded pointer-events-none" />}
                    {dropAt === i + 1 && i === list.length - 1 && dragFrom !== null && <div className="absolute left-0 right-0 -bottom-[2px] h-[3px] bg-blue-600 rounded pointer-events-none" />}
                    <span
                      draggable
                      onDragStart={onHandleDragStart(i)}
                      onDragEnd={finishDrag}
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 px-0.5"
                      title="Drag to move"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <input
                      key={`${reg}-${i}`}
                      type="number"
                      min={1}
                      max={list.length}
                      defaultValue={i + 1}
                      className="w-14 h-7 rounded border px-1 text-right text-xs"
                      title="Type a new position and press Enter"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPosition(reg, (e.target as HTMLInputElement).value); } }}
                      onBlur={(e) => commitPosition(reg, e.target.value)}
                    />
                    <span className={`flex-1 font-mono ${inView ? "" : "text-muted-foreground"}`} title={inView ? "" : "Not in the current list (other month / filter)"}>{reg}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, 0)} title="Move to top"><ChevronsUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === list.length - 1} onClick={() => move(i, list.length - 1)} title="Move to bottom"><ChevronsDown className="h-4 w-4" /></Button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mode === "pick" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-h-0">
            <div className="flex flex-col min-h-0">
              <div className="text-xs font-medium mb-1">1. Click registers in your paper-register order</div>
              <Input
                ref={pickSearchRef}
                className="h-8 mb-1"
                placeholder="Type to find, Enter to add..."
                value={pickFilter}
                onChange={(e) => setPickFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && pickRemainingFiltered.length > 0) { e.preventDefault(); pickOne(pickRemainingFiltered[0]); } }}
              />
              <div className="flex-1 overflow-y-auto rounded-md border min-h-[220px] max-h-[50vh]">
                {pickRemainingFiltered.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">{remaining.length === 0 ? "All registers placed." : "No match."}</div>
                ) : pickRemainingFiltered.map((reg) => (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => pickOne(reg)}
                    className="w-full text-left px-2 py-1.5 border-b last:border-b-0 text-sm font-mono hover:bg-blue-50"
                  >
                    {reg}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col min-h-0">
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span>2. Your order ({picked.length})</span>
                <span className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={picked.length === 0} onClick={() => setPicked((p) => p.slice(0, -1))}>
                    <Undo2 className="h-3 w-3 mr-1" /> Undo
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={picked.length === 0} onClick={() => setPicked([])}>Clear</Button>
                </span>
              </div>
              <div className="flex-1 overflow-y-auto rounded-md border min-h-[220px] max-h-[50vh] bg-slate-50">
                {picked.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">Registers you click appear here, numbered 1, 2, 3…</div>
                ) : picked.map((reg, i) => (
                  <div key={reg} className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0 text-sm">
                    <span className="w-8 text-right text-xs text-muted-foreground">{i + 1}.</span>
                    <span className="flex-1 font-mono">{reg}</span>
                    <button type="button" className="text-slate-400 hover:text-red-600" title="Remove" onClick={() => setPicked((p) => p.filter((x) => x !== reg))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {remaining.length > 0 && picked.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">The {remaining.length} registers not clicked will follow after these, in their current order.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving || finalOrder.length === 0 || (mode === "pick" && picked.length === 0)} onClick={() => onSave(finalOrder)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
