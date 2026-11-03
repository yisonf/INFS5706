/**
 * SYNTHETIC scam-response guidance.
 *
 * Everything in this file is invented for the INFS5706 prototype. It does not
 * reflect any real organisation's policies and must not be used operationally.
 * Each entry has an id so specialist agents can cite exactly which guidance a
 * recommendation rests on.
 */
import type { SpecialistKind } from "../types";

export interface GuidanceItem {
  id: string;
  title: string;
  text: string;
}

export const GUIDANCE: Record<SpecialistKind, GuidanceItem[]> = {
  banking: [
    {
      id: "BK-G1",
      title: "Ongoing transfers",
      text: "If a transfer is pending or the affected person is still in contact with the scammer, recommend the employee advise them to stop further payments immediately and flag the case to the fraud team for a hold request. The AI must not initiate a hold.",
    },
    {
      id: "BK-G2",
      title: "Credential compromise",
      text: "Where banking logins, card details, PINs or one-time codes were disclosed, recommend immediate password/PIN reset through official channels and card re-issue consideration. Note which credentials were disclosed in the handover.",
    },
    {
      id: "BK-G3",
      title: "Recall requests",
      text: "For completed transfers to a domestic account within the last 24 hours, note that a recall request may be possible and should be raised by the employee with the fraud team. Beyond 24 hours, likelihood of recovery drops; still raise it.",
    },
    {
      id: "BK-G4",
      title: "Investment and romance scams",
      text: "These commonly involve repeated transfers over weeks. Ask whether earlier payments were made to the same payee and whether the person has been asked to pay 'fees' to release funds — a second-wave scam indicator.",
    },
    {
      id: "BK-G5",
      title: "Vulnerability",
      text: "If distress, cognitive impairment, language barriers or a large loss relative to the person's circumstances are indicated, recommend referral to a financial-hardship team and to the identity-recovery/victim-support partner.",
    },
  ],
  telecom: [
    {
      id: "TL-G1",
      title: "Scam SMS/calls",
      text: "Record the originating number or sender ID exactly as received. Recommend the employee lodge the number with the telco scam-reporting channel so it can be assessed for blocking. The AI does not block numbers.",
    },
    {
      id: "TL-G2",
      title: "SIM swap / port-out risk",
      text: "If the person reports losing mobile service unexpectedly or receiving unexpected porting messages, treat as a potential SIM-swap. Recommend urgent contact with their carrier to place a port-out lock and to check for account changes.",
    },
    {
      id: "TL-G3",
      title: "Spoofed sender IDs",
      text: "Messages appearing in an existing legitimate thread (e.g. a bank's SMS thread) indicate sender-ID spoofing. Advise the employee to tell the affected person that thread position does not prove authenticity.",
    },
    {
      id: "TL-G4",
      title: "Remote access calls",
      text: "If the caller asked the person to install software or share a screen, recommend the device be disconnected from the internet and checked before any further banking use; refer to the digital-platform/IT partner.",
    },
  ],
  digital_platform: [
    {
      id: "DP-G1",
      title: "Malicious URLs",
      text: "Record URLs exactly. Recommend the employee submit them to the platform/host abuse channel for takedown assessment. Advise the affected person not to revisit the link. The AI does not submit takedowns.",
    },
    {
      id: "DP-G2",
      title: "Compromised accounts",
      text: "If email or social-media credentials were disclosed, recommend password reset, enabling two-factor authentication, reviewing active sessions and recovery details, and warning contacts who may receive messages from the account.",
    },
    {
      id: "DP-G3",
      title: "Impersonation accounts",
      text: "For fake profiles impersonating a person or organisation, recommend reporting the handle through the platform's impersonation process and preserving screenshots as evidence.",
    },
    {
      id: "DP-G4",
      title: "Identity theft indicators",
      text: "If identity documents (licence, passport, Medicare) were disclosed, recommend referral to the identity-recovery partner and a credit-ban/credit-report check through the appropriate agency.",
    },
  ],
};

export const REFERRAL_DIRECTORY = [
  {
    organisationType: "Government scam-reporting service",
    when: "All confirmed or strongly suspected scams, for national reporting and trend data.",
  },
  {
    organisationType: "Identity-recovery / victim-support organisation",
    when: "Identity documents or personal information disclosed; person distressed.",
  },
  {
    organisationType: "Community support organisation",
    when: "Vulnerability indicators present (age, disability, language, isolation, financial hardship).",
  },
  {
    organisationType: "Law enforcement",
    when: "Threats, extortion, or losses the employee's organisation policy requires be reported.",
  },
];

export function guidanceAsText(agent: SpecialistKind): string {
  return GUIDANCE[agent]
    .map((g) => `[${g.id}] ${g.title}: ${g.text}`)
    .join("\n");
}
