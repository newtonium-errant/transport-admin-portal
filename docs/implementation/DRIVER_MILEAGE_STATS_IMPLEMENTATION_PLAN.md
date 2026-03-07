# Driver Mileage Stats Implementation Plan

## Overview

Add a mileage statistics display for drivers showing:
- **Year-to-Date (YTD) Mileage**: Total km driven from January 1 of current year
- **All-Time Mileage**: Total km since driver started (based on `created_at` or first completed appointment)
- **Supplementary Stats**: Trips completed, monthly breakdown, average per trip

## Current State

### Existing Infrastructure (Ready to Use)

| Component | Location | Status |
|-----------|----------|--------|
| `drivers.mileage_ytd` | Database column (JSONB) | Populated - `{"2026": {"01": 803.8, "02": 448.8}}` |
| `drivers.created_at` | Database column | Populated - driver start date |
| `appointments.driver_total_distance` | Database column | Populated - per-trip distance in km |
| `getDriverYTDMileageUpTo()` | `js/core/finance.js:534-551` | Working - calculates YTD from JSONB |
| Driver profile tabs | `profile.html` | 3 tabs exist: Profile, Availability, Upcoming Drives |

### Existing mileage_ytd JSONB Structure

```json
{
  "2025": {
    "01": 125.4,
    "02": 203.8,
    "03": 189.2,
    ...
    "12": 0
  },
  "2026": {
    "01": 803.8,
    "02": 448.8
  }
}
```

**Note**: Keys are numeric month strings ("01"-"12"), not month abbreviations.

---

## Implementation Components

### 1. Database Changes

**Status**: No schema changes needed

The existing `mileage_ytd` JSONB column on `drivers` table already stores yearly/monthly breakdown. The `created_at` timestamp provides the "since started" reference date.

**Optional Enhancement** (if needed later):
```sql
-- Add lifetime total for faster queries (avoid summing all years)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS mileage_lifetime NUMERIC(10,2) DEFAULT 0;
```

---

### 2. API Endpoint: `/get-driver-mileage-stats`

**File**: `workflows/drivers/DRIVER - Get Mileage Stats.json`

**Purpose**: Return aggregated mileage statistics for a driver

**Request**:
```javascript
GET /webhook/get-driver-mileage-stats?driver_id=11
Authorization: Bearer <token>
```

**Response**:
```javascript
{
  success: true,
  data: {
    driver_id: 11,
    driver_name: "John Smith",
    started_date: "2024-03-15",           // drivers.created_at

    // Year-to-Date Stats
    ytd_mileage_km: 4523.6,               // Sum of current year months
    ytd_trips_completed: 89,               // Count of completed appointments this year
    ytd_avg_per_trip_km: 50.8,            // ytd_mileage / ytd_trips

    // All-Time Stats
    lifetime_mileage_km: 12847.2,         // Sum of all years
    lifetime_trips_completed: 304,         // Total completed appointments
    lifetime_avg_per_trip_km: 42.3,

    // Current Month Stats
    current_month_mileage_km: 892.4,
    current_month_trips: 18,

    // Monthly Breakdown (for chart/table)
    monthly_breakdown: [
      { year: 2026, month: "01", mileage_km: 803.8, trips: 16 },
      { year: 2026, month: "02", mileage_km: 448.8, trips: 12 },
      { year: 2026, month: "03", mileage_km: 892.4, trips: 18 }
    ],

    // Yearly Totals
    yearly_totals: [
      { year: 2024, mileage_km: 3200.0, trips: 78 },
      { year: 2025, mileage_km: 5123.6, trips: 137 },
      { year: 2026, mileage_km: 4523.6, trips: 89 }
    ]
  },
  timestamp: "2026-03-07T12:00:00.000Z"
}
```

**n8n Workflow Logic**:

1. **Webhook Trigger**: `GET /get-driver-mileage-stats`
2. **Extract driver_id** from query params
3. **Validate JWT** (standard auth check)
4. **Fetch Driver** from Supabase:
   ```sql
   SELECT id, name, mileage_ytd, created_at
   FROM drivers
   WHERE id = $driver_id
   ```
5. **Fetch Appointment Counts** from Supabase:
   ```sql
   SELECT
     EXTRACT(YEAR FROM appointmenttime AT TIME ZONE 'America/Halifax') as year,
     EXTRACT(MONTH FROM appointmenttime AT TIME ZONE 'America/Halifax') as month,
     COUNT(*) as trips,
     SUM(driver_total_distance) as distance
   FROM appointments
   WHERE driver_id = $driver_id
     AND status = 'completed'
     AND deleted = false
   GROUP BY year, month
   ORDER BY year DESC, month DESC
   ```
6. **Code Node** - Aggregate:
   ```javascript
   const driver = $('Fetch Driver').item.json;
   const appointments = $('Fetch Appointments').all();
   const mileageYtd = driver.mileage_ytd || {};
   const currentYear = new Date().getFullYear().toString();
   const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');

   // Calculate YTD
   let ytdMileage = 0;
   const yearData = mileageYtd[currentYear] || {};
   for (const month in yearData) {
     ytdMileage += yearData[month] || 0;
   }

   // Calculate lifetime
   let lifetimeMileage = 0;
   for (const year in mileageYtd) {
     const yearData = mileageYtd[year];
     for (const month in yearData) {
       lifetimeMileage += yearData[month] || 0;
     }
   }

   // Build monthly breakdown from appointments
   const monthlyBreakdown = appointments.map(a => ({
     year: a.json.year,
     month: String(a.json.month).padStart(2, '0'),
     mileage_km: parseFloat(a.json.distance) || 0,
     trips: parseInt(a.json.trips) || 0
   }));

   // Yearly totals
   const yearlyMap = {};
   for (const year in mileageYtd) {
     yearlyMap[year] = { mileage_km: 0, trips: 0 };
     for (const month in mileageYtd[year]) {
       yearlyMap[year].mileage_km += mileageYtd[year][month] || 0;
     }
   }
   appointments.forEach(a => {
     const y = String(a.json.year);
     if (!yearlyMap[y]) yearlyMap[y] = { mileage_km: 0, trips: 0 };
     yearlyMap[y].trips += parseInt(a.json.trips) || 0;
   });

   const yearlyTotals = Object.entries(yearlyMap)
     .map(([year, data]) => ({ year: parseInt(year), ...data }))
     .sort((a, b) => b.year - a.year);

   // Trip counts
   const ytdTrips = monthlyBreakdown
     .filter(m => m.year == currentYear)
     .reduce((sum, m) => sum + m.trips, 0);
   const lifetimeTrips = appointments.reduce((sum, a) => sum + parseInt(a.json.trips || 0), 0);
   const currentMonthData = monthlyBreakdown.find(m =>
     m.year == currentYear && m.month == currentMonth
   ) || { mileage_km: 0, trips: 0 };

   return {
     driver_id: driver.id,
     driver_name: driver.name,
     started_date: driver.created_at?.split('T')[0],

     ytd_mileage_km: Math.round(ytdMileage * 10) / 10,
     ytd_trips_completed: ytdTrips,
     ytd_avg_per_trip_km: ytdTrips > 0 ? Math.round((ytdMileage / ytdTrips) * 10) / 10 : 0,

     lifetime_mileage_km: Math.round(lifetimeMileage * 10) / 10,
     lifetime_trips_completed: lifetimeTrips,
     lifetime_avg_per_trip_km: lifetimeTrips > 0 ? Math.round((lifetimeMileage / lifetimeTrips) * 10) / 10 : 0,

     current_month_mileage_km: currentMonthData.mileage_km,
     current_month_trips: currentMonthData.trips,

     monthly_breakdown: monthlyBreakdown,
     yearly_totals: yearlyTotals
   };
   ```
7. **Format Response** with standard structure

---

### 3. Frontend: Profile Page Stats Tab

**Files to Modify**:
- `profile.html` - Add new tab and tab pane
- (Optional) Extract to `js/pages/profile-stats.js` if logic is complex

#### 3.1 Add Tab Button

**Location**: `profile.html` around line 1530 (after "Upcoming Drives" tab)

```html
<li class="nav-item" role="presentation">
    <button class="nav-link" id="tab-stats" data-bs-toggle="tab" data-bs-target="#pane-stats" type="button" role="tab" aria-controls="pane-stats" aria-selected="false">
        <i class="bi bi-speedometer2 me-1"></i>My Stats
    </button>
</li>
```

#### 3.2 Add Tab Pane Content

**Location**: `profile.html` after the appointments tab pane (around line 1830)

```html
<!-- Tab 4: Stats (drivers only) -->
<div class="tab-pane fade" id="pane-stats" role="tabpanel" aria-labelledby="tab-stats">
    <div class="stats-container">

        <!-- Stats Cards Row -->
        <div class="row g-4 mb-4">
            <!-- YTD Mileage Card -->
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="bi bi-calendar-check"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">Year-to-Date</div>
                        <div class="stat-value" id="statYtdMileage">
                            <span class="skeleton-inline"></span>
                        </div>
                        <div class="stat-sublabel">Jan 1 - Today</div>
                    </div>
                </div>
            </div>

            <!-- All-Time Mileage Card -->
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="bi bi-trophy"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">All-Time</div>
                        <div class="stat-value" id="statLifetimeMileage">
                            <span class="skeleton-inline"></span>
                        </div>
                        <div class="stat-sublabel" id="statStartedDate">Since loading...</div>
                    </div>
                </div>
            </div>

            <!-- This Month Card -->
            <div class="col-md-4">
                <div class="stat-card">
                    <div class="stat-icon">
                        <i class="bi bi-calendar-month"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-label">This Month</div>
                        <div class="stat-value" id="statCurrentMonth">
                            <span class="skeleton-inline"></span>
                        </div>
                        <div class="stat-sublabel" id="statCurrentMonthName">March 2026</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Secondary Stats Row -->
        <div class="row g-4 mb-4">
            <div class="col-md-4">
                <div class="stat-card stat-card-secondary">
                    <div class="stat-label">YTD Trips</div>
                    <div class="stat-value-sm" id="statYtdTrips">--</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="stat-card stat-card-secondary">
                    <div class="stat-label">All-Time Trips</div>
                    <div class="stat-value-sm" id="statLifetimeTrips">--</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="stat-card stat-card-secondary">
                    <div class="stat-label">Avg per Trip</div>
                    <div class="stat-value-sm" id="statAvgPerTrip">--</div>
                </div>
            </div>
        </div>

        <!-- Monthly Breakdown Table -->
        <div class="profile-card">
            <div class="profile-card-header">
                <i class="bi bi-bar-chart-line"></i>
                <h2>Monthly Breakdown</h2>
            </div>
            <div class="profile-card-body">
                <div class="table-responsive">
                    <table class="table table-hover" id="monthlyStatsTable">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th class="text-end">Distance (km)</th>
                                <th class="text-end">Trips</th>
                                <th class="text-end">Avg/Trip</th>
                            </tr>
                        </thead>
                        <tbody id="monthlyStatsBody">
                            <!-- Skeleton rows -->
                            <tr class="skeleton-row">
                                <td><span class="skeleton-inline" style="width:80px;"></span></td>
                                <td class="text-end"><span class="skeleton-inline" style="width:60px;"></span></td>
                                <td class="text-end"><span class="skeleton-inline" style="width:30px;"></span></td>
                                <td class="text-end"><span class="skeleton-inline" style="width:50px;"></span></td>
                            </tr>
                            <!-- Repeat 5 more skeleton rows -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </div>
</div>
```

#### 3.3 Add CSS Styles

**Location**: `profile.html` `<style>` section (around line 300)

```css
/* Stats Tab Styles */
.stat-card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    display: flex;
    align-items: center;
    gap: 16px;
    height: 100%;
}

.stat-card-secondary {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 20px;
}

.stat-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    flex-shrink: 0;
}

.stat-content {
    flex: 1;
}

.stat-label {
    font-size: 0.85rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}

.stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-primary);
    line-height: 1.2;
}

.stat-value-sm {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-primary);
}

.stat-sublabel {
    font-size: 0.8rem;
    color: #999;
    margin-top: 4px;
}

.skeleton-inline {
    display: inline-block;
    height: 1em;
    width: 100px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
}

@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
```

#### 3.4 Add JavaScript Logic

**Location**: `profile.html` `<script>` section

```javascript
// ========== Stats Tab ==========
let statsLoaded = false;

// Load stats when tab is shown
document.getElementById('tab-stats')?.addEventListener('shown.bs.tab', async () => {
    if (!statsLoaded) {
        await loadDriverStats();
        statsLoaded = true;
    }
});

async function loadDriverStats() {
    if (!currentUser.driver_id) {
        console.warn('No driver_id found for current user');
        return;
    }

    try {
        const response = await authenticatedFetch(
            `${API_BASE}/get-driver-mileage-stats?driver_id=${currentUser.driver_id}`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch stats');
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Stats fetch failed');
        }

        const stats = result.data;

        // Update main stat cards
        document.getElementById('statYtdMileage').textContent =
            formatNumber(stats.ytd_mileage_km) + ' km';
        document.getElementById('statLifetimeMileage').textContent =
            formatNumber(stats.lifetime_mileage_km) + ' km';
        document.getElementById('statCurrentMonth').textContent =
            formatNumber(stats.current_month_mileage_km) + ' km';

        // Update sublabels
        if (stats.started_date) {
            const startDate = new Date(stats.started_date);
            document.getElementById('statStartedDate').textContent =
                `Since ${startDate.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}`;
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const now = new Date();
        document.getElementById('statCurrentMonthName').textContent =
            `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

        // Update secondary stats
        document.getElementById('statYtdTrips').textContent = stats.ytd_trips_completed;
        document.getElementById('statLifetimeTrips').textContent = stats.lifetime_trips_completed;
        document.getElementById('statAvgPerTrip').textContent =
            formatNumber(stats.lifetime_avg_per_trip_km) + ' km';

        // Build monthly breakdown table
        renderMonthlyTable(stats.monthly_breakdown);

    } catch (error) {
        console.error('Error loading driver stats:', error);
        showToast('Failed to load statistics. Please try again.', 'error');
    }
}

function renderMonthlyTable(breakdown) {
    const tbody = document.getElementById('monthlyStatsBody');
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (!breakdown || breakdown.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted py-4">
                    No driving data recorded yet
                </td>
            </tr>
        `;
        return;
    }

    // Sort by year desc, month desc
    breakdown.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return parseInt(b.month) - parseInt(a.month);
    });

    // Take last 12 months
    const recent = breakdown.slice(0, 12);

    tbody.innerHTML = recent.map(row => {
        const monthNum = parseInt(row.month);
        const avg = row.trips > 0 ? (row.mileage_km / row.trips).toFixed(1) : '0.0';

        return `
            <tr>
                <td>${monthNames[monthNum]} ${row.year}</td>
                <td class="text-end">${formatNumber(row.mileage_km)}</td>
                <td class="text-end">${row.trips}</td>
                <td class="text-end">${avg}</td>
            </tr>
        `;
    }).join('');
}

function formatNumber(num) {
    if (num == null || isNaN(num)) return '0';
    return parseFloat(num).toLocaleString('en-CA', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
}
```

---

### 4. API Client Updates (Optional)

**File**: `js/core/api-client.js`

Add convenience method to DriversAPI:

```javascript
// In DriversAPI object
getMileageStats: async (driverId) => {
    return APIClient.get(`/get-driver-mileage-stats?driver_id=${driverId}`);
}
```

---

## Files to Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `profile.html` | Modify | Add Stats tab button, tab pane, CSS, JavaScript |
| `workflows/drivers/DRIVER - Get Mileage Stats.json` | Create | New n8n workflow for stats endpoint |
| `docs/reference/API_ENDPOINTS.md` | Modify | Document new endpoint |
| `js/core/api-client.js` | Modify (optional) | Add convenience method |

---

## Testing Checklist

### Unit Tests
- [ ] API returns correct YTD calculation
- [ ] API returns correct lifetime calculation
- [ ] Monthly breakdown sorted correctly
- [ ] Edge case: Driver with no completed appointments
- [ ] Edge case: Driver created this year (short history)

### Integration Tests
- [ ] Stats tab loads when clicked
- [ ] Stats display correct values matching finance page calculations
- [ ] Skeleton loaders show during fetch
- [ ] Error handling shows toast on failure
- [ ] Tab only visible for driver role users

### Cross-Role Tests
- [ ] Admin cannot see stats tab (not a driver)
- [ ] Supervisor cannot see stats tab (not a driver)
- [ ] Booking agent cannot see stats tab
- [ ] Driver sees stats tab with correct data

---

## Implementation Order

1. **Create n8n workflow** (`DRIVER - Get Mileage Stats.json`)
   - Test with manual trigger first
   - Validate response structure
   - Import to Railway

2. **Update profile.html**
   - Add tab button
   - Add tab pane HTML
   - Add CSS styles
   - Add JavaScript logic

3. **Test end-to-end**
   - Login as driver
   - Navigate to Profile
   - Click Stats tab
   - Verify data matches expected values

4. **Documentation**
   - Update API_ENDPOINTS.md
   - Update CLAUDE.md if needed

---

## Security Considerations

- Drivers can ONLY see their own stats (enforce `driver_id = currentUser.driver_id`)
- Admin/Supervisor should NOT have access to this tab (it's driver-specific)
- No sensitive financial data exposed (mileage only, not pay rates)

---

## Future Enhancements

1. **Graphical Chart**: Add Chart.js line/bar chart for monthly trends
2. **Year Selector**: Dropdown to view specific year stats
3. **Export**: Download CSV of mileage history
4. **Comparison**: Show vs. previous year/month
5. **Goals**: Set and track mileage goals
