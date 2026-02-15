import {
  Sparkles,
  Settings,
  Image,
  Wand2,
  Bot,
  Puzzle,
  FileImage,
  Palette,
  Zap,
  Star,
  Shield,
  Globe,
  Code,
  Music,
  Video,
  Camera,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Settings,
  Image,
  Wand2,
  Bot,
  Puzzle,
  FileImage,
  Palette,
  Zap,
  Star,
  Shield,
  Globe,
  Code,
  Music,
  Video,
  Camera,
};

export function resolveIcon(name?: string): LucideIcon {
  if (!name) return Puzzle;
  return iconMap[name] || Puzzle;
}
