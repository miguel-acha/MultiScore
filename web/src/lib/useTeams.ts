// Module-level cache for GET /teams (crests + national flags): every
// TeamBadge on a page would otherwise re-fetch the same ~60-entry JSON.
// Same pattern as the rest of api.ts - a plain in-memory cache, no query
// library needed for a payload this small and static.
import { useEffect, useState } from "react";
import { api } from "../api";
import type { TeamsMap } from "../api";

let cache: TeamsMap | null = null;
let inflight: Promise<TeamsMap> | null = null;

export function useTeams(): TeamsMap | null {
  const [teams, setTeams] = useState<TeamsMap | null>(cache);

  useEffect(() => {
    if (cache) {
      setTeams(cache);
      return;
    }
    if (!inflight) inflight = api.teams().then((t) => (cache = t));
    inflight.then(setTeams).catch(() => setTeams({}));
  }, []);

  return teams;
}
