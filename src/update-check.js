// Detached background worker spawned by maybeNotifyUpdate(): refreshes the
// update cache without ever delaying or failing the user's command.
import {
  refreshUpdateCache,
  readUpdateCache,
  writeUpdateCache,
} from "./version.js";

try {
  await refreshUpdateCache();
} catch {
  // Offline or registry hiccup: still record the attempt (keeping any
  // previously known version) so we don't respawn on every command.
  try {
    writeUpdateCache(readUpdateCache()?.latest ?? null);
  } catch {
    // Nothing sensible left to do.
  }
}
