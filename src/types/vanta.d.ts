declare module "vanta/dist/vanta.fog.min" {
  /** Vanta's FOG effect (MIT). Renders a shader fog into `el` with the three.js passed in. */
  const FOG: (options: Record<string, unknown>) => { destroy: () => void };
  export default FOG;
}

// three.js is only handed to Vanta, never called directly, so its types aren't worth a dependency.
declare module "three";
