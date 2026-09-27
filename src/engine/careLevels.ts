import type { CareLevel, RedFlagAction, SpecialtyId } from "./types";

export const CARE_LEVEL_LABEL: Record<CareLevel, string> = {
  emergency_911: "CALL 911",
  crisis: "CRISIS SUPPORT NOW",
  emergency_department: "EMERGENCY DEPARTMENT",
  urgent_care: "URGENT CARE",
  telehealth: "TELEHEALTH VISIT",
  mental_health: "MENTAL HEALTH CARE",
  primary_care: "PRIMARY CARE",
  self_care: "SELF-CARE AT HOME",
};

/** Care levels where the physician finder is shown with the triage result. */
export function needsProvider(level: CareLevel): boolean {
  return level !== "emergency_911" && level !== "crisis";
}

export const SPECIALTIES: { id: SpecialtyId; label: string }[] = [
  { id: "urgent_care", label: "Urgent Care" },
  { id: "primary_care", label: "Primary Care" },
  { id: "pediatrics", label: "Pediatrics" },
  { id: "telehealth", label: "Telehealth (urgent care, ENT, primary care)" },
  { id: "mental_health", label: "Mental Health" },
  { id: "orthopedics", label: "Orthopedics" },
  { id: "physical_therapy", label: "Physical Therapy" },
  { id: "ent", label: "Ear, Nose & Throat (ENT)" },
  { id: "sleep_medicine", label: "Sleep Medicine" },
  { id: "urology", label: "Urology" },
  { id: "ob_gyn", label: "Obstetrics & Gynecology" },
  { id: "emergency_department", label: "Hospital / Emergency Department" },
];

export function specialtyLabel(id: SpecialtyId): string {
  return SPECIALTIES.find((s) => s.id === id)?.label ?? id;
}

export function specialtyForLevel(level: CareLevel): SpecialtyId {
  switch (level) {
    case "urgent_care":
      return "urgent_care";
    case "mental_health":
      return "mental_health";
    case "telehealth":
      return "telehealth";
    case "emergency_department":
    case "emergency_911":
      return "emergency_department";
    default:
      return "primary_care";
  }
}

export interface StopMessage {
  heading: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  emergency: boolean;
}

export const ED_MAP_URL = "https://www.google.com/maps/search/?api=1&query=emergency+room+near+me";
export const URGENT_CARE_MAP_URL = "https://www.google.com/maps/search/?api=1&query=urgent+care+near+me";

export function stopMessage(action: RedFlagAction): StopMessage {
  switch (action) {
    case "call_911":
      return {
        heading: "SEEK EMERGENCY CARE",
        body: "Call 911 or go to the nearest emergency room now. Do not drive yourself.",
        primary: { label: "Call 911", href: "tel:911" },
        secondary: { label: "Find nearest ED", href: ED_MAP_URL },
        emergency: true,
      };
    case "go_to_ed":
      return {
        heading: "SEEK EMERGENCY CARE",
        body: "Go to the nearest emergency room now. Call 911 if you cannot get there safely or symptoms get worse.",
        primary: { label: "Call 911", href: "tel:911" },
        secondary: { label: "Find nearest ED", href: ED_MAP_URL },
        emergency: true,
      };
    case "crisis_988":
      return {
        heading: "GET CRISIS SUPPORT NOW",
        body: "Call or text 988 (Suicide & Crisis Lifeline) now. It is free and open 24 hours. If you are in immediate danger or have already hurt yourself, call 911.",
        primary: { label: "Call 988", href: "tel:988" },
        secondary: { label: "Call 911", href: "tel:911" },
        emergency: true,
      };
    case "urgent_care_today":
      return {
        heading: "GO TO URGENT CARE TODAY",
        body: "This symptom needs an in-person exam today. Go to an urgent care clinic within the next few hours. If it gets worse, go to the emergency room or call 911.",
        primary: { label: "Find urgent care", href: URGENT_CARE_MAP_URL },
        secondary: { label: "Call 911", href: "tel:911" },
        emergency: false,
      };
  }
}
