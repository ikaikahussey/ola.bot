// Loads the static rule files. Adding a rule: create rules/algorithms/<id>.json,
// import it here, and add keywords to rules/complaint_map.json.

import acute_angle_closure_glaucoma from "../rules/algorithms/acute_angle_closure_glaucoma.json";
import ami_redflags from "../rules/algorithms/ami_redflags.json";
import appendicitis_redflags from "../rules/algorithms/appendicitis_redflags.json";
import audit_c from "../rules/algorithms/audit_c.json";
import canadian_cspine from "../rules/algorithms/canadian_cspine.json";
import canadian_ct_head from "../rules/algorithms/canadian_ct_head.json";
import centor_sore_throat from "../rules/algorithms/centor_sore_throat.json";
import crb65_cough from "../rules/algorithms/crb65_cough.json";
import gad7 from "../rules/algorithms/gad7.json";
import herpes_zoster_confirmation from "../rules/algorithms/herpes_zoster_confirmation.json";
import id_migraine from "../rules/algorithms/id_migraine.json";
import idsa_sinusitis from "../rules/algorithms/idsa_sinusitis.json";
import ipss from "../rules/algorithms/ipss.json";
import ottawa_ankle from "../rules/algorithms/ottawa_ankle.json";
import ottawa_knee from "../rules/algorithms/ottawa_knee.json";
import pc_ptsd5 from "../rules/algorithms/pc_ptsd5.json";
import phq9 from "../rules/algorithms/phq9.json";
import start_back from "../rules/algorithms/start_back.json";
import stop_bang from "../rules/algorithms/stop_bang.json";
import uti_bent from "../rules/algorithms/uti_bent.json";
import wells_dvt from "../rules/algorithms/wells_dvt.json";
import complaintMap from "../rules/complaint_map.json";
import redFlags from "../rules/red_flags.json";
import type { ComplaintMap, GlobalRedFlag, Rule } from "./engine/types";

export const RULES: Rule[] = [
  centor_sore_throat, ottawa_ankle, ottawa_knee, canadian_cspine, canadian_ct_head, crb65_cough,
  idsa_sinusitis, uti_bent, ipss, wells_dvt, start_back, id_migraine, phq9, gad7, pc_ptsd5,
  audit_c, stop_bang,
  herpes_zoster_confirmation, acute_angle_closure_glaucoma, appendicitis_redflags,
  ami_redflags,
] as unknown as Rule[];

export const RULES_BY_ID: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.rule_id, r]));

export const COMPLAINT_MAP = complaintMap as ComplaintMap;

export const GLOBAL_RED_FLAGS = redFlags.red_flags as GlobalRedFlag[];
export const RED_FLAGS_VERSION = { version: redFlags.version, last_updated: redFlags.last_updated };
