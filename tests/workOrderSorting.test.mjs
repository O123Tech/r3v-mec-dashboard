import assert from 'node:assert/strict'
import test from 'node:test'

import { sortMechanicWorkOrders } from '../src/jobs/sortWorkOrders.ts'

const jobs = [
  { workOrderNumber: 'WO-9', status: 'Active', dateOpened: '2026-08-30' },
  { workOrderNumber: 'WO-11', status: 'In Progress', dateOpened: '2026-08-28' },
  { workOrderNumber: 'WO-10', status: 'Today', dateOpened: '2026-08-29' },
  { workOrderNumber: 'WO-12', status: 'On Hold', dateOpened: '2026-09-01' },
  { workOrderNumber: 'WO-8', status: 'Active', dateOpened: '' },
  { workOrderNumber: 'WO-13', status: 'Active', dateOpened: '2026-08-30' },
]

test('mechanic can choose predictable priority, newest, or work-order ordering', () => {
  assert.deepEqual(
    sortMechanicWorkOrders(jobs, 'priority').map(job => job.workOrderNumber),
    ['WO-10', 'WO-11', 'WO-13', 'WO-9', 'WO-8', 'WO-12'],
  )
  assert.deepEqual(
    sortMechanicWorkOrders(jobs, 'newest').map(job => job.workOrderNumber),
    ['WO-12', 'WO-13', 'WO-9', 'WO-10', 'WO-11', 'WO-8'],
  )
  assert.deepEqual(
    sortMechanicWorkOrders(jobs, 'workOrder').map(job => job.workOrderNumber),
    ['WO-13', 'WO-12', 'WO-11', 'WO-10', 'WO-9', 'WO-8'],
  )
})
