# Gri Joyas — GitHub Pages

Este ZIP contiene el proyecto React/Vite adaptado desde el componente de Framer. El componente y sus estilos se conservan; se quitaron únicamente los controles de edición propios de Framer y se agregó el punto de entrada necesario para una web independiente.

## Publicación correcta (importante)

1. Descomprimí el ZIP. Subí **todo el contenido de esta carpeta** a la raíz del repositorio GitHub (deben quedar `package.json`, `index.html`, `vite.config.ts`, `src/` y `.github/` en la raíz; no los dejes dentro de una carpeta extra).
2. En GitHub, abrí **Settings → Pages → Build and deployment** y seleccioná **GitHub Actions** como Source. No elijas “Deploy from a branch”.
3. Abrí **Actions** y ejecutá **Deploy to GitHub Pages** (o hacé un commit/push a `main` para dispararlo). El flujo instala dependencias, compila el sitio con Vite y publica `dist/`.
4. Esperá a que los dos trabajos del flujo terminen en verde. Después recargá el sitio con `Ctrl+F5`.

**No publiques `index.html` directamente desde la raíz del repositorio.** En el código fuente aparece una referencia a `src/main.tsx`, que es normal en un proyecto Vite; Vite la convierte durante la compilación a archivos JavaScript dentro de `assets/`. Si el código fuente de tu web publicada sigue mostrando `src/main.tsx`, el flujo de Actions no está publicando el resultado compilado.

## Probar en tu computadora

Necesitás Node.js 22 o posterior. En esta carpeta ejecutá:

```bash
npm install
npm run dev
```

Para compilar localmente:

```bash
npm run build
npm run preview
```

## Catálogo y Supabase

Sin configuración de Supabase, el componente usa el modo demostración definido en el TSX. Para conectar tu catálogo real, copiá `.env.example` como `.env` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con la URL y la clave pública (anon/publishable) de Supabase. Luego reconstruí y volvé a publicar.

No pongas la clave `service_role` ni una clave `sb_secret_` en el frontend: las variables `VITE_` quedan públicas en el sitio generado. Configurá las políticas RLS de Supabase.

`Grijoyas-original-Framer.tsx` es una copia intacta del archivo original que compartiste.
