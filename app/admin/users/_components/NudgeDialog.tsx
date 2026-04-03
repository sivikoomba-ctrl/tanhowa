"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, X, GripHorizontal } from "lucide-react";

const nudgeFieldOptions = [
  { value: "Title", label: "Title (Mr./Mrs./Dr.)" },
  { value: "Name", label: "Name *" },
  { value: "Phone", label: "Phone *" },
  { value: "Date of Birth", label: "Date of Birth *" },
  { value: "Gender", label: "Gender *" },
  { value: "Designation", label: "Designation *" },
  { value: "Qualification", label: "Qualification *" },
  { value: "Home Address", label: "Home Address" },
  { value: "Office Address", label: "Office Address *" },
  { value: "Posting Details", label: "Posting Details" },
  { value: "Photo", label: "Photo" },
  { value: "Experience", label: "Experience" },
  { value: "Skill Sets", label: "Skill Sets" },
  { value: "Social Links", label: "Social Links" },
];

interface NudgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (fields: string[], message: string) => void;
}

export default function NudgeDialog({ open, onOpenChange, onSend }: NudgeDialogProps) {
  const [nudgeFields, setNudgeFields] = useState<string[]>([]);
  const [nudgeMessage, setNudgeMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Center on first open
  useEffect(() => {
    if (open && !initialized) {
      setPosition({
        x: Math.max(0, window.innerWidth - 380),
        y: Math.max(60, window.innerHeight / 2 - 200),
      });
      setInitialized(true);
    }
    if (!open) {
      setInitialized(false);
    }
  }, [open, initialized]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: position.x, origY: position.y };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 340, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy)),
      });
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [position]);

  function handleClose() {
    setNudgeFields([]);
    setNudgeMessage("");
    onOpenChange(false);
  }

  function handleSend() {
    onSend(nudgeFields, nudgeMessage);
    setNudgeFields([]);
    setNudgeMessage("");
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-[340px] rounded-xl border bg-background shadow-2xl"
      style={{ left: position.x, top: position.y }}
    >
      {/* Draggable header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/50 rounded-t-xl cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold">Request Profile Update</h3>
        </div>
        <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
        <div>
          <Label className="text-sm font-medium">Select fields to update *</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {nudgeFieldOptions.map((f) => (
              <label key={f.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={nudgeFields.includes(f.value)}
                  onChange={(e) => {
                    if (e.target.checked) setNudgeFields([...nudgeFields, f.value]);
                    else setNudgeFields(nudgeFields.filter((v) => v !== f.value));
                  }}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">Message (optional)</Label>
          <Textarea
            value={nudgeMessage}
            onChange={(e) => setNudgeMessage(e.target.value)}
            placeholder="e.g., Please update your posting details after your recent transfer"
            rows={2}
            className="mt-1"
          />
        </div>
        <Button onClick={handleSend} disabled={nudgeFields.length === 0} className="w-full bg-primary hover:bg-primary/90">
          <Send size={14} className="mr-2" />
          Send Request
        </Button>
      </div>
    </div>
  );
}
