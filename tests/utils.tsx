import React from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'

// better-auth expose la session via son propre client (lib/auth-client) :
// aucun provider à monter dans les tests, contrairement à SessionProvider.
export function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {ui}
    </ThemeProvider>
  )
}

export * from '@testing-library/react'
