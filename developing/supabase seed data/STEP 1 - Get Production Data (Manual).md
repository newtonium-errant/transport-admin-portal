# Step 1: Extract Production Data Manually

Since the automated SQL has syntax issues, let's do this manually in steps. It's actually easier!

## 🎯 What You'll Do

Run simple queries in **PRODUCTION** Supabase, then copy/paste the results.

---

## Step 1: Get Destinations

**Run in PRODUCTION:**
```sql
SELECT * FROM destinations ORDER BY id;
```

**Copy the entire result table** - you'll paste this into a file in Step 2.

---

## Step 2: Get Users (only 13, 23, 30)

**Run in PRODUCTION:**
```sql
SELECT * FROM users WHERE id IN (13, 23, 30) ORDER BY id;
```

**Copy the entire result table**

---

## Step 3: Get Driver (only id 11)

**Run in PRODUCTION:**
```sql
SELECT * FROM drivers WHERE id = 11;
```

**Copy the entire result**

---

## Step 4: Get K7807878 OpenPhone Data (for reference)

**Run in PRODUCTION:**
```sql
SELECT
    knumber,
    openphone_contact_id,
    openphone_sync_status,
    openphone_sync_date
FROM clients
WHERE knumber = 'K7807878';
```

**Write down these values** - you'll use them for all test clients:
- openphone_contact_id: `_______________`
- openphone_sync_status: `_______________`
- openphone_sync_date: `_______________`

---

## Step 5: Get K7807878 Full Record

**Run in PRODUCTION:**
```sql
SELECT * FROM clients WHERE knumber = 'K7807878';
```

**Copy the entire result** - this client stays as-is, no anonymization

---

## Step 6: Get Clients to Anonymize (first 50)

**Run in PRODUCTION:**
```sql
SELECT
    id,
    knumber,
    firstname,
    lastname,
    phone,
    email,
    civicaddress,
    city,
    prov,
    postalcode,
    notes,
    emergency_contact_name,
    emergency_contact_number,
    driver_gender_requirement,
    preferred_driver,
    mapaddress,
    active,
    appointment_length,
    primary_clinic_id,
    clinic_travel_times,
    status,
    created_at
FROM clients
WHERE knumber != 'K7807878'
  AND active = true
ORDER BY created_at
LIMIT 50;
```

**Copy the entire result table** - These will be anonymized in the next step

**Note:** If you want more than 50 clients, change the LIMIT

---

## Step 7: Count Appointments in Range

**Run in PRODUCTION:**
```sql
SELECT
    COUNT(*) as total_appointments,
    MIN(appointmenttime) as earliest,
    MAX(appointmenttime) as latest
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL;
```

**Note the count** - if it's over 100, you might want to reduce the date range.

---

## Step 8: Get Appointments

**Run in PRODUCTION:**
```sql
SELECT
    id,
    knumber,
    appointmenttime,
    pickuptime,
    locationname,
    locationaddress,
    notes,
    transittime,
    appointmentstatus,
    driver_assigned,
    driver_email,
    clinic_id,
    this_appointment_length,
    created_at
FROM appointments
WHERE appointmenttime >= CURRENT_DATE - INTERVAL '1 month'
  AND appointmenttime <= CURRENT_DATE + INTERVAL '1 month'
  AND deleted_at IS NULL
ORDER BY appointmenttime
LIMIT 100;
```

**Copy the entire result table**

---

## ✅ What You Have Now

You should have copied:
- [ ] All destinations
- [ ] 3 users (13, 23, 30)
- [ ] 1 driver (11)
- [ ] K7807878 OpenPhone values (written down)
- [ ] K7807878 full record
- [ ] ~50 clients to anonymize
- [ ] ~100 appointments

---

## 📝 Next Step

Go to **STEP 2** guide to import this data into Testing Branch with anonymization.
