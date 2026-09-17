// Shim: WXT fixes the @ alias to the extension srcDir (src/extension).
// Shared shadcn/ui imports of `@/lib/utils` resolve here.
// Forward them to the actual implementation so the extension can reuse frontend components.
export { cn } from "../../react-app/lib/utils";
