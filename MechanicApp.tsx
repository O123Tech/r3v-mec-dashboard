import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings,
  UserRound,
  Wrench,
} from 'lucide-react'
import type { WorkOrder, WorkOrderHoldReason, WorkOrderLine, WorkOrderPartNeeded } from './data/schema'
import { PARTS_ORDER_STATUSES, PARTS_STORES } from './data/canonicalLabels'
import { fetchMechanicWorkOrders, saveMechanicWorkOrder } from './integrations/workOrders'

type MechanicFilter = 'mine' | 'unassigned' | 'open' | 'complete'

interface MechanicPrefs {
  scriptUrl: string
  mechanicName: string
  filter: MechanicFilter
}

const PREFS_KEY = 'r3v_mechanic_app_prefs'
const MECHANIC_STATUSES: WorkOrder['status'][] = ['Today', 'Active', 'In Progress', 'On Hold', 'Complete']
const HOLD_REASONS: WorkOrderHoldReason[] = ['', 'Waiting Parts', 'Waiting Approval', 'Waiting Customer', 'Waiting Payment', 'Other']

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function loadPrefs(): MechanicPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { scriptUrl: '', mechanicName: '', filter: 'open' }
    const parsed = JSON.parse(raw) as Partial<MechanicPrefs>
    return {
      scriptUrl: parsed.scriptUrl ?? '',
      mechanicName: parsed.mechanicName ?? '',
      filter: parsed.filter ?? 'mine',
    }
  } catch {
    return { scriptUrl: '', mechanicName: '', filter: 'mine' }
  }
}

function savePrefs(prefs: MechanicPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
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

function sortWorkOrders(workOrders: Array<Omit<WorkOrder, 'id'>>): Array<Omit<WorkOrder, 'id'>> {
  const statusOrder: Record<WorkOrder['status'], number> = {
    Today: 0,
    Active: 1,
    'In Progress': 2,
    'On Hold': 3,
    Draft: 4,
    Ready: 5,
    Complete: 6,
    Cancelled: 7,
    Archived: 8,
  }

  return [...workOrders].sort((a, b) => {
    const statusDelta = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    if (statusDelta !== 0) return statusDelta
    return `${b.dateOpened ?? ''}`.localeCompare(a.dateOpened ?? '')
  })
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
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [prefs, setPrefs] = useState<MechanicPrefs>(() => loadPrefs())
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set())
  const [settingsOpen, setSettingsOpen] = useState(() => !loadPrefs().scriptUrl.trim())
  const [setupTestMessage, setSetupTestMessage] = useState<string | null>(null)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const isFirstPrefsRender = useRef(true)

  useEffect(() => {
    const online  = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online',  online)
    window.addEventListener('offline', offline)
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])

  useEffect(() => {
    if (isFirstPrefsRender.current) { isFirstPrefsRender.current = false; return }
    savePrefs(prefs)
    setPrefsSaved(true)
    const t = setTimeout(() => setPrefsSaved(false), 1800)
    return () => clearTimeout(t)
  }, [prefs])

  async function loadWorkOrders(preserveId?: string | null) {
    if (!prefs.scriptUrl.trim()) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const fetched = sortWorkOrders(await fetchMechanicWorkOrders(prefs.scriptUrl.trim()))
        .map((wo, index) => ({
          ...wo,
          id: wo.sheetUrl || wo.workOrderNumber || `${wo.vehicleVin || 'wo'}-${index}`,
          assignedMechanic: wo.assignedMechanic ?? '',
          mechanicNotes: wo.mechanicNotes ?? wo.internalNotes ?? '',
          partsNeeded: wo.partsNeeded ?? [],
          servicePerformed: wo.servicePerformed ?? [],
        }))
      setWorkOrders(fetched)
      setDirtyIds(new Set())

      const preferredId = preserveId && fetched.find(wo => wo.id === preserveId)?.id
      const nextVisible = filteredWorkOrdersFor(fetched, prefs, search)[0]?.id ?? fetched[0]?.id ?? null
      setSelectedId(preferredId ?? nextVisible)
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

  async function testConnection() {
    if (!prefs.scriptUrl.trim()) {
      setSetupTestMessage('Paste the Apps Script URL first.')
      return
    }
    setSetupTestMessage('Testing connection...')
    try {
      const fetched = await fetchMechanicWorkOrders(prefs.scriptUrl.trim())
      const sample = fetched[0]?.workOrderNumber ? ` First: ${fetched[0].workOrderNumber}.` : ''
      setSetupTestMessage(`Connected. ${fetched.length} mechanic work order${fetched.length === 1 ? '' : 's'} returned.${sample}`)
    } catch (err) {
      setSetupTestMessage(err instanceof Error ? err.message : 'Could not test connection.')
    }
  }

  useEffect(() => {
    if (prefs.scriptUrl.trim()) loadWorkOrders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.scriptUrl])

  const visibleWorkOrders = useMemo(
    () => filteredWorkOrdersFor(workOrders, prefs, search),
    [workOrders, prefs, search],
  )

  useEffect(() => {
    if (!visibleWorkOrders.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !visibleWorkOrders.some(wo => wo.id === selectedId)) {
      setSelectedId(visibleWorkOrders[0].id)
    }
  }, [selectedId, visibleWorkOrders])

  const selected = workOrders.find(wo => wo.id === selectedId) ?? null
  const hasUnsavedChanges = selected ? dirtyIds.has(selected.id) : false

  function patchSelected(patch: Partial<WorkOrder>) {
    if (!selected) return
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
    if (!selected || !prefs.scriptUrl.trim()) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const syncTarget = prefs.mechanicName.trim() && !selected.assignedMechanic?.trim()
        ? { ...selected, assignedMechanic: prefs.mechanicName.trim() }
        : selected
      const result = await saveMechanicWorkOrder(prefs.scriptUrl.trim(), syncTarget)
      const next = {
        ...syncTarget,
        sheetUrl: result.viewUrl,
        pdfUrl: '',
        lastSyncedAt: new Date().toISOString(),
      }
      setWorkOrders(current => current.map(wo => wo.id === selected.id ? next : wo))
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
          <h1>Mechanic Jobs</h1>
        </div>
        <button className="mechanic-header__gear btn btn--ghost btn--sm" onClick={() => setSettingsOpen(true)} title="Settings">
          <Settings size={15} />
        </button>
      </header>

      {!isOnline && (
        <div className="mechanic-offline-banner">
          ⚠ No connection — loaded jobs are still available. Saves will fail until you're back online.
        </div>
      )}

      {settingsOpen && (
        <div className="mechanic-settings" role="dialog" aria-modal="true" aria-label="Mechanic settings">
          <button className="mechanic-settings__backdrop" onClick={() => setSettingsOpen(false)} aria-label="Close settings" />
          <section className="mechanic-settings__panel">
            <div className="mechanic-settings__head">
              <div>
                <p className="panel__eyebrow">Setup</p>
                <h2>Mechanic Settings</h2>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
            <div className="mechanic-settings__body">
              <div>
                <label className="wo-label">Apps Script URL</label>
                <input
                  className="field__input"
                  value={prefs.scriptUrl}
                  onChange={e => setPrefs(current => ({ ...current, scriptUrl: e.target.value }))}
                  placeholder="https://script.google.com/macros/s/.../exec"
                />
              </div>
              <div>
                <label className="wo-label">Mechanic Name</label>
                <input
                  className="field__input"
                  value={prefs.mechanicName}
                  onChange={e => setPrefs(current => ({ ...current, mechanicName: e.target.value }))}
                  placeholder="Mike, Tom, Alex..."
                />
              </div>
            </div>
            <div className="mechanic-settings__actions">
              <button className="btn btn--ghost btn--sm" onClick={testConnection}>Test connection</button>
              <button className="btn btn--primary btn--sm" onClick={() => { setSettingsOpen(false); loadWorkOrders(selectedId) }} disabled={!prefs.scriptUrl.trim()}>
                Load jobs
              </button>
            </div>
            {setupTestMessage && (
              <p className={`mechanic-note ${setupTestMessage.startsWith('Connected') ? 'mechanic-note--ok' : 'mechanic-note--warn'}`}>
                {setupTestMessage}
              </p>
            )}
            <p className={`mechanic-note mechanic-note--saved ${prefsSaved ? 'mechanic-note--saved-visible' : ''}`}>
              ✓ Saved to this device
            </p>
          </section>
        </div>
      )}

      {!prefs.scriptUrl.trim() && (
        <section className="panel panel--pad mechanic-connect">
          <div>
            <p className="panel__eyebrow">Connection needed</p>
            <h2>Connect this mechanic app</h2>
            <p>Paste the Apps Script URL once in settings, then this screen will stay focused on jobs.</p>
          </div>
          <button className="btn btn--primary btn--sm" onClick={() => setSettingsOpen(true)}>
            <Settings size={14} />
            Open settings
          </button>
        </section>
      )}

      <section className="mechanic-shell">
        <aside className="panel mechanic-list">
          <div className="mechanic-list__toolbar">
            <div className="mechanic-list__toolbar-top">
              <div className="mechanic-list__stats">
                <span>{visibleWorkOrders.length} visible</span>
                <span>{workOrders.filter(wo => wo.status === 'Active' || wo.status === 'In Progress').length} active</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => loadWorkOrders(selectedId)} disabled={loading || !prefs.scriptUrl.trim()} title="Refresh jobs">
                {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
              </button>
            </div>
            <div>
              <label className="wo-label">View</label>
              <select className="field__input field__select" value={prefs.filter} onChange={e => setPrefs(current => ({ ...current, filter: e.target.value as MechanicFilter }))}>
                <option value="mine">My jobs</option>
                <option value="unassigned">Unassigned</option>
                <option value="open">All open</option>
                <option value="complete">Completed</option>
              </select>
            </div>
            <div className="mechanic-search">
              <Search size={14} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search WO, VIN, customer, concern" />
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
                {workOrders.length > 0 && prefs.filter !== 'open' && (
                  <button className="btn btn--ghost btn--sm" onClick={() => setPrefs(current => ({ ...current, filter: 'open' }))}>
                    Show all open
                  </button>
                )}
              </div>
            ) : visibleWorkOrders.map(wo => (
              <button
                key={wo.id}
                className={`mechanic-card${wo.id === selectedId ? ' mechanic-card--active' : ''}`}
                onClick={() => setSelectedId(wo.id)}
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
                  <span>{wo.assignedMechanic?.trim() ? `Assigned: ${wo.assignedMechanic}` : 'Unassigned'}</span>
                  <span>{wo.dateOpened}</span>
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
              <div className="mechanic-detail__header">
                <div>
                  <p className="panel__eyebrow">{selected.workOrderNumber}</p>
                  <h2 className="panel__heading">{selected.customerName || 'Work order'}</h2>
                  <p className="mechanic-detail__vehicle">{vehicleLabel(selected) || 'Vehicle pending'}</p>
                </div>
                <div className="mechanic-detail__actions">
                  <button className="btn btn--primary btn--sm" onClick={saveSelected} disabled={saving || !prefs.scriptUrl.trim()}>
                    {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                    {hasUnsavedChanges ? 'Save changes' : 'Save'}
                  </button>
                </div>
              </div>

              {(error || message || hasUnsavedChanges) && (
                <div className={`mechanic-banner${error ? ' mechanic-banner--error' : hasUnsavedChanges ? ' mechanic-banner--dirty' : ' mechanic-banner--ok'}`}>
                  {error ? <AlertTriangle size={14} /> : hasUnsavedChanges ? <Save size={14} /> : <CheckCircle2 size={14} />}
                  <span>{error ?? (hasUnsavedChanges ? 'Unsaved changes. Save before leaving this job.' : message)}</span>
                </div>
              )}

              <div className="mechanic-detail__grid">
                <div>
                  <label className="wo-label">Assigned Mechanic</label>
                  <div className="mechanic-assigned">
                    <input
                      className="field__input"
                      value={selected.assignedMechanic ?? ''}
                      onChange={e => patchSelected({ assignedMechanic: e.target.value })}
                      placeholder="Mechanic name"
                    />
                    {prefs.mechanicName.trim() && selected.assignedMechanic?.trim() !== prefs.mechanicName.trim() && (
                      <button className="btn btn--ghost btn--sm" onClick={() => patchSelected({ assignedMechanic: prefs.mechanicName.trim() })}>
                        <UserRound size={14} />
                        Assign to me
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="wo-label">Status</label>
                  <select className="field__input field__select" value={selected.status} onChange={e => patchSelected({ status: e.target.value as WorkOrder['status'] })}>
                    {MECHANIC_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                {selected.status === 'On Hold' && (
                  <div>
                    <label className="wo-label">Hold Reason</label>
                    <select className="field__input field__select" value={selected.holdReason ?? ''} onChange={e => patchSelected({ holdReason: e.target.value as WorkOrderHoldReason })}>
                      {HOLD_REASONS.map(reason => <option key={reason || 'none'} value={reason}>{reason || 'Select reason'}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="mechanic-quick-actions">
                <button className="btn btn--ghost btn--sm" onClick={() => setQuickStatus('Active')}>
                  <Wrench size={14} />
                  Start
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setQuickStatus('On Hold', selected.holdReason || 'Waiting Parts')}>
                  <AlertTriangle size={14} />
                  On Hold
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setQuickStatus('Today')}>
                  <RefreshCw size={14} />
                  Back To Today
                </button>
                <button className="btn btn--primary btn--sm" onClick={() => setQuickStatus('Complete')}>
                  <CheckCircle2 size={14} />
                  Complete
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
                <h3>Diagnostics</h3>
                <textarea className="field__input wo-textarea mechanic-textarea" value={selected.diagnostics} onChange={e => patchSelected({ diagnostics: e.target.value })} />
              </section>

              <section className="wo-section">
                <h3>Mechanic Notes</h3>
                <textarea className="field__input wo-textarea mechanic-textarea" value={selected.mechanicNotes ?? ''} onChange={e => patchSelected({ mechanicNotes: e.target.value, internalNotes: e.target.value })} />
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
                        <th style={{ width: 88 }}>Hours</th>
                        <th style={{ width: 44 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.servicePerformed.length === 0 ? (
                        <tr><td colSpan={3} className="mechanic-table-empty">No service lines yet.</td></tr>
                      ) : selected.servicePerformed.map(line => (
                        <tr key={line.id}>
                          <td><input className="tbl-input" value={line.description} onChange={e => updateServiceLine(line.id, { description: e.target.value })} /></td>
                          <td><input className="tbl-input" type="number" min="0" step="0.1" value={line.quantity || ''} onFocus={e => e.currentTarget.select()} onChange={e => updateServiceLine(line.id, { quantity: Number(e.target.value) || 0 })} /></td>
                          <td><button className="btn btn--icon btn--danger btn--sm" onClick={() => removeServiceLine(line.id)}>x</button></td>
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
                      ) : (selected.partsNeeded ?? []).map(part => (
                        <tr key={part.id}>
                          <td><input className="tbl-input" value={part.description} onChange={e => updatePartNeeded(part.id, { description: e.target.value })} placeholder="Starter, sensor, gasket..." /></td>
                          <td><input className="tbl-input" type="number" min="1" value={part.quantity || 1} onFocus={e => e.currentTarget.select()} onChange={e => updatePartNeeded(part.id, { quantity: Number(e.target.value) || 1 })} /></td>
                          <td>
                            <input className="tbl-input" list={`mechanic-suppliers-${part.id}`} value={part.supplier} onChange={e => updatePartNeeded(part.id, { supplier: e.target.value })} placeholder="Supplier" />
                            <datalist id={`mechanic-suppliers-${part.id}`}>
                              {PARTS_STORES.map(supplier => <option key={supplier} value={supplier} />)}
                            </datalist>
                          </td>
                          <td>
                            <select className="tbl-select" value={part.status} onChange={e => updatePartNeeded(part.id, { status: e.target.value as WorkOrderPartNeeded['status'] })}>
                              {PARTS_ORDER_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </td>
                          <td><input className="tbl-input" value={part.notes} onChange={e => updatePartNeeded(part.id, { notes: e.target.value })} placeholder="ETA, backorder, approval..." /></td>
                          <td><button className="btn btn--icon btn--danger btn--sm" onClick={() => removePartNeeded(part.id)}>x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <footer className="mechanic-footer">
                <div>
                  {selected.lastSyncedAt && <span>Last saved {new Date(selected.lastSyncedAt).toLocaleString()}</span>}
                </div>
                <button className="btn btn--primary btn--sm" onClick={saveSelected} disabled={saving || !prefs.scriptUrl.trim()}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                  {hasUnsavedChanges ? 'Save changes' : 'Save work order'}
                </button>
              </footer>
            </>
          )}
        </main>
      </section>

      {!prefs.scriptUrl.trim() && (
        <button className="mechanic-floating-setup" onClick={() => setSettingsOpen(true)} title="Open setup">
          <Settings size={15} />
          Connect
        </button>
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
