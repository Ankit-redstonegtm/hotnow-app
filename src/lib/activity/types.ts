export type ActivityStatus = "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled";
export type ActivityItem = {
  id: string; workspaceId: string; workspace: string; kind: string; title: string;
  status: ActivityStatus; phase: string; timestamp: string; error?: string;
  candidates?: number; matched?: number; target?: number;
  completed?: number; total?: number; results?: number; attempts?: number;
  canCancel?: boolean; canRetry?: boolean;
};
export type ActivitySnapshot = { items: ActivityItem[]; active: number; mode: string; observedAt: string; queueAvailable: boolean };
export const isActive = (item: Pick<ActivityItem, "status">) => ["queued", "running", "retrying"].includes(item.status);
