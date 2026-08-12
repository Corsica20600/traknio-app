import { requireWatchAccess } from "@/src/server/watch-auth";
import { executeWatchActionRoute } from "@/src/server/watch-action-routes";

export async function POST(request: Request) {
  const access = await requireWatchAccess(request);
  if (!access.ok) return access.response;

  return executeWatchActionRoute({ request, access, operation: "previous-exercise" });
}
