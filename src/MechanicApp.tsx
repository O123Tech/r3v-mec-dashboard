import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  LogOut,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react'
import type { WorkOrder, WorkOrderHoldReason, WorkOrderLine, WorkOrderPartNeeded } from './data/schema'
import { PARTS_ORDER_STATUSES, PARTS_STORES } from './data/canonicalLabels'
import {
  activateMechanicInvite,
  activateMechanicPairingCode,
  fetchMechanicWorkOrders,
  saveMechanicWorkOrder,
  signOffMechanicWorkOrder,
  type MechanicPermissions,
  type MechanicProfile,
} from './integrations/workOrders'
import { normalizePairingCode } from './access/pairing'
import { sortMechanicWorkOrders, type MechanicSortMode } from './jobs/sortWorkOrders'

type MechanicFilter = 'mine' | 'unassigned' | 'open' | 'complete'
type MobileView = 'list' | 'detail'

interface MechanicPrefs {
  scriptUrl: string
  mechanicName: string
  filter: MechanicFilter
  sort: MechanicSortMode
}

const PREFS_KEY = 'r3v_mechanic_app_prefs'
const ACCESS_KEY = 'r3v_mechanic_device_access'
const DEFAULT_SCRIPT_URL = (import.meta.env.VITE_APPS_SCRIPT_URL ?? '').trim()
const MECHANIC_STATUSES: WorkOrder['status'][] = ['Today', 'Active', 'In Progress', 'On Hold']
const HOLD_REASONS: WorkOrderHoldReason[] = ['', 'Waiting Parts', 'Waiting Approval', 'Waiting Customer', 'Waiting Payment', 'Other']

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function loadPrefs(): MechanicPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { scriptUrl: '', mechanicName: '', filter: 'open', sort: 'priority' }
    const parsed = JSON.parse(raw) as Partial<MechanicPrefs>
    return {
      scriptUrl: parsed.scriptUrl ?? '',
      mechanicName: parsed.mechanicName ?? '',
      filter: parsed.filter ?? 'mine',
      sort: parsed.sort ?? 'priority',
    }
  } catch {
    return { scriptUrl: '', mechanicName: '', filter: 'mine', sort: 'priority' }
  }
}

function savePrefs(prefs: MechanicPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

interface StoredMechanicAccess {
  scriptUrl: string
  sessionToken: string
  mechanic: MechanicProfile
  permissions: MechanicPermissions
}

function loadStoredAccess(): StoredMechanicAccess | null {
  try {
    const raw = localStorage.getItem(ACCESS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredMechanicAccess
    return parsed.scriptUrl && parsed.sessionToken && parsed.mechanic?.id ? parsed : null
  } catch {
    return null
  }
}

function saveStoredAccess(access: StoredMechanicAccess) {
  localStorage.setItem(ACCESS_KEY, JSON.stringify(access))
}

function activationParameters() {
  const params = new URLSearchParams(window.location.search)
  return {
    inviteToken: params.get('invite') ?? '',
    endpoint: params.get('endpoint') ?? '',
    requestedJob: params.get('job') ?? '',
  }
}

function isValidAppsScriptUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.hostname === 'script.google.com' && url.pathname.endsWith('/exec')
  } catch {
    return false
  }
}

function vehicleLabel(wo: WorkOrder): string {
  return [wo.vehicleYear, wo.vehicleMake, wo.vehicleModel, wo.vehicleTrim].filter(Boolean).join(' ')
}

function blankPartNeeded(): WorkOrderPartNeeded {
  return { id: uid(), description: '', quantity: 1, supplier: '', status: 'Needed', notes: '' }
}

function blankServiceLine(): WorkOrderLine {
  return { id: uid(), description: '', quantity: 1, unitPrice: 0, taxable: true }
}

function isOpenWorkOrder(wo: WorkOrder): boolean {
  return !['Complete', 'Archived', 'Cancelled'].includes(wo.status)
}

function statusTone(status: WorkOrder['status']): string {
  if (status === 'Complete') return 'success'
  if (status === 'On Hold') return 'warning'
  if (status === 'Active' || status === 'In Progress') return 'active'
  return 'neutral'
}

export function MechanicApp() {
  const initialAccess = useMemo(() => loadStoredAccess(), [])
  const initialActivation = useMemo(() => activationParameters(), [])
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [prefs, setPrefs] = useState<MechanicPrefs>(() => ({ ...loadPrefs(), mechanicName: initialAccess?.mechanic.name ?? '' }))
  const [scriptUrl] = useState(() => initialAccess?.scriptUrl || initialActivation.endpoint || DEFAULT_SCRIPT_URL || loadPrefs().scriptUrl)
  const [sessionToken, setSessionToken] = useState(() => initialAccess?.sessionToken ?? '')
  const [mechanic, setMechanic] = useState<MechanicProfile | null>(() => initialAccess?.mechanic ?? null)
  const [permissions, setPermissions] = useState<MechanicPermissions>(() => initialAccess?.permissions ?? { canViewAllJobs: false, canEditAllJobs: false })
  const [activationName, setActivationName] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set())
  const [mobileView, setMobileView] = useState<MobileView>('list')
  // Local input buffers — prevent iOS re-render from clearing typed text
  const [localDiagnostics, setLocalDiagnostics] = useState('')
  const [localMechanicNotes, setLocalMechanicNotes] = useState('')

  useEffect(() => {
    const online  = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online',  online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyIds.size) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirtyIds])

  async function loadWorkOrders(preserveId?: string | null, accessOverride?: StoredMechanicAccess) {
    const activeScriptUrl = (accessOverride?.scriptUrl ?? scriptUrl).trim()
    const activeSessionToken = accessOverride?.sessionToken ?? sessionToken
    if (!activeScriptUrl || !activeSessionToken) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await fetchMechanicWorkOrders(activeScriptUrl, activeSessionToken)
      const fetched = result.workOrders.map((wo, index) => ({
          ...wo,
          id: wo.sheetUrl || wo.workOrderNumber || `${wo.vehicleVin || 'wo'}-${index}`,
          assignedMechanic: wo.assignedMechanic ?? '',
          mechanicNotes: wo.mechanicNotes ?? wo.internalNotes ?? '',
          partsNeeded: wo.partsNeeded ?? [],
          servicePerformed: wo.servicePerformed ?? [],
        }))
      setWorkOrders(fetched)
      setDirtyIds(new Set())
      setMechanic(result.mechanic)
      setPermissions(result.permissions)
      setPrefs(current => ({ ...current, mechanicName: result.mechanic.name }))
      saveStoredAccess({ scriptUrl: activeScriptUrl, sessionToken: activeSessionToken, mechanic: result.mechanic, permissions: result.permissions })

      const preferredId = preserveId && fetched.find(wo => wo.id === preserveId)?.id
      const requestedId = initialActivation.requestedJob
        ? fetched.find(wo => wo.workOrderNumber === initialActivation.requestedJob)?.id
        : null
      const nextVisible = sortMechanicWorkOrders(
        filteredWorkOrdersFor(fetched, { ...prefs, mechanicName: result.mechanic.name }, search),
        prefs.sort,
      )[0]?.id ?? fetched[0]?.id ?? null
      setSelectedId(preferredId ?? requestedId ?? nextVisible)
      if (requestedId) setMobileView('detail')
      setMessage(
        fetched.length
          ? `Loaded ${fetched.length} work order${fetched.length === 1 ? '' : 's'}.`
          : 'Connected, but no mechanic-visible work orders were returned.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load work orders')
    } finally {
      setLoading(false)
    }
  }

  async function activateDevice() {
    const endpoint = scriptUrl.trim()
    if (!isValidAppsScriptUrl(endpoint)) {
      setError('Device activation is not configured yet. Ask the owner to finish the mechanic app setup.')
      return
    }
    if (!activationName.trim()) {
      setError('Enter your mechanic name exactly as it appears on the invitation.')
      return
    }
    if (!initialActivation.inviteToken && normalizePairingCode(pairingCode).length !== 9) {
      setError('Enter the 8-character pairing code from the owner.')
      return
    }
    setActivating(true)
    setError(null)
    try {
      const result = initialActivation.inviteToken
        ? await activateMechanicInvite(endpoint, initialActivation.inviteToken, activationName.trim())
        : await activateMechanicPairingCode(endpoint, normalizePairingCode(pairingCode), activationName.trim())
      const access = { scriptUrl: endpoint, ...result }
      saveStoredAccess(access)
      setSessionToken(result.sessionToken)
      setMechanic(result.mechanic)
      setPermissions(result.permissions)
      setPrefs(current => ({ ...current, mechanicName: result.mechanic.name, filter: 'mine' }))
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('invite')
      cleanUrl.searchParams.delete('endpoint')
      window.history.replaceState({}, '', cleanUrl)
      await loadWorkOrders(undefined, access)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate this device.')
    } finally {
      setActivating(false)
    }
  }

  useEffect(() => {
    if (scriptUrl.trim() && sessionToken) loadWorkOrders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleWorkOrders = useMemo(
    () => sortMechanicWorkOrders(filteredWorkOrdersFor(workOrders, prefs, search), prefs.sort),
    [workOrders, prefs, search],
  )

  useEffect(() => {
    if (!permissions.canViewAllJobs && (prefs.filter === 'open' || prefs.filter === 'unassigned')) {
      setPrefs(current => ({ ...current, filter: 'mine' }))
    }
  }, [permissions.canViewAllJobs, prefs.filter])

  useEffect(() => {
    if (!visibleWorkOrders.length) {
      setSelectedId(null)
      setMobileView('list')
      return
    }
    if (!selectedId || !visibleWorkOrders.some(wo => wo.id === selectedId)) {
      setSelectedId(visibleWorkOrders[0].id)
    }
  }, [selectedId, visibleWorkOrders])

  const selected = workOrders.find(wo => wo.id === selectedId) ?? null
  const hasUnsavedChanges = selected ? dirtyIds.has(selected.id) : false
  const isActivated = Boolean(scriptUrl.trim() && sessionToken && mechanic)
  const canEditSelected = selected?.canEdit !== false

  useEffect(() => {
    setLocalDiagnostics(selected?.diagnostics ?? '')
    setLocalMechanicNotes(selected?.mechanicNotes ?? '')
  }, [selectedId])

  async function refreshWorkOrders() {
    if (dirtyIds.size && !window.confirm('Refresh jobs and discard all unsaved changes?')) return
    await loadWorkOrders(selectedId)
  }

  function logoutDevice() {
    if (dirtyIds.size && !window.confirm('Sign out and discard unsaved changes on this device?')) return
    localStorage.removeItem(ACCESS_KEY)
    setSessionToken('')
    setMechanic(null)
    setPermissions({ canViewAllJobs: false, canEditAllJobs: false })
    setWorkOrders([])
    setSelectedId(null)
    setMobileView('list')
    setMessage(null)
    setError('This device is signed out. Ask the owner for a new activation invite.')
  }

  function openWorkOrder(id: string) {
    if (id !== selectedId && hasUnsavedChanges) {
      const shouldSwitch = window.confirm('This job has unsaved changes. Switch jobs anyway? Your edits will remain unsaved.')
      if (!shouldSwitch) return
    }
    setSelectedId(id)
    setMobileView('detail')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
  }

  function showJobList() {
    if (hasUnsavedChanges) {
      const shouldLeave = window.confirm('Return to the job list with unsaved changes? Your edits will remain unsaved.')
      if (!shouldLeave) return
    }
    setMobileView('list')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
  }

  function markSelectedDirty() {
    if (!selected || !canEditSelected) return
    setDirtyIds(current => new Set(current).add(selected.id))
    setMessage(null)
  }

  function patchSelected(patch: Partial<WorkOrder>) {
    if (!selected || !canEditSelected) return
    setWorkOrders(current => current.map(wo => wo.id === selected.id ? { ...wo, ...patch } : wo))
    setDirtyIds(current => new Set(current).add(selected.id))
    setMessage(null)
  }

  function updatePartNeeded(id: string, patch: Partial<WorkOrderPartNeeded>) {
    if (!selected) return
    patchSelected({
      partsNeeded: (selected.partsNeeded ?? []).map(part => part.id === id ? { ...part, ...patch } : part),
    })
  }

  function addPartNeeded() {
    if (!selected) return
    patchSelected({ partsNeeded: [...(selected.partsNeeded ?? []), blankPartNeeded()] })
  }

  function removePartNeeded(id: string) {
    if (!selected) return
    patchSelected({ partsNeeded: (selected.partsNeeded ?? []).filter(part => part.id !== id) })
  }

  function updateServiceLine(id: string, patch: Partial<WorkOrderLine>) {
    if (!selected) return
    patchSelected({
      servicePerformed: selected.servicePerformed.map(line => line.id === id ? { ...line, ...patch } : line),
    })
  }

  function addServiceLine() {
    if (!selected) return
    patchSelected({ servicePerformed: [...selected.servicePerformed, blankServiceLine()] })
  }

  function removeServiceLine(id: string) {
    if (!selected) return
    patchSelected({ servicePerformed: selected.servicePerformed.filter(line => line.id !== id) })
  }

  async function saveSelected() {
    if (!selected || !scriptUrl.trim() || !sessionToken || !canEditSelected) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const selectedWithBuffers = {
        ...selected,
        diagnostics: localDiagnostics,
        mechanicNotes: localMechanicNotes,
        internalNotes: localMechanicNotes,
      }
      const syncTarget = selectedWithBuffers
      const result = await saveMechanicWorkOrder(scriptUrl.trim(), sessionToken, syncTarget)
      const next = {
        ...syncTarget,
        sheetUrl: result.viewUrl,
        pdfUrl: '',
        lastSyncedAt: new Date().toISOString(),
        mechanicSignoff: result.signoffCleared ? null : syncTarget.mechanicSignoff,
      }
      setWorkOrders(current => current.map(wo => wo.id === selected.id ? next : wo))
      setLocalDiagnostics(next.diagnostics ?? '')
      setLocalMechanicNotes(next.mechanicNotes ?? '')
      setDirtyIds(current => {
        const nextDirty = new Set(current)
        nextDirty.delete(selected.id)
        return nextDirty
      })
      setMessage(`Saved ${selected.workOrderNumber}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save work order')
    } finally {
      setSaving(false)
    }
  }

  async function signOffSelected() {
    if (!selected || !scriptUrl.trim() || !sessionToken || !canEditSelected || hasUnsavedChanges) return
    if (!window.confirm(`Sign off your work on ${selected.workOrderNumber}? This records your name and the current time.`)) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const signoff = await signOffMechanicWorkOrder(scriptUrl.trim(), sessionToken, selected.workOrderNumber)
      setWorkOrders(current => current.map(workOrder => workOrder.id === selected.id ? { ...workOrder, mechanicSignoff: signoff } : workOrder))
      setMessage(`Signed off ${selected.workOrderNumber}. The owner can now review and close the work order.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign off this work order.')
    } finally {
      setSaving(false)
    }
  }

  function setQuickStatus(status: WorkOrder['status'], holdReason?: WorkOrderHoldReason) {
    if (!selected) return
    patchSelected({
      status,
      holdReason: status === 'On Hold' ? holdReason ?? selected.holdReason ?? 'Waiting Parts' : '',
    })
  }

  return (
    <div className="mechanic-app">
      <header className="mechanic-header">
        <div>
          <p className="mechanic-header__eyebrow">R3V Garage</p>
          <h1>{mechanic ? `${mechanic.name}'s Jobs` : 'Mechanic Jobs'}</h1>
        </div>
        {isActivated && (
          <button className="mechanic-header__gear btn btn--ghost btn--sm" onClick={logoutDevice} aria-label="Sign out this mechanic device">
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        )}
      </header>

      {!isOnline && (
        <div className="mechanic-offline-banner" role="status" aria-live="polite">
          ⚠ No connection — loaded jobs are still available. Saves will fail until you're back online.
        </div>
      )}

      {!isActivated && (
        <section className="panel panel--pad mechanic-activation" aria-labelledby="mechanic-activation-title">
          <div className="mechanic-activation__icon"><ShieldCheck size={22} aria-hidden="true" /></div>
          <p className="panel__eyebrow">Employee activation</p>
          <h2 id="mechanic-activation-title">Activate this device</h2>
          <p>{initialActivation.inviteToken ? 'Enter your name exactly as assigned.' : 'Enter your name and the one-time pairing code from the owner. This keeps the installed app signed in on this device.'}</p>
          <form onSubmit={event => { event.preventDefault(); void activateDevice() }}>
            <label className="wo-label" htmlFor="activation-mechanic-name">Mechanic name</label>
            <input id="activation-mechanic-name" className="field__input" value={activationName} onChange={event => setActivationName(event.target.value)} autoComplete="name" autoFocus />
            {!initialActivation.inviteToken && (
              <>
                <label className="wo-label" htmlFor="activation-pairing-code">Pairing code</label>
                <input
                  id="activation-pairing-code"
                  className="field__input mechanic-pairing-code"
                  value={pairingCode}
                  onChange={event => setPairingCode(normalizePairingCode(event.target.value))}
                  placeholder="ABCD-2E9F"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={9}
                />
              </>
            )}
            <button className="btn btn--primary" type="submit" disabled={activating || !activationName.trim() || (!initialActivation.inviteToken && normalizePairingCode(pairingCode).length !== 9)}>
              {activating ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
              {activating ? 'Activating' : 'Activate device'}
            </button>
          </form>
          {error && <p className="mechanic-note mechanic-note--warn" role="alert">{error}</p>}
        </section>
      )}

      {isActivated && !selected && (error || message) && (
        <div className={`mechanic-banner${error ? ' mechanic-banner--error' : ' mechanic-banner--ok'}`} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
          {error ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
          <span>{error ?? message}</span>
        </div>
      )}

      {isActivated && (
      <section className={`mechanic-shell mechanic-shell--${mobileView}`}>
        <aside className="panel mechanic-list">
          <div className="mechanic-list__toolbar">
            <div className="mechanic-list__toolbar-top">
              <div className="mechanic-list__stats">
                <span>{visibleWorkOrders.length} visible</span>
                <span>{workOrders.filter(wo => wo.status === 'Active' || wo.status === 'In Progress').length} active</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={refreshWorkOrders} disabled={loading} aria-label="Refresh jobs">
                {loading ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              </button>
            </div>
            <div className="mechanic-list__controls">
              <div>
                <label className="wo-label" htmlFor="mechanic-job-view">View</label>
                <select id="mechanic-job-view" className="field__input field__select" value={prefs.filter} onChange={e => setPrefs(current => ({ ...current, filter: e.target.value as MechanicFilter }))}>
                  <option value="mine">My jobs</option>
                  {permissions.canViewAllJobs && <option value="unassigned">Unassigned</option>}
                  {permissions.canViewAllJobs && <option value="open">All open</option>}
                  <option value="complete">Completed</option>
                </select>
              </div>
              <div>
                <label className="wo-label" htmlFor="mechanic-job-sort">Sort</label>
                <select id="mechanic-job-sort" className="field__input field__select" value={prefs.sort} onChange={e => setPrefs(current => ({ ...current, sort: e.target.value as MechanicSortMode }))}>
                  <option value="priority">Priority</option>
                  <option value="newest">Newest</option>
                  <option value="workOrder">Work order #</option>
                </select>
              </div>
            </div>
            <div className="mechanic-search">
              <Search size={16} aria-hidden="true" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WO, VIN, customer, concern" aria-label="Search work orders" />
            </div>
          </div>

          <div className="mechanic-list__cards">
            {visibleWorkOrders.length === 0 ? (
              <div className="mechanic-empty">
                <p>
                  {workOrders.length
                    ? `${workOrders.length} work order${workOrders.length === 1 ? '' : 's'} loaded, but this view is hiding them.`
                    : 'No work orders were pulled from Sheets yet.'}
                </p>
                {permissions.canViewAllJobs && workOrders.length > 0 && prefs.filter !== 'open' && (
                  <button className="btn btn--ghost btn--sm" onClick={() => setPrefs(current => ({ ...current, filter: 'open' }))}>
                    Show all open
                  </button>
                )}
              </div>
            ) : visibleWorkOrders.map(wo => (
              <button
                key={wo.id}
                className={`mechanic-card${wo.id === selectedId ? ' mechanic-card--active' : ''}`}
                onClick={() => openWorkOrder(wo.id)}
                aria-label={`Open ${wo.workOrderNumber}, ${wo.customerName || 'Walk-in'}, ${wo.status}`}
              >
                <div className="mechanic-card__top">
                  <strong>{wo.workOrderNumber}</strong>
                  <span className={`mechanic-status mechanic-status--${dirtyIds.has(wo.id) ? 'dirty' : statusTone(wo.status)}`}>
                    {dirtyIds.has(wo.id) ? 'Unsaved' : wo.status}
                  </span>
                </div>
                <div className="mechanic-card__meta">
                  <span>{wo.customerName || 'Walk-in'}</span>
                  <span>{vehicleLabel(wo) || 'Vehicle pending'}</span>
                </div>
                <p className="mechanic-card__desc">{wo.customerConcern || wo.diagnostics || 'No concern entered yet.'}</p>
                <div className="mechanic-card__footer">
                  <span>{wo.mechanicSignoff ? `Signed: ${wo.mechanicSignoff.mechanicName}` : wo.assignedMechanic?.trim() ? `Assigned: ${wo.assignedMechanic}` : 'Unassigned'}</span>
                  <span className="mechanic-card__footer-right">
                    {(() => { const total = (wo.servicePerformed || []).reduce((s, l) => s + (l.flatRateHours || 0), 0); return total > 0 ? <span className="mechanic-card__flat-rate">⏱ {total} hrs</span> : null })()}
                    <span>{wo.dateOpened}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="panel panel--pad mechanic-detail">
          {!selected ? (
            <div className="mechanic-empty mechanic-empty--detail">
              <Wrench size={20} />
              <p>Pick a work order to start updating it.</p>
            </div>
          ) : (
            <>
              <button className="btn btn--ghost btn--sm mechanic-mobile-back" onClick={showJobList}>
                <ArrowLeft size={17} aria-hidden="true" />
                Back to jobs
              </button>
              <div className="mechanic-detail__header">
                <div>
                  <p className="panel__eyebrow">{selected.workOrderNumber}</p>
                  <h2 className="panel__heading">{selected.customerName || 'Work order'}</h2>
                  <p className="mechanic-detail__vehicle">{vehicleLabel(selected) || 'Vehicle pending'}</p>
                </div>
                <div className="mechanic-detail__actions">
                  <button className="btn btn--primary btn--sm" onClick={saveSelected} disabled={saving || !canEditSelected}>
                    {saving ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                    {hasUnsavedChanges ? 'Save changes' : 'Save'}
                  </button>
                </div>
              </div>

              {(error || message || hasUnsavedChanges) && (
                <div
                  className={`mechanic-banner${error ? ' mechanic-banner--error' : hasUnsavedChanges ? ' mechanic-banner--dirty' : ' mechanic-banner--ok'}`}
                  role={error ? 'alert' : 'status'}
                  aria-live={error ? 'assertive' : 'polite'}
                >
                  {error ? <AlertTriangle size={14} aria-hidden="true" /> : hasUnsavedChanges ? <Save size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                  <span>{error ?? (hasUnsavedChanges ? 'Unsaved changes. Save before leaving this job.' : message)}</span>
                </div>
              )}

              {!canEditSelected && (
                <div className="mechanic-banner" role="status">
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>View only. This job is assigned to another mechanic.</span>
                </div>
              )}

              {selected.mechanicSignoff && (
                <div className="mechanic-signoff" role="status">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Signed off by {selected.mechanicSignoff.mechanicName} on {new Date(selected.mechanicSignoff.signedOffAt).toLocaleString()}.</span>
                </div>
              )}

              <fieldset className="mechanic-edit-fields" disabled={!canEditSelected}>
              <div className="mechanic-detail__grid">
                <div>
                  <span className="wo-label">Assigned Mechanic</span>
                  <p className="mechanic-readonly-value">{selected.assignedMechanic || 'Unassigned'}</p>
                </div>
                <div>
                  <label className="wo-label" htmlFor="work-order-status">Status</label>
                  <select id="work-order-status" className="field__input field__select" value={selected.status} onChange={e => patchSelected({ status: e.target.value as WorkOrder['status'] })}>
                    {MECHANIC_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                    {selected.status === 'Complete' && <option value="Complete" disabled>Complete</option>}
                  </select>
                </div>
                {selected.status === 'On Hold' && (
                  <div>
                    <label className="wo-label" htmlFor="work-order-hold-reason">Hold Reason</label>
                    <select id="work-order-hold-reason" className="field__input field__select" value={selected.holdReason ?? ''} onChange={e => patchSelected({ holdReason: e.target.value as WorkOrderHoldReason })}>
                      {HOLD_REASONS.map(reason => <option key={reason || 'none'} value={reason}>{reason || 'Select reason'}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="mechanic-quick-actions">
                <button className="btn btn--ghost btn--sm" onClick={() => setQuickStatus('Active')}>
                  <Wrench size={14} aria-hidden="true" />
                  Start
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setQuickStatus('On Hold', selected.holdReason || 'Waiting Parts')}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  On Hold
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setQuickStatus('Today')}>
                  <RefreshCw size={14} aria-hidden="true" />
                  Back To Today
                </button>
              </div>

              <section className="wo-section">
                <h3>Vehicle + Concern</h3>
                <div className="mechanic-summary">
                  <div><strong>VIN</strong><span>{selected.vehicleVin || '—'}</span></div>
                  <div><strong>Mileage</strong><span>{selected.vehicleMileage || '—'}</span></div>
                  <div><strong>Concern</strong><span>{selected.customerConcern || '—'}</span></div>
                </div>
              </section>

              <section className="wo-section">
                <h3><label htmlFor="work-order-diagnostics">Diagnostics</label></h3>
                <textarea id="work-order-diagnostics" className="field__input wo-textarea mechanic-textarea" value={localDiagnostics} onChange={e => { setLocalDiagnostics(e.target.value); markSelectedDirty() }} onBlur={() => patchSelected({ diagnostics: localDiagnostics })} />
              </section>

              <section className="wo-section">
                <h3><label htmlFor="work-order-mechanic-notes">Mechanic Notes</label></h3>
                <textarea id="work-order-mechanic-notes" className="field__input wo-textarea mechanic-textarea" value={localMechanicNotes} onChange={e => { setLocalMechanicNotes(e.target.value); markSelectedDirty() }} onBlur={() => patchSelected({ mechanicNotes: localMechanicNotes, internalNotes: localMechanicNotes })} />
              </section>

              <section className="wo-section">
                <div className="wo-section__head">
                  <h3>Service Performed</h3>
                  <button className="btn btn--ghost btn--sm" onClick={addServiceLine}>Add line</button>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th style={{ width: 80 }}>Book Time</th>
                        <th style={{ width: 72 }}>Hours</th>
                        <th style={{ width: 44 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.servicePerformed.length === 0 ? (
                        <tr><td colSpan={4} className="mechanic-table-empty">No service lines yet.</td></tr>
                      ) : selected.servicePerformed.map((line, lineIndex) => (
                        <tr key={line.id}>
                          <td data-label="Description"><input className="tbl-input" aria-label={`Service line ${lineIndex + 1} description`} value={line.description} onChange={e => updateServiceLine(line.id, { description: e.target.value })} /></td>
                          <td data-label="Book Time"><span className="mechanic-flat-rate-cell">{line.flatRateHours ? `${line.flatRateHours} hrs` : '—'}</span></td>
                          <td data-label="Hours"><input className="tbl-input" aria-label={`Service line ${lineIndex + 1} hours`} type="number" min="0" step="0.1" value={line.quantity || ''} onFocus={e => e.currentTarget.select()} onChange={e => updateServiceLine(line.id, { quantity: Number(e.target.value) || 0 })} /></td>
                          <td className="mechanic-row-action"><button className="btn btn--icon btn--danger btn--sm" onClick={() => removeServiceLine(line.id)} aria-label={`Remove service line ${lineIndex + 1}`}><Trash2 size={16} aria-hidden="true" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="wo-section">
                <div className="wo-section__head">
                  <h3>Parts Needed</h3>
                  <button className="btn btn--ghost btn--sm" onClick={addPartNeeded}>Add part</button>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th style={{ width: 74 }}>Qty</th>
                        <th style={{ width: 160 }}>Supplier</th>
                        <th style={{ width: 140 }}>Status</th>
                        <th>Notes</th>
                        <th style={{ width: 44 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.partsNeeded ?? []).length === 0 ? (
                        <tr><td colSpan={6} className="mechanic-table-empty">No parts needed yet.</td></tr>
                      ) : (selected.partsNeeded ?? []).map((part, partIndex) => (
                        <tr key={part.id}>
                          <td data-label="Part"><input className="tbl-input" aria-label={`Part ${partIndex + 1} description`} value={part.description} onChange={e => updatePartNeeded(part.id, { description: e.target.value })} placeholder="Starter, sensor, gasket..." /></td>
                          <td data-label="Qty"><input className="tbl-input" aria-label={`Part ${partIndex + 1} quantity`} type="number" min="1" value={part.quantity || 1} onFocus={e => e.currentTarget.select()} onChange={e => updatePartNeeded(part.id, { quantity: Number(e.target.value) || 1 })} /></td>
                          <td data-label="Supplier">
                            <input className="tbl-input" aria-label={`Part ${partIndex + 1} supplier`} list={`mechanic-suppliers-${part.id}`} value={part.supplier} onChange={e => updatePartNeeded(part.id, { supplier: e.target.value })} placeholder="Supplier" />
                            <datalist id={`mechanic-suppliers-${part.id}`}>
                              {PARTS_STORES.map(supplier => <option key={supplier} value={supplier} />)}
                            </datalist>
                          </td>
                          <td data-label="Status">
                            <select className="tbl-select" aria-label={`Part ${partIndex + 1} status`} value={part.status} onChange={e => updatePartNeeded(part.id, { status: e.target.value as WorkOrderPartNeeded['status'] })}>
                              {PARTS_ORDER_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </td>
                          <td data-label="Notes"><input className="tbl-input" aria-label={`Part ${partIndex + 1} notes`} value={part.notes} onChange={e => updatePartNeeded(part.id, { notes: e.target.value })} placeholder="ETA, backorder, approval..." /></td>
                          <td className="mechanic-row-action"><button className="btn btn--icon btn--danger btn--sm" onClick={() => removePartNeeded(part.id)} aria-label={`Remove part ${partIndex + 1}`}><Trash2 size={16} aria-hidden="true" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              </fieldset>

              <footer className="mechanic-footer">
                <div>
                  {selected.lastSyncedAt && <span>Last saved {new Date(selected.lastSyncedAt).toLocaleString()}</span>}
                </div>
                <div className="mechanic-footer__actions">
                <button className="btn btn--ghost btn--sm" onClick={signOffSelected} disabled={saving || !canEditSelected || hasUnsavedChanges || Boolean(selected.mechanicSignoff)}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  {selected.mechanicSignoff ? 'Signed off' : hasUnsavedChanges ? 'Save before sign-off' : 'Sign off work'}
                </button>
                <button className="btn btn--primary btn--sm" onClick={saveSelected} disabled={saving || !canEditSelected}>
                  {saving ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                  {hasUnsavedChanges ? 'Save changes' : 'Save work order'}
                </button>
                </div>
              </footer>

              <div className={`mechanic-mobile-actions${hasUnsavedChanges ? ' mechanic-mobile-actions--dirty' : ''}`}>
                <span aria-live="polite">{hasUnsavedChanges ? 'Unsaved changes' : 'Work order saved'}</span>
                <button className="btn btn--ghost" onClick={signOffSelected} disabled={saving || !canEditSelected || hasUnsavedChanges || Boolean(selected.mechanicSignoff)}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  {selected.mechanicSignoff ? 'Signed' : 'Sign off'}
                </button>
                <button className="btn btn--primary" onClick={saveSelected} disabled={saving || !canEditSelected}>
                  {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                  {saving ? 'Saving' : 'Save'}
                </button>
              </div>
            </>
          )}
        </main>
      </section>
      )}
    </div>
  )
}

function filteredWorkOrdersFor(workOrders: WorkOrder[], prefs: MechanicPrefs, search: string): WorkOrder[] {
  const searchTerm = search.trim().toLowerCase()
  const mechanicName = prefs.mechanicName.trim().toLowerCase()

  return workOrders.filter(wo => {
    const assigned = wo.assignedMechanic?.trim().toLowerCase() ?? ''
    if (prefs.filter === 'mine' && mechanicName && assigned !== mechanicName) return false
    if (prefs.filter === 'unassigned' && assigned) return false
    if (prefs.filter === 'open' && !isOpenWorkOrder(wo)) return false
    if (prefs.filter === 'mine' && !mechanicName && !isOpenWorkOrder(wo)) return false
    if (prefs.filter === 'complete' && wo.status !== 'Complete') return false
    if (prefs.filter !== 'complete' && prefs.filter !== 'open' && prefs.filter !== 'unassigned' && prefs.filter !== 'mine') return true
    if ((prefs.filter === 'unassigned' || prefs.filter === 'mine') && !isOpenWorkOrder(wo)) return false

    if (!searchTerm) return true
    const haystack = [
      wo.workOrderNumber,
      wo.customerName,
      wo.vehicleVin,
      wo.customerConcern,
      vehicleLabel(wo),
      wo.assignedMechanic,
    ].join(' ').toLowerCase()
    return haystack.includes(searchTerm)
  })
}
