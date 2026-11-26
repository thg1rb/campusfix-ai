# KU Spot — Business Rules Specification (Requirement Freeze 1)

> **Source of Truth:** Derived from **Requirement Freeze 1 (V4)** and mirrored across [docs/brd.md](brd.md) and [docs/use-cases.md](use-cases.md). Every validation, authorization guard, API contract, and test case must reference these canonical `BR-*` rule IDs.

---

## 1. Rule ID Convention

```text
BR-<DOMAIN>-<NUMBER>
```

---

## 2. Core Domain Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-GEN-001` | KU Spot focuses on physical issues, infrastructure, spaces, assets, and shared services inside the university. |
| `BR-GEN-002` | Personal complaints, disciplinary matters, harassment, and interpersonal conflicts are out of scope. |
| `BR-GEN-003` | MVP supports Kasetsart University, Bangkhen Campus only. |
| `BR-GEN-004` | `Report` and `Ticket` are distinct entities with separate lifecycles. |
| `BR-GEN-005` | One `CONFIRMED` Report references **exactly one** Ticket. |
| `BR-GEN-006` | One Ticket must contain **at least one** `CONFIRMED` Report. |
| `BR-GEN-007` | AI operates strictly as Decision Support; humans hold final decision authority. |
| `BR-GEN-008` | AI failure must never cause Report submission to fail. |

---

## 3. User, Role & Separation of Duties

| Rule ID | Business Rule |
| --- | --- |
| `BR-ROLE-001` | A single non-admin user account may hold multiple roles simultaneously. |
| `BR-ROLE-002` | `ADMINISTRATOR` is an **exclusive role** and cannot be combined with any other role on the same account. |
| `BR-ROLE-003` | A user may belong to **at most one** Department (applicable to `DEPARTMENT_STAFF` only). |
| `BR-ROLE-004` | A user who is a Reporter of a Report or Ticket must **never** use the `REVIEWER` role to act on that Report or Ticket. |
| `BR-ROLE-005` | A user who is a Reporter of a Report or Ticket must **never** use the `DEPARTMENT_STAFF` role to perform operational actions on that Ticket. |
| `BR-ROLE-006` | Operational actions on a Reporter's own Report/Ticket must be executed by a different user with the required role. |
| `BR-ROLE-007` | `ADMINISTRATOR` does not perform operational actions on Tickets or Reports. |

---

## 4. Authentication & Public Identity

| Rule ID | Business Rule |
| --- | --- |
| `BR-AUTH-001` | MVP uses **Google OAuth 2.0 (`@ku.th`)** as the initial Authentication Provider (`hosted_domain == "ku.th"`). |
| `BR-AUTH-002` | All write and interactive actions require authentication. |
| `BR-AUTH-003` | Public Feed, Ticket Detail, Public Report Detail, Campus Map, Public Activity Timeline, and Public Profile are readable without login. |
| `BR-AUTH-004` | The authentication boundary must be pluggable so additional providers (e.g., KU-ALL SSO) can be added in the future without changing domain logic. |
| `BR-AUTH-005` | Every user must have a `Username` as their public identity. |
| `BR-AUTH-006` | `Username` must be unique across the system. |
| `BR-AUTH-007` | Users can change their `Username`. |
| `BR-AUTH-008` | Historical public Reports must display the Reporter's **current** `Username`. |
| `BR-AUTH-009` | Public Profile displays the user's `Username` and public (`CONFIRMED`) Report history. |
| `BR-AUTH-010` | Real name, email, student ID, and academic department must never be exposed publicly unless strictly required (and never on public endpoints). |

---

## 5. Report Lifecycle Rules

Canonical states: `DRAFT`, `PENDING_REVIEW`, `CONFIRMED`, `REJECTED`, `CANCELLED`.

| Rule ID | Business Rule |
| --- | --- |
| `BR-RLC-001` | `DRAFT` is a persistent state; Reporters can resume, edit, and submit it later. |
| `BR-RLC-002` | Submitting a `DRAFT` (or new report form) transitions the Report to `PENDING_REVIEW`. |
| `BR-RLC-003` | `PENDING_REVIEW` can transition only to `CONFIRMED`, `REJECTED`, or `CANCELLED`. |
| `BR-RLC-004` | `CONFIRMED` is a Final State of a Report. |
| `BR-RLC-005` | `REJECTED` is a Final State of a Report. |
| `BR-RLC-006` | `CANCELLED` is a Final Workflow State of a Report. |
| `BR-RLC-007` | Once `CONFIRMED`, a Report's status does not change as its parent Ticket status changes. |
| `BR-RLC-008` | A `REJECTED` Report is never linked to a Ticket and is never public. |
| `BR-RLC-009` | `CANCELLED` replaces immediate hard deletion of `PENDING_REVIEW` Reports to preserve an audit trail. |
| `BR-RLC-010` | Reporters cannot edit or cancel a Report once it is `CONFIRMED` or `REJECTED`. |

---

## 6. Report Creation & Edit Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-RPT-001` | A submitted Report must have a non-empty `description`. |
| `BR-RPT-002` | A submitted Report must have a Location with mandatory Map Point (`lat`, `lng`). |
| `BR-RPT-003` | A submitted Report must attach at least **1** and at most **5** images. |
| `BR-RPT-004` | Each uploaded image must be `≤ 10 MB`. |
| `BR-RPT-005` | Only `.png`, `.jpg`, and `.jpeg` image formats are accepted (and EXIF metadata must be stripped prior to storage/serving). |
| `BR-RPT-006` | Reporters do not specify Category, Severity, or Department when creating a Report. |
| `BR-RPT-007` | AI must generate a concise Report Title from the Report's Description. |
| `BR-RPT-008` | Reporters may edit a `PENDING_REVIEW` Report until a Reviewer confirms or rejects it. |
| `BR-RPT-009` | Every saved edit to a `PENDING_REVIEW` Report must trigger a fresh AI analysis run. |
| `BR-RPT-010` | Previous AI analysis results must be marked `outdated` whenever a `PENDING_REVIEW` Report is edited. |
| `BR-RPT-011` | Reviewers may confirm or reject **only against the latest Report version**. |
| `BR-RPT-012` | If a Report changes after a Reviewer opens it, the system must reject stale decisions and force the Reviewer to reload and review the latest version. |
| `BR-RPT-013` | Reporters may cancel a `PENDING_REVIEW` Report before Reviewer confirmation/rejection. |
| `BR-RPT-014` | Reporters may initiate a new Report from an Active Ticket's detail page ("Report this issue too"). |
| `BR-RPT-015` | A Reporter-selected Target Ticket is an advisory hint only — never the final matching decision. |

---

## 7. Report Retention Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-RET-001` | `DRAFT` Reports remaining in `DRAFT` for **30 days from `created_at`** must be purged/deleted. |
| `BR-RET-002` | `CANCELLED` Reports must be purged/deleted **30 days after `cancelled_at`**. |
| `BR-RET-003` | `DRAFT`/`CANCELLED` retention prevents unbounded storage growth from non-operational records. |
| `BR-RET-004` | `CONFIRMED` and `REJECTED` Reports are not subject to the 30-day purge rule under Freeze 1. |

---

## 8. Reviewer & Rejection Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-REV-001` | Reviewers act as the central authority for final Report triage. |
| `BR-REV-002` | Reviewers may override AI Category, Severity, Responsible Departments, Title/Summary, and Ticket Matching. |
| `BR-REV-003` | Reviewers may choose a different Existing Active Ticket instead of the AI-suggested candidate. |
| `BR-REV-004` | Reviewers may attach a Report to an Existing Active Ticket instead of confirming an AI-generated Ticket Candidate. |
| `BR-REV-005` | Reviewers may override the Reporter's requested Target Ticket (from `UC-RPT-005`). |
| `BR-REV-006` | Reviewers may reject a `PENDING_REVIEW` Report. |
| `BR-REV-007` | Rejecting a Report requires a non-empty `rejection_reason`. |
| `BR-REV-008` | Sensitive information (e.g., PII, personal attack, policy violation) is a valid reason to reject a Report. |
| `BR-REV-009` | Reviewers must never review, confirm, or reject a Report they submitted themselves. |
| `BR-REV-010` | AI failure must never prevent Reviewers from reviewing, categorizing, matching, confirming, or rejecting Reports manually. |

---

## 9. Active Ticket & Final Ticket Rules

* **Active Ticket States:** `CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`
* **Final Ticket State:** `RESOLVED` *(sole Final Ticket state; `CANNOT_RESOLVE` is retired)*

| Rule ID | Business Rule |
| --- | --- |
| `BR-TKT-001` | Only **Active Tickets** can accept additional linked Reports. |
| `BR-TKT-002` | Only **Active Tickets** are eligible as AI Duplicate Matching candidates. |
| `BR-TKT-003` | Only **Active Tickets** can accept `Mark Affected` toggles. |
| `BR-TKT-004` | Only **Active Tickets** can have their Responsible Departments modified. |
| `BR-TKT-005` | Final Tickets cannot accept additional Reports. |
| `BR-TKT-006` | Final Tickets cannot be reopened. |
| `BR-TKT-007` | Final Tickets cannot have Responsible Departments modified. |
| `BR-TKT-008` | Every newly confirmed operational Ticket starts in `CONFIRMED`. |
| `BR-TKT-009` | A `Ticket Candidate` (created on AI `NO_MATCH`) is never public and has no operational status until Reviewer confirms. |
| `BR-TKT-010` | A Ticket may be assigned to **multiple** Responsible Departments (`≥ 1`). |
| `BR-TKT-011` | Tickets have **no Primary Department**; all assigned departments share responsibility equally. |
| `BR-TKT-012` | Tickets have **no Individual Staff Assignment**; any eligible staff member in an assigned department may act. |
| `BR-TKT-013` | Every confirmed operational Ticket is public. |

---

## 10. AI Matching & Analysis Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-AI-001` | AI uses **Images + Description + Location** as primary inputs for duplicate matching. |
| `BR-AI-002` | AI duplicate matching compares exclusively against **Active Tickets**. |
| `BR-AI-003` | AI may use Category, timestamp proximity, and existing linked Reports as auxiliary signals. |
| `BR-AI-004` | `MATCHED` → recommend Existing Active Ticket(s) with similarity percentage. |
| `BR-AI-005` | `NO_MATCH` → prepare an unpublished `Ticket Candidate` / draft Ticket. |
| `BR-AI-006` | Every `Ticket Candidate` must pass Reviewer verification before becoming an operational Ticket. |
| `BR-AI-007` | AI must recommend a Problem Category (and optional alternative category). |
| `BR-AI-008` | AI must report Category confidence as a percentage (`0–100%`). |
| `BR-AI-009` | AI must assess Report Severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`). |
| `BR-AI-010` | AI may recommend multiple Responsible Departments. |
| `BR-AI-011` | AI must generate a concise Report Title. |
| `BR-AI-012` | AI must generate a Ticket Title and Ticket Summary. |
| `BR-AI-013` | Increasing Report count must **never** automatically increase Ticket Severity. |
| `BR-AI-014` | Adding or correcting a Confirmed Report on a Ticket triggers AI Ticket Re-evaluation (`UC-AI-003`). |
| `BR-AI-015` | Ticket Re-evaluation output is strictly a recommendation; Reviewers must approve any change to final Ticket data. |
| `BR-AI-016` | AI must never confirm or reject a Report. |
| `BR-AI-017` | AI must never create a final operational Ticket autonomously. |
| `BR-AI-018` | AI must never resolve a Ticket autonomously. |
| `BR-AI-019` | AI must never delete a Report or hide a Report/Ticket from Reviewers. |
| `BR-AI-020` | On AI failure, the Report remains `PENDING_REVIEW` and Reviewers can complete triage manually. |

---

## 11. Ticket Status Transition Rules

Canonical states: `CONFIRMED`, `IN_PROGRESS`, `WAITING_INFORMATION`, `RESOLVED`. *(Every Ticket always terminates at `RESOLVED`; `CANNOT_RESOLVE` is retired.)*

| Rule ID | Transition / Rule |
| --- | --- |
| `BR-STA-001` | `CONFIRMED → IN_PROGRESS` by Responsible Department Staff. |
| `BR-STA-002` | `CONFIRMED → WAITING_INFORMATION` by Reviewer or Responsible Department Staff. |
| `BR-STA-004` | `IN_PROGRESS → WAITING_INFORMATION` by Reviewer or Responsible Department Staff. |
| `BR-STA-005` | `IN_PROGRESS → RESOLVED` by **System** automatically when all Responsible Departments complete. |
| `BR-STA-006` | `WAITING_INFORMATION → IN_PROGRESS` by Responsible Department Staff. |
| `BR-STA-009` | `RESOLVED` is the sole Final State of a Ticket (immutable; no reopen). |
| `BR-STA-011` | Every Ticket status transition must record Actor, Role/Department, and Timestamp. |

*(Retired Freeze 1 IDs: `BR-STA-003`, `BR-STA-007`, `BR-STA-008`, `BR-STA-010`, and `BR-DEP-008` applied to the removed `CANNOT_RESOLVE` state and are no longer in effect.)*

---

## 12. Multi-Department Completion Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-DEP-001` | Department completion is tracked independently per Responsible Department. |
| `BR-DEP-002` | All assigned Responsible Departments must complete before the Ticket auto-resolves. |
| `BR-DEP-003` | Once every Responsible Department completes, the Ticket transitions to `RESOLVED` immediately without waiting for Reviewer confirmation. |
| `BR-DEP-004` | Reviewers may add a new Department only while the Ticket is Active (before Final). |
| `BR-DEP-005` | When Departments are edited, any already-completed Department that remains assigned preserves its completed state. |
| `BR-DEP-006` | Adding a new Department before the Ticket is Final requires that new Department to complete before auto-resolution. |
| `BR-DEP-007` | Removing an incomplete Department so that all remaining assigned Departments are complete immediately triggers Auto-`RESOLVED`. |
| `BR-DEP-009` | Department Staff who are a Reporter of the Ticket must never perform operational actions on that Ticket. |

---

## 13. Additional Information Thread Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-THR-001` | The Additional Information Thread is **never public**. |
| `BR-THR-002` | Involved Reviewers can read and post in the Thread (subject to Separation of Duties when requesting info). |
| `BR-THR-003` | Responsible Department Staff can read and post in the Thread (subject to Separation of Duties). |
| `BR-THR-004` | Every Reporter who has a `CONFIRMED` Report linked to the Ticket can read and post in the Thread. |
| `BR-THR-005` | Unrelated users and public visitors cannot read or post in the Thread. |
| `BR-THR-006` | There is no General Public Comment discussion feature in MVP. |

---

## 14. Public Feed, Report Detail & Pagination Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-PUB-001` | Public Feed is readable without login. |
| `BR-PUB-002` | Default Public Feed displays **Active Tickets**. |
| `BR-PUB-003` | Default sort order is `confirmed_at DESC`. |
| `BR-PUB-004` | Search covers: Ticket ID, Title, Description, Location, Category, and Department. |
| `BR-PUB-005` | Filters cover: Status, Severity, Category, Department, Date range, and Location. |
| `BR-PUB-006` | Supported page sizes are `25`, `50`, and `100`. |
| `BR-PUB-007` | Desktop grid displays **5 Ticket Cards per row**. |
| `BR-PUB-008` | Public Ticket Detail shows each linked Report as a Thumbnail + AI-generated Report Title. |
| `BR-PUB-009` | Public Report Detail shows Reporter current Username, Description, Images, and Location. |
| `BR-PUB-010` | Additional Information Thread is excluded from all Public Read endpoints and views. |

---

## 15. Affected User Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-AFF-001` | `Mark Affected` is allowed only on Active Tickets. |
| `BR-AFF-002` | Users must be authenticated to mark/unmark affected. |
| `BR-AFF-003` | Each user can mark affected at most once per Ticket. |
| `BR-AFF-004` | Users can unmark affected while the Ticket remains Active. |
| `BR-AFF-005` | Final Tickets preserve and display the historical Affected Count but reject new marks/unmarks. |
| `BR-AFF-006` | Affected-only users do not receive Major Event Emails unless they are also a Reporter of the Ticket. |
| `BR-AFF-007` | `Affected User Count` is tracked and displayed separately from Report/Reporter Count. |

---

## 16. Feedback Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-FBK-001` | Feedback is allowed **only** when Ticket status is `RESOLVED`. |
| `BR-FBK-002` | Only Reporters who have a `CONFIRMED` Report in the Ticket may submit/edit Feedback. |
| `BR-FBK-003` | One Feedback Set per Reporter per Ticket. |
| `BR-FBK-004` | Reporters may edit their submitted Feedback later. |
| `BR-FBK-005` | Feedback uses multi-dimensional ratings. |
| `BR-FBK-006` | Each dimension accepts integer ratings from `1` to `5` stars. |
| `BR-FBK-007` | System computes the average rating per dimension across participating Reporters. |
| `BR-FBK-008` | System computes an aggregate overall average rating for the Ticket. |
| `BR-FBK-009` | Final rating dimension names are an open Freeze 1 detail (current prototype uses `speed`, `quality`, `communication`, `overall`). |

---

## 17. Notification Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-NOT-001` | MVP delivers notifications via Email. |
| `BR-NOT-002` | Emails are sent only for Major Events. |
| `BR-NOT-003` | Major Events include: `CONFIRMED_NEW_TICKET`, `CONFIRMED_EXISTING_TICKET`, `WAITING_INFORMATION`, and `RESOLVED`. |
| `BR-NOT-004` | Email recipients are strictly the Reporters of the Ticket. |
| `BR-NOT-005` | Affected-only users do not receive Major Event Emails. |

---

## 18. Activity & Audit Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-AUD-001` | Every Ticket maintains a Public Activity Timeline. |
| `BR-AUD-002` | Additional Information Thread must remain strictly separate from Public Activity Timeline. |
| `BR-AUD-003` | Audit every Report save, submit, edit, cancel, confirm, reject, and correction. |
| `BR-AUD-004` | Audit every AI recommendation run (including version and outdated/failure status). |
| `BR-AUD-005` | Audit every Reviewer final decision and override. |
| `BR-AUD-006` | Audit every Ticket status transition and Responsible Department change. |
| `BR-AUD-007` | Audit every Department completion confirmation. |
| `BR-AUD-008` | Every audit entry must record Actor, Role/Department, and Timestamp. |
| `BR-AUD-009` | Audit records must be sufficient to prove Separation of Duties compliance. |

---

## 19. Analytics Rules

| Rule ID | Business Rule |
| --- | --- |
| `BR-ANL-001` | Ticket, Report, and Affected User metrics must be calculated and presented distinctly. |
| `BR-ANL-002` | `Review Time = Reviewer Final Decision Time - Report Submitted Time`. |
| `BR-ANL-003` | `Resolution Time = Ticket RESOLVED Time - Ticket Confirmed Time`. |
| `BR-ANL-004` | `Total Lead Time = Ticket RESOLVED Time - First Confirmed Report Submitted Time`. |
| `BR-ANL-005` | `Ticket Aging = Current Time - Ticket Confirmed Time` (Active Tickets only). |
| `BR-ANL-006` | MVP has no SLA enforcement or breach timers. |
| `BR-ANL-007` | `DEPARTMENT_STAFF` can view analytics scoped to their own Department. |
| `BR-ANL-008` | `ADMINISTRATOR` can view system-wide analytics and per-Department performance. |

---

## 20. Quick Reference Matrices (For AI Agents)

### 20.1 Role × Action Authorization Matrix

| Action | Public | Reporter | Reviewer | Dept Staff | Admin | Extra Guard |
| --- | :---: | :---: | :---: | :---: | :---: | --- |
| Read Public Feed / Map / Ticket / Confirmed Report / Public Profile | Yes | Yes | Yes | Yes | Yes | Public DTO only (`BR-AUTH-010`) |
| Set / Change own Username | No | Yes | Yes | Yes | Yes | Unique check (`BR-AUTH-006`) |
| Save/Edit/Submit/Cancel own Draft or Pending Report | No | Yes | — | — | No | Owner only; before Confirm/Reject |
| Review / Confirm / Reject Pending Report | No | No | Yes | No | No | **Not Reporter of Report** (`BR-ROLE-004`) + latest `version` |
| Correct Confirmed Report / Review Ticket AI Re-evaluation | No | No | Yes | No | No | **Not Reporter of Report/Ticket** |
| Add / Remove Responsible Departments on Active Ticket | No | No | Yes | No | No | Active Ticket + **Not Reporter of Ticket** |
| Start Work / Resume Work / Record Action / Confirm Dept Completion | No | No | No | Yes | No | Assigned Dept + **Not Reporter of Ticket** (`BR-ROLE-005`) |
| Request Additional Info (`WAITING_INFORMATION`) | No | No | Yes | Yes | No | Active Ticket + Assigned Dept (if Staff) + **Not Reporter** |
| Read / Post in Additional Information Thread | No | Own Ticket | Yes | Assigned Dept | No | Reporter must have Confirmed Report in Ticket (`BR-THR-004`) |
| Mark / Unmark Affected | No | Yes | Yes* | Yes* | No | Active Ticket only; Admin excluded (`BR-ROLE-007`) |
| Submit / Edit Feedback | No | Own Ticket | — | — | No | `RESOLVED` Ticket + Reporter with Confirmed Report (`BR-FBK-001`..`002`) |
| View Department Analytics | No | No | No | Own Dept | Yes | Scoped to user's single Department |
| Manage Users, Roles, Categories, Departments, Locations, System Analytics | No | No | No | No | Yes | Exclusive Admin role (`BR-ROLE-002`) |

*\*Multi-role users acting in their authenticated campus user capacity (non-Admin) may toggle Mark Affected on Active Tickets.*

### 20.2 Field Visibility Matrix

| Data / Field | Public Read | Authenticated Owner | Reviewer | Assigned Dept Staff | Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| `user.username` | Yes | Yes | Yes | Yes | Yes |
| `user.real_name`, `email`, `provider_subject_id`, `avatar_url` | **NEVER** | Own only | **NEVER** | **NEVER** | Admin user mgmt only |
| `DRAFT` / `CANCELLED` Report | **NEVER** | Own only | **NEVER** | **NEVER** | Audit metadata only |
| `PENDING_REVIEW` / `REJECTED` Report | **NEVER** | Own only | Yes | **NEVER** | Audit metadata only |
| `CONFIRMED` Report (description, EXIF-stripped images, location, username) | Yes | Yes | Yes | Yes | Yes |
| `Ticket Candidate` (unpublished) | **NEVER** | **NEVER** | Yes | **NEVER** | **NEVER** |
| Confirmed `Ticket` + Public Activity Timeline | Yes | Yes | Yes | Yes | Yes |
| `Additional Information Thread` messages | **NEVER** | Confirmed Reporters on Ticket | Yes | Yes | **NEVER** |

---

## 21. Open Specification Points (Tracked from Freeze 1)

These six points remain open for final sign-off before production launch (see [docs/status.md](status.md)):

1. Exact list and naming of Feedback Rating Dimensions (`BR-FBK-009`; prototype currently uses `speed`, `quality`, `communication`, `overall`).
2. Email retry and delivery failure policy.
3. Exact presentation of Public Aggregate Feedback on Ticket Detail.
4. Long-term retention policy for `REJECTED` Reports.
5. Media file deletion mechanics when `DRAFT`/`CANCELLED` Reports are purged at 30 days.
6. Responsive card grid column counts for tablet and mobile breakpoints (desktop is fixed at 5 cards/row per `BR-PUB-007`).
