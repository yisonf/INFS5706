import type { ScamReport } from "./types";

/** SYNTHETIC cases for demonstration. No real people, numbers or URLs. */
export const SAMPLE_CASES: { label: string; report: ScamReport }[] = [
  {
    label: "Bank impersonation SMS — ongoing, credentials disclosed",
    report: {
      reportingOrganisation: "Example Bank (synthetic)",
      contactMethod: "sms",
      suspectedScamType: "impersonation",
      financialLossReported: true,
      financialLossAmount: 4200,
      informationDisclosed: ["bank login", "one-time code"],
      incidentOngoing: true,
      description:
        "Customer (Ms T, 71) called in very upset. This morning she got an SMS in the same thread as her usual bank messages saying there was a suspicious login and to call 0400 000 000 or visit examplebank-secure.example to verify. She called the number, the man said he was from the fraud team and talked her through logging in on a page he sent, then read back a code she'd received by SMS. She says $4,200 then left her account to a 'safe account'. She says the man is still ringing her now asking for another code. She isn't sure if she gave her card number as well. She lives alone and mentioned she's on a pension.",
    },
  },
  {
    label: "Marketplace phishing link — attempt only",
    report: {
      reportingOrganisation: "Example Telco (synthetic)",
      contactMethod: "email",
      suspectedScamType: "phishing",
      financialLossReported: false,
      informationDisclosed: [],
      incidentOngoing: false,
      description:
        "Customer reports receiving an email from 'parcel-notice@example-courier.example' saying a package was held and to pay a $3 fee at example-courier-redelivery.example. He clicked the link, saw a card form, got suspicious and closed it without entering anything. No loss. Wants to know what to do.",
    },
  },
  {
    label: "Investment scam — repeated transfers, pressure for 'release fee'",
    report: {
      reportingOrganisation: "Example Credit Union (synthetic)",
      contactMethod: "social_media",
      suspectedScamType: "investment",
      financialLossReported: true,
      financialLossAmount: 18500,
      informationDisclosed: ["driver licence photo"],
      incidentOngoing: true,
      description:
        "Member says he met an 'adviser' via an Instagram account @crypto.gains.example about 6 weeks ago and has made four transfers totalling about $18,500 to a platform at tradeprofit-example.example. The dashboard shows big gains but when he tried to withdraw he was told to pay a $2,000 'tax release fee' first. He sent a photo of his driver licence for 'verification' early on. He's being messaged daily on WhatsApp from +61 400 000 001 to pay the fee today. He's embarrassed and asked us not to tell his family.",
    },
  },
];
