export function summarizeAuthSettings(settings = {}) {
  const external = settings?.external ?? {};
  return {
    emailMagicLinkEnabled: external.email === true,
    googleEnabled: external.google === true,
    signupDisabled: settings?.disable_signup === true,
  };
}
