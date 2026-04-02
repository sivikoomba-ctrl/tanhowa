"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment Proof</DialogTitle>
        </DialogHeader>
        {url && (
          <div className="rounded-xl overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Payment proof" className="w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
