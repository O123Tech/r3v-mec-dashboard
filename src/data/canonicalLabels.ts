// ─── Income ─────────────────────────────────────────────────────────────────

export const GARAGE_INCOME_SOURCES = [
  'Walk-in Labor',
  'Fleet Account Revenue',
  'Parts Sales',
  'Diagnostic Fees',
  'State Inspections',
  'Oil Changes',
  'Tire Sales & Service',
  'AC Service',
  'Alignment Service',
  'Brake Service',
  'Transmission Service',
  'Towing / Recovery',
  'Warranty / Insurance Claims',
  'Other Revenue',
] as const

export const GARAGE_INCOME_TYPES = [
  'Labor',
  'Parts',
  'Diagnostics',
  'Inspections',
  'Fleet',
  'Towing',
  'Other',
] as const

// ─── Expenses ────────────────────────────────────────────────────────────────

export const SHOP_EXPENSE_CATEGORIES = [
  'Bay Rent / Shop Lease',
  'Equipment Insurance',
  'Business Liability Insurance',
  'Workers Compensation',
  'Parts Inventory',
  'Shop Consumables',
  'Waste Oil Disposal',
  'Hazardous Waste Disposal',
  'Diagnostic Software',
  'Shop Management Software',
  'Lift Maintenance',
  'Equipment Repair',
  'Electricity',
  'Water / Sewer',
  'Internet',
  'Phone',
  'Credit Card Processing Fees',
  'Advertising / Marketing',
  'Uniforms / Workwear',
  'Accounting Software',
  'Payroll',
  'Contractor / Sublet Labor',
  'Tool Purchases',
  'State License / Registration Fees',
  'Miscellaneous (Shop)',
] as const

export const PERSONAL_EXPENSE_CATEGORIES = [
  'Mortgage / Rent',
  'Electricity',
  'Home Insurance',
  'Car Insurance',
  'Health Insurance',
  'Internet',
  'Cell Phone',
  'Groceries',
  'Dining Out',
  'Streaming Services',
  'Gym Membership',
  'Child Care',
  'Clothing',
  'Personal Care',
  'Entertainment',
  'Miscellaneous',
] as const

// ─── Savings ────────────────────────────────────────────────────────────────

export const SAVINGS_TARGETS = [
  'Equipment Reserve',
  'Emergency Parts Fund',
  'Tax Reserve',
  'Tool Replacement Fund',
  'Shop Expansion Fund',
  'Insurance Deductible Reserve',
  'Payroll Buffer',
  'Cash Buffer',
  'Vacation',
] as const

// ─── Assets ─────────────────────────────────────────────────────────────────

export const ASSET_TIERS = {
  A: 'Tier A (Liquid)',
  B: 'Tier B (Equipment & Vehicles)',
  C: 'Tier C (Intangible)',
} as const

export const ASSET_OPTIONS_BY_TIER = {
  A: ['Cash (Checking)', 'Cash (Savings)', 'Accounts Receivable', 'Parts Inventory Value'],
  B: [
    'Vehicle Lifts',
    'Alignment Machine',
    'Diagnostic Equipment',
    'Air Compressor System',
    'Service Van / Tow Truck',
    'Personal Vehicle',
    'Tool Sets',
    'Shop Property',
    'Other Equipment',
  ],
  C: ['Customer List / Reputation', 'Licenses & Certifications', 'Brand / Online Presence'],
} as const

// ─── Debts ──────────────────────────────────────────────────────────────────

export const DEBT_TYPES = [
  'Equipment Loan',
  'SBA Loan',
  'Business Line of Credit',
  'Tool Financing (Snap-on / Mac)',
  'Auto / Truck Loan',
  'Shop Mortgage',
  'Personal Loan',
  'Credit Card',
  'Other',
] as const

// ─── Shared Options ─────────────────────────────────────────────────────────

export const DEBT_STRATEGIES = ['Avalanche', 'Snowball', 'Custom'] as const

export const MODES = ['Shop + Personal', 'Shop Only', 'Personal Only'] as const

export const SHOP_MODES = ['Solo Operator', 'With Employees'] as const

export const FIXED_VAR_OPTIONS = ['Fixed', 'Variable'] as const

export const BILLING_FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'] as const

// ─── Parts & Ledger ──────────────────────────────────────────────────────────

export const PARTS_STORES = [
  'Pieces Auto Technique',
  'Parts City NDG',
  'NAPA Auto Parts',
  "O'Reilly Auto Parts",
  'AutoZone',
  'Advance Auto Parts',
  'Carquest',
  'Worldpac',
  'LKQ',
  'Dorman',
  'RockAuto',
  'Interstate Batteries',
  'Gates Rubber',
  'Local Supplier',
  'Other',
] as const

export const PAYMENT_TERMS = ['COD', 'Net 7', 'Net 15', 'Net 30', 'Weekly', 'Monthly'] as const

export const PAYMENT_METHODS = ['Check', 'ACH / Bank Transfer', 'Card', 'Cash', 'Other'] as const

export const PARTS_ORDER_STATUSES = [
  'Needed',
  'Ordered',
  'Received',
  'Installed',
  'Returned',
  'Backordered',
  'On Hold',
] as const

export const INVOICE_STATUSES = ['Outstanding', 'Partial', 'Paid', 'Overdue'] as const

// ─── RockAuto Part Categories ─────────────────────────────────────────────────

export const ROCKAUTO_CATEGORIES = [
  'Air & Fuel Delivery',
  'Axle, CV & Differential',
  'Belts & Cooling',
  'Body & Lamps',
  'Brakes',
  'Climate Control',
  'Clutch & Drivetrain',
  'Electrical & Ignition',
  'Engine',
  'Exhaust',
  'Filters',
  'Gaskets & Sealing Systems',
  'Hardware',
  'Suspension & Steering',
  'Tools & Universal Parts',
  'Transmission & Transaxle',
  'Wheel & Tire',
  'Windshield & Wipers',
] as const
