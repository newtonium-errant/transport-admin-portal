# Invoice Data Requirements - Gap Analysis

## Summary

After analyzing the database schema and the invoice PDF example, **95% of required invoice data already exists** in the database. Only minimal additions are needed.

---

## ✅ Complete - Data Already in Database

### Invoice Header Information (from `invoices` table)
- ✅ `invoice_number` - Sequential number (INV-0001, INV-0002, etc.)
- ✅ `invoice_date` - Invoice date
- ✅ `knumber` - Client identifier
- ✅ `invoice_subtotal` - Sum of all trip costs
- ✅ `invoice_tax` - HST 14%
- ✅ `invoice_total` - Total amount
- ✅ `invoice_status` - created/sent/paid/void
- ✅ `qbo_sync_status` - QuickBooks sync tracking

### Invoice Line Items (from `appointments` table via `invoice_id`)
- ✅ `knumber` - Client K number
- ✅ `appointmenttime` - Date of trip
- ✅ `locationname` - Destination clinic name
- ✅ `locationaddress` - Destination clinic address
- ✅ `custom_rate` - Trip cost (price)
- ✅ `invoice_status` - Tracks invoice lifecycle

### Client Information (from `clients` table via `knumber`)
- ✅ `firstname`, `lastname` - Client full name
- ✅ `civicaddress`, `city`, `prov`, `postalcode` - Client address

### Company Information (Constants)
- ✅ Company Name: "3335556 NS Ltd" (hardcoded)
- ✅ Company Address: "PO Box 35021 Scotia Square RPO, Halifax NS B3J 3S1" (hardcoded)
- ✅ HST Registration: "74315 0476 RT 0001" (hardcoded)
- ✅ Billed To: "Medavie Blue Cross" (hardcoded)
- ✅ Provider Type: "Transportation Provider" (hardcoded)
- ✅ Benefit Code: [constant value] (hardcoded)
- ✅ Prescriber Type: [constant value] (hardcoded)
- ✅ All clients are VAC clients (constant)

---

## ❌ Missing - Need to Add

### Option 1: Add `medical_reason` Field to Appointments (Recommended if it varies)

**If medical reason differs per appointment:**

Add to `appointments` table:
```sql
ALTER TABLE appointments ADD COLUMN medical_reason TEXT;
COMMENT ON COLUMN appointments.medical_reason IS 'Description of medical service (e.g., Medical appointment, Physical therapy)';
```

**Frontend Changes:**
- Add "Medical Reason" field to AppointmentModal
- Add to appointment creation/edit forms
- Display in appointment lists

**Pros:**
- Flexible - different reason per appointment
- Easy to search/filter by medical reason
- Detailed invoice line items

**Cons:**
- Requires user input for every appointment
- More complex UI
- Data entry burden

---

### ✅ CONFIRMED: Exact Invoice Format from User

**Invoice Line Item Format (EXACT):**
```
K[knumber] [Client Name]
[Date] - Round trip from Client's home to [Clinic Name] to see Jamie Sweetland, NP, for ketamine treatment (Depression)
```

**Example:**
```
K6340996 Darrel Slaney
14-11-2025 - Round trip from Client's home to NuVista Psychedelic Greenwood to see Jamie Sweetland, NP, for ketamine treatment (Depression)
```

**What Changes per Invoice:**
- K number: from `appointments.knumber`
- Client name: from `clients.firstname + clients.lastname`
- Date: from `appointments.appointmenttime` (formatted as DD-MM-YYYY)
- Clinic name: from `appointments.locationname`

**What Stays Constant:**
- Line format: "Round trip from Client's home to {clinic} to see Jamie Sweetland, NP, for ketamine treatment (Depression)"
- Benefit code: **700409**
- Prescriber type: **MD**
- Provider name: **Jamie Sweetland, NP**
- Treatment: **ketamine treatment (Depression)**

**Config Storage:**
```sql
INSERT INTO app_config (key, value, description) VALUES
('invoice_line_format', 'Round trip from Client''s home to {clinic} to see Jamie Sweetland, NP, for ketamine treatment (Depression)', 'Invoice line item format'),
('invoice_benefit_code', '700409', 'VAC benefit code'),
('invoice_prescriber_type', 'MD', 'Prescriber type for claims'),
('invoice_provider_name', 'Jamie Sweetland, NP', 'Provider name'),
('invoice_treatment_description', 'ketamine treatment (Depression)', 'Treatment description');
```

**Frontend Changes:**
- None needed - pull from config during invoice generation
- Display in invoice preview

**Pros:**
- No user input required
- Consistent across all invoices
- Simple implementation

**Cons:**
- Not flexible - same reason for all appointments
- Must update config to change

---

### Option 3: Hybrid - Default with Override

**Best of both worlds:**

1. Store default in `app_config`
2. Add optional `medical_reason` field to appointments
3. Use appointment-specific value if present, otherwise use default

```sql
-- Add optional field
ALTER TABLE appointments ADD COLUMN medical_reason TEXT;

-- Add default config
INSERT INTO app_config (key, value, description) VALUES
('invoice_default_medical_reason', 'Medical Transportation', 'Default medical reason when appointment.medical_reason is NULL');
```

**Frontend Changes:**
- Add optional "Medical Reason" field to AppointmentModal
- Pre-fill with default value
- Allow override for special cases

**Invoice Generation Logic:**
```javascript
const medicalReason = appointment.medicalReason ||
                      configSettings.invoice_default_medical_reason ||
                      'Medical Transportation';
```

**Pros:**
- Flexible - can override when needed
- Simple default case (most appointments)
- Gradual adoption

**Cons:**
- Slightly more complex logic
- Optional field might confuse users

---

## 🎯 FINAL IMPLEMENTATION (USER CONFIRMED)

**Exact format confirmed by user - replicate Invoice #139 exactly**

### Required Changes:

**1. Add Config Entries (One-time SQL)**

**File:** `developing/sql/add_invoice_config.sql`

```sql
INSERT INTO app_config (key, value, description) VALUES
('invoice_line_format', 'Round trip from Client''s home to {clinic} to see Jamie Sweetland, NP, for ketamine treatment (Depression)', 'Invoice line item format'),
('invoice_benefit_code', '700409', 'VAC benefit code'),
('invoice_prescriber_type', 'MD', 'Prescriber type for claims'),
('invoice_provider_name', 'Jamie Sweetland, NP', 'Provider name'),
('invoice_treatment_description', 'ketamine treatment (Depression)', 'Treatment description');
```

**2. Create GET App Config Workflow**

**File:** `developing/TEST Workflow Copies/TEST - Get App Config.json`

**Endpoint:** `GET /webhook/TEST-get-app-config`

**Response:**
```json
{
  "success": true,
  "message": "App config retrieved successfully",
  "data": {
    "config": {
      "invoice_line_format": "Round trip from Client's home to {clinic} to see Jamie Sweetland, NP, for ketamine treatment (Depression)",
      "invoice_benefit_code": "700409",
      "invoice_prescriber_type": "MD",
      "invoice_provider_name": "Jamie Sweetland, NP",
      "invoice_treatment_description": "ketamine treatment (Depression)"
    }
  },
  "count": 5
}
```

**3. Update Frontend Invoice Generation (`TEST-finance-v4.js`)**

Load config values once on page load:
```javascript
let invoiceConfig = null;

async function loadInvoiceConfig() {
    const response = await APIClient.get('/TEST-get-app-config');
    invoiceConfig = response.data.config;
    return invoiceConfig;
}

// Call during page initialization
await loadInvoiceConfig();
```

Format invoice line items with EXACT user format:
```javascript
function formatInvoiceLineItem(appointment, client) {
    // Format date as DD-MM-YYYY (matching user's example: 14-11-2025)
    const date = new Date(appointment.appointmenttime);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

    // Replace {clinic} placeholder with actual clinic name
    const description = invoiceConfig.invoice_line_format.replace('{clinic}', appointment.locationname);

    return {
        line1: `K${appointment.knumber} ${client.firstname} ${client.lastname}`,
        line2: `${formattedDate} - ${description}`,
        amount: appointment.custom_rate
    };
}
```

Display in invoice:
```javascript
function renderInvoiceLineItems(appointments, client) {
    return appointments.map(apt => {
        const lineItem = formatInvoiceLineItem(apt, client);
        return `
            <div class="invoice-line-item">
                <div class="line-client-info">${lineItem.line1}</div>
                <div class="line-description">${lineItem.line2}</div>
                <div class="line-amount">${formatCurrency(lineItem.amount)}</div>
            </div>
        `;
    }).join('');
}
```

**3. Create Invoice PDF/Print Template**

Include constants:
```javascript
const invoiceTemplate = {
    company: {
        name: '3335556 NS Ltd',
        address: 'PO Box 35021 Scotia Square RPO',
        cityProvPostal: 'Halifax NS B3J 3S1',
        hstNumber: '74315 0476 RT 0001'
    },
    billedTo: 'Medavie Blue Cross',
    clientType: 'VAC Client',
    providerName: invoiceConfig.providerName,
    benefitCode: invoiceConfig.benefitCode,
    prescriberType: invoiceConfig.prescriberType,
    authorizationNumber: '' // Always blank per user
};
```

---

## 📊 Complete Invoice Data Mapping

### Invoice PDF Section → Database Source

| Invoice Field | Source | Notes |
|--------------|--------|-------|
| **Invoice Number** | `invoices.invoice_number` | INV-0001 (auto-generated) |
| **Invoice Date** | `invoices.invoice_date` | User-selected |
| **Client K Number** | `invoices.knumber` | From grouped appointments |
| **Client Name** | `clients.firstname + clients.lastname` | Via knumber |
| **Client Address** | `clients.civicaddress, city, prov, postalcode` | Full address |
| **Billed To** | Constant: "Medavie Blue Cross" | Hardcoded |
| **Company Name** | Constant: "3335556 NS Ltd" | Hardcoded |
| **Company Address** | Constant: "PO Box 35021..." | Hardcoded |
| **HST Number** | Constant: "74315 0476 RT 0001" | Hardcoded |
| **Line Item: Date** | `appointments.appointmenttime` | Formatted as date only |
| **Line Item: Description** | Config: `invoice_medical_reason` + `appointments.locationname` | e.g., "Medical Transportation - IWK Health" |
| **Line Item: Destination** | `appointments.locationname` | Clinic name |
| **Line Item: Amount** | `appointments.custom_rate` | Trip cost |
| **Subtotal** | `invoices.invoice_subtotal` | Sum of custom_rate |
| **HST (14%)** | `invoices.invoice_tax` | Subtotal * 0.14 |
| **Total** | `invoices.invoice_total` | Subtotal + Tax |
| **Authorization #** | Empty string | Always blank |
| **Benefit Code** | Config: `invoice_benefit_code` | Constant per user |
| **Prescriber Type** | Config: `invoice_prescriber_type` | Constant |
| **Provider Name** | Config: `invoice_provider_name` | "Transportation Provider" |
| **Client Type** | Constant: "VAC Client" | All clients are VAC |

---

## 🚀 Implementation Steps

### Immediate (No Database Changes)
1. ✅ Migration 11 already run (invoices table created)
2. ✅ 4 workflows already created (Create, Get, Update Status, Void)
3. ✅ Frontend v4 already created (TEST-finance-v4.html + .js)

### Next Steps (Minimal Additions)

**Step 1: Add Config Entries** (5 minutes)
- Run SQL to add invoice config values to `app_config` table
- Confirm actual values with user for benefit code, prescriber type

**Step 2: Create Get Config Endpoint** (15 minutes - n8n workflow)
- Create `/TEST-get-app-config` workflow
- Returns all app_config key-value pairs
- Filter by key prefix if needed (e.g., `invoice_*`)

**Step 3: Update Frontend** (30 minutes)
- Add `loadInvoiceConfig()` function to TEST-finance-v4.js
- Update invoice line item formatting to include medical reason
- Add constants for company info, billed to, etc.

**Step 4: Create Invoice Print/PDF Template** (2 hours - Future Phase)
- HTML template matching PDF layout
- CSS for print styling
- JavaScript print function
- Export to PDF option (future: integrate with QBO PDF generation)

**Total Time: ~3 hours to complete invoice data integration**

---

## 🔍 Questions for User

Before proceeding, please confirm:

1. **Medical Reason**: Is "Medical Transportation" appropriate for all appointments, or do you have a specific standard description you use?

2. **Benefit Code**: What is the actual VAC benefit code used for medical transportation claims?

3. **Prescriber Type**: Is "Physician" correct, or should it be something else (e.g., "Medical Doctor", "Healthcare Provider")?

4. **Authorization Numbers**: You mentioned "authorization number is always blank" - is this correct for the invoice itself, or are authorization numbers tracked separately?

5. **Invoice Format**: Do you need PDF generation now, or is HTML print-view sufficient initially (can print to PDF from browser)?

---

Last Updated: 2025-11-26
Status: Ready for config additions and frontend updates
