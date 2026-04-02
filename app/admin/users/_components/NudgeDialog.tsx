"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send } from "lucide-react";

const nudgeFieldOptions = [
  { value: "Name", label: "Name *" },
  { value: "Phone", label: "Phone *" },
  { value: "Date of Birth", label: "Date of Birth" },
  { value: "Gender", label: "Gender" },
  { value: "Designation", label: "Designation *" },
  { value: "Qualification", label: "Qualification" },
  { value: "Home Address", label: "Home Address" },
  { value: "Office Address", label: "Office Address" },
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

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setNudgeFields([]);
      setNudgeMessage("");
    }
    onOpenChange(isOpen);
  }

  function handleSend() {
    onSend(nudgeFields, nudgeMessage);
    setNudgeFields([]);
    setNudgeMessage("");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Profile Update</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
      </DialogContent>
    </Dialog>
  );
}
