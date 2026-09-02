export type MechanicSortMode = 'priority' | 'newest' | 'workOrder'

interface SortableWorkOrder {
  workOrderNumber: string
  status: string
  dateOpened?: string
}

const STATUS_PRIORITY: Record<string, number> = {
  Today: 0,
  'In Progress': 1,
  Active: 2,
  'On Hold': 3,
  Ready: 4,
  Draft: 5,
  Complete: 6,
  Cancelled: 7,
  Archived: 8,
}

function openedAt(job: SortableWorkOrder): number {
  const timestamp = Date.parse(job.dateOpened ?? '')
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

function compareWorkOrderDescending(a: SortableWorkOrder, b: SortableWorkOrder): number {
  return b.workOrderNumber.localeCompare(a.workOrderNumber, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function sortMechanicWorkOrders<T extends SortableWorkOrder>(jobs: T[], mode: MechanicSortMode): T[] {
  return [...jobs].sort((a, b) => {
    if (mode === 'workOrder') return compareWorkOrderDescending(a, b) || openedAt(b) - openedAt(a)

    if (mode === 'priority') {
      const priorityDelta = (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
      if (priorityDelta !== 0) return priorityDelta
    }

    return openedAt(b) - openedAt(a) || compareWorkOrderDescending(a, b)
  })
}
