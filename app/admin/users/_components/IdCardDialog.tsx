"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, User as UserIcon, Loader2 } from "lucide-react";
import { downloadIdCard, idCardName, ID_CARD_MEMBER_ID, type IdCardData } from "@/lib/id-card";

interface IdCardUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  created_at: string;
  photo_url: string;
  posting_details?: { regular_district?: string; official_designation?: string } | null;
  social_links?: { title?: string } | null;
}

function toCardData(u: IdCardUser): IdCardData {
  return {
    id: u.id,
    title: u.social_links?.title,
    name: u.name,
    occupation: u.occupation,
    phone: u.phone,
    email: u.email,
    created_at: u.created_at,
    official_designation: u.posting_details?.official_designation,
    regular_district: u.posting_details?.regular_district,
  };
}

export default function IdCardDialog({
  user,
  open,
  onOpenChange,
}: {
  user: IdCardUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const data = toCardData(user);
  const displayName = idCardName(data) || "MEMBER NAME";
  const designation = data.official_designation || "Member";
  const govtLine = [data.occupation, data.regular_district].filter(Boolean).join(" · ");

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadIdCard(data, user.photo_url || null);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Member ID Card</DialogTitle>
        </DialogHeader>

        {/* On-screen ID Card (mirrors /dashboard/profile) */}
        <div className="mx-auto w-full max-w-sm rounded-xl overflow-hidden shadow-lg border">
          <div className="bg-gradient-to-r from-[#2d6a4f] to-[#40916c] px-4 py-3 text-white text-center">
            <p className="text-lg font-bold tracking-wider">TANHOWA</p>
            <p className="text-[9px] opacity-80 tracking-wide">
              Tamil Nadu Horticultural Officers Welfare Association
            </p>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="w-16 h-20 rounded-lg overflow-hidden bg-muted shrink-0 border">
                {user.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photo_url} alt="Photo" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserIcon size={20} className="text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm uppercase truncate">{displayName}</p>
                <p className="text-xs font-semibold text-[#2d6a4f]">{designation}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{govtLine || "Designation"}</p>
              </div>
            </div>
            <Separator className="my-2" />
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div>
                <span className="text-muted-foreground">Member ID: </span>
                <span className="font-mono font-semibold">{ID_CARD_MEMBER_ID(data.id)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Member since: </span>
                <span className="font-semibold">
                  {data.created_at ? new Date(data.created_at).getFullYear() : "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Phone: </span>
                <span className="font-semibold">{data.phone || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Valid until: </span>
                <span className="font-semibold">Dec {new Date().getFullYear()}</span>
              </div>
            </div>
          </div>
          <div className="bg-[#2d6a4f] px-4 py-1.5 text-center">
            <p className="text-[8px] text-white/70">www.tanhowa.in</p>
          </div>
        </div>

        <Button onClick={handleDownload} disabled={downloading} className="gap-1.5">
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Download PDF
        </Button>
      </DialogContent>
    </Dialog>
  );
}
