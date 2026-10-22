// lib/server/guard.ts
// Import this first in every lib/server file. If a server module is ever
// pulled into a browser bundle by mistake, it fails loudly instead of quietly
// shipping server logic (and maybe secrets) to users.
if (typeof window !== "undefined") {
  throw new Error("lib/server/* is server-only and must not be imported in browser code")
}
export {}
