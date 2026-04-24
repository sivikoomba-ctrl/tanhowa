import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Keep ESLint off of generated output. `.next/` is Next's build artifact;
  // `next-env.d.ts` is regenerated every build and uses a triple-slash
  // reference that trips @typescript-eslint/triple-slash-reference.
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
