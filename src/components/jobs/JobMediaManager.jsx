import React, { useEffect, useState } from "react";
import { Camera, Upload, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { getSignedPhotoUrls } from "@/lib/photoUrls";

export default function JobMediaManager({
  photosBefore = [],
  photosAfter = [],
  onAdd,
  onRemove,
  disabled = false,
}) {
  const [uploading, setUploading] = useState(null);
  // Stored values are private file URIs; display uses short-lived signed URLs.
  const [displayMap, setDisplayMap] = useState({});

  useEffect(() => {
    let active = true;
    const stored = [...photosBefore, ...photosAfter];
    if (!stored.length) return undefined;
    (async () => {
      const signed = await getSignedPhotoUrls(stored);
      if (!active) return;
      const map = {};
      stored.forEach((uri, i) => { map[uri] = signed[i]; });
      setDisplayMap(map);
    })();
    return () => { active = false; };
  }, [photosBefore, photosAfter]);

  const handleUpload = async (category) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      setUploading(category);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          const { base44 } = await import("@/api/base44Client");
          const result = await base44.integrations.Core.UploadPrivateFile({ file });
          if (result?.file_uri) {
            onAdd(category, result.file_uri);
          }
        }
        toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} uploaded`);
      } catch (err) {
        toast.error("Could not upload photo");
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  const removePhoto = (category, url) => {
    onRemove(category, url);
  };

  return (
    <div className="space-y-6">
      {/* Before */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-heading font-semibold text-card-foreground text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-muted-foreground" />
            Before Photos
          </h4>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-lg h-8 text-xs"
            onClick={() => handleUpload("before")}
            disabled={disabled || !!uploading}
          >
            {uploading === "before" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Add
          </Button>
        </div>
        <PhotoGrid photos={photosBefore} displayMap={displayMap} onRemove={(url) => removePhoto("before", url)} disabled={disabled} />
      </div>

      {/* After */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-heading font-semibold text-card-foreground text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-500" />
            After Photos
          </h4>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-lg h-8 text-xs"
            onClick={() => handleUpload("after")}
            disabled={disabled || !!uploading}
          >
            {uploading === "after" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Add
          </Button>
        </div>
        <PhotoGrid photos={photosAfter} displayMap={displayMap} onRemove={(url) => removePhoto("after", url)} disabled={disabled} />
      </div>
    </div>
  );
}

function PhotoGrid({ photos = [], displayMap = {}, onRemove, disabled }) {
  if (!photos.length) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        <div className="aspect-square rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50">
          <ImageIcon className="w-6 h-6" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      <AnimatePresence>
        {photos.map((url, i) => (
          <motion.div
            key={url}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative aspect-square rounded-xl overflow-hidden border border-border bg-muted"
          >
            <img
              src={displayMap[url] || url}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover"
            />
            {!disabled && (
              <button
                onClick={() => onRemove(url)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}