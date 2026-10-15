/**
 * GRI JOYAS — Landing editorial + catálogo interactivo + panel de administración.
 *
 * Componente único, autocontenido, para Framer (Code Component).
 * Sin dependencias externas: habla con Supabase por REST (PostgREST, GoTrue y Storage).
 * Instrucciones: ver INSTRUCCIONES.md. Base de datos: supabase-setup.sql.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 4200
 * @framerDisableUnlink
 */
import * as React from "react"
import { createPortal } from "react-dom"

const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } =
    React

const useIsoLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect

/* =====================================================================
   1. TIPOS
   ===================================================================== */

export type Availability = "disponible" | "por_encargo" | "agotado"
export type Currency = "UYU" | "USD"

export interface ProductImage {
    url: string
    path?: string
}

export interface CustomField {
    id: string
    label: string
    type: "select" | "text"
    options: string[]
    required: boolean
}

export interface Product {
    id: string
    sku: string | null
    name: string
    description: string
    category_slug: string | null
    material: string | null
    material_options: string[]
    price: number | null
    currency: Currency
    availability: Availability
    featured: boolean
    visible: boolean
    sort_order: number
    created_at: string
    tags: string[]
    images: ProductImage[]
    ring_sizes: string[]
    requires_size: boolean
    engraving_enabled: boolean
    engraving_max: number
    custom_fields: CustomField[]
    demo?: boolean
}

export interface Category {
    id: string
    slug: string
    name: string
    sort_order: number
}

export interface Selection {
    material: string
    size: string
    engraving: "none" | "yes"
    engravingText: string
    extras: Record<string, string>
}

export interface CustomRequest {
    type: string
    material: string
    idea: string
    reference: string
    budget: string
    name: string
}

export type SortKey = "destacados" | "novedades" | "precio_asc" | "precio_desc"

/* =====================================================================
   2. TEXTOS Y CONSTANTES
   ===================================================================== */

const DEFAULT_WHATSAPP = "59898827108"
const DEFAULT_INSTAGRAM = "https://www.instagram.com/gri_joyas/"
const BUCKET = "product-images"

const AVAILABILITY_LABEL: Record<Availability, string> = {
    disponible: "Disponible",
    por_encargo: "Por encargo",
    agotado: "Agotado",
}

const BASE_MATERIALS = ["oro", "plata", "combinado"]

export const SORT_LABEL: Record<SortKey, string> = {
    destacados: "Destacados",
    novedades: "Novedades",
    precio_asc: "Precio: menor a mayor",
    precio_desc: "Precio: mayor a menor",
}

/* =====================================================================
   3. HELPERS PUROS (exportados para poder probarlos)
   ===================================================================== */

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d)

const strArr = (v: unknown): string[] =>
    Array.isArray(v)
        ? v
              .filter((x): x is string => typeof x === "string")
              .map((s) => s.trim())
              .filter(Boolean)
        : []

const numOrNull = (v: unknown): number | null => {
    const n: unknown = typeof v === "string" && v.trim() !== "" ? Number(v) : v
    return typeof n === "number" && isFinite(n) && n >= 0 ? n : null
}

export const normalize = (s: string): string =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

export const slugify = (s: string): string =>
    normalize(s)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

export const capitalize = (s: string): string =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : s

export function materialLabel(
    key: string,
    context: "filtro" | "variante" = "filtro"
): string {
    const k = normalize(key)
    if (k === "oro") return "Oro"
    if (k === "plata") return "Plata"
    if (k === "combinado")
        return context === "variante" ? "Plata y oro" : "Combinado"
    return capitalize(key.trim())
}

export function formatPrice(price: number, currency: Currency): string {
    const n = new Intl.NumberFormat("es-UY", {
        maximumFractionDigits: 0,
    }).format(price)
    return currency === "USD" ? `US$ ${n}` : `$ ${n}`
}

/** Materiales que se muestran en la tarjeta. */
export function productMaterialText(p: Product): string {
    if (p.material_options.length > 1)
        return p.material_options
            .map((m) => materialLabel(m, "variante"))
            .join(" / ")
    if (p.material) return materialLabel(p.material)
    if (p.material_options.length === 1)
        return materialLabel(p.material_options[0])
    return ""
}

/** Claves de material con las que el producto aparece en los filtros. */
export function productMaterialKeys(p: Product): string[] {
    const keys = new Set<string>()
    if (p.material) keys.add(normalize(p.material))
    p.material_options.forEach((m) => keys.add(normalize(m)))
    return Array.from(keys)
}

function parseImages(v: unknown): ProductImage[] {
    if (!Array.isArray(v)) return []
    const out: ProductImage[] = []
    for (const it of v) {
        if (typeof it === "string" && /^https?:\/\//i.test(it))
            out.push({ url: it })
        else if (it && typeof it === "object") {
            const o = it as Record<string, unknown>
            const url = str(o.url)
            if (/^https?:\/\//i.test(url))
                out.push({
                    url,
                    path: typeof o.path === "string" ? o.path : undefined,
                })
        }
    }
    return out
}

function parseCustomFields(v: unknown): CustomField[] {
    if (!Array.isArray(v)) return []
    const out: CustomField[] = []
    for (const it of v) {
        if (!it || typeof it !== "object") continue
        const o = it as Record<string, unknown>
        const id = str(o.id).trim()
        const label = str(o.label).trim()
        if (!id || !label) continue
        const type = o.type === "select" ? "select" : "text"
        const options = strArr(o.options)
        if (type === "select" && options.length === 0) continue
        out.push({ id, label, type, options, required: o.required === true })
    }
    return out
}

/** Valida y normaliza una fila cruda de la base. Devuelve null si no sirve. */
export function parseProduct(raw: unknown): Product | null {
    if (!raw || typeof raw !== "object") return null
    const o = raw as Record<string, unknown>
    const id = str(o.id).trim()
    const name = str(o.name).trim()
    if (!id || !name) return null
    const av = str(o.availability)
    const availability: Availability =
        av === "por_encargo" || av === "agotado" ? av : "disponible"
    const engMax = Number(o.engraving_max)
    return {
        id,
        sku: str(o.sku).trim() || null,
        name,
        description: str(o.description),
        category_slug: str(o.category_slug).trim() || null,
        material: str(o.material).trim() || null,
        material_options: strArr(o.material_options),
        price: numOrNull(o.price),
        currency: o.currency === "USD" ? "USD" : "UYU",
        availability,
        featured: o.featured === true,
        visible: o.visible !== false,
        sort_order: Number.isFinite(Number(o.sort_order))
            ? Number(o.sort_order)
            : 0,
        created_at: str(o.created_at),
        tags: strArr(o.tags),
        images: parseImages(o.images),
        ring_sizes: strArr(o.ring_sizes),
        requires_size: o.requires_size === true,
        engraving_enabled: o.engraving_enabled === true,
        engraving_max:
            Number.isFinite(engMax) && engMax >= 1 && engMax <= 100
                ? Math.round(engMax)
                : 20,
        custom_fields: parseCustomFields(o.custom_fields),
    }
}

export function parseCategory(raw: unknown): Category | null {
    if (!raw || typeof raw !== "object") return null
    const o = raw as Record<string, unknown>
    const id = str(o.id).trim()
    const slug = str(o.slug).trim()
    const name = str(o.name).trim()
    if (!id || !slug || !name) return null
    return { id, slug, name, sort_order: Number(o.sort_order) || 0 }
}

export function emptySelection(p: Product): Selection {
    const single = p.material_options.length === 1 ? p.material_options[0] : ""
    return {
        material: single,
        size: "",
        engraving: "none",
        engravingText: "",
        extras: {},
    }
}

export const NO_SIZE = "No estoy seguro/a"

/** Devuelve errores por campo. Vacío = todo en orden. */
export function validateSelection(
    p: Product,
    s: Selection
): Record<string, string> {
    const errors: Record<string, string> = {}
    if (p.material_options.length > 1 && !s.material)
        errors.material = "Elegí un material para continuar."
    if (p.ring_sizes.length > 0 && p.requires_size && !s.size)
        errors.size = "Elegí un talle o marcá “No estoy seguro/a”."
    if (p.engraving_enabled && s.engraving === "yes" && !s.engravingText.trim())
        errors.engraving = "Escribí el texto del grabado o elegí “Sin grabado”."
    for (const f of p.custom_fields) {
        if (f.required && !(s.extras[f.id] || "").trim())
            errors["extra:" + f.id] = `Completá “${f.label}”.`
    }
    return errors
}

/** Mensaje de WhatsApp para una pieza. Solo incluye campos con datos reales. */
export function buildProductMessage(
    brand: string,
    p: Product,
    s: Selection
): string {
    const lines: string[] = [
        `Hola, ${brand}. Quiero consultar por esta pieza:`,
        "",
    ]
    lines.push(`Producto: ${p.name}`)
    if (p.sku) lines.push(`Código: ${p.sku}`)

    if (p.material_options.length > 1) {
        if (s.material)
            lines.push(
                `Material elegido: ${materialLabel(s.material, "variante")}`
            )
    } else if (p.material_options.length === 1) {
        lines.push(
            `Material: ${materialLabel(p.material_options[0], "variante")}`
        )
    } else if (p.material) {
        lines.push(`Material: ${materialLabel(p.material)}`)
    }

    if (p.ring_sizes.length > 0 && s.size)
        lines.push(
            `Talle: ${s.size === NO_SIZE ? "No estoy seguro/a (lo confirmo por acá)" : s.size}`
        )

    if (p.engraving_enabled) {
        const t = s.engravingText.trim()
        lines.push(
            `Grabado: ${s.engraving === "yes" && t ? `“${t}”` : "Sin grabado"}`
        )
    }

    const extras: string[] = []
    for (const f of p.custom_fields) {
        const v = (s.extras[f.id] || "").trim()
        if (v) extras.push(`${f.label}: ${v}`)
    }
    if (extras.length) lines.push(`Otras opciones: ${extras.join("; ")}`)

    if (p.availability !== "disponible")
        lines.push(
            `Disponibilidad publicada: ${AVAILABILITY_LABEL[p.availability]}`
        )
    if (p.price !== null)
        lines.push(`Precio publicado: ${formatPrice(p.price, p.currency)}`)

    lines.push(
        "",
        "¿Me podrían confirmar disponibilidad, precio final y opciones de entrega?"
    )
    return lines.join("\n")
}

export function buildCustomMessage(brand: string, r: CustomRequest): string {
    const lines: string[] = [
        `Hola, ${brand}. Quiero consultar por un trabajo o una pieza:`,
        "",
    ]
    if (r.type.trim()) lines.push(`Tipo de pieza: ${r.type.trim()}`)
    if (r.material.trim())
        lines.push(`Material preferido: ${r.material.trim()}`)
    if (r.idea.trim()) lines.push(`Idea: ${r.idea.trim()}`)
    if (r.reference.trim()) lines.push(`Referencia: ${r.reference.trim()}`)
    if (r.budget.trim())
        lines.push(`Presupuesto aproximado: ${r.budget.trim()}`)
    if (r.name.trim()) lines.push(`Nombre: ${r.name.trim()}`)
    lines.push(
        "",
        "¿Podemos conversar sobre las opciones y confirmar cómo seguir?"
    )
    return lines.join("\n")
}

export function waUrl(number: string, text: string): string {
    const digits = (number || "").replace(/\D/g, "") || DEFAULT_WHATSAPP
    return text
        ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        : `https://wa.me/${digits}`
}

export function waDisplay(number: string): string {
    const d = (number || "").replace(/\D/g, "") || DEFAULT_WHATSAPP
    if (d.startsWith("598") && d.length === 11)
        return `+598 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`
    return `+${d}`
}

function openExternal(url: string) {
    if (typeof window === "undefined") return
    const w = window.open(url, "_blank")
    if (w) {
        try {
            w.opener = null
        } catch {
            /* nada */
        }
    } else {
        window.location.href = url
    }
}

export interface Filters {
    category: string
    material: string
    query: string
    sort: SortKey
}

export function filterAndSort(
    products: Product[],
    categories: Category[],
    f: Filters
): Product[] {
    const catName = new Map(categories.map((c) => [c.slug, c.name]))
    const q = normalize(f.query)
    const terms = q ? q.split(/\s+/) : []
    let list = products.filter((p) => {
        if (f.category !== "todas" && p.category_slug !== f.category)
            return false
        if (
            f.material !== "todos" &&
            !productMaterialKeys(p).includes(f.material)
        )
            return false
        if (terms.length) {
            const hay = normalize(
                [
                    p.name,
                    p.sku || "",
                    p.category_slug ? catName.get(p.category_slug) || "" : "",
                    productMaterialText(p),
                    p.material_options.join(" "),
                    p.tags.join(" "),
                ].join(" ")
            )
            if (!terms.every((t) => hay.includes(t))) return false
        }
        return true
    })
    const byOrder = (a: Product, b: Product) =>
        a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at)
    list = [...list]
    if (f.sort === "destacados")
        list.sort(
            (a, b) => Number(b.featured) - Number(a.featured) || byOrder(a, b)
        )
    else if (f.sort === "novedades")
        list.sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || byOrder(a, b)
        )
    else {
        const dir = f.sort === "precio_asc" ? 1 : -1
        list.sort((a, b) => {
            if (a.price === null && b.price === null) return byOrder(a, b)
            if (a.price === null) return 1
            if (b.price === null) return -1
            return (a.price - b.price) * dir || byOrder(a, b)
        })
    }
    return list
}

/* =====================================================================
   4. DATOS DE DEMOSTRACIÓN (ficticios, sin fotos)
   ===================================================================== */

export const DEFAULT_CATEGORIES: Category[] = [
    { id: "c1", slug: "anillos", name: "Anillos", sort_order: 10 },
    {
        id: "c2",
        slug: "cadenas-y-collares",
        name: "Cadenas y collares",
        sort_order: 20,
    },
    { id: "c3", slug: "pulseras", name: "Pulseras", sort_order: 30 },
    {
        id: "c4",
        slug: "caravanas-y-aros",
        name: "Caravanas y aros",
        sort_order: 40,
    },
    {
        id: "c5",
        slug: "dijes-y-colgantes",
        name: "Dijes y colgantes",
        sort_order: 50,
    },
    { id: "c6", slug: "otros", name: "Otros", sort_order: 60 },
]

function demo(
    p: Partial<Product> & { id: string; name: string },
    i: number
): Product {
    return {
        sku: null,
        description:
            "Pieza ficticia para probar la grilla, los filtros y la ficha. No forma parte del stock de Gri Joyas.",
        category_slug: null,
        material: null,
        material_options: [],
        price: null,
        currency: "UYU",
        availability: "disponible",
        featured: false,
        visible: true,
        sort_order: i * 10,
        created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        tags: [],
        images: [],
        ring_sizes: [],
        requires_size: false,
        engraving_enabled: false,
        engraving_max: 20,
        custom_fields: [],
        demo: true,
        ...p,
    }
}

export const DEMO_PRODUCTS: Product[] = [
    demo(
        {
            id: "d1",
            name: "Ejemplo · Anillo liso",
            sku: "EJ-001",
            category_slug: "anillos",
            material: "oro",
            material_options: ["oro", "plata"],
            price: 2490,
            featured: true,
            ring_sizes: ["10", "12", "14", "16", "18"],
            requires_size: true,
            engraving_enabled: true,
            engraving_max: 16,
            tags: ["liso", "diario"],
        },
        1
    ),
    demo(
        {
            id: "d2",
            name: "Ejemplo · Cadena fina",
            sku: "EJ-002",
            category_slug: "cadenas-y-collares",
            material: "plata",
            price: 1850,
            custom_fields: [
                {
                    id: "largo",
                    label: "Largo",
                    type: "select",
                    options: ["40 cm", "45 cm", "50 cm"],
                    required: true,
                },
            ],
        },
        2
    ),
    demo(
        {
            id: "d3",
            name: "Ejemplo · Pulsera eslabones",
            category_slug: "pulseras",
            material: "combinado",
            price: 3200,
            featured: true,
            custom_fields: [
                {
                    id: "nota",
                    label: "Observación",
                    type: "text",
                    options: [],
                    required: false,
                },
            ],
        },
        3
    ),
    demo(
        {
            id: "d4",
            name: "Ejemplo · Aros argolla",
            category_slug: "caravanas-y-aros",
            material: "oro",
            availability: "agotado",
            price: 1990,
        },
        4
    ),
    demo(
        {
            id: "d5",
            name: "Ejemplo · Dije inicial",
            category_slug: "dijes-y-colgantes",
            material: "plata",
            material_options: ["plata", "oro"],
            availability: "por_encargo",
            engraving_enabled: true,
            engraving_max: 12,
        },
        5
    ),
    demo(
        {
            id: "d6",
            name: "Ejemplo · Anillo doble",
            category_slug: "anillos",
            material: "plata",
            price: 1650,
            ring_sizes: ["11", "13", "15"],
            requires_size: false,
        },
        6
    ),
    demo(
        {
            id: "d7",
            name: "Ejemplo · Caravanas mini",
            category_slug: "caravanas-y-aros",
            material: "plata",
            price: 990,
        },
        7
    ),
    demo(
        {
            id: "d8",
            name: "Ejemplo · Pieza sin categoría",
            material: "oro",
            price: 4100,
        },
        8
    ),
]

/* =====================================================================
   5. CLIENTE SUPABASE POR REST (sin dependencias)
   ===================================================================== */

export interface Cfg {
    url: string
    key: string
}

export class ApiError extends Error {
    status: number
    code?: string
    constructor(message: string, status: number, code?: string) {
        super(message)
        this.name = "ApiError"
        this.status = status
        this.code = code
    }
}

function decodeJwtRole(key: string): string | null {
    const parts = key.split(".")
    if (parts.length !== 3) return null
    try {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
        const json = decodeURIComponent(
            atob(b64)
                .split("")
                .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
                .join("")
        )
        const role = (JSON.parse(json) as { role?: unknown }).role
        return typeof role === "string" ? role : null
    } catch {
        return null
    }
}

export function makeCfg(
    url: string,
    key: string
): { cfg: Cfg | null; problem: string } {
    const u = (url || "").trim().replace(/\/+$/, "")
    const k = (key || "").trim()
    if (!u && !k) return { cfg: null, problem: "" }
    if (!u || !k)
        return {
            cfg: null,
            problem: "Falta completar la URL o la clave pública de Supabase.",
        }
    if (!/^https:\/\/[^\s/]+$/i.test(u))
        return {
            cfg: null,
            problem:
                "La URL de Supabase debe ser algo como https://xxxx.supabase.co",
        }
    if (k.startsWith("sb_secret_") || decodeJwtRole(k) === "service_role")
        return {
            cfg: null,
            problem:
                "Esa clave es privada (service_role / secret). No la uses acá: pegá la clave pública (anon / publishable).",
        }
    return { cfg: { url: u, key: k }, problem: "" }
}

export function friendlyError(e: unknown): string {
    if (e && typeof e === "object" && "status" in e) {
        const a = e as ApiError
        const msg = (a.message || "").toLowerCase()
        if (a.code === "invalid_credentials" || msg.includes("invalid login"))
            return "Email o contraseña incorrectos."
        if (a.status === 401) return "Tu sesión venció. Iniciá sesión de nuevo."
        if (
            a.status === 403 ||
            a.code === "42501" ||
            msg.includes("row-level security") ||
            msg.includes("row level security")
        )
            return "Supabase rechazó la operación por permisos. Revisá que tu usuario esté en la tabla admins y que ejecutaste todo el SQL de configuración."
        if (
            a.code === "PGRST205" ||
            a.code === "42P01" ||
            msg.includes("could not find the table")
        )
            return "Falta una tabla en la base. Ejecutá el archivo supabase-setup.sql en el SQL Editor de Supabase."
        if (msg.includes("bucket not found"))
            return "No existe el bucket de fotos “product-images”. Ejecutá supabase-setup.sql."
        if (
            a.status === 413 ||
            msg.includes("too large") ||
            msg.includes("exceeded the maximum")
        )
            return "La foto es demasiado pesada (máximo 5 MB)."
        if (a.status === 409 || a.code === "23505")
            return "Ya existe otro registro con ese valor único (por ejemplo, el mismo código/SKU o nombre de categoría)."
        if (a.code === "23503")
            return "No se pudo guardar porque falta un dato relacionado (por ejemplo, una categoría que ya no existe)."
        if (a.code === "23514" || a.code === "22P02")
            return "Hay un dato con formato inválido. Revisá los campos del formulario."
        return a.message || "Ocurrió un error inesperado."
    }
    if (e && typeof e === "object" && (e as Error).name === "AbortError")
        return "El servidor tardó demasiado en responder. Intentá de nuevo."
    if (e instanceof TypeError)
        return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo."
    return e instanceof Error ? e.message : "Ocurrió un error inesperado."
}

interface SbOptions {
    method?: string
    token?: string | null
    json?: unknown
    body?: BodyInit
    headers?: Record<string, string>
    prefer?: string
    timeoutMs?: number
}

async function sbRaw(
    cfg: Cfg,
    path: string,
    o: SbOptions = {}
): Promise<Response> {
    const headers: Record<string, string> = {
        apikey: cfg.key,
        ...(o.headers || {}),
    }
    const bearer = o.token || (cfg.key.startsWith("eyJ") ? cfg.key : "")
    if (bearer) headers.Authorization = `Bearer ${bearer}`
    let body: BodyInit | undefined = o.body
    if (o.json !== undefined) {
        headers["Content-Type"] = "application/json"
        body = JSON.stringify(o.json)
    }
    if (o.prefer) headers.Prefer = o.prefer
    const ctrl =
        typeof AbortController !== "undefined" ? new AbortController() : null
    const timer = ctrl
        ? setTimeout(() => ctrl.abort(), o.timeoutMs ?? 25000)
        : null
    try {
        const res = await fetch(cfg.url + path, {
            method: o.method || "GET",
            headers,
            body,
            signal: ctrl ? ctrl.signal : undefined,
        })
        if (!res.ok) {
            let msg = res.statusText || "Error"
            let code: string | undefined
            try {
                const j = (await res.json()) as Record<string, unknown>
                msg =
                    str(j.message) ||
                    str(j.msg) ||
                    str(j.error_description) ||
                    str(j.error) ||
                    msg
                code =
                    str(j.code) ||
                    str(j.error_code) ||
                    str(j.errorCode) ||
                    undefined
            } catch {
                /* cuerpo vacío */
            }
            throw new ApiError(msg, res.status, code)
        }
        return res
    } finally {
        if (timer) clearTimeout(timer)
    }
}

async function sb<T = unknown>(
    cfg: Cfg,
    path: string,
    o: SbOptions = {}
): Promise<T> {
    const res = await sbRaw(cfg, path, o)
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
}

export interface Session {
    access_token: string
    refresh_token: string
    expires_at: number
    email: string
    user_id: string
}

function toSession(j: unknown): Session {
    const o = (j || {}) as Record<string, unknown>
    const user = (o.user || {}) as Record<string, unknown>
    const exp = Number(o.expires_in) || 3600
    return {
        access_token: str(o.access_token),
        refresh_token: str(o.refresh_token),
        expires_at: Date.now() + exp * 1000,
        email: str(user.email),
        user_id: str(user.id),
    }
}

const authSignIn = async (cfg: Cfg, email: string, password: string) =>
    toSession(
        await sb(cfg, "/auth/v1/token?grant_type=password", {
            method: "POST",
            json: { email, password },
        })
    )

const authRefresh = async (cfg: Cfg, refresh_token: string) =>
    toSession(
        await sb(cfg, "/auth/v1/token?grant_type=refresh_token", {
            method: "POST",
            json: { refresh_token },
        })
    )

const authSignOut = async (cfg: Cfg, token: string) => {
    try {
        await sb(cfg, "/auth/v1/logout", { method: "POST", token })
    } catch {
        /* igual cerramos localmente */
    }
}

export const publicImageUrl = (cfg: Cfg, path: string) =>
    `${cfg.url}/storage/v1/object/public/${BUCKET}/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`

async function storageUpload(
    cfg: Cfg,
    token: string,
    path: string,
    blob: Blob
) {
    await sb(
        cfg,
        `/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`,
        {
            method: "POST",
            token,
            body: blob,
            headers: {
                "Content-Type": blob.type || "application/octet-stream",
                "x-upsert": "false",
            },
            timeoutMs: 90000,
        }
    )
}

async function storageRemove(cfg: Cfg, token: string, paths: string[]) {
    if (!paths.length) return
    try {
        await sb(cfg, `/storage/v1/object/${BUCKET}`, {
            method: "DELETE",
            token,
            json: { prefixes: paths },
        })
    } catch {
        /* limpieza de mejor esfuerzo */
    }
}

/* =====================================================================
   6. HOOKS
   ===================================================================== */

export interface CatalogState {
    status: "loading" | "ready" | "error" | "demo"
    products: Product[]
    categories: Category[]
    error: string
}

function useCatalog(cfg: Cfg | null) {
    const [state, setState] = useState<CatalogState>(
        cfg
            ? { status: "loading", products: [], categories: [], error: "" }
            : {
                  status: "demo",
                  products: DEMO_PRODUCTS,
                  categories: DEFAULT_CATEGORIES,
                  error: "",
              }
    )
    const [tick, setTick] = useState(0)

    useEffect(() => {
        if (!cfg) {
            setState({
                status: "demo",
                products: DEMO_PRODUCTS,
                categories: DEFAULT_CATEGORIES,
                error: "",
            })
            return
        }
        let alive = true
        setState((s) => ({ ...s, status: "loading", error: "" }))
        Promise.all([
            sb<unknown[]>(
                cfg,
                "/rest/v1/products?select=*&visible=eq.true&order=sort_order.asc,created_at.desc"
            ),
            sb<unknown[]>(
                cfg,
                "/rest/v1/categories?select=*&order=sort_order.asc"
            ),
        ])
            .then(([pr, ca]) => {
                if (!alive) return
                setState({
                    status: "ready",
                    products: (Array.isArray(pr) ? pr : [])
                        .map(parseProduct)
                        .filter((x): x is Product => !!x),
                    categories: (Array.isArray(ca) ? ca : [])
                        .map(parseCategory)
                        .filter((x): x is Category => !!x),
                    error: "",
                })
            })
            .catch((e) => {
                if (!alive) return
                setState((s) => ({
                    ...s,
                    status: "error",
                    error: friendlyError(e),
                }))
            })
        return () => {
            alive = false
        }
    }, [cfg, tick])

    const reload = useCallback(() => setTick((t) => t + 1), [])
    return { ...state, reload }
}

type Breakpoint = "sm" | "md" | "lg"

function useBreakpoint(ref: React.RefObject<HTMLElement | null>): Breakpoint {
    const [bp, setBp] = useState<Breakpoint>("lg")
    useIsoLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const apply = (w: number) =>
            setBp(w < 640 ? "sm" : w < 1024 ? "md" : "lg")
        apply(el.getBoundingClientRect().width || 1024)
        if (typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width
            if (w) apply(w)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [ref])
    return bp
}

function usePrefersReducedMotion(): boolean {
    const [reduce, setReduce] = useState(false)
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
        setReduce(mq.matches)
        const h = () => setReduce(mq.matches)
        mq.addEventListener?.("change", h)
        return () => mq.removeEventListener?.("change", h)
    }, [])
    return reduce
}

/* =====================================================================
   7. ESTILOS (encapsulados bajo .gri)
   ===================================================================== */

const CSS = `
@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap");

.gri{--bg:#F7F5F0;--surface:#FFFFFF;--ink:#20201E;--stone:#8C8982;--accent:#777A60;
  --accent-ink:color-mix(in srgb,var(--accent) 66%,#000);
  --muted:color-mix(in srgb,var(--ink) 64%,var(--bg));
  --line:color-mix(in srgb,var(--ink) 15%,transparent);
  --soft:color-mix(in srgb,var(--ink) 5%,var(--bg));
  --serif:"Cormorant Garamond",Georgia,"Times New Roman",serif;
  --sans:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --pad:clamp(16px,4.2vw,56px);
  font-family:var(--sans);font-size:16px;line-height:1.5;color:var(--ink);background:var(--bg);
  width:100%;position:relative;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.gri *,.gri *::before,.gri *::after{box-sizing:border-box}
:where(.gri a){color:inherit}
:where(.gri button,.gri input,.gri select,.gri textarea){font:inherit;color:inherit}
:where(.gri button){cursor:pointer}
:where(.gri img){display:block;max-width:100%}
:where(.gri h1,.gri h2,.gri h3,.gri p,.gri ul,.gri ol){margin:0;padding:0}
:where(.gri ul,.gri ol){list-style:none}
.gri :focus-visible{outline:2px solid var(--ink);outline-offset:3px;border-radius:2px}
.gri .gri-dark :focus-visible,.gri-dark :focus-visible{outline-color:#fff}
.gri .gri-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.gri-wrap{width:100%;max-width:1400px;margin:0 auto;padding-inline:var(--pad)}
.gri-section{padding-block:clamp(56px,9vw,120px);scroll-margin-top:72px}
.gri-eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-ink);font-weight:500;display:flex;gap:10px;align-items:center}
.gri-eyebrow::after{content:"";height:1px;width:40px;background:currentColor;opacity:.5}
.gri-h2{font-family:var(--serif);font-weight:500;font-size:clamp(34px,5vw,64px);line-height:1;letter-spacing:-.01em}
.gri-h2 em{font-style:italic;color:var(--accent-ink)}
.gri-lead{font-size:clamp(15px,1.5vw,18px);color:var(--muted);max-width:52ch}

/* botones */
.gri-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 24px;border:1px solid var(--ink);background:var(--ink);color:var(--bg);font-size:14px;font-weight:500;letter-spacing:.02em;text-decoration:none;border-radius:2px;transition:background .2s,color .2s,border-color .2s;white-space:nowrap}
.gri-btn:hover{background:transparent;color:var(--ink)}
.gri-btn--ghost{background:transparent;color:var(--ink)}
.gri-btn--ghost:hover{background:var(--ink);color:var(--bg)}
.gri-btn--light{background:var(--bg);color:var(--ink);border-color:var(--bg)}
.gri-btn--light:hover{background:transparent;color:var(--bg)}
.gri-btn--lightghost{background:transparent;color:var(--bg);border-color:color-mix(in srgb,var(--bg) 55%,transparent)}
.gri-btn--lightghost:hover{background:var(--bg);color:var(--ink)}
.gri-btn--sm{min-height:40px;padding:0 16px;font-size:13px}
.gri-btn--danger{background:#8A2B22;border-color:#8A2B22;color:#fff}
.gri-btn--danger:hover{background:transparent;color:#8A2B22}
.gri-btn[disabled],.gri-btn[aria-disabled="true"]{opacity:.45;cursor:not-allowed;pointer-events:none}
.gri-link{background:none;border:0;padding:0;text-decoration:underline;text-underline-offset:3px;font-size:14px}
.gri-ico{width:18px;height:18px;flex:none}

/* barra superior y header */
.gri-topbar{background:var(--ink);color:var(--bg);font-size:12px;letter-spacing:.06em;text-align:center;padding:8px var(--pad)}
.gri-header{position:sticky;top:0;z-index:30;background:var(--bg);border-bottom:1px solid var(--line)}
.gri-header-in{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.gri-logo{font-family:var(--serif);font-weight:600;font-size:24px;letter-spacing:.18em;text-decoration:none;text-transform:uppercase;line-height:1}
.gri-logo span{font-weight:400;font-style:italic;letter-spacing:.08em;margin-left:.35em;color:var(--accent-ink);text-transform:none;font-size:1.05em}
.gri.gri-portal{background:transparent}
.gri-nav{display:flex;gap:clamp(16px,2.4vw,36px);font-size:14px}
.gri-nav a{text-decoration:none;padding:6px 0;border-bottom:1px solid transparent}
.gri-nav a:hover{border-bottom-color:var(--ink)}
.gri-header-actions{display:flex;align-items:center;gap:10px}
.gri-burger{width:44px;height:44px;border:1px solid var(--line);background:transparent;border-radius:2px;display:none;align-items:center;justify-content:center}
.gri-mobilenav{border-top:1px solid var(--line);background:var(--bg)}
.gri-mobilenav a{display:flex;align-items:center;min-height:52px;font-size:17px;text-decoration:none;border-bottom:1px solid var(--line)}
.gri[data-bp="sm"] .gri-nav,.gri[data-bp="md"] .gri-nav{display:none}
.gri[data-bp="sm"] .gri-burger,.gri[data-bp="md"] .gri-burger{display:inline-flex}
.gri[data-bp="sm"] .gri-header-wa-text{display:none}
.gri[data-bp="sm"] .gri-header-wa{padding:0;width:44px;min-height:44px}
.gri[data-bp="sm"] .gri-logo{font-size:20px}

/* hero */
.gri-hero{padding-block:clamp(28px,5vw,72px) clamp(40px,6vw,88px)}
.gri-hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(24px,5vw,80px);align-items:end}
.gri-hero-title{font-family:var(--serif);font-weight:500;font-size:clamp(46px,8.2vw,124px);line-height:.92;letter-spacing:-.02em}
.gri-hero-title em{display:block;font-style:italic;font-weight:400;color:var(--accent-ink);font-size:.62em;line-height:1.02;margin-top:.16em;letter-spacing:-.01em}
.gri-hero-text{margin-top:clamp(22px,3vw,44px);font-size:clamp(16px,1.5vw,19px);max-width:44ch;color:var(--muted)}
.gri-hero-cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:clamp(22px,3vw,36px)}
.gri-hero-facts{display:flex;flex-wrap:wrap;gap:8px 28px;margin-top:clamp(28px,4vw,56px);padding-top:16px;border-top:1px solid var(--line);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.gri-hero-media{position:relative}
.gri-hero-photo{aspect-ratio:4/5;background:var(--soft);overflow:hidden;position:relative}
.gri-hero-photo .gri-img{width:100%;height:100%;object-fit:cover}
.gri-hero-cap{margin-top:10px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--stone);display:flex;justify-content:space-between}
.gri[data-bp="sm"] .gri-hero-grid,.gri[data-bp="md"] .gri-hero-grid{grid-template-columns:minmax(0,1fr)}
.gri[data-bp="sm"] .gri-hero-media{order:-1}
.gri[data-bp="sm"] .gri-hero-photo{aspect-ratio:5/4}
.gri[data-bp="md"] .gri-hero-photo{aspect-ratio:16/10}

/* fotos y marcadores de posición */
.gri-ph{width:100%;height:100%;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:var(--soft);color:var(--stone);font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-align:center;padding:12px;
  background-image:repeating-linear-gradient(135deg,transparent 0 11px,color-mix(in srgb,var(--ink) 4%,transparent) 11px 12px)}
.gri-ph svg{width:28px;height:28px;opacity:.6}
.gri-img{width:100%;height:100%;object-fit:cover;background:var(--soft)}

/* catálogo */
.gri-catalog{background:var(--surface)}
.gri-cat-head{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap;margin-bottom:clamp(24px,3vw,40px)}
.gri-cat-head .gri-h2{margin-top:14px}
.gri-count{font-size:13px;color:var(--muted)}
.gri-demo{display:flex;gap:12px;align-items:flex-start;border:1px dashed var(--accent-ink);background:var(--bg);padding:14px 16px;font-size:14px;margin-bottom:24px}
.gri-demo strong{font-weight:600}
.gri-controls{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-bottom:clamp(22px,3vw,36px);padding-bottom:22px;border-bottom:1px solid var(--line)}
.gri-controls-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.gri-search{flex:1 1 260px;position:relative}
.gri-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--stone);pointer-events:none}
.gri-input,.gri-select,.gri-textarea{width:100%;min-height:48px;padding:0 14px;background:var(--surface);border:1px solid color-mix(in srgb,var(--ink) 30%,transparent);border-radius:2px;font-size:16px;transition:border-color .2s}
.gri-input:hover,.gri-select:hover,.gri-textarea:hover{border-color:var(--ink)}
.gri-search .gri-input{padding-left:42px}
.gri-textarea{padding:12px 14px;min-height:112px;resize:vertical;line-height:1.5}
.gri-select{appearance:none;padding-right:38px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.5l5 5 5-5' fill='none' stroke='%2320201E' stroke-width='1.4'/></svg>");background-repeat:no-repeat;background-position:right 14px center}
.gri-sort{flex:0 1 240px}
.gri-filter-group{display:flex;gap:10px;align-items:center;min-width:0}
.gri-filter-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);min-width:78px;flex:none}
.gri-chips{display:flex;gap:8px;min-width:0;flex:1 1 auto;overflow-x:auto;padding:2px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.gri-chips::-webkit-scrollbar{display:none}
.gri-chip{flex:none;min-height:40px;padding:0 16px;border:1px solid color-mix(in srgb,var(--ink) 25%,transparent);background:transparent;border-radius:999px;font-size:14px;transition:background .2s,color .2s,border-color .2s}
.gri-chip:hover{border-color:var(--ink)}
.gri-chip[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.gri[data-bp="sm"] .gri-filter-group{flex-direction:column;align-items:stretch;gap:6px}
.gri[data-bp="sm"] .gri-sort{flex:1 1 100%}
.gri-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(28px,3.4vw,48px) clamp(14px,2vw,28px);animation:gri-fade .35s ease both}
.gri[data-bp="md"] .gri-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.gri[data-bp="sm"] .gri-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 12px}
@keyframes gri-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.gri-card{display:block;width:100%;padding:0;border:0;background:none;text-align:left;cursor:pointer}
.gri-card-media{position:relative;aspect-ratio:4/5;overflow:hidden;background:var(--soft)}
.gri-card-media .gri-img{transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.gri-card:hover .gri-card-media .gri-img{transform:scale(1.035)}
.gri-card[data-av="agotado"] .gri-card-media .gri-img{filter:grayscale(.7);opacity:.8}
.gri-tag{position:absolute;left:8px;top:8px;background:var(--bg);color:var(--ink);border:1px solid var(--ink);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;line-height:1.3}
.gri-tag--demo{left:auto;right:8px;border-style:dashed;border-color:var(--accent-ink);color:var(--accent-ink)}
.gri-card-body{padding-top:12px;display:grid;gap:3px}
.gri-card-name{font-family:var(--serif);font-size:clamp(19px,1.8vw,24px);line-height:1.1;font-weight:500}
.gri-card:hover .gri-card-name{text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}
.gri-card-meta{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--muted)}
.gri-card-price{color:var(--ink);font-weight:500;white-space:nowrap}
.gri-card-wa{font-size:12px;color:var(--accent-ink);margin-top:2px;display:flex;align-items:center;gap:6px}
.gri-skel{aspect-ratio:4/5;background:linear-gradient(100deg,var(--soft) 30%,color-mix(in srgb,var(--ink) 9%,var(--bg)) 50%,var(--soft) 70%);background-size:300% 100%;animation:gri-shimmer 1.4s linear infinite}
@keyframes gri-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}
.gri-empty{border:1px solid var(--line);padding:clamp(28px,5vw,56px);text-align:center;display:grid;gap:14px;justify-items:center;background:var(--bg)}
.gri-empty h3{font-family:var(--serif);font-size:28px;font-weight:500}
.gri-empty p{color:var(--muted);max-width:46ch}

/* avisos */
.gri-notice{padding:12px 14px;border:1px solid var(--line);background:var(--bg);font-size:14px;display:flex;gap:10px;align-items:flex-start;line-height:1.45}
.gri-notice--err{border-color:#8A2B22;color:#6E1F18;background:#FBF1EF}
.gri-notice--ok{border-color:var(--accent-ink);color:var(--accent-ink);background:#F3F4EE}
.gri-err{color:#8A2B22;font-size:13px;margin-top:6px;display:flex;gap:6px;align-items:flex-start}

/* modal */
.gri-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(32,32,30,.55);display:flex;align-items:center;justify-content:center;padding:24px;animation:gri-fade-o .2s ease both}
@keyframes gri-fade-o{from{opacity:0}to{opacity:1}}
.gri-modal{background:var(--surface);width:100%;max-width:1120px;max-height:min(92vh,860px);overflow:auto;position:relative;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);animation:gri-pop .28s cubic-bezier(.2,.7,.2,1) both;overscroll-behavior:contain}
@keyframes gri-pop{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.gri-modal-close{position:absolute;right:12px;top:12px;z-index:5;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--surface);display:flex;align-items:center;justify-content:center}
.gri-modal-close:hover{background:var(--ink);color:var(--bg)}
.gri-gallery{background:var(--soft);align-self:start;position:sticky;top:0}
.gri-gallery-main{aspect-ratio:4/5;overflow:hidden;background:var(--soft)}
.gri-thumbs{display:flex;gap:8px;padding:10px;overflow-x:auto}
.gri-thumb{flex:none;width:64px;aspect-ratio:1;padding:0;border:1px solid transparent;background:var(--soft);overflow:hidden;opacity:.7}
.gri-thumb[aria-pressed="true"]{border-color:var(--ink);opacity:1}
.gri-info{padding:clamp(22px,3vw,44px);display:flex;flex-direction:column;gap:20px;min-width:0}
.gri-info h2{font-family:var(--serif);font-weight:500;font-size:clamp(30px,3.4vw,46px);line-height:1;padding-right:44px}
.gri-info-top{display:grid;gap:10px}
.gri-sku{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.gri-price{font-size:22px;font-weight:500}
.gri-badges{display:flex;gap:8px;flex-wrap:wrap}
.gri-badge{font-size:12px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--ink);padding:3px 10px;line-height:1.4}
.gri-badge--soft{border-color:var(--line);color:var(--muted)}
.gri-desc{color:var(--muted);white-space:pre-line}
.gri-opt{border:0;padding:0;margin:0;min-width:0;display:grid;gap:10px}
.gri-opt legend,.gri-opt-label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:500;padding:0;display:flex;justify-content:space-between;gap:8px;width:100%}
.gri-opt-label small,.gri-opt legend small{letter-spacing:0;text-transform:none;font-weight:400;color:var(--muted);font-size:12px}
.gri-radios{display:flex;gap:8px;flex-wrap:wrap}
.gri-rc{position:relative}
.gri-rc input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.gri-rc span{display:inline-flex;align-items:center;gap:6px;min-height:44px;min-width:44px;justify-content:center;padding:0 16px;border:1px solid color-mix(in srgb,var(--ink) 28%,transparent);font-size:14px;transition:background .15s,color .15s,border-color .15s;border-radius:2px;background:var(--surface)}
.gri-rc:hover span{border-color:var(--ink)}
.gri-rc input:checked + span{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.gri-rc input:checked + span::before{content:"✓";font-size:12px}
.gri-rc input:focus-visible + span{outline:2px solid var(--ink);outline-offset:3px}
.gri-opt[data-invalid="true"] .gri-rc span{border-color:#8A2B22}
.gri-help{font-size:13px;color:var(--muted)}
.gri-help summary{cursor:pointer;text-decoration:underline;text-underline-offset:3px;width:max-content}
.gri-help p{margin-top:6px;max-width:46ch}
.gri-counter{font-size:12px;color:var(--muted);text-align:right}
.gri-fixed{font-size:14px;display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-block:1px solid var(--line)}
.gri-cta-bar{margin-top:auto;display:grid;gap:8px;padding-top:6px}
.gri-cta-bar .gri-btn{width:100%}
.gri-cta-note{font-size:12px;color:var(--muted);text-align:center}
.gri-btn--wa{min-height:54px;font-size:15px}
@media (max-width:760px){
  .gri-overlay{padding:0;align-items:stretch}
  .gri-modal{max-height:none;height:100%;grid-template-columns:minmax(0,1fr);align-content:start;animation-name:gri-sheet}
  .gri-gallery{position:static}
  .gri-gallery-main{aspect-ratio:1/1}
  .gri-cta-bar{position:sticky;bottom:0;background:var(--surface);padding:12px 0 calc(12px + env(safe-area-inset-bottom));margin-inline:calc(-1 * clamp(22px,3vw,44px));padding-inline:clamp(22px,3vw,44px);border-top:1px solid var(--line)}
}
@keyframes gri-sheet{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}

/* pedidos personalizados */
.gri-custom{background:var(--ink);color:var(--bg)}
.gri-custom .gri-eyebrow{color:color-mix(in srgb,var(--bg) 70%,var(--ink))}
.gri-custom .gri-lead{color:color-mix(in srgb,var(--bg) 72%,var(--ink))}
.gri-custom .gri-h2 em{color:#C9CCB4}
.gri-split{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:clamp(28px,6vw,96px);align-items:start}
.gri[data-bp="sm"] .gri-split,.gri[data-bp="md"] .gri-split{grid-template-columns:minmax(0,1fr)}
.gri-stack{display:grid;gap:18px}
.gri-form{display:grid;gap:18px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.gri-form .full{grid-column:1/-1}
.gri[data-bp="sm"] .gri-form{grid-template-columns:minmax(0,1fr)}
.gri-field{display:grid;gap:7px;min-width:0}
.gri-field>label,.gri-field>.gri-opt-label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:500}
.gri-field>label small{text-transform:none;letter-spacing:0;font-weight:400;opacity:.75}
.gri-custom .gri-input,.gri-custom .gri-select,.gri-custom .gri-textarea{background:transparent;border-color:color-mix(in srgb,var(--bg) 40%,transparent);color:var(--bg)}
.gri-custom .gri-input:hover,.gri-custom .gri-select:hover,.gri-custom .gri-textarea:hover{border-color:var(--bg)}
.gri-custom .gri-select{background-repeat:no-repeat;background-position:right 14px center;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.5l5 5 5-5' fill='none' stroke='%23F7F5F0' stroke-width='1.4'/></svg>")}
.gri-custom .gri-select option{color:#20201E}
.gri-custom .gri-rc span{background:transparent;border-color:color-mix(in srgb,var(--bg) 40%,transparent)}
.gri-custom .gri-rc:hover span{border-color:var(--bg)}
.gri-custom .gri-rc input:checked + span{background:var(--bg);color:var(--ink);border-color:var(--bg)}
.gri-custom .gri-rc input:focus-visible + span{outline-color:#fff}
.gri-custom .gri-err{color:#FFB4A9}
.gri-custom .gri-help{color:color-mix(in srgb,var(--bg) 70%,var(--ink))}
.gri-custom ::placeholder{color:color-mix(in srgb,var(--bg) 55%,var(--ink));opacity:1}

/* cómo trabajamos */
.gri-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:clamp(32px,5vw,64px);border-top:1px solid var(--ink)}
.gri-step{padding:22px clamp(0px,2vw,28px) 8px 0;display:grid;gap:12px;align-content:start}
.gri-step + .gri-step{padding-left:clamp(0px,2vw,28px);border-left:1px solid var(--line)}
.gri-step-n{font-family:var(--serif);font-size:clamp(44px,5vw,72px);line-height:1;color:var(--accent-ink);font-weight:400}
.gri-step h3{font-size:18px;font-weight:500}
.gri-step p{color:var(--muted);max-width:34ch}
.gri[data-bp="sm"] .gri-steps,.gri[data-bp="md"] .gri-steps{grid-template-columns:minmax(0,1fr)}
.gri[data-bp="sm"] .gri-step,.gri[data-bp="md"] .gri-step{padding:20px 0;border-bottom:1px solid var(--line);grid-template-columns:72px 1fr;gap:4px 16px}
.gri[data-bp="sm"] .gri-step + .gri-step,.gri[data-bp="md"] .gri-step + .gri-step{padding-left:0;border-left:0}
.gri[data-bp="sm"] .gri-step-n,.gri[data-bp="md"] .gri-step-n{grid-row:span 2;font-size:48px}

/* FAQ */
.gri-faq{background:var(--surface)}
.gri-faq-list{border-top:1px solid var(--ink)}
.gri-faq-item{border-bottom:1px solid var(--line)}
.gri-faq-item summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:64px;padding:12px 0;font-family:var(--serif);font-size:clamp(20px,2vw,26px);font-weight:500;line-height:1.15}
.gri-faq-item summary::-webkit-details-marker{display:none}
.gri-faq-item summary::after{content:"+";font-family:var(--sans);font-size:24px;font-weight:300;flex:none;transition:transform .2s}
.gri-faq-item[open] summary::after{transform:rotate(45deg)}
.gri-faq-item p{padding:0 40px 22px 0;color:var(--muted);max-width:62ch;white-space:pre-line}

/* contacto */
.gri-contact{background:var(--accent);color:#fff}
.gri-contact .gri-eyebrow{color:#fff}
.gri-contact .gri-lead{color:#fff;opacity:.92}
.gri-contact .gri-h2 em{color:#fff}
.gri-contact-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.gri-contact .gri-btn{background:#fff;color:var(--ink);border-color:#fff}
.gri-contact .gri-btn:hover{background:transparent;color:#fff}
.gri-contact .gri-btn--ghost{background:transparent;color:#fff;border-color:#fff}
.gri-contact .gri-btn--ghost:hover{background:#fff;color:var(--ink)}
.gri-contact :focus-visible{outline-color:#fff}
.gri-ig{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.gri-ig a{display:block;aspect-ratio:1;overflow:hidden;background:rgba(255,255,255,.15)}
.gri-ig .gri-img{transition:transform .5s}
.gri-ig a:hover .gri-img{transform:scale(1.05)}
.gri-handle{font-family:var(--serif);font-size:clamp(34px,5vw,64px);line-height:1;font-weight:500;text-decoration:none;display:inline-block;border-bottom:1px solid rgba(255,255,255,.6)}
.gri-handle-card{border:1px solid rgba(255,255,255,.55);padding:clamp(22px,3vw,40px);display:grid;gap:14px;align-content:center;min-height:260px}

/* footer */
.gri-footer{background:var(--ink);color:var(--bg);padding-block:36px 28px;font-size:14px}
.gri-footer-top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-start;padding-bottom:24px;border-bottom:1px solid rgba(247,245,240,.2)}
.gri-footer nav,.gri-footer-links{display:flex;gap:8px 24px;flex-wrap:wrap}
.gri-footer a{text-decoration:none}
.gri-footer a:hover{text-decoration:underline;text-underline-offset:3px}
.gri-footer-bottom{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:18px;color:color-mix(in srgb,var(--bg) 68%,var(--ink));font-size:13px}
.gri-footer-bottom button{background:none;border:0;padding:0;text-decoration:underline;text-underline-offset:3px;color:inherit;font-size:13px}
.gri-footer .gri-logo{font-size:22px}
.gri-footer .gri-logo span{color:#C9CCB4}

/* panel de administración */
.gri-admin{background:var(--bg);min-height:70vh}
.gri-admin-bar{background:var(--ink);color:var(--bg);padding-block:12px}
.gri-admin-bar .gri-wrap{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.gri-admin-bar .gri-btn{min-height:38px;font-size:13px;padding:0 14px}
.gri-admin-body{padding-block:clamp(24px,4vw,48px)}
.gri-admin h1{font-family:var(--serif);font-weight:500;font-size:clamp(30px,4vw,44px);line-height:1.05}
.gri-admin h2{font-family:var(--serif);font-weight:500;font-size:clamp(24px,3vw,32px);line-height:1.1}
.gri-tabs{display:flex;gap:6px;border-bottom:1px solid var(--line);margin:20px 0 24px}
.gri-tab{background:none;border:0;border-bottom:2px solid transparent;padding:12px 16px;font-size:15px;min-height:46px;margin-bottom:-1px}
.gri-tab[aria-selected="true"]{border-bottom-color:var(--ink);font-weight:600}
.gri-panel{background:var(--surface);border:1px solid var(--line);padding:clamp(16px,3vw,28px)}
.gri-login{max-width:420px;margin:clamp(24px,8vw,96px) auto;display:grid;gap:18px}
.gri-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:16px}
.gri-arow{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
.gri-arow:last-child{border-bottom:0}
.gri-arow-thumb{width:64px;aspect-ratio:4/5;background:var(--soft);overflow:hidden}
.gri-arow-main{min-width:0;display:grid;gap:2px}
.gri-arow-name{font-weight:600;overflow:hidden;text-overflow:ellipsis}
.gri-arow-sub{font-size:13px;color:var(--muted)}
.gri-arow-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
.gri-arow-actions .gri-select{min-height:40px;font-size:14px;width:auto;padding-right:32px}
.gri-iconbtn{min-width:40px;min-height:40px;padding:0 10px;border:1px solid color-mix(in srgb,var(--ink) 25%,transparent);background:transparent;border-radius:2px;font-size:13px}
.gri-iconbtn:hover{background:var(--ink);color:var(--bg)}
.gri-iconbtn[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.gri-iconbtn[disabled]{opacity:.35;pointer-events:none}
.gri-confirm{grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#FBF1EF;border:1px solid #8A2B22;padding:12px 14px;font-size:14px}
.gri[data-bp="sm"] .gri-arow{grid-template-columns:56px minmax(0,1fr)}
.gri[data-bp="sm"] .gri-arow-thumb{width:56px}
.gri[data-bp="sm"] .gri-arow-actions{grid-column:1/-1;justify-content:flex-start}
.gri-fgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.gri-fgrid .full{grid-column:1/-1}
.gri[data-bp="sm"] .gri-fgrid{grid-template-columns:minmax(0,1fr)}
.gri-fsec{border-top:1px solid var(--line);padding-top:22px;margin-top:26px;display:grid;gap:18px}
.gri-fsec>h3{font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
.gri-admin .gri-field>label{font-size:13px;letter-spacing:0;text-transform:none;font-weight:600}
.gri-admin .gri-opt-label{letter-spacing:0;text-transform:none;font-size:13px;font-weight:600}
.gri-checks{display:flex;gap:10px 22px;flex-wrap:wrap}
.gri-check{display:inline-flex;gap:10px;align-items:center;min-height:44px;font-size:15px;cursor:pointer}
.gri-check input{width:20px;height:20px;margin:0;accent-color:var(--ink)}
.gri-imglist{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
.gri-imgitem{border:1px solid var(--line);background:var(--bg);display:grid}
.gri-imgitem .pic{aspect-ratio:4/5;overflow:hidden;background:var(--soft);position:relative}
.gri-imgitem .btns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid var(--line)}
.gri-imgitem .btns button{min-height:40px;border:0;background:none;font-size:12px}
.gri-imgitem .btns button + button{border-left:1px solid var(--line)}
.gri-imgitem .btns button:hover{background:var(--ink);color:var(--bg)}
.gri-imgitem .btns button[disabled]{opacity:.4;pointer-events:none}
.gri-cfrow{display:grid;grid-template-columns:1.2fr .8fr 1.6fr auto auto;gap:10px;align-items:end;padding:14px;border:1px solid var(--line);background:var(--bg)}
.gri[data-bp="sm"] .gri-cfrow,.gri[data-bp="md"] .gri-cfrow{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.gri-formbar{position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--line);padding:14px 0;margin-top:26px;display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;align-items:center}
.gri-spin{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:gri-rot .7s linear infinite;display:inline-block;flex:none}
@keyframes gri-rot{to{transform:rotate(360deg)}}

@media (prefers-reduced-motion:reduce){
  .gri *,.gri *::before,.gri *::after,.gri-overlay,.gri-modal{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
}
`

/* =====================================================================
   8. PIEZAS DE INTERFAZ
   ===================================================================== */

const Svg = (p: { children: React.ReactNode; className?: string }) => (
    <svg
        className={p.className || "gri-ico"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        {p.children}
    </svg>
)
const IconChat = () => (
    <Svg>
        <path d="M4 20l1.4-4.2A8 8 0 1 1 8.3 18.8L4 20z" />
        <path d="M9 10h6M9 13.5h4" />
    </Svg>
)
const IconSearch = () => (
    <Svg>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
    </Svg>
)
const IconClose = () => (
    <Svg>
        <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
)
const IconMenu = () => (
    <Svg>
        <path d="M4 8h16M4 16h16" />
    </Svg>
)
const IconArrow = () => (
    <Svg>
        <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
)
const IconImage = () => (
    <Svg>
        <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
    </Svg>
)
const IconAlert = () => (
    <Svg className="gri-ico">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8v5M12 16.2v.1" />
    </Svg>
)

function Placeholder({ label = "Sin foto" }: { label?: string }) {
    return (
        <div className="gri-ph" role="img" aria-label={label}>
            <IconImage />
            <span>{label}</span>
        </div>
    )
}

function Photo({
    src,
    alt,
    eager,
    label,
}: {
    src?: string
    alt: string
    eager?: boolean
    label?: string
}) {
    const [failed, setFailed] = useState(false)
    useEffect(() => setFailed(false), [src])
    if (!src || failed) return <Placeholder label={label} />
    return (
        <img
            className="gri-img"
            src={src}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setFailed(true)}
        />
    )
}

function Notice({
    kind = "info",
    children,
}: {
    kind?: "info" | "err" | "ok"
    children: React.ReactNode
}) {
    return (
        <div
            className={
                "gri-notice" +
                (kind === "err"
                    ? " gri-notice--err"
                    : kind === "ok"
                      ? " gri-notice--ok"
                      : "")
            }
            role={kind === "err" ? "alert" : "status"}
        >
            {kind === "err" && <IconAlert />}
            <div>{children}</div>
        </div>
    )
}

function FieldError({
    id,
    children,
}: {
    id?: string
    children?: React.ReactNode
}) {
    if (!children) return null
    return (
        <p className="gri-err" role="alert" id={id}>
            <IconAlert />
            <span>{children}</span>
        </p>
    )
}

interface Opt {
    value: string
    label: string
}

function ChipGroup(props: {
    name: string
    legend: string
    hint?: string
    options: Opt[]
    value: string
    onChange: (v: string) => void
    error?: string
}) {
    return (
        <fieldset
            className="gri-opt"
            data-invalid={props.error ? "true" : undefined}
        >
            <legend>
                <span>{props.legend}</span>
                {props.hint && <small>{props.hint}</small>}
            </legend>
            <div className="gri-radios">
                {props.options.map((o) => (
                    <label className="gri-rc" key={o.value}>
                        <input
                            type="radio"
                            name={props.name}
                            value={o.value}
                            checked={props.value === o.value}
                            onChange={() => props.onChange(o.value)}
                        />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>
            <FieldError>{props.error}</FieldError>
        </fieldset>
    )
}

function scrollToSection(id: string, reduce: boolean) {
    if (typeof document === "undefined") return
    const el = document.getElementById("gri-" + id)
    if (el)
        el.scrollIntoView({
            behavior: reduce ? "auto" : "smooth",
            block: "start",
        })
}

/* =====================================================================
   9. SECCIONES DE LA LANDING
   ===================================================================== */

interface NavItem {
    id: string
    label: string
}

function TopBar({ text }: { text: string }) {
    return (
        <div className="gri-topbar" role="note">
            {text}
        </div>
    )
}

function Header(props: {
    brand: string
    nav: NavItem[]
    onNav: (id: string) => void
    waHref: string
}) {
    const [open, setOpen] = useState(false)
    const [first, ...rest] = props.brand.trim().split(/\s+/)
    const go = (e: React.MouseEvent, id: string) => {
        e.preventDefault()
        setOpen(false)
        props.onNav(id)
    }
    return (
        <header
            className="gri-header"
            onKeyDown={(e) => {
                if (e.key === "Escape" && open) setOpen(false)
            }}
        >
            <div className="gri-wrap">
                <div className="gri-header-in">
                    <a
                        className="gri-logo"
                        href="#gri-inicio"
                        onClick={(e) => go(e, "inicio")}
                        aria-label={props.brand + " — ir al inicio"}
                    >
                        {(first || "GRI").toUpperCase()}
                        {rest.length > 0 && <span>{rest.join(" ")}</span>}
                    </a>
                    <nav className="gri-nav" aria-label="Principal">
                        {props.nav.map((n) => (
                            <a
                                key={n.id}
                                href={"#gri-" + n.id}
                                onClick={(e) => go(e, n.id)}
                            >
                                {n.label}
                            </a>
                        ))}
                    </nav>
                    <div className="gri-header-actions">
                        <a
                            className="gri-btn gri-btn--ghost gri-btn--sm gri-header-wa"
                            href={props.waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Escribir por WhatsApp"
                        >
                            <IconChat />
                            <span className="gri-header-wa-text">WhatsApp</span>
                        </a>
                        <button
                            type="button"
                            className="gri-burger"
                            aria-expanded={open}
                            aria-controls="gri-mobilenav"
                            aria-label={open ? "Cerrar menú" : "Abrir menú"}
                            onClick={() => setOpen((o) => !o)}
                        >
                            {open ? <IconClose /> : <IconMenu />}
                        </button>
                    </div>
                </div>
            </div>
            {open && (
                <nav
                    className="gri-mobilenav"
                    id="gri-mobilenav"
                    aria-label="Menú"
                >
                    <div className="gri-wrap">
                        {props.nav.map((n) => (
                            <a
                                key={n.id}
                                href={"#gri-" + n.id}
                                onClick={(e) => go(e, n.id)}
                            >
                                {n.label}
                            </a>
                        ))}
                    </div>
                </nav>
            )}
        </header>
    )
}

function Hero(props: {
    eyebrow: string
    title: string
    accent: string
    text: string
    image?: string
    imageAlt: string
    showCustom: boolean
    onNav: (id: string) => void
}) {
    return (
        <section className="gri-hero" id="gri-inicio" aria-label="Presentación">
            <div className="gri-wrap">
                <div className="gri-hero-grid">
                    <div className="gri-hero-copy">
                        {props.eyebrow && (
                            <p className="gri-eyebrow">{props.eyebrow}</p>
                        )}
                        <h1
                            className="gri-hero-title"
                            style={{ marginTop: props.eyebrow ? 22 : 0 }}
                        >
                            {props.title}
                            {props.accent && <em>{props.accent}</em>}
                        </h1>
                        <p className="gri-hero-text">{props.text}</p>
                        <div className="gri-hero-cta">
                            <a
                                className="gri-btn"
                                href="#gri-coleccion"
                                onClick={(e) => {
                                    e.preventDefault()
                                    props.onNav("coleccion")
                                }}
                            >
                                Explorar joyas <IconArrow />
                            </a>
                            {props.showCustom && (
                                <a
                                    className="gri-btn gri-btn--ghost"
                                    href="#gri-personalizados"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        props.onNav("personalizados")
                                    }}
                                >
                                    Crear una pieza personalizada
                                </a>
                            )}
                        </div>
                        <ul className="gri-hero-facts" aria-label="Datos clave">
                            <li>Oro y plata</li>
                            <li>Consultas por WhatsApp</li>
                            <li>Uruguay</li>
                        </ul>
                    </div>
                    <div className="gri-hero-media">
                        <div className="gri-hero-photo">
                            <Photo
                                src={props.image}
                                alt={props.imageAlt}
                                eager
                                label="Foto del hero · reemplazable"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

function ProductCard({
    p,
    onOpen,
}: {
    p: Product
    onOpen: (p: Product) => void
}) {
    const mat = productMaterialText(p)
    return (
        <li>
            <button
                type="button"
                className="gri-card"
                data-av={p.availability}
                onClick={() => onOpen(p)}
            >
                <div className="gri-card-media">
                    <Photo src={p.images[0]?.url} alt={p.name} />
                    {p.availability !== "disponible" && (
                        <span className="gri-tag">
                            {AVAILABILITY_LABEL[p.availability]}
                        </span>
                    )}
                    {p.demo && (
                        <span className="gri-tag gri-tag--demo">Ejemplo</span>
                    )}
                </div>
                <div className="gri-card-body">
                    <span className="gri-card-name">{p.name}</span>
                    <span className="gri-card-meta">
                        <span>{mat}</span>
                        {p.price !== null && (
                            <span className="gri-card-price">
                                {formatPrice(p.price, p.currency)}
                            </span>
                        )}
                    </span>
                    <span className="gri-card-wa">
                        <IconChat /> Consultá por WhatsApp
                    </span>
                </div>
            </button>
        </li>
    )
}

type CatalogApi = ReturnType<typeof useCatalog>

function Catalog(props: {
    catalog: CatalogApi
    problem: string
    onOpen: (p: Product) => void
}) {
    const { products, categories, status, error, reload } = props.catalog
    const [category, setCategory] = useState("todas")
    const [material, setMaterial] = useState("todos")
    const [query, setQuery] = useState("")
    const [sort, setSort] = useState<SortKey>("destacados")

    const usedCategories = useMemo(
        () =>
            categories.filter((c) =>
                products.some((p) => p.category_slug === c.slug)
            ),
        [categories, products]
    )
    const materials = useMemo(() => {
        const labels = new Map<string, string>()
        for (const p of products)
            for (const m of [p.material || "", ...p.material_options]) {
                const k = normalize(m)
                if (!k) continue
                if (!labels.has(k))
                    labels.set(
                        k,
                        BASE_MATERIALS.includes(k)
                            ? materialLabel(k)
                            : capitalize(m.trim())
                    )
            }
        const keys = [
            ...BASE_MATERIALS.filter((k) => labels.has(k)),
            ...Array.from(labels.keys()).filter(
                (k) => !BASE_MATERIALS.includes(k)
            ),
        ]
        return keys.map((k) => ({ key: k, label: labels.get(k) || k }))
    }, [products])

    useEffect(() => {
        if (
            category !== "todas" &&
            !usedCategories.some((c) => c.slug === category)
        )
            setCategory("todas")
        if (material !== "todos" && !materials.some((m) => m.key === material))
            setMaterial("todos")
    }, [usedCategories, materials, category, material])

    const list = useMemo(
        () =>
            filterAndSort(products, categories, {
                category,
                material,
                query,
                sort,
            }),
        [products, categories, category, material, query, sort]
    )
    const filtering =
        category !== "todas" || material !== "todos" || query.trim() !== ""
    const clear = () => {
        setCategory("todas")
        setMaterial("todos")
        setQuery("")
    }
    const sortKeys = Object.keys(SORT_LABEL) as SortKey[]

    return (
        <section
            className="gri-section gri-catalog"
            id="gri-coleccion"
            aria-labelledby="gri-h-coleccion"
        >
            <div className="gri-wrap">
                <div className="gri-cat-head">
                    <div>
                        <p className="gri-eyebrow">01 — Colección</p>
                        <h2 className="gri-h2" id="gri-h-coleccion">
                            Descubrí la <em>colección</em>
                        </h2>
                    </div>
                    {status !== "loading" && status !== "error" && (
                        <p className="gri-count" aria-live="polite">
                            {list.length}{" "}
                            {list.length === 1 ? "pieza" : "piezas"}
                        </p>
                    )}
                </div>

                {status === "demo" && (
                    <div className="gri-demo" role="note">
                        <div>
                            <strong>Modo demostración.</strong> Las piezas que
                            ves son ficticias y sirven para probar el diseño.
                            {props.problem
                                ? " " + props.problem
                                : " Cuando conectes Supabase, acá aparece el stock real."}{" "}
                            Desde acá no se pueden enviar consultas por estas
                            piezas.
                        </div>
                    </div>
                )}

                {status === "error" && (
                    <div className="gri-empty" role="alert">
                        <h3>No pudimos cargar el catálogo</h3>
                        <p>{error}</p>
                        <button
                            type="button"
                            className="gri-btn"
                            onClick={reload}
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {status === "loading" && (
                    <div aria-busy="true" aria-live="polite">
                        <p className="gri-sr">Cargando catálogo…</p>
                        <div className="gri-grid" aria-hidden="true">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i}>
                                    <div className="gri-skel" />
                                    <div
                                        className="gri-skel"
                                        style={{
                                            height: 14,
                                            aspectRatio: "auto",
                                            marginTop: 14,
                                            width: "70%",
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(status === "ready" || status === "demo") &&
                    products.length === 0 && (
                        <div className="gri-empty">
                            <h3>Estamos cargando las piezas</h3>
                            <p>
                                Todavía no hay joyas publicadas en el catálogo.
                                Volvé pronto o escribinos por WhatsApp y te
                                mostramos lo que tenemos.
                            </p>
                        </div>
                    )}

                {(status === "ready" || status === "demo") &&
                    products.length > 0 && (
                        <>
                            <div className="gri-controls">
                                <div className="gri-controls-row">
                                    <div className="gri-search">
                                        <label
                                            className="gri-sr"
                                            htmlFor="gri-q"
                                        >
                                            Buscar joyas
                                        </label>
                                        <IconSearch />
                                        <input
                                            id="gri-q"
                                            className="gri-input"
                                            type="search"
                                            placeholder="Buscar por nombre, categoría o material"
                                            value={query}
                                            onChange={(e) =>
                                                setQuery(e.target.value)
                                            }
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="gri-sort">
                                        <label
                                            className="gri-sr"
                                            htmlFor="gri-sort"
                                        >
                                            Ordenar por
                                        </label>
                                        <select
                                            id="gri-sort"
                                            className="gri-select"
                                            value={sort}
                                            onChange={(e) =>
                                                setSort(
                                                    e.target.value as SortKey
                                                )
                                            }
                                        >
                                            {sortKeys.map((k) => (
                                                <option key={k} value={k}>
                                                    {SORT_LABEL[k]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div
                                    className="gri-filter-group"
                                    role="group"
                                    aria-label="Categoría"
                                >
                                    <span
                                        className="gri-filter-label"
                                        aria-hidden="true"
                                    >
                                        Categoría
                                    </span>
                                    <div className="gri-chips">
                                        <button
                                            type="button"
                                            className="gri-chip"
                                            aria-pressed={category === "todas"}
                                            onClick={() => setCategory("todas")}
                                        >
                                            Todas las joyas
                                        </button>
                                        {usedCategories.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className="gri-chip"
                                                aria-pressed={
                                                    category === c.slug
                                                }
                                                onClick={() =>
                                                    setCategory(c.slug)
                                                }
                                            >
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {materials.length > 0 && (
                                    <div
                                        className="gri-filter-group"
                                        role="group"
                                        aria-label="Material"
                                    >
                                        <span
                                            className="gri-filter-label"
                                            aria-hidden="true"
                                        >
                                            Material
                                        </span>
                                        <div className="gri-chips">
                                            <button
                                                type="button"
                                                className="gri-chip"
                                                aria-pressed={
                                                    material === "todos"
                                                }
                                                onClick={() =>
                                                    setMaterial("todos")
                                                }
                                            >
                                                Todos
                                            </button>
                                            {materials.map((m) => (
                                                <button
                                                    key={m.key}
                                                    type="button"
                                                    className="gri-chip"
                                                    aria-pressed={
                                                        material === m.key
                                                    }
                                                    onClick={() =>
                                                        setMaterial(m.key)
                                                    }
                                                >
                                                    {m.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {list.length === 0 ? (
                                <div className="gri-empty">
                                    <h3>
                                        No encontramos piezas con esos filtros
                                    </h3>
                                    <p>
                                        Probá con otra búsqueda o quitá algún
                                        filtro. Si no ves lo que buscás,
                                        escribinos: quizás lo tenemos o lo
                                        podemos conseguir.
                                    </p>
                                    {filtering && (
                                        <button
                                            type="button"
                                            className="gri-btn gri-btn--ghost"
                                            onClick={clear}
                                        >
                                            Limpiar filtros
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <ul
                                    className="gri-grid"
                                    key={category + "|" + material + "|" + sort}
                                >
                                    {list.map((p) => (
                                        <ProductCard
                                            key={p.id}
                                            p={p}
                                            onOpen={props.onOpen}
                                        />
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
            </div>
        </section>
    )
}

/* ---------- Ficha de producto ---------- */

function ProductModal(props: {
    product: Product
    brand: string
    whatsapp: string
    categories: Category[]
    onClose: () => void
    bp: Breakpoint
    rootStyle: React.CSSProperties
}) {
    const p = props.product
    const [sel, setSel] = useState<Selection>(() => emptySelection(p))
    const [attempted, setAttempted] = useState(false)
    const [imgIdx, setImgIdx] = useState(0)
    const dialogRef = useRef<HTMLDivElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const prev = document.activeElement as HTMLElement | null
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        closeRef.current?.focus()
        return () => {
            document.body.style.overflow = prevOverflow
            if (prev && typeof prev.focus === "function") prev.focus()
        }
    }, [])

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.stopPropagation()
            props.onClose()
            return
        }
        if (e.key !== "Tab" || !dialogRef.current) return
        const f = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
                'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
            )
        ).filter(
            (el) => el.offsetParent !== null || el === document.activeElement
        )
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first.focus()
        }
    }

    const errors = validateSelection(p, sel)
    const shown = attempted ? errors : {}
    const href = waUrl(props.whatsapp, buildProductMessage(props.brand, p, sel))
    const catName = p.category_slug
        ? props.categories.find((c) => c.slug === p.category_slug)?.name
        : ""
    const setExtra = (id: string, v: string) =>
        setSel((s) => ({ ...s, extras: { ...s.extras, [id]: v } }))
    const images = p.images
    const current = images[Math.min(imgIdx, Math.max(images.length - 1, 0))]

    const onCta = (e: React.MouseEvent) => {
        if (Object.keys(errors).length > 0) {
            e.preventDefault()
            setAttempted(true)
            setTimeout(() => {
                const el = dialogRef.current?.querySelector<HTMLElement>(
                    '[data-invalid="true"] input, [data-invalid="true"] select, [data-invalid="true"]'
                )
                el?.scrollIntoView({ block: "center" })
                el?.focus?.()
            }, 0)
        }
    }

    const material = (() => {
        if (p.material_options.length > 1)
            return (
                <ChipGroup
                    name={"mat-" + p.id}
                    legend="Material"
                    hint="Elegí una opción"
                    options={p.material_options.map((m) => ({
                        value: m,
                        label: materialLabel(m, "variante"),
                    }))}
                    value={sel.material}
                    onChange={(v) => setSel((s) => ({ ...s, material: v }))}
                    error={shown.material}
                />
            )
        const text = productMaterialText(p)
        return text ? (
            <div className="gri-fixed">
                <span>Material</span>
                <strong>{text}</strong>
            </div>
        ) : null
    })()

    return createPortal(
        <div
            className="gri gri-portal"
            data-bp={props.bp}
            style={{
                ...props.rootStyle,
                background: "transparent",
                width: 0,
                height: 0,
            }}
        >
            <div
                className="gri-overlay"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) props.onClose()
                }}
                onKeyDown={onKeyDown}
            >
                <div
                    className="gri-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="gri-m-title"
                    ref={dialogRef}
                >
                    <button
                        type="button"
                        className="gri-modal-close"
                        onClick={props.onClose}
                        ref={closeRef}
                        aria-label="Cerrar ficha"
                    >
                        <IconClose />
                    </button>

                    <div className="gri-gallery">
                        <div className="gri-gallery-main">
                            <Photo
                                src={current?.url}
                                alt={p.name}
                                eager
                                label="Sin foto"
                            />
                        </div>
                        {images.length > 1 && (
                            <div
                                className="gri-thumbs"
                                role="group"
                                aria-label="Fotos de la pieza"
                            >
                                {images.map((im, i) => (
                                    <button
                                        key={im.url + i}
                                        type="button"
                                        className="gri-thumb"
                                        aria-pressed={i === imgIdx}
                                        aria-label={`Ver foto ${i + 1} de ${images.length}`}
                                        onClick={() => setImgIdx(i)}
                                    >
                                        <Photo src={im.url} alt="" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="gri-info">
                        <div className="gri-info-top">
                            {(catName || p.sku) && (
                                <p className="gri-sku">
                                    {[catName, p.sku ? "Cód. " + p.sku : ""]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </p>
                            )}
                            <h2 id="gri-m-title">{p.name}</h2>
                            {p.price !== null && (
                                <p className="gri-price">
                                    {formatPrice(p.price, p.currency)}
                                </p>
                            )}
                            <div className="gri-badges">
                                <span className="gri-badge">
                                    {AVAILABILITY_LABEL[p.availability]}
                                </span>
                                {p.demo && (
                                    <span className="gri-badge gri-badge--soft">
                                        Pieza de ejemplo
                                    </span>
                                )}
                            </div>
                        </div>

                        {p.availability === "agotado" && (
                            <Notice>
                                Esta pieza figura como agotada. Igual podés
                                consultarnos por ella.
                            </Notice>
                        )}
                        {p.availability === "por_encargo" && (
                            <Notice>
                                Esta pieza se trabaja por encargo. Consultanos
                                por los tiempos y detalles.
                            </Notice>
                        )}
                        {p.description.trim() && (
                            <p className="gri-desc">{p.description}</p>
                        )}

                        {material}

                        {p.ring_sizes.length > 0 && (
                            <div className="gri-stack">
                                <ChipGroup
                                    name={"size-" + p.id}
                                    legend="Talle"
                                    hint={
                                        p.requires_size
                                            ? "Obligatorio"
                                            : "Opcional"
                                    }
                                    options={[...p.ring_sizes, NO_SIZE].map(
                                        (s) => ({ value: s, label: s })
                                    )}
                                    value={sel.size}
                                    onChange={(v) =>
                                        setSel((s) => ({ ...s, size: v }))
                                    }
                                    error={shown.size}
                                />
                                <details className="gri-help">
                                    <summary>¿Cómo confirmo mi talle?</summary>
                                    <p>
                                        Si no estás segura/o, elegí “{NO_SIZE}”
                                        y lo confirmamos por WhatsApp antes de
                                        avanzar.
                                    </p>
                                </details>
                            </div>
                        )}

                        {p.engraving_enabled && (
                            <div className="gri-stack">
                                <ChipGroup
                                    name={"eng-" + p.id}
                                    legend="Grabado"
                                    options={[
                                        { value: "none", label: "Sin grabado" },
                                        { value: "yes", label: "Con grabado" },
                                    ]}
                                    value={sel.engraving}
                                    onChange={(v) =>
                                        setSel((s) => ({
                                            ...s,
                                            engraving:
                                                v === "yes" ? "yes" : "none",
                                        }))
                                    }
                                />
                                {sel.engraving === "yes" && (
                                    <div
                                        className="gri-field"
                                        data-invalid={
                                            shown.engraving ? "true" : undefined
                                        }
                                    >
                                        <label htmlFor="gri-engr">
                                            Texto del grabado
                                        </label>
                                        <input
                                            id="gri-engr"
                                            className="gri-input"
                                            type="text"
                                            maxLength={p.engraving_max}
                                            value={sel.engravingText}
                                            onChange={(e) =>
                                                setSel((s) => ({
                                                    ...s,
                                                    engravingText:
                                                        e.target.value,
                                                }))
                                            }
                                            aria-invalid={
                                                shown.engraving
                                                    ? true
                                                    : undefined
                                            }
                                            autoComplete="off"
                                        />
                                        <div
                                            className="gri-counter"
                                            aria-live="polite"
                                        >
                                            {sel.engravingText.length}/
                                            {p.engraving_max} caracteres
                                        </div>
                                        <FieldError>
                                            {shown.engraving}
                                        </FieldError>
                                    </div>
                                )}
                                {sel.engraving === "yes" && (
                                    <p className="gri-help">
                                        La viabilidad y el precio final del
                                        grabado se confirman con {props.brand}.
                                    </p>
                                )}
                            </div>
                        )}

                        {p.custom_fields.map((f) => {
                            const err = shown["extra:" + f.id]
                            const val = sel.extras[f.id] || ""
                            if (f.type === "select" && f.options.length <= 8)
                                return (
                                    <ChipGroup
                                        key={f.id}
                                        name={`x-${p.id}-${f.id}`}
                                        legend={f.label}
                                        hint={
                                            f.required
                                                ? "Obligatorio"
                                                : "Opcional"
                                        }
                                        options={f.options.map((o) => ({
                                            value: o,
                                            label: o,
                                        }))}
                                        value={val}
                                        onChange={(v) => setExtra(f.id, v)}
                                        error={err}
                                    />
                                )
                            return (
                                <div
                                    className="gri-field"
                                    key={f.id}
                                    data-invalid={err ? "true" : undefined}
                                >
                                    <label htmlFor={`gri-x-${f.id}`}>
                                        {f.label}{" "}
                                        <small>
                                            {f.required
                                                ? "(obligatorio)"
                                                : "(opcional)"}
                                        </small>
                                    </label>
                                    {f.type === "select" ? (
                                        <select
                                            id={`gri-x-${f.id}`}
                                            className="gri-select"
                                            value={val}
                                            onChange={(e) =>
                                                setExtra(f.id, e.target.value)
                                            }
                                        >
                                            <option value="">
                                                Elegí una opción
                                            </option>
                                            {f.options.map((o) => (
                                                <option key={o} value={o}>
                                                    {o}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            id={`gri-x-${f.id}`}
                                            className="gri-input"
                                            type="text"
                                            maxLength={140}
                                            value={val}
                                            onChange={(e) =>
                                                setExtra(f.id, e.target.value)
                                            }
                                            autoComplete="off"
                                        />
                                    )}
                                    <FieldError>{err}</FieldError>
                                </div>
                            )
                        })}

                        <div className="gri-cta-bar">
                            {p.demo ? (
                                <>
                                    <button
                                        type="button"
                                        className="gri-btn gri-btn--wa"
                                        disabled
                                        aria-disabled="true"
                                    >
                                        <IconChat /> Consultar por WhatsApp
                                    </button>
                                    <p className="gri-cta-note">
                                        Pieza de ejemplo (modo demostración): no
                                        se puede enviar la consulta.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <a
                                        className="gri-btn gri-btn--wa"
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={onCta}
                                    >
                                        <IconChat /> Consultar por WhatsApp
                                    </a>
                                    {attempted &&
                                    Object.keys(errors).length > 0 ? (
                                        <p className="gri-err" role="alert">
                                            <IconAlert />{" "}
                                            <span>
                                                Completá los datos marcados para
                                                continuar.
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="gri-cta-note">
                                            Se abre WhatsApp con el mensaje ya
                                            armado. Confirmamos disponibilidad y
                                            precio final.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}

/* ---------- Pedidos personalizados ---------- */

const PIECE_TYPES = [
    "Anillo",
    "Cadena o collar",
    "Pulsera",
    "Caravanas o aros",
    "Dije o colgante",
    "Orfebrería en plata u oro",
    "Reparación de joyería",
    "Joyería criolla",
    "Mate",
    "Bombilla",
    "Cuchilla",
    "Rebenque",
    "Otro",
]

function CustomOrder(props: {
    brand: string
    whatsapp: string
    intro: string
}) {
    const [r, setR] = useState<CustomRequest>({
        type: "",
        material: "",
        idea: "",
        reference: "",
        budget: "",
        name: "",
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [sent, setSent] = useState("")
    const set = (k: keyof CustomRequest, v: string) =>
        setR((s) => ({ ...s, [k]: v }))

    const submit = (e: React.FormEvent) => {
        e.preventDefault()
        const err: Record<string, string> = {}
        if (!r.type) err.type = "Elegí qué tipo de pieza buscás."
        if (r.idea.trim().length < 5)
            err.idea = "Contanos tu idea, aunque sea en pocas palabras."
        if (
            r.reference.trim() &&
            !/^(https?:\/\/|www\.)\S+$/i.test(r.reference.trim()) &&
            r.reference.trim().length > 200
        )
            err.reference = "La referencia es demasiado larga."
        setErrors(err)
        if (Object.keys(err).length) {
            setTimeout(() => {
                document
                    .querySelector<HTMLElement>(
                        "#gri-personalizados [data-invalid='true'] select, #gri-personalizados [data-invalid='true'] textarea"
                    )
                    ?.focus()
            }, 0)
            return
        }
        const url = waUrl(props.whatsapp, buildCustomMessage(props.brand, r))
        setSent(url)
        openExternal(url)
    }

    return (
        <section
            className="gri-section gri-custom"
            id="gri-personalizados"
            aria-labelledby="gri-h-pers"
        >
            <div className="gri-wrap">
                <div className="gri-split">
                    <div className="gri-stack">
                        <p className="gri-eyebrow">03 — Personalizados</p>
                        <h2 className="gri-h2" id="gri-h-pers">
                            ¿Tenés una idea? <em>Hablemos</em>
                        </h2>
                        <p className="gri-lead">{props.intro}</p>
                    </div>
                    <form className="gri-form" onSubmit={submit} noValidate>
                        <div
                            className="gri-field"
                            data-invalid={errors.type ? "true" : undefined}
                        >
                            <label htmlFor="gri-c-type">
                                Tipo de pieza o trabajo
                            </label>
                            <select
                                id="gri-c-type"
                                className="gri-select"
                                value={r.type}
                                onChange={(e) => set("type", e.target.value)}
                                aria-invalid={errors.type ? true : undefined}
                            >
                                <option value="">Elegí una opción</option>
                                {PIECE_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                            <FieldError>{errors.type}</FieldError>
                        </div>
                        <div className="full">
                            <ChipGroup
                                name="gri-c-mat"
                                legend="Material preferido / metal del trabajo"
                                hint="Opcional"
                                options={[
                                    "Oro",
                                    "Plata",
                                    "Combinado",
                                    "Otro",
                                ].map((m) => ({ value: m, label: m }))}
                                value={r.material}
                                onChange={(v) => set("material", v)}
                            />
                        </div>
                        <div
                            className="gri-field full"
                            data-invalid={errors.idea ? "true" : undefined}
                        >
                            <label htmlFor="gri-c-idea">
                                Descripción de la idea
                            </label>
                            <textarea
                                id="gri-c-idea"
                                className="gri-textarea"
                                value={r.idea}
                                onChange={(e) => set("idea", e.target.value)}
                                maxLength={800}
                                placeholder="Contanos qué necesitás: una joya en plata u oro, una reparación, una pieza criolla, un mate, bombilla, cuchilla o rebenque con detalles en plata u oro…"
                                aria-invalid={errors.idea ? true : undefined}
                            />
                            <FieldError>{errors.idea}</FieldError>
                        </div>
                        <div className="gri-field full">
                            <label htmlFor="gri-c-ref">
                                Referencia o enlace <small>(opcional)</small>
                            </label>
                            <input
                                id="gri-c-ref"
                                className="gri-input"
                                type="text"
                                inputMode="url"
                                value={r.reference}
                                onChange={(e) =>
                                    set("reference", e.target.value)
                                }
                                maxLength={300}
                                placeholder="Link a una foto o publicación"
                            />
                        </div>
                        <div className="gri-field">
                            <label htmlFor="gri-c-budget">
                                Presupuesto aproximado <small>(opcional)</small>
                            </label>
                            <input
                                id="gri-c-budget"
                                className="gri-input"
                                type="text"
                                value={r.budget}
                                onChange={(e) => set("budget", e.target.value)}
                                maxLength={60}
                                placeholder="Ej.: $ 3.000"
                            />
                        </div>
                        <div className="gri-field">
                            <label htmlFor="gri-c-name">
                                Nombre <small>(opcional)</small>
                            </label>
                            <input
                                id="gri-c-name"
                                className="gri-input"
                                type="text"
                                value={r.name}
                                onChange={(e) => set("name", e.target.value)}
                                maxLength={60}
                                autoComplete="given-name"
                            />
                        </div>
                        <div className="full gri-stack">
                            <button
                                type="submit"
                                className="gri-btn gri-btn--light"
                            >
                                <IconChat /> Enviar consulta por WhatsApp
                            </button>
                            {sent && (
                                <p className="gri-help" role="status">
                                    Preparamos tu mensaje. Si WhatsApp no se
                                    abrió,{" "}
                                    <a
                                        href={sent}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        tocá acá
                                    </a>
                                    .
                                </p>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </section>
    )
}

/* ---------- Cómo trabajamos, FAQ, contacto, footer ---------- */

export interface Step {
    title: string
    text: string
}
export interface Faq {
    question: string
    answer: string
}

function HowWeWork({ steps }: { steps: Step[] }) {
    return (
        <section
            className="gri-section"
            id="gri-como-trabajamos"
            aria-labelledby="gri-h-how"
        >
            <div className="gri-wrap">
                <p className="gri-eyebrow">02 — Cómo trabajamos</p>
                <h2 className="gri-h2" id="gri-h-how" style={{ marginTop: 14 }}>
                    Tres pasos, <em>por WhatsApp</em>
                </h2>
                <ol className="gri-steps">
                    {steps.map((s, i) => (
                        <li className="gri-step" key={i}>
                            <span className="gri-step-n" aria-hidden="true">
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <h3>{s.title}</h3>
                            <p>{s.text}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    )
}

function FaqSection({ faqs }: { faqs: Faq[] }) {
    return (
        <section
            className="gri-section gri-faq"
            id="gri-envios"
            aria-labelledby="gri-h-faq"
        >
            <div className="gri-wrap">
                <div className="gri-split">
                    <div className="gri-stack">
                        <p className="gri-eyebrow">04 — Envíos y consultas</p>
                        <h2 className="gri-h2" id="gri-h-faq">
                            Preguntas <em>frecuentes</em>
                        </h2>
                        <p className="gri-lead">
                            Si tu duda no está acá, escribinos por WhatsApp y te
                            respondemos.
                        </p>
                    </div>
                    <div className="gri-faq-list">
                        {faqs.map((f, i) => (
                            <details className="gri-faq-item" key={i}>
                                <summary>{f.question}</summary>
                                <p>{f.answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

function igHandle(url: string): string {
    const m = url.match(/instagram\.com\/([^/?#]+)/i)
    return m ? "@" + m[1] : "Instagram"
}

function ContactSection(props: {
    brand: string
    whatsapp: string
    instagramUrl: string
    images: string[]
}) {
    const imgs = props.images.filter(Boolean).slice(0, 6)
    return (
        <section
            className="gri-section gri-contact"
            id="gri-contacto"
            aria-labelledby="gri-h-contact"
        >
            <div className="gri-wrap">
                <div className="gri-split">
                    <div>
                        <p className="gri-eyebrow">05 — Contacto</p>
                        <h2
                            className="gri-h2"
                            id="gri-h-contact"
                            style={{ marginTop: 14 }}
                        >
                            ¿Tenés una duda sobre una pieza? <em>Hablemos</em>
                        </h2>
                        <p className="gri-lead" style={{ marginTop: 18 }}>
                            Escribinos por WhatsApp ({waDisplay(props.whatsapp)}
                            ) o mirá las novedades en Instagram.
                        </p>
                        <div className="gri-contact-actions">
                            <a
                                className="gri-btn"
                                href={waUrl(
                                    props.whatsapp,
                                    `Hola, ${props.brand}. Tengo una consulta.`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <IconChat /> Escribir por WhatsApp
                            </a>
                            <a
                                className="gri-btn gri-btn--ghost"
                                href={props.instagramUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Ver Instagram
                            </a>
                        </div>
                    </div>
                    {imgs.length > 0 ? (
                        <div className="gri-ig">
                            {imgs.map((src, i) => (
                                <a
                                    key={i}
                                    href={props.instagramUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Foto ${i + 1}: abrir el Instagram de ${props.brand}`}
                                >
                                    <Photo src={src} alt="" />
                                </a>
                            ))}
                        </div>
                    ) : (
                        <div className="gri-handle-card">
                            <p className="gri-eyebrow">Instagram</p>
                            <a
                                className="gri-handle"
                                href={props.instagramUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {igHandle(props.instagramUrl)}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

function Footer(props: {
    brand: string
    whatsapp: string
    instagramUrl: string
    nav: NavItem[]
    onNav: (id: string) => void
    onAdmin: () => void
}) {
    const [first, ...rest] = props.brand.trim().split(/\s+/)
    return (
        <footer className="gri-footer">
            <div className="gri-wrap">
                <div className="gri-footer-top">
                    <span className="gri-logo">
                        {(first || "GRI").toUpperCase()}
                        {rest.length > 0 && <span>{rest.join(" ")}</span>}
                    </span>
                    <nav aria-label="Pie de página">
                        {props.nav.map((n) => (
                            <a
                                key={n.id}
                                href={"#gri-" + n.id}
                                onClick={(e) => {
                                    e.preventDefault()
                                    props.onNav(n.id)
                                }}
                            >
                                {n.label}
                            </a>
                        ))}
                    </nav>
                    <div className="gri-footer-links">
                        <a
                            href={props.instagramUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Instagram
                        </a>
                        <a
                            href={waUrl(props.whatsapp, "")}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            WhatsApp
                        </a>
                    </div>
                </div>
                <div className="gri-footer-bottom">
                    <span>
                        © {new Date().getFullYear()} {props.brand}
                    </span>
                    <button type="button" onClick={props.onAdmin}>
                        Acceso administración
                    </button>
                </div>
            </div>
        </footer>
    )
}

/* =====================================================================
   10. PANEL DE ADMINISTRACIÓN
   ===================================================================== */

function uuid(): string {
    const c = (globalThis as { crypto?: Crypto }).crypto
    if (c && typeof c.randomUUID === "function") return c.randomUUID()
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
        const r = (Math.random() * 16) | 0
        return (ch === "x" ? r : (r & 3) | 8).toString(16)
    })
}

export function splitList(s: string): string[] {
    return Array.from(
        new Set(
            s
                .split(/[,;\n]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        )
    )
}

/** Interpreta precios escritos al estilo uruguayo ("1.490", "1490,50"). */
export function parsePriceInput(raw: string): number | null | "invalid" {
    const s = raw.replace(/\s|\$|US/gi, "")
    if (!s) return null
    let t = s
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))
        t = s.replace(/\./g, "").replace(",", ".")
    else if (/^\d+(,\d+)?$/.test(s)) t = s.replace(",", ".")
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 && /^\d+(\.\d+)?$/.test(t)
        ? n
        : "invalid"
}

type AuthStatus = "checking" | "out" | "denied" | "error" | "in"

function useAdminSession(cfg: Cfg) {
    const storageKey = "gri-admin-session:" + cfg.url
    const [status, setStatus] = useState<AuthStatus>("checking")
    const [session, setSession] = useState<Session | null>(null)
    const [error, setError] = useState("")
    const ref = useRef<Session | null>(null)

    const persist = useCallback(
        (s: Session | null) => {
            ref.current = s
            setSession(s)
            try {
                if (s) localStorage.setItem(storageKey, JSON.stringify(s))
                else localStorage.removeItem(storageKey)
            } catch {
                /* sin storage: la sesión vive solo en memoria */
            }
        },
        [storageKey]
    )

    const verify = useCallback(
        async (s: Session) => {
            setStatus("checking")
            setError("")
            try {
                const rows = await sb<unknown[]>(
                    cfg,
                    "/rest/v1/admins?select=user_id",
                    { token: s.access_token }
                )
                setStatus(
                    Array.isArray(rows) && rows.length > 0 ? "in" : "denied"
                )
            } catch (e) {
                if ((e as ApiError).status === 401) {
                    persist(null)
                    setStatus("out")
                } else {
                    setError(friendlyError(e))
                    setStatus("error")
                }
            }
        },
        [cfg, persist]
    )

    useEffect(() => {
        let alive = true
        ;(async () => {
            let s: Session | null = null
            try {
                const raw = localStorage.getItem(storageKey)
                if (raw) {
                    const j = JSON.parse(raw) as Session
                    if (
                        j &&
                        typeof j.access_token === "string" &&
                        typeof j.refresh_token === "string"
                    )
                        s = j
                }
            } catch {
                /* nada */
            }
            if (!s) {
                if (alive) setStatus("out")
                return
            }
            if (s.expires_at - Date.now() < 30000) {
                try {
                    s = await authRefresh(cfg, s.refresh_token)
                } catch {
                    if (alive) {
                        persist(null)
                        setStatus("out")
                    }
                    return
                }
            }
            if (!alive) return
            persist(s)
            await verify(s)
        })()
        return () => {
            alive = false
        }
    }, [cfg, storageKey, persist, verify])

    const signIn = useCallback(
        async (email: string, password: string): Promise<string> => {
            try {
                const s = await authSignIn(cfg, email.trim(), password)
                persist(s)
                await verify(s)
                return ""
            } catch (e) {
                return friendlyError(e)
            }
        },
        [cfg, persist, verify]
    )

    const getToken = useCallback(async (): Promise<string> => {
        let s = ref.current
        if (!s)
            throw new ApiError("Tu sesión venció. Iniciá sesión de nuevo.", 401)
        if (s.expires_at - Date.now() < 60000) {
            try {
                s = await authRefresh(cfg, s.refresh_token)
                persist(s)
            } catch {
                persist(null)
                setStatus("out")
                throw new ApiError(
                    "Tu sesión venció. Iniciá sesión de nuevo.",
                    401
                )
            }
        }
        return s.access_token
    }, [cfg, persist])

    const signOut = useCallback(async () => {
        const s = ref.current
        if (s) await authSignOut(cfg, s.access_token)
        persist(null)
        setStatus("out")
    }, [cfg, persist])

    const retry = useCallback(() => {
        if (ref.current) void verify(ref.current)
        else setStatus("out")
    }, [verify])

    return { status, session, error, signIn, signOut, getToken, retry }
}

type GetToken = () => Promise<string>

function Field(props: {
    label: string
    htmlFor: string
    hint?: string
    error?: string
    full?: boolean
    children: React.ReactNode
}) {
    return (
        <div
            className={"gri-field" + (props.full ? " full" : "")}
            data-invalid={props.error ? "true" : undefined}
        >
            <label htmlFor={props.htmlFor}>{props.label}</label>
            {props.children}
            {props.hint && <p className="gri-help">{props.hint}</p>}
            <FieldError>{props.error}</FieldError>
        </div>
    )
}

function LoginForm({
    onSubmit,
}: {
    onSubmit: (email: string, pass: string) => Promise<string>
}) {
    const [email, setEmail] = useState("")
    const [pass, setPass] = useState("")
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState("")
    return (
        <form
            noValidate
            className="gri-login gri-panel"
            onSubmit={async (e) => {
                e.preventDefault()
                if (!email.trim() || !pass) {
                    setErr("Completá el email y la contraseña.")
                    return
                }
                setBusy(true)
                setErr("")
                const m = await onSubmit(email, pass)
                setBusy(false)
                if (m) setErr(m)
            }}
        >
            <h1>Iniciar sesión</h1>
            <p className="gri-help">
                Acceso solo para quien administra el catálogo.
            </p>
            <Field label="Email" htmlFor="gri-a-email">
                <input
                    id="gri-a-email"
                    className="gri-input"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </Field>
            <Field label="Contraseña" htmlFor="gri-a-pass">
                <input
                    id="gri-a-pass"
                    className="gri-input"
                    type="password"
                    autoComplete="current-password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                />
            </Field>
            {err && <Notice kind="err">{err}</Notice>}
            <button type="submit" className="gri-btn" disabled={busy}>
                {busy ? (
                    <>
                        <span className="gri-spin" aria-hidden="true" />{" "}
                        Ingresando…
                    </>
                ) : (
                    "Ingresar"
                )}
            </button>
        </form>
    )
}

/* ---------- Productos: borrador del formulario ---------- */

interface CFDraft {
    id: string
    label: string
    type: "select" | "text"
    optionsText: string
    required: boolean
}

interface Draft {
    id: string
    isNew: boolean
    created_at: string
    sort_order: number
    sku: string
    name: string
    description: string
    category_slug: string
    material: string
    materialOther: string
    options: string[]
    optionsOther: string
    price: string
    currency: Currency
    availability: Availability
    featured: boolean
    visible: boolean
    tags: string
    images: ProductImage[]
    ringSizes: string
    requires_size: boolean
    engraving_enabled: boolean
    engraving_max: string
    custom_fields: CFDraft[]
}

function draftFrom(p: Product | null, nextSort: number): Draft {
    const baseMat =
        p?.material && BASE_MATERIALS.includes(normalize(p.material))
    return {
        id: p?.id || uuid(),
        isNew: !p,
        created_at: p?.created_at || "",
        sort_order: p ? p.sort_order : nextSort,
        sku: p?.sku || "",
        name: p?.name || "",
        description: p?.description || "",
        category_slug: p?.category_slug || "",
        material: p?.material ? (baseMat ? normalize(p.material) : "otro") : "",
        materialOther: p?.material && !baseMat ? p.material : "",
        options: (p?.material_options || [])
            .map(normalize)
            .filter((m) => BASE_MATERIALS.includes(m)),
        optionsOther: (p?.material_options || [])
            .filter((m) => !BASE_MATERIALS.includes(normalize(m)))
            .join(", "),
        price: p && p.price !== null ? String(p.price) : "",
        currency: p?.currency || "UYU",
        availability: p?.availability || "disponible",
        featured: p?.featured || false,
        visible: p ? p.visible : true,
        tags: (p?.tags || []).join(", "),
        images: p?.images || [],
        ringSizes: (p?.ring_sizes || []).join(", "),
        requires_size: p?.requires_size || false,
        engraving_enabled: p?.engraving_enabled || false,
        engraving_max: String(p?.engraving_max || 20),
        custom_fields: (p?.custom_fields || []).map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            optionsText: f.options.join(", "),
            required: f.required,
        })),
    }
}

export function draftToRow(d: Draft): {
    row?: Record<string, unknown>
    errors: Record<string, string>
} {
    const errors: Record<string, string> = {}
    const name = d.name.trim()
    if (!name) errors.name = "Escribí el nombre de la pieza."
    else if (name.length > 160)
        errors.name = "El nombre es demasiado largo (máximo 160 caracteres)."
    if (d.sku.trim().length > 60) errors.sku = "El código es demasiado largo."
    const price = parsePriceInput(d.price)
    if (price === "invalid")
        errors.price = "Escribí el precio solo con números (ej.: 2490)."
    const sizes = splitList(d.ringSizes)
    if (d.requires_size && sizes.length === 0)
        errors.ringSizes =
            "Cargá los talles disponibles o desactivá “pedir talle”."
    const eng = Number(d.engraving_max)
    if (
        d.engraving_enabled &&
        !(Number.isInteger(eng) && eng >= 1 && eng <= 100)
    )
        errors.engraving_max =
            "El máximo de caracteres debe ser un número entre 1 y 100."
    if (d.material === "otro" && !d.materialOther.trim())
        errors.material = "Escribí cuál es el material."
    const options = [...d.options, ...splitList(d.optionsOther)]
    const fields: CustomField[] = []
    const seen = new Set<string>()
    d.custom_fields.forEach((f, i) => {
        const label = f.label.trim()
        if (!label) {
            errors["cf" + i] = "Cada campo adicional necesita un nombre."
            return
        }
        const opts = splitList(f.optionsText)
        if (f.type === "select" && opts.length === 0) {
            errors["cf" + i] =
                `El campo “${label}” necesita al menos una opción.`
            return
        }
        let id = slugify(label) || "campo"
        while (seen.has(id)) id += "-2"
        seen.add(id)
        fields.push({
            id,
            label,
            type: f.type,
            options: f.type === "select" ? opts : [],
            required: f.required,
        })
    })
    if (Object.keys(errors).length) return { errors }
    const material =
        d.material === "otro" ? d.materialOther.trim() : d.material || null
    return {
        errors,
        row: {
            id: d.id,
            sku: d.sku.trim() || null,
            name,
            description: d.description.trim(),
            category_slug: d.category_slug || null,
            material,
            material_options: options,
            price: price === null || price === "invalid" ? null : price,
            currency: d.currency,
            availability: d.availability,
            featured: d.featured,
            visible: d.visible,
            sort_order: d.sort_order,
            tags: splitList(d.tags),
            images: d.images.map((i) =>
                i.path ? { url: i.url, path: i.path } : { url: i.url }
            ),
            ring_sizes: sizes,
            requires_size: d.requires_size && sizes.length > 0,
            engraving_enabled: d.engraving_enabled,
            engraving_max: d.engraving_enabled ? eng : 20,
            custom_fields: fields,
        },
    }
}

const ALLOWED_IMG = ["image/jpeg", "image/png", "image/webp", "image/avif"]
const EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
}

async function prepareImage(file: File): Promise<Blob> {
    const MAX = 1800
    try {
        if (typeof createImageBitmap !== "function") return file
        const bmp = await createImageBitmap(file)
        const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
        if (scale === 1 && file.size < 1_500_000) {
            bmp.close?.()
            return file
        }
        const c = document.createElement("canvas")
        c.width = Math.max(1, Math.round(bmp.width * scale))
        c.height = Math.max(1, Math.round(bmp.height * scale))
        const ctx = c.getContext("2d")
        if (!ctx) return file
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(bmp, 0, 0, c.width, c.height)
        bmp.close?.()
        const blob = await new Promise<Blob | null>((res) =>
            c.toBlob(res, "image/jpeg", 0.86)
        )
        return blob || file
    } catch {
        return file
    }
}

function ProductForm(props: {
    cfg: Cfg
    getToken: GetToken
    cats: Category[]
    initial: Product | null
    nextSort: number
    onDone: (msg: string) => void
    onCancel: () => void
}) {
    const { cfg, getToken, cats } = props
    const [d, setD] = useState<Draft>(() =>
        draftFrom(props.initial, props.nextSort)
    )
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState("")
    const [uploading, setUploading] = useState("")
    const [uploadErrors, setUploadErrors] = useState<string[]>([])
    const uploaded = useRef<string[]>([])
    const removed = useRef<string[]>([])
    const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
        setD((s) => ({ ...s, [k]: v }))

    const onFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        const list = Array.from(files)
        const errs: string[] = []
        setUploadErrors([])
        let n = 0
        for (const f of list) {
            n++
            setUploading(`Subiendo foto ${n} de ${list.length}…`)
            try {
                if (!ALLOWED_IMG.includes(f.type))
                    throw new Error(
                        `“${f.name}”: formato no admitido (usá JPG, PNG o WebP).`
                    )
                const blob = await prepareImage(f)
                if (blob.size > 5 * 1024 * 1024)
                    throw new Error(`“${f.name}”: pesa más de 5 MB.`)
                const type = ALLOWED_IMG.includes(blob.type)
                    ? blob.type
                    : "image/jpeg"
                const path = `${d.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[type]}`
                const token = await getToken()
                await storageUpload(
                    cfg,
                    token,
                    path,
                    blob.type === type ? blob : new Blob([blob], { type })
                )
                uploaded.current.push(path)
                setD((s) => ({
                    ...s,
                    images: [
                        ...s.images,
                        { url: publicImageUrl(cfg, path), path },
                    ],
                }))
            } catch (e) {
                const m =
                    e instanceof Error &&
                    !(e as ApiError).status &&
                    !(e instanceof TypeError)
                        ? e.message
                        : `“${f.name}”: ${friendlyError(e)}`
                errs.push(m)
            }
        }
        setUploading("")
        setUploadErrors(errs)
    }

    const makeMain = (i: number) =>
        setD((s) => {
            const imgs = [...s.images]
            const [it] = imgs.splice(i, 1)
            return { ...s, images: [it, ...imgs] }
        })
    const removeImg = (i: number) =>
        setD((s) => {
            const it = s.images[i]
            if (it?.path) removed.current.push(it.path)
            return { ...s, images: s.images.filter((_, j) => j !== i) }
        })

    const save = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaveError("")
        const { row, errors: errs } = draftToRow(d)
        setErrors(errs)
        if (!row) {
            setTimeout(
                () =>
                    document
                        .querySelector<HTMLElement>(
                            ".gri-admin [data-invalid='true'] input, .gri-admin [data-invalid='true'] textarea, .gri-admin [data-invalid='true'] select, .gri-admin [data-invalid='true']"
                        )
                        ?.focus(),
                0
            )
            return
        }
        setSaving(true)
        try {
            const token = await getToken()
            const res = d.isNew
                ? await sb<unknown[]>(cfg, "/rest/v1/products", {
                      method: "POST",
                      token,
                      json: row,
                      prefer: "return=representation",
                  })
                : await sb<unknown[]>(
                      cfg,
                      `/rest/v1/products?id=eq.${encodeURIComponent(d.id)}`,
                      {
                          method: "PATCH",
                          token,
                          json: row,
                          prefer: "return=representation",
                      }
                  )
            if (!Array.isArray(res) || res.length === 0)
                throw new ApiError(
                    "Supabase rechazó la operación por permisos (RLS): no se guardó nada.",
                    403
                )
            await storageRemove(cfg, token, removed.current)
            uploaded.current = []
            props.onDone(d.isNew ? "Pieza creada." : "Cambios guardados.")
        } catch (e2) {
            setSaveError(friendlyError(e2))
        } finally {
            setSaving(false)
        }
    }

    const cancel = async () => {
        if (uploaded.current.length) {
            try {
                await storageRemove(cfg, await getToken(), uploaded.current)
            } catch {
                /* mejor esfuerzo */
            }
        }
        props.onCancel()
    }

    const toggleOpt = (m: string) =>
        set(
            "options",
            d.options.includes(m)
                ? d.options.filter((x) => x !== m)
                : [...d.options, m]
        )
    const updCF = (i: number, patch: Partial<CFDraft>) =>
        set(
            "custom_fields",
            d.custom_fields.map((f, j) => (j === i ? { ...f, ...patch } : f))
        )

    return (
        <form onSubmit={save} noValidate>
            <h2>{d.isNew ? "Nueva pieza" : "Editar pieza"}</h2>
            {!d.isNew && (
                <p className="gri-help" style={{ marginTop: 6 }}>
                    ID: {d.id}
                    {d.created_at
                        ? " · Creada el " +
                          new Date(d.created_at).toLocaleDateString("es-UY")
                        : ""}
                </p>
            )}

            <div className="gri-fsec">
                <h3>Datos principales</h3>
                <div className="gri-fgrid">
                    <Field
                        label="Nombre *"
                        htmlFor="gri-f-name"
                        error={errors.name}
                        full
                    >
                        <input
                            id="gri-f-name"
                            className="gri-input"
                            value={d.name}
                            onChange={(e) => set("name", e.target.value)}
                            maxLength={160}
                            aria-invalid={errors.name ? true : undefined}
                        />
                    </Field>
                    <Field label="Descripción" htmlFor="gri-f-desc" full>
                        <textarea
                            id="gri-f-desc"
                            className="gri-textarea"
                            value={d.description}
                            onChange={(e) => set("description", e.target.value)}
                        />
                    </Field>
                    <Field label="Categoría" htmlFor="gri-f-cat">
                        <select
                            id="gri-f-cat"
                            className="gri-select"
                            value={d.category_slug}
                            onChange={(e) =>
                                set("category_slug", e.target.value)
                            }
                        >
                            <option value="">Sin categoría</option>
                            {cats.map((c) => (
                                <option key={c.id} value={c.slug}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field
                        label="Código / SKU (opcional)"
                        htmlFor="gri-f-sku"
                        error={errors.sku}
                    >
                        <input
                            id="gri-f-sku"
                            className="gri-input"
                            value={d.sku}
                            onChange={(e) => set("sku", e.target.value)}
                            maxLength={60}
                        />
                    </Field>
                    <Field
                        label="Precio (opcional)"
                        htmlFor="gri-f-price"
                        error={errors.price}
                        hint="Dejalo vacío si preferís no publicar el precio."
                    >
                        <input
                            id="gri-f-price"
                            className="gri-input"
                            inputMode="decimal"
                            value={d.price}
                            onChange={(e) => set("price", e.target.value)}
                            placeholder="Ej.: 2490"
                            aria-invalid={errors.price ? true : undefined}
                        />
                    </Field>
                    <Field label="Moneda" htmlFor="gri-f-cur">
                        <select
                            id="gri-f-cur"
                            className="gri-select"
                            value={d.currency}
                            onChange={(e) =>
                                set(
                                    "currency",
                                    e.target.value === "USD" ? "USD" : "UYU"
                                )
                            }
                        >
                            <option value="UYU">Pesos uruguayos ($)</option>
                            <option value="USD">Dólares (US$)</option>
                        </select>
                    </Field>
                    <Field label="Estado" htmlFor="gri-f-av">
                        <select
                            id="gri-f-av"
                            className="gri-select"
                            value={d.availability}
                            onChange={(e) =>
                                set(
                                    "availability",
                                    e.target.value as Availability
                                )
                            }
                        >
                            <option value="disponible">Disponible</option>
                            <option value="por_encargo">Por encargo</option>
                            <option value="agotado">Agotado</option>
                        </select>
                    </Field>
                    <Field
                        label="Etiquetas para la búsqueda (separadas por coma)"
                        htmlFor="gri-f-tags"
                    >
                        <input
                            id="gri-f-tags"
                            className="gri-input"
                            value={d.tags}
                            onChange={(e) => set("tags", e.target.value)}
                            placeholder="Ej.: regalo, liso, mini"
                        />
                    </Field>
                    <div className="gri-checks full">
                        <label className="gri-check">
                            <input
                                type="checkbox"
                                checked={d.featured}
                                onChange={(e) =>
                                    set("featured", e.target.checked)
                                }
                            />{" "}
                            Pieza destacada
                        </label>
                        <label className="gri-check">
                            <input
                                type="checkbox"
                                checked={d.visible}
                                onChange={(e) =>
                                    set("visible", e.target.checked)
                                }
                            />{" "}
                            Visible en el catálogo público
                        </label>
                    </div>
                </div>
            </div>

            <div className="gri-fsec">
                <h3>Material</h3>
                <div className="gri-fgrid">
                    <Field
                        label="Material de la pieza"
                        htmlFor="gri-f-mat"
                        error={errors.material}
                    >
                        <select
                            id="gri-f-mat"
                            className="gri-select"
                            value={d.material}
                            onChange={(e) => set("material", e.target.value)}
                        >
                            <option value="">Sin definir</option>
                            <option value="oro">Oro</option>
                            <option value="plata">Plata</option>
                            <option value="combinado">
                                Combinado (plata y oro)
                            </option>
                            <option value="otro">Otro…</option>
                        </select>
                    </Field>
                    {d.material === "otro" && (
                        <Field
                            label="¿Cuál?"
                            htmlFor="gri-f-matother"
                            error={errors.material}
                        >
                            <input
                                id="gri-f-matother"
                                className="gri-input"
                                value={d.materialOther}
                                onChange={(e) =>
                                    set("materialOther", e.target.value)
                                }
                            />
                        </Field>
                    )}
                    <fieldset className="gri-opt full">
                        <legend>
                            Variantes que puede elegir el cliente{" "}
                            <small>
                                Opcional · si marcás 2 o más, el cliente elige
                                una
                            </small>
                        </legend>
                        <div className="gri-checks">
                            {BASE_MATERIALS.map((m) => (
                                <label className="gri-check" key={m}>
                                    <input
                                        type="checkbox"
                                        checked={d.options.includes(m)}
                                        onChange={() => toggleOpt(m)}
                                    />{" "}
                                    {materialLabel(m, "variante")}
                                </label>
                            ))}
                        </div>
                        <Field
                            label="Otras variantes (separadas por coma)"
                            htmlFor="gri-f-optother"
                        >
                            <input
                                id="gri-f-optother"
                                className="gri-input"
                                value={d.optionsOther}
                                onChange={(e) =>
                                    set("optionsOther", e.target.value)
                                }
                            />
                        </Field>
                    </fieldset>
                </div>
            </div>

            <div className="gri-fsec">
                <h3>Fotos</h3>
                <p className="gri-help">
                    La primera foto es la principal (la que se ve en la grilla).
                    Formatos: JPG, PNG o WebP. Se achican solas para que la web
                    cargue rápido.
                </p>
                <div>
                    <label
                        className="gri-btn gri-btn--ghost gri-btn--sm"
                        style={{ cursor: "pointer" }}
                    >
                        Subir fotos
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            multiple
                            className="gri-sr"
                            onChange={(e) => {
                                void onFiles(e.target.files)
                                e.target.value = ""
                            }}
                        />
                    </label>
                    {uploading && (
                        <span
                            className="gri-help"
                            style={{ marginLeft: 12 }}
                            role="status"
                        >
                            <span className="gri-spin" aria-hidden="true" />{" "}
                            {uploading}
                        </span>
                    )}
                </div>
                {uploadErrors.map((m, i) => (
                    <Notice kind="err" key={i}>
                        {m}
                    </Notice>
                ))}
                {d.images.length > 0 && (
                    <ul className="gri-imglist">
                        {d.images.map((im, i) => (
                            <li className="gri-imgitem" key={im.url}>
                                <div className="pic">
                                    <Photo src={im.url} alt={`Foto ${i + 1}`} />
                                    {i === 0 && (
                                        <span className="gri-tag">
                                            Principal
                                        </span>
                                    )}
                                </div>
                                <div className="btns">
                                    <button
                                        type="button"
                                        onClick={() => makeMain(i)}
                                        disabled={i === 0}
                                    >
                                        Hacer principal
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeImg(i)}
                                    >
                                        Quitar
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="gri-fsec">
                <h3>Talles</h3>
                <div className="gri-fgrid">
                    <Field
                        label="Talles disponibles (separados por coma)"
                        htmlFor="gri-f-sizes"
                        error={errors.ringSizes}
                        hint="Si lo dejás vacío, la ficha no pregunta talle. Se agrega solo la opción “No estoy seguro/a”."
                        full
                    >
                        <input
                            id="gri-f-sizes"
                            className="gri-input"
                            value={d.ringSizes}
                            onChange={(e) => set("ringSizes", e.target.value)}
                            placeholder="Ej.: 10, 12, 14, 16"
                        />
                    </Field>
                    <div className="gri-checks full">
                        <label className="gri-check">
                            <input
                                type="checkbox"
                                checked={d.requires_size}
                                onChange={(e) =>
                                    set("requires_size", e.target.checked)
                                }
                            />{" "}
                            Pedir talle antes de consultar (obligatorio)
                        </label>
                    </div>
                </div>
            </div>

            <div className="gri-fsec">
                <h3>Grabado</h3>
                <div className="gri-fgrid">
                    <div className="gri-checks full">
                        <label className="gri-check">
                            <input
                                type="checkbox"
                                checked={d.engraving_enabled}
                                onChange={(e) =>
                                    set("engraving_enabled", e.target.checked)
                                }
                            />{" "}
                            Esta pieza admite grabado
                        </label>
                    </div>
                    {d.engraving_enabled && (
                        <Field
                            label="Máximo de caracteres"
                            htmlFor="gri-f-engmax"
                            error={errors.engraving_max}
                        >
                            <input
                                id="gri-f-engmax"
                                className="gri-input"
                                inputMode="numeric"
                                value={d.engraving_max}
                                onChange={(e) =>
                                    set("engraving_max", e.target.value)
                                }
                            />
                        </Field>
                    )}
                </div>
            </div>

            <div className="gri-fsec">
                <h3>Campos adicionales</h3>
                <p className="gri-help">
                    Para opciones como largo, acabado o color. El cliente las
                    completa y llegan en el mensaje de WhatsApp.
                </p>
                {d.custom_fields.map((f, i) => (
                    <div key={f.id + i}>
                        <div className="gri-cfrow">
                            <Field
                                label="Nombre del campo"
                                htmlFor={"gri-cf-l" + i}
                            >
                                <input
                                    id={"gri-cf-l" + i}
                                    className="gri-input"
                                    value={f.label}
                                    onChange={(e) =>
                                        updCF(i, { label: e.target.value })
                                    }
                                    placeholder="Ej.: Largo"
                                />
                            </Field>
                            <Field label="Tipo" htmlFor={"gri-cf-t" + i}>
                                <select
                                    id={"gri-cf-t" + i}
                                    className="gri-select"
                                    value={f.type}
                                    onChange={(e) =>
                                        updCF(i, {
                                            type:
                                                e.target.value === "select"
                                                    ? "select"
                                                    : "text",
                                        })
                                    }
                                >
                                    <option value="text">Texto libre</option>
                                    <option value="select">
                                        Elegir opción
                                    </option>
                                </select>
                            </Field>
                            {f.type === "select" ? (
                                <Field
                                    label="Opciones (coma)"
                                    htmlFor={"gri-cf-o" + i}
                                >
                                    <input
                                        id={"gri-cf-o" + i}
                                        className="gri-input"
                                        value={f.optionsText}
                                        onChange={(e) =>
                                            updCF(i, {
                                                optionsText: e.target.value,
                                            })
                                        }
                                        placeholder="40 cm, 45 cm, 50 cm"
                                    />
                                </Field>
                            ) : (
                                <span />
                            )}
                            <label className="gri-check">
                                <input
                                    type="checkbox"
                                    checked={f.required}
                                    onChange={(e) =>
                                        updCF(i, { required: e.target.checked })
                                    }
                                />{" "}
                                Obligatorio
                            </label>
                            <button
                                type="button"
                                className="gri-iconbtn"
                                onClick={() =>
                                    set(
                                        "custom_fields",
                                        d.custom_fields.filter(
                                            (_, j) => j !== i
                                        )
                                    )
                                }
                            >
                                Quitar
                            </button>
                        </div>
                        <FieldError>{errors["cf" + i]}</FieldError>
                    </div>
                ))}
                <div>
                    <button
                        type="button"
                        className="gri-btn gri-btn--ghost gri-btn--sm"
                        onClick={() =>
                            set("custom_fields", [
                                ...d.custom_fields,
                                {
                                    id: uuid(),
                                    label: "",
                                    type: "text",
                                    optionsText: "",
                                    required: false,
                                },
                            ])
                        }
                    >
                        + Agregar campo
                    </button>
                </div>
            </div>

            {saveError && (
                <div style={{ marginTop: 20 }}>
                    <Notice kind="err">{saveError}</Notice>
                </div>
            )}
            {Object.keys(errors).length > 0 && !saveError && (
                <div style={{ marginTop: 20 }}>
                    <Notice kind="err">
                        Revisá los campos marcados en rojo.
                    </Notice>
                </div>
            )}

            <div className="gri-formbar">
                <button
                    type="button"
                    className="gri-btn gri-btn--ghost"
                    onClick={cancel}
                    disabled={saving}
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    className="gri-btn"
                    disabled={saving || !!uploading}
                >
                    {saving ? (
                        <>
                            <span className="gri-spin" aria-hidden="true" />{" "}
                            Guardando…
                        </>
                    ) : (
                        "Guardar pieza"
                    )}
                </button>
            </div>
        </form>
    )
}

/* ---------- Productos: listado ---------- */

async function patchRow(
    cfg: Cfg,
    token: string,
    table: string,
    id: string,
    fields: Record<string, unknown>
): Promise<unknown> {
    const res = await sb<unknown[]>(
        cfg,
        `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            token,
            json: fields,
            prefer: "return=representation",
        }
    )
    if (!Array.isArray(res) || res.length === 0)
        throw new ApiError(
            "Supabase rechazó la operación por permisos (RLS): no se guardó nada.",
            403
        )
    return res[0]
}

function ProductsTab(props: {
    cfg: Cfg
    getToken: GetToken
    cats: Category[]
    onChanged: () => void
}) {
    const { cfg, getToken, cats } = props
    const [items, setItems] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [notice, setNotice] = useState("")
    const [editing, setEditing] = useState<Product | "new" | null>(null)
    const [confirmId, setConfirmId] = useState("")
    const [busyId, setBusyId] = useState("")
    const [q, setQ] = useState("")

    const load = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            const token = await getToken()
            const rows = await sb<unknown[]>(
                cfg,
                "/rest/v1/products?select=*&order=sort_order.asc,created_at.desc",
                { token }
            )
            setItems(
                (Array.isArray(rows) ? rows : [])
                    .map(parseProduct)
                    .filter((x): x is Product => !!x)
            )
        } catch (e) {
            setError(friendlyError(e))
        } finally {
            setLoading(false)
        }
    }, [cfg, getToken])

    useEffect(() => {
        void load()
    }, [load])

    const quick = async (p: Product, fields: Record<string, unknown>) => {
        setBusyId(p.id)
        setNotice("")
        setError("")
        try {
            const row = parseProduct(
                await patchRow(cfg, await getToken(), "products", p.id, fields)
            )
            if (row) setItems((l) => l.map((x) => (x.id === p.id ? row : x)))
            props.onChanged()
        } catch (e) {
            setError(friendlyError(e))
        } finally {
            setBusyId("")
        }
    }

    const move = async (i: number, dir: -1 | 1) => {
        const j = i + dir
        if (j < 0 || j >= items.length) return
        const next = [...items]
        ;[next[i], next[j]] = [next[j], next[i]]
        const renum = next.map((p, idx) => ({ ...p, sort_order: idx * 10 }))
        setBusyId("*")
        setError("")
        try {
            const token = await getToken()
            const changed = renum.filter(
                (p, idx) =>
                    p.sort_order !==
                        items.find((x) => x.id === p.id)?.sort_order ||
                    idx === i ||
                    idx === j
            )
            await Promise.all(
                changed.map((p) =>
                    patchRow(cfg, token, "products", p.id, {
                        sort_order: p.sort_order,
                    })
                )
            )
            setItems(renum)
            props.onChanged()
        } catch (e) {
            setError(friendlyError(e))
            void load()
        } finally {
            setBusyId("")
        }
    }

    const remove = async (p: Product) => {
        setBusyId(p.id)
        setError("")
        try {
            const token = await getToken()
            const res = await sb<unknown[]>(
                cfg,
                `/rest/v1/products?id=eq.${encodeURIComponent(p.id)}`,
                { method: "DELETE", token, prefer: "return=representation" }
            )
            if (!Array.isArray(res) || res.length === 0)
                throw new ApiError(
                    "Supabase rechazó la operación por permisos (RLS): no se eliminó nada.",
                    403
                )
            await storageRemove(
                cfg,
                token,
                p.images.map((i) => i.path || "").filter(Boolean)
            )
            setItems((l) => l.filter((x) => x.id !== p.id))
            setConfirmId("")
            setNotice(`Se eliminó “${p.name}”.`)
            props.onChanged()
        } catch (e) {
            setError(friendlyError(e))
        } finally {
            setBusyId("")
        }
    }

    if (editing)
        return (
            <div className="gri-panel">
                <ProductForm
                    cfg={cfg}
                    getToken={getToken}
                    cats={cats}
                    initial={editing === "new" ? null : editing}
                    nextSort={
                        items.length
                            ? Math.min(...items.map((i) => i.sort_order)) - 10
                            : 0
                    }
                    onCancel={() => setEditing(null)}
                    onDone={(m) => {
                        setEditing(null)
                        setNotice(m)
                        void load()
                        props.onChanged()
                    }}
                />
            </div>
        )

    const shown = q.trim()
        ? items.filter((p) =>
              normalize(p.name + " " + (p.sku || "")).includes(normalize(q))
          )
        : items
    const catName = (s: string | null) =>
        s ? cats.find((c) => c.slug === s)?.name || "" : "Sin categoría"

    return (
        <div className="gri-panel">
            <div className="gri-toolbar">
                <h2>Piezas ({items.length})</h2>
                <button
                    type="button"
                    className="gri-btn"
                    onClick={() => {
                        setNotice("")
                        setEditing("new")
                    }}
                >
                    + Nueva pieza
                </button>
            </div>
            <div className="gri-search" style={{ marginBottom: 12 }}>
                <label className="gri-sr" htmlFor="gri-a-q">
                    Buscar piezas
                </label>
                <IconSearch />
                <input
                    id="gri-a-q"
                    className="gri-input"
                    type="search"
                    placeholder="Buscar por nombre o código"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
            </div>
            {notice && (
                <div style={{ marginBottom: 12 }}>
                    <Notice kind="ok">{notice}</Notice>
                </div>
            )}
            {error && (
                <div style={{ marginBottom: 12 }}>
                    <Notice kind="err">
                        {error}{" "}
                        <button
                            type="button"
                            className="gri-link"
                            onClick={() => void load()}
                        >
                            Reintentar
                        </button>
                    </Notice>
                </div>
            )}
            {loading && (
                <p className="gri-help" role="status">
                    <span className="gri-spin" aria-hidden="true" /> Cargando
                    piezas…
                </p>
            )}
            {!loading && !error && items.length === 0 && (
                <div className="gri-empty">
                    <h3>Todavía no cargaste piezas</h3>
                    <p>Tocá “Nueva pieza” para subir la primera.</p>
                </div>
            )}
            <ul>
                {shown.map((p) => {
                    const idx = items.findIndex((x) => x.id === p.id)
                    return (
                        <li
                            className="gri-arow"
                            key={p.id}
                            aria-busy={busyId === p.id || busyId === "*"}
                        >
                            <div className="gri-arow-thumb">
                                <Photo src={p.images[0]?.url} alt="" />
                            </div>
                            <div className="gri-arow-main">
                                <span className="gri-arow-name">
                                    {p.name}
                                    {!p.visible ? " · (oculta)" : ""}
                                </span>
                                <span className="gri-arow-sub">
                                    {[
                                        catName(p.category_slug),
                                        p.price !== null
                                            ? formatPrice(p.price, p.currency)
                                            : "Sin precio",
                                        p.sku ? "Cód. " + p.sku : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </span>
                            </div>
                            <div className="gri-arow-actions">
                                <label
                                    className="gri-sr"
                                    htmlFor={"gri-av-" + p.id}
                                >
                                    Estado de {p.name}
                                </label>
                                <select
                                    id={"gri-av-" + p.id}
                                    className="gri-select"
                                    value={p.availability}
                                    onChange={(e) =>
                                        void quick(p, {
                                            availability: e.target.value,
                                        })
                                    }
                                    disabled={busyId === p.id}
                                >
                                    <option value="disponible">
                                        Disponible
                                    </option>
                                    <option value="por_encargo">
                                        Por encargo
                                    </option>
                                    <option value="agotado">Agotado</option>
                                </select>
                                <button
                                    type="button"
                                    className="gri-iconbtn"
                                    aria-pressed={p.featured}
                                    onClick={() =>
                                        void quick(p, { featured: !p.featured })
                                    }
                                    disabled={busyId === p.id}
                                >
                                    {p.featured ? "★ Destacada" : "☆ Destacar"}
                                </button>
                                <button
                                    type="button"
                                    className="gri-iconbtn"
                                    aria-pressed={!p.visible}
                                    onClick={() =>
                                        void quick(p, { visible: !p.visible })
                                    }
                                    disabled={busyId === p.id}
                                >
                                    {p.visible ? "Ocultar" : "Mostrar"}
                                </button>
                                {!q.trim() && (
                                    <>
                                        <button
                                            type="button"
                                            className="gri-iconbtn"
                                            aria-label={`Subir ${p.name}`}
                                            onClick={() => void move(idx, -1)}
                                            disabled={
                                                idx === 0 || busyId !== ""
                                            }
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="gri-iconbtn"
                                            aria-label={`Bajar ${p.name}`}
                                            onClick={() => void move(idx, 1)}
                                            disabled={
                                                idx === items.length - 1 ||
                                                busyId !== ""
                                            }
                                        >
                                            ↓
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    className="gri-iconbtn"
                                    onClick={() => {
                                        setNotice("")
                                        setEditing(p)
                                    }}
                                >
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    className="gri-iconbtn"
                                    onClick={() => setConfirmId(p.id)}
                                >
                                    Eliminar
                                </button>
                            </div>
                            {confirmId === p.id && (
                                <div
                                    className="gri-confirm"
                                    role="alertdialog"
                                    aria-label={`Confirmar eliminación de ${p.name}`}
                                >
                                    <span>
                                        ¿Eliminar “{p.name}” y sus fotos? No se
                                        puede deshacer.
                                    </span>
                                    <button
                                        type="button"
                                        className="gri-btn gri-btn--danger gri-btn--sm"
                                        onClick={() => void remove(p)}
                                        disabled={busyId === p.id}
                                    >
                                        Sí, eliminar
                                    </button>
                                    <button
                                        type="button"
                                        className="gri-btn gri-btn--ghost gri-btn--sm"
                                        onClick={() => setConfirmId("")}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

/* ---------- Categorías ---------- */

function CategoriesTab(props: {
    cfg: Cfg
    getToken: GetToken
    cats: Category[]
    reload: () => void
    onChanged: () => void
}) {
    const { cfg, getToken, cats } = props
    const [names, setNames] = useState<Record<string, string>>({})
    const [newName, setNewName] = useState("")
    const [msg, setMsg] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [confirm, setConfirm] = useState<{
        id: string
        count: number
    } | null>(null)

    const run = async (fn: (token: string) => Promise<void>, ok: string) => {
        setBusy(true)
        setError("")
        setMsg("")
        try {
            await fn(await getToken())
            setMsg(ok)
            props.reload()
            props.onChanged()
        } catch (e) {
            setError(friendlyError(e))
        } finally {
            setBusy(false)
        }
    }

    const add = (e: React.FormEvent) => {
        e.preventDefault()
        const name = newName.trim()
        const slug = slugify(name)
        if (!name || !slug) {
            setError("Escribí un nombre para la categoría.")
            return
        }
        if (cats.some((c) => c.slug === slug)) {
            setError("Ya existe una categoría con ese nombre.")
            return
        }
        void run(async (token) => {
            const max = cats.length
                ? Math.max(...cats.map((c) => c.sort_order))
                : 0
            const res = await sb<unknown[]>(cfg, "/rest/v1/categories", {
                method: "POST",
                token,
                json: { slug, name, sort_order: max + 10 },
                prefer: "return=representation",
            })
            if (!Array.isArray(res) || res.length === 0)
                throw new ApiError(
                    "Supabase rechazó la operación por permisos (RLS).",
                    403
                )
            setNewName("")
        }, `Categoría “${name}” creada.`)
    }

    const rename = (c: Category) => {
        const name = (names[c.id] ?? c.name).trim()
        if (!name) {
            setError("El nombre no puede quedar vacío.")
            return
        }
        void run(async (token) => {
            await patchRow(cfg, token, "categories", c.id, { name })
            setNames((n) => {
                const { [c.id]: _omit, ...rest } = n
                return rest
            })
        }, "Nombre actualizado.")
    }

    const move = (i: number, dir: -1 | 1) => {
        const j = i + dir
        if (j < 0 || j >= cats.length) return
        const next = [...cats]
        ;[next[i], next[j]] = [next[j], next[i]]
        void run(async (token) => {
            await Promise.all(
                next.map((c, idx) =>
                    c.sort_order !== idx * 10
                        ? patchRow(cfg, token, "categories", c.id, {
                              sort_order: idx * 10,
                          })
                        : Promise.resolve()
                )
            )
        }, "Orden actualizado.")
    }

    const askDelete = async (c: Category) => {
        setError("")
        try {
            const rows = await sb<unknown[]>(
                cfg,
                `/rest/v1/products?select=id&category_slug=eq.${encodeURIComponent(c.slug)}`,
                { token: await getToken() }
            )
            setConfirm({
                id: c.id,
                count: Array.isArray(rows) ? rows.length : 0,
            })
        } catch (e) {
            setError(friendlyError(e))
        }
    }

    const del = (c: Category) =>
        void run(async (token) => {
            const res = await sb<unknown[]>(
                cfg,
                `/rest/v1/categories?id=eq.${encodeURIComponent(c.id)}`,
                { method: "DELETE", token, prefer: "return=representation" }
            )
            if (!Array.isArray(res) || res.length === 0)
                throw new ApiError(
                    "Supabase rechazó la operación por permisos (RLS).",
                    403
                )
            setConfirm(null)
        }, `Categoría “${c.name}” eliminada.`)

    return (
        <div className="gri-panel">
            <h2>Categorías</h2>
            <p className="gri-help" style={{ margin: "6px 0 16px" }}>
                En la web solo aparecen las categorías que tienen al menos una
                pieza visible.
            </p>
            {msg && (
                <div style={{ marginBottom: 12 }}>
                    <Notice kind="ok">{msg}</Notice>
                </div>
            )}
            {error && (
                <div style={{ marginBottom: 12 }}>
                    <Notice kind="err">{error}</Notice>
                </div>
            )}
            <form
                onSubmit={add}
                className="gri-toolbar"
                style={{ justifyContent: "flex-start", alignItems: "end" }}
            >
                <Field label="Nueva categoría" htmlFor="gri-newcat">
                    <input
                        id="gri-newcat"
                        className="gri-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        maxLength={60}
                        placeholder="Ej.: Alianzas"
                    />
                </Field>
                <button type="submit" className="gri-btn" disabled={busy}>
                    Agregar
                </button>
            </form>
            <ul>
                {cats.map((c, i) => (
                    <li
                        className="gri-arow"
                        style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
                        key={c.id}
                    >
                        <div className="gri-field">
                            <label
                                className="gri-sr"
                                htmlFor={"gri-cn-" + c.id}
                            >
                                Nombre de la categoría
                            </label>
                            <input
                                id={"gri-cn-" + c.id}
                                className="gri-input"
                                value={names[c.id] ?? c.name}
                                onChange={(e) =>
                                    setNames((n) => ({
                                        ...n,
                                        [c.id]: e.target.value,
                                    }))
                                }
                                maxLength={60}
                            />
                            <span className="gri-arow-sub">
                                Identificador: {c.slug}
                            </span>
                        </div>
                        <div className="gri-arow-actions">
                            <button
                                type="button"
                                className="gri-iconbtn"
                                onClick={() => rename(c)}
                                disabled={
                                    busy || (names[c.id] ?? c.name) === c.name
                                }
                            >
                                Guardar nombre
                            </button>
                            <button
                                type="button"
                                className="gri-iconbtn"
                                aria-label={`Subir ${c.name}`}
                                onClick={() => move(i, -1)}
                                disabled={busy || i === 0}
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                className="gri-iconbtn"
                                aria-label={`Bajar ${c.name}`}
                                onClick={() => move(i, 1)}
                                disabled={busy || i === cats.length - 1}
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                className="gri-iconbtn"
                                onClick={() => void askDelete(c)}
                                disabled={busy}
                            >
                                Eliminar
                            </button>
                        </div>
                        {confirm?.id === c.id && (
                            <div
                                className="gri-confirm"
                                role="alertdialog"
                                aria-label={`Confirmar eliminación de ${c.name}`}
                            >
                                <span>
                                    ¿Eliminar “{c.name}”?{" "}
                                    {confirm.count > 0
                                        ? `${confirm.count} ${confirm.count === 1 ? "pieza quedará" : "piezas quedarán"} sin categoría.`
                                        : "No tiene piezas."}
                                </span>
                                <button
                                    type="button"
                                    className="gri-btn gri-btn--danger gri-btn--sm"
                                    onClick={() => del(c)}
                                    disabled={busy}
                                >
                                    Sí, eliminar
                                </button>
                                <button
                                    type="button"
                                    className="gri-btn gri-btn--ghost gri-btn--sm"
                                    onClick={() => setConfirm(null)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}

/* ---------- Contenedor del panel ---------- */

function AdminBar(props: {
    email?: string
    onExit: () => void
    onSignOut?: () => void
}) {
    return (
        <div className="gri-admin-bar gri-dark">
            <div className="gri-wrap">
                <strong>Panel de administración</strong>
                <span
                    style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    {props.email && (
                        <span style={{ fontSize: 13, opacity: 0.8 }}>
                            {props.email}
                        </span>
                    )}
                    <button
                        type="button"
                        className="gri-btn gri-btn--lightghost"
                        onClick={props.onExit}
                    >
                        Volver al sitio
                    </button>
                    {props.onSignOut && (
                        <button
                            type="button"
                            className="gri-btn gri-btn--lightghost"
                            onClick={props.onSignOut}
                        >
                            Cerrar sesión
                        </button>
                    )}
                </span>
            </div>
        </div>
    )
}

function AdminDemo({
    onExit,
    problem,
}: {
    onExit: () => void
    problem: string
}) {
    return (
        <div className="gri-admin">
            <AdminBar onExit={onExit} />
            <div className="gri-wrap gri-admin-body">
                <h1>Panel no disponible en modo demostración</h1>
                <div style={{ marginTop: 18, maxWidth: 640 }}>
                    <Notice kind={problem ? "err" : "info"}>
                        {problem ||
                            "Para cargar y editar piezas, primero conectá Supabase: pegá la URL y la clave pública en las propiedades del componente en Framer (seguí INSTRUCCIONES.md). Nada de lo que veas en la demostración se guarda."}
                    </Notice>
                </div>
            </div>
        </div>
    )
}

function AdminApp(props: {
    cfg: Cfg
    onExit: () => void
    onChanged: () => void
}) {
    const { cfg } = props
    const auth = useAdminSession(cfg)
    const [tab, setTab] = useState<"productos" | "categorias">("productos")
    const [cats, setCats] = useState<Category[]>([])
    const [catErr, setCatErr] = useState("")
    const { getToken, status } = auth

    const loadCats = useCallback(async () => {
        try {
            const rows = await sb<unknown[]>(
                cfg,
                "/rest/v1/categories?select=*&order=sort_order.asc",
                { token: await getToken() }
            )
            setCats(
                (Array.isArray(rows) ? rows : [])
                    .map(parseCategory)
                    .filter((x): x is Category => !!x)
            )
            setCatErr("")
        } catch (e) {
            setCatErr(friendlyError(e))
        }
    }, [cfg, getToken])

    useEffect(() => {
        if (status === "in") void loadCats()
    }, [status, loadCats])

    let body: React.ReactNode
    if (status === "checking")
        body = (
            <p className="gri-help" role="status" style={{ marginTop: 24 }}>
                <span className="gri-spin" aria-hidden="true" /> Verificando
                acceso…
            </p>
        )
    else if (status === "out") body = <LoginForm onSubmit={auth.signIn} />
    else if (status === "denied")
        body = (
            <div
                style={{
                    marginTop: 24,
                    maxWidth: 640,
                    display: "grid",
                    gap: 14,
                }}
            >
                <Notice kind="err">
                    Iniciaste sesión como {auth.session?.email}, pero ese
                    usuario no está autorizado como administrador. Agregalo a la
                    tabla <code>admins</code> con el SQL del paso 5 de
                    supabase-setup.sql.
                </Notice>
                <div>
                    <button
                        type="button"
                        className="gri-btn gri-btn--ghost"
                        onClick={() => void auth.signOut()}
                    >
                        Cerrar sesión
                    </button>
                </div>
            </div>
        )
    else if (status === "error")
        body = (
            <div
                style={{
                    marginTop: 24,
                    maxWidth: 640,
                    display: "grid",
                    gap: 14,
                }}
            >
                <Notice kind="err">{auth.error}</Notice>
                <div>
                    <button
                        type="button"
                        className="gri-btn"
                        onClick={auth.retry}
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        )
    else
        body = (
            <>
                <h1>Catálogo</h1>
                <div
                    className="gri-tabs"
                    role="tablist"
                    aria-label="Secciones del panel"
                >
                    <button
                        type="button"
                        role="tab"
                        className="gri-tab"
                        aria-selected={tab === "productos"}
                        onClick={() => setTab("productos")}
                    >
                        Piezas
                    </button>
                    <button
                        type="button"
                        role="tab"
                        className="gri-tab"
                        aria-selected={tab === "categorias"}
                        onClick={() => setTab("categorias")}
                    >
                        Categorías
                    </button>
                </div>
                {catErr && (
                    <div style={{ marginBottom: 16 }}>
                        <Notice kind="err">
                            No se pudieron cargar las categorías: {catErr}
                        </Notice>
                    </div>
                )}
                {tab === "productos" ? (
                    <ProductsTab
                        cfg={cfg}
                        getToken={getToken}
                        cats={cats}
                        onChanged={props.onChanged}
                    />
                ) : (
                    <CategoriesTab
                        cfg={cfg}
                        getToken={getToken}
                        cats={cats}
                        reload={() => void loadCats()}
                        onChanged={props.onChanged}
                    />
                )}
            </>
        )

    return (
        <div className="gri-admin">
            <AdminBar
                email={status === "in" ? auth.session?.email : undefined}
                onExit={props.onExit}
                onSignOut={
                    status === "in" || status === "denied"
                        ? () => void auth.signOut()
                        : undefined
                }
            />
            <div className="gri-wrap gri-admin-body">{body}</div>
        </div>
    )
}

/* =====================================================================
   11. COMPONENTE PRINCIPAL
   ===================================================================== */

export interface GriProps {
    brandName: string
    whatsapp: string
    instagramUrl: string
    supabaseUrl: string
    supabaseKey: string
    topBarText: string
    showTopBar: boolean
    heroEyebrow: string
    heroTitle: string
    heroAccent: string
    heroText: string
    heroImage: string
    heroImageAlt: string
    showHowWeWork: boolean
    steps: Step[]
    showCustom: boolean
    customIntro: string
    showFaq: boolean
    faqs: Faq[]
    showContact: boolean
    instagramImages: string[]
    backgroundColor: string
    inkColor: string
    accentColor: string
    style?: React.CSSProperties
}

const DEFAULT_STEPS: Step[] = [
    {
        title: "Explorá los trabajos",
        text: "Conocé las piezas disponibles y consultanos también por orfebrería, joyería criolla o reparaciones.",
    },
    {
        title: "Consultanos",
        text: "Escribinos por WhatsApp para consultar por materiales, reparaciones, piezas a medida y artículos criollos.",
    },
    {
        title: "Coordinamos tu pedido",
        text: "Confirmamos los detalles y te explicamos las opciones de entrega antes de finalizar la compra.",
    },
]

const DEFAULT_FAQS: Faq[] = [
    {
        question: "¿Cómo puedo consultar por una joya?",
        answer: "Abrí la ficha de la pieza, elegí las opciones que correspondan y tocá “Consultar por WhatsApp”. Se abre un mensaje ya armado con los datos de la joya; solo tenés que enviarlo.",
    },
    {
        question: "¿Realizan trabajos a medida?",
        answer: "Podés contarnos tu idea desde la sección de consultas. Conversamos sobre materiales y opciones, y te confirmamos si es posible realizar el trabajo. La viabilidad depende de cada pieza.",
    },
    {
        question: "¿Realizan reparaciones de joyas?",
        answer: "Sí, podés consultarnos por reparaciones de joyería. Contanos qué pieza es, qué necesita reparación y, si podés, adjuntá una referencia o foto por WhatsApp para evaluar el trabajo.",
    },
    {
        question: "¿Trabajan joyería criolla y artículos de campo?",
        answer: "Podés consultarnos por joyería criolla y por mates, bombillas, cuchillas y rebenques con mangos o detalles en plata y oro. Escribinos para conversar sobre la pieza y las opciones disponibles.",
    },
    {
        question: "¿Cómo puedo confirmar mi talle?",
        answer: "Si no estás segura/o, elegí “No estoy seguro/a” en la ficha y lo confirmamos por WhatsApp antes de avanzar.",
    },
    {
        question: "¿Hacen envíos al interior de Uruguay?",
        answer: "Escribinos por WhatsApp con tu localidad y te confirmamos las opciones de envío disponibles y sus costos.",
    },
    {
        question: "¿Cómo se coordina la entrega?",
        answer: "Una vez confirmada la pieza, coordinamos por WhatsApp las opciones de entrega antes de finalizar la compra.",
    },
    {
        question: "¿Puedo consultar por una pieza agotada?",
        answer: "Sí. Escribinos por WhatsApp y te contamos qué opciones hay.",
    },
    {
        question: "¿Cuáles son los medios de pago y la política de cambios?",
        answer: "Te los confirmamos por WhatsApp al coordinar tu pedido.",
    },
]

const DEFAULTS: GriProps = {
    brandName: "Gri Joyas",
    whatsapp: "+598 98 827 108",
    instagramUrl: DEFAULT_INSTAGRAM,
    supabaseUrl: "",
    supabaseKey: "",
    topBarText:
        "Orfebrería en plata y oro · Joyería criolla · Reparaciones y trabajos a medida",
    showTopBar: true,
    heroEyebrow: "Orfebrería en plata y oro",
    heroTitle: "Joyas, oficio",
    heroAccent: "y tradición criolla.",
    heroText:
        "Trabajamos joyas y orfebrería en plata y oro, realizamos reparaciones y atendemos consultas por joyería criolla: mates, bombillas, cuchillas y rebenques con mangos o detalles en plata y oro. Escribinos para consultar por una pieza o un trabajo.",
    heroImage: "https://framerusercontent.com/images/xWmGbag4hbhQv0ZcxSVLnvGfpgY.jpg?width=1536&height=2048",
    heroImageAlt: "Joyería y orfebrería de Gri Joyas",
    showHowWeWork: true,
    steps: DEFAULT_STEPS,
    showCustom: true,
    customIntro:
        "Consultanos por piezas de orfebrería en plata y oro, diseños a medida, reparaciones de joyería y artículos de tradición criolla como mates, bombillas, cuchillas y rebenques con mangos o detalles en metales nobles. Contanos qué necesitás y evaluamos las opciones posibles.",
    showFaq: true,
    faqs: DEFAULT_FAQS,
    showContact: true,
    instagramImages: [],
    backgroundColor: "#F7F5F0",
    inkColor: "#20201E",
    accentColor: "#777A60",
}

function withDefaults(props: Partial<GriProps>): GriProps {
    const out: Record<string, unknown> = { ...DEFAULTS }
    for (const [k, v] of Object.entries(props))
        if (v !== undefined && v !== null) out[k] = v
    return out as unknown as GriProps
}

export default function GriJoyas(props: Partial<GriProps>) {
    const p = withDefaults(props)
    const rootRef = useRef<HTMLDivElement>(null)
    const bp = useBreakpoint(rootRef)
    const reduce = usePrefersReducedMotion()
    const made = useMemo(
        () => makeCfg(p.supabaseUrl, p.supabaseKey),
        [p.supabaseUrl, p.supabaseKey]
    )
    const cfg = made.cfg
    const catalog = useCatalog(cfg)
    const [view, setView] = useState<"site" | "admin">("site")
    const [open, setOpen] = useState<Product | null>(null)

    useEffect(() => {
        if (typeof window === "undefined") return
        const sync = () =>
            setView(window.location.hash === "#admin" ? "admin" : "site")
        sync()
        window.addEventListener("hashchange", sync)
        return () => window.removeEventListener("hashchange", sync)
    }, [])

    const enterAdmin = () => {
        setOpen(null)
        try {
            window.location.hash = "admin"
        } catch {
            /* sin hash */
        }
        setView("admin")
        rootRef.current?.scrollIntoView({ block: "start" })
    }
    const exitAdmin = () => {
        try {
            window.history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search
            )
        } catch {
            /* nada */
        }
        setView("site")
        catalog.reload()
        rootRef.current?.scrollIntoView({ block: "start" })
    }

    const brand = p.brandName.trim() || "Gri Joyas"
    const nav: NavItem[] = [
        { id: "coleccion", label: "Colección" },
        ...(p.showHowWeWork
            ? [{ id: "como-trabajamos", label: "Cómo trabajamos" }]
            : []),
        ...(p.showCustom
            ? [{ id: "personalizados", label: "Personalizados" }]
            : []),
        ...(p.showFaq ? [{ id: "envios", label: "Envíos" }] : []),
    ]
    const go = (id: string) => scrollToSection(id, reduce)
    const rootStyle = {
        "--bg": p.backgroundColor,
        "--ink": p.inkColor,
        "--accent": p.accentColor,
    } as React.CSSProperties
    const instagramUrl = p.instagramUrl.trim() || DEFAULT_INSTAGRAM

    return (
        <div
            ref={rootRef}
            className="gri"
            data-bp={bp}
            style={{ ...rootStyle, ...(props.style || {}) }}
        >
            <style>{CSS}</style>
            {view === "admin" ? (
                cfg ? (
                    <AdminApp
                        cfg={cfg}
                        onExit={exitAdmin}
                        onChanged={catalog.reload}
                    />
                ) : (
                    <AdminDemo onExit={exitAdmin} problem={made.problem} />
                )
            ) : (
                <>
                    {p.showTopBar && p.topBarText.trim() && (
                        <TopBar text={p.topBarText} />
                    )}
                    <Header
                        brand={brand}
                        nav={nav}
                        onNav={go}
                        waHref={waUrl(
                            p.whatsapp,
                            `Hola, ${brand}. Tengo una consulta.`
                        )}
                    />
                    <main>
                        <Hero
                            eyebrow={p.heroEyebrow}
                            title={p.heroTitle}
                            accent={p.heroAccent}
                            text={p.heroText}
                            image={p.heroImage || undefined}
                            imageAlt={p.heroImageAlt}
                            showCustom={p.showCustom}
                            onNav={go}
                        />
                        <Catalog
                            catalog={catalog}
                            problem={made.problem}
                            onOpen={setOpen}
                        />
                        {p.showHowWeWork && <HowWeWork steps={p.steps} />}
                        {p.showCustom && (
                            <CustomOrder
                                brand={brand}
                                whatsapp={p.whatsapp}
                                intro={p.customIntro}
                            />
                        )}
                        {p.showFaq && <FaqSection faqs={p.faqs} />}
                        {p.showContact && (
                            <ContactSection
                                brand={brand}
                                whatsapp={p.whatsapp}
                                instagramUrl={instagramUrl}
                                images={p.instagramImages}
                            />
                        )}
                    </main>
                    <Footer
                        brand={brand}
                        whatsapp={p.whatsapp}
                        instagramUrl={instagramUrl}
                        nav={nav}
                        onNav={go}
                        onAdmin={enterAdmin}
                    />
                    {open && (
                        <ProductModal
                            key={open.id}
                            product={open}
                            brand={brand}
                            whatsapp={p.whatsapp}
                            categories={catalog.categories}
                            onClose={() => setOpen(null)}
                            bp={bp}
                            rootStyle={rootStyle}
                        />
                    )}
                </>
            )}
        </div>
    )
}

GriJoyas.defaultProps = DEFAULTS
