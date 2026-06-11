import * as path from "node:path";
import type { ProviderDef } from "./index.js";

export const copilot: ProviderDef = {
  id: "copilot",
  globalSkillsDir: (home: string) => path.join(home, ".agents", "skills"),
  projectSkillsDir: (root: string) => path.join(root, ".github", "skills"),
};
