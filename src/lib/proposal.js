// Helpers for the customer-facing proposal flow.

// Generate an unguessable token for a public proposal link. Uses the Web
// Crypto API when available and falls back to Math.random for older runtimes.
export function generateProposalToken() {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return (
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }
}

// Build the absolute URL a customer uses to view and accept their proposal.
export function proposalUrl(token) {
  if (typeof window === "undefined") return `/p/${token}`;
  return `${window.location.origin}/p/${token}`;
}
