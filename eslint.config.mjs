import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Keep this list in sync with .gitignore. Anything git refuses to track is
    // not our code and must not be linted: the scratch dirs below hold fetched
    // third-party bundles, and linting them buried the real source under ~24k
    // errors, so `npm run lint` failed locally while CI - which checks out a
    // clean tree without them - stayed green.
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "logs/**",
      ".tmp/**",
      "tmp/**"
    ]
  }
);
