// The site's identity, written once. The page's title reads SITE_NAME, and
// its GitHub star button SOURCE_URL. Instantiation rewrites both to the
// product's own name and repository, so keep them literal and on one line
// each.
// prettier-ignore
export const SITE_NAME = "Live Transcription";
// prettier-ignore
export const SOURCE_URL = "https://github.com/sourceplane/live-transcription";

// The site's public origin (metadataBase and the share links), without a
// trailing slash. The deploy sets NEXT_PUBLIC_SITE_URL per environment
// (component.yaml); unset, it is http://localhost:3000.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

// "owner/name" of SOURCE_URL, for the star button's label.
export const SOURCE_REPO = new URL(SOURCE_URL).pathname.replace(/^\/+|\/+$/g, "");
