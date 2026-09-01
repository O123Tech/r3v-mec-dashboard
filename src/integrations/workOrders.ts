import type { WorkOrder } from '../data/schema'

export interface WorkOrderSyncResult {
  success: boolean
  viewUrl?: string
  pdfUrl?: string
  signoffCleared?: boolean
  mechanicSignoff?: WorkOrder['mechanicSignoff']
  error?: string
}

export interface MechanicProfile {
  id: string
  name: string
  email: string
  role: 'Mechanic' | 'Lead Mechanic'
  active: boolean
  canViewAllJobs: boolean
  canEditAllJobs: boolean
}

export interface MechanicPermissions {
  canViewAllJobs: boolean
  canEditAllJobs: boolean
}

export interface WorkOrderListResult {
  success: boolean
  workOrders?: Array<Omit<WorkOrder, 'id'>>
  mechanic?: MechanicProfile
  permissions?: MechanicPermissions
  viewUrl?: string
  pdfUrl?: string
  error?: string
}

export interface WorkOrderPayload {
  _action: 'activateMechanicInvite' | 'listMechanicWorkOrders' | 'saveMechanicWorkOrder' | 'signOffMechanicWorkOrder'
  sessionToken?: string
  inviteToken?: string
  mechanicName?: string
  workOrderNumber?: string
  workOrder?: WorkOrder
  totals?: {
    serviceSubtotal: number
    partsSubtotal: number
    shopFees: number
    taxRate: number
    grandTotal: number
  }
}

export interface MechanicActivationResult {
  success: boolean
  sessionToken?: string
  mechanic?: MechanicProfile
  permissions?: MechanicPermissions
  error?: string
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
  sessionToken: string,
  workOrder: WorkOrder,
): Promise<WorkOrderSyncResult> {
  const json = await jsonpRequest<WorkOrderSyncResult>(scriptUrl, {
    _action: 'saveMechanicWorkOrder',
    sessionToken,
    workOrder: mechanicSafeWorkOrder(workOrder),
  } satisfies WorkOrderPayload)
  if (!json.success) throw new Error(json.error ?? 'Unknown error from Apps Script')
  return json
}

export async function fetchMechanicWorkOrders(
  scriptUrl: string,
  sessionToken: string,
): Promise<{ workOrders: Array<Omit<WorkOrder, 'id'>>; mechanic: MechanicProfile; permissions: MechanicPermissions }> {
  const json = await jsonpRequest<WorkOrderListResult>(scriptUrl, { _action: 'listMechanicWorkOrders', sessionToken })
  if (!json.success) throw new Error(json.error ?? 'Unknown error from Apps Script')
  if (!Array.isArray(json.workOrders)) {
    throw new Error('Apps Script is reachable, but this deployed version does not include the mechanic work-order endpoint. Redeploy the latest invoice.js as a new Web App version.')
  }
  if (!json.mechanic || !json.permissions) throw new Error('Mechanic access information was not returned. Redeploy Apps Script.')
  return { workOrders: json.workOrders, mechanic: json.mechanic, permissions: json.permissions }
}

export async function activateMechanicInvite(
  scriptUrl: string,
  inviteToken: string,
  mechanicName: string,
): Promise<{ sessionToken: string; mechanic: MechanicProfile; permissions: MechanicPermissions }> {
  const json = await jsonpRequest<MechanicActivationResult>(scriptUrl, {
    _action: 'activateMechanicInvite',
    inviteToken,
    mechanicName,
  } satisfies WorkOrderPayload)
  if (!json.success) throw new Error(json.error ?? 'Could not activate this device.')
  if (!json.sessionToken || !json.mechanic || !json.permissions) throw new Error('Activation response was incomplete. Ask the owner for a new invite.')
  return { sessionToken: json.sessionToken, mechanic: json.mechanic, permissions: json.permissions }
}

export async function signOffMechanicWorkOrder(
  scriptUrl: string,
  sessionToken: string,
  workOrderNumber: string,
): Promise<NonNullable<WorkOrder['mechanicSignoff']>> {
  const json = await jsonpRequest<WorkOrderSyncResult>(scriptUrl, {
    _action: 'signOffMechanicWorkOrder',
    sessionToken,
    workOrderNumber,
  } satisfies WorkOrderPayload)
  if (!json.success) throw new Error(json.error ?? 'Could not sign off this work order.')
  if (!json.mechanicSignoff) throw new Error('Apps Script did not return the sign-off record.')
  return json.mechanicSignoff
}
