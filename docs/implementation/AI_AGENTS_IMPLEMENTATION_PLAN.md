# RRTS AI Agents Implementation Plan

> High-level plan for integrating AI agents into Rural Ride Transport Service operations.
> Based on patterns from [Lumberjack.so](https://lumberjack.so/), [n8n AI workflows](https://n8n.io/workflows/3050-build-your-first-ai-data-analyst-chatbot/), and [Alfred agentic infrastructure](https://github.com/ssdavidai/alfred).

---

## Architecture Overview

Inspired by Alfred's six-layer architecture, adapted for RRTS:

```
┌─────────────────────────────────────────────────────────────┐
│  INTERFACE LAYER                                            │
│  Schedule Page | Admin Portal | Slack/Email | CLI           │
├─────────────────────────────────────────────────────────────┤
│  AGENT LAYER                                                │
│  Scheduling Agent | Intake Agent | Auditor | Q&A Assistant  │
├─────────────────────────────────────────────────────────────┤
│  KINETIC LAYER (Orchestration)                              │
│  n8n Workflows | Scheduled Jobs | Event Triggers            │
├─────────────────────────────────────────────────────────────┤
│  SEMANTIC LAYER (Knowledge)                                 │
│  Supabase pgvector | SOPs/Policies | Message Templates      │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                 │
│  Supabase (appointments, drivers, clients) | Google Calendar│
├─────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE LAYER                                       │
│  Supabase | n8n (self-hosted) | Claude API                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Guiding Principles

From Lumberjack: Target **"high-volume, low-complexity work that burns time without building value."**

From Alfred:
- **Constrained permissions** - each agent has a defined scope
- **Separation of concerns** - agents operate independently
- **Ambient intelligence** - background processing without explicit prompts
- **Pluggable backends** - swap AI providers without rewriting logic

---

## Priority Agents

### Agent 1: Scheduling Assistant
**Scope:** Schedule page intelligence
**Trigger:** User action (button click, natural language input)
**Permissions:** Read appointments/drivers/clients, suggest actions (no auto-write)

#### Features
| Feature | Description | Implementation |
|---------|-------------|----------------|
| Smart driver suggestions | Rank drivers by proximity, client history, workload | n8n workflow + Claude API |
| Natural language search | "open slots near Halifax Wednesday" | Webhook + Claude function calling |
| Conflict detection | Alert on double-bookings, driver unavailability | Pre-save validation workflow |
| Batch scheduling | "Add dialysis recurring Mon/Wed/Fri for 3 months" | Claude parses → creates draft appointments |

#### n8n Workflow Pattern
```
Webhook (user query)
    → Fetch context (drivers, appointments, client prefs)
    → Claude API with function calling
    → Return structured suggestions
    → UI displays options for user confirmation
```

#### Data Requirements
- Driver locations (home_coordinates exists)
- Driver availability (schedules table)
- Client preferences (client_preferences JSONB)
- Historical driver-client pairings

---

### Agent 2: Email Intake Parser
**Scope:** Parse clinic appointment emails into draft appointments
**Trigger:** Email webhook or manual paste
**Permissions:** Read emails, create DRAFT appointments only

#### Workflow
```
Email arrives (clinic appointment list)
    → n8n Email Trigger (or manual paste webhook)
    → Claude API extracts structured data:
        - Client names
        - Dates/times
        - Appointment types
        - Clinic name
    → Fuzzy match clients (flag unknowns)
    → Create appointments with status: 'pending_review'
    → Notify supervisor: "5 appointments parsed, 1 needs review"
    → Supervisor reviews in UI, approves/edits
```

#### Example Input
```
Next week's dialysis patients:
- John Smith Mon/Wed/Fri 8:00 AM
- Mary Jones Tue/Thu 9:00 AM
- Robert Brown Mon 10:30 AM (new patient, needs wheelchair van)
```

#### Example Output
```json
{
  "parsed_appointments": [
    {
      "client_match": { "name": "John Smith", "knumber": "K1234", "confidence": 0.95 },
      "dates": ["2026-03-16", "2026-03-18", "2026-03-20"],
      "time": "08:00",
      "type": "dialysis",
      "notes": null
    },
    {
      "client_match": { "name": "Robert Brown", "knumber": null, "confidence": 0 },
      "dates": ["2026-03-16"],
      "time": "10:30",
      "type": "dialysis",
      "notes": "new patient, needs wheelchair van",
      "flags": ["NEW_CLIENT", "WHEELCHAIR_REQUIRED"]
    }
  ]
}
```

#### Estimated Time Savings
- Before: 15-20 min manually entering 10 appointments
- After: 2-3 min reviewing parsed results
- **Savings: 12-17 min per email batch**

---

### Agent 3: No-Show Predictor
**Scope:** Flag high-risk appointments for proactive confirmation
**Trigger:** Daily scheduled job (morning)
**Permissions:** Read appointments/clients/weather, update risk_score field

#### Data Sources
| Source | Data | Weight |
|--------|------|--------|
| Client history | No-show rate, cancellation patterns | High |
| Weather API | Environment Canada forecast | Medium |
| Appointment type | Dialysis (critical) vs routine | Low |
| Day/time patterns | Monday mornings, Friday afternoons | Low |

#### Workflow
```
Daily 6:00 AM trigger
    → Fetch today's appointments
    → Fetch weather forecast (Environment Canada API)
    → For each appointment:
        → Calculate risk score (0-100)
        → Factors: client_no_show_rate * 0.4 + weather_risk * 0.3 + pattern_risk * 0.3
    → Flag appointments with score > 70
    → Send summary to supervisors:
        "3 high-risk appointments today (freezing rain + client history)"
    → Suggest: "Send extra confirmation to flagged clients?"
```

#### Weather Risk Mapping
| Condition | Risk Modifier |
|-----------|---------------|
| Clear | 0 |
| Rain | +10 |
| Snow | +20 |
| Freezing rain | +35 |
| Blizzard warning | +50 |

---

### Agent 4: Finance/Payroll Auditor
**Scope:** Flag anomalies before month-end processing
**Trigger:** Weekly scheduled job + on-demand
**Permissions:** Read appointments/drivers/mileage, create audit_flags records

#### Automated Checks
| Check | Logic | Severity |
|-------|-------|----------|
| Mileage variance | Claimed vs Google Maps expected > 15% | Warning |
| Duplicate billing | Same client, same day, same time | Error |
| Missing completion | Status=completed but no dropoff_time | Warning |
| Unusual volume | Driver mileage > 2x their 30-day average | Info |
| Orphan appointments | Completed but driver not paid | Error |

#### Output Format
```json
{
  "audit_date": "2026-03-10",
  "period": "2026-03-01 to 2026-03-10",
  "flags": [
    {
      "type": "MILEAGE_VARIANCE",
      "severity": "warning",
      "appointment_id": 12345,
      "driver": "Jane Doe",
      "details": "Claimed 45km, expected 32km (40% variance)",
      "suggested_action": "Review with driver or adjust mileage"
    }
  ],
  "summary": {
    "errors": 1,
    "warnings": 4,
    "info": 2
  }
}
```

---

### Agent 5: Staff Q&A / Knowledge Assistant
**Scope:** Answer policy questions, lookup procedures, explain rules
**Trigger:** Chat interface (portal or Slack)
**Permissions:** Read knowledge base, read appointments/clients (for context)

#### Knowledge Sources
| Source | Content | Sync Method |
|--------|---------|-------------|
| Notion (future) | SOPs, policies, training docs | Notion API → pgvector |
| Markdown files | Message templates, procedures | Git sync → pgvector |
| Supabase | Appointment rules, rate configs | Direct query |

#### Architecture (RAG Pipeline)
```
User question
    → Generate embedding (Claude API)
    → Query pgvector for relevant chunks
    → Fetch top 5 matches
    → Claude API with context:
        "Based on these policy documents, answer: {question}"
    → Return answer with source citations
```

#### Self-Hosted Alternative (Ollama)
If API costs are a concern:
```
Ollama (local LLM, e.g., Llama 3)
    + ChromaDB (local vector store)
    + n8n for orchestration
```
Trade-off: Lower capability but zero API costs.

#### Example Interactions
```
Q: "What's the cancellation policy for same-day appointments?"
A: "Per SOP-2024-03, same-day cancellations within 2 hours of pickup
    are marked as 'late cancel' and the driver receives 50% of the
    base rate. [Source: Cancellation Policy v2.1]"

Q: "How do I handle a client who needs a wheelchair van but we don't have one available?"
A: "Check the backup driver list first. If no wheelchair vans available,
    contact [Partner Transport Co.] at 902-XXX-XXXX. Log the referral
    in the appointment notes. [Source: Accessibility Protocol]"
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Set up pgvector extension in Supabase
- [ ] Create `knowledge_embeddings` table
- [ ] Create `audit_flags` table
- [ ] Create `parsed_intake` table (for email parser drafts)
- [ ] Establish Claude API integration pattern in n8n

### Phase 2: Email Intake Parser (Weeks 3-4)
- [ ] Build n8n workflow for email parsing
- [ ] Create review UI in admin portal
- [ ] Test with real clinic email samples
- [ ] Deploy to production

### Phase 3: Finance Auditor (Weeks 5-6)
- [ ] Build mileage variance check workflow
- [ ] Add duplicate detection
- [ ] Create audit dashboard/report view
- [ ] Schedule weekly automated runs

### Phase 4: No-Show Predictor (Weeks 7-8)
- [ ] Integrate Environment Canada API
- [ ] Calculate historical no-show rates per client
- [ ] Build prediction workflow
- [ ] Create morning alert system

### Phase 5: Knowledge Assistant (Weeks 9-12)
- [ ] Populate initial knowledge base (SOPs, policies)
- [ ] Build RAG pipeline
- [ ] Create chat interface
- [ ] (Optional) Notion integration

### Phase 6: Scheduling Assistant (Weeks 13-16)
- [ ] Integrate with new Schedule page
- [ ] Build driver suggestion algorithm
- [ ] Add natural language query support
- [ ] Implement conflict detection

---

## Database Schema Additions

```sql
-- Knowledge base for RAG
CREATE TABLE knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,           -- 'notion', 'markdown', 'config'
    source_id TEXT,                 -- external ID if applicable
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),         -- Claude embedding dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Audit flags for finance auditor
CREATE TABLE audit_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_date DATE NOT NULL,
    flag_type TEXT NOT NULL,        -- 'MILEAGE_VARIANCE', 'DUPLICATE', etc.
    severity TEXT NOT NULL,         -- 'error', 'warning', 'info'
    appointment_id INTEGER REFERENCES appointments(id),
    driver_id INTEGER REFERENCES drivers(id),
    details JSONB NOT NULL,
    status TEXT DEFAULT 'open',     -- 'open', 'resolved', 'dismissed'
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Parsed intake records (email parser drafts)
CREATE TABLE parsed_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,           -- 'email', 'manual'
    source_reference TEXT,          -- email ID or description
    raw_content TEXT NOT NULL,
    parsed_data JSONB NOT NULL,
    status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    appointments_created INTEGER[], -- IDs of created appointments
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Client risk scores (no-show predictor)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS
    no_show_stats JSONB DEFAULT '{"total_appointments": 0, "no_shows": 0, "late_cancels": 0}';
```

---

## Cost Estimates

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Claude API (Haiku) | $20-50 | Email parsing, Q&A, suggestions |
| Claude API (Sonnet) | $50-100 | Complex reasoning tasks |
| Environment Canada API | Free | Weather data |
| Supabase (current plan) | Included | pgvector, additional tables |
| n8n (self-hosted) | $0 | Already deployed |

**Estimated total: $70-150/month** for moderate usage.

---

## Success Metrics

| Agent | Metric | Target |
|-------|--------|--------|
| Email Parser | Time saved per batch | 15+ min |
| Email Parser | Parse accuracy | >90% |
| No-Show Predictor | High-risk prediction accuracy | >70% |
| Finance Auditor | Anomalies caught before payroll | 100% |
| Knowledge Assistant | Questions answered without escalation | >80% |
| Scheduling Assistant | Driver suggestion acceptance rate | >60% |

---

## Open Questions

1. **Notion vs self-hosted knowledge base**: Timeline for Notion integration? Or start with markdown files in repo?
2. **Email monitoring**: Direct inbox access or forward-to-webhook pattern?
3. **Alert channels**: Slack, email, in-app notifications, or all three?
4. **Agent interaction model**: Always suggest + confirm, or allow some autonomous actions?

---

## References

- [Lumberjack AI Automation Guide](https://lumberjack.so/ai-automation-for-beginners-start-here/)
- [n8n AI Data Analyst Template](https://n8n.io/workflows/3050-build-your-first-ai-data-analyst-chatbot/)
- [Alfred Agentic Infrastructure](https://github.com/ssdavidai/alfred)
- [Supabase pgvector Guide](https://supabase.com/docs/guides/ai/vector-columns)
