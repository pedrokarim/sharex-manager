import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileInfo } from "@/types/files";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Lock,
  Star,
  Trash2,
  Unlock,
} from "lucide-react";

interface FileViewerProps {
  file: FileInfo | null;
  onClose: () => void;
  onDelete: (filename: string) => Promise<void>;
  onCopy: (url: string) => Promise<void>;
  onToggleSecurity: (file: FileInfo) => Promise<void>;
  onToggleStar: (file: FileInfo) => Promise<void>;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function FileViewer({
  file,
  onClose,
  onDelete,
  onCopy,
  onToggleSecurity,
  onToggleStar,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: FileViewerProps) {
  // ... code existant ...

  return (
    <Dialog open={!!file} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-screen-lg">
        <DialogHeader className="bg-gradient-to-b from-background to-muted/50 p-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{file?.name}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => file && onToggleStar(file)}
                className={cn("h-8 w-8", file?.isStarred && "text-yellow-500")}
              >
                <Star className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => file && onToggleSecurity(file)}
                className="h-8 w-8"
              >
                {file?.isSecure ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => file && onCopy(file.url)}
                className="h-8 w-8"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                <a href={file?.url} download>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                <a href={file?.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => file && onDelete(file.name)}
                className="h-8 w-8 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="relative aspect-video">
          {file && (
            <Image
              src={file.url}
              alt={file.name}
              fill
              className="object-contain"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2"
            onClick={onPrevious}
            disabled={!hasPrevious}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2"
            onClick={onNext}
            disabled={!hasNext}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
