"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Camera, X, Copy, Check, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

interface ExpenseResult {
  vendor_name: string;
  date: string | null;
  total_amount: number | null;
  items: { description: string; quantity: number | null; amount: number | null }[];
  tax: number | null;
  payment_method: string | null;
  invoice_number: string | null;
  category: string | null;
  notes: string | null;
}

export function ExpenseOcr() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExpenseResult | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  function handleFile(f: File) {
    if (f.size > 10 * 1024 * 1024) {
      toast.error(t("ai.image_too_large"));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai-tools/expense-ocr", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to extract");
        return;
      }
      setResult(data);
    } catch {
      toast.error("Failed to extract expense details");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    const lines = [
      `Vendor: ${result.vendor_name}`,
      result.date ? `Date: ${result.date}` : "",
      result.total_amount ? `Total: Rs. ${result.total_amount}` : "",
      result.invoice_number ? `Invoice: ${result.invoice_number}` : "",
      result.payment_method ? `Payment: ${result.payment_method}` : "",
      result.category ? `Category: ${result.category}` : "",
      result.items.length > 0 ? `\nItems:\n${result.items.map((i) => `- ${i.description}: Rs. ${i.amount || 0}`).join("\n")}` : "",
      result.tax ? `Tax: Rs. ${result.tax}` : "",
      result.notes ? `Notes: ${result.notes}` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {!preview ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Camera size={24} />
            </div>
            <p className="text-sm font-medium">Upload a receipt or invoice photo</p>
            <p className="text-xs">{t("ai.jpg_png_10mb")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="rounded-xl max-h-48 w-full object-contain bg-muted" />
          <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={clearFile}>
            <X size={14} />
          </Button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {file && !result && (
        <Button onClick={handleExtract} disabled={loading} className="w-full">
          {loading ? <><Loader2 size={16} className="animate-spin mr-2" />Extracting...</> : <><Upload size={16} className="mr-2" />Extract Expense Details</>}
        </Button>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Extracted Details</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs h-7">
              {copied ? <><Check size={14} className="mr-1" />{t("ai.copied")}</> : <><Copy size={14} className="mr-1" />{t("common.copy")}</>}
            </Button>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{result.vendor_name || "Unknown Vendor"}</h3>
                {result.total_amount && (
                  <Badge className="bg-green-100 text-green-700 border-green-300 text-base px-3">
                    <IndianRupee size={14} className="mr-0.5" />
                    {result.total_amount.toLocaleString("en-IN")}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {result.date && (
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{result.date}</span></div>
                )}
                {result.invoice_number && (
                  <div><span className="text-muted-foreground">Invoice:</span> <span className="font-medium">{result.invoice_number}</span></div>
                )}
                {result.payment_method && (
                  <div><span className="text-muted-foreground">Payment:</span> <span className="font-medium">{result.payment_method}</span></div>
                )}
                {result.category && (
                  <div><span className="text-muted-foreground">Category:</span> <Badge variant="outline" className="text-xs">{result.category}</Badge></div>
                )}
              </div>

              {result.items.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Items</p>
                  <div className="space-y-1">
                    {result.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                        <span>{item.description} {item.quantity ? `x${item.quantity}` : ""}</span>
                        {item.amount != null && <span className="font-medium">Rs. {item.amount.toLocaleString("en-IN")}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.tax != null && (
                <div className="text-sm flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">Rs. {result.tax.toLocaleString("en-IN")}</span>
                </div>
              )}

              {result.notes && (
                <p className="text-xs text-muted-foreground italic">{result.notes}</p>
              )}
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" onClick={clearFile}>
            {t("ai.try_another")}
          </Button>
        </div>
      )}
    </div>
  );
}
