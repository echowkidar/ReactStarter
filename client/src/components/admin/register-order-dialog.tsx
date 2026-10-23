// Dialog where a dealing assistant arranges salary registers in the order of
// their paper register. Saved per admin login (server: admin_preferences).
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Loader2, ClipboardPaste, RotateCcw } from "lucide-react";
import { mergeOrder, applyPastedOrder, moveItem } from "@/lib/register-order";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  savedOrder: string[];
  availableRegisters: string[];
  saving: boolean;
  onSave: (order: string[]) => void;
};

export function RegisterOrderDialog({ open, onOpenChange, savedOrder, availableRegisters, saving, onSave }: Props) {
  const [list, setList] = React.useState<string[]>([]);
  const [paste, setPaste] = React.useState("");
  const [showPaste, setShowPaste] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setList(mergeOrder(savedOrder, availableRegisters));
      setPaste("");
      setShowPaste(false);
      setFilter("");
    }
  }, [open, savedOrder, availableRegisters]);

  const visible = new Set(availableRegisters.map((v) => v.trim().toUpperCase()));
  const move = (i: number, to: number) => setList((l) => moveItem(l, i, to));
  const f = filter.trim().toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[560px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Arrange Salary Registers</DialogTitle>
          <DialogDescription>
            Put the registers in the same order as your paper register. The « » buttons next to the register filter follow this order.
            The order is saved for your login only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-40" placeholder="Find register..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={() => setShowPaste((s) => !s)}>
            <ClipboardPaste className="h-4 w-4 mr-1" /> Paste list
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setList([...list].sort())} title="Sort A to Z">
            <RotateCcw className="h-4 w-4 mr-1" /> A–Z
          </Button>
        </div>

        {showPaste && (
          <div className="space-y-2 rounded-md border p-2 bg-slate-50">
            <p className="text-xs text-muted-foreground">
              Paste register numbers in your paper-register order (one per line, or separated by commas/spaces).
              They will move to the top in that order; the rest stay below.
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

        <div className="flex-1 overflow-y-auto rounded-md border min-h-[200px]">
          {list.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No registers in the current list. Select a month first.</div>
          ) : list.map((reg, i) => {
            if (f && !reg.toUpperCase().includes(f)) return null;
            const inView = visible.has(reg.trim().toUpperCase());
            return (
              <div key={reg} className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0 text-sm hover:bg-slate-50">
                <span className="w-8 text-right text-xs text-muted-foreground">{i + 1}.</span>
                <span className={`flex-1 font-mono ${inView ? "" : "text-muted-foreground"}`} title={inView ? "" : "Not in the current list (other month / filter)"}>{reg}</span>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, 0)} title="Move to top"><ChevronsUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, i - 1)} title="Move up"><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === list.length - 1} onClick={() => move(i, i + 1)} title="Move down"><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === list.length - 1} onClick={() => move(i, list.length - 1)} title="Move to bottom"><ChevronsDown className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving || list.length === 0} onClick={() => onSave(list)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
