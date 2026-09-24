export type ActorRole = "admin" | "porter" | "resident";

export type Actor = {
  displayName: string;
  role: ActorRole;
};

export type BootstrapData = {
  actor: Actor;
  condominium: {
    id: number;
    name: string;
    slug: string;
    timezone: string;
    photoRetentionDays: number;
  };
  memberships: {
    condominiumId: number;
    condominiumName: string;
    role: ActorRole;
  }[];
  stats: {
    residents: number;
    waiting: number;
    receivedToday: number;
    notificationFailures: number;
  };
  whatsappConfigured: boolean;
  whatsappProvider: "cloud_api" | "baileys" | "disabled";
};

export type Resident = {
  id: number;
  unit: string;
  block: string;
  apartment: string;
  name: string;
  phone: string;
  email: string;
  authorizedPeople: string;
  notes: string;
  whatsappOptInAt: string | null;
  active: boolean;
};

export type PackageRecord = {
  id: number;
  residentId: number;
  residentName: string;
  unit: string;
  description: string;
  trackingCode: string;
  status: "waiting" | "withdrawn";
  notificationStatus:
    | "pending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "not_configured"
    | "consent_required";
  notificationError: string;
  registeredBy: string;
  withdrawnBy: string;
  failedPickupAttempts: number;
  receivedAt: string;
  notifiedAt: string | null;
  withdrawnAt: string | null;
  pickupCode?: string;
  photoUrl: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AuditRecord = {
  id: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string;
  createdAt: string;
};

export type AccessProfile = {
  id: number;
  condominiumId: number;
  residentId: number | null;
  email: string;
  displayName: string;
  role: ActorRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
