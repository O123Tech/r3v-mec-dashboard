import type { WorkOrder } from '../data/schema'

export interface WorkOrderSyncResult {
  success: boolean
  viewUrl?: string
  pdfUrl?: string
  error?: string
}

export interface WorkOrderListResult {
  success: boolean
  workOrders?: Array<Omit<WorkOrder, 'id'>>
  viewUrl?: string
  pdfUrl?: string
  error?: string
}

export interface WorkOrderPayload {
  _action: 'listMechanicWorkOrders' | 'saveMechanicWorkOrder'
  workOrder?: WorkOrder
  totals?: {
    serviceSubtotal: number
    partsSubtotal: number
    shopFees: number
    taxRate: number
    grandTotal: number
  }
}

function jsonpRequest<T>(scriptUrl: string, payload: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `r3vMechanic_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const url = new URL(scriptUrl)
    url.searchParams.set('callback', callbackName)
    url.searchParams.set('payload', JSON.stringify(payload))

    const script = document.createElement('script')
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Apps Script did not respond. Check the Web App URL and deployment access.'))
    }, 30000)

    function cleanup() {
      window.clearTimeout(timer)
      script.remove()
      delete (window as unknown as Record<string, unknown>)[callbackName]
    }

    ;(window as unknown as Record<string, (value: T) => void>)[callbackName] = (value: T) => {
      cleanup()
      resolve(value)
    }

    script.onerror = () => {
      cleanup()
      reject(new Error('Could not reach Apps Script. Check the Web App URL and deployment access.'))
    }
    script.src = url.toString()
    document.body.appendChild(script)
  })
}

function mechanicSafeWorkOrder(workOrder: WorkOrder): WorkOrder {
  return {
    ...workOrder,
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    customerCity: '',
    customerPostal: '',
    servicePerformed: workOrder.servicePerformed.map(line => ({
      ...line,
      unitPrice: 0,
      taxable: false,
    })),
    partsUsed: [],
    shopFees: 0,
    taxRate: 0,
    taxEnabled: false,
    pdfUrl: '',
  }
}

export async function saveMechanicWorkOrder(
  scriptUrl: string,
  workOrder: WorkOrder,
): Promise<WorkOrderSyncResult> {
  const json = await jsonpRequest<WorkOrderSyncResult>(scriptUrl, {
    _action: 'saveMechanicWorkOrder',
    workOrder: mechanicSafeWorkOrder(workOrder),
  } satisfies WorkOrderPayload)
  if (!json.success) throw new Error(json.error ?? 'Unknown error from Apps Script')
  return json
}

export async function fetchMechanicWorkOrders(scriptUrl: string): Promise<Array<Omit<WorkOrder, 'id'>>> {
  const json = await jsonpRequest<WorkOrderListResult>(scriptUrl, { _action: 'listMechanicWorkOrders' })
  if (!json.success) throw new Error(json.error ?? 'Unknown error from Apps Script')
  if (!Array.isArray(json.workOrders)) {
    throw new Error('Apps Script is reachable, but this deployed version does not include the mechanic work-order endpoint. Redeploy the latest invoice.js as a new Web App version.')
  }
  return json.workOrders
}
