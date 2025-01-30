import React from 'react'
import { render } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'

const mockSession = {
  user: {
    id: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    image: null
  },
  expires: new Date(Date.now() + 2 * 86400).toISOString()
}

export function renderWithProviders(
  ui: React.ReactElement,
  { session = mockSession } = {}
) {
  return render(
    <SessionProvider session={session}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {ui}
      </ThemeProvider>
    </SessionProvider>
  )
}

export * from '@testing-library/react' 