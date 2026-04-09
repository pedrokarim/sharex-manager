import { z } from "zod";

export const UPLOAD_CONFIG_LIMITS = {
  maxFileSizeMb: { min: 1, max: 1024, step: 1 },
  minFileSizeKb: { min: 1, max: 10_240, step: 1 },
  maxFilesPerUpload: { min: 1, max: 500, step: 1 },
  maxFilesPerType: { min: 1, max: 500, step: 1 },
  thumbnailDimensionPx: { min: 64, max: 4096, step: 16 },
  thumbnailQuality: { min: 0, max: 100, step: 1 },
  thumbnailBlurPx: { min: 0, max: 20, step: 0.5 },
} as const;

const uploadConfigBaseSchema = z
  .object({
    allowedTypes: z
      .object({
        images: z.boolean().optional().nullable(),
        documents: z.boolean().optional().nullable(),
        archives: z.boolean().optional().nullable(),
      })
      .optional()
      .nullable(),
    limits: z
      .object({
        maxFileSize: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.maxFileSizeMb.min)
          .max(UPLOAD_CONFIG_LIMITS.maxFileSizeMb.max)
          .optional()
          .nullable(),
        minFileSize: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.minFileSizeKb.min)
          .max(UPLOAD_CONFIG_LIMITS.minFileSizeKb.max)
          .optional()
          .nullable(),
        maxFilesPerUpload: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.maxFilesPerUpload.min)
          .max(UPLOAD_CONFIG_LIMITS.maxFilesPerUpload.max)
          .optional()
          .nullable(),
        maxFilesPerType: z
          .object({
            images: z
              .number()
              .min(UPLOAD_CONFIG_LIMITS.maxFilesPerType.min)
              .max(UPLOAD_CONFIG_LIMITS.maxFilesPerType.max)
              .optional()
              .nullable(),
            documents: z
              .number()
              .min(UPLOAD_CONFIG_LIMITS.maxFilesPerType.min)
              .max(UPLOAD_CONFIG_LIMITS.maxFilesPerType.max)
              .optional()
              .nullable(),
            archives: z
              .number()
              .min(UPLOAD_CONFIG_LIMITS.maxFilesPerType.min)
              .max(UPLOAD_CONFIG_LIMITS.maxFilesPerType.max)
              .optional()
              .nullable(),
          })
          .optional()
          .nullable(),
      })
      .optional()
      .nullable(),
    filenamePattern: z.string().optional().nullable(),
    thumbnails: z
      .object({
        enabled: z.boolean().optional().nullable(),
        format: z
          .enum(["auto", "jpeg", "png", "webp"])
          .optional()
          .nullable(),
        preserveFormat: z.boolean().optional().nullable(),
        fit: z
          .enum(["cover", "contain", "fill", "inside", "outside"])
          .optional()
          .nullable(),
        background: z.string().optional().nullable(),
        blur: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.thumbnailBlurPx.min)
          .max(UPLOAD_CONFIG_LIMITS.thumbnailBlurPx.max)
          .optional()
          .nullable(),
        sharpen: z.boolean().optional().nullable(),
        metadata: z.boolean().optional().nullable(),
        maxWidth: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.thumbnailDimensionPx.min)
          .max(UPLOAD_CONFIG_LIMITS.thumbnailDimensionPx.max)
          .optional()
          .nullable(),
        maxHeight: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.thumbnailDimensionPx.min)
          .max(UPLOAD_CONFIG_LIMITS.thumbnailDimensionPx.max)
          .optional()
          .nullable(),
        quality: z
          .number()
          .min(UPLOAD_CONFIG_LIMITS.thumbnailQuality.min)
          .max(UPLOAD_CONFIG_LIMITS.thumbnailQuality.max)
          .optional()
          .nullable(),
      })
      .optional()
      .nullable(),
    storage: z
      .object({
        path: z.string().optional().nullable(),
        structure: z.enum(["flat", "date", "type"]).optional().nullable(),
        preserveFilenames: z.boolean().optional().nullable(),
        replaceExisting: z.boolean().optional().nullable(),
        thumbnailsPath: z.string().optional().nullable(),
        dateFormat: z
          .object({
            folderStructure: z.string().optional().nullable(),
            timezone: z.string().optional().nullable(),
          })
          .optional()
          .nullable(),
        permissions: z
          .object({
            files: z.string().optional().nullable(),
            directories: z.string().optional().nullable(),
          })
          .optional()
          .nullable(),
      })
      .optional()
      .nullable(),
    domains: z
      .object({
        list: z
          .array(
            z.object({
              id: z.string().optional().nullable(),
              name: z.string().optional().nullable(),
              url: z.string().optional().nullable(),
              isDefault: z.boolean().optional().nullable(),
            }),
          )
          .optional()
          .nullable(),
        defaultDomain: z.string().optional().nullable(),
        useSSL: z.boolean().optional().nullable(),
        pathPrefix: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    uploads: z.array(z.any()).optional().nullable(),
    lastUpdate: z.string().optional().nullable(),
  })
  .partial();

export const uploadConfigSchema = uploadConfigBaseSchema.superRefine(
  (config, ctx) => {
    const limits = config.limits;

    if (
      typeof limits?.minFileSize === "number" &&
      typeof limits?.maxFileSize === "number" &&
      limits.minFileSize > limits.maxFileSize * 1024
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "La taille minimale ne peut pas dépasser la taille maximale.",
        path: ["limits", "minFileSize"],
      });
    }

    if (
      typeof limits?.maxFilesPerUpload === "number" &&
      limits.maxFilesPerType
    ) {
      for (const type of ["images", "documents", "archives"] as const) {
        const value = limits.maxFilesPerType[type];
        if (
          typeof value === "number" &&
          value > limits.maxFilesPerUpload
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "La limite par type ne peut pas dépasser la limite totale d'un upload.",
            path: ["limits", "maxFilesPerType", type],
          });
        }
      }
    }
  },
);

export type UploadConfig = z.infer<typeof uploadConfigSchema>;
