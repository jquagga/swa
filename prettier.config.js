/** Prettier config: defaults (2-space, double quotes) + Svelte + Tailwind class sorting. */
const config = {
  plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"],
  overrides: [{ files: "*.svelte", options: { parser: "svelte" } }],
};

export default config;
