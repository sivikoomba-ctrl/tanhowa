"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bug, Leaf, Languages, ScanText, Mic, ArrowLeft, Sparkles } from "lucide-react";
import { PestIdentifier } from "./_components/pest-identifier";
import { CropAdviser } from "./_components/crop-adviser";
import { Translator } from "./_components/translator";
import { OcrTool } from "./_components/ocr-tool";
import { VoiceNotes } from "./_components/voice-notes";
import { useT } from "@/lib/i18n";

type ToolKey = "pest" | "crop" | "translate" | "ocr" | "voice";

const tools: { key: ToolKey; labelKey: string; descKey: string; icon: typeof Bug; color: string }[] = [
  { key: "pest", labelKey: "ai.pest_id", descKey: "ai.pest_desc", icon: Bug, color: "bg-red-100 text-red-600" },
  { key: "crop", labelKey: "ai.crop_advice", descKey: "ai.crop_desc", icon: Leaf, color: "bg-green-100 text-green-600" },
  { key: "translate", labelKey: "ai.translator", descKey: "ai.translate_desc", icon: Languages, color: "bg-blue-100 text-blue-600" },
  { key: "ocr", labelKey: "ai.ocr", descKey: "ai.ocr_desc", icon: ScanText, color: "bg-purple-100 text-purple-600" },
  { key: "voice", labelKey: "ai.voice_notes", descKey: "ai.voice_desc", icon: Mic, color: "bg-amber-100 text-amber-600" },
];

const toolComponents: Record<ToolKey, React.FC> = {
  pest: PestIdentifier,
  crop: CropAdviser,
  translate: Translator,
  ocr: OcrTool,
  voice: VoiceNotes,
};

export default function AIToolsPage() {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const t = useT();

  if (activeTool) {
    const tool = tools.find((t) => t.key === activeTool)!;
    const ToolComponent = toolComponents[activeTool];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setActiveTool(null)}>
            <ArrowLeft size={20} />
          </Button>
          <div className={`w-9 h-9 rounded-lg ${tool.color} flex items-center justify-center`}>
            <tool.icon size={18} />
          </div>
          <h1 className="text-xl font-bold">{t(tool.labelKey)}</h1>
        </div>
        <ToolComponent />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("ai.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("ai.powered_by")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <Card
            key={tool.key}
            className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/30"
            onClick={() => setActiveTool(tool.key)}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${tool.color} flex items-center justify-center shrink-0`}>
                  <tool.icon size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-base">{t(tool.labelKey)}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t(tool.descKey)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
