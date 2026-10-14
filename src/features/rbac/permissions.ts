import type { AppRole } from "@/features/auth/use-auth";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  warehouse: "Magacioner",
  event_manager: "Menadžer događaja",
  technician: "Serviser",
  accounting: "Knjigovodstvo",
  director: "Direktor",
  checkout_operator: "Izdavalac opreme",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Pun pristup sistemu",
  warehouse: "Upravljanje opremom, lokacijama i popisima",
  event_manager: "Planiranje događaja i izdavanje opreme",
  technician: "Servis i prijem oštećene opreme",
  accounting: "Pregled finansija i izveštaja",
  director: "Pun pregled i upravljanje",
  checkout_operator: "Samo izdavanje i prijem opreme — bez dodavanja/brisanja",
};

export const PERMISSIONS = {
  manage_assets: "Upravljanje opremom (dodavanje, brisanje, editovanje)",
  manage_events: "Upravljanje događajima (dodavanje, brisanje, editovanje)",
  checkout: "Izdavanje i vraćanje opreme",
  service: "Upravljanje servisom",
  inventory: "Popis opreme",
  view_finance: "Pregled finansija",
  admin: "Administracija sistema (korisnici, backup)",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, PermissionKey[]> = {
  admin: ["manage_assets", "manage_events", "checkout", "service", "inventory", "view_finance", "admin"],
  director: ["manage_assets", "manage_events", "checkout", "service", "inventory", "view_finance"],
  warehouse: ["manage_assets", "checkout", "service", "inventory"],
  event_manager: ["manage_events", "checkout"],
  technician: ["service"],
  accounting: ["view_finance"],
  checkout_operator: ["checkout"],
};
