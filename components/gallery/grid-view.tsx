import { FileInfo } from "@/types"
import { Card, CardContent } from "../ui/card"
import { Button } from "../ui/button"
import { Copy, ExternalLink, Trash2 } from "lucide-react"
import Image from "next/image"

interface GridViewProps {
  files: FileInfo[]
  onCopy: (url: string) => void
  onDelete: (name: string) => void
  onSelect: (file: FileInfo) => void
}

export function GridView({ files, onCopy, onDelete, onSelect }: GridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {files.map((file) => (
        <Card key={file.name} className="overflow-hidden">
          <CardContent className="p-0">
            <div 
              className="relative aspect-square cursor-pointer"
              onClick={() => onSelect(file)}
            >
              <Image
                src={file.url}
                alt={file.name}
                fill
                className="object-cover"
              />
            </div>
            <div className="p-4">
              <p className="mb-2 truncate text-sm">{file.name}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onCopy(file.url)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" asChild>
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onDelete(file.name)}
                  className="ml-auto text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
} 