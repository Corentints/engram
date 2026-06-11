import * as path from "node:path";
import type { ProviderDef } from "./index.js";

export const claude: ProviderDef = {
  id: "claude",
  globalSkillsDir: (home: string) => path.join(home, ".claude", "skills"),
  projectSkillsDir: (root: string) => path.join(root, ".claude", "skills"),
};
