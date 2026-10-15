import React from "react"
import { createRoot } from "react-dom/client"
import GriJoyas from "./GriJoyas"
import "./global.css"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://msheaodmuqegwpfjvhbo.supabase.co"
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_A5qRGhGAymh1jQLxu5VJEA_6GYaI9SX"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GriJoyas
      supabaseUrl={supabaseUrl}
      supabaseKey={supabaseKey}
    />
  </React.StrictMode>
)
