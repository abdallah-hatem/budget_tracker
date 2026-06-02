/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── Midnight Emerald dark tokens ────────────────────────────────────
        canvas: '#0B0F0E',
        surface: '#14191A',
        overlay: '#1C2322',
        border: '#2A3331',
        ink: '#F4F7F5',
        ink2: '#A8B2AF',
        ink3: '#6B7672',
        accent: '#2BD98E',
        accentPress: '#1FB877',
        accentSoft: 'rgba(43,217,142,0.16)',
        income: '#2BD98E',
        expense: '#F4F7F5',
        danger: '#FF5C6C',
        warning: '#F5B544',
      },
      fontFamily: {
        // Numbers / balances / display → Sora
        sora: ['Sora_700Bold'],
        'sora-sb': ['Sora_600SemiBold'],
        // English UI text → Plus Jakarta Sans
        jakarta: ['PlusJakartaSans_400Regular'],
        'jakarta-md': ['PlusJakartaSans_500Medium'],
        'jakarta-sb': ['PlusJakartaSans_600SemiBold'],
        'jakarta-b': ['PlusJakartaSans_700Bold'],
        // Arabic UI text → Readex Pro
        readex: ['ReadexPro_400Regular'],
        'readex-md': ['ReadexPro_500Medium'],
        'readex-sb': ['ReadexPro_600SemiBold'],
      },
    },
  },
  plugins: [],
};
