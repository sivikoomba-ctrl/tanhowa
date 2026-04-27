"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PaymentProofPreviewDialogProps {
  open: boolean;
  url: string | null;
  onOpenChange: (open: boolean) => void;
}

export function PaymentProofPreviewDialog({
  open,
  url,
  onOpenChange,
}: PaymentProofPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment Proof</DialogTitle>
        </DialogHeader>
        {url && (
          <div className="rounded-xl overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Payment proof" className="w-full" />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              Open in new tab
            </a>
          ) : <span />}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => onOpenChange(false)}>
            <X size={14} /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
