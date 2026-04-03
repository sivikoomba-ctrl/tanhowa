"use client";

import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, ZoomIn, ZoomOut } from "lucide-react";

interface PhotoCropDialogProps {
  open: boolean;
  imageSrc: string;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

function getCroppedImg(imageSrc: string, crop: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = Math.min(crop.width, crop.height);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }

      ctx.drawImage(
        image,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, size, size
      );

      canvas.toBlob(
        (blob) => { if (blob) resolve(blob); else reject(new Error("Crop failed")); },
        "image/jpeg",
        0.9
      );
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
}

export function PhotoCropDialog({ open, imageSrc, onCrop, onCancel }: PhotoCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  async function handleCrop() {
    if (!croppedArea) return;
    setCropping(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedArea);
      onCrop(blob);
    } catch {
      onCancel();
    } finally {
      setCropping(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop size={16} className="text-primary" />
            Crop Your Photo
          </DialogTitle>
        </DialogHeader>
        <div className="relative w-full h-[350px] bg-black/5">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <ZoomOut size={14} className="text-muted-foreground" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full accent-primary"
            />
            <ZoomIn size={14} className="text-muted-foreground" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
            <Button className="flex-1" onClick={handleCrop} disabled={cropping}>
              {cropping ? "Cropping..." : "Crop & Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
