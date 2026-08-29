export type ActorRole = "admin" | "porter" | "resident";

export type Actor = {
  id: number;
  condominiumId: number;
  residentId: number | null;
  email: string;
  displayName: string;
  role: ActorRole;
};

export type BootstrapData = {
  actor: Actor;
  condominium: { id: number; name: string };
  stats: {
    residents: number;
    waiting: number;
    receivedToday: number;
    notificationFailures: number;
  };
  whatsappConfigured: boolean;
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
};

export type PackageRecord = {
  id: number;
  residentId: number;
  residentName: string;
  unit: string;
  description: string;
  trackingCode: string;
  status: "waiting" | "withdrawn";
  notificationStatus: "pending" | "sent" | "failed" | "not_configured";
  notificationError: string;
  registeredBy: string;
  withdrawnBy: string;
  receivedAt: string;
  notifiedAt: string | null;
  withdrawnAt: string | null;
  pickupCode?: string;
  photoUrl: string;
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
