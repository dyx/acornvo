import { z } from 'zod'

export const GroveColorSchema = z.enum(['acorn', 'leaf', 'berry', 'sky'])

export const SyncProviderSchema = z.enum([
  'iCloud',
  'Dropbox',
  'OneDrive',
  'GoogleDrive',
  'Nextcloud',
  'pCloud'
])

export const ProjectJsonSchema = z.object({
  id: z.string().uuid(),
  schema_version: z.literal(1),
  name: z.string().min(1).max(120),
  color: GroveColorSchema,
  created_at: z.string().datetime({ offset: true }),
  last_opened_at: z.string().datetime({ offset: true }),
  sync_warning: SyncProviderSchema.nullable().optional()
})

export type ProjectJson = z.infer<typeof ProjectJsonSchema>

export const RecentItemSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  name: z.string().min(1),
  color: GroveColorSchema,
  pinned: z.boolean(),
  last_opened_at: z.string().datetime({ offset: true }),
  files_count: z.number().int().nonnegative()
})

export const RecentProjectsFileSchema = z.object({
  schema_version: z.literal(1),
  items: z.array(RecentItemSchema)
})

export type RecentProjectsFile = z.infer<typeof RecentProjectsFileSchema>

export const LockInfoSchema = z.object({
  pid: z.number().int().positive(),
  hostname: z.string().min(1),
  started_at: z.string().datetime({ offset: true })
})

export type LockInfoFile = z.infer<typeof LockInfoSchema>
