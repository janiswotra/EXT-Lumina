/**
 * LinkedIn Voyager API client — DISABLED.
 * LinkedIn deprecated /voyager/api endpoints (410 Gone) as of 2025/2026.
 * Kept as stub for future re-enablement if new endpoints are discovered.
 */
import { CandidateProfile } from '../types';

export async function fetchVoyagerProfile(): Promise<CandidateProfile | null> {
  // All known Voyager API endpoints return 410 Gone.
  // Skipping API attempt to avoid unnecessary network errors.
  return null;
}
