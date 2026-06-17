import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Séparation des dépendances lourdes en chunks vendor distincts (Priorité 12) :
    // meilleur cache (elles changent rarement) et bundle initial allégé. Les vues
    // sont déjà lazy-loadées (React.lazy) côté application.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('framer-motion') || /[\\/]node_modules[\\/]motion(-dom|-utils)?[\\/]/.test(id))
            return 'vendor-motion'
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('react-zoom-pan-pinch')) return 'vendor-zoom'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('xlsx')) return 'vendor-xlsx'
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf'
          return 'vendor'
        },
      },
    },
  },
})
