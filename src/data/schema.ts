// ─── Primitives ─────────────────────────────────────────────────────────────

export type BillingFrequency = 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual'
export type FixedVar = 'Fixed' | 'Variable'
export type FinancialStatus = 'Growth' | 'Stable' | 'Tight' | 'Danger'
export type DebtStrategy = 'Avalanche' | 'Snowball' | 'Custom'
export type Mode = 'Shop Only' | 'Personal Only' | 'Shop + Personal'
export type ShopMode = 'Solo Operator' | 'With Employees'
export type PartsOrderStatus = 'Needed' | 'Ordered' | 'Received' | 'Installed' | 'Returned' | 'Backordered' | 'On Hold'
export type InvoiceStatus = 'Outstanding' | 'Partial' | 'Paid' | 'Overdue'

// ─── Control Panel ───────────────────────────────────────────────────────────

export interface ControlPanel {
  today: string
  mode: Mode
  shopMode: ShopMode
  laborRatePerHour: number
  numberOfBays: number
  operatingDaysPerMonth: number
  partsMarginPercent: number
  taxReservePercent: number
  grossMarginPercent: number
  targetCarCountMonthly: number
  appsScriptInvoiceUrl: string   // Google Apps Script web app URL for invoice generation
  apifyToken: string             // Apify API token for RockAuto parts lookup
  squareToken: string            // Square personal access token
  squareLocationId: string       // Square location ID (auto-selected or user-chosen)
  squareSandbox: boolean         // true = use sandbox (connect.squareupsandbox.com) for testing
  anthropicKey: string           // Anthropic API key — FinDash AI + Shop Assistant (Anthropic mode)
  openaiKey: string              // OpenAI API key — Shop Assistant (OpenAI mode)
  groqKey: string                // Groq API key — Shop Assistant (Groq mode, free tier available)
  shopAssistantProvider: 'anthropic' | 'openai' | 'groq'  // which provider powers the Shop Assistant
}

// ─── Income ─────────────────────────────────────────────────────────────────

export interface Income {
  id: string
  source: string
  type: string
  amountMonthly: number
  reliabilityPercent: number
  payDay: number | null
  notes: string
  squareSyncRef?: string   // set when imported from Square — used to detect & update re-syncs
}

// ─── Expense ────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  category: string
  billingFrequency: BillingFrequency
  billedAmount: number
  plannedMonthly: number
  dueDay: number | null
  autopay: boolean
  account: string
  fixedVar: FixedVar
  notes: string
  section: 'shop' | 'personal'
}

// ─── Savings ────────────────────────────────────────────────────────────────

export interface SavingsTarget {
  id: string
  target: string
  amountMonthly: number
  goalAmount: number
  currentBalance: number
  notes: string
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export interface Asset {
  id: string
  name: string
  tier: 'A' | 'B' | 'C'
  value: number
  notes: string
}

// ─── Debts ──────────────────────────────────────────────────────────────────

export interface Debt {
  id: string
  debtName: string
  type: string
  balance: number
  apr: number
  minimumPayment: number
  dueDay: number | null
  autopay: boolean
  include: boolean
  customPriority: number | null
  notes: string
}

export interface DebtPaydownSettings {
  strategy: DebtStrategy
  baseExtraPayment: number
}

// ─── Parts Store Accounts (A/P) ──────────────────────────────────────────────
// Tracks the running balance owed to each parts supplier (NAPA, O'Reilly, etc.)
// Mechanics often order on a charge account and pay weekly or monthly.

export interface PartAccountPayment {
  id: string
  date: string            // YYYY-MM-DD
  amount: number
  method: string          // 'Check' | 'ACH' | 'Card' | 'Cash' | 'Other'
  referenceNumber: string // check # or confirmation #
  notes: string
}

export interface PartsAccount {
  id: string
  storeName: string       // NAPA, O'Reilly, Carquest, etc.
  accountNumber: string
  currentBalance: number  // current amount owed to this supplier
  creditLimit: number     // 0 = no formal limit / COD
  paymentTerms: string    // 'COD' | 'Net 7' | 'Net 15' | 'Net 30' | 'Weekly' | 'Monthly'
  dueDay: number | null   // day of month payment is typically due
  autopay: boolean
  contact: string         // store contact or rep
  notes: string
  payments: PartAccountPayment[]
}

// ─── Parts Orders ────────────────────────────────────────────────────────────
// Individual parts ordered for specific jobs — tracks cost, markup, and job linkage.

export interface PartsOrder {
  id: string
  dateOrdered: string       // YYYY-MM-DD
  partDescription: string
  partNumber: string
  supplier: string          // store name / account
  unitCost: number          // what the shop paid per unit
  quantity: number
  markupPercent: number     // shop markup applied to customer
  customerName: string
  vehicleInfo: string       // e.g. "2018 Ford F-150"
  jobDescription: string
  status: PartsOrderStatus
  invoicedToCustomer: boolean
  paidByCustomer: boolean
  notes: string
  linkedWorkOrderId?: string
  linkedWorkOrderPartId?: string
}

// ─── Customer Invoices (A/R) ─────────────────────────────────────────────────
// Outstanding invoices from customers — especially fleet accounts or slow-pay customers.

export interface InvoicePayment {
  id: string
  date: string              // YYYY-MM-DD
  amount: number
  method: string
  notes: string
}

export interface CustomerInvoice {
  id: string
  customerId?: string        // hard link to Customer.id — set when created via customer tab or manually linked
  squareInvoiceId?: string   // Square invoice ID — set when imported from Square; prevents re-import
  linkedJobCardId?: string   // JobCard.id — set when auto-created from the Today board; enables bidirectional delete
  customerName: string
  vehicleInfo: string
  invoiceNumber: string
  dateInvoiced: string      // YYYY-MM-DD
  dateDue: string           // YYYY-MM-DD
  laborAmount: number
  partsAmount: number
  otherAmount: number
  amountPaid: number        // sum of payments logged
  payments: InvoicePayment[]
  notes: string
}

// --- Work Orders ----------------------------------------------------------
// Printable / sheet-synced repair documents for customers and mechanics.

export interface WorkOrderLine {
  id: string
  description: string
  quantity: number
  unitPrice: number
  taxable: boolean
  flatRateHours?: number
}

export type WorkOrderHoldReason = 'Waiting Parts' | 'Waiting Approval' | 'Waiting Customer' | 'Waiting Payment' | 'Other' | ''

export interface WorkOrderPartNeeded {
  id: string
  description: string
  quantity: number
  supplier: string
  status: PartsOrderStatus
  notes: string
  linkedPartsOrderId?: string
}

export interface WorkOrder {
  id: string
  workOrderNumber: string
  status: 'Draft' | 'Today' | 'Active' | 'In Progress' | 'Ready' | 'Complete' | 'On Hold' | 'Cancelled' | 'Archived'
  holdReason?: WorkOrderHoldReason
  assignedMechanic?: string
  dateOpened: string
  datePromised: string | null
  customerId?: string
  linkedJobCardId?: string
  linkedInvoiceId?: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  customerCity: string
  customerPostal: string
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  vehicleTrim: string
  vehicleVin: string
  vehiclePlate: string
  vehicleMileage: string
  vehicleEngine: string
  vehicleColor: string
  customerConcern: string
  diagnostics: string
  mechanicNotes?: string
  partsNeeded?: WorkOrderPartNeeded[]
  servicePerformed: WorkOrderLine[]
  partsUsed: WorkOrderLine[]
  shopFees: number
  taxRate: number
  taxEnabled?: boolean
  internalNotes: string
  sheetUrl?: string
  pdfUrl?: string
  lastSyncedAt?: string
}

// ─── Customers ───────────────────────────────────────────────────────────────
// Customer directory — name, contact, vehicles, service history derived from invoices.

export interface CustomerVehicle {
  id: string
  year: string
  make: string
  model: string
  trim: string
  vin: string
  notes: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  vehicles: CustomerVehicle[]
  notes: string
  createdAt: string
}

// ─── KPI Snapshots ──────────────────────────────────────────────────────────

export interface MonthlyKPISnapshot {
  id: string
  month: string
  carCount: number
  billedHours: number
  laborRevenue: number
  partsRevenue: number
  otherRevenue: number
  notes: string
}

// ─── Job Board ───────────────────────────────────────────────────────────────
// Kanban cards for the Today page — lightweight work order tracking.

export type JobColumn = 'todo' | 'active' | 'done'

export interface JobCard {
  id: string
  column: JobColumn
  order: number               // sort position within column
  cardType?: 'job' | 'reminder'  // default 'job'; 'reminder' hides financial fields
  customerName: string
  vehicleInfo: string         // e.g. "2018 Ford F-150"
  jobDescription: string
  scheduledDate: string | null  // YYYY-MM-DD
  completedAt?: string        // ISO date string — set when card moves to Done
  linkedInvoiceId?: string    // CustomerInvoice.id created when this card was added
  linkedWorkOrderId?: string  // WorkOrder.id when surfaced from Work Orders
}

// ─── Accounts ───────────────────────────────────────────────────────────────

export interface Account {
  id: string
  name: string
  balance: number
  type: 'checking' | 'savings' | 'credit' | 'other'
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export interface Metadata {
  createdAt: string
  updatedAt: string
  version: string
}

// ─── Root State ─────────────────────────────────────────────────────────────

export interface GarageFinanceState {
  controlPanel: ControlPanel
  shopExpenses: Expense[]
  personalExpenses: Expense[]
  income: Income[]
  savingsTargets: SavingsTarget[]
  assets: Asset[]
  debts: Debt[]
  debtPaydownSettings: DebtPaydownSettings
  kpiSnapshots: MonthlyKPISnapshot[]
  partsAccounts: PartsAccount[]       // A/P: supplier charge accounts
  partsOrders: PartsOrder[]           // individual parts ordered per job
  customerInvoices: CustomerInvoice[] // A/R: outstanding customer balances
  workOrders: WorkOrder[]             // printable / sheet-synced garage work orders
  customers: Customer[]               // customer directory + vehicle history
  accounts: Account[]
  jobCards: JobCard[]                 // Today page kanban board
  metadata: Metadata
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function toMonthly(billedAmount: number, frequency: BillingFrequency): number {
  const divisors: Record<BillingFrequency, number> = {
    Monthly: 1,
    Quarterly: 3,
    'Semi-Annual': 6,
    Annual: 12,
  }
  return billedAmount / divisors[frequency]
}

export function invoiceTotal(inv: CustomerInvoice): number {
  return inv.laborAmount + inv.partsAmount + inv.otherAmount
}

export function invoiceBalance(inv: CustomerInvoice): number {
  return Math.max(0, invoiceTotal(inv) - inv.amountPaid)
}

export function invoiceStatus(inv: CustomerInvoice): InvoiceStatus {
  const balance = invoiceBalance(inv)
  if (balance <= 0) return 'Paid'
  if (inv.amountPaid > 0) return 'Partial'
  if (inv.dateDue && new Date(inv.dateDue) < new Date()) return 'Overdue'
  return 'Outstanding'
}

export function partsOrderTotal(order: PartsOrder): number {
  return order.unitCost * order.quantity
}

export function partsOrderSellPrice(order: PartsOrder): number {
  return partsOrderTotal(order) * (1 + order.markupPercent / 100)
}

export function workOrderLineTotal(line: WorkOrderLine): number {
  return Math.max(0, line.quantity) * Math.max(0, line.unitPrice)
}

export function workOrderSubtotal(lines: WorkOrderLine[]): number {
  return lines.reduce((sum, line) => sum + workOrderLineTotal(line), 0)
}

export function workOrderTaxableSubtotal(workOrder: WorkOrder): number {
  const allLines = [...workOrder.servicePerformed, ...workOrder.partsUsed]
  return allLines
    .filter(line => line.taxable)
    .reduce((sum, line) => sum + workOrderLineTotal(line), 0)
}

export function workOrderTotal(workOrder: WorkOrder): number {
  const service = workOrderSubtotal(workOrder.servicePerformed)
  const parts = workOrderSubtotal(workOrder.partsUsed)
  const taxable = workOrderTaxableSubtotal(workOrder)
  const tax = workOrder.taxEnabled === false ? 0 : taxable * (workOrder.taxRate / 100)
  return service + parts + workOrder.shopFees + tax
}
