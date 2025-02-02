import { z } from "zod";

export const uploadConfigSchema = z.object({
  allowedTypes: z.object({
    images: z.boolean().optional().nullable(),
    documents: z.boolean().optional().nullable(),
    archives: z.boolean().optional().nullable(),
  }).optional().nullable(),
  limits: z.object({
    maxFileSize: z.number().min(1).optional().nullable(),
    minFileSize: z.number().min(1).optional().nullable(),
    maxFilesPerUpload: z.number().min(1).optional().nullable(),
    maxFilesPerType: z.object({
      images: z.number().min(1).optional().nullable(),
      documents: z.number().min(1).optional().nullable(),
      archives: z.number().min(1).optional().nullable(),
    }).optional().nullable(),
  }).optional().nullable(),
  filenamePattern: z.string().optional().nullable(),
  thumbnails: z.object({
    enabled: z.boolean().optional().nullable(),
    format: z.enum(["auto", "jpeg", "png", "webp"]).optional().nullable(),
    preserveFormat: z.boolean().optional().nullable(),
    fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).optional().nullable(),
    background: z.string().optional().nullable(),
    blur: z.number().min(0).max(20).optional().nullable(),
    sharpen: z.boolean().optional().nullable(),
    metadata: z.boolean().optional().nullable(),
    maxWidth: z.number().min(1).optional().nullable(),
    maxHeight: z.number().min(1).optional().nullable(),
    quality: z.number().min(0).max(100).optional().nullable(),
  }).optional().nullable(),
  storage: z.object({
    path: z.string().optional().nullable(),
    structure: z.enum(["flat", "date", "type"]).optional().nullable(),
    preserveFilenames: z.boolean().optional().nullable(),
    replaceExisting: z.boolean().optional().nullable(),
    thumbnailsPath: z.string().optional().nullable(),
    dateFormat: z.object({
      folderStructure: z.string().optional().nullable(),
      timezone: z.string().optional().nullable(),
    }).optional().nullable(),
    permissions: z.object({
      files: z.string().optional().nullable(),
      directories: z.string().optional().nullable(),
    }).optional().nullable(),
  }).optional().nullable(),
  domains: z.object({
    list: z.array(z.object({
      id: z.string().optional().nullable(),
      name: z.string().optional().nullable(),
      url: z.string().optional().nullable(),
      isDefault: z.boolean().optional().nullable(),
    })).optional().nullable(),
    defaultDomain: z.string().optional().nullable(),
    useSSL: z.boolean().optional().nullable(),
    pathPrefix: z.string().optional().nullable(),
  }).optional().nullable(),
  uploads: z.array(z.any()).optional().nullable(),
  lastUpdate: z.string().optional().nullable(),
}).partial();

export type UploadConfig = z.infer<typeof uploadConfigSchema>; 