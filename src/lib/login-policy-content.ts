export const termsOfServiceUrl = "https://atcmh.org/terms";
export const privacyPolicyUrl = "https://atcmh.org/policy";

export interface LoginConsentMessage {
  title: string;
  message: string;
}

const consentMessages: Readonly<Record<string, LoginConsentMessage>> = {
  consent_declined: {
    title: "Agreement required",
    message: "You remain signed out. Accept the Terms of Service and acknowledge the Privacy Policy to continue.",
  },
  invalid_consent: {
    title: "Agreement could not be completed",
    message: "This agreement request is invalid or was already used. Start a new login below.",
  },
  consent_expired: {
    title: "Agreement request expired",
    message: "This agreement request has expired. Start a new login below.",
  },
};

export function loginConsentMessage(outcome: string | undefined): LoginConsentMessage | undefined {
  return outcome ? consentMessages[outcome] : undefined;
}
