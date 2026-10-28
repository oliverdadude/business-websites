import type { ImportIssue, ImportType } from "@/lib/import";

export interface ImportPreview {
  type: ImportType;
  rowCount: number;
  creates: number;
  updates: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  cycles: string[][];
  sample: Record<string, unknown>[];
}
