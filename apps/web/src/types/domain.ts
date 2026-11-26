export type Role =
  | 'REPORTER'
  | 'REVIEWER'
  | 'DEPARTMENT_STAFF'
  | 'ADMINISTRATOR';

export type ReportStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED';

export type TicketStatus =
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'WAITING_INFORMATION'
  | 'RESOLVED';

export type ActiveTicketStatus =
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'WAITING_INFORMATION';

export type FinalTicketStatus = 'RESOLVED';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AIAnalysisStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export type AIMatchDecision = 'MATCHED' | 'NO_MATCH';

export type FeedbackDimensionKey =
  | 'speed'
  | 'quality'
  | 'communication'
  | 'overall';

export const majorEmailEventTypes = [
  'CONFIRMED_NEW_TICKET',
  'CONFIRMED_EXISTING_TICKET',
  'WAITING_INFORMATION',
  'RESOLVED',
] as const;

export type MajorEmailEventType = typeof majorEmailEventTypes[number];

export type AuthProvider = 'GOOGLE';

export interface User {
  id: string;
  authProvider: AuthProvider;
  readonly providerSubjectId: string; // Private, immutable OIDC sub
  username: string;          // Unique, mutable public identity (BR-AUTH-005..008)
  realName: string;          // Private Google name claim (BR-AUTH-010)
  email: string;             // Private university email for Major Event Emails
  emailVerified: boolean;
  hostedDomain: 'ku.th';
  avatarUrl: string | null;  // Private Google picture claim (BR-AUTH-010)
  roles: Role[];             // If contains ADMINISTRATOR, length MUST be 1 (BR-ROLE-002)
  departmentId: string | null; // Max 1 department (BR-ROLE-003); null unless DEPARTMENT_STAFF
  isActive: boolean;
  createdAt: string;         // ISO 8601
}

export interface Category {
  id: string;
  name: string;              // Thai display name
  description: string;
  isActive: boolean;         // Soft-disable only; historical Tickets keep reading it
}

export interface Department {
  id: string;
  name: string;
  responsibilityScope: string;
  isActive: boolean;
}

export type CampusLocationType =
  | 'BUILDING'
  | 'COMMON_AREA'
  | 'ROAD'
  | 'ACTIVITY_PLAZA'
  | 'SERVICE_POINT'
  | 'LANDMARK';

export interface CampusLocation {
  id: string;
  name: string;
  type: CampusLocationType;
  lat: number;
  lng: number;
  isActive: boolean;
}

export interface ReportImage {
  id: string;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg'; // .png, .jpg, .jpeg only (BR-RPT-005)
  sizeBytes: number;                    // <= 10 * 1024 * 1024 (BR-RPT-004)
  url: string;                          // Local /demo-images/... or uploaded DataURL
  alt: string;
}

export interface ReportLocation {
  locationId: string | null; // Optional link to CampusLocation master
  locationName: string;      // Human-readable name inside KU Bangkhen
  detailNote?: string;       // Optional floor/room/landmark note
  lat: number;               // Mandatory Map Point (BR-RPT-002)
  lng: number;               // Mandatory Map Point (BR-RPT-002)
}

export interface TicketCandidateDraft {
  suggestedTitle: string;
  suggestedSummary: string;
  suggestedCategoryId: string;
  suggestedSeverity: Severity;
  recommendedDepartmentIds: string[];
}

export interface AIAnalysisRun {
  id: string;
  reportId: string;
  reportVersion: number;
  status: AIAnalysisStatus;
  isOutdated: boolean;       // Set true whenever PENDING_REVIEW is edited (BR-RPT-010)
  generatedReportTitle: string | null;
  suggestedCategoryId: string | null;
  categoryConfidence: number | null; // Integer 0..100 (%) (BR-AI-008)
  alternativeCategoryId: string | null;
  suggestedSeverity: Severity | null;
  severityRationale: string | null;
  recommendedDepartmentIds: string[];
  matchDecision: AIMatchDecision | null;
  candidateTicketId: string | null;       // Active Ticket ID if MATCHED
  candidateSimilarity: number | null;     // Integer 0..100 (%)
  similarCandidates?: { ticketId: string; similarity: number }[]; // Ranked scores in 0..100 (%), before rounding
  ticketCandidateDraft: TicketCandidateDraft | null; // Populated if NO_MATCH (BR-AI-005)
  errorMessage: string | null;            // Populated if FAILED (BR-AI-020)
  createdAt: string;
}

export interface Report {
  id: string;                             // Internal primary key
  readonly reportNumber: string | null;   // Assigned on first submission
  reporterId: string;
  status: ReportStatus;
  version: number;                        // Starts at 1, increments on every PENDING_REVIEW edit
  description: string;
  images: ReportImage[];                  // 1..5 required on Submit (BR-RPT-003)
  location: ReportLocation | null;        // Mandatory on Submit (BR-RPT-002)
  aiGeneratedTitle: string | null;        // Latest AI-generated title (or Reviewer override)
  requestedTargetTicketId: string | null; // Set when created via UC-RPT-005 (hint only, BR-RPT-015)
  ticketId: string | null;                // Populated ONLY when status === 'CONFIRMED' (BR-GEN-005)
  rejectionReason: string | null;         // Required when status === 'REJECTED' (BR-REV-007)
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  submittedAt: string | null;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface TicketDepartmentAssignment {
  departmentId: string;
  assignedAt: string;
  assignedBy: string;
  isCompleted: boolean;      // Tracked per department (BR-DEP-001)
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string | null;
}

export interface TicketAIReevaluation {
  id: string;
  ticketId: string;
  triggeredByReportId: string;
  status: AIAnalysisStatus;
  suggestedTitle: string | null;
  suggestedSummary: string | null;
  suggestedSeverity: Severity | null;
  recommendedDepartmentIds: string[];
  rationale: string | null;
  isReviewed: boolean;       // Reviewer must approve before changing Final Ticket Data (BR-AI-015)
  createdAt: string;
}

export interface Ticket {
  id: string;                // Internal primary key
  readonly ticketNumber: string;
  title: string;
  summary: string;
  status: TicketStatus;
  categoryId: string;
  severity: Severity;
  location: ReportLocation;  // Canonical location (from primary/first report, editable by Reviewer)
  departments: TicketDepartmentAssignment[]; // >= 1, NO primary dept, NO staff assignee
  confirmedBy: string;
  confirmedAt: string;       // Used for default Public Feed sort DESC & Aging/Resolution Time
  resolvedAt: string | null;
  resolutionSummary: string | null;
  pendingReevaluation: TicketAIReevaluation | null;
  updatedAt: string;
}

export interface TicketAffected {
  ticketId: string;
  userId: string;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: 'REVIEWER' | 'DEPARTMENT_STAFF' | 'REPORTER';
  authorDepartmentId: string | null;
  body: string;
  createdAt: string;
}

export const publicActivityTypes = [
  'TICKET_CONFIRMED',
  'REPORT_ATTACHED',
  'STATUS_CHANGED',
  'DEPARTMENT_ADDED',
  'DEPARTMENT_REMOVED',
  'DEPARTMENT_ACTION',
  'DEPARTMENT_COMPLETED',
  'AUTO_RESOLVED',
] as const;

export type PublicActivityType = typeof publicActivityTypes[number];

export interface PublicActivityEvent {
  id: string;
  ticketId: string;
  type: PublicActivityType;
  actorId: string | 'SYSTEM';
  actorRole: Role | 'SYSTEM';
  departmentId: string | null;
  oldStatus: TicketStatus | null;
  newStatus: TicketStatus | null;
  summary: string;           // Public-safe Thai description
  evidenceImages: ReportImage[]; // Permitted operational evidence
  createdAt: string;
}

export interface FeedbackSubmission {
  id: string;
  ticketId: string;
  reporterId: string;
  ratings: Record<FeedbackDimensionKey, 1 | 2 | 3 | 4 | 5>;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: 'REPORT' | 'TICKET' | 'AI_RUN' | 'USER' | 'CATEGORY' | 'DEPARTMENT' | 'LOCATION' | 'RETENTION';
  entityId: string;
  action: string;
  actorId: string | 'SYSTEM' | 'AI_SERVICE';
  actorRoles: (Role | 'SYSTEM' | 'AI_SERVICE')[];
  departmentId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface EmailNotificationLog {
  id: string;
  eventType: MajorEmailEventType;
  ticketId: string;
  reportId: string | null;
  recipientUserId: string;
  recipientEmail: string;
  subject: string;
  bodyPreview: string;
  status: 'SENT' | 'FAILED';
  createdAt: string;
}
