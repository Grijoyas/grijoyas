import React from "react"
import { createRoot } from "react-dom/client"
import GriJoyas from "./GriJoyas"
import "./global.css"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ""
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ""

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GriJoyas
      supabaseUrl={supabaseUrl}
      supabaseKey={supabaseKey}
    />
  </React.StrictMode>
)
