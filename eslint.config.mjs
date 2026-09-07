import tseslint from "typescript-eslint";

// ESLint on top of `tsc --noEmit`, which catches a different class of thing:
// unused code, shadowed intent, accidental `any`. It is wired into the existing
// `npm run lint` rather than a new script, so CI and the release workflow pick
// it up without changing.
//
// The three tuned rules below are tuned deliberately: each one otherwise fires
// on a pattern this codebase uses on purpose, and rewriting ~20 call sites to
// satisfy a linter is how a toolchain change turns into a diff nobody can read.
export default tseslint.config(
  { ignores: ["dist/", "reference/", "node_modules/", "templates/"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The cards announce themselves on load with console.info; that is a
      // deliberate, one-line-per-card banner, not stray debugging.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // `const { corners, ...rest } = config` is how the editors drop a key
          // from a config object. The binding is unused by definition — that is
          // the point of it — so flagging it would mean renaming it to
          // `_corners` in seventeen editors to say nothing new.
          ignoreRestSiblings: true,
        },
      ],

      // Aimed at `const self = this` captured for a callback. What this codebase
      // actually does is `let node: HTMLElement | null = this` and then walk up
      // parentElement, where the alias is the loop variable and reassigned
      // immediately.
      "@typescript-eslint/no-this-alias": ["error", { allowedNames: ["node"] }],

      // Some `any` remains in the older cards. Worth fixing when that card is
      // next touched, not worth blocking every build over today.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
