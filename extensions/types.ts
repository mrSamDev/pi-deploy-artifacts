export type Platform = "vercel" | "cloudflare" | "netlify" | "github";

export interface ArtifactEntry {
  id: string;
  url: string;
  platform: Platform;
  slug: string;
}

export interface PlatformInfo {
  projectName?: string;
  baseUrl?: string;
}

export interface ArtifactState {
  artifacts: Record<string, ArtifactEntry>; // keyed by title
  platforms: Partial<Record<Platform, PlatformInfo>>;
}
